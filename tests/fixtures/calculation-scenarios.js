/**
 * Pre-calculated test scenarios for Ashley Deal Calculator
 * All expected values are hand-calculated to verify business logic
 */

import { TAX_RATE, DELIVERY_OPTIONS } from './test-data.js';

/**
 * Quick Quote scenarios
 */
export const quickQuoteScenarios = {
  // No-Tax Promo ON: Tax is included in quote prices
  noTaxPromoOn: {
    items: [
      { name: 'Sofa', tagPrice: 1200, landingCost: 600, quantity: 1 }
    ],
    settings: {
      salePercent: 30,
      noTaxPromo: true,
      priceType: 'Tag Price',
      delivery: DELIVERY_OPTIONS.STANDARD,
    },
    expected: {
      // Sale price: 1200 * 0.7 = 840
      // Invoice price (tax-inclusive): 840 / 1.09125 = 769.54
      // Quote price: 840 (shown to customer with tax included)
      // Delivery: 135 / 1.09125 = 123.68 (invoice), 135 (quote)
      // Total invoice: 769.54 + 123.68 = 893.22
      // Total quote: 840 + 135 + 12.32 (delivery tax) = 987.32
      invoiceTotal: 893.22,
      quoteTotal: 987.32,
    }
  },

  // No-Tax Promo OFF: Tax shown separately
  noTaxPromoOff: {
    items: [
      { name: 'Sofa', tagPrice: 1200, landingCost: 600, quantity: 1 }
    ],
    settings: {
      salePercent: 30,
      noTaxPromo: false,
      priceType: 'Tag Price',
      delivery: DELIVERY_OPTIONS.STANDARD,
    },
    expected: {
      // Sale price: 1200 * 0.7 = 840
      // Subtotal: 840
      // Tax on items: 840 * 0.09125 = 76.65
      // Delivery: 135
      // Tax on delivery: 135 * 0.09125 = 12.32
      // Total: 840 + 76.65 + 135 + 12.32 = 1063.97
      subtotal: 840,
      itemTax: 76.65,
      delivery: 135,
      deliveryTax: 12.32,
      total: 1063.97,
    }
  },

  // Multiple items with quantities
  multipleItems: {
    items: [
      { name: 'Sofa', tagPrice: 1200, landingCost: 600, quantity: 2 },
      { name: 'Mattress', tagPrice: 800, landingCost: 400, quantity: 1 }
    ],
    settings: {
      salePercent: 35,
      noTaxPromo: false,
      priceType: 'Tag Price',
      delivery: DELIVERY_OPTIONS.LARGE,
    },
    expected: {
      // Sofa: 1200 * 0.65 = 780, qty 2 = 1560
      // Mattress: 800 * 0.65 = 520, qty 1 = 520
      // Subtotal: 1560 + 520 = 2080
      // Tax on items: 2080 * 0.09125 = 189.80
      // Delivery: 150
      // Tax on delivery: 150 * 0.09125 = 13.69
      // Total: 2080 + 189.80 + 150 + 13.69 = 2433.49
      subtotal: 2080,
      itemTax: 189.80,
      delivery: 150,
      deliveryTax: 13.69,
      total: 2433.49,
    }
  },
};

/**
 * Margin Check scenarios
 */
export const marginCheckScenarios = {
  // 50% margin (green badge)
  greenMargin: {
    items: [
      { name: 'Sofa', salePrice: 1200, landingCost: 600, quantity: 1 }
    ],
    settings: {
      noTaxPromo: false,
      delivery: DELIVERY_OPTIONS.STANDARD,
    },
    expected: {
      margin: 50.00,
      profit: 600,
      badgeColor: 'green',
      badgeText: '✓ Great',
    }
  },

  // 49% margin (orange badge)
  orangeMargin: {
    items: [
      { name: 'Sofa', salePrice: 1176.47, landingCost: 600, quantity: 1 }
    ],
    settings: {
      noTaxPromo: false,
      delivery: DELIVERY_OPTIONS.STANDARD,
    },
    expected: {
      margin: 49.00,
      profit: 576.47,
      badgeColor: 'orange',
      badgeText: '⚠️ OK',
    }
  },

  // 47% margin (orange badge, minimum acceptable)
  minimumMargin: {
    items: [
      { name: 'Sofa', salePrice: 1132.08, landingCost: 600, quantity: 1 }
    ],
    settings: {
      noTaxPromo: false,
      delivery: DELIVERY_OPTIONS.STANDARD,
    },
    expected: {
      margin: 47.00,
      profit: 532.08,
      badgeColor: 'orange',
      badgeText: '⚠️ OK',
    }
  },

  // 41% margin (red badge, too low)
  redMargin: {
    items: [
      { name: 'Sofa', salePrice: 1000, landingCost: 590, quantity: 1 }
    ],
    settings: {
      noTaxPromo: false,
      delivery: DELIVERY_OPTIONS.STANDARD,
    },
    expected: {
      margin: 41.00,
      profit: 410,
      badgeColor: 'red',
      badgeText: '✗ Too Low',
    }
  },

  // Margin targets with No-Tax Promo ON
  marginTargetsNoTax: {
    items: [
      { name: 'Sofa', landingCost: 600, quantity: 1 }
    ],
    settings: {
      noTaxPromo: true,
      delivery: DELIVERY_OPTIONS.STANDARD,
    },
    expected: {
      // For 50% margin: invoice = 600 / (1 - 0.50) = 1200
      // Quote = 1200 * 1.09125 = 1309.50
      margin50Quote: 1309.50,
      margin50Invoice: 1200,
      // For 47% margin: invoice = 600 / (1 - 0.47) = 1132.08
      // Quote = 1132.08 * 1.09125 = 1235.39
      margin47Quote: 1235.39,
      margin47Invoice: 1132.08,
    }
  },
};

/**
 * OTD Price scenarios
 */
export const otdPriceScenarios = {
  // Customer offers $2000 OTD, high margin
  approvedDeal: {
    items: [
      { name: 'Sofa', landingCost: 800, quantity: 1 }
    ],
    settings: {
      otdPrice: 2000,
      delivery: DELIVERY_OPTIONS.STANDARD,
    },
    expected: {
      // Back out delivery: 2000 - 135 = 1865
      // Back out tax: 1865 / 1.09125 = 1708.54
      // Margin: (1708.54 - 800) / 1708.54 = 53.18%
      salePrice: 1708.54,
      margin: 53.18,
      profit: 908.54,
      status: 'Approved',
      badgeColor: 'green',
    }
  },

  // Customer offers $1500 OTD, acceptable margin
  managerApproval: {
    items: [
      { name: 'Sofa', landingCost: 800, quantity: 1 }
    ],
    settings: {
      otdPrice: 1500,
      delivery: DELIVERY_OPTIONS.STANDARD,
    },
    expected: {
      // Back out delivery: 1500 - 135 = 1365
      // Back out tax: 1365 / 1.09125 = 1250.57
      // Margin: (1250.57 - 800) / 1250.57 = 36.02%
      salePrice: 1250.57,
      margin: 36.02,
      profit: 450.57,
      status: 'Too Low',
      badgeColor: 'red',
    }
  },

  // Multiple items
  multipleItemsOtd: {
    items: [
      { name: 'Sofa', landingCost: 600, quantity: 1 },
      { name: 'Loveseat', landingCost: 450, quantity: 1 }
    ],
    settings: {
      otdPrice: 2500,
      delivery: DELIVERY_OPTIONS.STANDARD,
    },
    expected: {
      // Total landing: 600 + 450 = 1050
      // Back out delivery: 2500 - 135 = 2365
      // Back out tax: 2365 / 1.09125 = 2166.90
      // Margin: (2166.90 - 1050) / 2166.90 = 51.54%
      totalLanding: 1050,
      salePrice: 2166.90,
      margin: 51.54,
      profit: 1116.90,
      status: 'Approved',
      badgeColor: 'green',
    }
  },
};

/**
 * Edge case scenarios
 */
export const edgeCaseScenarios = {
  // Zero price
  zeroPrice: {
    items: [
      { name: 'Free Item', salePrice: 0, landingCost: 0, quantity: 1 }
    ],
    expected: {
      margin: 0,
      profit: 0,
    }
  },

  // Negative margin (cost exceeds sale price)
  negativeMargin: {
    items: [
      { name: 'Loss Leader', salePrice: 500, landingCost: 700, quantity: 1 }
    ],
    expected: {
      margin: -40, // (500 - 700) / 500 = -0.40 = -40%
      profit: -200,
      badgeColor: 'red',
    }
  },

  // Very small amount
  smallAmount: {
    items: [
      { name: 'Accessory', salePrice: 0.01, landingCost: 0.01, quantity: 1 }
    ],
    expected: {
      margin: 0,
      profit: 0,
    }
  },

  // Maximum price
  maxPrice: {
    items: [
      { name: 'Expensive Item', salePrice: 99999.99, landingCost: 49999.99, quantity: 1 }
    ],
    expected: {
      margin: 50.00,
      profit: 50000.00,
    }
  },
};
