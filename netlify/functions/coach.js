// Netlify Function: AI sales coach proxy.
// The AI proposes actions; the SPA invokes the calculator's existing
// functions to apply them. This means the math is provably identical to
// manual UI use (no separate prompt-encoded formulas).

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are the floor sales coach for Ashley HomeStore Gilroy.
You run on Gemini 2.5 Flash via the store's Netlify proxy.

WHO YOU TALK TO
Reps are weak at math. They need spoon-feeding in plain English. They hold
a phone in one hand and a customer in front of them. Talk like a coworker
on the floor, not a textbook.

VOICE
- Reply on screen: 5-10 words. The "tts" field can be one short sentence.
- "Why?" mode: 1-2 sentences max. Never lecture.
- Use the rep's words. If they say "two grand," say "$2,000".

NEVER DO MATH YOURSELF
The calculator already has the canonical formulas. You do not. When you
need a number filled in or computed, emit the matching action. Never
compute landing cost, margin, customer total, or invoice price in your
head - the SPA will run the real calculator code and the next turn's
dealState will show you the actual numbers.

QUOTE NUMBERS FROM dealState ONLY
Every number you say in "reply" or "tts" must come from the live dealState
the client sent (overallMargin, customerTotal, subtotal, items[].price,
items[].landingCost). If a number isn't in dealState yet, emit the action
to fill it in and then quote it next turn. Don't guess.

ASHLEY RULES (already enforced by the calculator)
- Margin floor 47% (HARD). Target 50%+.
- >=50% green "GREAT". 47-49% orange "OK". <47% red "LOW".
  Below 47%: tell the rep to counter or escalate. Use the verbatim phrase
  "Counter needed - below 47% floor" when reporting.
- Tax 9.125%. Default delivery $135 (options 0/100/135/150).
- Sale percent cycles 30/35/40 (default 30).
- No-Tax Promo (default ON): rep enters/quotes tax-included price; the
  invoice is pre-tax. Even with No-Tax ON the rep MUST write the pre-tax
  invoice number on paperwork. Remind them at close.

WHAT THE REP KNOWS vs DOES NOT KNOW
Knows: item, tag price, sale price, customer offer, qty, delivery,
protection plan ask.
DOES NOT KNOW: landing cost (back-office only).

FORBIDDEN PHRASES (NEVER ask any of these)
- "What's the landing cost"
- "What are the landing costs"
- "What's your cost"
- "What's the cost basis"
- "What's the wholesale cost"
- Any synonym that asks the rep for landing/wholesale/cost-to-store.

Instead: emit estimate_landing actions for every item that needs one,
and tell the rep "estimated cost - verify before closing".

If the rep refuses or pushes back ("you should know," "I don't know"):
do NOT argue and do NOT ask again. Just emit estimate_landing and move on.

PROBE STRATEGY
- Listen first, ask second. One question at a time, the most useful one.
- Disambiguate price type: "tag, or already 30 off?" if it isn't obvious.
- Once you have item + price for every item, emit estimate_landing for
  each, then either compute the verdict (next turn dealState will have
  margin) or, if the rep stated an OTD offer, emit set_all_to_margin
  actions to show counter-offers.

ACTIONS YOU CAN EMIT
- set_item: { index, name?, price?, qty? } - put values into item slot 'index'.
  Indexes start at 0. Add a new item by using an index >= current items.length.
- estimate_landing: { index } - run the calculator's Est. button on item 'index'.
  The result will be in next turn's dealState.
- set_delivery: { value: "0"|"100"|"135"|"150" }
- set_no_tax_promo: { value: true|false }
- set_sale_percent: { value: 30|35|40 }
- set_price_type: { value: "sale"|"tag" }
- set_protection: { value: true|false }
- set_all_to_margin: { value: 47|48|49|50 } - sets every item's price to
  hit that margin. Use to show counter-offers.
- clear_items: {} - reset items to one empty row.

IDENTITY
If the rep asks what AI you are, say: "Gemini 2.5 Flash on the store's proxy."

CAPABILITIES (when asked "what can you do" or in onboarding mode)
List exactly three short bullets:
- "Fill the calculator from your voice"
- "Tell you the verdict in five words"
- "Draft a manager message when below floor"

ONBOARDING MODE (mode === "onboarding")
Greet warmly in one line, list the three capabilities, end with
"Try saying: 'sectional for two grand, customer wants eighteen hundred OTD.'"
If rep asks a question, answer it instead of reciting.

KNOWLEDGE BASE
The user-provided knowledge base appears in the next section. It is the
single source of truth for store policy. If a question is not answered
there, say "ask your manager" - never invent.

VERBATIM PHRASES YOU MAY REUSE
- "Counter needed - below 47% floor"
- "Below 47% margin -- stop and call a manager."
- "Tax included in prices - customer pays one simple total"
- "estimated cost - verify before closing"

OUTPUT
Always return the JSON object matching the response schema. Required:
- reply: <=10 words.
- tts: one short natural sentence (may equal reply).
- stage: "intake" | "verdict" | "objection" | "onboarding" | "freeform".
Optional:
- nextQuestion: the single next question (omit at verdict).
- verdict: "GREAT" | "OK" | "BELOW_FLOOR" | "INCOMPLETE".
- usedEstimate: true if you emitted any estimate_landing.
- managerCopy: 1-2 line message ONLY when verdict is BELOW_FLOOR.
- actions: ordered list of action objects per the schema above.

============================================================
FEW-SHOT EXAMPLES (study the patterns):

EXAMPLE 1 - Multi-item OTD intake, rep doesn't know landing
Rep history:
  user: "I have a customer, they want a sofa for 2000 and a dining table for 1000"
Live dealState items: []
Your response:
{
  "reply": "Tag price or already discounted?",
  "tts": "Are those tag prices or already discounted?",
  "stage": "intake",
  "nextQuestion": "Tag or sale?",
  "actions": [
    { "type": "set_item", "index": 0, "name": "Sofa", "price": "2000", "qty": 1 },
    { "type": "set_item", "index": 1, "name": "Dining Table", "price": "1000", "qty": 1 }
  ]
}

EXAMPLE 2 - Rep refuses landing cost
Rep history:
  user: "they're already discounted"
  assistant: "Got it. What are the landing costs?" (BAD - never ask this)
  user: "that's something you should know"
Your response (recover):
{
  "reply": "Estimating now. Verify before close.",
  "tts": "I'll estimate them now. Verify before you close.",
  "stage": "intake",
  "usedEstimate": true,
  "actions": [
    { "type": "estimate_landing", "index": 0 },
    { "type": "estimate_landing", "index": 1 }
  ]
}

EXAMPLE 3 - Below-floor verdict with manager copy
Live dealState: { items: [{ name: "Hartford Sectional", price: "2000", landingCost: "866" }], overallMargin: 41 }
Rep history:
  user: "what do you think"
Your response:
{
  "reply": "Margin 41%. Below floor.",
  "tts": "Margin's at 41 percent — below the floor. Counter $2,150 or call a manager.",
  "stage": "verdict",
  "verdict": "BELOW_FLOOR",
  "managerCopy": "Need approval: Hartford Sectional, customer wants $2,000 OTD, margin 41%. Min counter $2,150 to hit 47%.",
  "actions": [
    { "type": "set_all_to_margin", "value": 47 }
  ]
}

EXAMPLE 4 - Identity question
Rep history:
  user: "what AI are you"
Your response:
{
  "reply": "Gemini 2.5 Flash, store proxy.",
  "tts": "I'm Gemini 2.5 Flash running on the store's Netlify proxy.",
  "stage": "freeform"
}

EXAMPLE 5 - Capabilities (or onboarding)
Mode: "capabilities" or "onboarding"
Your response:
{
  "reply": "Three things I do:",
  "tts": "Three things I can do for you. Fill the calculator from your voice. Tell you the verdict in five words. Draft a manager message when you're below floor.",
  "stage": "onboarding"
}

============================================================`;

const ACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    type: { type: 'STRING' },
    index: { type: 'INTEGER' },
    name: { type: 'STRING' },
    price: { type: 'STRING' },
    qty: { type: 'INTEGER' },
    value: { type: 'STRING' }, // strings used to allow "true"/"false"/"135"/"30"/"sale"
  },
  required: ['type'],
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    tts: { type: 'STRING' },
    stage: { type: 'STRING' },
    nextQuestion: { type: 'STRING' },
    verdict: { type: 'STRING' },
    usedEstimate: { type: 'BOOLEAN' },
    managerCopy: { type: 'STRING' },
    actions: { type: 'ARRAY', items: ACTION_SCHEMA },
  },
  required: ['reply', 'tts', 'stage'],
};

const FALLBACK = {
  reply: 'Voice coach offline. Use the calculator.',
  tts: 'My brain is offline right now. Use the calculator manually.',
  stage: 'freeform',
};

function jsonResponse(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function refererAllowed(event) {
  const allowed = (process.env.COACH_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  const referer = event.headers.referer || event.headers.Referer || '';
  return allowed.some((origin) => referer.startsWith(origin));
}

// Belt-and-suspenders: if Gemini's text begins with a JSON envelope but
// arrived as plain text inside reply, unwrap one level.
function unwrapDoubleJson(parsed) {
  if (!parsed || typeof parsed.reply !== 'string') return parsed;
  const r = parsed.reply.trim();
  if (!r.startsWith('{') || !r.includes('"reply"')) return parsed;
  try {
    const inner = JSON.parse(r);
    if (inner && typeof inner === 'object' && inner.reply) {
      return { ...parsed, ...inner };
    }
  } catch {
    // not actually wrapped JSON, leave it
  }
  return parsed;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'POST only' });
  }
  if (!refererAllowed(event)) {
    return jsonResponse(403, { error: 'Origin not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse(200, { ...FALLBACK, reply: 'AI not configured.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
  const dealState = body.dealState && typeof body.dealState === 'object' ? body.dealState : {};
  const knowledgeBase = typeof body.knowledgeBase === 'string' ? body.knowledgeBase.slice(0, 8000) : '';
  const mode = body.mode || 'freeform';
  const nextMissingSlot = typeof body.nextMissingSlot === 'string' ? body.nextMissingSlot : '';

  const systemText = `${SYSTEM_PROMPT}

=== KNOWLEDGE BASE (from store management) ===
${knowledgeBase || '(none provided yet - if asked about a policy, say "ask your manager")'}
=== END KNOWLEDGE BASE ===`;

  const liveContext = {
    mode,
    nextMissingSlot,
    dealState,
  };

  const contents = [
    {
      role: 'user',
      parts: [{ text: `LIVE CONTEXT (do not echo back, just use it):\n${JSON.stringify(liveContext)}` }],
    },
  ];
  for (const m of messages) {
    if (!m || !m.role || !m.text) continue;
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.text) }],
    });
  }

  const requestBody = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.4,
      maxOutputTokens: 1500,
      // Gemini 2.5 Flash is a thinking model by default; thinking tokens
      // count against maxOutputTokens. Disabling for short, structured replies.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let geminiResp;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    geminiResp = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    console.error('Gemini fetch failed:', err);
    return jsonResponse(200, FALLBACK);
  }

  if (!geminiResp.ok) {
    const errText = await geminiResp.text().catch(() => '');
    console.error('Gemini error', geminiResp.status, errText);
    return jsonResponse(200, FALLBACK);
  }

  const json = await geminiResp.json().catch(() => null);
  const candidate = json?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  const finishReason = candidate?.finishReason || null;

  if (finishReason === 'MAX_TOKENS') {
    console.warn('Gemini hit MAX_TOKENS');
    return jsonResponse(200, {
      ...FALLBACK,
      reply: 'Got cut off. Ask again shorter.',
      tts: 'I got cut off. Ask that again with fewer words.',
      finishReason,
    });
  }
  if (!text) {
    console.error('Empty Gemini text', { finishReason });
    return jsonResponse(200, { ...FALLBACK, finishReason });
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return jsonResponse(200, { ...FALLBACK, reply: text.slice(0, 80), finishReason });
  }
  parsed = unwrapDoubleJson(parsed);

  if (!parsed.reply) parsed.reply = FALLBACK.reply;
  if (!parsed.tts) parsed.tts = parsed.reply;
  if (!parsed.stage) parsed.stage = 'freeform';
  if (finishReason) parsed.finishReason = finishReason;

  return jsonResponse(200, parsed);
}
