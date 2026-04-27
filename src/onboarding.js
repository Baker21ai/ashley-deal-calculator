// Onboarding is now LLM-driven (mode === "onboarding" in the system prompt).
// This module only persists the "have they been onboarded" flag.

export const ONBOARDING_KEY = 'ashley.onboarded';

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
