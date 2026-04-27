// Thin wrappers around the Web Speech API (free, browser-native).
// Both STT and TTS gracefully degrade when unsupported.

const SpeechRecognition =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export const sttSupported = Boolean(SpeechRecognition);
export const ttsSupported =
  typeof window !== 'undefined' && Boolean(window.speechSynthesis);

export function createRecognizer({ onResult, onEnd, onError } = {}) {
  if (!SpeechRecognition) return null;
  const rec = new SpeechRecognition();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = 'en-US';

  let finalTranscript = '';

  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) finalTranscript += result[0].transcript;
      else interim += result[0].transcript;
    }
    onResult?.({ final: finalTranscript.trim(), interim: interim.trim() });
  };

  rec.onend = () => {
    onEnd?.(finalTranscript.trim());
    finalTranscript = '';
  };

  rec.onerror = (e) => {
    onError?.(e.error || 'unknown');
  };

  return rec;
}

let cachedVoice = null;
function pickVoice() {
  if (!ttsSupported) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  cachedVoice =
    voices.find((v) => /en-US/i.test(v.lang) && /female|samantha|allison|google/i.test(v.name)) ||
    voices.find((v) => /en-US/i.test(v.lang)) ||
    voices[0];
  return cachedVoice;
}

if (ttsSupported) {
  // iOS Safari needs voices loaded after voiceschanged fires
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    pickVoice();
  };
}

export function speak(text, { onEnd } = {}) {
  if (!ttsSupported || !text) {
    onEnd?.();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.05;
    u.pitch = 1.0;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.speak(u);
  } catch {
    onEnd?.();
  }
}

export function stopSpeaking() {
  if (ttsSupported) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}
