/* calcEngine.js — deterministic, AI-free math engine for the tape calculator.
 *
 * Two layers:
 *   1. evaluate(actions, config)  — runs a list of structured actions on a running
 *      total (adding-machine semantics) and returns step-by-step "work".
 *   2. interpret(text, config)    — parses spoken/typed natural math
 *      ("twelve hundred minus 15% plus tax") into actions, then evaluates.
 *
 * The UI's tap buttons build `actions` directly (no parsing), so the core
 * calculator is exact regardless of speech/typing accuracy. interpret() is the
 * convenience layer for voice + typed natural language, and always returns a
 * human-readable `normalized` string the user can review and edit.
 */

const DEFAULT_TAX_RATE = 9.125;
const LANDING_DIVISOR = 3.3;

const fmtMoney = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

// Trim trailing zeros for plain multipliers/divisors (3.30 -> 3.3, 2.00 -> 2)
const fmtNum = (n) => {
  const r = Math.round(n * 1000) / 1000;
  return String(r);
};

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/** Run structured actions on a running total. Returns { ok, steps, result, error }.
 * Action kinds:
 *   { kind:'start', value }
 *   { kind:'add'|'sub'|'mul'|'div', value }
 *   { kind:'addPct'|'subPct', pct }
 *   { kind:'mulPct'|'divPct', pct }          // "times/divided by N percent"
 *   { kind:'addTax'|'backTax', rate? }       // rate defaults to config.taxRate
 *   { kind:'landing' }                       // divide by 3.3
 *   { kind:'marginPrice', pct }              // cost -> price at pct margin
 */
export function evaluate(actions, config = {}) {
  const taxRate = Number.isFinite(config.taxRate) ? config.taxRate : DEFAULT_TAX_RATE;
  const steps = [];
  let total = 0;
  let started = false;

  for (const a of actions) {
    if (!started) {
      if (a.kind !== 'start') {
        return { ok: false, error: 'Start with a number.', steps, result: 0 };
      }
      total = a.value;
      started = true;
      steps.push({ label: 'Start', total });
      continue;
    }

    const prev = total;
    let delta = null;
    let label = '';

    switch (a.kind) {
      case 'start':
        // A second number with no operator between — treat as replace is wrong; flag it.
        return { ok: false, error: 'Two numbers in a row — add an operator between them.', steps, result: total };
      case 'add':
        total = prev + a.value; delta = a.value; label = `+ ${fmtMoney(a.value)}`; break;
      case 'sub':
        total = prev - a.value; delta = -a.value; label = `− ${fmtMoney(a.value)}`; break;
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

  if (!started) return { ok: false, error: 'Nothing to calculate.', steps, result: 0 };
  return { ok: true, steps, result: total };
}

// ---------------------------------------------------------------------------
// Natural-language / typed parser
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

// Convert a run of number words (and/or digit tokens) into a number.
// Handles: "twelve hundred"=1200, "two thousand five hundred fifty"=2550,
// "ninety nine point nine nine"=99.99. 'and'/'a' are connectors.
function wordsToNumber(words) {
  // Split integer part vs decimal part at 'point'.
  const pointIdx = words.indexOf('point');
  const intWords = pointIdx === -1 ? words : words.slice(0, pointIdx);
  const decWords = pointIdx === -1 ? [] : words.slice(pointIdx + 1);

  let total = 0;
  let current = 0;
  let sawAny = false;

  for (const w of intWords) {
    if (w === 'and' || w === 'a' || w === 'an') continue;
    if (/^\d+(\.\d+)?$/.test(w)) { current += parseFloat(w); sawAny = true; continue; }
    if (w in ONES) { current += ONES[w]; sawAny = true; continue; }
    if (w in TENS) { current += TENS[w]; sawAny = true; continue; }
    if (w === 'hundred') { current = (current || 1) * 100; sawAny = true; continue; }
    if (w === 'thousand') { total += (current || 1) * 1000; current = 0; sawAny = true; continue; }
    if (w === 'million') { total += (current || 1) * 1000000; current = 0; sawAny = true; continue; }
    return null; // non-number word slipped in
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

// Map symbols/synonyms to a canonical word stream.
function normalizeText(text) {
  let t = ' ' + String(text).toLowerCase() + ' ';
  // strip currency + thousands separators (commas between digits)
  t = t.replace(/\$/g, ' ');
  t = t.replace(/(\d),(\d)/g, '$1$2');
  // symbolic operators -> words
  t = t.replace(/%/g, ' percent ');
  t = t.replace(/[×✕]/g, ' times ');
  t = t.replace(/[÷]/g, ' divided by ');
  t = t.replace(/\*/g, ' times ');
  t = t.replace(/\//g, ' divided by ');
  t = t.replace(/\+/g, ' plus ');
  t = t.replace(/(\s)-(\s)/g, '$1 minus $2'); // standalone minus
  t = t.replace(/-/g, ' minus ');
  // multi-word phrases -> single tokens
  t = t.replace(/out the door/g, ' otd ');
  t = t.replace(/multiplied by/g, ' times ');
  t = t.replace(/divided by/g, ' divided ');
  t = t.replace(/\bx\b/g, ' times ');
  t = t.replace(/\bplus\s+tax\b/g, ' addtax ');
  t = t.replace(/\bwith\s+tax\b/g, ' addtax ');
  t = t.replace(/\badd\s+tax\b/g, ' addtax ');
  return t.replace(/\s+/g, ' ').trim();
}

const OP_WORDS = {
  plus: '+', add: '+', and_op: '+', with: '+',
  minus: '-', less: '-', subtract: '-', off: '-',
  times: '*', multiply: '*',
  divided: '/', divide: '/', over: '/',
};

/** Parse natural math into actions. Returns { ok, actions, normalized, error }. */
export function parse(text, config = {}) {
  const taxRate = Number.isFinite(config.taxRate) ? config.taxRate : DEFAULT_TAX_RATE;
  const words = normalizeText(text).split(' ').filter(Boolean);
  if (!words.length) return { ok: false, error: 'Nothing to calculate.', actions: [], normalized: '' };

  // First pass: collapse number-word runs into numeric tokens; keep operators/keywords.
  const tokens = []; // {t:'num',v} | {t:'op',v} | {t:'kw',v} | {t:'percent'}
  let buf = [];
  const flush = () => {
    if (!buf.length) return true;
    const v = wordsToNumber(buf);
    buf = [];
    if (v == null) return false;
    tokens.push({ t: 'num', v });
    return true;
  };

  for (const w of words) {
    // A complete digit number (e.g. "1200", "3.3") stands on its own so that
    // "10 20" is two numbers (an error), while word-numbers like "twenty five"
    // still accumulate into 25.
    if (/^\d+(\.\d+)?$/.test(w)) {
      if (!flush()) return { ok: false, error: 'Could not read a number.', actions: [], normalized: '' };
      tokens.push({ t: 'num', v: parseFloat(w) });
      continue;
    }
    if (isNumberWord(w)) { buf.push(w); continue; }
    if (!flush()) return { ok: false, error: `Didn't understand "${w}".`, actions: [], normalized: '' };
    if (w === 'percent' || w === 'percentage') tokens.push({ t: 'percent' });
    else if (w === 'addtax') tokens.push({ t: 'kw', v: 'tax' });
    else if (w === 'tax') tokens.push({ t: 'kw', v: 'tax' });
    else if (w === 'otd') tokens.push({ t: 'kw', v: 'otd' });
    else if (w === 'landing') tokens.push({ t: 'kw', v: 'landing' });
    else if (w === 'margin') tokens.push({ t: 'kw', v: 'margin' });
    else if (w in OP_WORDS) tokens.push({ t: 'op', v: OP_WORDS[w] });
    else return { ok: false, error: `Didn't understand "${w}".`, actions: [], normalized: '' };
  }
  if (!flush()) return { ok: false, error: 'Could not read a number.', actions: [], normalized: '' };

  // Second pass: fold "<num> percent" into a single percent token.
  const folded = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.t === 'num' && tokens[i + 1] && tokens[i + 1].t === 'percent') {
      folded.push({ t: 'pct', v: tok.v });
      i++;
    } else {
      folded.push(tok);
    }
  }

  // Third pass: reduce to actions (sequential / adding-machine semantics).
  const actions = [];
  const norm = [];
  let pendingOp = null; // '+','-','*','/'
  let i = 0;

  // first meaningful token must be a number (or 'margin'/keyword acting on 0 makes no sense)
  if (folded[0].t !== 'num') {
    return { ok: false, error: 'Start with a number.', actions: [], normalized: '' };
  }
  actions.push({ kind: 'start', value: folded[0].v });
  norm.push(fmtNum(folded[0].v));
  i = 1;

  for (; i < folded.length; i++) {
    const tok = folded[i];
    if (tok.t === 'op') {
      pendingOp = tok.v;
      continue;
    }
    if (tok.t === 'num') {
      if (!pendingOp) {
        return { ok: false, error: `Add an operator before ${fmtNum(tok.v)} (e.g. "plus ${fmtNum(tok.v)}").`, actions: [], normalized: '' };
      }
      const kindMap = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' };
      actions.push({ kind: kindMap[pendingOp], value: tok.v });
      norm.push(`${opSymbol(pendingOp)} ${fmtNum(tok.v)}`);
      pendingOp = null;
      continue;
    }
    if (tok.t === 'pct') {
      const op = pendingOp || '-'; // "1200 15%"? default to discount is risky; require op normally
      if (!pendingOp) {
        return { ok: false, error: `Say an operator before ${fmtNum(tok.v)}% (e.g. "minus ${fmtNum(tok.v)} percent").`, actions: [], normalized: '' };
      }
      const map = { '+': 'addPct', '-': 'subPct', '*': 'mulPct', '/': 'divPct' };
      actions.push({ kind: map[op], pct: tok.v });
      norm.push(`${opSymbol(op)} ${fmtNum(tok.v)}%`);
      pendingOp = null;
      continue;
    }
    if (tok.t === 'kw') {
      if (tok.v === 'tax') { actions.push({ kind: 'addTax', rate: taxRate }); norm.push('+ tax'); pendingOp = null; continue; }
      if (tok.v === 'otd') { actions.push({ kind: 'backTax', rate: taxRate }); norm.push('out-the-door'); pendingOp = null; continue; }
      if (tok.v === 'landing') { actions.push({ kind: 'landing' }); norm.push('landing ÷3.3'); pendingOp = null; continue; }
      if (tok.v === 'margin') {
        // expect following pct or num(+percent already folded)
        const nxt = folded[i + 1];
        if (nxt && nxt.t === 'pct') { actions.push({ kind: 'marginPrice', pct: nxt.v }); norm.push(`at ${fmtNum(nxt.v)}% margin`); i++; pendingOp = null; continue; }
        if (nxt && nxt.t === 'num') { actions.push({ kind: 'marginPrice', pct: nxt.v }); norm.push(`at ${fmtNum(nxt.v)}% margin`); i++; pendingOp = null; continue; }
        return { ok: false, error: 'Say the margin percent, e.g. "margin 50 percent".', actions: [], normalized: '' };
      }
    }
  }

  if (pendingOp) {
    return { ok: false, error: `Missing a number after "${opSymbol(pendingOp)}".`, actions: [], normalized: norm.join(' ') };
  }

  return { ok: true, actions, normalized: norm.join(' ') };
}

function opSymbol(op) {
  return op === '+' ? '+' : op === '-' ? '−' : op === '*' ? '×' : '÷';
}

/** Top-level: parse + evaluate. Returns { ok, normalized, steps, result, error }. */
export function interpret(text, config = {}) {
  const p = parse(text, config);
  if (!p.ok) return { ok: false, normalized: p.normalized || '', steps: [], result: 0, error: p.error };
  const e = evaluate(p.actions, config);
  if (!e.ok) return { ok: false, normalized: p.normalized, steps: e.steps, result: e.result, error: e.error };
  return { ok: true, normalized: p.normalized, steps: e.steps, result: e.result, error: null };
}

export const _internals = { wordsToNumber, normalizeText, parse };
