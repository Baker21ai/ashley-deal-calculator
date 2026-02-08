/**
 * Page Object for the Scroll Wheel Picker component
 * Handles money input using the custom dial/wheel interface
 */

export class DialPicker {
  constructor(page) {
    this.page = page;

    // Wheel picker selectors
    this.overlay = page.locator('.wheel-overlay');
    this.modal = page.locator('.wheel-modal');
    this.title = page.locator('.wheel-title');
    this.display = page.locator('.wheel-display');
    this.cancelButton = page.locator('.wheel-cancel');
    this.confirmButton = page.locator('.wheel-confirm');

    // Column selectors
    this.columns = {
      thousands: {
        up: page.locator('.wheel-column.wide .wheel-arrow').first(),
        down: page.locator('.wheel-column.wide .wheel-arrow').last(),
        value: page.locator('.wheel-column.wide .wheel-value'),
      },
      hundreds: {
        up: page.locator('.wheel-column').nth(1).locator('.wheel-arrow').first(),
        down: page.locator('.wheel-column').nth(1).locator('.wheel-arrow').last(),
        value: page.locator('.wheel-column').nth(1).locator('.wheel-value'),
      },
      tens: {
        up: page.locator('.wheel-column').nth(2).locator('.wheel-arrow').first(),
        down: page.locator('.wheel-column').nth(2).locator('.wheel-arrow').last(),
        value: page.locator('.wheel-column').nth(2).locator('.wheel-value'),
      },
      ones: {
        up: page.locator('.wheel-column').nth(3).locator('.wheel-arrow').first(),
        down: page.locator('.wheel-column').nth(3).locator('.wheel-arrow').last(),
        value: page.locator('.wheel-column').nth(3).locator('.wheel-value'),
      },
      tenCents: {
        up: page.locator('.wheel-column').nth(4).locator('.wheel-arrow').first(),
        down: page.locator('.wheel-column').nth(4).locator('.wheel-arrow').last(),
        value: page.locator('.wheel-column').nth(4).locator('.wheel-value'),
      },
      cents: {
        up: page.locator('.wheel-column').nth(5).locator('.wheel-arrow').first(),
        down: page.locator('.wheel-column').nth(5).locator('.wheel-arrow').last(),
        value: page.locator('.wheel-column').nth(5).locator('.wheel-value'),
      },
    };
  }

  /**
   * Wait for picker to be visible
   */
  async waitForVisible() {
    await this.modal.waitFor({ state: 'visible' });
  }

  /**
   * Check if picker is open
   */
  async isOpen() {
    return await this.modal.isVisible();
  }

  /**
   * Get current display value
   */
  async getDisplayValue() {
    const text = await this.display.textContent();
    return parseFloat(text.replace(/[$,]/g, ''));
  }

  /**
   * Get title text (e.g., "Set Price", "Set Landing Cost", "Set OTD Price")
   */
  async getTitle() {
    return await this.title.textContent();
  }

  /**
   * Click up arrow for a specific column
   * @param {string} column - Column name (thousands, hundreds, tens, ones, tenCents, cents)
   * @param {number} times - Number of times to click (default 1)
   */
  async clickUp(column, times = 1) {
    for (let i = 0; i < times; i++) {
      await this.columns[column].up.click();
    }
  }

  /**
   * Click down arrow for a specific column
   * @param {string} column - Column name (thousands, hundreds, tens, ones, tenCents, cents)
   * @param {number} times - Number of times to click (default 1)
   */
  async clickDown(column, times = 1) {
    for (let i = 0; i < times; i++) {
      await this.columns[column].down.click();
    }
  }

  /**
   * Set value for a specific column
   * @param {string} column - Column name
   * @param {number} targetValue - Target value (0-9 for most columns, 0-99 for thousands)
   */
  async setColumnValue(column, targetValue) {
    const currentText = await this.columns[column].value.textContent();
    const currentValue = parseInt(currentText);
    const diff = targetValue - currentValue;

    if (diff > 0) {
      await this.clickUp(column, diff);
    } else if (diff < 0) {
      await this.clickDown(column, Math.abs(diff));
    }
  }

  /**
   * Enter a specific dollar amount (e.g., 1234.56)
   * @param {number} amount - Dollar amount to enter
   */
  async enterAmount(amount) {
    await this.waitForVisible();

    // Break down the amount into components
    const dollars = Math.floor(amount);
    const cents = Math.round((amount - dollars) * 100);

    const thousands = Math.floor(dollars / 1000);
    const hundreds = Math.floor((dollars % 1000) / 100);
    const tens = Math.floor((dollars % 100) / 10);
    const ones = dollars % 10;
    const tenCents = Math.floor(cents / 10);
    const oneCents = cents % 10;

    // Set each column
    await this.setColumnValue('thousands', thousands);
    await this.setColumnValue('hundreds', hundreds);
    await this.setColumnValue('tens', tens);
    await this.setColumnValue('ones', ones);
    await this.setColumnValue('tenCents', tenCents);
    await this.setColumnValue('cents', oneCents);
  }

  /**
   * Clear all values (set to $0.00)
   */
  async clear() {
    await this.waitForVisible();
    await this.setColumnValue('thousands', 0);
    await this.setColumnValue('hundreds', 0);
    await this.setColumnValue('tens', 0);
    await this.setColumnValue('ones', 0);
    await this.setColumnValue('tenCents', 0);
    await this.setColumnValue('cents', 0);
  }

  /**
   * Confirm and close the picker
   */
  async confirm() {
    await this.confirmButton.click();
    await this.modal.waitFor({ state: 'hidden' });
  }

  /**
   * Cancel and close the picker
   */
  async cancel() {
    await this.cancelButton.click();
    await this.modal.waitFor({ state: 'hidden' });
  }

  /**
   * Complete flow: enter amount and confirm
   * @param {number} amount - Dollar amount to enter
   */
  async enterAndConfirm(amount) {
    await this.enterAmount(amount);
    await this.confirm();
  }

  /**
   * Click outside to close picker
   */
  async clickOutside() {
    await this.overlay.click({ position: { x: 5, y: 5 } });
    await this.modal.waitFor({ state: 'hidden' });
  }
}
