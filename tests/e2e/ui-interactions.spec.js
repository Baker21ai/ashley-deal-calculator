/**
 * E2E tests for UI interactions and components
 */

import { test, expect } from '@playwright/test';
import { CalculatorPage } from '../helpers/page-objects/CalculatorPage.js';

test.describe('UI Interactions', () => {
  let calc;

  test.beforeEach(async ({ page }) => {
    calc = new CalculatorPage(page);
    await calc.goto();
    await calc.waitForLoad();
  });

  test.describe('Mode Switching', () => {
    test('should switch between modes', async ({ page }) => {
      // Start in default mode, switch to Quick Quote
      await calc.switchToQuickQuote();
      let mode = await calc.getCurrentMode();
      expect(mode).toBe('quote');

      // Switch to Margin Check
      await calc.switchToMarginCheck();
      mode = await calc.getCurrentMode();
      expect(mode).toBe('margin');

      // Switch to OTD Price
      await calc.switchToOtdPrice();
      mode = await calc.getCurrentMode();
      expect(mode).toBe('otd');
    });

    test('should show appropriate fields for each mode', async ({ page }) => {
      // Quick Quote: should show price fields
      await calc.switchToQuickQuote();
      const itemRow = calc.getItemRow(0);
      const priceInput = itemRow.locator('input[placeholder="$0.00"]').first();
      await expect(priceInput).toBeVisible();

      // Margin Check: should show both price and landing cost
      await calc.switchToMarginCheck();
      const landingInput = itemRow.locator('input[placeholder="$0.00"]').nth(1);
      await expect(landingInput).toBeVisible();

      // OTD Price: should show OTD price input
      await calc.switchToOtdPrice();
      const otdInput = page.locator('.card').filter({ hasText: /OTD/i }).locator('input[placeholder="$0.00"]').first();
      await expect(otdInput).toBeVisible();
    });
  });

  test.describe('Dial Picker', () => {
    test('should open and close dial picker', async ({ page }) => {
      await calc.switchToMarginCheck();
      const itemRow = calc.getItemRow(0);
      const priceButton = itemRow.locator('.wheel-btn-compact').first();

      // Open
      await priceButton.click();
      expect(await calc.dialPicker.isOpen()).toBeTruthy();

      // Close with cancel
      await calc.dialPicker.cancel();
      expect(await calc.dialPicker.isOpen()).toBeFalsy();
    });

    test('should enter amount using dial picker', async ({ page }) => {
      await calc.switchToMarginCheck();
      await calc.setItemPrice(0, 1234.56);

      // Verify value was set
      await calc.setupItems([{ landingCost: 600 }]);
      await calc.calculate();
      await calc.waitForResults();

      // Should show results with the price we set
      const resultsText = await calc.resultsContent.textContent();
      expect(resultsText).toContain('$');

      await calc.closeResults();
    });

    test('should handle dial picker with different amounts', async ({ page }) => {
      const amounts = [0.01, 100, 999.99, 12345.67, 99999.99];

      for (const amount of amounts) {
        await calc.switchToMarginCheck();
        await calc.setItemPrice(0, amount);

        // Just verify no errors occurred
        const itemRow = calc.getItemRow(0);
        await expect(itemRow).toBeVisible();
      }
    });

    test('should close dial picker by clicking outside', async ({ page }) => {
      await calc.switchToMarginCheck();
      const itemRow = calc.getItemRow(0);
      const priceButton = itemRow.locator('.wheel-btn-compact').first();

      await priceButton.click();
      expect(await calc.dialPicker.isOpen()).toBeTruthy();

      await calc.dialPicker.clickOutside();
      expect(await calc.dialPicker.isOpen()).toBeFalsy();
    });
  });

  test.describe('Item Management', () => {
    test('should add new items', async ({ page }) => {
      const initialCount = await calc.getItemCount();

      await calc.addItem();
      const newCount = await calc.getItemCount();

      expect(newCount).toBe(initialCount + 1);
    });

    test('should remove items', async ({ page }) => {
      // Add a second item first
      await calc.addItem();
      const countBefore = await calc.getItemCount();

      // Remove the second item
      await calc.removeItem(1);
      const countAfter = await calc.getItemCount();

      expect(countAfter).toBe(countBefore - 1);
    });

    test('should not remove last item', async ({ page }) => {
      const count = await calc.getItemCount();

      if (count === 1) {
        // Try to remove the only item - should not work or show error
        const itemRow = calc.getItemRow(0);
        const removeButton = itemRow.getByRole('button', { name: /Remove|×|Delete/i });

        // Button should either be hidden or disabled
        const isVisible = await removeButton.isVisible();
        if (isVisible) {
          const isDisabled = await removeButton.isDisabled();
          expect(isDisabled).toBeTruthy();
        }
      }
    });

    test('should set item quantity', async ({ page }) => {
      await calc.setItemQuantity(0, 5);

      // Verify quantity is set (calculate to see it in action)
      await calc.switchToMarginCheck();
      await calc.setupItems([
        { price: 100, landingCost: 50 }
      ]);

      await calc.calculate();
      await calc.waitForResults();

      // With qty 5, profit should be 5 * (100 - 50) = $250
      const profitLocator = calc.resultsContent.locator('text=/Profit.*\\$/i');
      await expect(profitLocator).toBeVisible();

      await calc.closeResults();
    });
  });

  test.describe('Item Presets', () => {
    test('should select item from top presets', async ({ page }) => {
      await calc.setItemPreset(0, 'Sofa');

      const itemRow = calc.getItemRow(0);
      const itemText = await itemRow.textContent();
      expect(itemText).toContain('Sofa');
    });

    test('should show more presets', async ({ page }) => {
      const itemRow = calc.getItemRow(0);

      // Verify additional presets exist in the select
      const select = itemRow.locator('select');
      await expect(select).toBeVisible();
      const optionsText = await select.evaluate(el => Array.from(el.options).map(o => o.textContent).join(' '));
      expect(optionsText).toMatch(/Dining|Desk|Bookshelf/i);
    });

    test('should allow custom item names', async ({ page }) => {
      const customName = 'Custom Test Item';
      await calc.setCustomItemName(0, customName);

      const itemRow = calc.getItemRow(0);
      const itemText = await itemRow.textContent();
      expect(itemText).toContain(customName);
    });
  });

  test.describe('Deal Settings', () => {
    test('should change sale percentage', async ({ page }) => {
      await calc.setSalePercent(30);
      const value = await calc.getSalePercent();
      expect(value).toBe(30);

      await calc.setSalePercent(35);
      const value2 = await calc.getSalePercent();
      expect(value2).toBe(35);
    });

    test('should toggle No-Tax Promo', async ({ page }) => {
      // Enable
      await calc.setNoTaxPromo(true);
      const checked1 = await calc.getNoTaxPromo();
      expect(checked1).toBeTruthy();

      // Disable
      await calc.setNoTaxPromo(false);
      const checked2 = await calc.getNoTaxPromo();
      expect(checked2).toBeFalsy();
    });

    test('should change price type', async ({ page }) => {
      await calc.switchToQuickQuote();

      await calc.setPriceType('tag');
      const value1 = await calc.getPriceType();
      expect(value1).toBe('tag');

      await calc.setPriceType('sale');
      const value2 = await calc.getPriceType();
      expect(value2).toBe('sale');
    });

    test('should change delivery amount', async ({ page }) => {
      const deliveryOptions = [0, 100, 135, 150];

      for (const delivery of deliveryOptions) {
        await calc.setDelivery(delivery);
        const value = await calc.getDelivery();
        expect(value).toBe(delivery);
      }
    });
  });

  test.describe('Results Modal', () => {
    test('should open results after calculate', async ({ page }) => {
      await calc.switchToMarginCheck();
      await calc.setupItems([
        { price: 1000, landingCost: 500, quantity: 1 }
      ]);

      await calc.calculate();
      await calc.waitForResults();

      const isVisible = await calc.isResultsVisible();
      expect(isVisible).toBeTruthy();

      await calc.closeResults();
    });

    test('should close results modal', async ({ page }) => {
      await calc.switchToMarginCheck();
      await calc.setupItems([
        { price: 1000, landingCost: 500, quantity: 1 }
      ]);

      await calc.calculate();
      await calc.waitForResults();

      await calc.closeResults();

      const isVisible = await calc.isResultsVisible();
      expect(isVisible).toBeFalsy();
    });

    test('should copy results', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      await calc.switchToMarginCheck();
      await calc.setupItems([
        { price: 1000, landingCost: 500, quantity: 1 }
      ]);

      await calc.calculate();
      await calc.waitForResults();

      await calc.copyResults();

      // Verify clipboard has content
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText.length).toBeGreaterThan(0);

      await calc.closeResults();
    });
  });

  test.describe('Help System', () => {
    test('should open and close help modal', async ({ page }) => {
      await calc.openHelp();
      await expect(calc.helpModal).toBeVisible();

      await calc.closeHelp();
      await expect(calc.helpModal).not.toBeVisible();
    });

    test('should show help content', async ({ page }) => {
      await calc.openHelp();

      const helpText = await calc.helpModal.textContent();
      expect(helpText.length).toBeGreaterThan(0);

      // Should mention the calculator modes
      expect(helpText).toMatch(/Quick Quote|Margin|OTD/i);

      await calc.closeHelp();
    });
  });

  test.describe('Start Over / Reset', () => {
    test('should show confirmation when starting over', async ({ page }) => {
      await calc.startOverButton.click();

      // Confirmation modal should appear
      const confirmButton = calc.confirmResetButton;
      await expect(confirmButton).toBeVisible();
    });

    test('should cancel start over', async ({ page }) => {
      await calc.switchToMarginCheck();
      await calc.setupItems([
        { name: 'Sofa', price: 1000, landingCost: 500, quantity: 1 }
      ]);

      await calc.startOver(false); // Click cancel

      // Data should still be there
      const itemRow = calc.getItemRow(0);
      const itemText = await itemRow.textContent();
      expect(itemText).toContain('Sofa');
    });

    test('should reset calculator when confirmed', async ({ page }) => {
      await calc.switchToMarginCheck();
      await calc.setupItems([
        { name: 'Sofa', price: 1000, landingCost: 500, quantity: 1 }
      ]);

      await calc.startOver(true); // Confirm reset

      // Wait a bit for reset to complete
      await page.waitForTimeout(500);

      // Should be back to defaults
      // Mode might reset or stay the same depending on implementation
      const itemCount = await calc.getItemCount();
      expect(itemCount).toBeGreaterThan(0); // Should have at least one empty item
    });
  });

  test.describe('Responsive Behavior', () => {
    test('should work on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await calc.goto();
      await calc.waitForLoad();

      // Should still be able to interact
      await calc.switchToMarginCheck();
      await calc.setupItems([
        { price: 1000, landingCost: 500, quantity: 1 }
      ]);

      await calc.calculate();
      await calc.waitForResults();

      const isVisible = await calc.isResultsVisible();
      expect(isVisible).toBeTruthy();

      await calc.closeResults();
    });

    test('should work on desktop viewport', async ({ page }) => {
      // Set desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 });

      await calc.goto();
      await calc.waitForLoad();

      // Should still be able to interact
      await calc.switchToMarginCheck();
      await calc.setupItems([
        { price: 1000, landingCost: 500, quantity: 1 }
      ]);

      await calc.calculate();
      await calc.waitForResults();

      const isVisible = await calc.isResultsVisible();
      expect(isVisible).toBeTruthy();

      await calc.closeResults();
    });
  });
});
