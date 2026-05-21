/**
 * Landlord Yield & Tax Optimisation Calculator - Application Logic & Navigation Controller
 * Tightly integrates the UI wizard steps, input events, mathematical engine,
 * local storage persistence, lead lock screen, and webhook data delivery.
 */
document.addEventListener('DOMContentLoaded', () => {
  // --- State Variables ---
  let currentStep = 1;
  const totalSteps = 4;
  let selectedTaxBand = 'higher'; // default selection in HTML
  let isLimitedCompany = true;     // default selection in HTML ('toggle-ltd-yes' active)
  let leadUnlocked = false;

  // --- Element Selectors ---
  // Inputs
  const purchasePriceInput = document.getElementById('purchase-price');
  const monthlyRentInput = document.getElementById('monthly-rent');
  const ltvSlider = document.getElementById('ltv-slider');
  const ltvInput = document.getElementById('ltv-input');
  const interestRateInput = document.getElementById('interest-rate');
  
  // Tax Cards
  const taxCards = document.querySelectorAll('[data-tax-band]');
  
  // Ltd Co Buttons
  const toggleLtdNoBtn = document.getElementById('toggle-ltd-no');
  const toggleLtdYesBtn = document.getElementById('toggle-ltd-yes');
  
  // Wizard Navigation
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const steps = [
    document.getElementById('step-1'),
    document.getElementById('step-2'),
    document.getElementById('step-3'),
    document.getElementById('step-4')
  ];
  const stepDots = document.querySelectorAll('.step-dot');
  const progressLine = document.querySelector('.wizard-steps-indicator > div:nth-child(2)'); // Active progress bar line
  
  // Lead Lock & Dashboard Overlay
  const liveDashboard = document.getElementById('live-dashboard');
  const leadLockScreen = document.getElementById('lead-lock-screen');
  const leadForm = document.querySelector('#lead-lock-screen form');
  const leadName = document.getElementById('lead-name');
  const leadEmail = document.getElementById('lead-email');
  const leadPhone = document.getElementById('lead-phone');
  const requestValuation = document.getElementById('request-valuation');
  const leadSubmitBtn = document.querySelector('#lead-lock-screen button[type="submit"]');

  // Print displays
  const printClientNames = document.querySelectorAll('.lead-display-name');

  // --- Pre-populate Form with localStorage Cache ---
  function loadCache() {
    if (localStorage.getItem('btl_purchase_price')) purchasePriceInput.value = localStorage.getItem('btl_purchase_price');
    if (localStorage.getItem('btl_monthly_rent')) monthlyRentInput.value = localStorage.getItem('btl_monthly_rent');
    if (localStorage.getItem('btl_ltv_percent')) {
      const cachedLtv = localStorage.getItem('btl_ltv_percent');
      ltvSlider.value = cachedLtv;
      ltvInput.value = cachedLtv;
    }
    if (localStorage.getItem('btl_interest_rate')) interestRateInput.value = localStorage.getItem('btl_interest_rate');
    
    if (localStorage.getItem('btl_tax_band')) {
      selectedTaxBand = localStorage.getItem('btl_tax_band');
      updateTaxBandUI(selectedTaxBand);
    }
    
    if (localStorage.getItem('btl_is_ltd')) {
      isLimitedCompany = localStorage.getItem('btl_is_ltd') === 'true';
      updateLtdCoUI(isLimitedCompany);
    }

    if (localStorage.getItem('btl_lead_unlocked') === 'true') {
      leadUnlocked = true;
      unlockDashboard(false); // unlock silently without animation
      if (localStorage.getItem('btl_lead_name')) {
        const cachedName = localStorage.getItem('btl_lead_name');
        printClientNames.forEach(span => span.textContent = cachedName);
      }
    }
  }

  // Save inputs to cache as they change
  function saveCache() {
    localStorage.setItem('btl_purchase_price', purchasePriceInput.value);
    localStorage.setItem('btl_monthly_rent', monthlyRentInput.value);
    localStorage.setItem('btl_ltv_percent', ltvSlider.value);
    localStorage.setItem('btl_interest_rate', interestRateInput.value);
    localStorage.setItem('btl_tax_band', selectedTaxBand);
    localStorage.setItem('btl_is_ltd', isLimitedCompany);
  }

  // --- UI Helpers ---
  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
  }

  function formatPercent(value) {
    return value.toFixed(2) + '%';
  }

  // --- Mathematics Bridge (Calculation Updates) ---
  function runCalculations() {
    if (typeof window.LandlordCalculator === 'undefined') {
      console.warn('LandlordCalculator math engine not loaded yet!');
      return;
    }

    // Resolve Personal Tax Rate
    let taxRateVal = 0.40;
    if (selectedTaxBand === 'basic') taxRateVal = 0.20;
    if (selectedTaxBand === 'additional') taxRateVal = 0.45;

    // Run Engine
    const results = window.LandlordCalculator.calculate({
      purchasePrice: purchasePriceInput.value || 350000,
      monthlyRent: monthlyRentInput.value || 1650,
      ltvPercent: ltvSlider.value,
      mortgageRate: interestRateInput.value || 4.5,
      taxRate: taxRateVal,
      isLimitedCompany: isLimitedCompany
    });

    // Update Dashboard Display Elements (Under the blur if locked, crisp if unlocked)
    document.getElementById('db-gross-yield').textContent = formatPercent(results.grossYield);
    document.getElementById('db-net-yield').textContent = formatPercent(results.netYield);
    
    // Section 24 Drag Card Indicator
    const taxDragEl = document.getElementById('db-tax-drag');
    const dragAmount = results.section24Impact;
    if (dragAmount > 0) {
      taxDragEl.textContent = '-' + formatCurrency(dragAmount);
      taxDragEl.className = "text-2xl font-extrabold text-rose-400 glow-text-rose";
    } else {
      taxDragEl.textContent = '£0';
      taxDragEl.className = "text-2xl font-extrabold text-brand-success glow-text-emerald";
    }

    // Net cash flow
    const cashFlowEl = document.getElementById('db-cash-flow');
    const monthlyNetFlow = results.netMonthlyCashFlow;
    if (monthlyNetFlow >= 0) {
      cashFlowEl.textContent = formatCurrency(monthlyNetFlow) + ' / Mo Net';
      cashFlowEl.className = "text-xs font-bold text-brand-success";
    } else {
      cashFlowEl.textContent = '-' + formatCurrency(Math.abs(monthlyNetFlow)) + ' / Mo Net';
      cashFlowEl.className = "text-xs font-bold text-rose-400";
    }

    // Update Cash Flow vs Tax Drag Chart component
    const totalRepresentedMonthly = Math.max(1, results.netMonthlyCashFlow + (results.section24Impact / 12));
    const cashFlowWeight = Math.max(0, Math.min(100, (results.netMonthlyCashFlow / totalRepresentedMonthly) * 100));
    const taxDragWeight = 100 - cashFlowWeight;

    const chartCashflowBar = document.getElementById('db-chart-cashflow');
    const chartTaxdragBar = document.getElementById('db-chart-taxdrag');
    chartCashflowBar.style.width = cashFlowWeight + '%';
    chartTaxdragBar.style.width = taxDragWeight + '%';
    
    document.getElementById('db-text-cashflow').textContent = `Monthly Net Cashflow (${formatCurrency(Math.max(0, results.netMonthlyCashFlow))})`;
    document.getElementById('db-text-taxdrag').textContent = `Tax Relief Leakage (${formatCurrency(results.section24Impact / 12)})`;

    // --- Update Printable Summary Layout Elements ---
    document.getElementById('print-purchase-price').textContent = formatCurrency(results.inputs.purchasePrice);
    document.getElementById('print-monthly-rent').textContent = formatCurrency(results.inputs.monthlyRent);
    document.getElementById('print-ltv-debt').textContent = `${results.inputs.ltvPercent}% LTV (${formatCurrency(results.mortgageAmount)} Debt)`;
    document.getElementById('print-interest-rate').textContent = `${results.inputs.mortgageRate.toFixed(2)}% Fixed p.a.`;
    
    // Print Tax band label
    let printTaxBandText = 'Basic Rate Taxpayer (20%)';
    if (selectedTaxBand === 'higher') printTaxBandText = 'Higher Rate Taxpayer (40%)';
    if (selectedTaxBand === 'additional') printTaxBandText = 'Additional Rate Taxpayer (45%)';
    document.getElementById('print-tax-band').textContent = printTaxBandText;

    // Print Structure label
    document.getElementById('print-structure').textContent = isLimitedCompany ? 'SPV Limited Company (Optimised)' : 'Individual Landlord';

    // Print Dashboard values
    document.getElementById('print-net-yield').textContent = formatPercent(isLimitedCompany ? results.netYield : results.postTaxYield);
    document.getElementById('print-gross-yield').textContent = formatPercent(results.grossYield);
    
    // Print Tax drag
    const printTaxDragEl = document.getElementById('print-tax-drag');
    if (isLimitedCompany) {
      printTaxDragEl.textContent = '£0.00';
      printTaxDragEl.className = "print-card-value text-emerald-600";
    } else {
      printTaxDragEl.textContent = '-' + formatCurrency(results.section24Impact);
      printTaxDragEl.className = "print-card-value text-red-600";
    }

    // Print Net Cash Flow
    const printCashFlowEl = document.getElementById('print-cash-flow');
    printCashFlowEl.textContent = formatCurrency(results.netMonthlyCashFlow);
    if (results.netMonthlyCashFlow >= 0) {
      printCashFlowEl.className = "print-card-value text-emerald-600";
    } else {
      printCashFlowEl.className = "print-card-value text-red-600";
    }

    // Print chart bar fill
    document.getElementById('print-chart-fill').style.width = cashFlowWeight + '%';
  }

  // --- Step Form Navigation Logic ---
  function updateStepUI() {
    steps.forEach((step, index) => {
      if (index === currentStep - 1) {
        step.classList.remove('hidden');
      } else {
        step.classList.add('hidden');
      }
    });

    // Update Progress Indicators
    stepDots.forEach((dot, index) => {
      if (index === currentStep - 1) {
        dot.classList.add('active', 'border-white/15', 'text-white');
        dot.classList.remove('border-white/10', 'text-gray-500');
      } else if (index < currentStep - 1) {
        dot.classList.add('active', 'border-white/15', 'text-white');
        dot.classList.remove('border-white/10', 'text-gray-500');
      } else {
        dot.classList.remove('active', 'border-white/15', 'text-white');
        dot.classList.add('border-white/10', 'text-gray-500');
      }
    });

    // Calculate Active Line Width (0%, 33.3%, 66.6%, 100%)
    const percentage = ((currentStep - 1) / (totalSteps - 1)) * 100;
    progressLine.style.width = `${percentage}%`;

    // Button states
    prevBtn.disabled = currentStep === 1;
    
    // Change text of Continue button on last step
    const nextSpan = nextBtn.querySelector('span');
    if (currentStep === totalSteps) {
      nextSpan.textContent = 'Optimize Results';
    } else {
      nextSpan.textContent = 'Continue';
    }
  }

  function validateCurrentStep() {
    if (currentStep === 1) {
      const price = parseFloat(purchasePriceInput.value);
      const rent = parseFloat(monthlyRentInput.value);
      if (isNaN(price) || price <= 0) {
        alert('Please enter a valid Property Purchase Price.');
        purchasePriceInput.focus();
        return false;
      }
      if (isNaN(rent) || rent <= 0) {
        alert('Please enter a valid Estimated Monthly Rent.');
        monthlyRentInput.focus();
        return false;
      }
    } else if (currentStep === 2) {
      const ltv = parseFloat(ltvInput.value);
      const rate = parseFloat(interestRateInput.value);
      if (isNaN(ltv) || ltv < 0 || ltv > 100) {
        alert('Please enter a valid Loan-to-Value percentage (0 - 100%).');
        ltvInput.focus();
        return false;
      }
      if (isNaN(rate) || rate < 0) {
        alert('Please enter a valid Mortgage Interest Rate.');
        interestRateInput.focus();
        return false;
      }
    }
    return true;
  }

  // --- Tax Band Card Selections ---
  function updateTaxBandUI(band) {
    taxCards.forEach(card => {
      const currentBand = card.getAttribute('data-tax-band');
      const checkCircle = card.querySelector('.checkmark-circle');
      if (currentBand === band) {
        card.classList.add('selected', 'border-brand-success/40');
        card.classList.remove('border-white/10');
        checkCircle.className = 'w-4 h-4 rounded-full bg-brand-success flex items-center justify-center checkmark-circle';
        checkCircle.innerHTML = `<svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;
      } else {
        card.classList.remove('selected', 'border-brand-success/40');
        card.classList.add('border-white/10');
        checkCircle.className = 'w-4 h-4 rounded-full border border-white/20 flex items-center justify-center checkmark-circle';
        checkCircle.innerHTML = '';
      }
    });
    selectedTaxBand = band;
    saveCache();
    runCalculations();
  }

  // --- Limited Company Toggle Action ---
  function updateLtdCoUI(yesCompany) {
    isLimitedCompany = yesCompany;
    if (isLimitedCompany) {
      toggleLtdYesBtn.className = "ltd-toggle-btn py-3 px-4 rounded-xl text-sm font-bold text-center tracking-wide transition-all duration-300 bg-gradient-to-r from-brand-success to-emerald-600 text-white shadow-lg shadow-brand-success/15 active";
      toggleLtdNoBtn.className = "ltd-toggle-btn py-3 px-4 rounded-xl text-sm font-bold text-center tracking-wide transition-all duration-300 bg-white/5 text-gray-300 hover:text-white";
    } else {
      toggleLtdYesBtn.className = "ltd-toggle-btn py-3 px-4 rounded-xl text-sm font-bold text-center tracking-wide transition-all duration-300 bg-white/5 text-gray-300 hover:text-white";
      toggleLtdNoBtn.className = "ltd-toggle-btn py-3 px-4 rounded-xl text-sm font-bold text-center tracking-wide transition-all duration-300 bg-gradient-to-r from-brand-success to-emerald-600 text-white shadow-lg shadow-brand-success/15 active";
    }
    saveCache();
    runCalculations();
  }

  // --- Lead Lock & Unlock Execution ---
  function unlockDashboard(animate = true) {
    if (animate) {
      leadLockScreen.classList.add('opacity-0', 'scale-95');
      setTimeout(() => {
        leadLockScreen.classList.add('hidden');
      }, 500);
    } else {
      leadLockScreen.classList.add('hidden');
    }
    
    // Remove blur and pointer restriction on live dashboard
    liveDashboard.classList.remove('blur-[4px]', 'pointer-events-none');
    
    // Change static "awaiting form" tag in header to "Optimum Tax Shield" or "Shield Active"
    const headerTag = liveDashboard.querySelector('.border-b span.inline-flex');
    if (headerTag) {
      headerTag.className = "inline-flex px-2 py-0.5 rounded bg-brand-success/10 border border-brand-success/20 text-[10px] font-bold text-brand-success items-center space-x-1";
      headerTag.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-brand-success"></span><span>Report Active</span>`;
    }
    
    leadUnlocked = true;
    localStorage.setItem('btl_lead_unlocked', 'true');
  }

  // --- Event Listeners Integration ---
  
  // Property Inputs
  purchasePriceInput.addEventListener('input', () => { runCalculations(); saveCache(); });
  monthlyRentInput.addEventListener('input', () => { runCalculations(); saveCache(); });
  
  // Dual LTV Connectors (Range Slider <=> Number Input)
  ltvSlider.addEventListener('input', (e) => {
    ltvInput.value = e.target.value;
    runCalculations();
    saveCache();
  });
  
  ltvInput.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (isNaN(val)) val = 0;
    if (val < 0) val = 0;
    if (val > 80) val = 80; // limit standard Buy to Let LTV
    ltvSlider.value = val;
    runCalculations();
    saveCache();
  });

  interestRateInput.addEventListener('input', () => { runCalculations(); saveCache(); });

  // Tax cards click bindings
  taxCards.forEach(card => {
    card.addEventListener('click', () => {
      const band = card.getAttribute('data-tax-band');
      updateTaxBandUI(band);
    });
  });

  // Ltd co buttons toggling
  toggleLtdNoBtn.addEventListener('click', () => updateLtdCoUI(false));
  toggleLtdYesBtn.addEventListener('click', () => updateLtdCoUI(true));

  // Wizard navigation clicks
  nextBtn.addEventListener('click', () => {
    if (!validateCurrentStep()) return;
    
    if (currentStep < totalSteps) {
      currentStep++;
      updateStepUI();
      runCalculations();
    } else {
      // Finished wizard steps - draw attention directly to lead capture on the right panel
      runCalculations();
      if (!leadUnlocked) {
        // Bounce lockpad and slide scroll to the form if on mobile
        const lockscreen = document.getElementById('lead-lock-screen');
        lockscreen.scrollIntoView({ behavior: 'smooth' });
        
        // Add subtle flash warning or highlight on form fields
        leadName.focus();
        
        // Custom ripple animation on name input
        leadName.classList.add('ring-2', 'ring-brand-success/40');
        setTimeout(() => leadName.classList.remove('ring-2', 'ring-brand-success/40'), 1500);
      }
    }
  });

  prevBtn.addEventListener('click', () => {
    if (currentStep > 1) {
      currentStep--;
      updateStepUI();
      runCalculations();
    }
  });

  // --- Lead Form Webhook Delivery Endpoint ---
  leadForm.addEventListener('submit', (e) => {
    e.preventDefault();

    // Field values validation
    const nameVal = leadName.value.trim();
    const emailVal = leadEmail.value.trim();
    const phoneVal = leadPhone.value.trim();
    const requestValuationVal = requestValuation.checked;

    if (!nameVal || !emailVal || !phoneVal) {
      alert('Please fill out all fields in the lead capture form.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailVal)) {
      alert('Please enter a valid email address.');
      leadEmail.focus();
      return;
    }

    // UK Phone check: support +44 or 07 mobile/landline structures
    const phoneRegex = /^(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}$|^\+?(\d[\d\-. ]+)?\d$/;
    if (!phoneRegex.test(phoneVal)) {
      alert('Please enter a valid contact phone number.');
      leadPhone.focus();
      return;
    }

    // Cache details
    localStorage.setItem('btl_lead_name', nameVal);
    localStorage.setItem('btl_lead_email', emailVal);
    localStorage.setItem('btl_lead_phone', phoneVal);

    // Disable button to show action progress state
    leadSubmitBtn.disabled = true;
    const btnSpan = leadSubmitBtn.querySelector('span');
    const originalBtnHTML = leadSubmitBtn.innerHTML;
    leadSubmitBtn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span>Structuring Performance Report...</span>
    `;

    // Recalculate to make sure payload has latest math values
    let taxRateVal = 0.40;
    if (selectedTaxBand === 'basic') taxRateVal = 0.20;
    if (selectedTaxBand === 'additional') taxRateVal = 0.45;

    const payloadResults = window.LandlordCalculator.calculate({
      purchasePrice: purchasePriceInput.value || 350000,
      monthlyRent: monthlyRentInput.value || 1650,
      ltvPercent: ltvSlider.value,
      mortgageRate: interestRateInput.value || 4.5,
      taxRate: taxRateVal,
      isLimitedCompany: isLimitedCompany
    });

    // Package details payload
    const leadPayload = {
      lead: {
        name: nameVal,
        email: emailVal,
        phone: phoneVal,
        requestValuation: requestValuationVal,
        timestamp: new Date().toISOString()
      },
      calculatorState: payloadResults
    };

    // Update client name in print layout immediately
    printClientNames.forEach(span => span.textContent = nameVal);

    // Deliver to Mockup Webhook Database Server
    fetch('/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(leadPayload)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Network webhook failure');
      }
      return response.json();
    })
    .then(data => {
      console.log('Webhook Delivery Success:', data);
      unlockDashboard(true);
    })
    .catch(error => {
      console.warn('Webhook Server Offline or Unavailable. Falling back to offline client-side activation...', error);
      // Fallback: Unlock anyway to ensure micro-saas demo remains 100% functional and user is never locked out of testing!
      alert('Mock Webhook Server is currently offline. Simulating offline storage fallback...');
      unlockDashboard(true);
    })
    .finally(() => {
      leadSubmitBtn.disabled = false;
      leadSubmitBtn.innerHTML = originalBtnHTML;
    });
  });

  // --- Initialise Operations ---
  loadCache();
  updateStepUI();
  runCalculations();
});
