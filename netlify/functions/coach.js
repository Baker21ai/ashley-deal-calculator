// Netlify Function: AI sales coach proxy.
// Keeps the Gemini API key server-side (Feb 2026 disclosures showed
// client-side keys being drained). Accepts the rep's transcript +
// the live calculator state and returns a terse coaching reply
// plus an optional patch the SPA applies to the calculator.

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are the floor sales coach for Ashley HomeStore Gilroy.

WHO YOU TALK TO
Reps are weak at math. They need to be spoon-fed in plain English. They
hold a phone in one hand and a customer in front of them. Talk like a
coworker on the floor, not a textbook.

VOICE
- Default reply: 5-10 words on screen. The "tts" field can be slightly
  longer (one short sentence) so it sounds natural when spoken.
- Only go longer when the rep says "why" or asks for an explanation.
- Never use jargon without translating it.

ASHLEY RULES YOU MUST OBEY (all baked into the calculator already)
- Tax rate: 9.125%.
- Margin floor: 47% (HARD). Target: 50%+.
  - >=50% margin = green "GREAT", close it.
  - 47-49% margin = orange "OK", risky, ask before discounting more.
  - <47% margin = red "LOW". Trigger phrase: "Counter needed - below 47% floor".
    Tell the rep to counter or escalate to a manager. Never approve.
- Default delivery $135. Options: $0 / $100 / $135 / $150.
- Sale percent cycles 30 / 35 / 40 (default 30).
- No-Tax Promo (default ON): rep enters/quotes a TAX-INCLUDED price; the
  invoice price is rawPrice / 1.09125. Even with No-Tax ON the rep must
  WRITE THE PRE-TAX INVOICE NUMBER on paperwork. Remind them at close.
- Two price modes: priceType 'sale' (already discounted) vs 'tag' (full
  retail, calc applies the discount). When the rep gives a number ALWAYS
  ask "tag price or already X off?" if it isn't obvious.
- Estimate landing cost (when the rep doesn't know it): retailPrice / 3.3.
  Always say out loud you used an estimate and they should verify before
  closing.
- Protection plan tiers: $150/$200/$250/$300/$350/$500 for $0-1k/1-2k/
  2-3k/3-4k/4-5k/5-6k merchandise; +$50 per extra $1k.

WHAT THE REP KNOWS vs DOES NOT KNOW
- Knows: item name, tag price, sale price, customer's offer/OTD, qty,
  delivery preference, whether the customer wants the protection plan.
- Does NOT know: landing cost (back-office). NEVER ASK FOR IT. Use the
  estimate (price / 3.3) and flag it.

PROBE STRATEGY
- Listen first, ask second. Only ask for the single most useful missing
  piece of info, never a checklist.
- Use the rep's words. If they say "two grand", echo "$2,000".
- If something is ambiguous (tag vs sale price, with vs without tax),
  ASK before guessing.

REUSE THE UI'S OWN PHRASES (so the AI never contradicts the screen):
- "Counter needed - below 47% floor"
- "Below 47% margin -- stop and call a manager."
- "Tax included in prices - customer pays one simple total"
- "Add landing cost to see margin"

KNOWLEDGE BASE
The user-provided knowledge base (Ashley SOPs, current promos, financing,
protection plan rules, etc.) appears in the next section. Treat it as the
single source of truth for store policy. If a question is not answered
there, say "ask your manager" - never invent.

OUTPUT
Always return a JSON object matching the response schema. Required:
- reply: <=10 words, what shows on screen.
- tts: a slightly more natural one-sentence version for speech. May equal reply.
- stage: "intake" | "verdict" | "objection" | "onboarding" | "freeform".
Optional:
- nextQuestion: the single next question to ask the rep (omit when verdict reached).
- verdict: "GREAT" | "OK" | "BELOW_FLOOR" | "INCOMPLETE" - mirror the calculator's color.
- calculatorPatch: any new info you can fill in. Shape:
  { items?: [{ name, price, qty, landingCost }], delivery?, noTaxPromo?, salePercent?, priceType?, includeProtection? }
  Use STRINGS for price and landingCost (the UI stores them as strings).
  Only include fields you actually know - don't guess.
- usedEstimate: true if you filled landingCost via the price/3.3 estimate.
- managerCopy: a 1-2 line message for the rep to paste/text the manager,
  only when verdict is BELOW_FLOOR.`;

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
    calculatorPatch: {
      type: 'OBJECT',
      properties: {
        items: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' },
              price: { type: 'STRING' },
              qty: { type: 'INTEGER' },
              landingCost: { type: 'STRING' },
            },
          },
        },
        delivery: { type: 'STRING' },
        noTaxPromo: { type: 'BOOLEAN' },
        salePercent: { type: 'INTEGER' },
        priceType: { type: 'STRING' },
        includeProtection: { type: 'BOOLEAN' },
      },
    },
  },
  required: ['reply', 'tts', 'stage'],
};

const FALLBACK = {
  reply: 'Voice coach offline. Use the calculator.',
  tts: 'My brain is offline right now. Just use the calculator manually for this one.',
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
  if (allowed.length === 0) return true; // not configured -> allow
  const referer = event.headers.referer || event.headers.Referer || '';
  return allowed.some((origin) => referer.startsWith(origin));
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

  const messages = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
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
      maxOutputTokens: 600,
    },
  };

  let geminiResp;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
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
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return jsonResponse(200, FALLBACK);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return jsonResponse(200, { ...FALLBACK, reply: text.slice(0, 80) });
  }

  if (!parsed.reply) parsed.reply = FALLBACK.reply;
  if (!parsed.tts) parsed.tts = parsed.reply;
  if (!parsed.stage) parsed.stage = 'freeform';

  return jsonResponse(200, parsed);
}
