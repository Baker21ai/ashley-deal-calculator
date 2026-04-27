// Pure helpers for the AI coach.
// - dealSnapshot: serialize the calculator state for the LLM context.
// - nextMissingSlot: tells the LLM the most useful next question.
// - applyActions: invokes the calculator's existing functions for each
//   action the LLM emitted. Math is whatever the calculator already does;
//   we don't reinvent any of it here.

const VALID_DELIVERY = ['0', '100', '135', '150'];

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

export function nextMissingSlot(snapshot) {
  if (!snapshot.firstItemHasName) return 'item';
  if (!snapshot.firstItemHasPrice) return 'price';
  return '';
}

export function inferGoal(snapshot) {
  if (snapshot.firstItemHasLanding && snapshot.firstItemHasPrice) return 'margin_check';
  if (snapshot.firstItemHasName && !snapshot.firstItemHasPrice) return 'intake';
  return 'quote';
}

// Apply an ordered list of actions from the LLM by calling the calculator's
// existing setters and helpers. calcRefs is supplied by the parent component
// and contains the live setters + helper functions.
export function applyActions(actions, calcRefs) {
  if (!Array.isArray(actions) || actions.length === 0) return false;
  let didAnything = false;

  for (const a of actions) {
    if (!a || !a.type) continue;
    try {
      switch (a.type) {
        case 'set_item':
          calcRefs.setItemFields(
            Number(a.index ?? 0),
            {
              name: a.name,
              price: a.price != null ? String(a.price) : undefined,
              qty: a.qty != null ? Number(a.qty) || 1 : undefined,
            }
          );
          didAnything = true;
          break;

        case 'estimate_landing':
          // Run on the next tick so any preceding set_item has flushed.
          calcRefs.estimateLandingByIndex(Number(a.index ?? 0));
          didAnything = true;
          break;

        case 'set_delivery': {
          const v = String(a.value ?? '135');
          if (VALID_DELIVERY.includes(v) || /^\d+(\.\d+)?$/.test(v)) {
            calcRefs.setDelivery(v);
            didAnything = true;
          }
          break;
        }

        case 'set_no_tax_promo':
          calcRefs.setNoTaxPromo(a.value === true || a.value === 'true');
          didAnything = true;
          break;

        case 'set_sale_percent': {
          const n = Number(a.value);
          if ([30, 35, 40].includes(n)) {
            calcRefs.setSalePercent(n);
            didAnything = true;
          }
          break;
        }

        case 'set_price_type':
          if (a.value === 'sale' || a.value === 'tag') {
            calcRefs.setPriceType(a.value);
            didAnything = true;
          }
          break;

        case 'set_protection':
          calcRefs.setIncludeProtection(a.value === true || a.value === 'true');
          didAnything = true;
          break;

        case 'set_all_to_margin': {
          const n = Number(a.value);
          if ([47, 48, 49, 50].includes(n)) {
            calcRefs.setAllItemsToMargin(n);
            didAnything = true;
          }
          break;
        }

        case 'clear_items':
          calcRefs.clearItems();
          didAnything = true;
          break;

        default:
          // unknown action - skip silently
          break;
      }
    } catch (err) {
      console.error('applyActions error on', a, err);
    }
  }

  return didAnything;
}
