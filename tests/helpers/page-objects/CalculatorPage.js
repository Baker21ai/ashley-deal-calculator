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
    this.settingsHeader = page.locator('.settings-accordion-header');
    this.settingsGrid = page.locator('.settings-grid').first();
    this.noTaxPromoToggle = page.locator('.toggle-compact').first();

    // Calculate button
    this.calculateButton = page.locator('.calc-btn-enhanced').first();

    // Results modal
    this.resultsModal = page.locator('.result-overlay').first();
    this.resultsContent = page.locator('.sheet-content').first();
    this.closeResultsButton = page.locator('.sheet-close').first();
    this.copyButton = page.locator('.copy-block').first();

    // Help and tutorial
    this.menuButton = page.locator('.header-menu-btn');
    this.menu = page.locator('.header-menu');
    this.helpButton = page.locator('.header-menu-item').filter({ hasText: /Help|❓/i }).first();
    this.helpModal = page.locator('.help-modal');
    this.helperOverlay = page.locator('.helper-overlay');
    this.helperNextButton = page.getByRole('button', { name: /Next/i });
    this.helperSkipButton = page.getByRole('button', { name: /Skip|Got it/i });

    // Start Over
    this.startOverButton = page.locator('.header-reset-btn').first();
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

  async ensureSettingsOpen() {
    const isVisible = await this.settingsGrid.isVisible().catch(() => false);
    if (!isVisible) {
      await this.settingsHeader.click();
      await this.settingsGrid.waitFor({ state: 'visible' });
    }
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
    await this.ensureSettingsOpen();
    const pill = this.page.locator('.pill-compact').filter({ hasText: `${percent}%` }).first();
    await pill.click();
  }

  /**
   * Toggle No-Tax Promo
   * @param {boolean} enabled - True to enable, false to disable
   */
  async setNoTaxPromo(enabled) {
    await this.ensureSettingsOpen();
    const toggle = this.noTaxPromoToggle;
    let className = await toggle.getAttribute('class');
    let isOn = className?.includes('on');
    if (enabled !== isOn) {
      await toggle.click({ force: true });
      className = await toggle.getAttribute('class');
      isOn = className?.includes('on');
      if (enabled !== isOn) {
        await toggle.click({ force: true });
      }
    }
  }

  /**
   * Set price type
   * @param {string} type - 'tag' or 'sale'
   */
  async setPriceType(type) {
    await this.ensureSettingsOpen();
    const normalized = String(type || '').toLowerCase();
    const isTag = normalized.includes('tag') || normalized.includes('retail');
    const label = isTag ? 'Retail' : 'Sale';
    const pill = this.page.locator('.pill-compact').filter({ hasText: new RegExp(`^${label}$`, 'i') }).first();
    await pill.click();
  }

  /**
   * Set delivery amount
   * @param {number} amount - Delivery amount (0, 100, 135, or 150)
   */
  async setDelivery(amount) {
    await this.ensureSettingsOpen();
    const pill = this.page.locator('.pill-compact').filter({ hasText: new RegExp(`^\\$${amount}$`) }).first();
    await pill.click();
  }

  async getSalePercent() {
    await this.ensureSettingsOpen();
    const selected = this.page.locator('.pill-compact.selected').filter({ hasText: /%/ }).first();
    const text = (await selected.textContent()) || '';
    return parseInt(text.replace('%', ''), 10);
  }

  async getNoTaxPromo() {
    await this.ensureSettingsOpen();
    const className = await this.noTaxPromoToggle.getAttribute('class');
    return className?.includes('on') || false;
  }

  async getPriceType() {
    await this.ensureSettingsOpen();
    const selected = this.page.locator('.pill-compact.selected').filter({ hasText: /Sale|Retail/i }).first();
    const text = (await selected.textContent()) || '';
    return /Retail/i.test(text) ? 'tag' : 'sale';
  }

  async getDelivery() {
    await this.ensureSettingsOpen();
    const selected = this.page.locator('.pill-compact.selected').filter({ hasText: /\$/ }).first();
    const text = (await selected.textContent()) || '';
    return parseInt(text.replace('$', ''), 10);
  }

  // ============ Item Management ============

  /**
   * Get item row locator by index (0-based)
   * @param {number} index - Item index
   */
  getItemRow(index) {
    return this.page.locator('.item-card-compact, [data-item]').nth(index);
  }

  /**
   * Get total number of items
   */
  async getItemCount() {
    return await this.page.locator('.item-card-compact, [data-item]').count();
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
    const backButton = itemRow.getByRole('button', { name: /Back to presets/i });
    if (await backButton.isVisible().catch(() => false)) {
      await backButton.click();
    }
    const select = itemRow.locator('select');
    await select.selectOption({ label: presetName });
  }

  /**
   * Set custom item name
   * @param {number} itemIndex - Item index (0-based)
   * @param {string} name - Custom item name
   */
  async setCustomItemName(itemIndex, name) {
    const itemRow = this.getItemRow(itemIndex);
    const select = itemRow.locator('select');
    if (await select.isVisible().catch(() => false)) {
      await select.selectOption({ value: 'custom' });
    }
    const nameInput = itemRow.locator('input[type="text"]').first();
    await nameInput.fill(name);
    await nameInput.blur();
  }

  /**
   * Set item price using dial picker
   * @param {number} itemIndex - Item index (0-based)
   * @param {number} price - Price amount
   */
  async setItemPrice(itemIndex, price) {
    const itemRow = this.getItemRow(itemIndex);
    const wheelButton = itemRow.locator('.wheel-btn-compact').first();
    if (await wheelButton.isVisible()) {
      await wheelButton.click();
      await this.dialPicker.enterAndConfirm(price);
      return;
    }
    const priceInput = itemRow.locator('input[placeholder="$0.00"]').first();
    await priceInput.fill(`${price}`);
  }

  /**
   * Set item landing cost using dial picker
   * @param {number} itemIndex - Item index (0-based)
   * @param {number} cost - Landing cost amount
   */
  async setItemLandingCost(itemIndex, cost) {
    const itemRow = this.getItemRow(itemIndex);
    const wheelButtons = itemRow.locator('.wheel-btn-compact');
    const count = await wheelButtons.count();
    const targetIndex = count > 1 ? 1 : 0;
    const wheelButton = wheelButtons.nth(targetIndex);
    if (await wheelButton.isVisible()) {
      await wheelButton.click();
      await this.dialPicker.enterAndConfirm(cost);
      return;
    }
    const inputs = itemRow.locator('input[placeholder="$0.00"]');
    const inputIndex = count > 1 ? 1 : 0;
    await inputs.nth(inputIndex).fill(`${cost}`);
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
    const otdCard = this.page.locator('.card').filter({ hasText: /OTD/i }).first();
    const wheelButton = otdCard.locator('.wheel-btn').first();
    if (await wheelButton.isVisible()) {
      await wheelButton.click();
      await this.dialPicker.enterAndConfirm(price);
      return;
    }
    const input = otdCard.locator('input[placeholder="$0.00"]').first();
    await input.fill(`${price}`);
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

  async openResultSection(title) {
    const section = this.resultsContent.locator('details.result-section').filter({ hasText: title }).first();
    const isOpen = await section.getAttribute('open');
    if (isOpen === null) {
      await section.locator('summary').click();
    }
    return section;
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
    await this.menuButton.click();
    await this.helpButton.click();
    await this.helpModal.waitFor({ state: 'visible' });
  }

  /**
   * Close help modal
   */
  async closeHelp() {
    const closeButton = this.helpModal.getByRole('button', { name: /Got it|Close|×/i });
    await closeButton.click();
  }

  /**
   * Start tutorial/helper
   */
  async startHelper() {
    await this.menuButton.click();
    const helperButton = this.page.locator('.header-menu-item').filter({ hasText: /Guide|Helper|Tutorial/i }).first();
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

    const priceValue = itemData.price !== undefined
      ? itemData.price
      : itemData.salePrice !== undefined
        ? itemData.salePrice
        : itemData.tagPrice !== undefined
          ? itemData.tagPrice
          : undefined;

    if (priceValue !== undefined) {
      await this.setItemPrice(itemIndex, priceValue);
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
