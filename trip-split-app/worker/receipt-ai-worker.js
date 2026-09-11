/**
 * Trip Split Receipt AI Worker
 * Cloudflare Worker -> OpenAI Responses API
 *
 * Expected secret:
 *   OPENAI_API_KEY
 *
 * Optional:
 *   RECEIPT_AI_MODEL
 */

const ALLOWED_CATEGORIES = ["식비", "카페", "교통", "숙박", "관광", "쇼핑", "기타"];
const ALLOWED_CURRENCIES = ["KRW", "JPY", "USD", "EUR"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST" || url.pathname !== "/receipt/analyze") {
      return json({ error: "Not found" }, 404);
    }

    const apiKey = env.OPENAI_API_KEY || env.RECEIPT_AI_API_KEY;
    if (!apiKey) {
      console.error("Missing OpenAI API secret");
      return json({ error: "AI secret is not configured" }, 500);
    }

    try {
      const form = await request.formData();
      const receipt = form.get("receipt");

      if (!receipt || typeof receipt === "string") {
        console.error("Receipt image missing");
        return json({ error: "receipt image is required" }, 400);
      }

      const arrayBuffer = await receipt.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const base64 = arrayBufferToBase64(bytes);
      const mimeType = receipt.type || "image/jpeg";
      const dataUrl = `data:${mimeType};base64,${base64}`;

      const model = env.RECEIPT_AI_MODEL || "gpt-5.6-luna";

      const payload = {
        model,
        reasoning: { effort: "none" },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Analyze this receipt image. Extract the merchant/store name, purchase date, grand total amount, currency, and the best expense category. " +
                  "For date, return YYYY-MM-DD when visible; otherwise null. " +
                  "For amount, return only the final total as a number, not item subtotal. " +
                  "Currency must be one of KRW, JPY, USD, EUR. " +
                  "Category must be one of 식비, 카페, 교통, 숙박, 관광, 쇼핑, 기타. " +
                  "Confidence must be a number from 0 to 1. If a field cannot be determined, use null where allowed."
              },
              {
                type: "input_image",
                image_url: dataUrl
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "receipt_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                merchant: { type: ["string", "null"] },
                date: { type: ["string", "null"] },
                amount: { type: ["number", "null"] },
                currency: {
                  anyOf: [
                    { type: "string", enum: ALLOWED_CURRENCIES },
                    { type: "null" }
                  ]
                },
                category: {
                  anyOf: [
                    { type: "string", enum: ALLOWED_CATEGORIES },
                    { type: "null" }
                  ]
                },
                confidence: { type: "number", minimum: 0, maximum: 1 }
              },
              required: ["merchant", "date", "amount", "currency", "category", "confidence"]
            }
          }
        },
        max_output_tokens: 400
      };

      const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const raw = await openaiResponse.text();

      if (!openaiResponse.ok) {
        console.error("OpenAI error", openaiResponse.status, raw.slice(0, 1200));
        let message = "OpenAI request failed";
        try {
          const parsed = JSON.parse(raw);
          message = parsed?.error?.message || message;
        } catch {}
        return json(
          { error: message, status: openaiResponse.status },
          openaiResponse.status >= 400 && openaiResponse.status < 600
            ? openaiResponse.status
            : 500
        );
      }

      const responseData = JSON.parse(raw);
      const outputText = getOutputText(responseData);

      if (!outputText) {
        console.error("OpenAI returned no output text", raw.slice(0, 1200));
        return json({ error: "AI returned no receipt data" }, 502);
      }

      let result;
      try {
        result = JSON.parse(outputText);
      } catch (error) {
        console.error("Could not parse AI JSON", outputText.slice(0, 1200));
        return json({ error: "AI returned invalid receipt data" }, 502);
      }

      const normalized = {
        merchant: typeof result.merchant === "string" ? result.merchant : null,
        date: typeof result.date === "string" ? result.date : null,
        amount: typeof result.amount === "number" ? result.amount : null,
        currency: ALLOWED_CURRENCIES.includes(result.currency) ? result.currency : null,
        category: ALLOWED_CATEGORIES.includes(result.category) ? result.category : null,
        confidence:
          typeof result.confidence === "number"
            ? Math.max(0, Math.min(1, result.confidence))
            : 0
      };

      console.log("Receipt analysis success", {
        merchant: normalized.merchant,
        date: normalized.date,
        amount: normalized.amount,
        currency: normalized.currency,
        category: normalized.category,
        confidence: normalized.confidence
      });

      return json(normalized, 200);
    } catch (error) {
      console.error("Receipt analysis exception", error?.stack || error?.message || String(error));
      return json(
        { error: "receipt analysis failed", detail: error?.message || String(error) },
        500
      );
    }
  }
};

function getOutputText(responseData) {
  if (typeof responseData?.output_text === "string" && responseData.output_text) {
    return responseData.output_text;
  }

  const parts = [];
  for (const item of responseData?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function arrayBufferToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
