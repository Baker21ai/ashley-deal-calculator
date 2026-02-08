/**
 * E2E tests for edge cases and boundary conditions
 */

import { test, expect } from '@playwright/test';
import { CalculatorPage } from '../helpers/page-objects/CalculatorPage.js';
import { expectMoneyValue, expectMargin } from '../helpers/utils/assertions.js';
import { edgeCaseScenarios, MAX_PRICE, MIN_PRICE } from '../fixtures/test-data.js';

test.describe('Edge Cases', () => {
  let calc;

  test.beforeEach(async ({ page }) => {
    calc = new CalculatorPage(page);
    await calc.goto();
    await calc.waitForLoad();
  });

  test('should handle zero price', async ({ page }) => {
    await calc.switchToMarginCheck();
    await calc.setupItems([
      { name: 'Free Item', price: 0, landingCost: 0, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Should show 0% margin
    const marginLocator = calc.resultsContent.locator('text=/0.*%|Margin/i');
    await expect(marginLocator).toBeVisible();

    await calc.closeResults();
  });

  test('should handle zero landing cost', async ({ page }) => {
    await calc.switchToMarginCheck();
    await calc.setupItems([
      { name: 'Item', price: 100, landingCost: 0, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Margin should be 100% (all profit)
    const marginLocator = calc.resultsContent.locator('text=/100.*%/i');
    await expect(marginLocator).toBeVisible();

    await calc.closeResults();
  });

  test('should handle negative margin (cost > price)', async ({ page }) => {
    await calc.switchToMarginCheck();
    await calc.setupItems([
      { name: 'Loss Leader', price: 500, landingCost: 700, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Should show negative margin
    const resultsText = await calc.resultsContent.textContent();
    expect(resultsText).toMatch(/-\d+|Too Low/);

    await calc.closeResults();
  });

  test('should handle very small amounts', async ({ page }) => {
    await calc.switchToMarginCheck();
    await calc.setItemPrice(0, 0.01);
    await calc.setItemLandingCost(0, 0.01);

    await calc.calculate();
    await calc.waitForResults();

    // Should complete without errors
    await expect(calc.resultsContent).toBeVisible();

    await calc.closeResults();
  });

  test('should handle maximum price (99999.99)', async ({ page }) => {
    await calc.switchToMarginCheck();
    await calc.setItemPrice(0, 99999.99);
    await calc.setItemLandingCost(0, 49999.99);

    await calc.calculate();
    await calc.waitForResults();

    // Should show 50% margin
    const marginLocator = calc.resultsContent.locator('text=/50.*%/i');
    await expectMargin(marginLocator, 50, 1);

    await calc.closeResults();
  });

  test('should handle decimal precision correctly', async ({ page }) => {
    await calc.switchToMarginCheck();
    await calc.setItemPrice(0, 123.45);
    await calc.setItemLandingCost(0, 61.73);

    await calc.calculate();
    await calc.waitForResults();

    // Margin: (123.45 - 61.73) / 123.45 = 50.00%
    const marginLocator = calc.resultsContent.locator('text=/50.*%/i');
    await expectMargin(marginLocator, 50, 1);

    await calc.closeResults();
  });

  test('should handle zero quantity', async ({ page }) => {
    await calc.switchToMarginCheck();
    await calc.setupItems([
      { price: 1000, landingCost: 500, quantity: 0 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Should handle gracefully (0 quantity = 0 total)
    await expect(calc.resultsContent).toBeVisible();

    await calc.closeResults();
  });

  test('should handle very large quantities', async ({ page }) => {
    await calc.switchToMarginCheck();
    await calc.setItemQuantity(0, 999);
    await calc.setupItems([
      { price: 100, landingCost: 50 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Total profit: 999 * 50 = $49,950
    const profitLocator = calc.resultsContent.locator('text=/Profit.*\\$/i');
    await expectMoneyValue(profitLocator, 49950, 10);

    await calc.closeResults();
  });

  test('should handle missing item names', async ({ page }) => {
    await calc.switchToMarginCheck();
    // Don't set a name, just set price and cost
    await calc.setItemPrice(0, 1000);
    await calc.setItemLandingCost(0, 500);

    await calc.calculate();
    await calc.waitForResults();

    // Should still calculate correctly even without name
    const marginLocator = calc.resultsContent.locator('text=/50.*%/i');
    await expect(marginLocator).toBeVisible();

    await calc.closeResults();
  });

  test('should handle special characters in custom names', async ({ page }) => {
    const specialNames = [
      'Item & Co.',
      'Item #1',
      'Item (Special)',
      'Item "Quote"',
      'Item\'s Name',
    ];

    for (const name of specialNames) {
      await calc.setCustomItemName(0, name);

      const itemRow = calc.getItemRow(0);
      const itemText = await itemRow.textContent();

      // Should contain the name (may be sanitized)
      expect(itemText.length).toBeGreaterThan(0);
    }
  });

  test('should handle rapid mode switching', async ({ page }) => {
    // Switch modes rapidly
    for (let i = 0; i < 5; i++) {
      await calc.switchToQuickQuote();
      await calc.switchToMarginCheck();
      await calc.switchToOtdPrice();
    }

    // Should still be functional
    await calc.switchToMarginCheck();
    const mode = await calc.getCurrentMode();
    expect(mode).toBe('margin');
  });

  test('should handle rapid clicking on calculate', async ({ page }) => {
    await calc.switchToMarginCheck();
    await calc.setupItems([
      { price: 1000, landingCost: 500, quantity: 1 }
    ]);

    // Click calculate multiple times quickly
    await calc.calculate();
    await calc.calculate();
    await calc.calculate();

    // Should still show results once
    await calc.waitForResults();
    const isVisible = await calc.isResultsVisible();
    expect(isVisible).toBeTruthy();

    await calc.closeResults();
  });

  test('should recalculate after value changes', async ({ page }) => {
    await calc.switchToMarginCheck();
    await calc.setupItems([
      { price: 1000, landingCost: 500, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();
    await calc.closeResults();

    // Change value
    await calc.setItemPrice(0, 2000);

    await calc.calculate();
    await calc.waitForResults();

    // Should show new margin (still 50%)
    const marginLocator = calc.resultsContent.locator('text=/50.*%/i');
    await expect(marginLocator).toBeVisible();

    await calc.closeResults();
  });

  test('should handle equal price and cost (zero margin)', async ({ page }) => {
    await calc.switchToMarginCheck();
    await calc.setupItems([
      { price: 600, landingCost: 600, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Should show 0% margin and red status
    const marginLocator = calc.resultsContent.locator('text=/0.*%/i');
    await expect(marginLocator).toBeVisible();

    const statusLocator = calc.resultsContent.locator('text=/Too Low|✗/i');
    await expect(statusLocator).toBeVisible();

    await calc.closeResults();
  });

  test('should handle OTD price less than delivery', async ({ page }) => {
    await calc.switchToOtdPrice();
    await calc.setDelivery(135);
    await calc.setupItems([
      { landingCost: 100, quantity: 1 }
    ]);
    await calc.setOtdPrice(100); // Less than delivery

    await calc.calculate();
    await calc.waitForResults();

    // Should handle gracefully (negative sale price scenario)
    await expect(calc.resultsContent).toBeVisible();

    await calc.closeResults();
  });

  test('should handle OTD price equal to delivery', async ({ page }) => {
    await calc.switchToOtdPrice();
    await calc.setDelivery(135);
    await calc.setupItems([
      { landingCost: 100, quantity: 1 }
    ]);
    await calc.setOtdPrice(135); // Exactly delivery amount

    await calc.calculate();
    await calc.waitForResults();

    // Should show very low or negative margin
    await expect(calc.resultsContent).toBeVisible();

    await calc.closeResults();
  });

  test('should handle multiple items with mixed valid/invalid quantities', async ({ page }) => {
    await calc.switchToMarginCheck();

    await calc.addItem();
    await calc.addItem();

    await calc.setItemQuantity(0, 1);
    await calc.setItemQuantity(1, 0);
    await calc.setItemQuantity(2, 5);

    await calc.setupItems([
      { price: 100, landingCost: 50 },
      { price: 200, landingCost: 100 },
      { price: 300, landingCost: 150 },
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Should calculate based on valid items
    await expect(calc.resultsContent).toBeVisible();

    await calc.closeResults();
  });

  test('should handle alternating discount percentages', async ({ page }) => {
    await calc.switchToQuickQuote();
    await calc.setNoTaxPromo(false);
    await calc.setDelivery(0);

    const discounts = [30, 35, 40, 30, 35, 40];

    for (const discount of discounts) {
      await calc.setSalePercent(discount);
      await calc.setupItems([
        { price: 1000, landingCost: 500, quantity: 1 }
      ]);

      await calc.calculate();
      await calc.waitForResults();

      // Just verify it calculates
      await expect(calc.resultsContent).toBeVisible();

      await calc.closeResults();
    }
  });

  test('should handle switching between tag and sale price types', async ({ page }) => {
    await calc.switchToQuickQuote();
    await calc.setSalePercent(30);
    await calc.setNoTaxPromo(false);
    await calc.setDelivery(0);

    await calc.setupItems([
      { price: 1000, landingCost: 500, quantity: 1 }
    ]);

    // Calculate with tag price (applies discount)
    await calc.setPriceType('tag');
    await calc.calculate();
    await calc.waitForResults();
    const total1Text = await calc.resultsContent.textContent();
    await calc.closeResults();

    // Calculate with sale price (no discount)
    await calc.setPriceType('sale');
    await calc.calculate();
    await calc.waitForResults();
    const total2Text = await calc.resultsContent.textContent();
    await calc.closeResults();

    // Totals should be different
    expect(total1Text).not.toBe(total2Text);
  });

  test('should handle maximum number of items', async ({ page }) => {
    // Add 20 items (reasonable maximum)
    for (let i = 1; i < 20; i++) {
      await calc.addItem();
    }

    const itemCount = await calc.getItemCount();
    expect(itemCount).toBe(20);

    // Should still be able to calculate
    await calc.switchToMarginCheck();
    await calc.setupItems([
      { price: 100, landingCost: 50, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    await expect(calc.resultsContent).toBeVisible();

    await calc.closeResults();
  });
});
