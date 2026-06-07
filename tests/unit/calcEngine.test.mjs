import { interpret, evaluate, _internals } from '../../src/calcEngine.js';
const { wordsToNumber, normalizeText, parse } = _internals;

let pass = 0, fail = 0;
const approx = (a, b) => Math.abs(a - b) < 0.005;
function t(desc, got, want) {
  const ok = (typeof want === 'number') ? approx(got, want) : got === want;
  if (ok) { pass++; } else { fail++; console.log(`FAIL: ${desc}\n   got:  ${got}\n   want: ${want}`); }
}

// --- wordsToNumber ---
t('twelve hundred', wordsToNumber(['twelve','hundred']), 1200);
t('two thousand five hundred fifty', wordsToNumber(['two','thousand','five','hundred','fifty']), 2550);
t('one hundred twenty three', wordsToNumber(['one','hundred','twenty','three']), 123);
t('ninety nine point nine nine', wordsToNumber(['ninety','nine','point','nine','nine']), 99.99);
t('two thousand and fifty', wordsToNumber(['two','thousand','and','fifty']), 2050);
t('digit token 1200', wordsToNumber(['1200']), 1200);
t('a hundred', wordsToNumber(['a','hundred']), 100);
t('three point three', wordsToNumber(['three','point','three']), 3.3);

// --- interpret end-to-end (default tax 9.125) ---
const cfg = { taxRate: 9.125 };
function res(s) { const r = interpret(s, cfg); if (!r.ok) { console.log(`  (interpret not ok for "${s}": ${r.error})`); } return r; }

t('1200 - 15% + tax (result)', res('twelve hundred minus fifteen percent plus tax').result, 1020 * 1.09125);
t('1200 - 15% + tax (normalized)', res('twelve hundred minus fifteen percent plus tax').normalized, '1200 − 15% + tax');
t('typed 1200+tax', res('1200+tax').result, 1200 * 1.09125);
t('typed 1200 - 10%', res('1200 - 10%').result, 1080);
t('500 times 3', res('500 times 3').result, 1500);
t('1000 divided by 4', res('1000 divided by 4').result, 250);
t('100 plus 50 plus 25', res('100 plus 50 plus 25').result, 175);
t('sequential 5 + 3 * 2 = 16 (adding machine)', res('5 + 3 * 2').result, 16);
t('out the door back-tax', res('1091.25 out the door').result, 1000);
t('landing 990 / 3.3', res('990 landing').result, 300);
t('margin keyword 600 margin 50 percent', res('600 margin 50 percent').result, 1200);
t('margin 500 at 50% (num form)', res('500 margin 50').result, 1000);
t('percent multiply: 200 times 50 percent', res('200 times 50 percent').result, 100);
t('dollar + commas: $1,200.50 + tax', res('$1,200.50 plus tax').result, 1200.50 * 1.09125);
t('x as times: 12 x 3', res('12 x 3').result, 36);
t('off as minus: 100 minus 10 percent off', res('100 minus 10 percent').result, 90);

// --- step work shape ---
const work = res('1200 minus 15 percent plus tax');
t('steps count (start + 2 ops)', work.steps.length, 3);
t('step1 label start', work.steps[0].label, 'Start');
t('step2 is discount', work.steps[1].label.startsWith('− 15%'), true);
t('step3 is tax', work.steps[2].label.startsWith('+ tax'), true);

// --- error handling ---
t('divide by zero', interpret('10 / 0', cfg).ok, false);
t('two numbers in a row', interpret('10 20', cfg).ok, false);
t('gibberish', interpret('banana split', cfg).ok, false);
t('pct without op', interpret('1200 15 percent', cfg).ok, false);
t('trailing op', interpret('1200 plus', cfg).ok, false);
t('empty', interpret('', cfg).ok, false);

// --- evaluate() direct (button path) ---
const e = evaluate([
  { kind: 'start', value: 600 },
  { kind: 'marginPrice', pct: 50 },
  { kind: 'addTax', rate: 9.125 },
], cfg);
t('button path: 600 -> 50% margin -> +tax', e.result, 1200 * 1.09125);
t('button path ok', e.ok, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
