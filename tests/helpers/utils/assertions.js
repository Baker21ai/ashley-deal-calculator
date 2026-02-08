/**
 * Custom assertion helpers for Ashley Deal Calculator tests
 */

import { expect } from '@playwright/test';
import { parseMoneyString, parsePercentString, almostEqual } from './calculations.js';

/**
 * Assert a money value matches expected amount within tolerance
 * @param {Locator} locator - Playwright locator
 * @param {number} expectedAmount - Expected dollar amount
 * @param {number} tolerance - Acceptable difference (default 0.01)
 */
export async function expectMoneyValue(locator, expectedAmount, tolerance = 0.01) {
  const text = await locator.first().textContent();
  const actualAmount = parseMoneyString(text);

  expect(
    almostEqual(actualAmount, expectedAmount, tolerance),
    `Expected ${text} to be approximately $${expectedAmount.toFixed(2)}`
  ).toBeTruthy();
}

/**
 * Assert a percentage value matches expected margin within tolerance
 * @param {Locator} locator - Playwright locator
 * @param {number} expectedMargin - Expected margin percentage
 * @param {number} tolerance - Acceptable difference (default 0.1)
 */
export async function expectMargin(locator, expectedMargin, tolerance = 0.1) {
  const text = await locator.first().textContent();
  const actualMargin = parsePercentString(text);

  expect(
    almostEqual(actualMargin, expectedMargin, tolerance),
    `Expected ${text} to be approximately ${expectedMargin.toFixed(2)}%`
  ).toBeTruthy();
}

/**
 * Assert margin badge has expected color
 * @param {Locator} locator - Playwright locator for badge
 * @param {string} expectedColor - Expected color ('green', 'orange', or 'red')
 */
export async function expectMarginColor(locator, expectedColor) {
  // Get the badge's background color or class
  const backgroundColor = await locator.evaluate((el) => {
    return window.getComputedStyle(el).backgroundColor;
  });

  // Map RGB values to color names (approximate)
  const colorMap = {
    green: ['rgb(34, 197, 94)', 'rgb(22, 163, 74)', 'rgb(21, 128, 61)'], // Various shades of green
    orange: ['rgb(251, 146, 60)', 'rgb(249, 115, 22)', 'rgb(234, 88, 12)'], // Various shades of orange
    red: ['rgb(239, 68, 68)', 'rgb(220, 38, 38)', 'rgb(185, 28, 28)'], // Various shades of red
  };

  const expectedColors = colorMap[expectedColor];
  const matches = expectedColors.some(color => backgroundColor.includes(color) || backgroundColor === color);

  if (!matches) {
    // Fallback: check if the color name is in a class
    const className = await locator.getAttribute('class');
    expect(className).toContain(expectedColor);
  }
}

/**
 * Assert badge text matches expected status
 * @param {Locator} locator - Playwright locator for badge
 * @param {string} expectedText - Expected badge text
 */
export async function expectBadgeText(locator, expectedText) {
  await expect(locator).toContainText(expectedText);
}

/**
 * Assert element is visible and contains text
 * @param {Locator} locator - Playwright locator
 * @param {string} expectedText - Expected text content
 */
export async function expectVisibleWithText(locator, expectedText) {
  await expect(locator).toBeVisible();
  await expect(locator).toContainText(expectedText);
}

/**
 * Assert multiple money values in a table or list
 * @param {Object} locators - Object mapping field names to locators
 * @param {Object} expectedValues - Object mapping field names to expected values
 * @param {number} tolerance - Acceptable difference (default 0.01)
 */
export async function expectMoneyValues(locators, expectedValues, tolerance = 0.01) {
  for (const [field, locator] of Object.entries(locators)) {
    if (expectedValues[field] !== undefined) {
      await expectMoneyValue(locator, expectedValues[field], tolerance);
    }
  }
}

/**
 * Assert value is within a range
 * @param {number} actual - Actual value
 * @param {number} min - Minimum expected value
 * @param {number} max - Maximum expected value
 * @param {string} description - Description for error message
 */
export function expectInRange(actual, min, max, description = 'Value') {
  expect(
    actual >= min && actual <= max,
    `${description} ${actual} should be between ${min} and ${max}`
  ).toBeTruthy();
}

/**
 * Wait for element to be visible with timeout
 * @param {Locator} locator - Playwright locator
 * @param {number} timeout - Timeout in milliseconds (default 5000)
 */
export async function waitForVisible(locator, timeout = 5000) {
  await expect(locator).toBeVisible({ timeout });
}

/**
 * Assert clipboard contains expected text
 * @param {Page} page - Playwright page object
 * @param {string} expectedText - Expected clipboard content
 */
export async function expectClipboardContains(page, expectedText) {
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain(expectedText);
}
