// Client for the smart-parse fallback. Returns a raw actions array (to be run
// through calcEngine's sanitizeActions + evaluate), or null on any failure so
// the UI can degrade gracefully. Never throws.

const ENDPOINT = '/.netlify/functions/parse-math';

export async function postMathParse({ text, taxRate }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11000);
  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, taxRate }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const json = await resp.json();
    return Array.isArray(json?.actions) ? json.actions : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}
