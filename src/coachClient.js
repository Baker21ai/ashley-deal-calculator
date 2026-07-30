// Tiny client that POSTs to the Netlify function.
// Always resolves with a usable shape - never throws into the UI.

const ENDPOINT = '/.netlify/functions/coach';

// `offline: true` lets the panel keep itself open and explain the situation
// rather than auto-collapsing into a one-line error the user can't act on.
const SAFE_FALLBACK = {
  reply: "I can't reach my brain right now, so I can't answer questions. "
    + 'The calculator itself still works normally — fill in the three boxes and tap Calculate This Deal.',
  tts: 'I am offline right now. The calculator still works, just enter the numbers yourself.',
  stage: 'freeform',
  offline: true,
};

export async function postCoach({ messages, dealState, knowledgeBase, mode, nextMissingSlot }) {
  const payload = JSON.stringify({
    messages,
    dealState,
    knowledgeBase: knowledgeBase || '',
    mode: mode || 'freeform',
    nextMissingSlot: nextMissingSlot || '',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11000);

  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return SAFE_FALLBACK;
    const json = await resp.json();
    if (!json || typeof json !== 'object' || !json.reply) return SAFE_FALLBACK;
    return json;
  } catch {
    clearTimeout(timer);
    return SAFE_FALLBACK;
  }
}
