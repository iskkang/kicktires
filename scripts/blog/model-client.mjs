// The provider call for blog generation. Deliberately separate from the one inside
// netlify/functions/analyze.mjs: that one is tuned for a 25s serverless budget and short
// verdicts, this one asks for long-form JSON and can afford minutes. Sharing it would mean
// changing the analyzer's timeouts to suit a batch job, which is how the live check breaks.
//
// Provider resolution matches the analyzer's, so one set of keys configures both.

const PROVIDER_KEYS = {
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  claude: "ANTHROPIC_API_KEY"
};

export function resolveProvider() {
  const requested = String(process.env.PROVIDER || "").trim().toLowerCase();
  if (requested) return requested;
  return Object.keys(PROVIDER_KEYS).find(name => process.env[PROVIDER_KEYS[name]]) || "deepseek";
}

export function providerStatus() {
  const provider = resolveProvider();
  const key = PROVIDER_KEYS[provider];
  return { provider, envVar: key || null, configured: Boolean(key && process.env[key]) };
}

const isReasoningModel = model => /^(?:o\d|gpt-5)/i.test(String(model || ""));

/**
 * One model call returning raw text. Retries only what can succeed on a retry: rate limits
 * and 5xx. A 401 or a bad model name is permanent and retrying it just delays the failure.
 */
export async function callModel(system, user, {
  maxTokens = 4000, temperature = 0.3, timeoutMs = 120_000, seed = null,
  attempts = 3, fetchImpl = fetch, json = true
} = {}) {
  const status = providerStatus();
  if (!status.configured) {
    const error = new Error(`missing_key:${status.envVar || status.provider}`);
    error.permanent = true;
    throw error;
  }

  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await callOnce(system, user, {
        maxTokens, temperature, timeoutMs, seed, fetchImpl, json, provider: status.provider
      });
    } catch (error) {
      lastError = error;
      if (error.permanent) throw error;
      if (attempt < attempts - 1) {
        await new Promise(done => setTimeout(done, 2_000 * (2 ** attempt)));
      }
    }
  }
  throw lastError || new Error("model_call_failed");
}

async function callOnce(system, user, options) {
  const { provider, maxTokens, temperature, timeoutMs, seed, fetchImpl, json } = options;
  const signal = AbortSignal.timeout(timeoutMs);
  const stableSeed = Number.isInteger(seed) ? { seed } : {};
  const format = json ? { response_format: { type: "json_object" } } : {};

  if (provider === "claude") {
    const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        max_tokens: maxTokens, temperature, system,
        messages: [{ role: "user", content: user }]
      })
    });
    await assertOk(response);
    return (await response.json()).content?.[0]?.text || "";
  }

  const openai = provider === "openai";
  if (!openai && provider !== "deepseek") {
    const error = new Error(`unknown_provider:${provider}`);
    error.permanent = true;
    throw error;
  }
  const endpoint = openai
    ? "https://api.openai.com/v1/chat/completions"
    : "https://api.deepseek.com/chat/completions";
  const key = openai ? process.env.OPENAI_API_KEY : process.env.DEEPSEEK_API_KEY;
  const model = openai
    ? (process.env.OPENAI_MODEL || "gpt-4o-mini")
    : (process.env.DEEPSEEK_MODEL || "deepseek-chat");
  const reasoning = openai && isReasoningModel(model);

  const response = await fetchImpl(endpoint, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      ...format,
      ...(reasoning
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens, temperature, ...stableSeed })
    })
  });
  await assertOk(response);
  return (await response.json()).choices?.[0]?.message?.content || "";
}

async function assertOk(response) {
  if (response.ok) return;
  const body = await response.text().catch(() => "");
  const error = new Error(`provider_${response.status}: ${body.slice(0, 200)}`);
  // 429 and 5xx can pass on a retry. Everything else is configuration.
  error.permanent = response.status !== 429 && response.status < 500;
  throw error;
}

/** Model replies wrap JSON in prose or fences often enough to be worth handling here. */
export function parseJson(text) {
  const cleaned = String(text || "").trim()
    .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(cleaned); }
  catch { /* fall through to brace scan */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error("model_reply_not_json");
}
