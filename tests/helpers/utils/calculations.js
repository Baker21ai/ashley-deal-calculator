/**
 * Business logic calculation helpers for testing
 * These replicate the calculator's formulas for independent verification
 */

import { TAX_RATE } from '../../fixtures/test-data.js';

/**
 * Calculate margin percentage
 * @param {number} salePrice - Sale price
 * @param {number} landingCost - Landing cost
 * @returns {number} Margin as percentage (e.g., 50 for 50%)
 */
export function calculateMargin(salePrice, landingCost) {
  if (salePrice === 0) return 0;
  return ((salePrice - landingCost) / salePrice) * 100;
}

/**
 * Calculate sale price needed to achieve target margin
 * @param {number} landingCost - Landing cost
 * @param {number} targetMargin - Target margin as percentage (e.g., 50 for 50%)
 * @returns {number} Required sale price
 */
export function priceForMargin(landingCost, targetMargin) {
  const marginDecimal = targetMargin / 100;
  return landingCost / (1 - marginDecimal);
}

/**
 * Remove tax from tax-inclusive price
 * @param {number} priceWithTax - Price including tax
 * @returns {number} Price before tax
 */
export function backOutTax(priceWithTax) {
  return priceWithTax / (1 + TAX_RATE);
}

/**
 * Add tax to price
 * @param {number} price - Price before tax
 * @returns {number} Price including tax
 */
export function addTax(price) {
  return price * (1 + TAX_RATE);
}

/**
 * Calculate profit
 * @param {number} salePrice - Sale price
 * @param {number} landingCost - Landing cost
 * @returns {number} Profit amount
 */
export function calculateProfit(salePrice, landingCost) {
  return salePrice - landingCost;
}

/**
 * Apply sale percentage to tag price
 * @param {number} tagPrice - Original tag price
 * @param {number} salePercent - Sale percentage (e.g., 30 for 30% off)
 * @returns {number} Sale price after discount
 */
export function applySalePercent(tagPrice, salePercent) {
  const discountMultiplier = 1 - (salePercent / 100);
  return tagPrice * discountMultiplier;
}

/**
 * Calculate total from multiple items
 * @param {Array} items - Array of {salePrice, quantity}
 * @returns {number} Total sum
 */
export function calculateItemsTotal(items) {
  return items.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
}

/**
 * Calculate total landing cost from multiple items
 * @param {Array} items - Array of {landingCost, quantity}
 * @returns {number} Total landing cost
 */
export function calculateTotalLanding(items) {
  return items.reduce((sum, item) => sum + (item.landingCost * item.quantity), 0);
}

/**
 * Calculate OTD analysis
 * @param {number} otdPrice - Customer's out-the-door offer
 * @param {number} delivery - Delivery amount
 * @param {number} totalLanding - Total landing cost of all items
 * @returns {Object} Analysis with salePrice, margin, profit
 */
export function analyzeOtdPrice(otdPrice, delivery, totalLanding) {
  const priceAfterDelivery = otdPrice - delivery;
  const salePrice = backOutTax(priceAfterDelivery);
  const margin = calculateMargin(salePrice, totalLanding);
  const profit = calculateProfit(salePrice, totalLanding);

  return {
    salePrice: roundMoney(salePrice),
    margin: roundPercent(margin),
    profit: roundMoney(profit),
  };
}

/**
 * Round number to 2 decimal places (for money)
 * @param {number} value
 * @returns {number}
 */
export function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Round number to 2 decimal places (for percentages)
 * @param {number} value
 * @returns {number}
 */
export function roundPercent(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Compare two numbers with tolerance for floating-point errors
 * @param {number} a - First number
 * @param {number} b - Second number
 * @param {number} tolerance - Acceptable difference (default 0.01)
 * @returns {boolean} True if numbers are approximately equal
 */
export function almostEqual(a, b, tolerance = 0.01) {
  return Math.abs(a - b) < tolerance;
}

/**
 * Parse money string to number (e.g., "$1,234.56" -> 1234.56)
 * @param {string} moneyString - Formatted money string
 * @returns {number} Numeric value
 */
export function parseMoneyString(moneyString) {
  const match = moneyString.match(/-?\$?\d[\d,]*\.?\d*/);
  if (!match) return NaN;
  return parseFloat(match[0].replace(/[$,]/g, ''));
}

/**
 * Parse percentage string to number (e.g., "50.00%" -> 50.00)
 * @param {string} percentString - Formatted percentage string
 * @returns {number} Numeric value
 */
export function parsePercentString(percentString) {
  const match = percentString.match(/-?\d+(\.\d+)?(?=%)/);
  if (!match) return NaN;
  return parseFloat(match[0]);
}
