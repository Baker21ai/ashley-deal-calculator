/**
 * Page Object for the Ashley Deal Calculator
 * Encapsulates all calculator interactions for testing
 */

import { DialPicker } from './DialPicker.js';

export class CalculatorPage {
  constructor(page) {
    this.page = page;
    this.dialPicker = new DialPicker(page);

    // Mode tabs
    this.modeTabs = page.locator('.mode-tabs');
    this.quickQuoteTab = page.locator('.mode-tab').filter({ hasText: /Quick|💵/ }).first();
    this.marginCheckTab = page.locator('.mode-tab').filter({ hasText: /Margin|📊/ }).first();
    this.otdPriceTab = page.locator('.mode-tab').filter({ hasText: /OTD|🎯/ }).first();

    // Deal settings
    this.salePercentSelect = page.locator('select').filter({ hasText: /30%|35%|40%/ }).or(page.locator('select').first());
    this.noTaxPromoToggle = page.getByRole('checkbox').filter({ hasText: /No-Tax Promo|tax promo/i }).or(
      page.locator('label').filter({ hasText: /No-Tax Promo/i }).locator('input')
    );
    this.priceTypeSelect = page.locator('select').filter({ hasText: /Tag Price|Sale Price/ }).or(page.locator('select').nth(1));
    this.deliverySelect = page.locator('select').filter({ hasText: /\$/ }).or(page.locator('select').last());

    // Calculate button
    this.calculateButton = page.getByRole('button', { name: /Calculate|Get Quote|Check|Analyze/i });

    // Results modal
    this.resultsModal = page.locator('.results-overlay, .modal-overlay').first();
    this.resultsContent = page.locator('.results-modal, .modal-content').first();
    this.closeResultsButton = page.getByRole('button', { name: /Close|×/ }).first();
    this.copyButton = page.getByRole('button', { name: /Copy/i });

    // Help and tutorial
    this.helpButton = page.getByRole('button', { name: /Help|\?/i });
    this.helpModal = page.locator('.help-modal');
    this.helperOverlay = page.locator('.helper-overlay');
    this.helperNextButton = page.getByRole('button', { name: /Next/i });
    this.helperSkipButton = page.getByRole('button', { name: /Skip|Got it/i });

    // Start Over
    this.startOverButton = page.getByRole('button', { name: /Start Over|Reset/i });
    this.confirmResetButton = page.getByRole('button', { name: /Yes|Confirm/i });
    this.cancelResetButton = page.getByRole('button', { name: /No|Cancel/i });
  }

  /**
   * Navigate to the calculator
   */
  async goto() {
    await this.page.goto('/');
  }

  /**
   * Wait for calculator to load
   */
  async waitForLoad() {
    await this.modeTabs.waitFor({ state: 'visible' });
  }

  // ============ Mode Selection ============

  /**
   * Switch to Quick Quote mode
   */
  async switchToQuickQuote() {
    await this.quickQuoteTab.click();
  }

  /**
   * Switch to Margin Check mode
   */
  async switchToMarginCheck() {
    await this.marginCheckTab.click();
  }

  /**
   * Switch to OTD Price mode
   */
  async switchToOtdPrice() {
    await this.otdPriceTab.click();
  }

  /**
   * Get current mode
   */
  async getCurrentMode() {
    const isQuickQuote = await this.quickQuoteTab.getAttribute('class').then(c => c.includes('active'));
    const isMarginCheck = await this.marginCheckTab.getAttribute('class').then(c => c.includes('active'));
    const isOtdPrice = await this.otdPriceTab.getAttribute('class').then(c => c.includes('active'));

    if (isQuickQuote) return 'quote';
    if (isMarginCheck) return 'margin';
    if (isOtdPrice) return 'otd';
    return null;
  }

  // ============ Deal Settings ============

  /**
   * Set sale percentage
   * @param {number} percent - Sale percentage (30, 35, or 40)
   */
  async setSalePercent(percent) {
    await this.salePercentSelect.selectOption(`${percent}`);
  }

  /**
   * Toggle No-Tax Promo
   * @param {boolean} enabled - True to enable, false to disable
   */
  async setNoTaxPromo(enabled) {
    const checkbox = this.noTaxPromoToggle;
    const isChecked = await checkbox.isChecked();

    if (enabled !== isChecked) {
      await checkbox.click();
    }
  }

  /**
   * Set price type
   * @param {string} type - 'tag' or 'sale'
   */
  async setPriceType(type) {
    const value = type === 'tag' ? 'tag' : 'sale';
    await this.priceTypeSelect.selectOption(value);
  }

  /**
   * Set delivery amount
   * @param {number} amount - Delivery amount (0, 100, 135, or 150)
   */
  async setDelivery(amount) {
    await this.deliverySelect.selectOption(`${amount}`);
  }

  // ============ Item Management ============

  /**
   * Get item row locator by index (0-based)
   * @param {number} index - Item index
   */
  getItemRow(index) {
    return this.page.locator('.item-row, .item-card, [data-item]').nth(index);
  }

  /**
   * Get total number of items
   */
  async getItemCount() {
    return await this.page.locator('.item-row, .item-card, [data-item]').count();
  }

  /**
   * Add a new item
   */
  async addItem() {
    const addButton = this.page.getByRole('button', { name: /Add Item|\+/i });
    await addButton.click();
  }

  /**
   * Remove item by index
   * @param {number} index - Item index (0-based)
   */
  async removeItem(index) {
    const itemRow = this.getItemRow(index);
    const removeButton = itemRow.getByRole('button', { name: /Remove|×|Delete/i });
    await removeButton.click();
  }

  /**
   * Set item name using preset
   * @param {number} itemIndex - Item index (0-based)
   * @param {string} presetName - Preset name (e.g., 'Sofa', 'Mattress')
   */
  async setItemPreset(itemIndex, presetName) {
    const itemRow = this.getItemRow(itemIndex);
    const presetButton = itemRow.getByRole('button', { name: presetName });

    // Check if preset is in "More" section
    if (!(await presetButton.isVisible())) {
      const moreButton = itemRow.getByRole('button', { name: /More|\.\.\./ });
      if (await moreButton.isVisible()) {
        await moreButton.click();
      }
    }

    await presetButton.click();
  }

  /**
   * Set custom item name
   * @param {number} itemIndex - Item index (0-based)
   * @param {string} name - Custom item name
   */
  async setCustomItemName(itemIndex, name) {
    const itemRow = this.getItemRow(itemIndex);

    // Click "Custom" button to show input
    const customButton = itemRow.getByRole('button', { name: /Custom|Other/ });
    await customButton.click();

    // Enter custom name
    const nameInput = itemRow.locator('input[type="text"]').first();
    await nameInput.fill(name);
    await nameInput.blur(); // Trigger save
  }

  /**
   * Set item price using dial picker
   * @param {number} itemIndex - Item index (0-based)
   * @param {number} price - Price amount
   */
  async setItemPrice(itemIndex, price) {
    const itemRow = this.getItemRow(itemIndex);
    const priceButton = itemRow.locator('button').filter({ hasText: /Price|\$/ }).first();

    await priceButton.click();
    await this.dialPicker.enterAndConfirm(price);
  }

  /**
   * Set item landing cost using dial picker
   * @param {number} itemIndex - Item index (0-based)
   * @param {number} cost - Landing cost amount
   */
  async setItemLandingCost(itemIndex, cost) {
    const itemRow = this.getItemRow(itemIndex);
    const costButton = itemRow.locator('button').filter({ hasText: /Landing|Cost/ }).first();

    await costButton.click();
    await this.dialPicker.enterAndConfirm(cost);
  }

  /**
   * Set item quantity
   * @param {number} itemIndex - Item index (0-based)
   * @param {number} quantity - Quantity
   */
  async setItemQuantity(itemIndex, quantity) {
    const itemRow = this.getItemRow(itemIndex);
    const qtyInput = itemRow.locator('input[type="number"]').or(itemRow.locator('input').filter({ hasText: /qty|quantity/i }));

    await qtyInput.fill(`${quantity}`);
  }

  /**
   * Click margin target for an item (Margin Check mode)
   * @param {number} itemIndex - Item index (0-based)
   * @param {number} targetMargin - Target margin (47, 48, 49, or 50)
   */
  async clickMarginTarget(itemIndex, targetMargin) {
    const itemRow = this.getItemRow(itemIndex);
    const targetButton = itemRow.getByRole('button', { name: new RegExp(`${targetMargin}%`) });
    await targetButton.click();
  }

  // ============ OTD Price ============

  /**
   * Set OTD price using dial picker
   * @param {number} price - OTD price amount
   */
  async setOtdPrice(price) {
    const otdButton = this.page.locator('button').filter({ hasText: /OTD|Out.*Door/i }).first();
    await otdButton.click();
    await this.dialPicker.enterAndConfirm(price);
  }

  // ============ Calculate & Results ============

  /**
   * Click Calculate button
   */
  async calculate() {
    await this.calculateButton.click();
  }

  /**
   * Wait for results modal to appear
   */
  async waitForResults() {
    await this.resultsModal.waitFor({ state: 'visible' });
  }

  /**
   * Check if results modal is visible
   */
  async isResultsVisible() {
    return await this.resultsModal.isVisible();
  }

  /**
   * Close results modal
   */
  async closeResults() {
    await this.closeResultsButton.click();
    await this.resultsModal.waitFor({ state: 'hidden' });
  }

  /**
   * Copy results to clipboard
   */
  async copyResults() {
    await this.copyButton.click();
  }

  /**
   * Get result value by label
   * @param {string} label - Label text (e.g., 'Total', 'Margin', 'Profit')
   */
  getResultLocator(label) {
    return this.resultsContent.locator(`text=${label}`).locator('..').locator('text=/\\$|\\d+%/');
  }

  // ============ Help & Tutorial ============

  /**
   * Open help modal
   */
  async openHelp() {
    await this.helpButton.click();
    await this.helpModal.waitFor({ state: 'visible' });
  }

  /**
   * Close help modal
   */
  async closeHelp() {
    const closeButton = this.helpModal.getByRole('button', { name: /Close|×/ });
    await closeButton.click();
  }

  /**
   * Start tutorial/helper
   */
  async startHelper() {
    const helperButton = this.page.getByRole('button', { name: /Tutorial|Helper|Guide/i });
    await helperButton.click();
  }

  /**
   * Go to next helper step
   */
  async nextHelperStep() {
    await this.helperNextButton.click();
  }

  /**
   * Skip/dismiss helper
   */
  async skipHelper() {
    await this.helperSkipButton.click();
  }

  // ============ Reset/Start Over ============

  /**
   * Start over (reset calculator)
   * @param {boolean} confirm - Whether to confirm the reset
   */
  async startOver(confirm = true) {
    await this.startOverButton.click();

    if (confirm) {
      await this.confirmResetButton.click();
    } else {
      await this.cancelResetButton.click();
    }
  }

  // ============ LocalStorage ============

  /**
   * Clear localStorage
   */
  async clearStorage() {
    await this.page.evaluate(() => localStorage.clear());
  }

  /**
   * Get stored state from localStorage
   */
  async getStoredState() {
    return await this.page.evaluate(() => {
      const data = localStorage.getItem('ashley-calculator-state');
      return data ? JSON.parse(data) : null;
    });
  }

  /**
   * Set stored state in localStorage
   * @param {Object} state - State object to store
   */
  async setStoredState(state) {
    await this.page.evaluate((stateStr) => {
      localStorage.setItem('ashley-calculator-state', stateStr);
    }, JSON.stringify(state));
  }

  // ============ Utility Methods ============

  /**
   * Setup a complete item with all fields
   * @param {number} itemIndex - Item index (0-based)
   * @param {Object} itemData - Item data {name, price, landingCost, quantity}
   */
  async setupItem(itemIndex, itemData) {
    if (itemData.name) {
      // Check if it's a preset or custom name
      const presets = ['Sofa', 'Loveseat', 'Chair', 'Ottoman', 'Recliner', 'Sectional',
                       'Bed', 'Mattress', 'Nightstand', 'Dresser', 'Chest', 'Mirror',
                       'Dining Table', 'Dining Chair', 'Buffet', 'Coffee Table',
                       'End Table', 'Console Table', 'TV Stand', 'Bookcase'];

      if (presets.includes(itemData.name)) {
        await this.setItemPreset(itemIndex, itemData.name);
      } else {
        await this.setCustomItemName(itemIndex, itemData.name);
      }
    }

    if (itemData.price !== undefined) {
      await this.setItemPrice(itemIndex, itemData.price);
    }

    if (itemData.landingCost !== undefined) {
      await this.setItemLandingCost(itemIndex, itemData.landingCost);
    }

    if (itemData.quantity !== undefined) {
      await this.setItemQuantity(itemIndex, itemData.quantity);
    }
  }

  /**
   * Setup multiple items
   * @param {Array} items - Array of item data objects
   */
  async setupItems(items) {
    for (let i = 0; i < items.length; i++) {
      // Add item if needed (first item already exists)
      if (i > 0) {
        await this.addItem();
      }

      await this.setupItem(i, items[i]);
    }
  }

  /**
   * Setup deal settings
   * @param {Object} settings - Settings object {salePercent, noTaxPromo, priceType, delivery}
   */
  async setupDealSettings(settings) {
    if (settings.salePercent !== undefined) {
      await this.setSalePercent(settings.salePercent);
    }

    if (settings.noTaxPromo !== undefined) {
      await this.setNoTaxPromo(settings.noTaxPromo);
    }

    if (settings.priceType !== undefined) {
      await this.setPriceType(settings.priceType);
    }

    if (settings.delivery !== undefined) {
      await this.setDelivery(settings.delivery);
    }
  }
}
