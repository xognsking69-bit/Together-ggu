/**
 * Trip Split receipt AI Worker skeleton.
 *
 * IMPORTANT:
 * - AI secret goes in the server secret store only.
 * - Never commit RECEIPT_AI_API_KEY to GitHub.
 * - The mobile app only knows this Worker's public URL.
 *
 * Expected secret:
 *   RECEIPT_AI_API_KEY
 *
 * When an AI provider is selected later, connect it inside analyzeWithProvider().
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST" || url.pathname !== "/receipt/analyze") {
      return json({ error: "Not found" }, 404);
    }

    if (!env.RECEIPT_AI_API_KEY) {
      return json({ error: "AI secret is not configured" }, 503);
    }

    try {
      const form = await request.formData();
      const receipt = form.get("receipt");

      if (!receipt || typeof receipt === "string") {
        return json({ error: "receipt image is required" }, 400);
      }

      const result = await analyzeWithProvider(receipt, env.RECEIPT_AI_API_KEY);

      return json({
        merchant: result.merchant,
        date: result.date,
        amount: result.amount,
        currency: result.currency,
        category: result.category,
        confidence: result.confidence,
      });
    } catch (error) {
      return json({ error: "receipt analysis failed" }, 500);
    }
  },
};

async function analyzeWithProvider(receiptFile, apiKey) {
  // V1.7 security-ready hook.
  // 실제 AI 업체를 선택할 때 이 함수에 API 호출만 연결하면 됩니다.
  // apiKey is available only on the server.
  throw new Error("AI provider not connected yet");
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
