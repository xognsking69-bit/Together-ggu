import test from "node:test";
import assert from "node:assert/strict";
import worker, { ReceiptUsageStore } from "./receipt-ai-worker.js";

class MemoryStorage {
  values = new Map();
  alarmAt = null;
  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async setAlarm(timestamp) { this.alarmAt = timestamp; }
  async deleteAll() { this.values.clear(); this.alarmAt = null; }
  async transaction(callback) { return callback(this); }
}

function makeEnv(extra = {}) {
  const objects = new Map();
  const env = {
    GUEST_TOKEN_SECRET: "test-only-secret-value-longer-than-32-characters",
    RECEIPT_USAGE: {
      idFromName(name) { return name; },
      get(id) {
        if (!objects.has(id)) objects.set(id, new ReceiptUsageStore({ storage: new MemoryStorage() }));
        return { fetch: (input, init) => objects.get(id).fetch(input instanceof Request ? input : new Request(input, init)) };
      }
    },
    ...extra
  };
  return env;
}

async function createSession(env, ip = "198.51.100.7") {
  const response = await worker.fetch(new Request("https://worker.test/receipt/guest/session", {
    method: "POST", headers: { "CF-Connecting-IP": ip }
  }), env);
  return { response, data: await response.json() };
}

test("guest sessions are signed, stable on refresh, and required for usage", async () => {
  const env = makeEnv();
  const first = await createSession(env);
  assert.equal(first.response.status, 200);
  assert.match(first.data.guestId, /^[0-9a-f-]{36}$/i);

  const usageWithoutToken = await worker.fetch(new Request("https://worker.test/receipt/usage"), env);
  assert.equal(usageWithoutToken.status, 401);

  const usage = await worker.fetch(new Request("https://worker.test/receipt/usage", {
    headers: { Authorization: `Bearer ${first.data.token}` }
  }), env);
  assert.equal(usage.status, 200);
  assert.equal((await usage.json()).freeRemaining, 5);

  const refreshed = await worker.fetch(new Request("https://worker.test/receipt/guest/session", {
    method: "POST", headers: { Authorization: `Bearer ${first.data.token}` }
  }), env);
  assert.equal(refreshed.status, 200);
  assert.equal((await refreshed.json()).guestId, first.data.guestId);

  const tampered = first.data.token.slice(0, -1) + (first.data.token.endsWith("a") ? "b" : "a");
  const rejected = await worker.fetch(new Request("https://worker.test/receipt/usage", {
    headers: { Authorization: `Bearer ${tampered}` }
  }), env);
  assert.equal(rejected.status, 401);
});

test("new guest session issuance is capped at five per IP per UTC day", async () => {
  const env = makeEnv();
  for (let i = 0; i < 5; i++) assert.equal((await createSession(env)).response.status, 200);
  assert.equal((await createSession(env)).response.status, 429);
  assert.equal((await createSession(env, "198.51.100.8")).response.status, 200);
});

test("free, daily, and global reservations are atomic and release on failure", async () => {
  const store = new ReceiptUsageStore({ storage: new MemoryStorage() });
  const call = (path, data) => store.fetch(new Request(`https://usage/${path}`, {
    method: path === "usage" ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: path === "usage" ? undefined : JSON.stringify(data)
  }));

  assert.equal((await (await call("reserve", { token: "free-1", limit: 1 })).json()).allowed, true);
  assert.equal((await (await call("reserve", { token: "free-2", limit: 1 })).json()).allowed, false);
  await call("release", { token: "free-1" });
  assert.equal((await (await call("reserve", { token: "free-3", limit: 1 })).json()).allowed, true);
  await call("commit", { token: "free-3" });
  assert.equal((await (await call("usage")).json()).freeRemaining, 4);

  assert.equal((await (await call("reserve", { token: "d1", bucket: "daily", periodKey: "2026-09-25", limit: 1 })).json()).allowed, true);
  assert.equal((await (await call("reserve", { token: "d2", bucket: "daily", periodKey: "2026-09-25", limit: 1 })).json()).allowed, false);
  await call("release", { token: "d1", bucket: "daily" });
  assert.equal((await (await call("reserve", { token: "d3", bucket: "daily", periodKey: "2026-09-25", limit: 1 })).json()).allowed, true);
  await call("commit", { token: "d3", bucket: "daily" });
  assert.equal((await (await call("reserve", { token: "d4", bucket: "daily", periodKey: "2026-09-26", limit: 1 })).json()).allowed, true);

  await store.alarm();
  assert.equal((await (await call("usage")).json()).freeRemaining, 5);
});

test("receipt analysis uses Cloudflare AI and accepts only a signed guest session", async () => {
  let aiCalls = 0;
  const env = makeEnv({
    RECEIPT_AI_PROVIDER: "cloudflare",
    AI: { async run(model, input) {
      aiCalls++;
      assert.equal(model, "@cf/moondream/moondream3.1-9B-A2B");
      assert.equal(input.task, "query");
      assert.match(input.image, /^data:image\/png;base64,/);
      return { answer: JSON.stringify({ merchant: "테스트 상점", date: "2026-09-25", amount: 1200, currency: "KRW", category: "식비", confidence: 0.9 }) };
    } }
  });
  const session = await createSession(env);
  const form = new FormData();
  form.append("receipt", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "receipt.png");
  form.append("appUserId", "attacker-selected-id");
  const response = await worker.fetch(new Request("https://worker.test/receipt/analyze", {
    method: "POST", headers: { Authorization: `Bearer ${session.data.token}` }, body: form
  }), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.merchant, "테스트 상점");
  assert.equal(result.amount, 1200);
  assert.equal(aiCalls, 1);
});

test("global daily cap stops a second guest before calling the model", async () => {
  let aiCalls = 0;
  const env = makeEnv({
    MAX_ANALYSES_GLOBAL_PER_DAY: "1",
    RECEIPT_AI_PROVIDER: "cloudflare",
    AI: { async run() {
      aiCalls++;
      return { answer: JSON.stringify({ merchant: "상점", date: null, amount: 100, currency: "KRW", category: "기타", confidence: 0.8 }) };
    } }
  });
  const firstSession = await createSession(env, "198.51.100.20");
  const secondSession = await createSession(env, "198.51.100.21");
  async function analyze(token) {
    const form = new FormData();
    form.append("receipt", new Blob([new Uint8Array([4, 5])], { type: "image/png" }), "receipt.png");
    return worker.fetch(new Request("https://worker.test/receipt/analyze", {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
    }), env);
  }
  assert.equal((await analyze(firstSession.data.token)).status, 200);
  const capped = await analyze(secondSession.data.token);
  assert.equal(capped.status, 503);
  assert.equal((await capped.json()).code, "SERVICE_DAILY_LIMIT_REACHED");
  assert.equal(aiCalls, 1);
});
