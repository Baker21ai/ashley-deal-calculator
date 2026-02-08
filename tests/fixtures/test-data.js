/**
 * Test data constants for Ashley Deal Calculator tests
 */

export const TAX_RATE = 0.09125; // 9.125% California sales tax

export const DELIVERY_OPTIONS = {
  FREE: 0,
  SMALL: 100,
  STANDARD: 135,
  LARGE: 150,
};

export const SALE_PERCENTAGES = [30, 35, 40];

export const MARGIN_TARGETS = {
  GREAT: 50,      // Green badge: ✓ Great
  GOOD: 49,       // Orange badge: ⚠️ OK
  ACCEPTABLE: 48, // Orange badge: ⚠️ OK
  MINIMUM: 47,    // Orange badge: ⚠️ OK (needs manager approval)
};

export const MARGIN_THRESHOLDS = {
  GREEN_MIN: 50,  // 50%+ is green
  ORANGE_MIN: 47, // 47-49% is orange
  RED_MAX: 47,    // <47% is red
};

export const PRICE_TYPES = {
  TAG: 'Tag Price',
  SALE: 'Sale Price',
};

export const ITEM_PRESETS = [
  'Sofa',
  'Loveseat',
  'Chair',
  'Ottoman',
  'Recliner',
  'Sectional',
  'Bed',
  'Mattress',
  'Nightstand',
  'Dresser',
  'Chest',
  'Mirror',
  'Dining Table',
  'Dining Chair',
  'Buffet',
  'Coffee Table',
  'End Table',
  'Console Table',
  'TV Stand',
  'Bookcase',
];

export const MAX_PRICE = 99999.99;
export const MIN_PRICE = 0.01;

export const CALCULATOR_MODES = {
  QUICK_QUOTE: 'Quick Quote',
  MARGIN_CHECK: 'Margin Check',
  OTD_PRICE: 'OTD Price',
};
