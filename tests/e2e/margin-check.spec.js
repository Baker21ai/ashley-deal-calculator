/**
 * E2E tests for Margin Check mode
 */

import { test, expect } from '@playwright/test';
import { CalculatorPage } from '../helpers/page-objects/CalculatorPage.js';
import { expectMoneyValue, expectMargin } from '../helpers/utils/assertions.js';
import { marginCheckScenarios } from '../fixtures/calculation-scenarios.js';
import { MARGIN_TARGETS } from '../fixtures/test-data.js';

test.describe('Margin Check Mode', () => {
  let calc;

  test.beforeEach(async ({ page }) => {
    calc = new CalculatorPage(page);
    await calc.goto();
    await calc.waitForLoad();
    await calc.switchToMarginCheck();
  });

  test('should show green badge for 50%+ margin', async ({ page }) => {
    const scenario = marginCheckScenarios.greenMargin;

    await calc.setupDealSettings(scenario.settings);
    await calc.setupItems(scenario.items);

    await calc.calculate();
    await calc.waitForResults();

    // Verify margin is shown
    const marginLocator = calc.resultsContent.locator('.badge').first();
    await expectMargin(marginLocator, 50, 1);

    // Verify green indicator (✓ Great or similar)
    const statusLocator = calc.resultsContent.locator('.badge').first();
    await expect(statusLocator).toContainText(/Great|✓/i);

    await calc.closeResults();
  });

  test('should show orange badge for 49% margin', async ({ page }) => {
    const scenario = marginCheckScenarios.orangeMargin;

    await calc.setupDealSettings(scenario.settings);
    await calc.setupItems(scenario.items);

    await calc.calculate();
    await calc.waitForResults();

    // Verify margin is shown
    const marginLocator = calc.resultsContent.locator('.badge').first();
    await expectMargin(marginLocator, 49, 1);

    // Verify orange indicator (⚠️ OK or similar)
    const statusLocator = calc.resultsContent.locator('.badge').first();
    await expect(statusLocator).toContainText(/OK|⚠/i);

    await calc.closeResults();
  });

  test('should show orange badge for 47% margin (minimum)', async ({ page }) => {
    const scenario = marginCheckScenarios.minimumMargin;

    await calc.setupDealSettings(scenario.settings);
    await calc.setupItems(scenario.items);

    await calc.calculate();
    await calc.waitForResults();

    // Verify margin is shown
    const marginLocator = calc.resultsContent.locator('.badge').first();
    await expectMargin(marginLocator, 47, 1);

    // Verify orange indicator
    const statusLocator = calc.resultsContent.locator('.badge').first();
    await expect(statusLocator).toContainText(/OK|⚠/i);

    await calc.closeResults();
  });

  test('should show red badge for <47% margin', async ({ page }) => {
    const scenario = marginCheckScenarios.redMargin;

    await calc.setupDealSettings(scenario.settings);
    await calc.setupItems(scenario.items);

    await calc.calculate();
    await calc.waitForResults();

    // Verify margin is shown (41%)
    const marginLocator = calc.resultsContent.locator('.badge').first();
    await expectMargin(marginLocator, 41, 1);

    // Verify red indicator (✗ Too Low or similar)
    const statusLocator = calc.resultsContent.locator('.badge').first();
    await expect(statusLocator).toContainText(/Too Low|✗/i);

    await calc.closeResults();
  });

  test('should calculate correct profit amount', async ({ page }) => {
    await calc.setNoTaxPromo(false);
    await calc.setupItems([
      { name: 'Sofa', price: 1200, landingCost: 600, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Profit should be $1200 - $600 = $600
    const profitLocator = calc.resultsContent.locator('text=/Total Profit/i').locator('..');
    await expectMoneyValue(profitLocator, 600, 1);

    await calc.closeResults();
  });

  test('should calculate margin for multiple items', async ({ page }) => {
    await calc.setNoTaxPromo(false);
    await calc.setupItems([
      { name: 'Sofa', price: 1200, landingCost: 600, quantity: 1 },
      { name: 'Chair', price: 600, landingCost: 300, quantity: 2 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Total sale: $1200 + ($600 * 2) = $2400
    // Total landing: $600 + ($300 * 2) = $1200
    // Margin: ($2400 - $1200) / $2400 = 50%
    const marginLocator = calc.resultsContent.locator('.badge').first();
    await expectMargin(marginLocator, 50, 1);

    // Total profit: $1200
    const profitLocator = calc.resultsContent.locator('text=/Total Profit/i').locator('..');
    await expectMoneyValue(profitLocator, 1200, 1);

    await calc.closeResults();
  });

  test('should work without price (show margin targets only)', async ({ page }) => {
    // Only set landing cost, no price
    await calc.setupItems([
      { name: 'Sofa', landingCost: 600, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Should show margin target prices
    // For 50% margin: $600 / 0.5 = $1200
    // For 47% margin: $600 / 0.53 = $1132.08
    const resultsText = await calc.resultsContent.textContent();
    expect(resultsText).toContain('$');

    await calc.closeResults();
  });

  test('should handle No-Tax Promo affecting quote/invoice display', async ({ page }) => {
    const scenario = marginCheckScenarios.marginTargetsNoTax;

    await calc.setupDealSettings(scenario.settings);
    await calc.setupItems(scenario.items);

    await calc.calculate();
    await calc.waitForResults();

    // Verify both invoice and quote prices are shown
    const resultsText = await calc.resultsContent.textContent();
    expect(resultsText).toContain('Invoice');
    expect(resultsText).toContain('Quote');

    await calc.closeResults();
  });

  test('should calculate margin accurately with different sale percentages', async ({ page }) => {
    await calc.setNoTaxPromo(false);
    await calc.setPriceType('tag');
    const salePercentages = [30, 35, 40];

    for (const salePercent of salePercentages) {
      await calc.setSalePercent(salePercent);

      // Tag price: $1000, Landing: $500
      // With sale, actual price varies
      const tagPrice = 1000;
      const landingCost = 500;
      const salePrice = tagPrice * (1 - salePercent / 100);

      await calc.setupItems([
        { name: 'Sofa', price: tagPrice, landingCost: landingCost, quantity: 1 }
      ]);

      await calc.calculate();
      await calc.waitForResults();

      // Calculate expected margin
      const expectedMargin = ((salePrice - landingCost) / salePrice) * 100;
      const marginLocator = calc.resultsContent.locator('.badge').first();
      await expectMargin(marginLocator, expectedMargin, 1);

      await calc.closeResults();
    }
  });

  test('should show summary table with all values', async ({ page }) => {
    await calc.setupItems([
      { name: 'Sofa', price: 1200, landingCost: 600, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Verify summary contains key fields
    const resultsText = await calc.resultsContent.textContent();

    // Should contain landing cost
    expect(resultsText.toLowerCase()).toMatch(/landing|cost/);

    // Should contain margin
    expect(resultsText.toLowerCase()).toContain('margin');

    // Should contain profit
    expect(resultsText.toLowerCase()).toContain('profit');

    await calc.closeResults();
  });

  test('should handle zero margin (cost equals price)', async ({ page }) => {
    await calc.setNoTaxPromo(false);
    await calc.setupItems([
      { name: 'Break-even Item', price: 600, landingCost: 600, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Margin should be 0%
    const marginLocator = calc.resultsContent.locator('.badge').first();
    await expectMargin(marginLocator, 0, 1);

    // Should show as too low (red)
    const statusLocator = calc.resultsContent.locator('.badge').first();
    await expect(statusLocator).toContainText(/Too Low|✗/i);

    await calc.closeResults();
  });

  test('should require landing cost', async ({ page }) => {
    // Don't set landing cost
    await calc.setupItems([
      { name: 'Sofa', price: 1200, quantity: 1 }
    ]);

    await calc.calculate();

    // Results should not show
    const isVisible = await calc.isResultsVisible();
    expect(isVisible).toBeFalsy();

    const errorText = calc.page.locator('.error-text').filter({ hasText: /landing/i });
    await expect(errorText).toBeVisible();
  });

  test('should handle profit per unit with quantities', async ({ page }) => {
    await calc.setupItems([
      { name: 'Chair', price: 400, landingCost: 200, quantity: 3 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Per unit profit: $400 - $200 = $200
    // Total profit: $200 * 3 = $600
    const resultsText = await calc.resultsContent.textContent();

    // Should show total profit
    const profitLocator = calc.resultsContent.locator('text=/Total Profit/i').locator('..');
    await expectMoneyValue(profitLocator, 600, 1);

    await calc.closeResults();
  });
});
