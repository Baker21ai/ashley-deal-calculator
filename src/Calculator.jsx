import { useState, useMemo, useRef, useEffect } from 'react';
import { evaluate, parse } from './calcEngine.js';
import { sttSupported, createRecognizer } from './voiceIO.js';

const formatMoney = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

// Build the action that a pending operator + operand represents.
const OP_ACTION = {
  '+': (v) => ({ kind: 'add', value: v }),
  '-': (v) => ({ kind: 'sub', value: v }),
  '*': (v) => ({ kind: 'mul', value: v }),
  '/': (v) => ({ kind: 'div', value: v }),
  '-%': (v) => ({ kind: 'subPct', pct: v }),
  'margin': (v) => ({ kind: 'marginPrice', pct: v }),
};
const OP_LABEL = { '+': '+', '-': '−', '*': '×', '/': '÷', '-%': '− %', 'margin': 'margin %' };

// Fold an in-progress entry onto the committed actions (display + commit helper).
function withEntry(actions, op, entry) {
  if (entry === '' || entry === '.' || entry === '-') return actions;
  const v = parseFloat(entry);
  if (!Number.isFinite(v)) return actions;
  if (actions.length === 0) return [{ kind: 'start', value: v }];
  return [...actions, (OP_ACTION[op] || OP_ACTION['+'])(v)];
}

export default function Calculator({ taxRate = 9.125, onClose, onUsePrice, onUseLanding }) {
  const [actions, setActions] = useState([]);
  const [entry, setEntry] = useState('');
  const [op, setOp] = useState(null);
  const [nl, setNl] = useState('');
  const [nlEcho, setNlEcho] = useState(null);
  const [nlError, setNlError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const cfg = { taxRate };

  // Live evaluation reflects what's currently typed.
  const live = useMemo(() => withEntry(actions, op, entry), [actions, op, entry]);
  const ev = useMemo(() => (live.length ? evaluate(live, cfg) : { ok: true, steps: [], result: 0 }), [live, taxRate]);
  const result = ev.result;
  const hasContent = live.length > 0;

  const pressDigit = (d) => { setNlError(null); setNlEcho(null); setEntry((e) => (e === '0' ? d : e + d)); };
  const pressDot = () => setEntry((e) => (e.includes('.') ? e : (e === '' ? '0.' : e + '.')));

  const pressOp = (o) => {
    setActions(withEntry(actions, op, entry));
    setEntry('');
    setOp(o);
    setNlError(null);
  };

  const applyUnary = (action) => {
    const base = withEntry(actions, op, entry);
    if (!base.length) return; // need a number first
    setActions([...base, action]);
    setEntry('');
    setOp(null);
    setNlError(null);
  };

  const pressEquals = () => {
    setActions(withEntry(actions, op, entry));
    setEntry('');
    setOp(null);
  };

  const backspace = () => {
    if (entry) setEntry((e) => e.slice(0, -1));
    else { setActions((a) => a.slice(0, -1)); setOp(null); }
  };

  const clearAll = () => { setActions([]); setEntry(''); setOp(null); setNlError(null); setNlEcho(null); setNl(''); };

  const runText = (text) => {
    const t = (text || '').trim();
    if (!t) return;
    const p = parse(t, cfg);
    if (!p.ok) { setNlError(p.error); setNlEcho(null); return; }
    const check = evaluate(p.actions, cfg);
    if (!check.ok) { setNlError(check.error); setNlEcho(null); return; }
    setActions(p.actions);
    setEntry('');
    setOp(null);
    setNlError(null);
    setNlEcho(p.normalized);
  };
  const runNL = () => runText(nl);

  // Voice: transcribe with the browser's speech API, then parse deterministically.
  // The transcript lands in the editable field so a misheard number can be fixed.
  const toggleMic = () => {
    if (listening) { try { recRef.current?.stop(); } catch { /* noop */ } return; }
    const rec = createRecognizer({
      onResult: ({ final, interim }) => setNl([final, interim].filter(Boolean).join(' ').trim()),
      onEnd: (finalText) => {
        setListening(false);
        if (finalText) { setNl(finalText); runText(finalText); }
      },
      onError: (err) => {
        setListening(false);
        if (err !== 'no-speech' && err !== 'aborted') setNlError(`Mic: ${err}`);
      },
    });
    if (!rec) { setNlError('Voice input is not supported on this browser.'); return; }
    recRef.current = rec;
    setNlError(null);
    setNl('');
    try { rec.start(); setListening(true); } catch { setListening(false); }
  };

  // Stop the mic if the calculator unmounts mid-listen.
  useEffect(() => () => { try { recRef.current?.abort?.(); } catch { /* noop */ } }, []);

  const copyTape = () => {
    if (!ev.steps.length) return;
    const lines = ev.steps.map((s) => `${s.label}  =  ${formatMoney(s.total)}`);
    lines.push(`TOTAL  ${formatMoney(result)}`);
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const Key = ({ label, onClick, cls = '' }) => (
    <button className={`calc-key ${cls}`} onClick={onClick}>{label}</button>
  );

  return (
    <div className="calc-overlay" onClick={onClose}>
      <div className="calc-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <div className="sheet-title">Calculator</div>
          <button className="sheet-close" onClick={onClose}>Close</button>
        </div>

        <div className="calc-body">
          {/* Type-or-speak natural math */}
          <div className="calc-nl">
            <input
              className="calc-nl-input"
              type="text"
              placeholder="Type or say: couch 1001, loveseat 500, +tax"
              value={nl}
              onChange={(e) => { setNl(e.target.value); setNlError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') runNL(); }}
              aria-label="Type a math expression"
            />
            {sttSupported && (
              <button
                className={`calc-mic ${listening ? 'listening' : ''}`}
                onClick={toggleMic}
                aria-label={listening ? 'Stop listening' : 'Speak the math'}
                title={listening ? 'Stop' : 'Speak the math'}
              >
                {listening ? '■' : '🎤'}
              </button>
            )}
            <button className="calc-nl-go" onClick={runNL} disabled={!nl.trim()}>Go</button>
          </div>
          {listening && (
            <div className="calc-listening">🎙️ Listening… e.g. “couch ten ninety nine, loveseat five hundred, plus tax”</div>
          )}
          {nlError && <div className="calc-nl-error">⚠ {nlError}</div>}
          {nlEcho && !nlError && <div className="calc-nl-echo">Read as: {nlEcho}</div>}

          {/* Work tape */}
          <div className="calc-tape" role="log" aria-live="polite">
            {ev.steps.length === 0 ? (
              <div className="calc-tape-empty">Enter a number, or type/say the math above.</div>
            ) : (
              ev.steps.map((s, i) => (
                <div key={i} className="calc-step">
                  <span className="calc-step-label">{s.label}</span>
                  <span className="calc-step-total">{formatMoney(s.total)}</span>
                </div>
              ))
            )}
          </div>

          {/* Result + pending op */}
          <div className="calc-result-row">
            <div className="calc-pending">{op ? OP_LABEL[op] : ''} {entry}</div>
            <div className="calc-result">{ev.ok ? formatMoney(result) : '—'}</div>
          </div>

          {/* Push into the deal / copy */}
          <div className="calc-use">
            <button className="calc-use-btn" onClick={() => onUsePrice && onUsePrice(result)} disabled={!hasContent || !ev.ok}>Use as price</button>
            <button className="calc-use-btn" onClick={() => onUseLanding && onUseLanding(result)} disabled={!hasContent || !ev.ok}>Use as landing</button>
            <button className="calc-use-btn ghost" onClick={copyTape} disabled={!ev.steps.length}>{copied ? '✓ Copied' : 'Copy'}</button>
          </div>

          {/* Domain shortcuts */}
          <div className="calc-domain">
            <button className="calc-domain-btn" onClick={() => applyUnary({ kind: 'addTax', rate: taxRate })}>+ Tax</button>
            <button className={`calc-domain-btn ${op === '-%' ? 'active' : ''}`} onClick={() => pressOp('-%')}>− %</button>
            <button className="calc-domain-btn" onClick={() => applyUnary({ kind: 'landing' })}>÷ 3.3</button>
            <button className="calc-domain-btn" onClick={() => applyUnary({ kind: 'backTax', rate: taxRate })}>OTD</button>
            <button className={`calc-domain-btn ${op === 'margin' ? 'active' : ''}`} onClick={() => pressOp('margin')}>Margin %</button>
          </div>

          {/* Keypad */}
          <div className="calc-keys">
            <Key label="7" onClick={() => pressDigit('7')} />
            <Key label="8" onClick={() => pressDigit('8')} />
            <Key label="9" onClick={() => pressDigit('9')} />
            <Key label="÷" cls={`op ${op === '/' ? 'active' : ''}`} onClick={() => pressOp('/')} />
            <Key label="4" onClick={() => pressDigit('4')} />
            <Key label="5" onClick={() => pressDigit('5')} />
            <Key label="6" onClick={() => pressDigit('6')} />
            <Key label="×" cls={`op ${op === '*' ? 'active' : ''}`} onClick={() => pressOp('*')} />
            <Key label="1" onClick={() => pressDigit('1')} />
            <Key label="2" onClick={() => pressDigit('2')} />
            <Key label="3" onClick={() => pressDigit('3')} />
            <Key label="−" cls={`op ${op === '-' ? 'active' : ''}`} onClick={() => pressOp('-')} />
            <Key label="." onClick={pressDot} />
            <Key label="0" onClick={() => pressDigit('0')} />
            <Key label="⌫" onClick={backspace} />
            <Key label="+" cls={`op ${op === '+' ? 'active' : ''}`} onClick={() => pressOp('+')} />
            <Key label="C" cls="wide" onClick={clearAll} />
            <Key label="=" cls="equals" onClick={pressEquals} />
          </div>

          <div className="calc-hint">Adding-machine style: each line applies to the running total, left to right.</div>
        </div>
      </div>
    </div>
  );
}
