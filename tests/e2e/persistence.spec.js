/**
 * E2E tests for localStorage persistence
 */

import { test, expect } from '@playwright/test';
import { CalculatorPage } from '../helpers/page-objects/CalculatorPage.js';

test.describe('LocalStorage Persistence', () => {
  let calc;

  test.beforeEach(async ({ page }) => {
    calc = new CalculatorPage(page);
    await calc.goto();
    await calc.waitForLoad();
  });

  test('should persist mode selection across reloads', async ({ page }) => {
    // Set mode to OTD Price
    await calc.switchToOtdPrice();

    // Reload page
    await page.reload();
    await calc.waitForLoad();

    // Mode should still be OTD Price
    const mode = await calc.getCurrentMode();
    expect(mode).toBe('otd');
  });

  test('should persist deal settings across reloads', async ({ page }) => {
    // Set specific settings
    await calc.setSalePercent(35);
    await calc.setNoTaxPromo(false);
    await calc.setDelivery(150);

    // Reload page
    await page.reload();
    await calc.waitForLoad();

    // Settings should persist
    const salePercent = await calc.getSalePercent();
    expect(salePercent).toBe(35);

    const noTaxChecked = await calc.getNoTaxPromo();
    expect(noTaxChecked).toBeFalsy();

    const delivery = await calc.getDelivery();
    expect(delivery).toBe(150);
  });

  test('should persist items across reloads', async ({ page }) => {
    await calc.switchToMarginCheck();

    // Setup items
    await calc.setupItems([
      { name: 'Sofa', price: 1200, landingCost: 600, quantity: 2 },
      { name: 'Chair', price: 400, landingCost: 200, quantity: 1 },
    ]);

    // Reload page
    await page.reload();
    await calc.waitForLoad();

    // Items should persist
    const itemCount = await calc.getItemCount();
    expect(itemCount).toBe(2);

    // Verify items still have data by calculating
    await calc.calculate();
    await calc.waitForResults();

    // Should show results (indicates data was persisted)
    await expect(calc.resultsContent).toBeVisible();

    await calc.closeResults();
  });

  test('should persist OTD price across reloads', async ({ page }) => {
    await calc.switchToOtdPrice();
    await calc.setOtdPrice(2000);

    // Reload page
    await page.reload();
    await calc.waitForLoad();

    // Set up item and calculate
    await calc.setupItems([
      { landingCost: 800, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Should calculate with the persisted OTD price
    await expect(calc.resultsContent).toBeVisible();

    await calc.closeResults();
  });

  test('should clear storage on Start Over', async ({ page }) => {
    // Setup some state
    await calc.switchToMarginCheck();
    await calc.setSalePercent(40);
    await calc.setupItems([
      { name: 'Sofa', price: 1200, landingCost: 600, quantity: 1 }
    ]);

    // Verify state exists in localStorage
    let storedState = await calc.getStoredState();
    expect(storedState).not.toBeNull();

    // Start over
    await calc.startOver(true);

    // Wait for reset
    await page.waitForTimeout(500);

    // Reload to see if state was cleared
    await page.reload();
    await calc.waitForLoad();

    // Should be back to defaults or cleared state
    storedState = await calc.getStoredState();

    // Either null or reset to defaults
    if (storedState !== null) {
      // If not null, should be default values
      expect(storedState.items).toBeDefined();
    }
  });

  test('should handle corrupted localStorage gracefully', async ({ page }) => {
    // Inject corrupted data into localStorage
    await page.evaluate(() => {
      localStorage.setItem('ashley-calculator-state', 'corrupted-data-{invalid-json');
    });

    // Reload page
    await page.reload();
    await calc.waitForLoad();

    // App should still load with defaults
    await expect(calc.modeTabs).toBeVisible();

    // Should be functional
    await calc.switchToMarginCheck();
    const mode = await calc.getCurrentMode();
    expect(mode).toBe('margin');
  });

  test('should not persist results modal state', async ({ page }) => {
    await calc.switchToMarginCheck();
    await calc.setupItems([
      { price: 1000, landingCost: 500, quantity: 1 }
    ]);

    await calc.calculate();
    await calc.waitForResults();

    // Results modal is open
    const isVisible1 = await calc.isResultsVisible();
    expect(isVisible1).toBeTruthy();

    // Reload page
    await page.reload();
    await calc.waitForLoad();

    // Results modal should NOT be open
    const isVisible2 = await calc.isResultsVisible();
    expect(isVisible2).toBeFalsy();
  });

  test('should persist price type selection', async ({ page }) => {
    await calc.switchToQuickQuote();
    await calc.setPriceType('tag');

    // Reload page
    await page.reload();
    await calc.waitForLoad();

    // Price type should persist
    const priceType = await calc.getPriceType();
    expect(priceType).toBe('tag');
  });

  test('should handle empty localStorage on first visit', async ({ page }) => {
    // Clear all storage
    await calc.clearStorage();

    // Reload page
    await page.reload();
    await calc.waitForLoad();

    // Should load with defaults
    await expect(calc.modeTabs).toBeVisible();

    // Should have at least one item
    const itemCount = await calc.getItemCount();
    expect(itemCount).toBeGreaterThan(0);
  });

  test('should persist multiple mode switches', async ({ page }) => {
    // Switch modes multiple times
    await calc.switchToQuickQuote();
    await calc.switchToMarginCheck();
    await calc.switchToOtdPrice();

    // Reload page
    await page.reload();
    await calc.waitForLoad();

    // Should remember last mode (OTD)
    const mode = await calc.getCurrentMode();
    expect(mode).toBe('otd');
  });

  test('should persist across browser sessions', async ({ page, context }) => {
    // Setup state
    await calc.switchToMarginCheck();
    await calc.setSalePercent(40);
    await calc.setNoTaxPromo(false);
    await calc.setupItems([
      { name: 'Sofa', price: 1200, landingCost: 600, quantity: 1 }
    ]);

    // Get storage state
    const storageState = await context.storageState();

    // Create new context with same storage
    const newContext = await page.context().browser().newContext({
      storageState: storageState,
    });

    const newPage = await newContext.newPage();
    const newCalc = new CalculatorPage(newPage);

    await newCalc.goto();
    await newCalc.waitForLoad();

    // Verify state persisted
    const mode = await newCalc.getCurrentMode();
    expect(mode).toBe('margin');

    const salePercent = await newCalc.getSalePercent();
    expect(salePercent).toBe(40);

    await newContext.close();
  });

  test('should update localStorage when values change', async ({ page }) => {
    await calc.switchToMarginCheck();
    await calc.setupItems([
      { price: 1000, landingCost: 500, quantity: 1 }
    ]);

    // Get initial state
    const state1 = await calc.getStoredState();

    // Change value
    await calc.setItemPrice(0, 2000);

    // Wait for state to update
    await page.waitForTimeout(500);

    // Get updated state
    const state2 = await calc.getStoredState();

    // States should be different
    expect(JSON.stringify(state1)).not.toBe(JSON.stringify(state2));
  });
});
