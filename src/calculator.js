/**
 * Landlord Yield & Tax Optimisation Calculator - Math Engine
 * Designed for UK Buy-to-Let Property Calculations.
 * 
 * Handles:
 * - Gross Rental Yield
 * - Net Rental Yield (with 10% standard management fee)
 * - Interest-Only Mortgage Payments based on LTV Slider
 * - Section 24 individual landlord tax liability (banned interest deduction)
 * - Basic rate (20%) tax relief credit on mortgage interest
 * - Section 24 tax impact (drag) comparison (individual tax vs old deductible regime)
 * - Limited Company (incorporation) tax savings comparison (19% Corporation Tax)
 * - Comprehensive monthly post-tax Cash Flow
 */
class LandlordCalculator {
  /**
   * Helper to clean input values and handle standard strings with symbols (£, %, commas)
   * @param {any} val - The input value to clean
   * @returns {number} Cleaned numeric value
   */
  static cleanInput(val) {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    // Remove currency symbols, commas, and percentage signs
    const cleaned = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
    return isNaN(cleaned) ? 0 : Math.max(0, cleaned); // clamp to 0+ for safety
  }

  /**
   * Run full BTL calculation suite
   * @param {object} inputs
   * @param {number|string} inputs.purchasePrice - Property Purchase Price
   * @param {number|string} inputs.monthlyRent - Estimated Monthly Rent
   * @param {number|string} inputs.ltvPercent - Loan to Value (0 to 100)
   * @param {number|string} inputs.mortgageRate - Mortgage Interest Rate (%)
   * @param {number|string} inputs.taxRate - Employment Tax Band Rate (0.20, 0.40, 0.45)
   * @param {boolean} inputs.isLimitedCompany - Toggle for buying via Ltd Company
   * @returns {object} Highly detailed calculation output structure
   */
  static calculate({
    purchasePrice,
    monthlyRent,
    ltvPercent = 75,
    mortgageRate = 5.0,
    taxRate = 0.40,
    isLimitedCompany = false
  }) {
    // 1. Clean Inputs
    const P = this.cleanInput(purchasePrice);
    const Mr = this.cleanInput(monthlyRent);
    const LTV = Math.min(100, this.cleanInput(ltvPercent)); // cap at 100%
    const Rm = this.cleanInput(mortgageRate);
    const Rt = this.cleanInput(taxRate);

    // 2. Annual Gross and Net Income
    const annualRent = Mr * 12;
    const grossYield = P > 0 ? (annualRent / P) * 100 : 0;
    
    // Management fee (standard 10%)
    const managementFeeRate = 0.10;
    const annualManagementFees = annualRent * managementFeeRate;
    const monthlyManagementFee = annualManagementFees / 12;

    // Net Yield before financing (Operating yield)
    const netYield = P > 0 ? ((annualRent - annualManagementFees) / P) * 100 : 0;

    // 3. Financing Math
    const mortgageAmount = P * (LTV / 100);
    const annualMortgageInterest = mortgageAmount * (Rm / 100);
    const monthlyMortgageInterest = annualMortgageInterest / 12;

    // 4. Tax Calculations
    // --- CASE A: INDIVIDUAL REGIME (Section 24 Applies) ---
    // Section 24 means finance costs (interest) CANNOT be deducted from rental income to reduce taxable profit.
    const individualTaxableProfit = Math.max(0, annualRent - annualManagementFees);
    const individualGrossTaxDue = individualTaxableProfit * Rt;
    
    // Section 24 Tax Credit: Landlords get a 20% basic rate tax reduction on the lower of:
    // a) Finance costs (mortgage interest)
    // b) Rental profits (after management fees)
    // c) Total income that exceeds personal allowance (we use mortgage interest for the standard calculator profile)
    const rawTaxCredit = annualMortgageInterest * 0.20;
    const individualTaxCredit = Math.min(rawTaxCredit, individualGrossTaxDue);
    const individualNetTaxPayable = Math.max(0, individualGrossTaxDue - individualTaxCredit);
    const individualMonthlyTax = individualNetTaxPayable / 12;

    // --- CASE B: OLD REGIME (For Section 24 Impact Drag comparison) ---
    // In the old system, mortgage interest was 100% deductible.
    const oldTaxableProfit = Math.max(0, annualRent - annualManagementFees - annualMortgageInterest);
    const oldTaxPayable = Math.max(0, oldTaxableProfit * Rt);
    
    // Section 24 Drag is the direct extra tax paid due to Section 24 rule change
    const section24Impact = Math.max(0, individualNetTaxPayable - oldTaxPayable);

    // --- CASE C: LIMITED COMPANY REGIME (Section 24 does NOT apply) ---
    // Limited Companies can deduct mortgage interest as an operating expense.
    const companyTaxableProfit = Math.max(0, annualRent - annualManagementFees - annualMortgageInterest);
    // UK Corporation Tax Small Profits Rate is 19% (for profits up to £50,000)
    const companyTaxRate = 0.19; 
    const companyNetTaxPayable = Math.max(0, companyTaxableProfit * companyTaxRate);
    const companyMonthlyTax = companyNetTaxPayable / 12;

    // Ltd Company Tax Savings vs Individual
    const ltdCoTaxSavings = Math.max(0, individualNetTaxPayable - companyNetTaxPayable);

    // 5. Active Profile Resolution (Based on whether user toggles Company or Individual)
    const activeNetTaxPayable = isLimitedCompany ? companyNetTaxPayable : individualNetTaxPayable;
    const activeMonthlyTax = activeNetTaxPayable / 12;

    // 6. Cash Flow Resolution
    // Net Monthly Cash Flow = Monthly Rent - Management Fee - Mortgage Interest - Tax
    const netMonthlyCashFlow = Mr - monthlyManagementFee - monthlyMortgageInterest - activeMonthlyTax;
    const annualNetCashFlow = netMonthlyCashFlow * 12;
    
    // Post-Tax Net Yield
    const postTaxYield = P > 0 ? (annualNetCashFlow / P) * 100 : 0;

    return {
      inputs: {
        purchasePrice: P,
        monthlyRent: Mr,
        ltvPercent: LTV,
        mortgageRate: Rm,
        taxRate: Rt,
        isLimitedCompany
      },
      annualRent,
      grossYield,
      netYield,
      postTaxYield,
      managementFees: annualManagementFees,
      mortgageAmount,
      annualMortgageInterest,
      monthlyMortgageInterest,
      individual: {
        taxableProfit: individualTaxableProfit,
        grossTax: individualGrossTaxDue,
        taxCredit: individualTaxCredit,
        netTax: individualNetTaxPayable,
        monthlyTax: individualMonthlyTax
      },
      oldRegime: {
        taxableProfit: oldTaxableProfit,
        tax: oldTaxPayable
      },
      company: {
        taxableProfit: companyTaxableProfit,
        tax: companyNetTaxPayable,
        monthlyTax: companyMonthlyTax
      },
      section24Impact,
      ltdCoTaxSavings,
      monthlyManagementFee,
      monthlyTax: activeMonthlyTax,
      netMonthlyCashFlow,
      annualNetCashFlow
    };
  }
}

// Export module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LandlordCalculator;
} else {
  window.LandlordCalculator = LandlordCalculator;
}
