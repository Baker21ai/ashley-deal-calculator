# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ashley Deal Calculator is a mobile-first React web application for Ashley HomeStore (Gilroy location) sales staff. It helps calculate customer quotes, verify profit margins, and evaluate out-the-door (OTD) pricing negotiations.

## Commands

```bash
npm run dev      # Start development server (Vite)
npm run build    # Production build
npm run preview  # Preview production build
```

## Architecture

**Single-component application:**
- `ashley-calculator-v5-fixed.jsx` - Main component containing all UI and business logic (~1,500 lines)
- `src/main.jsx` - Entry point that mounts the React app
- `index.html` - HTML shell

**Tech stack:** React 18 + Vite 5, no external CSS libraries (inline styles only).

## Business Logic Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `TAX_RATE` | 9.125% | California local sales tax |
| `DEFAULT_DELIVERY` | $135 | Standard delivery fee |
| Delivery options | $0, $100, $135, $150 | Based on item size/distance |
| Target margin | 50%+ | Ideal profit margin |
| Minimum margin | 47% | Absolute floor (needs manager approval) |

## Three Calculator Modes

1. **Quick Quote** - Generate customer quotes with tax/delivery
2. **Margin Check** - Verify deals meet margin thresholds (50% target, 47% minimum)
3. **OTD Price** - Analyze customer's "out-the-door" total price offers

## Key Formulas

```javascript
// Margin calculation
margin = (salePrice - landingCost) / salePrice * 100

// Price needed for target margin
salePrice = landingCost / (1 - targetMargin)

// Back out tax from tax-included price
invoicePrice = quotePrice / (1 + TAX_RATE)
```

## No-Tax Promo Logic

When "No-Tax Promo" is ON, prices quoted to customers include tax, but invoices still show pre-tax amounts. The calculator handles conversion between quote prices (tax-included) and invoice prices (pre-tax).
