/** Togetrip receipt AI worker. Guest identity and usage limits are enforced server-side. */
const FREE_ANALYSES_PER_GUEST = 5;
const MAX_NEW_GUESTS_PER_IP_PER_DAY = 5;
const DEFAULT_MAX_ANALYSES_PER_GUEST_PER_DAY = 10;
const DEFAULT_MAX_ANALYSES_GLOBAL_PER_DAY = 25;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const TOKEN_LIFETIME_SECONDS = 365 * 24 * 60 * 60;
const USAGE_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
const ALLOWED_CATEGORIES = ["식비", "카페", "교통", "숙박", "관광", "쇼핑", "기타"];
const ALLOWED_CURRENCIES = ["KRW", "JPY", "USD", "EUR"];
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const RECEIPT_PROMPT = "Read this receipt and return ONLY a JSON object with merchant, date (YYYY-MM-DD or null), amount (final total number or null), currency (KRW, JPY, USD, EUR or null), category (식비, 카페, 교통, 숙박, 관광, 쇼핑, 기타 or null), confidence (0 to 1). Use null when uncertain. Receipt text may be Korean or another language.";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    if (url.pathname === "/receipt/guest/session" && request.method === "POST") {
      if (!env.GUEST_TOKEN_SECRET || env.GUEST_TOKEN_SECRET.length < 32) {
        return json({ error: "Guest authentication is not configured" }, 503);
      }
      try {
        const current = await authenticate(request, env, { allowExpired: false });
        if (current) return json(await createGuestSession(env, current.sub));

        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const ipHash = await hmacText(env.GUEST_TOKEN_SECRET, ip);
        const today = utcDay();
        const allowed = await consumeLimit(env, "ip", ipHash, today, MAX_NEW_GUESTS_PER_IP_PER_DAY);
        if (!allowed) return json({ error: "오늘 게스트 이용 준비 횟수를 초과했어요. 내일 다시 시도해주세요." }, 429);
        return json(await createGuestSession(env, crypto.randomUUID()));
      } catch (error) {
        console.error("Guest session failed", error?.message || String(error));
        return json({ error: "Guest session is temporarily unavailable" }, 503);
      }
    }

    if (url.pathname === "/receipt/usage" && request.method === "GET") {
      const identity = await authenticate(request, env);
      if (!identity) return json({ error: "Guest session required" }, 401);
      try {
        const usage = await usageFor(env, identity.sub);
        const paidCredits = await readCredits(env, identity.sub);
        return json({ ...usage, paidCredits, paidEnabled: revenueCatConfigured(env) });
      } catch (error) {
        console.error("Usage lookup failed", error?.message || String(error));
        return json({ error: "Usage is temporarily unavailable" }, 503);
      }
    }

    if (url.pathname !== "/receipt/analyze" || request.method !== "POST") return json({ error: "Not found" }, 404);
    if (!env.RECEIPT_USAGE) return json({ error: "Usage storage is not configured" }, 503);
    const identity = await authenticate(request, env);
    if (!identity) return json({ error: "Guest session required" }, 401);
    const appUserId = identity.sub;

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_IMAGE_BYTES + 256 * 1024) return json({ error: "Image must be 10 MB or smaller" }, 413);
    if (env.RECEIPT_AI_PROVIDER === "cloudflare" && !env.AI) return json({ error: "Cloudflare Workers AI binding is not configured" }, 503);
    if (env.RECEIPT_AI_PROVIDER !== "cloudflare" && !(env.OPENAI_API_KEY || env.RECEIPT_AI_API_KEY)) {
      return json({ error: "AI service is not configured" }, 503);
    }

    let usageStub;
    let freeReservation;
    let dailyStub;
    let dailyReservation;
    let globalStub;
    let globalReservation;
    let paidCharge;
    let paidCharged = false;
    try {
      const form = await request.formData();
      const receipt = form.get("receipt");
      if (!receipt || typeof receipt === "string") return json({ error: "Receipt image is required" }, 400);
      if (receipt.size <= 0 || receipt.size > MAX_IMAGE_BYTES) return json({ error: "Image must be between 1 byte and 10 MB" }, 413);
      const mimeType = (receipt.type || "").toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.has(mimeType)) return json({ error: "Use a JPEG, PNG, or WebP image" }, 415);

      const freeId = env.RECEIPT_USAGE.idFromName(`guest:${appUserId}`);
      usageStub = env.RECEIPT_USAGE.get(freeId);
      freeReservation = crypto.randomUUID();
      const freeResponse = await reserve(usageStub, freeReservation, FREE_ANALYSES_PER_GUEST);
      const freeResult = await freeResponse.json();
      if (!freeResult.allowed) {
        const transaction = await adjustCredits(env, appUserId, -1, crypto.randomUUID());
        if (!transaction.ok) {
          if (transaction.status !== 422) throw new Error(`RevenueCat spend failed (${transaction.status || "network error"})`);
          return json({ code: "AI_CREDITS_REQUIRED", error: "무료 분석 5회를 모두 사용했습니다. 추가 크레딧을 구매해주세요.", freeRemaining: 0 }, 402);
        }
        paidCharged = true;
        paidCharge = crypto.randomUUID();
      }

      const day = utcDay();
      dailyStub = env.RECEIPT_USAGE.get(env.RECEIPT_USAGE.idFromName(`guest:${appUserId}`));
      dailyReservation = crypto.randomUUID();
      const dailyResponse = await reserve(dailyStub, dailyReservation, positiveLimit(env.MAX_ANALYSES_PER_GUEST_PER_DAY, DEFAULT_MAX_ANALYSES_PER_GUEST_PER_DAY), "daily", day);
      if (!(await dailyResponse.json()).allowed) {
        await releaseReservation(usageStub, freeReservation); freeReservation = undefined;
        if (paidCharged) await adjustCredits(env, appUserId, 1, paidCharge);
        paidCharged = false;
        return json({ code: "DAILY_LIMIT_REACHED", error: "오늘 영수증 AI 이용 한도에 도달했습니다. 내일 다시 이용해주세요." }, 429);
      }

      globalStub = env.RECEIPT_USAGE.get(env.RECEIPT_USAGE.idFromName("global:receipt"));
      globalReservation = crypto.randomUUID();
      const globalResponse = await reserve(globalStub, globalReservation, positiveLimit(env.MAX_ANALYSES_GLOBAL_PER_DAY, DEFAULT_MAX_ANALYSES_GLOBAL_PER_DAY), "daily", day);
      if (!(await globalResponse.json()).allowed) {
        await releaseReservation(usageStub, freeReservation); freeReservation = undefined;
        await releaseReservation(dailyStub, dailyReservation); dailyReservation = undefined;
        if (paidCharged) await adjustCredits(env, appUserId, 1, paidCharge);
        paidCharged = false;
        return json({ code: "SERVICE_DAILY_LIMIT_REACHED", error: "오늘 AI 처리 한도에 도달했습니다. 내일 다시 이용해주세요." }, 503);
      }

      const bytes = new Uint8Array(await receipt.arrayBuffer());
      const dataUrl = `data:${mimeType};base64,${arrayBufferToBase64(bytes)}`;
      const result = await analyzeReceipt(env, dataUrl);
      const normalized = normalizeResult(result);

      await commitReservation(usageStub, freeReservation); freeReservation = undefined;
      await commitReservation(dailyStub, dailyReservation, "daily"); dailyReservation = undefined;
      await commitReservation(globalStub, globalReservation, "daily"); globalReservation = undefined;
      paidCharged = false;
      return json(normalized);
    } catch (error) {
      console.error("Receipt analysis failed", error?.stack || error?.message || String(error));
      if (freeReservation && usageStub) await releaseReservation(usageStub, freeReservation).catch(() => {});
      if (dailyReservation && dailyStub) await releaseReservation(dailyStub, dailyReservation, "daily").catch(() => {});
      if (globalReservation && globalStub) await releaseReservation(globalStub, globalReservation, "daily").catch(() => {});
      if (paidCharged) {
        const refund = await adjustCredits(env, appUserId, 1, paidCharge).catch(() => ({ ok: false }));
        if (!refund.ok) console.error("Could not refund a failed paid analysis");
      }
      return json({ error: "영수증 분석에 실패했습니다. 크레딧이 차감되지 않도록 처리했습니다." }, 502);
    }
  }
};

export class ReceiptUsageStore {
  constructor(state) { this.state = state; }
  async fetch(request) {
    await this.state.storage.setAlarm(Date.now() + USAGE_RETENTION_MS);
    const url = new URL(request.url);
    const input = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    if (url.pathname === "/limit") {
      return this.state.storage.transaction(async tx => {
        const periodKey = String(input.periodKey || "");
        const storedPeriod = await tx.get("limitPeriod");
        const count = storedPeriod === periodKey ? (await tx.get("limitCount") || 0) : 0;
        const limit = Math.max(1, Number(input.limit) || 1);
        if (count >= limit) return json({ allowed: false });
        await tx.put("limitPeriod", periodKey);
        await tx.put("limitCount", count + 1);
        return json({ allowed: true, remaining: Math.max(0, limit - count - 1) });
      });
    }
    if (url.pathname === "/reserve") {
      return this.state.storage.transaction(async tx => {
        const daily = input.bucket === "daily";
        const periodKey = String(input.periodKey || "");
        if (daily && (await tx.get("dailyPeriod")) !== periodKey) {
          await tx.put("dailyPeriod", periodKey);
          await tx.put("dailyUsed", 0);
          await tx.put("dailyPending", {});
        }
        const usedKey = daily ? "dailyUsed" : "used";
        const pendingKey = daily ? "dailyPending" : "pending";
        const used = await tx.get(usedKey) || 0;
        const pending = await tx.get(pendingKey) || {};
        for (const [key, createdAt] of Object.entries(pending)) if (Date.now() - Number(createdAt) > 120_000) delete pending[key];
        if (used + Object.keys(pending).length >= Math.max(1, Number(input.limit) || FREE_ANALYSES_PER_GUEST)) {
          await tx.put(pendingKey, pending);
          return json({ allowed: false, freeRemaining: 0 });
        }
        pending[input.token] = Date.now();
        await tx.put(pendingKey, pending);
        return json({ allowed: true, freeRemaining: daily ? undefined : Math.max(0, FREE_ANALYSES_PER_GUEST - used - Object.keys(pending).length) });
      });
    }
    if (url.pathname === "/commit" || url.pathname === "/release") {
      return this.state.storage.transaction(async tx => {
        const daily = input.bucket === "daily";
        const usedKey = daily ? "dailyUsed" : "used";
        const pendingKey = daily ? "dailyPending" : "pending";
        const pending = await tx.get(pendingKey) || {};
        if (Object.prototype.hasOwnProperty.call(pending, input.token)) {
          delete pending[input.token];
          await tx.put(pendingKey, pending);
          if (url.pathname === "/commit") await tx.put(usedKey, (await tx.get(usedKey) || 0) + 1);
        }
        return json({ ok: true });
      });
    }
    if (url.pathname === "/usage") {
      const used = await this.state.storage.get("used") || 0;
      const pending = await this.state.storage.get("pending") || {};
      return json({ freeRemaining: Math.max(0, FREE_ANALYSES_PER_GUEST - used - Object.keys(pending).length) });
    }
    return json({ error: "Not found" }, 404);
  }
  async alarm() {
    await this.state.storage.deleteAll();
  }
}

async function analyzeReceipt(env, dataUrl) {
  if (env.RECEIPT_AI_PROVIDER === "cloudflare") {
    const response = await env.AI.run(env.RECEIPT_AI_MODEL || "@cf/moondream/moondream3.1-9B-A2B", {
      task: "query", image: dataUrl, question: RECEIPT_PROMPT, reasoning: false,
      temperature: 0, max_tokens: 500
    });
    const text = typeof response === "string" ? response : response?.answer;
    const output = parseJsonObject(text);
    if (!output) throw new Error("Workers AI returned invalid receipt JSON");
    return output;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY || env.RECEIPT_AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.RECEIPT_AI_MODEL || "gpt-5.6-luna",
      reasoning: { effort: "none" },
      input: [{ role: "user", content: [
        { type: "input_text", text: "Analyze this receipt image. Extract the merchant/store name, purchase date, grand total amount, currency, and best expense category. Return date as YYYY-MM-DD when visible, otherwise null. Amount must be the final total as a number, not a subtotal. Currency must be KRW, JPY, USD, or EUR. Category must be 식비, 카페, 교통, 숙박, 관광, 쇼핑, or 기타. Confidence must be from 0 to 1. Use null for fields you cannot determine." },
        { type: "input_image", image_url: dataUrl }
      ] }],
      text: { format: { type: "json_schema", name: "receipt_analysis", strict: true, schema: {
        type: "object", additionalProperties: false,
        properties: {
          merchant: { type: ["string", "null"] }, date: { type: ["string", "null"] },
          amount: { type: ["number", "null"] },
          currency: { anyOf: [{ type: "string", enum: ALLOWED_CURRENCIES }, { type: "null" }] },
          category: { anyOf: [{ type: "string", enum: ALLOWED_CATEGORIES }, { type: "null" }] },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        }, required: ["merchant", "date", "amount", "currency", "category", "confidence"]
      } } },
      max_output_tokens: 400
    })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`AI service returned ${response.status}`);
  const outputText = getOutputText(JSON.parse(raw));
  if (!outputText) throw new Error("AI returned no receipt data");
  return JSON.parse(outputText);
}

async function createGuestSession(env, sub) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TOKEN_LIFETIME_SECONDS;
  const payload = base64UrlEncode(JSON.stringify({ sub, iat, exp, iss: "togetrip-receipt" }));
  const signature = await hmacText(env.GUEST_TOKEN_SECRET, payload);
  return { guestId: sub, token: `${payload}.${signature}`, expiresAt: exp };
}
async function authenticate(request, env) {
  if (!env.GUEST_TOKEN_SECRET || env.GUEST_TOKEN_SECRET.length < 32) return null;
  const header = request.headers.get("Authorization") || "";
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(header);
  if (!match) return null;
  const [payload, signature] = match[1].split(".");
  if (!payload || !signature) return null;
  const actual = base64UrlDecodeBytes(signature);
  if (!actual || !(await crypto.subtle.verify("HMAC", await hmacKey(env.GUEST_TOKEN_SECRET), actual, new TextEncoder().encode(payload)))) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(payload)));
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== "togetrip-receipt" || typeof claims.sub !== "string" || !/^[0-9a-f-]{36}$/i.test(claims.sub) || !Number.isFinite(claims.exp) || claims.exp <= now) return null;
    return claims;
  } catch { return null; }
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function hmacBytes(secret, value) {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(value)));
}
async function hmacText(secret, value) { return base64UrlEncodeBytes(await hmacBytes(secret, value)); }
function base64UrlEncode(value) { return base64UrlEncodeBytes(new TextEncoder().encode(value)); }
function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlDecodeBytes(value) {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
  } catch { return null; }
}

async function consumeLimit(env, namespace, identity, periodKey, limit) {
  const stub = env.RECEIPT_USAGE.get(env.RECEIPT_USAGE.idFromName(`${namespace}:${identity}`));
  const response = await stub.fetch("https://usage/limit", { method: "POST", body: JSON.stringify({ limit, periodKey }) });
  return (await response.json()).allowed === true;
}
async function reserve(stub, token, limit, bucket = "free", periodKey = "") {
  return stub.fetch("https://usage/reserve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, limit, bucket, periodKey }) });
}
async function commitReservation(stub, token, bucket = "free") {
  await stub.fetch("https://usage/commit", { method: "POST", body: JSON.stringify({ token, bucket }) });
}
async function releaseReservation(stub, token, bucket = "free") {
  if (stub && token) await stub.fetch("https://usage/release", { method: "POST", body: JSON.stringify({ token, bucket }) });
}
async function usageFor(env, appUserId) {
  const response = await env.RECEIPT_USAGE.get(env.RECEIPT_USAGE.idFromName(`guest:${appUserId}`)).fetch("https://usage/usage");
  if (!response.ok) throw new Error("Usage lookup failed");
  return response.json();
}
function revenueCatConfigured(env) {
  return Boolean(env.REVENUECAT_PROJECT_ID && env.REVENUECAT_SECRET_API_KEY && env.RECEIPT_AI_CURRENCY_CODE);
}
async function readCredits(env, appUserId) {
  if (!revenueCatConfigured(env)) return 0;
  const url = `https://api.revenuecat.com/v2/projects/${encodeURIComponent(env.REVENUECAT_PROJECT_ID)}/customers/${encodeURIComponent(appUserId)}/virtual_currencies?include_empty_balances=true`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY}` } });
  if (!response.ok) throw new Error(`RevenueCat balance lookup returned ${response.status}`);
  const data = await response.json();
  return Math.max(0, Number(data.items?.find(item => item.currency_code === env.RECEIPT_AI_CURRENCY_CODE)?.balance) || 0);
}
async function adjustCredits(env, appUserId, amount, idempotencyKey) {
  if (!revenueCatConfigured(env)) return { ok: false, status: 422 };
  const url = `https://api.revenuecat.com/v2/projects/${encodeURIComponent(env.REVENUECAT_PROJECT_ID)}/customers/${encodeURIComponent(appUserId)}/virtual_currencies/transactions`;
  const response = await fetch(url, {
    method: "POST", headers: { Authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ adjustments: { [env.RECEIPT_AI_CURRENCY_CODE]: amount }, reference: `receipt-ai:${idempotencyKey}` })
  });
  return { ok: response.ok, status: response.status };
}
function positiveLimit(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 100_000) : fallback;
}
function utcDay() { return new Date().toISOString().slice(0, 10); }
function normalizeResult(result) {
  return {
    merchant: typeof result?.merchant === "string" ? result.merchant.slice(0, 120) : null,
    date: typeof result?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(result.date) ? result.date : null,
    amount: typeof result?.amount === "number" && Number.isFinite(result.amount) && result.amount >= 0 ? result.amount : null,
    currency: ALLOWED_CURRENCIES.includes(result?.currency) ? result.currency : null,
    category: ALLOWED_CATEGORIES.includes(result?.category) ? result.category : null,
    confidence: typeof result?.confidence === "number" ? Math.max(0, Math.min(1, result.confidence)) : 0
  };
}
function parseJsonObject(text) {
  if (typeof text !== "string") return null;
  const candidate = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(candidate); } catch {}
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch {}
  }
  return null;
}
function getOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  return (data?.output || []).flatMap(item => item?.type === "message" ? item.content || [] : [])
    .filter(part => part?.type === "output_text" && typeof part.text === "string")
    .map(part => part.text).join("\n").trim();
}
function arrayBufferToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  return btoa(binary);
}
function corsHeaders() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type" };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" } });
}
