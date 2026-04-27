// Pure slot-filling state machine. Tells the LLM which slot is missing
// so Gemini just decides HOW to ask, never WHAT'S missing.

const SLOT_ORDER = [
  'item',
  'tagOrSale',
  'price',
  'customerOffer',
  'delivery',
  'protection',
];

export function dealSnapshot(items, settings) {
  const first = items?.[0] || {};
  return {
    items: (items || []).map((it) => ({
      name: it.name || '',
      price: String(it.price || ''),
      qty: it.qty || 1,
      landingCost: String(it.landingCost || ''),
    })),
    salePercent: settings?.salePercent ?? 30,
    noTaxPromo: settings?.noTaxPromo ?? true,
    priceType: settings?.priceType ?? 'sale',
    delivery: String(settings?.delivery ?? '135'),
    includeProtection: settings?.includeProtection ?? false,
    overallMargin: settings?.overallMargin ?? null,
    customerTotal: settings?.customerTotal ?? null,
    subtotal: settings?.subtotal ?? null,
    firstItemHasName: Boolean(first.name),
    firstItemHasPrice: Boolean(String(first.price || '').trim()),
    firstItemHasLanding: Boolean(String(first.landingCost || '').trim()),
  };
}

// Decide what we still want from the rep. Returns one of SLOT_ORDER or '' if filled enough.
export function nextMissingSlot(snapshot, goal = 'quote') {
  if (!snapshot.firstItemHasName) return 'item';
  if (!snapshot.firstItemHasPrice) return 'price';
  // Landing cost is never asked for - the AI estimates it instead.
  // We treat the deal as "complete enough" once item + price are in.
  if (goal === 'otd' && snapshot.customerOffer == null) return 'customerOffer';
  return '';
}

// Merge a calculatorPatch from the LLM into the existing items.
// Returns { items, settings } ready to feed into the React setters.
export function mergePatch(currentItems, currentSettings, patch) {
  if (!patch) return { items: currentItems, settings: currentSettings };

  let items = currentItems;
  if (Array.isArray(patch.items) && patch.items.length > 0) {
    items = currentItems.map((existing, idx) => {
      const incoming = patch.items[idx];
      if (!incoming) return existing;
      return {
        ...existing,
        name: incoming.name || existing.name,
        price: incoming.price != null ? String(incoming.price) : existing.price,
        qty: incoming.qty != null ? Number(incoming.qty) || 1 : existing.qty,
        landingCost:
          incoming.landingCost != null ? String(incoming.landingCost) : existing.landingCost,
        // any patch from the AI clears the margin-set lock so the fresh price is used as-is
        marginSet: false,
        selectedMargin: null,
        originalPrice: undefined,
      };
    });
    // append additional items if patch has more than current
    if (patch.items.length > currentItems.length) {
      const extras = patch.items.slice(currentItems.length).map((incoming, i) => ({
        id: Date.now() + i,
        name: incoming.name || '',
        price: incoming.price != null ? String(incoming.price) : '',
        qty: incoming.qty != null ? Number(incoming.qty) || 1 : 1,
        landingCost: incoming.landingCost != null ? String(incoming.landingCost) : '',
        marginSet: false,
        selectedMargin: null,
        originalPrice: undefined,
      }));
      items = [...items, ...extras];
    }
  }

  const settings = { ...currentSettings };
  if (patch.delivery != null) settings.delivery = String(patch.delivery);
  if (typeof patch.noTaxPromo === 'boolean') settings.noTaxPromo = patch.noTaxPromo;
  if (Number.isFinite(patch.salePercent)) settings.salePercent = patch.salePercent;
  if (patch.priceType === 'sale' || patch.priceType === 'tag') settings.priceType = patch.priceType;
  if (typeof patch.includeProtection === 'boolean') settings.includeProtection = patch.includeProtection;

  return { items, settings };
}

// Best guess at what stage we're in based on the deal state.
export function inferGoal(snapshot) {
  if (snapshot.firstItemHasLanding && snapshot.firstItemHasPrice) return 'margin_check';
  if (snapshot.firstItemHasName && !snapshot.firstItemHasPrice) return 'intake';
  return 'quote';
}

export { SLOT_ORDER };
