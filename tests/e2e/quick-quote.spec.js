/**
 * E2E tests for Quick Quote mode
 */

import { test, expect } from '@playwright/test';
import { CalculatorPage } from '../helpers/page-objects/CalculatorPage.js';
import { expectMoneyValue } from '../helpers/utils/assertions.js';
import { quickQuoteScenarios } from '../fixtures/calculation-scenarios.js';
import { DELIVERY_OPTIONS } from '../fixtures/test-data.js';

test.describe('Quick Quote Mode', () => {
  let calc;

  test.beforeEach(async ({ page }) => {
    calc = new CalculatorPage(page);
    await calc.goto();
    await calc.waitForLoad();
    await calc.switchToQuickQuote();
  });

  test('should calculate quote with No-Tax Promo ON', async ({ page }) => {
    const scenario = quickQuoteScenarios.noTaxPromoOn;

    // Setup
    await calc.setupDealSettings(scenario.settings);
    await calc.setupItems(scenario.items);

    // Calculate
    await calc.calculate();
    await calc.waitForResults();

    // Verify results
    const totalLocator = calc.resultsContent.locator('text=/Total.*\\$/i').last();
    await expectMoneyValue(totalLocator, scenario.expected.quoteTotal, 1);

    await calc.closeResults();
  });

  test('should calculate quote with No-Tax Promo OFF', async ({ page }) => {
    const scenario = quickQuoteScenarios.noTaxPromoOff;

    // Setup
    await calc.setupDealSettings(scenario.settings);
    await calc.setupItems(scenario.items);

    // Calculate
    await calc.calculate();
    await calc.waitForResults();

    // Verify total
    const totalLocator = calc.resultsContent.locator('text=/Total.*\\$/i').last();
    await expectMoneyValue(totalLocator, scenario.expected.total, 1);

    await calc.closeResults();
  });

  test('should calculate with multiple items and quantities', async ({ page }) => {
    const scenario = quickQuoteScenarios.multipleItems;

    // Setup
    await calc.setupDealSettings(scenario.settings);
    await calc.setupItems(scenario.items);

    // Calculate
    await calc.calculate();
    await calc.waitForResults();

    // Verify total
    const totalLocator = calc.resultsContent.locator('text=/Total.*\\$/i').last();
    await expectMoneyValue(totalLocator, scenario.expected.total, 1);

    await calc.closeResults();
  });

  test('should apply 30% sale discount correctly', async ({ page }) => {
    await calc.setNoTaxPromo(false);
    await calc.setSalePercent(30);
    await calc.setDelivery(0);

    await calc.setupItems([
      { name: 'Sofa', price: 1000, landingCost: 500, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // 30% off of $1000 = $700
    // Tax: $700 * 0.09125 = $63.88
    // Total: $700 + $63.88 = $763.88
    const totalLocator = calc.resultsContent.locator('text=/Total.*\\$/i').last();
    await expectMoneyValue(totalLocator, 763.88, 1);

    await calc.closeResults();
  });

  test('should apply 35% sale discount correctly', async ({ page }) => {
    await calc.setNoTaxPromo(false);
    await calc.setSalePercent(35);
    await calc.setDelivery(0);

    await calc.setupItems([
      { name: 'Sofa', price: 1000, landingCost: 500, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // 35% off of $1000 = $650
    // Tax: $650 * 0.09125 = $59.31
    // Total: $650 + $59.31 = $709.31
    const totalLocator = calc.resultsContent.locator('text=/Total.*\\$/i').last();
    await expectMoneyValue(totalLocator, 709.31, 1);

    await calc.closeResults();
  });

  test('should apply 40% sale discount correctly', async ({ page }) => {
    await calc.setNoTaxPromo(false);
    await calc.setSalePercent(40);
    await calc.setDelivery(0);

    await calc.setupItems([
      { name: 'Sofa', price: 1000, landingCost: 500, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // 40% off of $1000 = $600
    // Tax: $600 * 0.09125 = $54.75
    // Total: $600 + $54.75 = $654.75
    const totalLocator = calc.resultsContent.locator('text=/Total.*\\$/i').last();
    await expectMoneyValue(totalLocator, 654.75, 1);

    await calc.closeResults();
  });

  test('should handle different delivery amounts', async ({ page }) => {
    await calc.setNoTaxPromo(false);
    await calc.setSalePercent(30);

    const deliveryAmounts = [0, 100, 135, 150];

    for (const deliveryAmount of deliveryAmounts) {
      await calc.setDelivery(deliveryAmount);

      await calc.setupItems([
        { name: 'Sofa', price: 1000, landingCost: 500, quantity: 1 }
      ]);

      await calc.calculate();
      await calc.waitForResults();

      // Sale price: $1000 * 0.7 = $700
      // Item tax: $700 * 0.09125 = $63.88
      // Delivery tax: deliveryAmount * 0.09125
      // Total: $700 + $63.88 + deliveryAmount + (deliveryAmount * 0.09125)
      const deliveryTax = deliveryAmount * 0.09125;
      const expectedTotal = 700 + 63.88 + deliveryAmount + deliveryTax;

      const totalLocator = calc.resultsContent.locator('text=/Total.*\\$/i').last();
      await expectMoneyValue(totalLocator, expectedTotal, 1);

      await calc.closeResults();
    }
  });

  test('should require at least one item with price', async ({ page }) => {
    // Don't set any price
    await calc.setupItems([
      { name: 'Sofa', landingCost: 500, quantity: 1 }
    ]);

    // Try to calculate - should show alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('price');
      await dialog.accept();
    });

    await calc.calculate();

    // Results should not show
    const isVisible = await calc.isResultsVisible();
    expect(isVisible).toBeFalsy();
  });

  test('should handle Tag Price vs Sale Price selection', async ({ page }) => {
    await calc.setNoTaxPromo(false);
    await calc.setSalePercent(30);
    await calc.setDelivery(0);

    // Test with Tag Price (applies discount)
    await calc.setPriceType('tag');
    await calc.setupItems([
      { name: 'Sofa', price: 1000, landingCost: 500, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Tag price $1000 with 30% off = $700
    const totalLocator1 = calc.resultsContent.locator('text=/Total.*\\$/i').last();
    await expectMoneyValue(totalLocator1, 763.88, 1); // $700 + tax

    await calc.closeResults();

    // Test with Sale Price (no discount applied)
    await calc.setPriceType('sale');
    await calc.calculate();
    await calc.waitForResults();

    // Sale price is already $1000, no discount
    const totalLocator2 = calc.resultsContent.locator('text=/Total.*\\$/i').last();
    await expectMoneyValue(totalLocator2, 1091.25, 1); // $1000 + tax

    await calc.closeResults();
  });

  test('should copy quote to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await calc.setNoTaxPromo(false);
    await calc.setSalePercent(30);
    await calc.setDelivery(DELIVERY_OPTIONS.STANDARD);

    await calc.setupItems([
      { name: 'Sofa', price: 1000, landingCost: 500, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Copy results
    await calc.copyResults();

    // Verify clipboard contains relevant information
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('$'); // Should contain dollar amounts
    expect(clipboardText.length).toBeGreaterThan(0);

    await calc.closeResults();
  });

  test('should handle zero delivery', async ({ page }) => {
    await calc.setNoTaxPromo(false);
    await calc.setSalePercent(30);
    await calc.setDelivery(0);

    await calc.setupItems([
      { name: 'Sofa', price: 1000, landingCost: 500, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Should only have item total + item tax (no delivery)
    const totalLocator = calc.resultsContent.locator('text=/Total.*\\$/i').last();
    await expectMoneyValue(totalLocator, 763.88, 1);

    await calc.closeResults();
  });

  test('should recalculate when values change', async ({ page }) => {
    await calc.setNoTaxPromo(false);
    await calc.setSalePercent(30);
    await calc.setDelivery(0);

    // First calculation
    await calc.setupItems([
      { name: 'Sofa', price: 1000, landingCost: 500, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    const totalLocator1 = calc.resultsContent.locator('text=/Total.*\\$/i').last();
    await expectMoneyValue(totalLocator1, 763.88, 1);
    await calc.closeResults();

    // Change price and recalculate
    await calc.setItemPrice(0, 2000);

    await calc.calculate();
    await calc.waitForResults();

    // New total: $2000 * 0.7 = $1400, tax = $127.75, total = $1527.75
    const totalLocator2 = calc.resultsContent.locator('text=/Total.*\\$/i').last();
    await expectMoneyValue(totalLocator2, 1527.75, 1);

    await calc.closeResults();
  });
});
