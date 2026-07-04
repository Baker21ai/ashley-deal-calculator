// Split one package price across its pieces (pre-tax, per-unit).
// pieces: [{ id, qty, landing, pinnedInvoice }] — pinnedInvoice is a per-unit price for
// hand-set pieces (null = auto). Unpinned pieces share the remainder in proportion to
// landing cost, so every auto piece lands on the same margin.
export function allocatePackagePieces(pieces, packageInvoice) {
  const alloc = new Map();
  if (!Array.isArray(pieces) || pieces.length === 0) return { alloc, mismatch: null };

  const pinned = pieces.filter(p => p.pinnedInvoice != null);
  const unpinned = pieces.filter(p => p.pinnedInvoice == null);
  const pinnedTotal = pinned.reduce((sum, p) => sum + p.pinnedInvoice * p.qty, 0);

  if (unpinned.length === 0) {
    // Everything hand-set: totals come from the pieces; flag drift from the entered package price
    const diff = pinnedTotal - packageInvoice;
    return { alloc, mismatch: Math.abs(diff) > 0.01 ? diff : null };
  }

  const R = packageInvoice - pinnedTotal;
  if (R < 0) {
    // Pins already exceed the package price — nothing left for the auto pieces
    unpinned.forEach(p => alloc.set(p.id, 0));
    return { alloc, mismatch: pinnedTotal - packageInvoice };
  }

  const W = unpinned.reduce((sum, p) => sum + p.landing * p.qty, 0);
  const totalQty = unpinned.reduce((sum, p) => sum + p.qty, 0);
  unpinned.forEach(p => {
    const perUnit = W > 0 ? R * (p.landing / W) : (totalQty > 0 ? R / totalQty : 0);
    alloc.set(p.id, Math.round(perUnit * 100) / 100);
  });

  // Put leftover rounding cents on the last single-qty auto piece so the receipt sums exactly
  const allocated = unpinned.reduce((sum, p) => sum + alloc.get(p.id) * p.qty, 0);
  const residual = Math.round((R - allocated) * 100) / 100;
  if (residual !== 0) {
    const target = [...unpinned].reverse().find(p => p.qty === 1);
    if (target) alloc.set(target.id, Math.round((alloc.get(target.id) + residual) * 100) / 100);
  }
  return { alloc, mismatch: null };
}
