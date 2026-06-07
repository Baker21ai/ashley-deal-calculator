/* calcEngine.js — deterministic, AI-free math engine for the tape calculator.
 *
 * Design follows established natural-language calculators (Soulver / Numi):
 * parse text deterministically, IGNORE words that aren't math (treat them as
 * labels/comments), extract the numbers + operators, and compute. Numbers with
 * no operator between them are summed, receipt-style, so
 * "couch 1001, loveseat 500" = 1501. No AI, no eval(), fully offline.
 *
 * Two layers:
 *   1. evaluate(actions, config)  — runs structured actions on a running total
 *      (adding-machine semantics) and returns step-by-step, labeled "work".
 *   2. interpret(text, config)    — parses spoken/typed natural math into
 *      actions, then evaluates. Always returns a `normalized` echo string the
 *      user can review and edit (the safety net for speech mis-hears).
 *
 * The UI tap buttons build `actions` directly (no parsing), so the core
 * calculator is exact regardless of speech/typing accuracy.
 */

const DEFAULT_TAX_RATE = 9.125;
const LANDING_DIVISOR = 3.3;

const fmtMoney = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const fmtNum = (n) => String(Math.round(n * 1000) / 1000); // 3.30 -> 3.3
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/** Run structured actions on a running total. Returns { ok, steps, result, error }.
 * Action kinds:
 *   { kind:'start', value, label? }
 *   { kind:'add'|'sub'|'mul'|'div', value, label? }
 *   { kind:'addPct'|'subPct'|'mulPct'|'divPct', pct }
 *   { kind:'addTax'|'backTax', rate? }   { kind:'landing' }   { kind:'marginPrice', pct }
 */
export function evaluate(actions, config = {}) {
  const taxRate = Number.isFinite(config.taxRate) ? config.taxRate : DEFAULT_TAX_RATE;
  const steps = [];
  let total = 0;
  let started = false;

  for (const a of actions) {
    if (!started) {
      if (a.kind !== 'start') return { ok: false, error: 'Start with a number.', steps, result: 0 };
      total = a.value;
      started = true;
      steps.push({ label: a.label ? cap(a.label) : 'Start', total });
      continue;
    }

    const prev = total;
    let delta = null;
    let label = '';

    switch (a.kind) {
      case 'start':
        return { ok: false, error: 'Two starts — internal error.', steps, result: total };
      case 'add':
        total = prev + a.value; delta = a.value;
        label = a.label ? `+ ${cap(a.label)} (${fmtMoney(a.value)})` : `+ ${fmtMoney(a.value)}`; break;
      case 'sub':
        total = prev - a.value; delta = -a.value;
        label = a.label ? `− ${cap(a.label)} (${fmtMoney(a.value)})` : `− ${fmtMoney(a.value)}`; break;
      case 'mul':
        total = prev * a.value; label = `× ${fmtNum(a.value)}`; break;
      case 'div':
        if (a.value === 0) return { ok: false, error: "Can't divide by zero.", steps, result: prev };
        total = prev / a.value; label = `÷ ${fmtNum(a.value)}`; break;
      case 'addPct': {
        const amt = prev * (a.pct / 100); total = prev + amt; delta = amt;
        label = `+ ${fmtNum(a.pct)}% (${fmtMoney(amt)})`; break;
      }
      case 'subPct': {
        const amt = prev * (a.pct / 100); total = prev - amt; delta = -amt;
        label = `− ${fmtNum(a.pct)}% (${fmtMoney(amt)})`; break;
      }
      case 'mulPct':
        total = prev * (a.pct / 100); label = `× ${fmtNum(a.pct)}%`; break;
      case 'divPct':
        if (a.pct === 0) return { ok: false, error: "Can't divide by zero.", steps, result: prev };
        total = prev / (a.pct / 100); label = `÷ ${fmtNum(a.pct)}%`; break;
      case 'addTax': {
        const rate = Number.isFinite(a.rate) ? a.rate : taxRate;
        const amt = prev * (rate / 100); total = prev + amt; delta = amt;
        label = `+ tax ${fmtNum(rate)}% (${fmtMoney(amt)})`; break;
      }
      case 'backTax': {
        const rate = Number.isFinite(a.rate) ? a.rate : taxRate;
        total = prev / (1 + rate / 100); delta = total - prev;
        label = `back out tax ${fmtNum(rate)}% (${fmtMoney(delta)})`; break;
      }
      case 'landing':
        total = prev / LANDING_DIVISOR; label = `÷ ${LANDING_DIVISOR} (landing est.)`; break;
      case 'marginPrice': {
        if (a.pct >= 100) return { ok: false, error: 'Margin must be under 100%.', steps, result: prev };
        total = prev / (1 - a.pct / 100); delta = total - prev;
        label = `price for ${fmtNum(a.pct)}% margin`; break;
      }
      default:
        return { ok: false, error: `Unknown operation: ${a.kind}`, steps, result: prev };
    }
    steps.push({ label, delta, total });
  }

  if (!started) return { ok: false, error: 'Enter a number or some math.', steps, result: 0 };
  return { ok: true, steps, result: total };
}

// ---------------------------------------------------------------------------
// Natural-language / typed parser (forgiving — ignores non-math words)
// ---------------------------------------------------------------------------

const ONES = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { hundred: 100, thousand: 1000, million: 1000000 };

const isNumberWord = (w) =>
  w in ONES || w in TENS || w in SCALES || w === 'point' || w === 'and' || w === 'a';

// Convert a run of number words into a number. "twelve hundred"=1200,
// "two thousand five hundred fifty"=2550, "ninety nine point nine nine"=99.99.
function wordsToNumber(words) {
  const pointIdx = words.indexOf('point');
  const intWords = pointIdx === -1 ? words : words.slice(0, pointIdx);
  const decWords = pointIdx === -1 ? [] : words.slice(pointIdx + 1);

  let total = 0, current = 0, sawAny = false;
  for (const w of intWords) {
    if (w === 'and' || w === 'a' || w === 'an') continue;
    if (/^\d+(\.\d+)?$/.test(w)) { current += parseFloat(w); sawAny = true; continue; }
    if (w in ONES) { current += ONES[w]; sawAny = true; continue; }
    if (w in TENS) { current += TENS[w]; sawAny = true; continue; }
    if (w === 'hundred') { current = (current || 1) * 100; sawAny = true; continue; }
    if (w === 'thousand') { total += (current || 1) * 1000; current = 0; sawAny = true; continue; }
    if (w === 'million') { total += (current || 1) * 1000000; current = 0; sawAny = true; continue; }
    return null;
  }
  let value = total + current;

  if (decWords.length) {
    let dec = '';
    for (const w of decWords) {
      if (/^\d+$/.test(w)) dec += w;
      else if (w in ONES && ONES[w] <= 9) dec += String(ONES[w]);
      else if (w === 'and' || w === 'a') continue;
      else break;
    }
    if (dec) value = parseFloat(`${value}.${dec}`);
    sawAny = true;
  }
  return sawAny ? value : null;
}

// Map symbols/synonyms to a canonical word stream, then strip stray punctuation.
function normalizeText(text) {
  let t = ' ' + String(text).toLowerCase() + ' ';
  t = t.replace(/\$/g, ' ');                 // currency sign
  t = t.replace(/(?<=\d),(?=\d)/g, '');      // thousands separators: 1,234 -> 1234
  t = t.replace(/\.(?!\d)/g, ' ');           // sentence dots, keep decimals (3.3)
  t = t.replace(/%/g, ' percent ');
  t = t.replace(/[×✕]/g, ' times ');
  t = t.replace(/[÷]/g, ' divided by ');
  t = t.replace(/\*/g, ' times ');
  t = t.replace(/\//g, ' divided by ');
  t = t.replace(/\+/g, ' plus ');
  t = t.replace(/-/g, ' minus ');
  // multi-word phrases -> single tokens (before single-word ops)
  t = t.replace(/out the door/g, ' otd ');
  t = t.replace(/multiplied by/g, ' times ');
  t = t.replace(/divided by/g, ' divided ');
  t = t.replace(/\bx\b/g, ' times ');
  t = t.replace(/\b(plus|with|add|including|include|and)\s+tax\b/g, ' addtax ');
  // remove anything left that isn't a letter, digit, dot or space
  t = t.replace(/[^a-z0-9.\s]/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

const OP_WORDS = {
  plus: '+', add: '+', with: '+',
  minus: '-', less: '-', subtract: '-', off: '-',
  times: '*', multiply: '*',
  divided: '/', divide: '/', over: '/',
};
// Words that are math keywords (so they're never treated as labels).
const RESERVED = new Set([
  ...Object.keys(OP_WORDS), 'percent', 'percentage', 'addtax', 'tax', 'otd',
  'landing', 'margin', 'of', 'point',
]);

const opSymbol = (op) => (op === '+' ? '+' : op === '-' ? '−' : op === '*' ? '×' : '÷');

/** Parse natural math into actions. Forgiving: unknown words become labels. */
export function parse(text, config = {}) {
  const taxRate = Number.isFinite(config.taxRate) ? config.taxRate : DEFAULT_TAX_RATE;
  const words = normalizeText(text).split(' ').filter(Boolean);
  if (!words.length) return { ok: false, error: 'Enter a number or some math.', actions: [], normalized: '' };

  // Pass 1: tokens. Number words accumulate; unknown words become the pending label
  // that attaches to the next number (Soulver-style "couch 1001").
  const tokens = [];
  let buf = [];
  let label = [];
  const flushNum = () => {
    if (!buf.length) return;
    const v = wordsToNumber(buf);
    buf = [];
    if (v == null) return; // e.g. a stray 'and' on its own — drop it
    tokens.push({ t: 'num', v, label: label.join(' ').trim() });
    label = [];
  };

  for (const w of words) {
    if (/^\d+(\.\d+)?$/.test(w)) {
      flushNum();
      tokens.push({ t: 'num', v: parseFloat(w), label: label.join(' ').trim() });
      label = [];
      continue;
    }
    if (isNumberWord(w)) { buf.push(w); continue; }
    flushNum();
    if (w === 'percent' || w === 'percentage') tokens.push({ t: 'percent' });
    else if (w === 'addtax' || w === 'tax') tokens.push({ t: 'kw', v: 'tax' });
    else if (w === 'otd') tokens.push({ t: 'kw', v: 'otd' });
    else if (w === 'landing') tokens.push({ t: 'kw', v: 'landing' });
    else if (w === 'margin') tokens.push({ t: 'kw', v: 'margin' });
    else if (w === 'of') tokens.push({ t: 'of' });
    else if (w in OP_WORDS) tokens.push({ t: 'op', v: OP_WORDS[w] });
    else if (!RESERVED.has(w)) label.push(w); // unknown word -> label, never an error
  }
  flushNum();

  // Pass 2: fold "<num> percent" into a single percent token (carry the label).
  const folded = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.t === 'num' && tokens[i + 1] && tokens[i + 1].t === 'percent') {
      folded.push({ t: 'pct', v: tok.v, label: tok.label });
      i++;
    } else {
      folded.push(tok);
    }
  }

  // Pass 2b: quantity detection. A bare small integer immediately before a
  // *labeled* number (no operator between) is a quantity: "one couch 1001",
  // "two chairs 200" => qty x price. A leading label ("couch 5") is NOT a qty.
  const merged = [];
  for (let i = 0; i < folded.length; i++) {
    const a = folded[i];
    const b = folded[i + 1];
    if (
      a && a.t === 'num' && !a.label &&
      Number.isInteger(a.v) && a.v > 0 && a.v < 100 &&
      b && b.t === 'num' && b.label
    ) {
      merged.push({ t: 'num', v: a.v * b.v, label: b.label });
      i++; // consume the price token
    } else {
      merged.push(a);
    }
  }
  const reduced = merged;

  // Pass 3: reduce to actions (sequential adding-machine; missing operator => add).
  const firstNumIdx = reduced.findIndex((t) => t.t === 'num');
  if (firstNumIdx === -1) {
    return { ok: false, error: 'No number found.', actions: [], normalized: '' };
  }
  const actions = [];
  const norm = [];
  const start = reduced[firstNumIdx];
  actions.push({ kind: 'start', value: start.v, label: start.label });
  norm.push(start.label ? `${start.label} ${fmtNum(start.v)}` : fmtNum(start.v));

  let pendingOp = null;
  for (let i = firstNumIdx + 1; i < reduced.length; i++) {
    const tok = reduced[i];
    if (tok.t === 'op') { pendingOp = tok.v; continue; }
    if (tok.t === 'of') { continue; } // "% of" handled implicitly; just a connector

    if (tok.t === 'num') {
      const op = pendingOp || '+'; // no operator between numbers => sum (receipt)
      const kindMap = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' };
      actions.push({ kind: kindMap[op], value: tok.v, label: tok.label });
      norm.push(`${opSymbol(op)} ${tok.label ? tok.label + ' ' : ''}${fmtNum(tok.v)}`);
      pendingOp = null;
      continue;
    }
    if (tok.t === 'pct') {
      const op = pendingOp || '-'; // bare percent (no operator) => discount, common in retail
      const map = { '+': 'addPct', '-': 'subPct', '*': 'mulPct', '/': 'divPct' };
      actions.push({ kind: map[op], pct: tok.v });
      norm.push(`${opSymbol(op)} ${fmtNum(tok.v)}%`);
      pendingOp = null;
      continue;
    }
    if (tok.t === 'kw') {
      if (tok.v === 'tax') { actions.push({ kind: 'addTax', rate: taxRate }); norm.push('+ tax'); }
      else if (tok.v === 'otd') { actions.push({ kind: 'backTax', rate: taxRate }); norm.push('out-the-door'); }
      else if (tok.v === 'landing') { actions.push({ kind: 'landing' }); norm.push('landing ÷3.3'); }
      else if (tok.v === 'margin') {
        const nxt = reduced[i + 1];
        if (nxt && (nxt.t === 'pct' || nxt.t === 'num')) {
          actions.push({ kind: 'marginPrice', pct: nxt.v });
          norm.push(`at ${fmtNum(nxt.v)}% margin`);
          i++;
        }
        // a lone "margin" with no number is ignored, not an error
      }
      pendingOp = null;
    }
  }

  return { ok: true, actions, normalized: norm.join(' ') };
}

/** Top-level: parse + evaluate. */
export function interpret(text, config = {}) {
  const p = parse(text, config);
  if (!p.ok) return { ok: false, normalized: p.normalized || '', steps: [], result: 0, error: p.error };
  const e = evaluate(p.actions, config);
  if (!e.ok) return { ok: false, normalized: p.normalized, steps: e.steps, result: e.result, error: e.error };
  return { ok: true, normalized: p.normalized, steps: e.steps, result: e.result, error: null };
}

export const _internals = { wordsToNumber, normalizeText, parse };
