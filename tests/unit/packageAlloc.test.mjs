// Unit tests for the package price allocator.
// Run: node tests/unit/packageAlloc.test.mjs
import { allocatePackagePieces } from '../../src/packageAlloc.js';

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}
function near(a, b, eps = 0.011) { return Math.abs(a - b) < eps; }

// 1. Equal-margin split: pieces get the same multiple of their landing
{
  const { alloc, mismatch } = allocatePackagePieces([
    { id: 'a', qty: 1, landing: 600, pinnedInvoice: null },
    { id: 'b', qty: 1, landing: 300, pinnedInvoice: null },
    { id: 'c', qty: 1, landing: 100, pinnedInvoice: null },
  ], 2000);
  check('equal-margin: sums to package', near(alloc.get('a') + alloc.get('b') + alloc.get('c'), 2000));
  check('equal-margin: proportional', near(alloc.get('a'), 1200) && near(alloc.get('b'), 600) && near(alloc.get('c'), 200));
  check('equal-margin: no mismatch', mismatch === null);
}

// 2. Pinned piece + rebalance: remainder spreads over unpinned
{
  const { alloc, mismatch } = allocatePackagePieces([
    { id: 'a', qty: 1, landing: 600, pinnedInvoice: 1500 },
    { id: 'b', qty: 1, landing: 300, pinnedInvoice: null },
    { id: 'c', qty: 1, landing: 100, pinnedInvoice: null },
  ], 2000);
  check('pin+rebalance: unpinned share 500 proportionally', near(alloc.get('b'), 375) && near(alloc.get('c'), 125));
  check('pin+rebalance: pinned not in alloc', !alloc.has('a'));
  check('pin+rebalance: no mismatch', mismatch === null);
}

// 3. Pins exceed package price: unpinned clamp to 0 with mismatch
{
  const { alloc, mismatch } = allocatePackagePieces([
    { id: 'a', qty: 1, landing: 600, pinnedInvoice: 2500 },
    { id: 'b', qty: 1, landing: 300, pinnedInvoice: null },
  ], 2000);
  check('overpin: unpinned zero', alloc.get('b') === 0);
  check('overpin: mismatch reported', near(mismatch, 500));
}

// 4. All pinned: no allocation, mismatch when drift
{
  const { alloc, mismatch } = allocatePackagePieces([
    { id: 'a', qty: 1, landing: 600, pinnedInvoice: 1200 },
    { id: 'b', qty: 1, landing: 300, pinnedInvoice: 900 },
  ], 2000);
  check('all-pinned: empty alloc', alloc.size === 0);
  check('all-pinned: drift flagged', near(mismatch, 100));
}
{
  const { mismatch } = allocatePackagePieces([
    { id: 'a', qty: 1, landing: 600, pinnedInvoice: 2000 },
  ], 2000);
  check('all-pinned exact: no mismatch', mismatch === null);
}

// 5. Zero landing everywhere: equal split per unit
{
  const { alloc } = allocatePackagePieces([
    { id: 'a', qty: 1, landing: 0, pinnedInvoice: null },
    { id: 'b', qty: 3, landing: 0, pinnedInvoice: null },
  ], 400);
  check('zero-landing: equal per-unit split', near(alloc.get('a'), 100) && near(alloc.get('b'), 100));
}

// 6. Mixed zero-landing: piece without landing gets $0 (documented v1 behavior)
{
  const { alloc } = allocatePackagePieces([
    { id: 'a', qty: 1, landing: 500, pinnedInvoice: null },
    { id: 'b', qty: 1, landing: 0, pinnedInvoice: null },
  ], 1000);
  check('mixed zero-landing: weighted piece takes all', near(alloc.get('a'), 1000) && near(alloc.get('b'), 0));
}

// 7. Single unpinned piece gets the full remainder
{
  const { alloc } = allocatePackagePieces([
    { id: 'a', qty: 1, landing: 123, pinnedInvoice: null },
  ], 777.77);
  check('single piece: full package price', near(alloc.get('a'), 777.77));
}

// 8. Rounding: totals land on the cent when a qty-1 piece can absorb residual
{
  const { alloc } = allocatePackagePieces([
    { id: 'a', qty: 1, landing: 100, pinnedInvoice: null },
    { id: 'b', qty: 1, landing: 100, pinnedInvoice: null },
    { id: 'c', qty: 1, landing: 100, pinnedInvoice: null },
  ], 1000);
  const sum = alloc.get('a') + alloc.get('b') + alloc.get('c');
  check('rounding: exact cent total', Math.abs(sum - 1000) < 0.005, `sum=${sum}`);
}

// 9. Quantities: per-unit allocation respects qty weighting
{
  const { alloc } = allocatePackagePieces([
    { id: 'a', qty: 2, landing: 250, pinnedInvoice: null },
    { id: 'b', qty: 1, landing: 500, pinnedInvoice: null },
  ], 3000);
  // W = 2*250 + 500 = 1000; a/unit = 3000*250/1000 = 750; b = 1500
  check('qty weighting', near(alloc.get('a'), 750) && near(alloc.get('b'), 1500));
  check('qty totals', near(alloc.get('a') * 2 + alloc.get('b'), 3000));
}

// 10. Empty package
{
  const { alloc, mismatch } = allocatePackagePieces([], 1000);
  check('empty: no alloc, no mismatch', alloc.size === 0 && mismatch === null);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
