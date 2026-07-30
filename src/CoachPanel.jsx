import { useEffect, useRef, useState } from 'react';
import { postCoach } from './coachClient.js';
import { dealSnapshot, nextMissingSlot, applyActions, inferGoal } from './dialogueManager.js';
import { sttSupported, ttsSupported, createRecognizer, speak, stopSpeaking } from './voiceIO.js';
import { isOnboarded, markOnboarded } from './onboarding.js';

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

function moneyFmt(n) {
  if (n == null || isNaN(n)) return null;
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default function CoachPanel({
  open,
  onClose,
  calcSnapshot,
  calcRefs,
  onVerdict,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(loadTTS);
  const [kb, setKb] = useState(loadKB);
  const [showKb, setShowKb] = useState(false);
  const seededRef = useRef(false);

  const recognizerRef = useRef(null);
  const transcriptRef = useRef(null);

  // Persist KB
  useEffect(() => {
    try { window.localStorage.setItem(KB_KEY, kb); } catch {}
  }, [kb]);

  useEffect(() => {
    try { window.localStorage.setItem(TTS_KEY, ttsEnabled ? '1' : '0'); } catch {}
  }, [ttsEnabled]);

  // Auto-scroll
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: 999999, behavior: 'smooth' });
  }, [messages, interim]);

  // Stop TTS on close
  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  // First open: send a seed turn so the AI greets and (if first time) onboards.
  useEffect(() => {
    if (!open || seededRef.current) return;
    if (messages.length > 0) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    const firstTime = !isOnboarded();
    sendToAI('', { mode: firstTime ? 'onboarding' : 'capabilities', silent: true });
    if (firstTime) markOnboarded();
    // we send a silent (empty) turn so the AI speaks first
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sendToAI = async (userText, opts = {}) => {
    const { mode: forcedMode, silent } = opts;
    const goal = inferGoal(calcSnapshot);
    const slot = nextMissingSlot(calcSnapshot);
    const turnText = userText && userText.trim();
    const newMessages = silent
      ? [...messages]
      : [...messages, { role: 'user', text: turnText }];
    if (!silent) setMessages(newMessages);

    setBusy(true);
    setCollapsed(false);

    const resp = await postCoach({
      messages: silent ? [{ role: 'user', text: '(start)' }] : newMessages,
      dealState: calcSnapshot,
      knowledgeBase: kb,
      mode: forcedMode || goal,
      nextMissingSlot: slot,
    });

    setBusy(false);

    let didApply = false;
    if (resp.actions && Array.isArray(resp.actions)) {
      didApply = applyActions(resp.actions, calcRefs);
    }

    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        text: resp.reply,
        verdict: resp.verdict,
        usedEstimate: resp.usedEstimate,
        managerCopy: resp.managerCopy,
        applied: didApply,
        finishReason: resp.finishReason,
      },
    ]);
    if (ttsEnabled && resp.tts) speak(resp.tts);
    if (resp.reply) onVerdict?.({ text: resp.reply, verdict: resp.verdict });

    // Auto-collapse so calculator is visible while rep digests the reply.
    // Not when we're offline: that message needs to be read in full.
    if (!resp.offline) setTimeout(() => setCollapsed(true), 300);
  };

  const handleSubmit = (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed || busy) return;
    setInput('');
    setInterim('');
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
    try { recognizerRef.current?.stop(); } catch {}
  };

  const toggleMic = () => (listening ? stopListening() : startListening());

  const askWhy = () => {
    if (busy) return;
    sendToAI('Explain that in one or two sentences - why?');
  };

  const askCapabilities = () => {
    if (busy) return;
    sendToAI('What can you do?', { mode: 'capabilities' });
  };

  if (!open) return null;

  // Pull a few status chips from the live calculator state to show inline.
  const margin = calcSnapshot?.overallMargin;
  const customer = calcSnapshot?.customerTotal;
  const item0 = calcSnapshot?.items?.[0];
  const chips = [];
  if (item0?.name) chips.push(item0.name);
  if (item0?.price) chips.push(`$${item0.price}`);
  if (margin != null) chips.push(`Margin ${Math.round(margin)}%`);
  if (customer != null) chips.push(`Total ${moneyFmt(customer)}`);

  const lastAi = [...messages].reverse().find((m) => m.role === 'assistant');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: collapsed ? 'transparent' : 'rgba(0,0,0,0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        pointerEvents: collapsed ? 'none' : 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: collapsed ? 88 : '85vh',
          minHeight: collapsed ? 64 : 360,
          background: '#161920',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          color: '#F5F0EB',
          fontFamily: '"Sora", -apple-system, sans-serif',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
          pointerEvents: 'auto',
          transition: 'max-height 0.2s ease, min-height 0.2s ease',
          boxShadow: '0 -10px 30px rgba(0,0,0,0.4)',
        }}
      >
        {collapsed && lastAi ? (
          <div
            onClick={() => setCollapsed(false)}
            style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          >
            <VerdictDot verdict={lastAi.verdict} />
            {/* Wraps instead of truncating — a half-sentence tells nobody anything. */}
            <div style={{ flex: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
              {lastAi.text}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setCollapsed(false); }}
              aria-label="Open the coach back up"
              style={labelledIconBtn}
            >
              <span aria-hidden style={{ fontSize: 18 }}>▲</span>
              <span style={iconBtnLabel}>Open</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              aria-label="Close the coach"
              style={labelledIconBtn}
            >
              <span aria-hidden style={{ fontSize: 18 }}>✕</span>
              <span style={iconBtnLabel}>Close</span>
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 19, fontWeight: 700 }}>AI Sales Coach</div>
                <div style={{ fontSize: 14, color: '#C9D0DE' }}>
                  {busy
                    ? 'Thinking…'
                    : listening
                      ? 'Listening — go ahead and talk.'
                      : 'Ask me about a deal. I can fill in the calculator for you.'}
                </div>
              </div>
              {ttsSupported && (
                <button
                  onClick={() => { stopSpeaking(); setTtsEnabled((v) => !v); }}
                  aria-label={ttsEnabled ? 'Turn the spoken voice off' : 'Turn the spoken voice on'}
                  style={labelledIconBtn}
                >
                  <span aria-hidden style={{ fontSize: 18 }}>{ttsEnabled ? '🔊' : '🔇'}</span>
                  <span style={iconBtnLabel}>{ttsEnabled ? 'Voice on' : 'Voice off'}</span>
                </button>
              )}
              <button
                onClick={() => setShowKb((v) => !v)}
                aria-label="Store notes the coach reads — promos, financing, manager scripts"
                style={labelledIconBtn}
              >
                <span aria-hidden style={{ fontSize: 18 }}>📚</span>
                <span style={iconBtnLabel}>Notes</span>
              </button>
              <button onClick={() => setCollapsed(true)} aria-label="Shrink this panel" style={labelledIconBtn}>
                <span aria-hidden style={{ fontSize: 18 }}>▼</span>
                <span style={iconBtnLabel}>Hide</span>
              </button>
              <button onClick={onClose} aria-label="Close the coach" style={labelledIconBtn}>
                <span aria-hidden style={{ fontSize: 18 }}>✕</span>
                <span style={iconBtnLabel}>Close</span>
              </button>
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
                {chips.length > 0 && (
                  <div style={{ padding: '8px 12px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {chips.map((c, i) => (
                      <span key={i} style={chipStyle}>{c}</span>
                    ))}
                  </div>
                )}

                <div ref={transcriptRef} style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
                  {messages.map((m, i) => <Message key={i} m={m} />)}

                  {/* Shown until the user has actually asked something. The panel
                      is seeded with a greeting on open, so keying this off an
                      empty transcript would mean it never appeared. */}
                  {!messages.some((m) => m.role === 'user') && !busy && (
                    <div style={{ color: '#C9D0DE', fontSize: 15, padding: 12, lineHeight: 1.5 }}>
                      <div style={{ color: '#F5F0EB', fontWeight: 700, fontSize: 17, marginBottom: 6 }}>
                        What this does
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        Describe a deal out loud (tap the <strong>🎤 Talk</strong> button)
                        or type it below. I'll work out the numbers and fill in the
                        calculator for you.
                      </div>
                      <div style={{ color: '#F5F0EB', fontWeight: 700, marginBottom: 6 }}>
                        Tap one to try it:
                      </div>
                      {[
                        'Sofa for nineteen ninety-nine, what\'s my margin?',
                        'Customer wants two grand out the door on a sectional.',
                        'What\'s the lowest I can go on this?',
                      ].map((ex) => (
                        <button
                          key={ex}
                          onClick={() => handleSubmit(ex)}
                          style={{
                            ...secondaryBtn,
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            marginBottom: 8,
                            fontSize: 15,
                            padding: '12px 14px',
                            lineHeight: 1.35,
                          }}
                        >
                          "{ex}"
                        </button>
                      ))}
                      <button
                        onClick={askCapabilities}
                        style={{ ...secondaryBtn, marginTop: 8, fontSize: 15, padding: '14px', minHeight: 48, width: '100%', textAlign: 'left' }}
                      >
                        What else can you do?
                      </button>
                    </div>
                  )}
                  {interim && <div style={{ ...bubbleStyle('user'), opacity: 0.5 }}>{interim}…</div>}
                  {busy && <div style={{ ...bubbleStyle('assistant'), opacity: 0.6 }}>…</div>}
                </div>

                <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  {sttSupported ? (
                    <button
                      onClick={toggleMic}
                      style={micBtn(listening)}
                      aria-label={listening ? 'Stop listening' : 'Tap to talk to the coach'}
                    >
                      <span aria-hidden style={{ fontSize: 18 }}>{listening ? '■' : '🎤'}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
                        {listening ? 'Stop' : 'Talk'}
                      </span>
                    </button>
                  ) : (
                    <div style={{ fontSize: 13, color: '#C9D0DE', padding: '0 8px' }}>
                      Voice isn't available on this phone — type your question instead.
                    </div>
                  )}
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit(input)}
                    placeholder="Type your question…"
                    aria-label="Type your question for the coach"
                    style={{
                      flex: 1,
                      background: '#0F1117',
                      color: '#F5F0EB',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      fontSize: 16,
                      minHeight: 48,
                      minWidth: 0,
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={() => handleSubmit(input)}
                    style={{ ...primaryBtn, minHeight: 48, fontSize: 16 }}
                    disabled={busy || !input.trim()}
                  >
                    Send
                  </button>
                  <button
                    onClick={askWhy}
                    style={{ ...secondaryBtn, minHeight: 48, fontSize: 14, flexShrink: 0 }}
                    aria-label="Ask the coach to explain its last answer in more detail"
                  >
                    Explain
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VerdictDot({ verdict }) {
  const color =
    verdict === 'GREAT' ? '#34D399' :
    verdict === 'OK' ? '#FBBF24' :
    verdict === 'BELOW_FLOOR' ? '#F87171' :
    '#8B91A0';
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: color, flexShrink: 0 }} />;
}

function Message({ m }) {
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
      {m.applied && <div style={{ fontSize: 11, color: '#34D399', marginTop: 4 }}>✓ updated calculator</div>}
      {m.usedEstimate && <div style={{ fontSize: 11, color: '#FBBF24', marginTop: 4 }}>↳ estimated cost - verify before close</div>}
      {m.finishReason === 'MAX_TOKENS' && (
        <div style={{ fontSize: 11, color: '#F87171', marginTop: 4 }}>(reply was truncated)</div>
      )}
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

const chipStyle = {
  background: 'rgba(255,255,255,0.06)',
  color: '#F5F0EB',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 999,
  padding: '6px 12px',
  fontSize: 14,
  fontWeight: 600,
};

const iconBtn = {
  background: 'none',
  border: 'none',
  color: '#F5F0EB',
  fontSize: 16,
  padding: '6px 8px',
  cursor: 'pointer',
};

// Icon plus a word underneath — no control in the coach is icon-only.
const labelledIconBtn = {
  background: 'none',
  border: 'none',
  color: '#F5F0EB',
  padding: '4px 6px',
  minWidth: 48,
  minHeight: 48,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  fontFamily: 'inherit',
};

const iconBtnLabel = {
  fontSize: 14,
  fontWeight: 600,
  color: '#C9D0DE',
  lineHeight: 1,
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

const secondaryBtn = {
  background: 'rgba(255,255,255,0.06)',
  color: '#F5F0EB',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const micBtn = (active) => ({
  background: active ? '#E23744' : 'rgba(255,255,255,0.08)',
  color: active ? 'white' : '#F5F0EB',
  border: active ? 'none' : '1px solid rgba(255,255,255,0.18)',
  borderRadius: 12,
  width: 56,
  minHeight: 48,
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background 0.15s',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  fontFamily: 'inherit',
});
