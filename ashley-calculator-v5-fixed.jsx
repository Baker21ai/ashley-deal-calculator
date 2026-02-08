import { useState, useEffect } from 'react';

const TAX_RATE = 9.125;
const STORAGE_KEY = 'ashley-calculator-state';
const DEFAULT_DELIVERY = 135;

// Item type presets - top 5 always visible, rest in expandable section
const TOP_ITEM_PRESETS = ['Sofa', 'Sectional', 'Bed', 'Mattress', 'Dresser'];
const MORE_ITEM_PRESETS = [
  'Dining Table', 'Loveseat', 'Recliner', 'Chest', 'Nightstand',
  'End Table', 'Coffee Table', 'TV Stand', 'Dining Chairs', 'Desk',
  'Bookshelf', 'Accent Chair', 'Ottoman', 'Headboard', 'Bunk Bed'
];

// Design System Constants
const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

const colors = {
  primary: {
    50: '#faf8f5',
    100: '#f5f2ef',
    200: '#e0d8cf',
    400: '#8b7355',
    500: '#6d5a45',
    600: '#5c4a3a',
  },
  success: { light: '#e8f5e9', main: '#2e7d32', dark: '#1b5e20' },
  warning: { light: '#fff3e0', main: '#f57c00', dark: '#e65100' },
  error: { light: '#ffebee', main: '#c62828', dark: '#b71c1c' },
  info: { light: '#e3f2fd', main: '#1565c0' },
  text: { primary: '#333', secondary: '#666', disabled: '#999' },
};

function formatMoney(num) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);
}

function parseMoney(str) {
  return parseFloat(String(str).replace(/[$,]/g, '')) || 0;
}

// Calculate margin given sale price and landing cost
function calculateMargin(salePrice, landingCost) {
  if (salePrice <= 0) return 0;
  const profit = salePrice - landingCost;
  return (profit / salePrice) * 100;
}

// Calculate what sale price is needed to hit a target margin
function priceForMargin(landingCost, targetMarginPercent) {
  const margin = targetMarginPercent / 100;
  return landingCost / (1 - margin);
}

export default function AshleyDealCalculator() {
  const [mode, setMode] = useState('margin'); // 'quote', 'margin', 'otd'
  const [showHelp, setShowHelp] = useState(false);
  
  // Deal settings
  const [salePercent, setSalePercent] = useState(30);
  const [noTaxPromo, setNoTaxPromo] = useState(true);
  const [priceType, setPriceType] = useState('sale');
  const [delivery, setDelivery] = useState('135');
  
  // Items
  const [items, setItems] = useState([{ id: 1, name: '', price: '', qty: 1, landingCost: '', marginSet: false, selectedMargin: null, originalPrice: undefined }]);
  
  // OTD mode
  const [otdPrice, setOtdPrice] = useState('');
  
  // Results
  const [showResults, setShowResults] = useState(false);

  // Confirmation modal
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  // Item presets UI state - track which items have expanded presets
  const [expandedItemPresets, setExpandedItemPresets] = useState({});
  const [showCustomInput, setShowCustomInput] = useState({});

  // Scroll wheel picker state
  const [wheelOpen, setWheelOpen] = useState(null); // { itemId, field } or { field: 'otd' }
  const [wheelValues, setWheelValues] = useState({ thousands: 0, hundreds: 0, tens: 0, ones: 0, tenCents: 0, cents: 0 });

  // Copy feedback state
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Helper/tutorial state
  const [helperActive, setHelperActive] = useState(false);
  const [helperStep, setHelperStep] = useState(0);

  // Helper steps configuration
  const helperSteps = [
    {
      id: 'mode',
      title: 'Step 1: Choose Your Mode',
      description: 'Pick what you want to do. Quick Quote for customer totals, Margin Check to verify profitability, or OTD Price to evaluate customer offers.',
      highlight: 'mode-tabs',
    },
    {
      id: 'settings',
      title: 'Step 2: Set Deal Options',
      description: 'Select the sale percentage (usually 30%), toggle No-Tax Promo on/off, and choose delivery amount.',
      highlight: 'deal-settings',
    },
    {
      id: 'items',
      title: 'Step 3: Add Your Items',
      description: 'Tap to select item type, then tap the price fields to enter amounts using the dial pad. Add more items if needed.',
      highlight: 'items-section',
    },
    {
      id: 'calculate',
      title: 'Step 4: Calculate!',
      description: 'Hit the button at the bottom to see your results. You can then copy the summary to share with your manager.',
      highlight: 'calc-button',
    },
  ];

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.mode) setMode(state.mode);
        if (state.salePercent) setSalePercent(state.salePercent);
        if (typeof state.noTaxPromo === 'boolean') setNoTaxPromo(state.noTaxPromo);
        if (state.priceType) setPriceType(state.priceType);
        if (state.delivery) setDelivery(state.delivery);
        if (state.items && state.items.length > 0) setItems(state.items);
        if (state.otdPrice) setOtdPrice(state.otdPrice);
      }
    } catch (e) {
      console.error('Failed to load saved state:', e);
    }
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    try {
      const state = {
        mode,
        salePercent,
        noTaxPromo,
        priceType,
        delivery,
        items,
        otdPrice,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }, [mode, salePercent, noTaxPromo, priceType, delivery, items, otdPrice]);

  const taxRate = TAX_RATE / 100;

  const addItem = () => {
    setItems([...items, { id: Date.now(), name: '', price: '', qty: 1, landingCost: '', marginSet: false, selectedMargin: null, originalPrice: undefined }]);
  };

  const removeItem = (id) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const updateItem = (id, field, value) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const calculate = () => {
    if (mode === 'otd') {
      if (parseMoney(otdPrice) <= 0) {
        alert('Please enter the out-the-door price!');
        return;
      }
      const hasLanding = items.some(item => parseMoney(item.landingCost) > 0);
      if (!hasLanding) {
        alert('Please enter landing cost for at least one item!');
        return;
      }
    } else if (mode === 'margin') {
      // Margin Check only requires landing cost (price is optional)
      const hasLanding = items.some(item => parseMoney(item.landingCost) > 0);
      if (!hasLanding) {
        alert('Please enter landing cost for at least one item!');
        return;
      }
    } else {
      // Quick Quote requires price
      const validItems = items.filter(item => parseMoney(item.price) > 0);
      if (validItems.length === 0) {
        alert('Please add at least one item with a price!');
        return;
      }
    }
    setShowResults(true);
  };

  // Calculate totals
  const discount = salePercent / 100;
  const deliveryAmount = parseMoney(delivery);
  const deliveryTax = deliveryAmount * taxRate;

  const calculatedItems = items.map(item => {
    const rawPrice = parseMoney(item.price);
    const qty = parseInt(item.qty) || 1;
    const landingCost = parseMoney(item.landingCost);
    
    let salePrice, invoicePrice, quotePrice;
    
    if (mode === 'quote') {
      // Quick Quote mode
      if (noTaxPromo) {
        // No-Tax ON: tag price IS the quote price (tax included)
        quotePrice = priceType === 'sale' ? rawPrice : rawPrice * (1 - discount);
        invoicePrice = quotePrice / (1 + taxRate); // back out tax
        salePrice = invoicePrice;
      } else {
        // No-Tax OFF: tag price is pre-tax, add tax for quote
        salePrice = priceType === 'sale' ? rawPrice : rawPrice * (1 - discount);
        invoicePrice = salePrice;
        quotePrice = salePrice * (1 + taxRate);
      }
    } else if (mode === 'margin') {
      // Margin Check mode
      // FIX: Check if item has marginSet flag (was set via clicking margin target)
      if (item.marginSet && rawPrice > 0) {
        // Price was set by clicking a margin target - it's already the correct invoice price
        invoicePrice = rawPrice;
        salePrice = invoicePrice;
        quotePrice = invoicePrice * (1 + taxRate);
      } else if (rawPrice > 0 && noTaxPromo) {
        // User manually entered a price with No-Tax ON, treat it as quote price (tax included)
        quotePrice = priceType === 'sale' ? rawPrice : rawPrice * (1 - discount);
        invoicePrice = quotePrice / (1 + taxRate);
        salePrice = invoicePrice;
      } else {
        // No price entered, or No-Tax OFF: price is invoice/sale price
        salePrice = priceType === 'sale' ? rawPrice : rawPrice * (1 - discount);
        invoicePrice = salePrice;
        quotePrice = salePrice > 0 ? salePrice * (1 + taxRate) : 0;
      }
    } else {
      // OTD mode - price field not really used, landing cost is main input
      salePrice = priceType === 'sale' ? rawPrice : rawPrice * (1 - discount);
      invoicePrice = salePrice;
      quotePrice = salePrice * (1 + taxRate);
    }
    
    const lineTotal = invoicePrice * qty; // lineTotal is always invoice price for calculations
    const margin = (landingCost > 0 && invoicePrice > 0) ? calculateMargin(invoicePrice, landingCost) : null;
    const totalLandingCost = landingCost * qty;
    
    // Calculate profit based on invoice price (what you actually keep)
    const profitPerUnit = (landingCost > 0 && invoicePrice > 0) ? (invoicePrice - landingCost) : null;
    const totalProfit = profitPerUnit !== null ? profitPerUnit * qty : null;
    
    // Price targets for different margins (these are INVOICE prices)
    const priceAt50 = landingCost > 0 ? priceForMargin(landingCost, 50) : null;
    const priceAt49 = landingCost > 0 ? priceForMargin(landingCost, 49) : null;
    const priceAt48 = landingCost > 0 ? priceForMargin(landingCost, 48) : null;
    const priceAt47 = landingCost > 0 ? priceForMargin(landingCost, 47) : null;
    
    return { 
      ...item, 
      salePrice: invoicePrice, // salePrice now means invoice price
      invoicePrice,
      quotePrice,
      lineTotal, 
      qty,
      landingCost,
      totalLandingCost,
      margin,
      profitPerUnit,
      totalProfit,
      priceAt50,
      priceAt49,
      priceAt48,
      priceAt47,
    };
  }).filter(item => item.lineTotal > 0 || item.landingCost > 0);

  const subtotal = calculatedItems.reduce((sum, item) => sum + item.lineTotal, 0); // invoice subtotal
  const totalLandingCost = calculatedItems.reduce((sum, item) => sum + item.totalLandingCost, 0);
  const totalProfit = calculatedItems.reduce((sum, item) => sum + (item.totalProfit || 0), 0);
  const overallMargin = subtotal > 0 && totalLandingCost > 0 ? calculateMargin(subtotal, totalLandingCost) : null;
  
  const taxOnMerchandise = subtotal * taxRate;
  const totalTax = taxOnMerchandise + deliveryTax;
  
  // Customer total depends on mode and No-Tax setting
  let customerTotal;
  if (mode === 'quote' && noTaxPromo) {
    // Quick Quote + No-Tax: quote prices already include merch tax, just add delivery + delivery tax
    const quoteSubtotal = calculatedItems.reduce((sum, item) => sum + (item.quotePrice * item.qty), 0);
    customerTotal = quoteSubtotal + deliveryAmount + deliveryTax;
  } else {
    // All other cases: invoice subtotal + all taxes + delivery
    customerTotal = subtotal + taxOnMerchandise + deliveryAmount + deliveryTax;
  }

  // OTD calculations
  const otdAmount = parseMoney(otdPrice);
  const otdDeliveryWithTax = deliveryAmount + deliveryTax;
  const otdMerchandiseWithTax = otdAmount - otdDeliveryWithTax;
  const otdSalePrice = otdMerchandiseWithTax / (1 + taxRate);
  const otdMerchandiseTax = otdMerchandiseWithTax - otdSalePrice;
  const otdMargin = totalLandingCost > 0 ? calculateMargin(otdSalePrice, totalLandingCost) : null;
  const otdProfit = otdSalePrice - totalLandingCost;

  const resetForm = () => setShowResults(false);
  
  // FIX: Set an item's price to hit a target margin - stores INVOICE price and marks it
  // Also stores original price so user can restore it by clicking the same margin again
  const setItemToMargin = (itemId, targetMargin) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const landingCost = parseMoney(item.landingCost);
        if (landingCost > 0) {
          // If clicking the same margin that's already selected, restore original price
          if (item.selectedMargin === targetMargin && item.originalPrice !== undefined) {
            return { 
              ...item, 
              price: item.originalPrice, 
              marginSet: false, 
              selectedMargin: null,
              originalPrice: undefined 
            };
          }
          
          // Store original price if this is the first margin click
          const originalPrice = item.marginSet ? item.originalPrice : item.price;
          
          // Calculate and store the INVOICE price (pre-tax)
          const invoicePrice = priceForMargin(landingCost, targetMargin);
          return { 
            ...item, 
            price: invoicePrice.toFixed(2), 
            marginSet: true,
            selectedMargin: targetMargin,
            originalPrice: originalPrice
          };
        }
      }
      return item;
    }));
  };

  // FIX: Clear marginSet flag and selectedMargin when user manually edits price
  const updateItemPrice = (id, value) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, price: value, marginSet: false, selectedMargin: null, originalPrice: undefined } : item
    ));
  };
  
  const startOver = () => {
    setShowConfirmReset(true);
  };

  const confirmStartOver = () => {
    setSalePercent(30);
    setNoTaxPromo(true);
    setPriceType('sale');
    setDelivery('135');
    setItems([{ id: 1, name: '', price: '', qty: 1, landingCost: '', marginSet: false, selectedMargin: null, originalPrice: undefined }]);
    setOtdPrice('');
    setShowResults(false);
    setShowConfirmReset(false);
  };

  // Scroll wheel picker functions
  const openWheel = (itemId, field, currentValue) => {
    const numValue = parseMoney(currentValue) || 0;
    const dollars = Math.floor(numValue);
    const cents = Math.round((numValue - dollars) * 100);

    setWheelValues({
      thousands: Math.floor(dollars / 1000) % 100,
      hundreds: Math.floor(dollars / 100) % 10,
      tens: Math.floor(dollars / 10) % 10,
      ones: dollars % 10,
      tenCents: Math.floor(cents / 10),
      cents: cents % 10,
    });
    setWheelOpen({ itemId, field });
  };

  const getWheelTotal = () => {
    const dollars = wheelValues.thousands * 1000 + wheelValues.hundreds * 100 + wheelValues.tens * 10 + wheelValues.ones;
    const cents = wheelValues.tenCents * 10 + wheelValues.cents;
    return dollars + cents / 100;
  };

  const confirmWheelValue = () => {
    const numValue = getWheelTotal();
    if (wheelOpen.field === 'otd') {
      setOtdPrice(numValue.toFixed(2));
    } else if (wheelOpen.field === 'price') {
      updateItemPrice(wheelOpen.itemId, numValue.toFixed(2));
    } else if (wheelOpen.field === 'landingCost') {
      updateItem(wheelOpen.itemId, 'landingCost', numValue.toFixed(2));
    }
    setWheelOpen(null);
  };

  const updateWheelColumn = (column, direction) => {
    setWheelValues(prev => {
      const maxValues = { thousands: 99, hundreds: 9, tens: 9, ones: 9, tenCents: 9, cents: 9 };
      let newValue = prev[column] + direction;
      if (newValue < 0) newValue = maxValues[column];
      if (newValue > maxValues[column]) newValue = 0;
      return { ...prev, [column]: newValue };
    });
  };

  // Helper functions
  const startHelper = () => {
    setHelperStep(0);
    setHelperActive(true);
  };

  const nextHelperStep = () => {
    if (helperStep < helperSteps.length - 1) {
      setHelperStep(helperStep + 1);
    } else {
      setHelperActive(false);
      // Remember that user completed the tutorial
      try {
        localStorage.setItem('ashley-helper-completed', 'true');
      } catch (e) {}
    }
  };

  const skipHelper = () => {
    setHelperActive(false);
  };

  const getMarginColor = (margin) => {
    if (margin >= 50) return '#2e7d32';
    if (margin >= 47) return '#f57c00';
    return '#c62828';
  };

  const getMarginLabel = (margin) => {
    if (margin >= 50) return '✓ Great';
    if (margin >= 47) return '⚠️ OK';
    return '✗ Too Low';
  };

  // Copy helper with feedback
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  // Reusable Components
  const BreakdownRow = ({ label, value, highlight = false, large = false }) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: highlight ? `${space.sm}px ${space.md}px` : `${space.xs + 2}px 0`,
        background: highlight ? colors.primary[100] : 'transparent',
        borderRadius: highlight ? '6px' : '0',
        margin: highlight ? `0 -${space.md}px` : '0',
        borderBottom: highlight ? 'none' : `1px solid ${colors.primary[100]}`,
      }}
    >
      <span style={{ color: colors.text.secondary, fontSize: '13px', fontWeight: highlight ? 600 : 400 }}>{label}</span>
      <span style={{ fontWeight: 600, color: colors.text.primary, fontSize: large ? '18px' : '13px' }}>{value}</span>
    </div>
  );

  const SectionHeader = ({ title, subtitle }) => (
    <div style={{ marginTop: space.lg, marginBottom: space.sm }}>
      <div style={{
        fontSize: '12px',
        fontWeight: 600,
        color: colors.primary[400],
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: '11px', color: colors.text.secondary, marginTop: 2 }}>
          {subtitle}
        </div>
      )}
    </div>
  );

  const MarginBadge = ({ margin }) => {
    const config = margin >= 50
      ? { bg: colors.success.light, color: colors.success.main, label: '✓ GREAT' }
      : margin >= 47
      ? { bg: colors.warning.light, color: colors.warning.main, label: '⚠ OK' }
      : { bg: colors.error.light, color: colors.error.main, label: '✗ LOW' };

    return (
      <span
        style={{
          background: config.bg,
          color: config.color,
          padding: `${space.xs}px ${space.md}px`,
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.5px'
        }}
      >
        {config.label} • {margin?.toFixed(1)}%
      </span>
    );
  };

  const CopyBlock = ({ title, content }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div style={{ marginTop: space.lg }}>
        {title && <SectionHeader title={title} />}
        <div
          onClick={handleCopy}
          style={{
            background: colors.primary[50],
            border: `1px solid ${colors.primary[200]}`,
            borderRadius: '8px',
            padding: space.md,
            fontFamily: 'monospace',
            fontSize: '12px',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            cursor: 'pointer',
            position: 'relative'
          }}
        >
          {content}
          {copied && (
            <div style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: colors.success.main,
              color: 'white',
              padding: `${space.xs}px ${space.sm}px`,
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 600
            }}>
              ✓ Copied!
            </div>
          )}
        </div>
        <p style={{ fontSize: '11px', color: colors.text.secondary, marginTop: space.xs, textAlign: 'center' }}>
          Tap to copy
        </p>
      </div>
    );
  };

  // State for settings accordion
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  // State for header menu
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8f6f3',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '16px',
      paddingBottom: '100px',
    }}>
      <style>{`
        * { box-sizing: border-box; }

        .container { max-width: 500px; margin: 0 auto; padding-bottom: 90px; }

        /* Sticky Header */
        .header {
          position: sticky;
          top: 0;
          z-index: 40;
          background: linear-gradient(135deg, #8b7355 0%, #6d5a45 100%);
          padding: 12px 16px;
          margin: -16px -16px 16px -16px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .header-content {
          flex: 1;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 18px;
          color: white;
          font-weight: 700;
        }
        .header p {
          margin: 2px 0 0;
          font-size: 11px;
          color: rgba(255,255,255,0.8);
        }
        .header-menu-btn {
          background: rgba(255,255,255,0.15);
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          transition: all 0.2s;
        }
        .header-menu-btn:hover {
          background: rgba(255,255,255,0.25);
        }
        .header-menu {
          position: absolute;
          top: 100%;
          right: 16px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
          overflow: hidden;
          min-width: 160px;
          z-index: 50;
        }
        .header-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          font-size: 14px;
          color: #333;
          cursor: pointer;
          transition: background 0.15s;
        }
        .header-menu-item:hover {
          background: #f5f2ef;
        }
        .header-menu-item:not(:last-child) {
          border-bottom: 1px solid #f0ebe5;
        }

        .mode-tabs {
          display: flex;
          background: white;
          border-radius: 14px;
          padding: 5px;
          margin-bottom: 16px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .mode-tab {
          flex: 1;
          padding: 14px 8px;
          border: none;
          background: transparent;
          border-radius: 11px;
          font-size: 14px;
          font-weight: 600;
          color: #888;
          cursor: pointer;
          transition: all 0.15s;
          min-height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mode-tab.active {
          background: #8b7355;
          color: white;
        }
        .mode-tab:not(.active):hover { background: #f5f2ef; }

        .card {
          background: white;
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 14px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }

        .card-title {
          font-size: 14px;
          font-weight: 600;
          color: #5c4a3a;
          margin-bottom: 14px;
        }

        .pill-group {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .pill {
          padding: 12px 18px;
          border-radius: 24px;
          border: 2px solid #e0d8cf;
          background: white;
          font-size: 15px;
          font-weight: 500;
          color: #666;
          cursor: pointer;
          transition: all 0.15s;
          min-height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pill:hover { border-color: #8b7355; }
        .pill.selected {
          background: #8b7355;
          border-color: #8b7355;
          color: white;
        }
        .pill.small { padding: 10px 14px; font-size: 14px; min-height: 44px; }

        .toggle-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          min-height: 48px;
        }
        .toggle-label { font-size: 15px; color: #333; }
        .toggle-desc { font-size: 12px; color: #888; margin-top: 2px; }

        .toggle {
          width: 56px;
          height: 32px;
          background: #ddd;
          border-radius: 16px;
          position: relative;
          cursor: pointer;
          transition: background 0.2s;
          flex-shrink: 0;
        }
        .toggle.on { background: #8b7355; }
        .toggle::after {
          content: '';
          position: absolute;
          top: 3px;
          left: 3px;
          width: 26px;
          height: 26px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .toggle.on::after { transform: translateX(24px); }

        .input {
          width: 100%;
          padding: 14px 16px;
          border: 2px solid #e0d8cf;
          border-radius: 12px;
          font-size: 18px;
          transition: border-color 0.15s;
          min-height: 56px;
        }
        .input:focus { outline: none; border-color: #8b7355; }
        .input::placeholder { color: #bbb; }
        .input.small { padding: 12px 14px; font-size: 16px; min-height: 48px; }

        .item-row {
          background: #faf8f5;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 12px;
        }
        .item-row-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .item-number {
          font-size: 13px;
          font-weight: 600;
          color: #8b7355;
        }
        .remove-btn {
          background: #ffebee;
          border: none;
          color: #c62828;
          font-size: 20px;
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 8px;
          min-width: 44px;
          min-height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .input-row {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
        }
        .input-group {
          flex: 1;
        }
        .input-label {
          font-size: 11px;
          color: #888;
          margin-bottom: 4px;
          display: block;
        }
        
        .add-item-btn {
          width: 100%;
          padding: 14px;
          background: white;
          border: 2px dashed #d0c8bf;
          border-radius: 12px;
          color: #8b7355;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          min-height: 52px;
        }
        .add-item-btn:hover {
          background: #faf8f5;
          border-color: #8b7355;
        }

        .sticky-bottom {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 16px;
          background: linear-gradient(to top, #f8f6f3 80%, transparent);
          z-index: 50;
        }
        .sticky-bottom .calc-btn {
          max-width: 500px;
          margin: 0 auto;
          display: block;
        }

        .calc-btn {
          width: 100%;
          padding: 18px;
          background: #8b7355;
          border: none;
          border-radius: 14px;
          color: white;
          font-size: 17px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(139, 115, 85, 0.3);
          min-height: 56px;
        }
        .calc-btn:active { transform: scale(0.98); }
        
        .result-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 20px;
          z-index: 100;
          overflow-y: auto;
        }
        .result-card {
          background: white;
          border-radius: 16px;
          padding: 20px;
          width: 100%;
          max-width: 420px;
          margin: 20px 0;
        }
        .result-title {
          text-align: center;
          font-size: 18px;
          font-weight: 700;
          color: #5c4a3a;
          margin-bottom: 16px;
        }
        
        .big-total {
          text-align: center;
          padding: 20px;
          background: linear-gradient(135deg, #8b7355 0%, #6d5a45 100%);
          border-radius: 12px;
          margin-bottom: 16px;
        }
        .big-total-label {
          font-size: 13px;
          color: rgba(255,255,255,0.8);
          margin-bottom: 4px;
        }
        .big-total-amount {
          font-size: 36px;
          font-weight: 700;
          color: white;
        }
        .big-total-sub {
          font-size: 12px;
          color: rgba(255,255,255,0.7);
          margin-top: 4px;
        }
        
        .badge {
          display: inline-block;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          margin-top: 8px;
        }
        .badge.green { background: #e8f5e9; color: #2e7d32; }
        .badge.orange { background: #fff3e0; color: #f57c00; }
        .badge.red { background: #ffebee; color: #c62828; }
        
        .section-title {
          font-size: 12px;
          font-weight: 600;
          color: #8b7355;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 16px 0 8px;
        }
        
        .breakdown-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          border-bottom: 1px solid #f0ebe5;
        }
        .breakdown-row:last-child { border-bottom: none; }
        .breakdown-label { color: #666; font-size: 13px; }
        .breakdown-value { font-weight: 600; color: #333; font-size: 13px; }
        
        .margin-item {
          background: #faf8f5;
          border-radius: 10px;
          padding: 12px;
          margin-bottom: 10px;
        }
        .margin-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .margin-item-name { font-weight: 600; color: #333; font-size: 14px; }
        .margin-badge {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }
        
        .margin-prices {
          display: flex;
          gap: 6px;
          margin-top: 8px;
        }
        .margin-price-box {
          flex: 1;
          background: white;
          border: 2px solid #e0d8cf;
          border-radius: 8px;
          padding: 8px 4px;
          text-align: center;
          transition: all 0.15s;
        }
        .margin-price-box:hover {
          border-color: #8b7355;
          background: #faf8f5;
        }
        .margin-price-box.current {
          border-color: #8b7355;
          background: #8b7355;
        }
        .margin-price-box.current .margin-price-label,
        .margin-price-box.current .margin-price-value {
          color: white;
        }
        .margin-price-label { font-size: 10px; color: #888; }
        .margin-price-value { font-size: 13px; font-weight: 600; margin-top: 2px; }
        
        .result-buttons {
          display: flex;
          gap: 10px;
          margin-top: 16px;
        }
        .result-btn {
          flex: 1;
          padding: 12px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .result-btn.primary {
          background: #8b7355;
          color: white;
          border: none;
        }
        .result-btn.secondary {
          background: white;
          color: #8b7355;
          border: 2px solid #8b7355;
        }
        
        .help-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 20px;
          z-index: 200;
          overflow-y: auto;
        }
        .help-modal {
          background: white;
          border-radius: 16px;
          padding: 24px;
          width: 100%;
          max-width: 480px;
          margin: 20px 0;
        }
        .help-modal h2 {
          margin: 0 0 16px;
          color: #5c4a3a;
          font-size: 20px;
        }
        .help-section {
          margin-bottom: 20px;
        }
        .help-section h3 {
          font-size: 15px;
          color: #8b7355;
          margin: 0 0 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .help-section p {
          font-size: 13px;
          color: #555;
          line-height: 1.5;
          margin: 0;
        }
        .help-section ul {
          margin: 8px 0 0;
          padding-left: 20px;
          font-size: 13px;
          color: #555;
          line-height: 1.6;
        }
        .help-close {
          width: 100%;
          padding: 14px;
          background: #8b7355;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 8px;
        }
        
        .quick-ref {
          background: #fff8e1;
          border-radius: 8px;
          padding: 12px;
          margin-top: 12px;
        }
        .quick-ref-title { font-size: 12px; font-weight: 600; color: #8b7355; margin-bottom: 6px; }
        .quick-ref-item { font-size: 12px; color: #666; padding: 2px 0; }
        
        .copy-block {
          background: #f8f6f3;
          border: 1px solid #e0d8cf;
          border-radius: 8px;
          padding: 12px;
          font-family: monospace;
          font-size: 12px;
          line-height: 1.6;
          white-space: pre-wrap;
          color: #333;
          cursor: pointer;
        }
        .copy-block:active { background: #f0ebe5; }

        /* Wheel button */
        .wheel-btn {
          width: 48px;
          height: 48px;
          background: #f5f2ef;
          border: 2px solid #e0d8cf;
          border-radius: 12px;
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .wheel-btn:active {
          background: #e0d8cf;
        }

        /* Scroll Wheel Picker Styles */
        .wheel-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 300;
        }
        .wheel-modal {
          background: white;
          border-radius: 20px 20px 0 0;
          padding: 20px;
          width: 100%;
          max-width: 500px;
          animation: slideUp 0.2s ease-out;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .wheel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .wheel-title {
          font-size: 16px;
          font-weight: 600;
          color: #5c4a3a;
        }
        .wheel-cancel {
          background: none;
          border: none;
          font-size: 15px;
          color: #888;
          cursor: pointer;
          padding: 8px;
        }
        .wheel-display {
          text-align: center;
          font-size: 36px;
          font-weight: 700;
          color: #8b7355;
          padding: 12px;
          margin-bottom: 8px;
        }
        .wheel-columns {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 4px;
          padding: 16px 0;
          background: #f8f6f3;
          border-radius: 16px;
          margin-bottom: 16px;
        }
        .wheel-column {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 44px;
        }
        .wheel-column.wide {
          width: 56px;
        }
        .wheel-arrow {
          width: 100%;
          height: 40px;
          background: transparent;
          border: none;
          font-size: 20px;
          color: #8b7355;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
        }
        .wheel-arrow:active {
          background: #e0d8cf;
        }
        .wheel-value {
          font-size: 32px;
          font-weight: 700;
          color: #333;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          border-radius: 8px;
          width: 100%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .wheel-separator {
          font-size: 32px;
          font-weight: 700;
          color: #333;
          padding: 0 2px;
        }
        .wheel-label {
          font-size: 10px;
          color: #888;
          margin-top: 4px;
          text-transform: uppercase;
        }
        .wheel-confirm {
          width: 100%;
          padding: 18px;
          background: #8b7355;
          border: none;
          border-radius: 14px;
          color: white;
          font-size: 17px;
          font-weight: 700;
          cursor: pointer;
          min-height: 56px;
        }

        /* Helper/Tutorial Overlay */
        .helper-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.7);
          z-index: 400;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 16px;
        }
        .helper-spotlight {
          position: absolute;
          border-radius: 16px;
          box-shadow: 0 0 0 9999px rgba(0,0,0,0.7);
          pointer-events: none;
        }
        .helper-card {
          background: white;
          border-radius: 16px;
          padding: 20px;
          max-width: 500px;
          margin: 0 auto;
          width: 100%;
          animation: slideUp 0.2s ease-out;
        }
        .helper-step-badge {
          display: inline-block;
          background: #8b7355;
          color: white;
          font-size: 12px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 12px;
          margin-bottom: 8px;
        }
        .helper-title {
          font-size: 18px;
          font-weight: 700;
          color: #5c4a3a;
          margin-bottom: 8px;
        }
        .helper-desc {
          font-size: 14px;
          color: #666;
          line-height: 1.5;
          margin-bottom: 16px;
        }
        .helper-buttons {
          display: flex;
          gap: 10px;
        }
        .helper-btn {
          flex: 1;
          padding: 14px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          min-height: 48px;
        }
        .helper-btn.primary {
          background: #8b7355;
          color: white;
          border: none;
        }
        .helper-btn.secondary {
          background: #f5f2ef;
          color: #666;
          border: none;
        }
        .helper-progress {
          display: flex;
          gap: 6px;
          justify-content: center;
          margin-bottom: 16px;
        }
        .helper-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ddd;
        }
        .helper-dot.active {
          background: #8b7355;
          width: 24px;
          border-radius: 4px;
        }
        .helper-dot.completed {
          background: #8b7355;
        }

        /* Pulsing animation for highlighted sections */
        .highlight-pulse {
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(139, 115, 85, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(139, 115, 85, 0); }
        }

        /* Helper toggle button - now in header menu, keep for legacy */
        .helper-toggle {
          display: none;
        }

        /* Settings Accordion */
        .settings-accordion {
          background: white;
          border-radius: 14px;
          margin-bottom: 14px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          overflow: hidden;
        }
        .settings-accordion-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          cursor: pointer;
          user-select: none;
          transition: background 0.15s;
        }
        .settings-accordion-header:hover {
          background: #faf8f5;
        }
        .settings-accordion-title {
          font-size: 14px;
          font-weight: 600;
          color: #5c4a3a;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .settings-accordion-chevron {
          font-size: 12px;
          color: #8b7355;
          transition: transform 0.2s;
        }
        .settings-accordion-chevron.open {
          transform: rotate(180deg);
        }
        .settings-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          padding: 0 16px 16px;
        }
        .settings-grid.full-width {
          grid-template-columns: 1fr;
        }
        .setting-compact {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .setting-label {
          font-size: 11px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .setting-preview {
          font-size: 12px;
          color: #8b7355;
          font-weight: 500;
        }

        /* Compact pills for settings */
        .pill-group-compact {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .pill-compact {
          padding: 8px 12px;
          border-radius: 20px;
          border: 2px solid #e0d8cf;
          background: white;
          font-size: 13px;
          font-weight: 500;
          color: #666;
          cursor: pointer;
          transition: all 0.15s;
          min-height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pill-compact:hover { border-color: #8b7355; }
        .pill-compact.selected {
          background: #8b7355;
          border-color: #8b7355;
          color: white;
        }

        /* Select dropdown for item types */
        .select-input {
          width: 100%;
          padding: 10px 14px;
          border: 2px solid #e0d8cf;
          border-radius: 10px;
          font-size: 14px;
          background: white;
          color: #333;
          cursor: pointer;
          transition: border-color 0.15s;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238b7355' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
        }
        .select-input:focus {
          outline: none;
          border-color: #8b7355;
        }

        /* Compact item card */
        .item-card-compact {
          background: #faf8f5;
          border-radius: 12px;
          padding: 12px;
          margin-bottom: 10px;
        }
        .item-header-row {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-bottom: 10px;
        }
        .item-number-badge {
          background: #8b7355;
          color: white;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
          white-space: nowrap;
        }
        .input-qty-compact {
          width: 56px;
          padding: 8px 10px;
          border: 2px solid #e0d8cf;
          border-radius: 8px;
          font-size: 14px;
          text-align: center;
        }
        .input-qty-compact:focus {
          outline: none;
          border-color: #8b7355;
        }
        .remove-btn-compact {
          background: #ffebee;
          border: none;
          color: #c62828;
          font-size: 18px;
          cursor: pointer;
          padding: 6px 10px;
          border-radius: 8px;
          min-width: 36px;
          min-height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .remove-btn-compact:hover {
          background: #ffcdd2;
        }
        .input-row-compact {
          display: flex;
          gap: 8px;
        }
        .input-group-compact {
          flex: 1;
        }
        .input-label-mini {
          font-size: 10px;
          color: #888;
          margin-bottom: 4px;
          display: block;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .input-with-wheel {
          display: flex;
          gap: 4px;
        }
        .input-compact {
          flex: 1;
          padding: 10px 12px;
          border: 2px solid #e0d8cf;
          border-radius: 8px;
          font-size: 15px;
          min-height: 42px;
        }
        .input-compact:focus {
          outline: none;
          border-color: #8b7355;
        }
        .wheel-btn-compact {
          width: 42px;
          height: 42px;
          background: #f5f2ef;
          border: 2px solid #e0d8cf;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s;
        }
        .wheel-btn-compact:active {
          background: #e0d8cf;
        }

        /* Toggle compact */
        .toggle-compact {
          width: 48px;
          height: 28px;
          background: #ddd;
          border-radius: 14px;
          position: relative;
          cursor: pointer;
          transition: background 0.2s;
          flex-shrink: 0;
        }
        .toggle-compact.on { background: #8b7355; }
        .toggle-compact::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 24px;
          height: 24px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .toggle-compact.on::after { transform: translateX(20px); }

        /* Micro-interactions */
        .pill, .mode-tab, .card, .pill-compact {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pill:hover, .pill-compact:hover, .mode-tab:hover {
          transform: translateY(-1px);
        }
        .pill:active, .pill-compact:active, .mode-tab:active {
          transform: translateY(0);
        }

        /* Enhanced calculate button */
        .calc-btn-enhanced {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #8b7355 0%, #6d5a45 100%);
          border: none;
          border-radius: 14px;
          color: white;
          font-size: 17px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(139, 115, 85, 0.3);
          min-height: 56px;
          transition: all 0.2s;
        }
        .calc-btn-enhanced:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(139, 115, 85, 0.4);
        }
        .calc-btn-enhanced:active {
          transform: translateY(0);
        }
        .calc-btn-enhanced:disabled {
          background: #e0d8cf;
          color: #999;
          box-shadow: none;
          cursor: not-allowed;
        }

        /* Compact result styles */
        .result-card-compact {
          background: white;
          border-radius: 16px;
          padding: 16px;
          width: 100%;
          max-width: 420px;
          margin: 20px 0;
        }

        /* Toast notification */
        .toast {
          position: fixed;
          bottom: 100px;
          left: 50%;
          transform: translateX(-50%);
          background: #333;
          color: white;
          padding: 12px 24px;
          border-radius: 24px;
          font-size: 14px;
          font-weight: 600;
          z-index: 500;
          animation: toastIn 0.3s ease-out;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <div className="container">
        {/* Redesigned Header */}
        <div className="header">
          <div style={{ width: 40 }}></div>
          <div className="header-content">
            <h1>Deal Calculator</h1>
            <p>Ashley HomeStore • Gilroy</p>
          </div>
          <button
            className="header-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            ⋮
          </button>
          {menuOpen && (
            <div className="header-menu">
              <button
                className="header-menu-item"
                onClick={() => { startHelper(); setMenuOpen(false); }}
              >
                💡 Guide
              </button>
              <button
                className="header-menu-item"
                onClick={() => { setShowHelp(true); setMenuOpen(false); }}
              >
                ❓ Help
              </button>
            </div>
          )}
        </div>

        {/* Mode Tabs - Compact Labels */}
        <div className="mode-tabs">
          <button
            className={`mode-tab ${mode === 'quote' ? 'active' : ''}`}
            onClick={() => setMode('quote')}
          >
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 16 }}>💵</span>
              <span style={{ fontSize: 12 }}>Quote</span>
            </span>
          </button>
          <button
            className={`mode-tab ${mode === 'margin' ? 'active' : ''}`}
            onClick={() => setMode('margin')}
          >
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 16 }}>📊</span>
              <span style={{ fontSize: 12 }}>Margin</span>
            </span>
          </button>
          <button
            className={`mode-tab ${mode === 'otd' ? 'active' : ''}`}
            onClick={() => setMode('otd')}
          >
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 16 }}>🎯</span>
              <span style={{ fontSize: 12 }}>OTD</span>
            </span>
          </button>
        </div>

        {/* Settings Accordion */}
        <div className="settings-accordion">
          <div
            className="settings-accordion-header"
            onClick={() => setSettingsExpanded(!settingsExpanded)}
          >
            <div className="settings-accordion-title">
              ⚙️ Deal Settings
              <span className="setting-preview">
                {mode !== 'otd' && `${salePercent}%`} • {noTaxPromo ? 'No-Tax' : 'Tax'} • ${delivery}
              </span>
            </div>
            <span className={`settings-accordion-chevron ${settingsExpanded ? 'open' : ''}`}>▼</span>
          </div>

          {settingsExpanded && (
            <div className="settings-grid">
              {/* Sale % - only show if not OTD mode */}
              {mode !== 'otd' && (
                <div className="setting-compact">
                  <label className="setting-label">Sale %</label>
                  <div className="pill-group-compact">
                    {[30, 35, 40].map(pct => (
                      <div
                        key={pct}
                        className={`pill-compact ${salePercent === pct ? 'selected' : ''}`}
                        onClick={() => setSalePercent(pct)}
                      >
                        {pct}%
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Price Type - only for quote and margin modes */}
              {(mode === 'quote' || mode === 'margin') && (
                <div className="setting-compact">
                  <label className="setting-label">Price Type</label>
                  <div className="pill-group-compact">
                    <div
                      className={`pill-compact ${priceType === 'sale' ? 'selected' : ''}`}
                      onClick={() => setPriceType('sale')}
                    >
                      Sale
                    </div>
                    <div
                      className={`pill-compact ${priceType === 'tag' ? 'selected' : ''}`}
                      onClick={() => setPriceType('tag')}
                    >
                      Retail
                    </div>
                  </div>
                </div>
              )}

              {/* No-Tax Promo */}
              <div className="setting-compact">
                <label className="setting-label">No-Tax Promo</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    className={`toggle-compact ${noTaxPromo ? 'on' : ''}`}
                    onClick={() => setNoTaxPromo(!noTaxPromo)}
                  />
                  <span style={{ fontSize: 11, color: noTaxPromo ? colors.success.main : colors.text.secondary }}>
                    {noTaxPromo ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>

              {/* Delivery */}
              <div className="setting-compact">
                <label className="setting-label">Delivery</label>
                <div className="pill-group-compact">
                  <div
                    className={`pill-compact ${delivery === '0' ? 'selected' : ''}`}
                    onClick={() => setDelivery('0')}
                  >
                    $0
                  </div>
                  {['100', '135', '150'].map(amt => (
                    <div
                      key={amt}
                      className={`pill-compact ${delivery === amt ? 'selected' : ''}`}
                      onClick={() => setDelivery(amt)}
                    >
                      ${amt}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* OTD Price Input */}
        {mode === 'otd' && (
          <div className="card">
            <div className="card-title">🎯 Customer's OTD Offer</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="input"
                placeholder="$0.00"
                value={otdPrice}
                onChange={(e) => setOtdPrice(e.target.value)}
                inputMode="decimal"
                style={{ flex: 1, fontSize: '20px', fontWeight: '600' }}
              />
              <button
                className="wheel-btn"
                onClick={() => openWheel(null, 'otd', otdPrice)}
                title="Use scroll wheel"
                style={{ width: '56px', height: '56px', fontSize: '24px' }}
              >
                🎚️
              </button>
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
              Enter the total out-the-door price the customer wants to pay
            </div>
          </div>
        )}

        {/* Items - Compact Layout */}
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>
            {mode === 'otd' ? 'Items (Landing Cost Only)' : 'Items'}
          </div>

          {items.map((item, index) => (
            <div key={item.id} className="item-card-compact">
              {/* Header Row: Badge, Dropdown/Custom, Qty, Remove */}
              <div className="item-header-row">
                <span className="item-number-badge">#{index + 1}</span>

                {showCustomInput[item.id] ? (
                  <input
                    type="text"
                    className="input-compact"
                    placeholder="Enter item name..."
                    value={item.name}
                    onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                ) : (
                  <select
                    className="select-input"
                    style={{ flex: 1 }}
                    value={
                      item.name === '' ? '' :
                      TOP_ITEM_PRESETS.includes(item.name) || MORE_ITEM_PRESETS.includes(item.name)
                        ? item.name
                        : 'custom'
                    }
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setShowCustomInput({ ...showCustomInput, [item.id]: true });
                      } else {
                        setShowCustomInput({ ...showCustomInput, [item.id]: false });
                        updateItem(item.id, 'name', e.target.value);
                      }
                    }}
                  >
                    <option value="">Select type...</option>
                    <optgroup label="Common">
                      {TOP_ITEM_PRESETS.map(preset => (
                        <option key={preset} value={preset}>{preset}</option>
                      ))}
                    </optgroup>
                    <optgroup label="More Options">
                      {MORE_ITEM_PRESETS.map(preset => (
                        <option key={preset} value={preset}>{preset}</option>
                      ))}
                    </optgroup>
                    <option value="custom">✏️ Custom...</option>
                  </select>
                )}

                <input
                  type="number"
                  className="input-qty-compact"
                  value={item.qty}
                  onChange={(e) => updateItem(item.id, 'qty', e.target.value)}
                  min="1"
                  placeholder="Qty"
                />

                {items.length > 1 && (
                  <button className="remove-btn-compact" onClick={() => removeItem(item.id)}>×</button>
                )}
              </div>

              {/* Show custom name if custom is selected */}
              {showCustomInput[item.id] && (
                <button
                  onClick={() => {
                    setShowCustomInput({ ...showCustomInput, [item.id]: false });
                    if (!item.name) updateItem(item.id, 'name', '');
                  }}
                  style={{
                    background: colors.primary[100],
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '11px',
                    color: colors.text.secondary,
                    cursor: 'pointer',
                    marginBottom: 8,
                  }}
                >
                  ← Back to presets
                </button>
              )}

              {/* Price Inputs Row */}
              <div className="input-row-compact">
                {mode !== 'otd' && (
                  <div className="input-group-compact">
                    <label className="input-label-mini">
                      {noTaxPromo ? 'Price (w/tax)' : 'Price'}
                    </label>
                    <div className="input-with-wheel">
                      <input
                        type="text"
                        className="input-compact"
                        placeholder="$0.00"
                        value={item.price}
                        onChange={(e) => updateItemPrice(item.id, e.target.value)}
                        inputMode="decimal"
                      />
                      <button
                        className="wheel-btn-compact"
                        onClick={() => openWheel(item.id, 'price', item.price)}
                      >
                        🎚️
                      </button>
                    </div>
                  </div>
                )}
                <div className="input-group-compact">
                  <label className="input-label-mini">Landing</label>
                  <div className="input-with-wheel">
                    <input
                      type="text"
                      className="input-compact"
                      placeholder="$0.00"
                      value={item.landingCost}
                      onChange={(e) => updateItem(item.id, 'landingCost', e.target.value)}
                      inputMode="decimal"
                    />
                    <button
                      className="wheel-btn-compact"
                      onClick={() => openWheel(item.id, 'landingCost', item.landingCost)}
                    >
                      🎚️
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          <button className="add-item-btn" onClick={addItem}>
            + Add Another Item
          </button>
        </div>
      </div>

      {/* Sticky Calculate Button */}
      <div className="sticky-bottom">
        <button className="calc-btn-enhanced" onClick={calculate}>
          {mode === 'quote' ? '💵 Calculate Quote' : mode === 'margin' ? '📊 Check Margin' : '🎯 Analyze OTD'}
        </button>
      </div>

      {/* Results Modal */}
      {showResults && (
        <div className="result-overlay" onClick={resetForm}>
          <div className="result-card" style={{ padding: 14 }} onClick={e => e.stopPropagation()}>
            <div className="result-title" style={{ fontSize: 16, marginBottom: 12 }}>
              {mode === 'quote' ? '💵 Your Quote' : mode === 'margin' ? '📊 Margin Analysis' : '🎯 OTD Analysis'}
            </div>

            {/* Quick Quote Results */}
            {mode === 'quote' && (
              <>
                {noTaxPromo ? (
                  /* No-Tax Promo ON - Show single tax-included price */
                  <>
                    <div className="big-total">
                      <div className="big-total-label">Quote to Customer</div>
                      <div className="big-total-amount">{formatMoney(customerTotal)}</div>
                      <div className="big-total-sub">Tax included • Ready to pay</div>
                    </div>

                    <div style={{ background: '#e8f5e9', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#2e7d32', fontWeight: 600, marginBottom: '4px' }}>💬 Tell Customer:</div>
                      <div style={{ fontSize: '15px', color: '#333', fontWeight: 600 }}>
                        "Your total is {formatMoney(customerTotal)} — that includes everything!"
                      </div>
                    </div>

                    <div className="section-title">📝 For Invoice (What to Write)</div>
                    <div style={{ background: '#fff8e1', borderRadius: '8px', padding: '12px' }}>
                      {calculatedItems.map((item, i) => (
                        <div key={item.id} className="breakdown-row" style={{ padding: '3px 0' }}>
                          <span style={{ fontSize: '13px' }}>{item.name || `Item ${i + 1}`} × {item.qty}</span>
                          <span style={{ fontWeight: 600 }}>{formatMoney(item.lineTotal)}</span>
                        </div>
                      ))}
                      {deliveryAmount > 0 && (
                        <div className="breakdown-row" style={{ padding: '3px 0' }}>
                          <span style={{ fontSize: '13px' }}>Delivery</span>
                          <span style={{ fontWeight: 600 }}>{formatMoney(deliveryAmount)}</span>
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: '#666', marginTop: '8px', fontStyle: 'italic' }}>
                        Tax auto-calculates to {formatMoney(totalTax)} → Total = {formatMoney(customerTotal)} ✓
                      </div>
                    </div>
                  </>
                ) : (
                  /* No-Tax Promo OFF - Show price + tax separately */
                  <>
                    <div className="big-total">
                      <div className="big-total-label">Price Before Tax</div>
                      <div className="big-total-amount">{formatMoney(subtotal + deliveryAmount)}</div>
                      <div className="big-total-sub">+ {formatMoney(totalTax)} tax at register</div>
                    </div>

                    <div className="section-title">Breakdown</div>
                    {calculatedItems.map((item, i) => (
                      <div key={item.id} className="breakdown-row">
                        <span className="breakdown-label">
                          {item.name || `Item ${i + 1}`} × {item.qty}
                        </span>
                        <span className="breakdown-value">{formatMoney(item.lineTotal)}</span>
                      </div>
                    ))}
                    <div className="breakdown-row">
                      <span className="breakdown-label">Merchandise Subtotal</span>
                      <span className="breakdown-value">{formatMoney(subtotal)}</span>
                    </div>
                    {deliveryAmount > 0 && (
                      <div className="breakdown-row">
                        <span className="breakdown-label">Delivery</span>
                        <span className="breakdown-value">{formatMoney(deliveryAmount)}</span>
                      </div>
                    )}
                    <div className="breakdown-row" style={{ background: '#f5f2ef', margin: '0 -20px', padding: '8px 20px' }}>
                      <span className="breakdown-label" style={{ fontWeight: 600 }}>Subtotal</span>
                      <span className="breakdown-value">{formatMoney(subtotal + deliveryAmount)}</span>
                    </div>
                    <div className="breakdown-row">
                      <span className="breakdown-label">+ Tax (9.125%)</span>
                      <span className="breakdown-value">{formatMoney(totalTax)}</span>
                    </div>
                    <div className="breakdown-row" style={{ background: '#f5f2ef', margin: '0 -20px', padding: '10px 20px' }}>
                      <span className="breakdown-label" style={{ fontWeight: 600 }}>Customer Pays</span>
                      <span className="breakdown-value" style={{ fontSize: '18px' }}>{formatMoney(customerTotal)}</span>
                    </div>
                    
                    <div style={{ background: '#e8f5e9', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#2e7d32', fontWeight: 600, marginBottom: '4px' }}>💬 Tell Customer:</div>
                      <div style={{ fontSize: '13px', color: '#666' }}>
                        "{formatMoney(subtotal + deliveryAmount)} plus tax"
                      </div>
                    </div>
                  </>
                )}

                {/* Copy-Paste Text Block */}
                <CopyBlock
                  title="📋 Copy for Text/Notes"
                  content={noTaxPromo
                    ? `QUOTE (No-Tax Promo)\n${calculatedItems.map((item, i) => `${item.name || `Item ${i+1}`} x${item.qty}: ${formatMoney(item.quotePrice * item.qty)}`).join('\n')}${deliveryAmount > 0 ? `\nDelivery: ${formatMoney(deliveryAmount + deliveryTax)}` : ''}\nTOTAL: ${formatMoney(customerTotal)}\n\nFor invoice: ${formatMoney(subtotal)} merch${deliveryAmount > 0 ? ` + ${formatMoney(deliveryAmount)} delivery` : ''}`
                    : `QUOTE\n${calculatedItems.map((item, i) => `${item.name || `Item ${i+1}`} x${item.qty}: ${formatMoney(item.lineTotal)}`).join('\n')}\nSubtotal: ${formatMoney(subtotal + deliveryAmount)}\n+ Tax: ${formatMoney(totalTax)}\nTOTAL: ${formatMoney(customerTotal)}`
                  }
                />
              </>
            )}

            {/* Margin Check Results */}
            {mode === 'margin' && (
              <>
                {subtotal > 0 ? (
                  <div className="big-total">
                    <div className="big-total-label">
                      {noTaxPromo ? 'Quote to Customer' : 'Merchandise Total'}
                    </div>
                    <div className="big-total-amount">
                      {formatMoney(noTaxPromo ? calculatedItems.reduce((sum, item) => sum + (item.quotePrice * item.qty), 0) : subtotal)}
                    </div>
                    {!noTaxPromo && (
                      <div className="big-total-sub">(+ tax at register)</div>
                    )}
                    {overallMargin !== null && (
                      <div className={`badge ${overallMargin >= 50 ? 'green' : overallMargin >= 47 ? 'orange' : 'red'}`}>
                        {getMarginLabel(overallMargin)} • {overallMargin.toFixed(1)}% margin
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="big-total">
                    <div className="big-total-label">Select a Margin Target</div>
                    <div className="big-total-amount" style={{ fontSize: '24px', color: '#888' }}>Tap below</div>
                    <div className="big-total-sub">Choose 50%, 49%, 48%, or 47% to see pricing</div>
                  </div>
                )}

                <div className="section-title">Margin by Item</div>
                {calculatedItems.filter(item => item.landingCost > 0).map((item, i) => (
                  <div key={item.id} className="margin-item">
                    <div className="margin-item-header">
                      <span className="margin-item-name">{item.name || `Item ${i + 1}`}</span>
                      {item.margin !== null && (
                        <span 
                          className="margin-badge"
                          style={{ 
                            background: item.margin >= 50 ? '#e8f5e9' : item.margin >= 47 ? '#fff3e0' : '#ffebee',
                            color: getMarginColor(item.margin)
                          }}
                        >
                          {item.margin.toFixed(1)}% margin
                        </span>
                      )}
                    </div>
                    {item.invoicePrice > 0 ? (
                      <div style={{ fontSize: '12px', color: '#666', lineHeight: 1.6 }}>
                        {noTaxPromo ? (
                          <>
                            Quote: {formatMoney(item.quotePrice)} • Invoice: {formatMoney(item.invoicePrice)}
                          </>
                        ) : (
                          <>
                            Sale: {formatMoney(item.invoicePrice)} (+ tax at register)
                          </>
                        )}
                        <br/>
                        Landing: {formatMoney(item.landingCost)} • 
                        <strong style={{ color: getMarginColor(item.margin || 0) }}>
                          {' '}Profit: {formatMoney(item.profitPerUnit)}/unit
                        </strong>
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#666', lineHeight: 1.6 }}>
                        Landing: {formatMoney(item.landingCost)} • <em>Tap a margin target below</em>
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: '#8b7355', marginTop: '8px', marginBottom: '4px', fontWeight: 600 }}>
                      {item.selectedMargin 
                        ? 'Tap again to restore original price:' 
                        : (noTaxPromo ? 'Tap to set price (shows quote w/ tax):' : 'Tap to set sale price:')}
                    </div>
                    <div className="margin-prices">
                      <div 
                        className={`margin-price-box ${item.selectedMargin === 50 ? 'current' : ''}`}
                        onClick={() => setItemToMargin(item.id, 50)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="margin-price-label">50%</div>
                        <div className="margin-price-value">{formatMoney(noTaxPromo ? item.priceAt50 * (1 + taxRate) : item.priceAt50)}</div>
                      </div>
                      <div 
                        className={`margin-price-box ${item.selectedMargin === 49 ? 'current' : ''}`}
                        onClick={() => setItemToMargin(item.id, 49)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="margin-price-label">49%</div>
                        <div className="margin-price-value">{formatMoney(noTaxPromo ? item.priceAt49 * (1 + taxRate) : item.priceAt49)}</div>
                      </div>
                      <div 
                        className={`margin-price-box ${item.selectedMargin === 48 ? 'current' : ''}`}
                        onClick={() => setItemToMargin(item.id, 48)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="margin-price-label">48%</div>
                        <div className="margin-price-value">{formatMoney(noTaxPromo ? item.priceAt48 * (1 + taxRate) : item.priceAt48)}</div>
                      </div>
                      <div 
                        className={`margin-price-box ${item.selectedMargin === 47 ? 'current' : ''}`}
                        onClick={() => setItemToMargin(item.id, 47)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="margin-price-label">47%</div>
                        <div className="margin-price-value">{formatMoney(noTaxPromo ? item.priceAt47 * (1 + taxRate) : item.priceAt47)}</div>
                      </div>
                    </div>
                    {noTaxPromo && item.margin !== null && (
                      <div style={{ fontSize: '11px', color: '#666', marginTop: '8px', background: '#fff8e1', padding: '8px', borderRadius: '6px' }}>
                        📝 <strong>Invoice:</strong> Write {formatMoney(item.invoicePrice)} for {item.margin.toFixed(0)}% margin → customer pays {formatMoney(item.quotePrice)}
                      </div>
                    )}
                  </div>
                ))}

                {/* Summary Table */}
                <div className="section-title">📊 Deal at a Glance</div>
                <div style={{ overflowX: 'auto', margin: '0 -8px' }}>
                  <table style={{ 
                    width: '100%', 
                    borderCollapse: 'collapse', 
                    fontSize: '12px',
                    background: 'white',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}>
                    <thead>
                      <tr style={{ background: '#f5f2ef' }}>
                        <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 600, color: '#5c4a3a', borderBottom: '2px solid #e0d8cf' }}>Item</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: '#5c4a3a', borderBottom: '2px solid #e0d8cf' }}>Landing</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: '#5c4a3a', borderBottom: '2px solid #e0d8cf' }}>Invoice</th>
                        {noTaxPromo && <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: '#5c4a3a', borderBottom: '2px solid #e0d8cf' }}>Quote</th>}
                        <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: '#5c4a3a', borderBottom: '2px solid #e0d8cf' }}>Profit</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: '#5c4a3a', borderBottom: '2px solid #e0d8cf' }}>Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculatedItems.filter(item => item.landingCost > 0).map((item, i) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f0ebe5' }}>
                          <td style={{ padding: '8px 6px', color: '#333' }}>{item.name || `Item ${i + 1}`}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#666' }}>{formatMoney(item.landingCost)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#333', fontWeight: 500 }}>{item.invoicePrice > 0 ? formatMoney(item.invoicePrice) : '—'}</td>
                          {noTaxPromo && <td style={{ padding: '8px 6px', textAlign: 'right', color: '#1565c0', fontWeight: 500 }}>{item.quotePrice > 0 ? formatMoney(item.quotePrice) : '—'}</td>}
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#2e7d32', fontWeight: 500 }}>{item.profitPerUnit !== null ? formatMoney(item.profitPerUnit) : '—'}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: getMarginColor(item.margin || 0) }}>
                            {item.margin !== null ? `${item.margin.toFixed(0)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr style={{ background: '#f5f2ef', fontWeight: 600 }}>
                        <td style={{ padding: '10px 6px', color: '#5c4a3a' }}>TOTAL</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#666' }}>{formatMoney(totalLandingCost)}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#333' }}>{subtotal > 0 ? formatMoney(subtotal) : '—'}</td>
                        {noTaxPromo && <td style={{ padding: '10px 6px', textAlign: 'right', color: '#1565c0' }}>{subtotal > 0 ? formatMoney(calculatedItems.reduce((sum, item) => sum + (item.quotePrice * item.qty), 0)) : '—'}</td>}
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: '#2e7d32' }}>{totalProfit > 0 ? formatMoney(totalProfit) : '—'}</td>
                        <td style={{ padding: '10px 6px', textAlign: 'right', color: getMarginColor(overallMargin || 0) }}>
                          {overallMargin !== null ? `${overallMargin.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="section-title">Deal Summary</div>
                <div className="breakdown-row">
                  <span className="breakdown-label">Invoice Total</span>
                  <span className="breakdown-value">{subtotal > 0 ? formatMoney(subtotal) : '—'}</span>
                </div>
                <div className="breakdown-row">
                  <span className="breakdown-label">Total Landing Cost</span>
                  <span className="breakdown-value">{formatMoney(totalLandingCost)}</span>
                </div>
                <div className="breakdown-row">
                  <span className="breakdown-label">Total Profit</span>
                  <span className="breakdown-value" style={{ color: '#2e7d32' }}>{totalProfit > 0 ? formatMoney(totalProfit) : '—'}</span>
                </div>
                {deliveryAmount > 0 && (
                  <div className="breakdown-row">
                    <span className="breakdown-label">Delivery + Tax</span>
                    <span className="breakdown-value">{formatMoney(deliveryAmount + deliveryTax)}</span>
                  </div>
                )}
                {noTaxPromo && subtotal > 0 && (
                  <div style={{ background: '#e8f5e9', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
                    <div style={{ fontSize: '12px', color: '#2e7d32', fontWeight: 600, marginBottom: '4px' }}>💬 Quote to Customer:</div>
                    <div style={{ fontSize: '15px', color: '#333', fontWeight: 600 }}>
                      {formatMoney(calculatedItems.reduce((sum, item) => sum + (item.quotePrice * item.qty), 0) + deliveryAmount + deliveryTax)} total
                    </div>
                  </div>
                )}

                {/* Copy-Paste Text Block */}
                <CopyBlock
                  title="📋 Copy for Manager"
                  content={`MARGIN CHECK\n${calculatedItems.filter(i => i.landingCost > 0).map((item, i) => `${item.name || `Item ${i+1}`}: Landing ${formatMoney(item.landingCost)} → Invoice ${item.invoicePrice > 0 ? formatMoney(item.invoicePrice) : '—'} = ${item.margin !== null ? item.margin.toFixed(0) + '%' : '—'}`).join('\n')}\n\nTotal Landing: ${formatMoney(totalLandingCost)}\nInvoice Total: ${subtotal > 0 ? formatMoney(subtotal) : '—'}\nProfit: ${totalProfit > 0 ? formatMoney(totalProfit) : '—'}\nMARGIN: ${overallMargin !== null ? overallMargin.toFixed(1) + '%' : '—'} ${overallMargin >= 50 ? '✓' : overallMargin >= 47 ? '⚠️' : '✗'}`}
                />
              </>
            )}

            {/* OTD Results */}
            {mode === 'otd' && (
              <>
                {otdMargin !== null && (
                  <>
                    <div className="big-total" style={{
                      background: otdMargin >= 50 
                        ? 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)'
                        : otdMargin >= 47
                        ? 'linear-gradient(135deg, #f57c00 0%, #e65100 100%)'
                        : 'linear-gradient(135deg, #c62828 0%, #b71c1c 100%)'
                    }}>
                      <div className="big-total-label">
                        {otdMargin >= 50 ? '✓ APPROVED' : otdMargin >= 47 ? '⚠️ MANAGER OK?' : '✗ TOO LOW'}
                      </div>
                      <div className="big-total-amount">{formatMoney(otdAmount)}</div>
                      <div className="big-total-sub">Customer's OTD offer</div>
                    </div>

                    <div className="section-title">Deal Breakdown</div>
                    <div className="breakdown-row">
                      <span className="breakdown-label">Customer Offer (OTD)</span>
                      <span className="breakdown-value">{formatMoney(otdAmount)}</span>
                    </div>
                    {deliveryAmount > 0 && (
                      <div className="breakdown-row">
                        <span className="breakdown-label">− Delivery + Tax</span>
                        <span className="breakdown-value">({formatMoney(otdDeliveryWithTax)})</span>
                      </div>
                    )}
                    <div className="breakdown-row">
                      <span className="breakdown-label">= Merch w/ Tax</span>
                      <span className="breakdown-value">{formatMoney(otdMerchandiseWithTax)}</span>
                    </div>
                    <div className="breakdown-row">
                      <span className="breakdown-label">− Tax ({TAX_RATE}%)</span>
                      <span className="breakdown-value">({formatMoney(otdMerchandiseTax)})</span>
                    </div>
                    <div className="breakdown-row" style={{ background: '#f5f2ef', margin: '0 -20px', padding: '10px 20px' }}>
                      <span className="breakdown-label" style={{ fontWeight: 600 }}>= Sale Price (Invoice)</span>
                      <span className="breakdown-value" style={{ fontSize: '16px' }}>{formatMoney(otdSalePrice)}</span>
                    </div>

                    <div className="section-title">Margin Analysis</div>
                    <div className="breakdown-row">
                      <span className="breakdown-label">Total Landing Cost</span>
                      <span className="breakdown-value">{formatMoney(totalLandingCost)}</span>
                    </div>
                    <div className="breakdown-row">
                      <span className="breakdown-label">Sale Price</span>
                      <span className="breakdown-value">{formatMoney(otdSalePrice)}</span>
                    </div>
                    <div className="breakdown-row">
                      <span className="breakdown-label">Profit</span>
                      <span className="breakdown-value" style={{ color: otdProfit >= 0 ? '#2e7d32' : '#c62828' }}>
                        {formatMoney(otdProfit)}
                      </span>
                    </div>
                    <div className="breakdown-row" style={{ background: '#f5f2ef', margin: '0 -20px', padding: '10px 20px' }}>
                      <span className="breakdown-label" style={{ fontWeight: 600, fontSize: '14px' }}>MARGIN</span>
                      <span 
                        className="breakdown-value" 
                        style={{ 
                          fontSize: '20px',
                          color: getMarginColor(otdMargin)
                        }}
                      >
                        {otdMargin?.toFixed(1)}%
                      </span>
                    </div>

                    {/* OTD Price Targets */}
                    <div className="section-title">Counter-Offer Prices (OTD)</div>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
                      If you need to counter, here's what OTD price hits each margin:
                    </div>
                    <div className="margin-prices">
                      <div className={`margin-price-box ${otdMargin >= 49.5 && otdMargin < 50.5 ? 'current' : ''}`}>
                        <div className="margin-price-label">50%</div>
                        <div className="margin-price-value">{formatMoney((priceForMargin(totalLandingCost, 50) * (1 + taxRate)) + deliveryAmount + deliveryTax)}</div>
                      </div>
                      <div className={`margin-price-box ${otdMargin >= 48.5 && otdMargin < 49.5 ? 'current' : ''}`}>
                        <div className="margin-price-label">49%</div>
                        <div className="margin-price-value">{formatMoney((priceForMargin(totalLandingCost, 49) * (1 + taxRate)) + deliveryAmount + deliveryTax)}</div>
                      </div>
                      <div className={`margin-price-box ${otdMargin >= 47.5 && otdMargin < 48.5 ? 'current' : ''}`}>
                        <div className="margin-price-label">48%</div>
                        <div className="margin-price-value">{formatMoney((priceForMargin(totalLandingCost, 48) * (1 + taxRate)) + deliveryAmount + deliveryTax)}</div>
                      </div>
                      <div className={`margin-price-box ${otdMargin >= 46.5 && otdMargin < 47.5 ? 'current' : ''}`}>
                        <div className="margin-price-label">47%</div>
                        <div className="margin-price-value">{formatMoney((priceForMargin(totalLandingCost, 47) * (1 + taxRate)) + deliveryAmount + deliveryTax)}</div>
                      </div>
                    </div>
                  </>
                )}

                {otdMargin !== null && otdMargin < 47 && (
                  <div className="quick-ref">
                    <div className="quick-ref-title">⚠️ Below 47% Minimum</div>
                    <div className="quick-ref-item">
                      Counter with: <strong>{formatMoney((priceForMargin(totalLandingCost, 47) * (1 + taxRate)) + deliveryAmount + deliveryTax)}</strong> for 47% margin
                    </div>
                  </div>
                )}

                {otdMargin !== null && otdMargin >= 47 && (
                  <div style={{ background: '#fff8e1', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
                    <div style={{ fontSize: '12px', color: '#f57c00', fontWeight: 600, marginBottom: '4px' }}>📝 For Invoice:</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      Write <strong>{formatMoney(otdSalePrice)}</strong> merchandise{deliveryAmount > 0 && <> + <strong>{formatMoney(deliveryAmount)}</strong> delivery</>}
                      <br/>
                      Tax auto-calculates → Total = {formatMoney(otdAmount)} ✓
                    </div>
                  </div>
                )}

                {/* Copy-Paste Text Block */}
                <CopyBlock
                  title="📋 Copy for Manager"
                  content={`OTD REQUEST\n${calculatedItems.filter(i => i.landingCost > 0).map((item, i) => `${item.name || `Item ${i+1}`}: Landing ${formatMoney(item.landingCost)}`).join('\n')}\nTotal Landing: ${formatMoney(totalLandingCost)}\n\nCustomer Offer: ${formatMoney(otdAmount)} OTD${deliveryAmount > 0 ? `\nDelivery: ${formatMoney(deliveryAmount)} + ${formatMoney(deliveryTax)} tax` : ''}\nSale Price: ${formatMoney(otdSalePrice)}\nProfit: ${formatMoney(otdProfit)}\nMARGIN: ${otdMargin?.toFixed(1)}% ${otdMargin >= 50 ? '✓' : otdMargin >= 47 ? '⚠️' : '✗'}${otdMargin < 47 ? `\n\n⚠️ BELOW 47% - Min OTD: ${formatMoney((priceForMargin(totalLandingCost, 47) * (1 + taxRate)) + deliveryAmount + deliveryTax)}` : ''}`}
                />
              </>
            )}

            <div className="result-buttons">
              <button className="result-btn secondary" onClick={startOver}>
                Start Over
              </button>
              <button className="result-btn primary" onClick={resetForm}>
                Edit Deal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-modal" onClick={e => e.stopPropagation()}>
            <h2>📖 How to Use This Calculator</h2>
            
            <div className="help-section">
              <h3>💵 Quick Quote</h3>
              <p>Fast customer quotes — just enter prices and get the total.</p>
              <ul>
                <li>Enter sale prices from the tags</li>
                <li>Pick your delivery ($100/$135/$150)</li>
                <li>Get the total to quote the customer</li>
              </ul>
            </div>

            <div className="help-section">
              <h3>📊 Margin Check</h3>
              <p>Verify you're hitting margin targets, especially when haggling.</p>
              <ul>
                <li>Enter <strong>Sale Price</strong> and <strong>Landing Cost</strong></li>
                <li>See your current margin %</li>
                <li>See price targets for 50%/49%/48%/47% margins</li>
                <li>When No-Tax is ON, shows what to quote vs. write on invoice</li>
                <li><span style={{color: '#2e7d32'}}>■</span> <strong>Green = 50%+</strong> (target)</li>
                <li><span style={{color: '#f57c00'}}>■</span> <strong>Orange = 47-49%</strong> (haggling OK)</li>
                <li><span style={{color: '#c62828'}}>■</span> <strong>Red = below 47%</strong> (don't do it!)</li>
              </ul>
            </div>

            <div className="help-section">
              <h3>🎯 OTD Price</h3>
              <p>Customer says "I'll pay $X out the door" — check if it works.</p>
              <ul>
                <li>Enter <strong>Landing Cost</strong> for each item</li>
                <li>Enter customer's total offer</li>
                <li>Calculator backs out delivery & tax to find your sale price</li>
                <li>Shows the margin you'd actually make</li>
                <li>Tells you minimum OTD if below 47%</li>
              </ul>
            </div>

            <div className="help-section">
              <h3>🚚 Delivery</h3>
              <ul>
                <li><strong>$100</strong> = small single item</li>
                <li><strong>$135</strong> = standard (default)</li>
                <li><strong>$150</strong> = larger/farther</li>
                <li>Delivery is <strong>always taxed</strong> at 9.125%</li>
                <li>Shows "Delivery + tax = $XXX" so you know the real cost</li>
              </ul>
            </div>

            <div className="help-section">
              <h3>📏 Margin Rules</h3>
              <ul>
                <li><strong>50%+</strong> = Target margin ✓</li>
                <li><strong>49%</strong> = OK if customer pushes</li>
                <li><strong>48%</strong> = Getting close to floor</li>
                <li><strong>47%</strong> = Absolute minimum (manager OK needed)</li>
                <li><strong>Below 47%</strong> = Don't do it ✗</li>
              </ul>
            </div>

            <div className="help-section">
              <h3>🏷️ No-Tax Promo</h3>
              <p><strong>What it means:</strong> You quote the customer a tax-included price upfront. They pay the same total either way — it's just how you present it.</p>
              <ul>
                <li><strong>No-Tax ON:</strong> "Your total is $1,091.25 out the door"</li>
                <li><strong>No-Tax OFF:</strong> "$1,000 plus tax"</li>
                <li>Both = customer pays $1,091.25</li>
              </ul>
              <p style={{ marginTop: '8px' }}><strong>For invoices:</strong> Always write the pre-tax merchandise price. Tax auto-calculates to match your quote.</p>
              <p style={{ marginTop: '8px' }}><strong>Example:</strong></p>
              <ul>
                <li>Landing: $500, Target: 50% margin</li>
                <li>Sale price needed: $1,000</li>
                <li>Quote customer: $1,091.25 (with tax)</li>
                <li>Write on invoice: $1,000 merchandise</li>
                <li>Tax auto-adds: $91.25 → Total: $1,091.25 ✓</li>
              </ul>
            </div>

            <button className="help-close" onClick={() => setShowHelp(false)}>
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Confirm Reset Modal */}
      {showConfirmReset && (
        <div className="help-overlay" onClick={() => setShowConfirmReset(false)}>
          <div className="help-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '360px', textAlign: 'center' }}>
            <h2 style={{ marginBottom: '12px' }}>⚠️ Start Over?</h2>
            <p style={{ fontSize: '14px', color: '#555', marginBottom: '20px' }}>
              Are you sure you want to start over? This will clear all items and reset the calculator.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowConfirmReset(false)}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: '#f5f2ef',
                  color: '#666',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmStartOver}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: '#c62828',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Yes, Start Over
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scroll Wheel Picker Modal */}
      {wheelOpen && (
        <div className="wheel-overlay" onClick={() => setWheelOpen(null)}>
          <div className="wheel-modal" onClick={e => e.stopPropagation()}>
            <div className="wheel-header">
              <span className="wheel-title">
                {wheelOpen.field === 'otd' ? 'Set OTD Price' :
                 wheelOpen.field === 'price' ? 'Set Price' : 'Set Landing Cost'}
              </span>
              <button className="wheel-cancel" onClick={() => setWheelOpen(null)}>Cancel</button>
            </div>

            <div className="wheel-display">
              {formatMoney(getWheelTotal())}
            </div>

            <div className="wheel-columns">
              {/* Dollars section */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: '24px', color: '#888', marginRight: '4px' }}>$</span>
              </div>

              {/* Thousands (can be 0-99) */}
              <div className="wheel-column wide">
                <button className="wheel-arrow" onClick={() => updateWheelColumn('thousands', 1)}>▲</button>
                <div className="wheel-value">{wheelValues.thousands.toString().padStart(2, '0')}</div>
                <button className="wheel-arrow" onClick={() => updateWheelColumn('thousands', -1)}>▼</button>
                <div className="wheel-label">1000s</div>
              </div>

              {/* Hundreds */}
              <div className="wheel-column">
                <button className="wheel-arrow" onClick={() => updateWheelColumn('hundreds', 1)}>▲</button>
                <div className="wheel-value">{wheelValues.hundreds}</div>
                <button className="wheel-arrow" onClick={() => updateWheelColumn('hundreds', -1)}>▼</button>
                <div className="wheel-label">100s</div>
              </div>

              {/* Tens */}
              <div className="wheel-column">
                <button className="wheel-arrow" onClick={() => updateWheelColumn('tens', 1)}>▲</button>
                <div className="wheel-value">{wheelValues.tens}</div>
                <button className="wheel-arrow" onClick={() => updateWheelColumn('tens', -1)}>▼</button>
                <div className="wheel-label">10s</div>
              </div>

              {/* Ones */}
              <div className="wheel-column">
                <button className="wheel-arrow" onClick={() => updateWheelColumn('ones', 1)}>▲</button>
                <div className="wheel-value">{wheelValues.ones}</div>
                <button className="wheel-arrow" onClick={() => updateWheelColumn('ones', -1)}>▼</button>
                <div className="wheel-label">1s</div>
              </div>

              <div className="wheel-separator">.</div>

              {/* Ten cents */}
              <div className="wheel-column">
                <button className="wheel-arrow" onClick={() => updateWheelColumn('tenCents', 1)}>▲</button>
                <div className="wheel-value">{wheelValues.tenCents}</div>
                <button className="wheel-arrow" onClick={() => updateWheelColumn('tenCents', -1)}>▼</button>
                <div className="wheel-label">10¢</div>
              </div>

              {/* Cents */}
              <div className="wheel-column">
                <button className="wheel-arrow" onClick={() => updateWheelColumn('cents', 1)}>▲</button>
                <div className="wheel-value">{wheelValues.cents}</div>
                <button className="wheel-arrow" onClick={() => updateWheelColumn('cents', -1)}>▼</button>
                <div className="wheel-label">1¢</div>
              </div>
            </div>

            <button className="wheel-confirm" onClick={confirmWheelValue}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Helper/Tutorial Overlay */}
      {helperActive && (
        <div className="helper-overlay">
          <div className="helper-card">
            {/* Progress dots */}
            <div className="helper-progress">
              {helperSteps.map((step, index) => (
                <div
                  key={step.id}
                  className={`helper-dot ${index === helperStep ? 'active' : ''} ${index < helperStep ? 'completed' : ''}`}
                />
              ))}
            </div>

            <div className="helper-step-badge">
              {helperStep + 1} of {helperSteps.length}
            </div>
            <div className="helper-title">{helperSteps[helperStep].title}</div>
            <div className="helper-desc">{helperSteps[helperStep].description}</div>

            <div className="helper-buttons">
              <button className="helper-btn secondary" onClick={skipHelper}>
                Skip Tutorial
              </button>
              <button className="helper-btn primary" onClick={nextHelperStep}>
                {helperStep === helperSteps.length - 1 ? 'Got It!' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Feedback Toast */}
      {copyFeedback && (
        <div className="toast">✓ Copied to clipboard</div>
      )}
    </div>
  );
}
