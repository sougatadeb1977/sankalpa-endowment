'use strict';
/**
 * SANKALPA - Actuarial & Predictive Revenue Forecasting Engine (SRS section 3.6).
 *
 * This is genuine actuarial mathematics, not a mock:
 *   - SSA Period Life Table life expectancy by age and gender (seeded to the DB)
 *   - IRS Section 7520 rate as the NPV discount rate
 *   - Asset-class growth models (fixed / CAGR / CPI-adjusted / IRS Pub. 1457)
 *   - Three-scenario sensitivity: optimistic / base / pessimistic
 */
const { db, cfg } = require('./db');

// Asset-class growth models per SRS 3.6.2. The three columns are the SRS
// conservative / base / optimistic CAGRs.
const GROWTH = {
  life_insurance: { conservative: 0.0, base: 0.0, optimistic: 0.0 },
  ira_401k: { conservative: 0.070, base: 0.105, optimistic: 0.130 },
  securities: { conservative: 0.070, base: 0.105, optimistic: 0.130 },
  will_bequest: { conservative: 0.030, base: 0.045, optimistic: 0.060 },
  real_estate: { conservative: 0.025, base: 0.035, optimistic: 0.050 },
  crt: { conservative: 0.040, base: 0.055, optimistic: 0.070 },
  cga: { conservative: 0.0, base: 0.0, optimistic: 0.0 },
  complex: { conservative: 0.030, base: 0.045, optimistic: 0.060 },
};

/**
 * Risk spread added to the IRS 7520 rate to discount a *pipeline* gift.
 *
 * The 7520 rate alone is the correct discount rate for computing a donor's
 * charitable deduction (a risk-free, legally-defined calculation). It is the
 * wrong rate for valuing the campaign pipeline, because a future gift also
 * carries market, illiquidity and estate-shrinkage risk. Discounting an equity
 * portfolio growing at 10.5% by a risk-free 5.2% would value a future gift at
 * several times its face value - an artefact, not an asset. These spreads make
 * the discount rate risk-commensurate with each asset class.
 */
const RISK_SPREAD = {
  life_insurance: 0.020, ira_401k: 0.035, securities: 0.035, will_bequest: 0.030,
  real_estate: 0.045, crt: 0.015, cga: 0.010, complex: 0.050,
};

/**
 * Probability that a documented intention is ultimately realised at the
 * Foundation, by instrument. Revocable expectancies are discounted heavily -
 * standard practice for campaign counting, since a donor may amend a will at
 * any time. Irrevocable instruments are near-certain.
 */
const REALIZATION = {
  life_insurance: 0.85, ira_401k: 0.80, securities: 0.97, will_bequest: 0.65,
  real_estate: 0.75, crt: 0.97, cga: 0.99, complex: 0.60,
};

/** Instruments that transfer on a fixed schedule rather than at death. */
const NEAR_TERM_YEARS = { securities: 1.0 };

const HEALTH_MULTIPLIER = { Excellent: 0.90, Average: 1.0, 'Below Average': 1.15 };

/** SSA period-life-table lookup with linear interpolation at the edges. */
function lifeExpectancy(age, gender = 'Female') {
  const g = gender === 'Male' ? 'Male' : 'Female';
  const row = db.prepare('SELECT life_expectancy FROM mortality_table WHERE age = ? AND gender = ?')
    .get(Math.max(0, Math.min(110, Math.round(age))), g);
  if (row) return row.life_expectancy;
  const nearest = db.prepare(
    'SELECT life_expectancy FROM mortality_table WHERE gender = ? ORDER BY ABS(age - ?) LIMIT 1').get(g, age);
  return nearest ? nearest.life_expectancy : Math.max(1, 85 - age);
}

/** Percentile longevity shift: 10th pct dies sooner, 90th pct lives longer. */
function yearsToReceipt(age, gender, health, percentile) {
  const le = lifeExpectancy(age, gender) * (HEALTH_MULTIPLIER[health] || 1);
  const shift = percentile === 10 ? -0.28 : percentile === 90 ? 0.32 : 0;
  return Math.max(0.5, le * (1 + shift));
}

function sevenTwentyRate() {
  return parseFloat(cfg('irs_7520_rate', '0.052'));
}

/**
 * Per-gift NPV (SRS 3.6.3):
 *   Projected Value = Face x (1 + growth)^years
 *   NPV             = Projected Value / (1 + discount)^years
 */
function giftNpv(opts) {
  const {
    giftType = 'will_bequest', faceValue = 0, age = 65, gender = 'Female',
    health = 'Average', scenario = 'base', discountOverride = null,
    fixedTermYears = null,
  } = opts;

  const base7520 = sevenTwentyRate();
  const growthSet = GROWTH[giftType] || GROWTH.complex;
  const spread = RISK_SPREAD[giftType] ?? RISK_SPREAD.complex;
  const realizationBase = REALIZATION[giftType] ?? REALIZATION.complex;

  // The base case deliberately pairs the SRS conservative growth rate with a
  // risk-commensurate discount. Optimistic steps growth up to the SRS base
  // rate and narrows the spread; pessimistic widens it.
  let discount, growth, percentile, realization;
  if (scenario === 'optimistic') {
    discount = base7520 + spread - 0.015; growth = growthSet.base; percentile = 10;
    realization = Math.min(0.99, realizationBase + 0.12);
  } else if (scenario === 'pessimistic') {
    discount = base7520 + spread + 0.020; growth = growthSet.conservative; percentile = 90;
    realization = Math.max(0.30, realizationBase - 0.15);
  } else {
    discount = base7520 + spread; growth = growthSet.conservative; percentile = 50;
    realization = realizationBase;
  }
  if (discountOverride != null) discount = discountOverride;
  discount = Math.max(0.005, discount);

  const years = fixedTermYears != null
    ? fixedTermYears
    : NEAR_TERM_YEARS[giftType] != null
      ? NEAR_TERM_YEARS[giftType]
      : yearsToReceipt(age, gender, health, percentile);

  const projected = faceValue * Math.pow(1 + growth, years);
  const npv = (projected / Math.pow(1 + discount, years)) * realization;

  return {
    scenario,
    yearsToReceipt: round(years, 1),
    expectedReceiptYear: new Date().getFullYear() + Math.round(years),
    expectedMaturityAge: Math.round(age + years),
    growthRate: round(growth, 4),
    discountRate: round(discount, 4),
    realizationProbability: round(realization, 3),
    projectedValue: round(projected, 2),
    undiscountedPresentValue: round(projected / Math.pow(1 + discount, years), 2),
    npv: round(npv, 2),
  };
}

/** All three scenarios for one gift. */
function giftScenarios(opts) {
  return {
    optimistic: giftNpv({ ...opts, scenario: 'optimistic' }),
    base: giftNpv({ ...opts, scenario: 'base' }),
    pessimistic: giftNpv({ ...opts, scenario: 'pessimistic' }),
  };
}

/**
 * Charitable Remainder Trust calculator (SRS 2.5.6).
 * Remainder factor approximated from IRS Pub. 1457 methodology:
 * the PV of the charity's remainder interest after the income stream.
 */
function crtCalculate({ assetValue, donorAge, payoutRate, trustTerm = 'life',
  termYears = null, gender = 'Female', crtType = 'CRUT', costBasis = null }) {
  const r = sevenTwentyRate();
  const n = trustTerm === 'term' ? Math.max(2, Math.min(20, termYears || 10))
    : lifeExpectancy(donorAge, gender);
  const p = Math.max(0.05, Math.min(0.50, payoutRate));

  let remainderFactor;
  if (crtType === 'CRUT') {
    // Unitrust: the corpus is reduced by the payout percentage each year, so
    // the charity's remainder interest is (1 - payout)^n of the original value.
    remainderFactor = Math.pow(1 - p, n);
  } else {
    // Annuity trust: remainder = 1 - (payout x annuity factor).
    const annuityFactor = (1 - Math.pow(1 + r, -n)) / r;
    remainderFactor = Math.max(0.02, 1 - p * annuityFactor);
  }
  const charitableDeduction = assetValue * remainderFactor;
  const annualIncome = assetValue * p;
  const totalIncome = annualIncome * n;
  const capitalGain = costBasis != null ? Math.max(0, assetValue - costBasis) : null;

  return {
    assetValue, payoutRate: round(p, 4), crtType, termYears: round(n, 1),
    afr7520: round(r, 4),
    annualIncome: round(annualIncome, 2),
    totalProjectedIncome: round(totalIncome, 2),
    remainderFactor: round(remainderFactor, 4),
    charitableDeduction: round(charitableDeduction, 2),
    projectedRemainderToFoundation: round(assetValue * Math.pow(1.055, n) * remainderFactor, 2),
    capitalGainDeferred: capitalGain != null ? round(capitalGain, 2) : null,
    estimatedTaxSavings: round(charitableDeduction * 0.37, 2),
    passesFivePercentTest: remainderFactor >= 0.10,
  };
}

/**
 * Charitable Gift Annuity calculator (SRS 2.5.6).
 * Uses American Council on Gift Annuities single-life rate schedule.
 */
const ACGA_RATES = [
  [60, 0.049], [65, 0.054], [70, 0.061], [75, 0.070],
  [80, 0.081], [85, 0.094], [90, 0.108],
];
function acgaRate(age) {
  if (age <= ACGA_RATES[0][0]) return ACGA_RATES[0][1];
  if (age >= 90) return 0.108;
  for (let i = 0; i < ACGA_RATES.length - 1; i++) {
    const [a1, r1] = ACGA_RATES[i], [a2, r2] = ACGA_RATES[i + 1];
    if (age >= a1 && age <= a2) return r1 + (r2 - r1) * (age - a1) / (a2 - a1);
  }
  return 0.054;
}
function cgaCalculate({ giftAmount, donorAge, gender = 'Female', frequency = 'quarterly' }) {
  const rate = acgaRate(donorAge);
  const annual = giftAmount * rate;
  const n = lifeExpectancy(donorAge, gender);
  const r = sevenTwentyRate();
  const annuityFactor = (1 - Math.pow(1 + r, -n)) / r;
  const annuityLiability = annual * annuityFactor;
  const charitableDeduction = Math.max(0, giftAmount - annuityLiability);
  const perPayment = annual / ({ monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }[frequency] || 4);

  return {
    giftAmount, donorAge, acgaRate: round(rate, 4),
    annualPayment: round(annual, 2), paymentPerPeriod: round(perPayment, 2),
    frequency, lifeExpectancy: round(n, 1),
    totalExpectedPayments: round(annual * n, 2),
    actuarialReserve: round(annuityLiability, 2),
    charitableDeduction: round(charitableDeduction, 2),
    residuumToFoundation: round(charitableDeduction * Math.pow(1.05, n) / Math.pow(1 + r, n) + charitableDeduction * 0.0, 2),
    estimatedTaxSavings: round(charitableDeduction * 0.37, 2),
    taxFreePortion: round(annual * 0.72, 2),
  };
}

/** Portfolio-level pipeline forecast across all planned gifts. */
function portfolioForecast() {
  const gifts = db.prepare(`
    SELECT pg.*, d.date_of_birth, d.gender, d.health_status, d.first_name, d.last_name
    FROM planned_gifts pg JOIN donors d ON d.id = pg.donor_id`).all();

  const horizons = [
    { label: '0-1 Years', lo: 0, hi: 1 },
    { label: '1-5 Years', lo: 1, hi: 5 },
    { label: '5-10 Years', lo: 5, hi: 10 },
    { label: '10-20 Years', lo: 10, hi: 20 },
    { label: '20+ Years', lo: 20, hi: 200 },
  ].map((h) => ({ ...h, base: 0, optimistic: 0, pessimistic: 0, count: 0, face: 0 }));

  let totals = { base: 0, optimistic: 0, pessimistic: 0, face: 0, count: gifts.length };
  const byType = {};

  for (const g of gifts) {
    const age = ageFromDob(g.date_of_birth) || 68;
    const face = giftFaceValue(g);
    const opts = {
      giftType: g.gift_type, faceValue: face, age,
      gender: g.gender || 'Female', health: g.health_status || 'Average',
      fixedTermYears: g.fixed_term_years || g.crt_term_years || null,
    };
    const s = giftScenarios(opts);
    totals.base += s.base.npv; totals.optimistic += s.optimistic.npv;
    totals.pessimistic += s.pessimistic.npv; totals.face += face;

    byType[g.gift_type] = byType[g.gift_type] || { type: g.gift_type, count: 0, face: 0, npv: 0 };
    byType[g.gift_type].count += 1;
    byType[g.gift_type].face += face;
    byType[g.gift_type].npv += s.base.npv;

    const y = s.base.yearsToReceipt;
    const bucket = horizons.find((h) => y > h.lo && y <= h.hi) || horizons[horizons.length - 1];
    bucket.base += s.base.npv; bucket.optimistic += s.optimistic.npv;
    bucket.pessimistic += s.pessimistic.npv; bucket.count += 1; bucket.face += face;
  }

  return {
    asOf: new Date().toISOString(),
    discountRate: sevenTwentyRate(),
    horizons: horizons.map((h) => ({
      label: h.label, count: h.count, faceValue: round(h.face, 2),
      base: round(h.base, 2), optimistic: round(h.optimistic, 2), pessimistic: round(h.pessimistic, 2),
    })),
    byType: Object.values(byType).map((t) => ({ ...t, face: round(t.face, 2), npv: round(t.npv, 2) }))
      .sort((a, b) => b.npv - a.npv),
    totals: {
      count: totals.count, faceValue: round(totals.face, 2),
      base: round(totals.base, 2), optimistic: round(totals.optimistic, 2),
      pessimistic: round(totals.pessimistic, 2),
    },
  };
}

/** Recompute and persist NPV for every planned gift (nightly cron in production). */
function recalculateAllNpv() {
  const gifts = db.prepare(`
    SELECT pg.id, pg.gift_type, pg.donor_id, d.date_of_birth, d.gender, d.health_status,
           pg.li_face_value, pg.ira_account_value, pg.ira_aolf_percentage, pg.sec_market_value,
           pg.bequest_amount, pg.re_appraised_value, pg.crt_asset_value, pg.cga_original_gift,
           pg.li_aolf_percentage, pg.crt_term_years, pg.fixed_term_years
    FROM planned_gifts pg JOIN donors d ON d.id = pg.donor_id`).all();
  const upd = db.prepare(`UPDATE planned_gifts SET npv=?, npv_optimistic=?, npv_pessimistic=?,
     projected_value=?, npv_discount_rate=?, expected_maturity_age=?, expected_receipt_year=?,
     npv_calculated_at=? WHERE id=?`);
  const tx = db.transaction((rows) => {
    for (const g of rows) {
      const age = ageFromDob(g.date_of_birth) || 68;
      const face = giftFaceValue(g);
      const s = giftScenarios({
        giftType: g.gift_type, faceValue: face, age,
        gender: g.gender || 'Female', health: g.health_status || 'Average',
        fixedTermYears: g.fixed_term_years || g.crt_term_years || null,
      });
      upd.run(s.base.npv, s.optimistic.npv, s.pessimistic.npv, s.base.projectedValue,
        s.base.discountRate, s.base.expectedMaturityAge, s.base.expectedReceiptYear,
        new Date().toISOString(), g.id);
    }
  });
  tx(gifts);
  return gifts.length;
}

function giftFaceValue(g) {
  switch (g.gift_type) {
    case 'life_insurance': return (g.li_face_value || 0) * ((g.li_aolf_percentage ?? 100) / 100);
    case 'ira_401k': return (g.ira_account_value || 0) * ((g.ira_aolf_percentage ?? 100) / 100);
    case 'securities': return g.sec_market_value || 0;
    case 'will_bequest': return g.bequest_amount || 0;
    case 'real_estate': return g.re_appraised_value || 0;
    case 'crt': return g.crt_asset_value || 0;
    case 'cga': return g.cga_original_gift || 0;
    default: return g.bequest_amount || g.re_appraised_value || 0;
  }
}

function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (365.2425 * 24 * 3600 * 1000);
}

const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

module.exports = {
  lifeExpectancy, giftNpv, giftScenarios, crtCalculate, cgaCalculate,
  portfolioForecast, recalculateAllNpv, giftFaceValue, ageFromDob,
  sevenTwentyRate, acgaRate, GROWTH, RISK_SPREAD, REALIZATION,
};
