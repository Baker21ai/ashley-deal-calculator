// Netlify Function: natural-language MATH PARSER (smart-parse fallback).
//
// The client's deterministic engine (calcEngine.js) handles the common case
// offline. When it can't read a phrase, the client calls this endpoint.
// Gemini ONLY translates the words into a structured list of calculator
// ACTIONS — it does NOT do arithmetic. The client then runs those actions
// through the same deterministic evaluate() the tap buttons use, so the math
// is exact and auditable (the PAL pattern: LLM parses, code computes).

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You translate a furniture salesperson's spoken or typed math into a
list of calculator ACTIONS. You DO NOT do arithmetic — the calculator computes the
result from your actions. Return ONLY JSON matching the schema.

ACTIONS run in order on a running total:
- start: begin with a number. { "kind":"start", "value": <number>, "qty"?: <number>, "label"?: <string> }
- add / sub: add or subtract a number. { "kind":"add"|"sub", "value", "qty"?, "label"? }
- mul / div: multiply or divide by a number. { "kind":"mul"|"div", "value" }
- addPct / subPct: add / subtract a percent OF the running total. { "kind":"addPct"|"subPct", "pct" }
- mulPct / divPct: multiply / divide by a percent. { "kind":"mulPct"|"divPct", "pct" }
- addTax: add sales tax (the rate is applied by our code). { "kind":"addTax" }
- backTax: back sales tax out of an out-the-door price. { "kind":"backTax" }
- landing: divide by 3.3 (a landing-cost estimate). { "kind":"landing" }
- marginPrice: turn the running total (a cost) into the sale price at pct margin. { "kind":"marginPrice", "pct" }

RULES
- The FIRST action MUST be "start".
- NEVER multiply or add numbers yourself. For quantity × unit price, put the UNIT
  price in "value" and the count in "qty". e.g. "two chairs at 200" -> value 200, qty 2.
- Numbers listed with no operator between them are separate line items -> use "add".
- Ignore filler words ("cost", "is", "the", "please"). Put item names in "label".
- "off"/"discount" percent -> subPct. "plus tax"/"with tax" -> addTax.
  "out the door"/"OTD" -> backTax. "margin" -> marginPrice.

EXAMPLES
"one couch cost 1001, couch cost 500" -> {"actions":[{"kind":"start","value":1001,"label":"couch"},{"kind":"add","value":500,"label":"couch"}]}
"twelve hundred minus fifteen percent plus tax" -> {"actions":[{"kind":"start","value":1200},{"kind":"subPct","pct":15},{"kind":"addTax"}]}
"two chairs at two hundred each and a sofa for 750" -> {"actions":[{"kind":"start","value":200,"qty":2,"label":"chairs"},{"kind":"add","value":750,"label":"sofa"}]}
"customer wants eighteen hundred out the door" -> {"actions":[{"kind":"start","value":1800},{"kind":"backTax"}]}
"landing on 990" -> {"actions":[{"kind":"start","value":990},{"kind":"landing"}]}
"six hundred at fifty percent margin" -> {"actions":[{"kind":"start","value":600},{"kind":"marginPrice","pct":50}]}`;

const ACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kind: {
      type: 'STRING',
      enum: ['start', 'add', 'sub', 'mul', 'div', 'addPct', 'subPct', 'mulPct', 'divPct', 'addTax', 'backTax', 'landing', 'marginPrice'],
    },
    value: { type: 'NUMBER' },
    qty: { type: 'NUMBER' },
    pct: { type: 'NUMBER' },
    label: { type: 'STRING' },
  },
  required: ['kind'],
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: { actions: { type: 'ARRAY', items: ACTION_SCHEMA } },
  required: ['actions'],
};

function jsonResponse(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function refererAllowed(event) {
  const allowed = (process.env.COACH_ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  const referer = event.headers.referer || event.headers.Referer || '';
  return allowed.some((origin) => referer.startsWith(origin));
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'POST only' });
  if (!refererAllowed(event)) return jsonResponse(403, { error: 'Origin not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return jsonResponse(200, { actions: [], error: 'AI not configured' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const text = typeof body.text === 'string' ? body.text.slice(0, 400).trim() : '';
  if (!text) return jsonResponse(200, { actions: [] });

  const requestBody = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
      maxOutputTokens: 512,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let resp;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    resp = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    console.error('parse-math fetch failed:', err);
    return jsonResponse(200, { actions: [], error: 'offline' });
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error('parse-math Gemini error', resp.status, errText);
    return jsonResponse(200, { actions: [], error: 'upstream' });
  }

  const json = await resp.json().catch(() => null);
  const out = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) return jsonResponse(200, { actions: [] });

  let parsed;
  try { parsed = JSON.parse(out); } catch { return jsonResponse(200, { actions: [] }); }
  return jsonResponse(200, { actions: Array.isArray(parsed.actions) ? parsed.actions : [] });
}
