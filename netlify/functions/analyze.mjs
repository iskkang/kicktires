// netlify/functions/analyze.mjs
//
// Turns pasted listing text (or a URL) into structured vehicle fields.
// The API key lives ONLY here, in Netlify's environment variables.
// It is never sent to the browser.
//
// Netlify → Site configuration → Environment variables:
//   DEEPSEEK_API_KEY   sk-...            (required)
//   DEEPSEEK_MODEL     deepseek-chat     (optional — set to the V4 alias you want)
//   ANTHROPIC_API_KEY  sk-ant-...        (optional — only if you switch PROVIDER)
//   PROVIDER           deepseek | claude (optional, default deepseek)

const SYSTEM = `You extract structured data from used-car listings.

Return ONLY a JSON object with these keys:
  year        integer, or null
  make        lowercase string, or null
  model       lowercase string, no spaces or punctuation (e.g. "f150", "rav4", "x5"), or null
  trim        string or null
  mileage     integer miles, or null
  price       integer USD, or null
  location    string or null
  seller      "dealer" | "private" | null
  notes       array of short strings: anything the seller said that a buyer should
              notice — recent repairs, accident mentions, "needs work", "as is",
              title problems. Empty array if nothing notable.

Rules:
- Never guess. If a field is not clearly present, use null.
- If the input is only a URL with no listing text, return all nulls and set
  notes to ["url_only"].
- Output raw JSON. No markdown fences, no commentary.`;

const PROVIDERS = {
  deepseek: {
    url: "https://api.deepseek.com/chat/completions",
    key: () => process.env.DEEPSEEK_API_KEY,
    body: text => ({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: text }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 700
    }),
    auth: k => ({ Authorization: `Bearer ${k}` }),
    pick: j => j.choices?.[0]?.message?.content
  },
  claude: {
    url: "https://api.anthropic.com/v1/messages",
    key: () => process.env.ANTHROPIC_API_KEY,
    body: text => ({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: "user", content: text }]
    }),
    auth: k => ({ "x-api-key": k, "anthropic-version": "2023-06-01" }),
    pick: j => j.content?.[0]?.text
  }
};

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let text = "";
  try { ({ text = "" } = await req.json()); } catch { return json({ error: "bad json" }, 400); }

  text = String(text).trim().slice(0, 8000);          // cap input — cost and abuse control
  if (text.length < 8) return json({ error: "too short" }, 400);

  const name = (process.env.PROVIDER || "deepseek").toLowerCase();
  const p = PROVIDERS[name];
  if (!p) return json({ error: `unknown provider ${name}` }, 500);

  const key = p.key();
  if (!key) return json({ error: `missing API key for ${name}` }, 500);

  try {
    const r = await fetch(p.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...p.auth(key) },
      body: JSON.stringify(p.body(text))
    });
    if (!r.ok) return json({ error: "upstream", status: r.status }, 502);

    const raw = p.pick(await r.json()) || "{}";
    const car = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim());

    return json({ car }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    return json({ error: "parse or network failure" }, 502);
  }
};

const json = (o, status = 200, extra = {}) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json", ...extra }
  });

export const config = { path: "/api/analyze" };
