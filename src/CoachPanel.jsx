import { useEffect, useMemo, useRef, useState } from 'react';
import { postCoach } from './coachClient.js';
import { dealSnapshot, nextMissingSlot, mergePatch, inferGoal } from './dialogueManager.js';
import { sttSupported, ttsSupported, createRecognizer, speak, stopSpeaking } from './voiceIO.js';
import { ONBOARDING_SCRIPT, isOnboarded, markOnboarded } from './onboarding.js';

const KB_KEY = 'ashley.kb';
const TTS_KEY = 'ashley.tts.enabled';

const DEFAULT_KB = `Ashley HomeStore Gilroy - default knowledge

Tax: 9.125% (CA local rate).
Margin floor: 47% (hard - call manager). Target: 50%+.
Delivery: $0 / $100 / $135 (default) / $150.
Sale percent: 30 / 35 / 40.
No-Tax Promo: ON by default. Customer is quoted a tax-included price; the
invoice is written pre-tax (rawPrice / 1.09125).
Protection plan: tiered $150-$500 (see calculator help).

Add SOPs, current promos, financing terms, manager scripts, etc. below
and the AI will use them when answering reps.

`;

function loadKB() {
  if (typeof window === 'undefined') return DEFAULT_KB;
  try {
    return window.localStorage.getItem(KB_KEY) ?? DEFAULT_KB;
  } catch {
    return DEFAULT_KB;
  }
}

function loadTTS() {
  if (typeof window === 'undefined') return true;
  try {
    const v = window.localStorage.getItem(TTS_KEY);
    return v == null ? true : v === '1';
  } catch {
    return true;
  }
}

export default function CoachPanel({
  open,
  onClose,
  calcSnapshot,
  applyPatch,
  onVerdict,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [busy, setBusy] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(loadTTS);
  const [kb, setKb] = useState(loadKB);
  const [showKb, setShowKb] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboarded());
  const [onboardingStep, setOnboardingStep] = useState(0);

  const recognizerRef = useRef(null);
  const transcriptRef = useRef(null);

  // Run onboarding script when first opened
  useEffect(() => {
    if (!open || !showOnboarding) return;
    if (onboardingStep === 0 && messages.length === 0) {
      const first = ONBOARDING_SCRIPT[0];
      setMessages([{ role: 'assistant', text: first.text }]);
      if (ttsEnabled) speak(first.tts || first.text);
      setOnboardingStep(1);
    }
  }, [open, showOnboarding, onboardingStep, messages.length, ttsEnabled]);

  // Persist KB
  useEffect(() => {
    try {
      window.localStorage.setItem(KB_KEY, kb);
    } catch {
      // ignore
    }
  }, [kb]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TTS_KEY, ttsEnabled ? '1' : '0');
    } catch {
      // ignore
    }
  }, [ttsEnabled]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: 999999, behavior: 'smooth' });
  }, [messages, interim]);

  // Stop TTS when panel closes
  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  const advanceOnboarding = (userText) => {
    const next = onboardingStep;
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    if (next >= ONBOARDING_SCRIPT.length) {
      finishOnboarding();
      return;
    }
    const step = ONBOARDING_SCRIPT[next];
    setMessages((prev) => [...prev, { role: 'assistant', text: step.text }]);
    if (ttsEnabled) speak(step.tts || step.text);
    setOnboardingStep(next + 1);
    if (step.final) finishOnboarding();
  };

  const finishOnboarding = () => {
    markOnboarded();
    setShowOnboarding(false);
  };

  const sendToAI = async (userText) => {
    const goal = inferGoal(calcSnapshot);
    const slot = nextMissingSlot(calcSnapshot, goal === 'margin_check' ? 'otd' : 'quote');
    const newMessages = [...messages, { role: 'user', text: userText }];
    setMessages(newMessages);
    setBusy(true);
    const resp = await postCoach({
      messages: newMessages,
      dealState: calcSnapshot,
      knowledgeBase: kb,
      mode: goal,
      nextMissingSlot: slot,
    });
    setBusy(false);
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        text: resp.reply,
        verdict: resp.verdict,
        usedEstimate: resp.usedEstimate,
        managerCopy: resp.managerCopy,
        applied: Boolean(resp.calculatorPatch),
      },
    ]);
    if (ttsEnabled && resp.tts) speak(resp.tts);
    if (resp.calculatorPatch) applyPatch(resp.calculatorPatch);
    if (resp.verdict || resp.reply) onVerdict?.({ text: resp.reply, verdict: resp.verdict });
  };

  const handleSubmit = (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed || busy) return;
    setInput('');
    setInterim('');
    if (showOnboarding) {
      advanceOnboarding(trimmed);
      return;
    }
    sendToAI(trimmed);
  };

  const startListening = () => {
    if (!sttSupported || listening) return;
    stopSpeaking();
    const rec = createRecognizer({
      onResult: ({ final, interim: live }) => {
        setInterim(live);
        if (final) setInput(final);
      },
      onEnd: (finalText) => {
        setListening(false);
        setInterim('');
        if (finalText) handleSubmit(finalText);
      },
      onError: () => {
        setListening(false);
        setInterim('');
      },
    });
    if (!rec) return;
    recognizerRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const stopListening = () => {
    if (!recognizerRef.current) return;
    try {
      recognizerRef.current.stop();
    } catch {
      // ignore
    }
  };

  const toggleMic = () => (listening ? stopListening() : startListening());

  const askWhy = () => {
    if (busy) return;
    sendToAI('Explain that in one or two sentences - why?');
  };

  const replayOnboarding = () => {
    setShowOnboarding(true);
    setOnboardingStep(0);
    setMessages([]);
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '85vh',
          background: '#161920',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          color: '#F5F0EB',
          fontFamily: '"Sora", -apple-system, sans-serif',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Coach</div>
            <div style={{ fontSize: 11, color: '#8B91A0' }}>
              {busy ? 'thinking…' : listening ? 'listening…' : 'tap mic and talk'}
            </div>
          </div>
          {ttsSupported && (
            <button
              onClick={() => {
                stopSpeaking();
                setTtsEnabled((v) => !v);
              }}
              title={ttsEnabled ? 'Mute voice' : 'Unmute voice'}
              style={iconBtn}
            >
              {ttsEnabled ? '🔊' : '🔇'}
            </button>
          )}
          <button onClick={() => setShowKb((v) => !v)} title="Knowledge base" style={iconBtn}>📚</button>
          <button onClick={replayOnboarding} title="Replay tour" style={iconBtn}>↻</button>
          <button onClick={onClose} title="Close" style={iconBtn}>✕</button>
        </div>

        {showKb ? (
          <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
            <div style={{ fontSize: 13, color: '#8B91A0', marginBottom: 8 }}>
              Anything you paste here is sent to the AI as Ashley's process knowledge.
              SOPs, current promos, financing terms, manager scripts, anything store-specific.
            </div>
            <textarea
              value={kb}
              onChange={(e) => setKb(e.target.value)}
              style={{
                width: '100%',
                minHeight: 280,
                background: '#0F1117',
                color: '#F5F0EB',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: 12,
                fontSize: 13,
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowKb(false)} style={primaryBtn}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div ref={transcriptRef} style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
              {messages.length === 0 && (
                <div style={{ color: '#8B91A0', fontSize: 13, padding: 12, textAlign: 'center' }}>
                  Say something like "Hartford sectional, customer wants two grand out the door."
                </div>
              )}
              {messages.map((m, i) => (
                <Message key={i} m={m} />
              ))}
              {interim && (
                <div style={{ ...bubbleStyle('user'), opacity: 0.5 }}>{interim}…</div>
              )}
              {busy && <div style={{ ...bubbleStyle('assistant'), opacity: 0.6 }}>…</div>}
            </div>

            <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8, alignItems: 'center' }}>
              {sttSupported ? (
                <button onClick={toggleMic} style={micBtn(listening)} title={listening ? 'Stop' : 'Tap to talk'}>
                  {listening ? '■' : '🎤'}
                </button>
              ) : (
                <div style={{ fontSize: 11, color: '#8B91A0', padding: '0 8px' }}>(voice not supported - type below)</div>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit(input)}
                placeholder="or type…"
                style={{
                  flex: 1,
                  background: '#0F1117',
                  color: '#F5F0EB',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
              <button onClick={() => handleSubmit(input)} style={primaryBtn} disabled={busy || !input.trim()}>
                Send
              </button>
              <button onClick={askWhy} style={iconBtn} title="Explain">Why?</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Message({ m }) {
  const isAI = m.role === 'assistant';
  const verdictColor =
    m.verdict === 'GREAT' ? '#34D399' :
    m.verdict === 'OK' ? '#FBBF24' :
    m.verdict === 'BELOW_FLOOR' ? '#F87171' : null;
  return (
    <div style={bubbleStyle(m.role)}>
      <div style={{ fontSize: 14, lineHeight: 1.4 }}>
        {verdictColor && (
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: verdictColor, marginRight: 8 }} />
        )}
        {m.text}
      </div>
      {m.applied && <div style={{ fontSize: 11, color: '#34D399', marginTop: 4 }}>✓ filled in calculator</div>}
      {m.usedEstimate && <div style={{ fontSize: 11, color: '#FBBF24', marginTop: 4 }}>↳ estimated cost - verify before close</div>}
      {m.managerCopy && (
        <div style={{ marginTop: 6, padding: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#8B91A0', marginBottom: 4 }}>For your manager:</div>
          {m.managerCopy}
          <button
            onClick={() => navigator.clipboard?.writeText(m.managerCopy)}
            style={{ display: 'block', marginTop: 4, background: 'none', border: 'none', color: '#E23744', fontSize: 11, cursor: 'pointer', padding: 0 }}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

function bubbleStyle(role) {
  const isAI = role === 'assistant';
  return {
    background: isAI ? 'rgba(255,255,255,0.06)' : 'rgba(226,55,68,0.18)',
    color: '#F5F0EB',
    padding: '10px 12px',
    borderRadius: 14,
    margin: '6px 0',
    maxWidth: '85%',
    marginLeft: isAI ? 0 : 'auto',
    marginRight: isAI ? 'auto' : 0,
  };
}

const iconBtn = {
  background: 'none',
  border: 'none',
  color: '#F5F0EB',
  fontSize: 16,
  padding: '6px 8px',
  cursor: 'pointer',
};

const primaryBtn = {
  background: '#E23744',
  color: 'white',
  border: 'none',
  borderRadius: 10,
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const micBtn = (active) => ({
  background: active ? '#E23744' : 'rgba(255,255,255,0.08)',
  color: active ? 'white' : '#F5F0EB',
  border: 'none',
  borderRadius: '50%',
  width: 44,
  height: 44,
  fontSize: 18,
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background 0.15s',
});
