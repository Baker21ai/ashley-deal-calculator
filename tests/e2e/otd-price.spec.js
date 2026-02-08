/**
 * E2E tests for OTD Price mode
 */

import { test, expect } from '@playwright/test';
import { CalculatorPage } from '../helpers/page-objects/CalculatorPage.js';
import { expectMoneyValue, expectMargin } from '../helpers/utils/assertions.js';
import { otdPriceScenarios } from '../fixtures/calculation-scenarios.js';
import { DELIVERY_OPTIONS } from '../fixtures/test-data.js';

test.describe('OTD Price Mode', () => {
  let calc;

  test.beforeEach(async ({ page }) => {
    calc = new CalculatorPage(page);
    await calc.goto();
    await calc.waitForLoad();
    await calc.switchToOtdPrice();
  });

  test('should analyze approved deal (high margin)', async ({ page }) => {
    const scenario = otdPriceScenarios.approvedDeal;

    await calc.setupDealSettings(scenario.settings);
    await calc.setupItems(scenario.items);
    await calc.setOtdPrice(scenario.settings.otdPrice);

    await calc.calculate();
    await calc.waitForResults();

    // Verify margin is shown (should be ~53%)
    const marginLocator = calc.resultsContent.locator('text=/5[0-9].*%/').first();
    await expectMargin(marginLocator, scenario.expected.margin, 2);

    // Verify status is Approved
    const statusLocator = calc.resultsContent.locator('text=/Approved|✓|Great/i');
    await expect(statusLocator).toBeVisible();

    await calc.closeResults();
  });

  test('should analyze deal needing manager approval', async ({ page }) => {
    const scenario = otdPriceScenarios.managerApproval;

    await calc.setupDealSettings(scenario.settings);
    await calc.setupItems(scenario.items);
    await calc.setOtdPrice(scenario.settings.otdPrice);

    await calc.calculate();
    await calc.waitForResults();

    // Should show low margin status
    const resultsText = await calc.resultsContent.textContent();
    expect(resultsText).toMatch(/Too Low|Manager|✗/i);

    await calc.closeResults();
  });

  test('should back out delivery and tax correctly', async ({ page }) => {
    // Customer offers $2000 OTD, $135 delivery, $800 landing
    await calc.setDelivery(DELIVERY_OPTIONS.STANDARD);
    await calc.setupItems([
      { name: 'Sofa', landingCost: 800, quantity: 1 }
    ]);
    await calc.setOtdPrice(2000);

    await calc.calculate();
    await calc.waitForResults();

    // Back out delivery: $2000 - $135 = $1865
    // Back out tax: $1865 / 1.09125 = $1708.54
    // Margin: ($1708.54 - $800) / $1708.54 = 53.18%
    const marginLocator = calc.resultsContent.locator('text=/5[0-9].*%/').first();
    await expectMargin(marginLocator, 53, 2);

    await calc.closeResults();
  });

  test('should show correct status badge for different margins', async ({ page }) => {
    const testCases = [
      { otdPrice: 2500, expectedStatus: /Approved|Great|✓/i }, // High margin
      { otdPrice: 1700, expectedStatus: /OK|⚠/i },             // Medium margin
      { otdPrice: 1500, expectedStatus: /Too Low|✗/i },        // Low margin
    ];

    for (const testCase of testCases) {
      await calc.setDelivery(DELIVERY_OPTIONS.STANDARD);
      await calc.setupItems([
        { name: 'Sofa', landingCost: 800, quantity: 1 }
      ]);
      await calc.setOtdPrice(testCase.otdPrice);

      await calc.calculate();
      await calc.waitForResults();

      // Verify status
      const statusLocator = calc.resultsContent.locator(`text=${testCase.expectedStatus}`);
      await expect(statusLocator).toBeVisible();

      await calc.closeResults();
    }
  });

  test('should calculate with multiple items', async ({ page }) => {
    const scenario = otdPriceScenarios.multipleItemsOtd;

    await calc.setupDealSettings(scenario.settings);
    await calc.setupItems(scenario.items);
    await calc.setOtdPrice(scenario.settings.otdPrice);

    await calc.calculate();
    await calc.waitForResults();

    // Verify margin is calculated correctly for multiple items
    const marginLocator = calc.resultsContent.locator('text=/5[0-9].*%/').first();
    await expectMargin(marginLocator, scenario.expected.margin, 2);

    await calc.closeResults();
  });

  test('should handle different delivery amounts', async ({ page }) => {
    const deliveryAmounts = [0, 100, 135, 150];

    for (const deliveryAmount of deliveryAmounts) {
      await calc.setDelivery(deliveryAmount);
      await calc.setupItems([
        { name: 'Sofa', landingCost: 600, quantity: 1 }
      ]);
      await calc.setOtdPrice(2000);

      await calc.calculate();
      await calc.waitForResults();

      // Verify calculation completes
      const marginLocator = calc.resultsContent.locator('text=/\\d+.*%/').first();
      await expect(marginLocator).toBeVisible();

      await calc.closeResults();
    }
  });

  test('should show counter-offer prices for each margin level', async ({ page }) => {
    await calc.setDelivery(DELIVERY_OPTIONS.STANDARD);
    await calc.setupItems([
      { name: 'Sofa', landingCost: 800, quantity: 1 }
    ]);
    await calc.setOtdPrice(1500); // Low offer

    await calc.calculate();
    await calc.waitForResults();

    // Should show counter-offer suggestions
    const resultsText = await calc.resultsContent.textContent();

    // Look for margin targets (47%, 48%, 49%, 50%)
    expect(resultsText).toMatch(/47%|48%|49%|50%/);

    // Should show OTD prices for each target
    expect(resultsText).toContain('$');

    await calc.closeResults();
  });

  test('should require landing cost and OTD price', async ({ page }) => {
    // Try without OTD price
    await calc.setupItems([
      { name: 'Sofa', landingCost: 800, quantity: 1 }
    ]);

    // Don't set OTD price

    page.on('dialog', async dialog => {
      expect(dialog.message().toLowerCase()).toMatch(/otd|price/i);
      await dialog.accept();
    });

    await calc.calculate();

    // Results should not show
    const isVisible = await calc.isResultsVisible();
    expect(isVisible).toBeFalsy();
  });

  test('should calculate profit amount correctly', async ({ page }) => {
    await calc.setDelivery(DELIVERY_OPTIONS.STANDARD);
    await calc.setupItems([
      { name: 'Sofa', landingCost: 800, quantity: 1 }
    ]);
    await calc.setOtdPrice(2000);

    await calc.calculate();
    await calc.waitForResults();

    // Back out delivery: $2000 - $135 = $1865
    // Back out tax: $1865 / 1.09125 = $1708.54
    // Profit: $1708.54 - $800 = $908.54
    const profitLocator = calc.resultsContent.locator('text=/Profit.*\\$/i');
    await expectMoneyValue(profitLocator, 908, 2);

    await calc.closeResults();
  });

  test('should handle zero delivery', async ({ page }) => {
    await calc.setDelivery(0);
    await calc.setupItems([
      { name: 'Sofa', landingCost: 800, quantity: 1 }
    ]);
    await calc.setOtdPrice(2000);

    await calc.calculate();
    await calc.waitForResults();

    // Back out tax only: $2000 / 1.09125 = $1832.12
    // Margin: ($1832.12 - $800) / $1832.12 = 56.34%
    const marginLocator = calc.resultsContent.locator('text=/5[0-9].*%/').first();
    await expectMargin(marginLocator, 56, 2);

    await calc.closeResults();
  });

  test('should recalculate when OTD price changes', async ({ page }) => {
    await calc.setDelivery(DELIVERY_OPTIONS.STANDARD);
    await calc.setupItems([
      { name: 'Sofa', landingCost: 800, quantity: 1 }
    ]);

    // First calculation
    await calc.setOtdPrice(2000);
    await calc.calculate();
    await calc.waitForResults();

    const margin1 = await calc.resultsContent.locator('text=/\\d+.*%/').first().textContent();
    await calc.closeResults();

    // Change OTD price
    await calc.setOtdPrice(2500);
    await calc.calculate();
    await calc.waitForResults();

    const margin2 = await calc.resultsContent.locator('text=/\\d+.*%/').first().textContent();

    // Margins should be different
    expect(margin1).not.toBe(margin2);

    await calc.closeResults();
  });

  test('should handle quantities in total landing calculation', async ({ page }) => {
    await calc.setDelivery(DELIVERY_OPTIONS.STANDARD);
    await calc.setupItems([
      { name: 'Chair', landingCost: 200, quantity: 3 }
    ]);
    await calc.setOtdPrice(1000);

    await calc.calculate();
    await calc.waitForResults();

    // Total landing: $200 * 3 = $600
    // Back out delivery: $1000 - $135 = $865
    // Back out tax: $865 / 1.09125 = $792.57
    // Margin: ($792.57 - $600) / $792.57 = 24.30%
    const marginLocator = calc.resultsContent.locator('text=/2[0-9].*%/').first();
    await expectMargin(marginLocator, 24, 2);

    await calc.closeResults();
  });
});
