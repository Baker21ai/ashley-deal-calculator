// Tiny client that POSTs to the Netlify function.
// Always resolves with a usable shape - never throws into the UI.

const ENDPOINT = '/.netlify/functions/coach';

const SAFE_FALLBACK = {
  reply: 'Voice coach offline. Use the calculator.',
  tts: 'Coach offline. Just enter the numbers manually for now.',
  stage: 'freeform',
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
  const timer = setTimeout(() => controller.abort(), 9000);

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
