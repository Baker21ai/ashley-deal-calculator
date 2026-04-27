// Scripted first-run dialogue that runs inside the chat panel.
// Pure messages - no LLM calls - so it always works and shows the rep
// what voice + auto-fill feels like.

export const ONBOARDING_KEY = 'ashley.onboarded';

export const ONBOARDING_SCRIPT = [
  {
    role: 'assistant',
    text: 'Hi - I help you on deals. Want a 30-second tour?',
    tts: "Hi! I help you with deals. Want a quick 30-second tour?",
    waitFor: 'yes',
  },
  {
    role: 'assistant',
    text: 'Tap the mic and tell me about a customer.',
    tts: "Tap the mic and tell me about a customer you're working with. Like 'Hartford sectional, customer wants two grand out the door.'",
  },
  {
    role: 'assistant',
    text: "I'll fill the calculator and tell you what to say.",
    tts: "I'll fill in the calculator for you and tell you exactly what to say to the customer or the manager.",
  },
  {
    role: 'assistant',
    text: 'Below 47% = stop and call manager. Got it?',
    tts: "One rule: if margin is below 47 percent, stop and call your manager. Got it?",
  },
  {
    role: 'assistant',
    text: "You're set. Ask me anything anytime.",
    tts: "You're all set. Ask me anything any time.",
    final: true,
  },
];

export function isOnboarded() {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return true;
  }
}

export function markOnboarded() {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    // ignore
  }
}

export function resetOnboarding() {
  try {
    window.localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    // ignore
  }
}
