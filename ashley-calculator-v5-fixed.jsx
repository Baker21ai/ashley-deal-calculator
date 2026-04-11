import { useState, useLayoutEffect, useMemo, useEffect, useRef, useCallback } from 'react';

const TAX_RATE = 9.125;
const STORAGE_KEY = 'ashley-calculator-state';
const DEFAULT_DELIVERY = 135;

// Item type presets - top 5 always visible, rest in expandable section
const TOP_ITEM_PRESETS = ['Sofa', 'Sectional', 'Bed', 'Mattress', 'Dresser'];
const MORE_ITEM_PRESETS = [
  'Loveseat', 'Chair', 'Ottoman', 'Recliner', 'Nightstand',
  'Chest', 'Mirror', 'Dining Table', 'Dining Chair', 'Buffet',
  'Coffee Table', 'End Table', 'Console Table', 'TV Stand', 'Bookcase',
  'Desk', 'Bookshelf', 'Accent Chair', 'Headboard', 'Bunk Bed'
];

const createEmptyItem = (id = Date.now()) => ({
  id,
  name: '',
  price: '',
  qty: 1,
  landingCost: '',
  marginSet: false,
  selectedMargin: null,
  originalPrice: undefined,
});

const normalizeItem = (item, fallbackId) => {
  const safeItem = item && typeof item === 'object' ? item : {};
  const qtyValue = parseInt(safeItem.qty, 10);
  return {
    id: safeItem.id ?? fallbackId,
    name: safeItem.name ?? '',
    price: safeItem.price ?? '',
    qty: Number.isFinite(qtyValue) && qtyValue > 0 ? qtyValue : 1,
    landingCost: safeItem.landingCost ?? '',
    marginSet: Boolean(safeItem.marginSet),
    selectedMargin: safeItem.selectedMargin ?? null,
    originalPrice: safeItem.originalPrice,
  };
};

const loadStoredState = () => {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    console.error('Failed to load saved state:', e);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage cleanup errors
    }
    return null;
  }
};

// Design System Constants
const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

const colors = {
  primary: {
    50: 'rgba(255,255,255,0.06)',
    100: 'rgba(255,255,255,0.08)',
    200: 'rgba(255,255,255,0.12)',
    400: '#E23744',
    500: '#E23744',
    600: '#C92A36',
  },
  success: { light: 'rgba(52,211,153,0.15)', main: '#34D399', dark: '#10B981' },
  warning: { light: 'rgba(251,191,36,0.15)', main: '#FBBF24', dark: '#F59E0B' },
  error: { light: 'rgba(248,113,113,0.15)', main: '#F87171', dark: '#EF4444' },
  info: { light: 'rgba(59,130,246,0.15)', main: '#3B82F6' },
  text: { primary: '#F5F0EB', secondary: '#8B91A0', disabled: '#6B7280' },
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

// Protection plan tiers based on merchandise total (invoice subtotal)
// 0-1k: $150, 1-2k: $200, 2-3k: $250, 3-4k: $300, 4-5k: $350
// 5-6k: $500, then +$50 per additional $1k
function calculateProtectionPlan(merchandiseTotal) {
  if (merchandiseTotal <= 0) return 0;
  const tier = Math.ceil(merchandiseTotal / 1000);
  if (tier <= 5) return 100 + tier * 50;
  if (tier === 6) return 500;
  return 500 + (tier - 6) * 50;
}

export default function AshleyDealCalculator() {
  const storedState = useMemo(() => loadStoredState(), []);
  const initialItems = Array.isArray(storedState?.items) && storedState.items.length > 0
    ? storedState.items.map((item, index) => normalizeItem(item, Date.now() + index))
    : [createEmptyItem(1)];
  const initialCustomInput = {};
  initialItems.forEach((item) => {
    if (item.name && !TOP_ITEM_PRESETS.includes(item.name) && !MORE_ITEM_PRESETS.includes(item.name)) {
      initialCustomInput[item.id] = true;
    }
  });

  const [mode, setMode] = useState(() => {
    const saved = storedState?.mode;
    return saved === 'quote' || saved === 'margin' ? saved : 'margin';
  });
  const [showHelp, setShowHelp] = useState(false);
  
  // Deal settings
  const [salePercent, setSalePercent] = useState(
    Number.isFinite(storedState?.salePercent) ? storedState.salePercent : 30
  );
  const [noTaxPromo, setNoTaxPromo] = useState(
    typeof storedState?.noTaxPromo === 'boolean' ? storedState.noTaxPromo : true
  );
  const [priceType, setPriceType] = useState(storedState?.priceType ?? 'sale');
  const [delivery, setDelivery] = useState(
    storedState?.delivery != null ? String(storedState.delivery) : String(DEFAULT_DELIVERY)
  );
  
  // Items
  const [items, setItems] = useState(initialItems);
  
  // Results
  const [showResults, setShowResults] = useState(false);
  const [errors, setErrors] = useState({});

  // Confirmation modal
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  // Item presets UI state - track which items have expanded presets
  const [expandedItemPresets, setExpandedItemPresets] = useState({});
  const [showCustomInput, setShowCustomInput] = useState(initialCustomInput);
  const [expandedMore, setExpandedMore] = useState({});

  // Copy feedback state
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Calculate button feedback
  const [calcPulse, setCalcPulse] = useState(false);

  // Protection plan
  const [includeProtection, setIncludeProtection] = useState(
    typeof storedState?.includeProtection === 'boolean' ? storedState.includeProtection : false
  );

  // Calculation history
  const HISTORY_KEY = 'ashley-calculator-history';
  const MAX_HISTORY = 10;
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);


  // Save state to localStorage whenever it changes
  useLayoutEffect(() => {
    try {
      const state = {
        mode,
        salePercent,
        noTaxPromo,
        priceType,
        delivery,
        items,
        includeProtection,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }, [mode, salePercent, noTaxPromo, priceType, delivery, items, includeProtection]);

  const taxRate = TAX_RATE / 100;

  const addItem = () => {
    setItems([...items, createEmptyItem()]);
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
    if (field === 'landingCost') clearError('landingCost');
    if (field === 'price') clearError('price');
  };

  const clearError = (key) => {
    setErrors(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const calculate = () => {
    const nextErrors = {};
    if (mode === 'margin') {
      // Margin Check only requires landing cost (price is optional)
      const hasLanding = items.some(item => String(item.landingCost).trim() !== '');
      if (!hasLanding) {
        nextErrors.landingCost = 'Enter landing cost for at least one item.';
      }
    } else {
      // Quick Quote requires price
      const validItems = items.filter(item => parseMoney(item.price) > 0);
      if (validItems.length === 0) {
        nextErrors.price = 'Add at least one item price.';
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setShowResults(false);
      return;
    }
    setShowResults(true);

    // Save to history
    const entry = {
      id: Date.now(),
      ts: Date.now(),
      mode,
      label: items.filter(i => i.name).map(i => i.name).join(', ') || 'Unnamed deal',
      itemCount: items.length,
      delivery,
      noTaxPromo,
      priceType,
      salePercent,
      includeProtection,
      items: items.map(i => ({ ...i })),
    };
    setHistory(prev => {
      const next = [entry, ...prev].slice(0, MAX_HISTORY);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Calculate totals
  const discount = salePercent / 100;
  const deliveryAmount = parseMoney(delivery);
  const deliveryTax = deliveryAmount * taxRate;

  const calculatedItems = items.map(item => {
    const rawPrice = parseMoney(item.price);
    const qty = parseInt(item.qty) || 1;
    const landingCost = parseMoney(item.landingCost);
    const landingProvided = String(item.landingCost).trim() !== '';
    
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
    }
    
    const lineTotal = invoicePrice * qty; // lineTotal is always invoice price for calculations
    const margin = (landingProvided && invoicePrice > 0) ? calculateMargin(invoicePrice, landingCost) : null;
    const totalLandingCost = landingCost * qty;
    
    // Calculate profit based on invoice price (what you actually keep)
    const profitPerUnit = (landingProvided && invoicePrice > 0) ? (invoicePrice - landingCost) : null;
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
      landingProvided,
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

  const protectionPlanCost = includeProtection ? calculateProtectionPlan(subtotal) : 0;

  // Customer total depends on mode and No-Tax setting
  let customerTotal;
  if (mode === 'quote' && noTaxPromo) {
    // Quick Quote + No-Tax: quote prices already include merch tax, just add delivery + delivery tax
    const quoteSubtotal = calculatedItems.reduce((sum, item) => sum + (item.quotePrice * item.qty), 0);
    customerTotal = quoteSubtotal + deliveryAmount + deliveryTax + protectionPlanCost;
  } else {
    // All other cases: invoice subtotal + all taxes + delivery
    customerTotal = subtotal + taxOnMerchandise + deliveryAmount + deliveryTax + protectionPlanCost;
  }

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
    clearError('price');
  };

  // Set ALL items to a target margin at once
  const setAllItemsToMargin = (targetMargin) => {
    setItems(items.map(item => {
      const landingCost = parseMoney(item.landingCost);
      if (landingCost > 0) {
        const originalPrice = item.marginSet ? item.originalPrice : item.price;
        const invoicePrice = priceForMargin(landingCost, targetMargin);
        return {
          ...item,
          price: invoicePrice.toFixed(2),
          marginSet: true,
          selectedMargin: targetMargin,
          originalPrice: originalPrice,
        };
      }
      return item;
    }));
  };

  // Estimate landing cost from full retail price / 3.3 (auto-calculate)
  const estimateLandingCost = (itemId) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const currentPrice = parseMoney(item.price);
    let retailPrice = 0;
    if (currentPrice > 0) {
      if (priceType === 'tag') {
        retailPrice = currentPrice;
      } else {
        const discount = salePercent / 100;
        retailPrice = currentPrice / (1 - discount);
      }
    }
    if (retailPrice > 0) {
      const estimated = Math.round((retailPrice / 3.3) * 100) / 100;
      updateItem(itemId, 'landingCost', estimated.toFixed(2));
    }
  };
  
  const startOver = () => {
    setShowConfirmReset(true);
  };

  const confirmStartOver = () => {
    setMode('margin');
    setSalePercent(30);
    setNoTaxPromo(true);
    setPriceType('sale');
    setDelivery(String(DEFAULT_DELIVERY));
    setItems([createEmptyItem(1)]);
    setErrors({});
    setExpandedItemPresets({});
    setShowCustomInput({});
    setExpandedMore({});
    setShowResults(false);
    setShowConfirmReset(false);
  };


  const restoreFromHistory = (entry) => {
    const restoredMode = entry.mode === 'otd' ? 'margin' : (entry.mode || 'margin');
    setMode(restoredMode);
    setItems(entry.items.map((item, index) => normalizeItem(item, Date.now() + index)));
    setDelivery(String(entry.delivery));
    setNoTaxPromo(entry.noTaxPromo);
    setPriceType(entry.priceType ?? 'sale');
    setSalePercent(entry.salePercent ?? 30);
    setIncludeProtection(entry.includeProtection ?? false);
    setShowHistory(false);
    setShowResults(false);
    setErrors({});
  };

  const formatRelativeTime = (ts) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const getMarginColor = (margin) => {
    if (margin >= 50) return colors.success.main;
    if (margin >= 47) return colors.warning.main;
    return colors.error.main;
  };

  const getMarginLabel = (margin) => {
    if (margin >= 50) return 'Great';
    if (margin >= 47) return 'OK';
    return 'Too Low';
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
          className="copy-block"
          role="button"
          tabIndex={0}
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
            position: 'relative',
            color: colors.text.primary
          }}
        >
          {content}
          <div style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: copied ? colors.success.main : colors.primary[200],
            color: copied ? 'white' : colors.text.secondary,
            padding: `${space.xs}px ${space.sm}px`,
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 600,
            transition: 'all 0.15s',
          }}>
            {copied ? '✓ Copied!' : '📋 Copy'}
          </div>
        </div>
        <p style={{ fontSize: '11px', color: colors.text.secondary, marginTop: space.xs, textAlign: 'center' }}>
          Tap to copy
        </p>
      </div>
    );
  };

  // State for header menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  // Settings modal (gear icon)
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCustomDelivery, setShowCustomDelivery] = useState(false);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [menuOpen]);

  // Enter key triggers calculation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !showResults && !showHelp && !showSettingsModal && !showHistory) {
        e.preventDefault();
        calculate();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  const salePercentOptions = [30, 35, 40];
  const deliveryOptions = ['0', '100', '135', '150'];

  const cycleNextSalePercent = () => {
    const idx = salePercentOptions.indexOf(salePercent);
    setSalePercent(salePercentOptions[(idx + 1) % salePercentOptions.length]);
  };

  const cycleNextDelivery = () => {
    const idx = deliveryOptions.indexOf(delivery);
    if (idx === -1) {
      setDelivery(deliveryOptions[0]);
    } else {
      setDelivery(deliveryOptions[(idx + 1) % deliveryOptions.length]);
    }
    setShowCustomDelivery(false);
  };

  const currentGuide = (() => {
    if (mode === 'quote') {
      return {
        title: 'Quick Start (Quote)',
        steps: [
          'Enter the tag price or sale price.',
          'Pick a delivery option.',
          'Tap Calculate.',
        ],
        example: '$1,000 tag + $135 delivery = total shown',
        mistake: "Don't enter landing cost in this mode.",
      };
    }
    if (mode === 'margin') {
      return {
        title: 'Quick Start (Margin)',
        steps: [
          'Enter the sale price.',
          'Enter the landing cost.',
          'Check the color indicator.',
        ],
        example: 'Landing cost $500 at 50% margin means a $1,000 sale price.',
        mistake: noTaxPromo
          ? "No-Tax Promo is ON: enter the customer's price including tax."
          : 'Prices should be entered before tax.',
        note: 'Below 47% margin -- stop and call a manager.',
      };
    }
    return {
      title: 'Quick Start (Margin)',
      steps: [
        'Enter the sale price.',
        'Enter the landing cost.',
        'Check the color indicator.',
      ],
      example: 'Landing cost $500 at 50% margin means a $1,000 sale price.',
      mistake: 'Prices should be entered before tax.',
      note: 'Below 47% margin -- stop and call a manager.',
    };
  })();

  return (
    <div className="app">
      <style>{`
        * { box-sizing: border-box; }
        :root {
          --font-body: "Sora", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          --font-display: "DM Serif Display", "Times New Roman", serif;
          --bg-deep: #0F1117;
          --bg: #161920;
          --surface: #1E2230;
          --surface-2: #262B3A;
          --glass: rgba(255,255,255,0.06);
          --line: rgba(255,255,255,0.08);
          --text: #F5F0EB;
          --muted: #8B91A0;
          --primary: #E23744;
          --primary-strong: #C92A36;
          --crimson: #E23744;
          --crimson-glow: rgba(226,55,68,0.15);
          --success: #34D399;
          --warning: #FBBF24;
          --danger: #F87171;
          --radius-lg: 20px;
          --radius-md: 12px;
          --radius-sm: 8px;
          --shadow-soft: 0 10px 30px rgba(0,0,0,0.3);
          --shadow-card: 0 4px 12px rgba(0,0,0,0.2);
          --shadow-glow: 0 0 20px rgba(226,55,68,0.3);
          --tap: 44px;
          --text-xs: 11px;
          --text-sm: 13px;
          --text-md: 15px;
          --text-lg: 20px;
          --text-xl: 32px;
        }

        body {
          font-family: var(--font-body);
        }

        .app {
          min-height: 100vh;
          background: var(--bg-deep);
          color: var(--text);
          padding: 16px;
          padding-bottom: calc(96px + env(safe-area-inset-bottom));
        }

        .container { max-width: 520px; margin: 0 auto; padding-bottom: 100px; }

        /* Sticky Header */
        .header {
          position: sticky;
          top: 8px;
          z-index: 40;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          padding: 12px 16px;
          margin: 0 0 12px 0;
          box-shadow: var(--shadow-card);
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
          font-size: 20px;
          color: var(--text);
          font-weight: 700;
          font-family: var(--font-display);
          letter-spacing: 0.3px;
        }
        .header p {
          margin: 2px 0 0;
          font-size: 11px;
          color: var(--muted);
        }
        .header-menu-btn,
        .header-reset-btn {
          background: var(--glass);
          border: 1px solid var(--line);
          width: var(--tap);
          height: var(--tap);
          border-radius: var(--radius-sm);
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text);
          transition: all 0.15s;
        }
        .header-menu-btn:hover,
        .header-reset-btn:hover {
          background: rgba(255,255,255,0.1);
          border-color: var(--crimson);
        }
        .header-menu {
          position: absolute;
          top: 100%;
          right: 16px;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-card);
          overflow: hidden;
          min-width: 160px;
          z-index: 50;
        }
        .header-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          font-size: var(--text-sm);
          color: var(--text);
          cursor: pointer;
          transition: background 0.15s;
        }
        .header-menu-item:hover {
          background: var(--glass);
        }
        .header-menu-item:not(:last-child) {
          border-bottom: 1px solid var(--line);
        }

        .mode-tabs {
          display: flex;
          background: var(--surface);
          border-radius: var(--radius-md);
          padding: 4px;
          margin-bottom: 12px;
          border: 1px solid var(--line);
        }
        .mode-tab {
          flex: 1;
          padding: 10px 8px;
          border: none;
          background: transparent;
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.15s;
          min-height: var(--tap);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mode-tab.active {
          background: var(--primary);
          color: white;
        }
        .mode-tab:not(.active):hover { 
          background: var(--glass);
          color: var(--text);
        }


        .card {
          background: var(--surface);
          border-radius: var(--radius-md);
          padding: 16px;
          margin-bottom: 12px;
          box-shadow: var(--shadow-card);
          border: 1px solid var(--line);
        }

        .card-title {
          font-size: var(--text-md);
          font-weight: 700;
          color: var(--text);
          font-family: var(--font-display);
          margin-bottom: 12px;
        }

        .pill-group {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .pill {
          padding: 12px 18px;
          border-radius: 24px;
          border: 2px solid var(--line);
          background: var(--surface);
          font-size: 15px;
          font-weight: 500;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.2s;
          min-height: var(--tap);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pill:hover { 
          border-color: var(--crimson);
          color: var(--text);
        }
        .pill.selected {
          background: var(--crimson);
          border-color: var(--crimson);
          color: white;
          box-shadow: 0 0 12px var(--crimson-glow);
        }
        .pill.small { padding: 10px 14px; font-size: 14px; min-height: 44px; }

        .toggle-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          min-height: var(--tap);
        }
        .toggle-label { font-size: 15px; color: var(--text); }
        .toggle-desc { font-size: 12px; color: var(--muted); margin-top: 2px; }

        .toggle {
          width: 56px;
          height: 32px;
          background: var(--surface-2);
          border: 1px solid var(--line);
          border-radius: 16px;
          position: relative;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .toggle.on { 
          background: var(--crimson);
          border-color: var(--crimson);
          box-shadow: 0 0 12px var(--crimson-glow);
        }
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
          padding: 12px 16px;
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          font-size: var(--text-md);
          background: var(--bg);
          color: var(--text);
          transition: all 0.15s;
          min-height: var(--tap);
        }
        .input:focus { 
          outline: none; 
          border-color: var(--crimson);
          box-shadow: 0 0 0 2px var(--crimson-glow);
        }
        .input::placeholder { color: var(--muted); }
        .input-error {
          border-color: var(--danger) !important;
          box-shadow: 0 0 0 2px rgba(248,113,113,0.15) !important;
        }
        .error-text {
          color: var(--danger);
          font-size: var(--text-xs);
          margin-top: 4px;
          margin-bottom: 4px;
          font-weight: 600;
        }

        .item-row {
          background: var(--surface-2);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 12px;
          border: 1px solid var(--line);
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
          color: var(--crimson);
        }
        .remove-btn {
          background: rgba(248,113,113,0.15);
          border: 1px solid rgba(248,113,113,0.3);
          color: var(--danger);
          font-size: 20px;
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 8px;
          min-width: 44px;
          min-height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .remove-btn:hover {
          background: rgba(248,113,113,0.25);
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
          color: var(--muted);
          margin-bottom: 4px;
          display: block;
        }
        
        .add-item-btn {
          width: 100%;
          padding: 10px;
          background: transparent;
          border: 1px dashed var(--line);
          border-radius: var(--radius-sm);
          color: var(--crimson);
          font-size: var(--text-sm);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          min-height: 40px;
        }
        .add-item-btn:hover {
          background: var(--glass);
          border-color: var(--crimson);
        }

        .sticky-bottom {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 12px 16px;
          background: linear-gradient(to top, var(--bg-deep) 70%, transparent);
          z-index: 50;
          padding-bottom: calc(12px + env(safe-area-inset-bottom));
        }
        .sticky-bottom .calc-btn {
          max-width: 500px;
          margin: 0 auto;
          display: block;
        }

        .calc-btn {
          width: 100%;
          padding: 18px;
          background: linear-gradient(135deg, var(--crimson) 0%, var(--primary-strong) 100%);
          border: none;
          border-radius: 14px;
          color: white;
          font-size: 17px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 8px 22px var(--crimson-glow), 0 4px 12px rgba(0,0,0,0.3);
          min-height: 56px;
          transition: all 0.2s;
        }
        .calc-btn:hover {
          box-shadow: 0 10px 28px var(--crimson-glow), 0 6px 16px rgba(0,0,0,0.4);
          transform: translateY(-2px);
        }
        .calc-btn:active { 
          transform: scale(0.98);
          box-shadow: 0 4px 12px var(--crimson-glow);
        }
        
        .result-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 17, 23, 0.8);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 0;
          z-index: 100;
          overflow-y: auto;
        }
        .result-card {
          background: var(--surface);
          border-radius: var(--radius-lg) var(--radius-lg) 0 0;
          padding: 0;
          width: 100%;
          max-width: 520px;
          margin: 0 auto;
          box-shadow: 0 -12px 30px rgba(0,0,0,0.4);
          border: 1px solid var(--line);
          overflow: hidden;
          animation: sheetUp 0.22s ease-out;
        }
        .sheet-handle {
          width: 40px;
          height: 4px;
          background: var(--line);
          border-radius: 999px;
          margin: 8px auto 6px;
        }
        .sheet-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px 0;
          border-bottom: 1px solid var(--line);
        }
        .sheet-title {
          font-size: var(--text-md);
          font-weight: 700;
          color: var(--text);
        }
        .sheet-close {
          background: var(--glass);
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          min-width: 36px;
          min-height: 36px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text);
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sheet-close:hover {
          background: var(--surface-2);
          border-color: var(--crimson);
        }
        .sheet-content {
          padding: 12px 16px 20px;
          max-height: 78vh;
          overflow: auto;
          overscroll-behavior: contain;
          padding-bottom: calc(20px + env(safe-area-inset-bottom));
          background: var(--surface);
        }

        .result-title {
          text-align: center;
          font-size: 18px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 16px;
        }
        
        .big-total {
          text-align: center;
          padding: 20px;
          background: linear-gradient(135deg, var(--crimson) 0%, var(--primary-strong) 100%);
          border-radius: var(--radius-md);
          margin-bottom: 12px;
        }
        .big-total-label {
          font-size: 13px;
          color: rgba(255,255,255,0.9);
          margin-bottom: 4px;
        }
        .big-total-amount {
          font-size: 36px;
          font-weight: 700;
          color: white;
        }
        .big-total-sub {
          font-size: 12px;
          color: rgba(255,255,255,0.8);
          margin-top: 4px;
        }
        
        .badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: var(--radius-lg);
          font-size: var(--text-xs);
          font-weight: 600;
          margin-top: 8px;
        }
        .badge.green { background: rgba(52,211,153,0.2); color: var(--success); border: 1px solid rgba(52,211,153,0.3); }
        .badge.orange { background: rgba(251,191,36,0.2); color: var(--warning); border: 1px solid rgba(251,191,36,0.3); }
        .badge.red { background: rgba(248,113,113,0.2); color: var(--danger); border: 1px solid rgba(248,113,113,0.3); }
        
        .section-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--crimson);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 16px 0 8px;
        }
        
        .breakdown-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          border-bottom: 1px solid var(--line);
        }
        .breakdown-row:last-child { border-bottom: none; }
        .breakdown-label { color: var(--muted); font-size: 13px; }
        .breakdown-value { font-weight: 600; color: var(--text); font-size: 13px; }
        
        .margin-item {
          background: var(--surface-2);
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          padding: 12px;
          margin-bottom: 10px;
        }
        .margin-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .margin-item-name { font-weight: 600; color: var(--text); font-size: 14px; }
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
          background: var(--bg);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 8px 4px;
          text-align: center;
          transition: all 0.15s;
          min-height: 48px;
          cursor: pointer;
        }
        .margin-price-box:hover {
          border-color: var(--crimson);
          background: var(--glass);
        }
        .margin-price-box.current {
          border-color: var(--crimson);
          background: var(--crimson);
        }
        .margin-price-box.current .margin-price-label,
        .margin-price-box.current .margin-price-value {
          color: white;
        }
        .margin-price-label { font-size: 10px; color: var(--muted); }
        .margin-price-value { font-size: 13px; font-weight: 600; margin-top: 2px; color: var(--text); }
        
        details.result-section {
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          padding: 10px 12px;
          margin: 12px 0;
          background: var(--surface-2);
        }
        details.result-section summary {
          list-style: none;
          cursor: pointer;
          font-size: var(--text-sm);
          font-weight: 700;
          color: var(--text);
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: var(--tap);
        }
        details.result-section summary::-webkit-details-marker { display: none; }
        .summary-chevron {
          font-size: 12px;
          color: var(--muted);
          transition: transform 0.15s;
        }
        details[open] .summary-chevron { transform: rotate(180deg); }

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
          transition: all 0.2s;
        }
        .result-btn.primary {
          background: var(--crimson);
          color: white;
          border: none;
          box-shadow: 0 4px 12px var(--crimson-glow);
        }
        .result-btn.primary:hover {
          box-shadow: 0 6px 16px var(--crimson-glow);
        }
        .result-btn.secondary {
          background: var(--surface);
          color: var(--crimson);
          border: 2px solid var(--crimson);
        }
        .result-btn.secondary:hover {
          background: var(--glass);
        }
        
        .help-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 17, 23, 0.8);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 20px;
          z-index: 200;
          overflow-y: auto;
        }
        .help-modal {
          background: var(--surface);
          border-radius: var(--radius-md);
          padding: 24px;
          width: 100%;
          max-width: 480px;
          margin: 20px 0;
          border: 1px solid var(--line);
          box-shadow: var(--shadow-card);
        }
        .help-modal h2 {
          margin: 0 0 16px;
          color: var(--text);
          font-size: var(--text-lg);
        }
        .help-section {
          margin-bottom: 20px;
        }
        .help-section h3 {
          font-size: var(--text-md);
          color: var(--primary);
          margin: 0 0 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .help-section p {
          font-size: 13px;
          color: var(--text);
          line-height: 1.5;
          margin: 0;
        }
        .help-section ul {
          margin: 8px 0 0;
          padding-left: 20px;
          font-size: 13px;
          color: var(--text);
          line-height: 1.6;
        }
        .faq-item {
          margin-top: 8px;
        }
        .faq-q {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
        }
        .faq-a {
          font-size: 12px;
          color: var(--muted);
          margin-top: 2px;
        }
        .glossary-item {
          font-size: 12px;
          color: var(--text);
          margin-top: 6px;
        }
        .help-close {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, var(--crimson) 0%, var(--primary-strong) 100%);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
          font-weight: 600;
          cursor: pointer;
          margin-top: 8px;
          box-shadow: 0 4px 12px var(--crimson-glow);
          transition: all 0.15s;
        }
        .help-close:hover {
          box-shadow: 0 6px 16px var(--crimson-glow);
        }
        
        .quick-ref {
          background: rgba(251,191,36,0.15);
          border: 1px solid rgba(251,191,36,0.3);
          border-radius: 8px;
          padding: 12px;
          margin-top: 12px;
        }
        .quick-ref-title { font-size: 12px; font-weight: 600; color: var(--warning); margin-bottom: 6px; }
        .quick-ref-item { font-size: 12px; color: var(--text); padding: 2px 0; }

        /* Wheel button */
        .wheel-btn {
          width: 48px;
          height: 48px;
          background: var(--surface);
          border: 2px solid var(--line);
          border-radius: 12px;
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: var(--text);
          transition: all 0.2s;
        }
        .wheel-btn:active {
          background: var(--glass);
          border-color: var(--crimson);
        }

        /* Scroll Wheel Picker Styles */
        .wheel-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 17, 23, 0.8);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 300;
        }
        .wheel-modal {
          background: var(--surface);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-radius: 20px 20px 0 0;
          padding: 20px;
          width: 100%;
          max-width: 500px;
          border: 1px solid var(--line);
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
          color: var(--text);
        }
        .wheel-cancel {
          background: none;
          border: none;
          font-size: 15px;
          color: var(--muted);
          cursor: pointer;
          padding: 8px;
          transition: color 0.2s;
        }
        .wheel-cancel:hover {
          color: var(--text);
        }
        .wheel-display {
          text-align: center;
          font-size: 36px;
          font-weight: 700;
          color: var(--crimson);
          padding: 12px;
          margin-bottom: 8px;
        }
        .wheel-columns {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 4px;
          padding: 16px 0;
          background: var(--bg);
          border-radius: 16px;
          margin-bottom: 16px;
          border: 1px solid var(--line);
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
          color: var(--crimson);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .wheel-arrow:active {
          background: var(--glass);
        }
        .wheel-value {
          font-size: 32px;
          font-weight: 700;
          color: var(--text);
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--surface);
          border-radius: 8px;
          width: 100%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          border: 1px solid var(--line);
        }
        .wheel-separator {
          font-size: 32px;
          font-weight: 700;
          color: var(--text);
          padding: 0 2px;
        }
        .wheel-label {
          font-size: 10px;
          color: var(--muted);
          margin-top: 4px;
          text-transform: uppercase;
        }
        .wheel-confirm {
          width: 100%;
          padding: 18px;
          background: linear-gradient(135deg, var(--crimson) 0%, var(--primary-strong) 100%);
          border: none;
          border-radius: 14px;
          color: white;
          font-size: 17px;
          font-weight: 700;
          cursor: pointer;
          min-height: 56px;
          box-shadow: 0 8px 22px var(--crimson-glow), 0 4px 12px rgba(0,0,0,0.3);
          transition: all 0.2s;
        }
        .wheel-confirm:hover {
          box-shadow: 0 10px 28px var(--crimson-glow), 0 6px 16px rgba(0,0,0,0.4);
        }

        /* Helper/Tutorial Overlay */
        .helper-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 17, 23, 0.85);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 400;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 16px;
        }
        .helper-spotlight {
          position: absolute;
          border-radius: 16px;
          box-shadow: 0 0 0 9999px rgba(15, 17, 23, 0.85);
          pointer-events: none;
        }
        .helper-card {
          background: var(--surface);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-radius: 16px;
          padding: 20px;
          max-width: 500px;
          margin: 0 auto;
          width: 100%;
          border: 1px solid var(--line);
          box-shadow: var(--shadow-card);
          animation: slideUp 0.2s ease-out;
        }
        .helper-step-badge {
          display: inline-block;
          background: var(--crimson);
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
          color: var(--text);
          margin-bottom: 8px;
        }
        .helper-desc {
          font-size: 14px;
          color: var(--muted);
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
          transition: all 0.2s;
        }
        .helper-btn.primary {
          background: linear-gradient(135deg, var(--crimson) 0%, var(--primary-strong) 100%);
          color: white;
          border: none;
          box-shadow: 0 4px 12px var(--crimson-glow);
        }
        .helper-btn.primary:hover {
          box-shadow: 0 6px 16px var(--crimson-glow);
        }
        .helper-btn.secondary {
          background: var(--surface-2);
          color: var(--muted);
          border: 1px solid var(--line);
        }
        .helper-btn.secondary:hover {
          background: var(--glass);
          color: var(--text);
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
          background: var(--surface-2);
        }
        .helper-dot.active {
          background: var(--crimson);
          width: 24px;
          border-radius: 4px;
        }
        .helper-dot.completed {
          background: var(--crimson);
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

        /* Settings chip bar */
        .settings-bar {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
          align-items: center;
        }
        .setting-chip {
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          background: var(--surface);
          border: 1px solid var(--line);
          color: var(--muted);
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          font-family: var(--font-body);
        }
        .setting-chip:hover {
          background: var(--glass);
          border-color: var(--primary);
          color: var(--text);
        }
        .setting-chip.active {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }
        .setting-chip.gear {
          padding: 6px 10px;
          font-size: 14px;
        }

        /* Settings modal (full settings panel) */
        .settings-modal-content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .settings-modal-content .setting-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .settings-modal-content .setting-group.full-width {
          grid-column: 1 / -1;
        }
        .settings-modal-content .setting-group label {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text);
        }

        /* Compact pills for settings */
        .pill-group-compact {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .pill-compact {
          padding: 8px 12px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--line);
          background: var(--surface);
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.15s;
          min-height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pill-compact:hover { 
          border-color: var(--crimson);
          color: var(--text);
        }
        .pill-compact.selected {
          background: var(--primary);
          border-color: var(--primary);
          color: white;
        }

        /* Flat item card (2-row layout) */
        .item-card-compact {
          background: var(--surface-2);
          border: 1px solid var(--line);
          border-left: 3px solid var(--primary);
          border-radius: var(--radius-sm);
          padding: 8px;
          margin-bottom: 8px;
          transition: box-shadow 0.15s;
        }
        .item-card-compact:focus-within {
          box-shadow: 0 0 0 2px var(--crimson-glow);
        }
        .item-row-top {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-bottom: 8px;
        }
        .item-row-bottom {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .input-qty-compact {
          width: 44px;
          padding: 6px 4px;
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
          text-align: center;
          background: var(--bg);
          color: var(--text);
          min-height: 36px;
        }
        .input-qty-compact:focus {
          outline: none;
          border-color: var(--crimson);
          box-shadow: 0 0 0 2px var(--crimson-glow);
        }
        .item-remove-btn {
          background: none;
          border: none;
          color: var(--muted);
          font-size: 16px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: var(--radius-sm);
          transition: all 0.15s;
          flex-shrink: 0;
          line-height: 1;
        }
        .item-remove-btn:hover {
          color: var(--danger);
          background: rgba(248,113,113,0.12);
        }
        .input-compact {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
          min-height: 36px;
          background: var(--bg);
          color: var(--text);
          min-width: 0;
        }
        .input-compact:focus {
          outline: none;
          border-color: var(--crimson);
          box-shadow: 0 0 0 2px var(--crimson-glow);
        }
        .input-compact::placeholder { color: var(--muted); }
        .money-wrap {
          position: relative;
          display: flex;
          flex: 1;
          min-width: 0;
        }
        .money-wrap .input-compact {
          padding-left: 22px;
        }
        .money-wrap::before {
          content: '$';
          position: absolute;
          left: 8px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted);
          font-size: var(--text-sm);
          pointer-events: none;
          z-index: 1;
        }
        .money-wrap-lg {
          position: relative;
        }
        .money-wrap-lg .input {
          padding-left: 28px;
        }
        .money-wrap-lg::before {
          content: '$';
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted);
          font-size: 20px;
          font-weight: 600;
          pointer-events: none;
          z-index: 1;
        }
        .item-estimate-btn {
          background: var(--glass);
          border: 1px solid var(--line);
          color: var(--primary);
          font-size: var(--text-xs);
          font-weight: 700;
          cursor: pointer;
          padding: 6px 8px;
          border-radius: var(--radius-sm);
          transition: all 0.15s;
          flex-shrink: 0;
          line-height: 1;
        }
        .item-estimate-btn:hover {
          background: rgba(226,55,68,0.1);
          border-color: var(--primary);
        }

        /* Toggle compact */
        .toggle-compact {
          width: 44px;
          height: 24px;
          background: var(--surface-2);
          border: 1px solid var(--line);
          border-radius: 12px;
          position: relative;
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .toggle-compact.on { 
          background: var(--primary);
          border-color: var(--primary);
        }
        .toggle-compact::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          transition: transform 0.15s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .toggle-compact.on::after { transform: translateX(20px); }

        /* Micro-interactions */
        .pill, .mode-tab, .card, .pill-compact, .setting-chip {
          transition: all 0.15s ease;
        }
        .pill:hover, .mode-tab:hover, .setting-chip:hover {
          transform: translateY(-1px);
        }
        .pill:active, .pill-compact:active, .mode-tab:active, .setting-chip:active {
          transform: translateY(0);
        }

        /* Enhanced calculate button */
        .calc-btn-enhanced {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, var(--crimson) 0%, var(--primary-strong) 100%);
          border: none;
          border-radius: var(--radius-md);
          color: white;
          font-size: var(--text-md);
          font-weight: 700;
          cursor: pointer;
          font-family: var(--font-body);
          box-shadow: 0 4px 14px var(--crimson-glow), 0 2px 8px rgba(0,0,0,0.3);
          min-height: 48px;
          transition: all 0.15s;
        }
        .calc-btn-enhanced:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px var(--crimson-glow), 0 4px 12px rgba(0,0,0,0.4);
        }
        .calc-btn-enhanced:active {
          transform: translateY(0);
          box-shadow: 0 2px 8px var(--crimson-glow);
        }
        .calc-btn-enhanced:disabled {
          background: var(--surface-2);
          color: var(--muted);
          box-shadow: none;
          cursor: not-allowed;
        }
        .calc-btn-pulse {
          animation: btnPulse 0.3s ease-out;
        }
        @keyframes btnPulse {
          0% { transform: scale(1); }
          40% { transform: scale(0.95); box-shadow: 0 2px 8px var(--crimson-glow); }
          100% { transform: scale(1); box-shadow: 0 4px 14px var(--crimson-glow), 0 2px 8px rgba(0,0,0,0.3); }
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

        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }

      `}</style>

      <div className="container">
        {/* Redesigned Header */}
        <div className="header">
          <button
            className="header-reset-btn"
            onClick={startOver}
            aria-label="Start Over"
          >
            ↺
          </button>
          <div className="header-content">
            <h1>Deal Depth</h1>
            <p>Ashley HomeStore • Gilroy</p>
          </div>
          <button
            className="header-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            ⋮
          </button>
          {menuOpen && (
            <div className="header-menu" ref={menuRef}>
              <button
                className="header-menu-item"
                onClick={() => { setShowHistory(true); setMenuOpen(false); }}
              >
                History {history.length > 0 && `(${history.length})`}
              </button>
              <button
                className="header-menu-item"
                onClick={() => { setShowHelp(true); setMenuOpen(false); }}
              >
                Help
              </button>
            </div>
          )}
        </div>

        {/* Mode Tabs */}
        <div className="mode-tabs">
          <button className={`mode-tab ${mode === 'quote' ? 'active' : ''}`} onClick={() => setMode('quote')}>Quote</button>
          <button className={`mode-tab ${mode === 'margin' ? 'active' : ''}`} onClick={() => setMode('margin')}>Margin</button>
        </div>

        {/* Settings Chip Bar */}
        <div className="settings-bar">
          <button className="setting-chip" onClick={cycleNextSalePercent}>Sale {salePercent}%</button>
          <button
            className={`setting-chip ${priceType === 'tag' ? 'active' : ''}`}
            aria-pressed={priceType === 'tag'}
            onClick={() => setPriceType(priceType === 'sale' ? 'tag' : 'sale')}
          >
            {priceType === 'tag' ? 'Retail' : 'Sale'} Price
          </button>
          <button
            className={`setting-chip ${noTaxPromo ? 'active' : ''}`}
            aria-pressed={noTaxPromo}
            onClick={() => setNoTaxPromo(!noTaxPromo)}
          >
            No-Tax
          </button>
          <button className="setting-chip" onClick={cycleNextDelivery}>
            Del ${delivery}
          </button>
          <button
            className={`setting-chip ${includeProtection ? 'active' : ''}`}
            aria-pressed={includeProtection}
            onClick={() => setIncludeProtection(!includeProtection)}
          >
            Protection {includeProtection ? 'ON' : 'OFF'}
          </button>
          <button className="setting-chip gear" onClick={() => setShowSettingsModal(true)}>⚙</button>
        </div>

        {/* Settings Modal */}
        {showSettingsModal && (
          <div className="help-overlay" onClick={() => setShowSettingsModal(false)}>
            <div className="help-modal" onClick={e => e.stopPropagation()}>
              <h2>Deal Settings</h2>
              <div className="settings-modal-content">
                <div className="setting-group">
                  <label>Sale %</label>
                  <div className="pill-group-compact">
                    {salePercentOptions.map(pct => (
                      <div key={pct} className={`pill-compact ${salePercent === pct ? 'selected' : ''}`} onClick={() => setSalePercent(pct)}>{pct}%</div>
                    ))}
                  </div>
                </div>
                <div className="setting-group">
                  <label>Price Type</label>
                  <div className="pill-group-compact">
                    <div className={`pill-compact ${priceType === 'sale' ? 'selected' : ''}`} onClick={() => setPriceType('sale')}>Sale</div>
                    <div className={`pill-compact ${priceType === 'tag' ? 'selected' : ''}`} onClick={() => setPriceType('tag')}>Retail</div>
                  </div>
                </div>
                <div className="setting-group">
                  <label>No-Tax Promo</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={`toggle-compact ${noTaxPromo ? 'on' : ''}`} role="switch" aria-checked={noTaxPromo} aria-label="No-Tax Promo" tabIndex={0} onClick={() => setNoTaxPromo(!noTaxPromo)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNoTaxPromo(!noTaxPromo); }}} />
                    <span style={{ fontSize: 11, color: noTaxPromo ? colors.success.main : colors.text.secondary }}>{noTaxPromo ? 'ON' : 'OFF'}</span>
                  </div>
                </div>
                <div className="setting-group">
                  <label>Delivery</label>
                  <div className="pill-group-compact">
                    {deliveryOptions.map(amt => (
                      <div key={amt} className={`pill-compact ${delivery === amt && !showCustomDelivery ? 'selected' : ''}`} onClick={() => { setDelivery(amt); setShowCustomDelivery(false); }}>${amt}</div>
                    ))}
                    <div className={`pill-compact ${showCustomDelivery ? 'selected' : ''}`} onClick={() => setShowCustomDelivery(true)}>Custom</div>
                  </div>
                  {showCustomDelivery && (
                    <input
                      type="text"
                      className="input-compact"
                      placeholder="Enter amount"
                      value={delivery}
                      onChange={(e) => setDelivery(e.target.value)}
                      inputMode="decimal"
                      style={{ marginTop: 6 }}
                      autoFocus
                    />
                  )}
                </div>
                <div className="setting-group full-width">
                  <label>Protection Plan</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={`toggle-compact ${includeProtection ? 'on' : ''}`} role="switch" aria-checked={includeProtection} aria-label="Protection Plan" tabIndex={0} onClick={() => setIncludeProtection(!includeProtection)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIncludeProtection(!includeProtection); }}} />
                    <span style={{ fontSize: 11, color: includeProtection ? colors.success.main : colors.text.secondary }}>
                      {includeProtection ? `ON — ${formatMoney(calculateProtectionPlan(subtotal || 0))} added` : 'OFF'}
                    </span>
                  </div>
                  {includeProtection && (
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                      $150 (0–1k) · $200 (1–2k) · $250 (2–3k) · $300 (3–4k) · $350 (4–5k) · $500 (5–6k) · +$50/1k after
                    </div>
                  )}
                </div>
              </div>
              <button className="help-close" onClick={() => setShowSettingsModal(false)}>Done</button>
            </div>
          </div>
        )}


        {/* Items */}
        <div className="card" style={{ padding: 8 }}>
          {errors.price && <div className="error-text" style={{ paddingLeft: 4 }}>{errors.price}</div>}
          {errors.landingCost && <div className="error-text" style={{ paddingLeft: 4 }}>{errors.landingCost}</div>}

          {items.map((item) => (
            <div key={item.id} className="item-card-compact" data-item>
              {/* Row 1: Type pills + Price + Qty */}
              <div className="item-row-top">
                {showCustomInput[item.id] ? (
                  <input
                    type="text"
                    className="input-compact"
                    placeholder="Item name..."
                    value={item.name}
                    onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                ) : expandedItemPresets[item.id] ? (
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: expandedMore[item.id] ? 6 : 0 }}>
                      {TOP_ITEM_PRESETS.map(p => (
                        <button key={p} className={`pill-compact${item.name === p ? ' selected' : ''}`} onClick={() => { updateItem(item.id, 'name', p); setExpandedItemPresets({ ...expandedItemPresets, [item.id]: false }); }} style={{ fontSize: 11 }}>{p}</button>
                      ))}
                      <button className={`pill-compact${expandedMore[item.id] ? ' selected' : ''}`} onClick={() => setExpandedMore({ ...expandedMore, [item.id]: !expandedMore[item.id] })} style={{ fontSize: 11 }}>{expandedMore[item.id] ? 'Less' : 'More'}</button>
                      <button className="pill-compact" onClick={() => { setShowCustomInput({ ...showCustomInput, [item.id]: true }); setExpandedItemPresets({ ...expandedItemPresets, [item.id]: false }); }} style={{ fontSize: 11 }}>Custom</button>
                    </div>
                    {expandedMore[item.id] && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {MORE_ITEM_PRESETS.map(p => (
                          <button key={p} className={`pill-compact${item.name === p ? ' selected' : ''}`} onClick={() => { updateItem(item.id, 'name', p); setExpandedMore({ ...expandedMore, [item.id]: false }); setExpandedItemPresets({ ...expandedItemPresets, [item.id]: false }); }} style={{ fontSize: 11 }}>{p}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    className="pill-compact"
                    onClick={() => setExpandedItemPresets({ ...expandedItemPresets, [item.id]: true })}
                    style={{ fontSize: 12, flex: 1, justifyContent: 'flex-start', gap: 6 }}
                  >
                    {item.name || 'Select type...'}
                  </button>
                )}
                <div className="money-wrap" style={{ width: 90, flex: 'none' }}>
                  <input
                    type="text"
                    className={`input-compact ${errors.price ? 'input-error' : ''}`}
                    placeholder={noTaxPromo ? 'Price+tax' : 'Price'}
                    value={item.price}
                    onChange={(e) => updateItemPrice(item.id, e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>Qty</span>
                  <input
                    type="number"
                    className="input-qty-compact"
                    value={item.qty}
                    onChange={(e) => updateItem(item.id, 'qty', e.target.value)}
                    min="1"
                    placeholder="1"
                    title="Quantity"
                  />
                </div>
              </div>
              {/* Row 2: Landing + Estimate + Remove + Back */}
              <div className="item-row-bottom">
                {mode !== 'quote' && (
                  <>
                    <div className="money-wrap">
                      <input
                        type="text"
                        className={`input-compact ${errors.landingCost ? 'input-error' : ''}`}
                        placeholder="Landing"
                        value={item.landingCost}
                        onChange={(e) => updateItem(item.id, 'landingCost', e.target.value)}
                        inputMode="decimal"
                      />
                    </div>
                    <button className="item-estimate-btn" onClick={() => estimateLandingCost(item.id)} title="Estimate landing cost (price ÷ 3.3)">Est.</button>
                  </>
                )}
                {items.length > 1 && (
                  <button className="item-remove-btn" onClick={() => removeItem(item.id)} title="Remove item">×</button>
                )}
                {showCustomInput[item.id] && (
                  <button className="item-remove-btn" onClick={() => { setShowCustomInput({ ...showCustomInput, [item.id]: false }); if (!item.name) updateItem(item.id, 'name', ''); }} title="Back to presets" style={{ fontSize: 12 }}>↩</button>
                )}
              </div>
            </div>
          ))}
          
          <button className="add-item-btn" onClick={addItem}>+ Add Item</button>
        </div>

      </div>

      {/* Sticky Calculate Button */}
      <div className="sticky-bottom">
        <button
          className={`calc-btn-enhanced${calcPulse ? ' calc-btn-pulse' : ''}`}
          onClick={() => {
            setCalcPulse(true);
            setTimeout(() => setCalcPulse(false), 300);
            calculate();
          }}
        >
          {mode === 'quote' ? 'Calculate Quote' : 'Check Margin'}
        </button>
      </div>

      {/* Results Modal */}
      {showResults && (
        <div className="result-overlay" onClick={resetForm}>
          <div className="result-card" onClick={e => e.stopPropagation()}>
            <div className="sheet-header">
              <div className="sheet-title">
                {mode === 'quote' ? 'Your Quote' : 'Margin Analysis'}
              </div>
              <button className="sheet-close" onClick={resetForm}>Close</button>
            </div>
            <div className="sheet-content">

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

                    <div style={{ background: colors.success.light, borderRadius: '8px', padding: '12px', marginBottom: '12px', border: `1px solid ${colors.success.main}40` }}>
                      <div style={{ fontSize: '12px', color: colors.success.main, fontWeight: 600, marginBottom: '4px' }}>Tell Customer:</div>
                      <div style={{ fontSize: '15px', color: colors.text.primary, fontWeight: 600 }}>
                        "Your total is {formatMoney(customerTotal)} — that includes everything!"
                      </div>
                    </div>

                    <details className="result-section">
                      <summary>
                        Invoice Details
                        <span className="summary-chevron">▼</span>
                      </summary>
                      <div style={{ background: colors.warning.light, borderRadius: '8px', padding: '12px', marginTop: '8px', border: `1px solid ${colors.warning.main}40` }}>
                        {calculatedItems.map((item, i) => (
                          <div key={item.id} className="breakdown-row" style={{ padding: '3px 0' }}>
                            <span style={{ fontSize: '13px', color: colors.text.primary }}>{item.name || `Item ${i + 1}`} × {item.qty}</span>
                            <span style={{ fontWeight: 600, color: colors.text.primary }}>{formatMoney(item.lineTotal)}</span>
                          </div>
                        ))}
                        {deliveryAmount > 0 && (
                          <div className="breakdown-row" style={{ padding: '3px 0' }}>
                            <span style={{ fontSize: '13px', color: colors.text.primary }}>Delivery</span>
                            <span style={{ fontWeight: 600, color: colors.text.primary }}>{formatMoney(deliveryAmount)}</span>
                          </div>
                        )}
                        {protectionPlanCost > 0 && (
                          <div className="breakdown-row" style={{ padding: '3px 0' }}>
                            <span style={{ fontSize: '13px', color: colors.text.primary }}>Protection Plan</span>
                            <span style={{ fontWeight: 600, color: colors.text.primary }}>{formatMoney(protectionPlanCost)}</span>
                          </div>
                        )}
                        <div style={{ fontSize: '11px', color: colors.text.secondary, marginTop: '8px', fontStyle: 'italic' }}>
                          Tax auto-calculates to {formatMoney(totalTax)} → Total = {formatMoney(customerTotal)} ✓
                        </div>
                      </div>
                    </details>
                  </>
                ) : (
                  /* No-Tax Promo OFF - Show price + tax separately */
                  <>
                    <div className="big-total">
                      <div className="big-total-label">Price Before Tax</div>
                      <div className="big-total-amount">{formatMoney(subtotal + deliveryAmount)}</div>
                      <div className="big-total-sub">+ {formatMoney(totalTax)} tax at register</div>
                    </div>

                    <details className="result-section">
                      <summary>
                        Breakdown
                        <span className="summary-chevron">▼</span>
                      </summary>
                      <div style={{ marginTop: '8px' }}>
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
                        <div className="breakdown-row" style={{ background: colors.primary[50], margin: '0 -20px', padding: '8px 20px' }}>
                          <span className="breakdown-label" style={{ fontWeight: 600 }}>Subtotal</span>
                          <span className="breakdown-value">{formatMoney(subtotal + deliveryAmount)}</span>
                        </div>
                        <div className="breakdown-row">
                          <span className="breakdown-label">+ Tax (9.125%)</span>
                          <span className="breakdown-value">{formatMoney(totalTax)}</span>
                        </div>
                        {protectionPlanCost > 0 && (
                          <div className="breakdown-row">
                            <span className="breakdown-label">Protection Plan</span>
                            <span className="breakdown-value">{formatMoney(protectionPlanCost)}</span>
                          </div>
                        )}
                        <div className="breakdown-row" style={{ background: colors.primary[50], margin: '0 -20px', padding: '10px 20px' }}>
                          <span className="breakdown-label" style={{ fontWeight: 600 }}>Customer Pays</span>
                          <span className="breakdown-value" style={{ fontSize: '18px' }}>{formatMoney(customerTotal)}</span>
                        </div>
                      </div>
                    </details>
                    
                    <div style={{ background: colors.success.light, borderRadius: '8px', padding: '12px', marginTop: '12px', border: `1px solid ${colors.success.main}40` }}>
                      <div style={{ fontSize: '12px', color: colors.success.main, fontWeight: 600, marginBottom: '4px' }}>Tell Customer:</div>
                      <div style={{ fontSize: '13px', color: colors.text.secondary }}>
                        "{formatMoney(subtotal + deliveryAmount)} plus tax"
                      </div>
                    </div>
                  </>
                )}

                {/* Copy-Paste Text Block */}
                <CopyBlock
                  title="Copy for Text/Notes"
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
                {overallMargin !== null ? (
                  <div className="big-total">
                    <div className="big-total-label">Overall Margin</div>
                    <div className="big-total-amount">{overallMargin.toFixed(1)}%</div>
                    <div className={`badge ${overallMargin >= 50 ? 'green' : overallMargin >= 47 ? 'orange' : 'red'}`}>
                      {getMarginLabel(overallMargin)}
                    </div>
                    {subtotal > 0 && (
                      <div className="big-total-sub">
                        {noTaxPromo ? 'Quote: ' + formatMoney(calculatedItems.reduce((sum, item) => sum + (item.quotePrice * item.qty), 0)) : 'Invoice: ' + formatMoney(subtotal)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="big-total">
                    <div className="big-total-label">Margin Check</div>
                    <div className="big-total-amount" style={{ fontSize: '20px', color: 'rgba(255,255,255,0.6)' }}>Enter landing cost</div>
                    <div className="big-total-sub">Add landing cost to see margin</div>
                  </div>
                )}

                {/* Set entire order to a margin target */}
                {totalLandingCost > 0 && (
                  <div style={{ background: colors.primary[50], border: `1px solid ${colors.primary[200]}`, borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: colors.primary[400], marginBottom: '8px' }}>Set Entire Order to Margin</div>
                    <div className="margin-prices">
                      {[50, 49, 48, 47].map(target => (
                        <div
                          key={target}
                          className={`margin-price-box ${items.every(i => !parseMoney(i.landingCost) || i.selectedMargin === target) && items.some(i => i.selectedMargin === target) ? 'current' : ''}`}
                          onClick={() => setAllItemsToMargin(target)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="margin-price-label">{target}%</div>
                          <div className="margin-price-value">{formatMoney(noTaxPromo ? priceForMargin(totalLandingCost, target) * (1 + taxRate) : priceForMargin(totalLandingCost, target))}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: '11px', color: colors.text.secondary, marginTop: '6px', textAlign: 'center' }}>
                      {noTaxPromo ? 'Prices shown include tax' : 'Invoice prices shown'}
                    </div>
                  </div>
                )}

                {overallMargin !== null && overallMargin < 47 && totalLandingCost > 0 && (
                  <div style={{ background: colors.error.light, border: `1px solid ${colors.error.main}50`, borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: colors.error.main, marginBottom: '6px' }}>Counter needed — below 47% floor</div>
                    <div style={{ fontSize: '13px', color: colors.text.primary }}>
                      Min invoice: <strong>{formatMoney(priceForMargin(totalLandingCost, 47))}</strong> for 47%
                    </div>
                    <div style={{ fontSize: '13px', color: colors.text.primary, marginTop: '2px' }}>
                      Target invoice: <strong>{formatMoney(priceForMargin(totalLandingCost, 50))}</strong> for 50%
                    </div>
                    {noTaxPromo && (
                      <div style={{ fontSize: '11px', color: colors.text.secondary, marginTop: '4px' }}>
                        Customer quote: <strong>{formatMoney(priceForMargin(totalLandingCost, 47) * (1 + taxRate))}</strong> min • <strong>{formatMoney(priceForMargin(totalLandingCost, 50) * (1 + taxRate))}</strong> target
                      </div>
                    )}
                  </div>
                )}

                <details className="result-section" open>
                  <summary>
                    Margin by Item
                    <span className="summary-chevron">▼</span>
                  </summary>
                  <div style={{ marginTop: '8px' }}>
                {calculatedItems.filter(item => item.landingProvided).map((item, i) => (
                      <div key={item.id} className="margin-item">
                        <div className="margin-item-header">
                          <span className="margin-item-name">{item.name || `Item ${i + 1}`}</span>
                          {item.margin !== null && (
                            <span 
                              className="margin-badge"
                              style={{ 
                                background: item.margin >= 50 ? colors.success.light : item.margin >= 47 ? colors.warning.light : colors.error.light,
                                color: getMarginColor(item.margin),
                                border: `1px solid ${getMarginColor(item.margin)}50`
                              }}
                            >
                              {item.margin.toFixed(1)}% margin
                            </span>
                          )}
                        </div>
                        {item.invoicePrice > 0 ? (
                          <div style={{ fontSize: '12px', color: colors.text.secondary, lineHeight: 1.6 }}>
                            {noTaxPromo ? (
                              <>
                                Quote: {formatMoney(item.quotePrice)} • Invoice: {formatMoney(item.invoicePrice)}
                                {item.qty > 1 && <span style={{ color: colors.text.secondary }}> (per unit × {item.qty})</span>}
                              </>
                            ) : (
                              <>
                                Sale: {formatMoney(item.invoicePrice)} (+ tax at register)
                                {item.qty > 1 && <span style={{ color: colors.text.secondary }}> per unit × {item.qty}</span>}
                              </>
                            )}
                            <br/>
                            Landing: {formatMoney(item.landingCost)}/unit
                            {item.qty > 1 && <span> • Line total: {formatMoney(item.lineTotal)}</span>}
                          </div>
                        ) : (
                          <div style={{ fontSize: '12px', color: colors.text.secondary, lineHeight: 1.6 }}>
                            Landing: {formatMoney(item.landingCost)} • <em>Tap a margin target below</em>
                          </div>
                        )}
                        <div style={{ fontSize: '11px', color: colors.primary[400], marginTop: '8px', marginBottom: '4px', fontWeight: 600 }}>
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
                          <div style={{ fontSize: '11px', color: colors.text.secondary, marginTop: '8px', background: colors.warning.light, border: `1px solid ${colors.warning.main}40`, padding: '8px', borderRadius: '6px' }}>
                            📝 <strong>Invoice:</strong> Write {formatMoney(item.invoicePrice)} for {item.margin.toFixed(0)}% margin → customer pays {formatMoney(item.quotePrice)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>

                {/* Summary Table */}
                <details className="result-section">
                  <summary>
                    Deal at a Glance
                    <span className="summary-chevron">▼</span>
                  </summary>
                  <div style={{ overflowX: 'auto', margin: '8px -8px 0' }}>
                    <table style={{ 
                      width: '100%', 
                      borderCollapse: 'collapse', 
                      fontSize: '12px',
                      background: colors.primary[50],
                      borderRadius: '8px',
                      overflow: 'hidden',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }}>
                      <thead>
                        <tr style={{ background: colors.primary[50] }}>
                          <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 600, color: colors.text.primary, borderBottom: `2px solid ${colors.primary[200]}` }}>Item</th>
                          <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: colors.text.primary, borderBottom: `2px solid ${colors.primary[200]}` }}>Landing</th>
                          <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: colors.text.primary, borderBottom: `2px solid ${colors.primary[200]}` }}>Invoice</th>
                          {noTaxPromo && <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: colors.text.primary, borderBottom: `2px solid ${colors.primary[200]}` }}>Quote</th>}
                          <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: colors.text.primary, borderBottom: `2px solid ${colors.primary[200]}` }}>Profit</th>
                          <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: colors.text.primary, borderBottom: `2px solid ${colors.primary[200]}` }}>Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                      {calculatedItems.filter(item => item.landingProvided).map((item, i) => (
                          <tr key={item.id} style={{ borderBottom: `1px solid ${colors.primary[100]}` }}>
                            <td style={{ padding: '8px 6px', color: colors.text.primary }}>{item.name || `Item ${i + 1}`}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', color: colors.text.secondary }}>{formatMoney(item.landingCost)}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', color: colors.text.primary, fontWeight: 500 }}>{item.invoicePrice > 0 ? formatMoney(item.invoicePrice) : '—'}</td>
                            {noTaxPromo && <td style={{ padding: '8px 6px', textAlign: 'right', color: colors.info.main, fontWeight: 500 }}>{item.quotePrice > 0 ? formatMoney(item.quotePrice) : '—'}</td>}
                            <td style={{ padding: '8px 6px', textAlign: 'right', color: colors.success.main, fontWeight: 500 }}>{item.profitPerUnit !== null ? formatMoney(item.profitPerUnit) : '—'}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: getMarginColor(item.margin || 0) }}>
                              {item.margin !== null ? `${item.margin.toFixed(0)}%` : '—'}
                            </td>
                          </tr>
                        ))}
                        {/* Totals row */}
                        <tr style={{ background: colors.primary[50], fontWeight: 600 }}>
                          <td style={{ padding: '10px 6px', color: colors.text.primary }}>TOTAL</td>
                          <td style={{ padding: '10px 6px', textAlign: 'right', color: colors.text.secondary }}>{formatMoney(totalLandingCost)}</td>
                          <td style={{ padding: '10px 6px', textAlign: 'right', color: colors.text.primary }}>{subtotal > 0 ? formatMoney(subtotal) : '—'}</td>
                          {noTaxPromo && <td style={{ padding: '10px 6px', textAlign: 'right', color: colors.info.main }}>{subtotal > 0 ? formatMoney(calculatedItems.reduce((sum, item) => sum + (item.quotePrice * item.qty), 0)) : '—'}</td>}
                          <td style={{ padding: '10px 6px', textAlign: 'right', color: colors.success.main }}>{totalProfit > 0 ? formatMoney(totalProfit) : '—'}</td>
                          <td style={{ padding: '10px 6px', textAlign: 'right', color: getMarginColor(overallMargin || 0) }}>
                            {overallMargin !== null ? `${overallMargin.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>

                <details className="result-section">
                  <summary>
                    Deal Summary
                    <span className="summary-chevron">▼</span>
                  </summary>
                  <div style={{ marginTop: '8px' }}>
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
                    {protectionPlanCost > 0 && (
                      <div className="breakdown-row">
                        <span className="breakdown-label">Protection Plan</span>
                        <span className="breakdown-value">{formatMoney(protectionPlanCost)}</span>
                      </div>
                    )}
                  </div>
                </details>
                {noTaxPromo && subtotal > 0 && (
                  <div style={{ background: colors.success.light, borderRadius: '8px', padding: '12px', marginTop: '12px', border: `1px solid ${colors.success.main}40` }}>
                    <div style={{ fontSize: '12px', color: colors.success.main, fontWeight: 600, marginBottom: '4px' }}>Quote to Customer:</div>
                    <div style={{ fontSize: '15px', color: colors.text.primary, fontWeight: 600 }}>
                      {formatMoney(calculatedItems.reduce((sum, item) => sum + (item.quotePrice * item.qty), 0) + deliveryAmount + deliveryTax)} total
                    </div>
                  </div>
                )}

                {/* Copy for Manager */}
                <CopyBlock
                  title="Copy for Manager"
                  content={`MARGIN CHECK\n${calculatedItems.filter(i => i.landingProvided).map((item, i) => `${item.name || `Item ${i+1}`}: Landing ${formatMoney(item.landingCost)} -> Invoice ${item.invoicePrice > 0 ? formatMoney(item.invoicePrice) : '--'} = ${item.margin !== null ? item.margin.toFixed(0) + '%' : '--'}`).join('\n')}\n\nLanding Total: ${formatMoney(totalLandingCost)}\nInvoice Total: ${subtotal > 0 ? formatMoney(subtotal) : '--'}\nProfit: ${totalProfit > 0 ? formatMoney(totalProfit) : '--'}\nMARGIN: ${overallMargin !== null ? overallMargin.toFixed(1) + '%' : '--'}`}
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
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-modal" onClick={e => e.stopPropagation()}>
            <h2>Help</h2>

            {/* Quick Start — mode-specific tips at the top */}
            <div style={{ background: 'rgba(226,55,68,0.08)', border: '1px solid rgba(226,55,68,0.2)', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: '16px' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--primary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Quick Start — {mode === 'quote' ? 'Quote' : 'Margin'} Mode
              </div>
              {currentGuide.steps.map((step, i) => (
                <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--text)', padding: '2px 0' }}>{i + 1}. {step}</div>
              ))}
              {currentGuide.example && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 6 }}>Example: {currentGuide.example}</div>
              )}
              {currentGuide.mistake && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--primary)', marginTop: 4, fontWeight: 600 }}>Watch out: {currentGuide.mistake}</div>
              )}
              {currentGuide.note && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', marginTop: 4, fontWeight: 700 }}>{currentGuide.note}</div>
              )}
            </div>

            <div className="help-section">
              <h3>Quote (Fast Total)</h3>
              <ul>
                <li>Enter tag or sale prices</li>
                <li>Pick delivery</li>
                <li>Tap Calculate</li>
              </ul>
              <p style={{ marginTop: '6px' }}><strong>Example:</strong> $1000 tag + $135 delivery = total shown</p>
            </div>

            <div className="help-section">
              <h3>Margin (Profit Check)</h3>
              <ul>
                <li>Enter sale price</li>
                <li>Enter landing cost</li>
                <li>Green = ok. Orange = maybe. Red = no.</li>
              </ul>
              <p style={{ marginTop: '6px' }}><strong>Rule:</strong> Below 47% = call manager</p>
            </div>

            <div className="help-section">
              <h3>Delivery</h3>
              <ul>
                <li>Pick $100 / $135 / $150</li>
                <li>Delivery is always taxed</li>
              </ul>
            </div>

            <div className="help-section">
              <h3>No-Tax Promo</h3>
              <ul>
                <li>Same total. Just how you say it</li>
                <li>No-Tax ON: one tax-included price</li>
                <li>No-Tax OFF: say price + tax</li>
              </ul>
              <p style={{ marginTop: '6px' }}><strong>Invoice:</strong> Always write pre-tax merchandise</p>
            </div>

            <div className="help-section">
              <h3>FAQ</h3>
              <div className="faq-item">
                <div className="faq-q">Q: Which mode should I use?</div>
                <div className="faq-a">A: Quote for customer totals. Margin for profit checks.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Q: What is landing cost?</div>
                <div className="faq-a">A: Your cost from the system.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Q: What does No-Tax mean?</div>
                <div className="faq-a">A: Same total. Just one number to say.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Q: Why do totals look different?</div>
                <div className="faq-a">A: No-Tax changes how prices are shown.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Q: What do I write on the invoice?</div>
                <div className="faq-a">A: Write pre-tax merchandise.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Q: Do I tax delivery?</div>
                <div className="faq-a">A: Yes. Always.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Q: Why is my margin red?</div>
                <div className="faq-a">A: The deal is below 47%.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Q: Can I use this without landing cost?</div>
                <div className="faq-a">A: Quote mode yes. Margin mode needs landing cost.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Q: How do I copy for a manager?</div>
                <div className="faq-a">A: Tap the Copy block in results.</div>
              </div>
            </div>

            <div className="help-section">
              <h3>Glossary</h3>
              <div className="glossary-item"><strong>Landing cost:</strong> Your cost.</div>
              <div className="glossary-item"><strong>Sale price:</strong> Price before tax.</div>
              <div className="glossary-item"><strong>Quote:</strong> What the customer pays.</div>
              <div className="glossary-item"><strong>Margin:</strong> Your profit percent.</div>
            </div>

            <div className="help-section">
              <h3>Manager Rule</h3>
              <p>Below 47% margin = stop and call manager.</p>
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
            <p style={{ fontSize: '14px', color: colors.text.secondary, marginBottom: '20px' }}>
              Are you sure you want to start over? This will clear all items and reset the calculator.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowConfirmReset(false)}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: colors.primary[50],
                  color: colors.text.secondary,
                  border: `1px solid ${colors.primary[200]}`,
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
                  background: colors.error.main,
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


      {/* History Modal */}
      {showHistory && (
        <div className="help-overlay" onClick={() => setShowHistory(false)}>
          <div className="help-modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '4px' }}>Recent Deals</h2>
            <p style={{ fontSize: '12px', color: colors.text.secondary, marginBottom: '16px' }}>Tap a deal to restore it.</p>
            {history.length === 0 ? (
              <p style={{ fontSize: '14px', color: colors.text.secondary, textAlign: 'center', padding: '24px 0' }}>
                No history yet. Calculate a deal to save it here.
              </p>
            ) : (
              history.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => restoreFromHistory(entry)}
                  style={{
                    background: colors.primary[50],
                    border: `1px solid ${colors.primary[200]}`,
                    borderRadius: '10px',
                    padding: '12px 14px',
                    marginBottom: '10px',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: colors.text.primary }}>
                      {entry.mode === 'quote' ? '💵' : '📊'}{' '}
                      {entry.mode === 'quote' ? 'Quote' : 'Margin'}
                    </span>
                    <span style={{ fontSize: '11px', color: colors.text.secondary }}>{formatRelativeTime(entry.ts)}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: colors.text.secondary }}>
                    {entry.label || 'Unnamed deal'} • {entry.itemCount} item{entry.itemCount !== 1 ? 's' : ''}
                    {entry.noTaxPromo ? ' • No-Tax' : ''}{Number(entry.delivery) > 0 ? ` • $${entry.delivery} delivery` : ''}
                  </div>
                  {(() => {
                    const entryItems = (entry.items || []);
                    const totalLanding = entryItems.reduce((s, i) => s + parseMoney(i.landingCost) * (parseInt(i.qty) || 1), 0);
                    const totalInvoice = entryItems.reduce((s, i) => s + parseMoney(i.price) * (parseInt(i.qty) || 1), 0);
                    const margin = totalInvoice > 0 && totalLanding > 0 ? calculateMargin(totalInvoice, totalLanding) : null;
                    return (totalInvoice > 0 || margin !== null) ? (
                      <div style={{ fontSize: '11px', color: colors.text.secondary, marginTop: 4, display: 'flex', gap: 8 }}>
                        {totalInvoice > 0 && <span>Total: {formatMoney(totalInvoice)}</span>}
                        {margin !== null && <span style={{ color: getMarginColor(margin), fontWeight: 600 }}>Margin: {margin.toFixed(1)}%</span>}
                      </div>
                    ) : null;
                  })()}
                </div>
              ))
            )}
            {history.length > 0 && (
              <button
                onClick={() => {
                  setHistory([]);
                  try { localStorage.removeItem(HISTORY_KEY); } catch {}
                }}
                style={{ background: 'none', border: 'none', color: colors.error.main, fontSize: '13px', cursor: 'pointer', padding: '8px 0', width: '100%', textAlign: 'center' }}
              >
                Clear history
              </button>
            )}
            <button className="help-close" onClick={() => setShowHistory(false)} style={{ marginTop: '8px' }}>
              Done
            </button>
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
