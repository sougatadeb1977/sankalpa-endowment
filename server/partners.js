'use strict';
/**
 * SANKALPA - third-party partner integrations and the vehicle-specific
 * modules that sit on top of them: GoFundMe.org, DonateStock, FreeWill,
 * life insurance carriers, and the multi-state consultant network.
 */
const { db, uuid, now } = require('./db');
const actuarial = require('./actuarial');

/**
 * Partner registry. `url` is the live handoff destination; in production the
 * Foundation's own campaign/partner identifier is appended by the server so
 * the referral is attributed and the return webhook can be reconciled.
 */
const PARTNERS = {
  gofundme: {
    key: 'gofundme',
    name: 'GoFundMe.org',
    url: 'https://www.gofundme.org',
    category: 'immediate_giving',
    role: 'Peer-to-peer and campaign fundraising',
    blurb: 'The Foundation holds a membership subscription with GoFundMe.org. Start your own fundraiser for the endowment, or give through the Foundation\'s hosted campaign page.',
    action: 'Give or fundraise on GoFundMe.org',
    handoff: 'Gifts made on GoFundMe.org are reconciled into this ledger by webhook, so they appear in your giving history here.',
  },
  donatestock: {
    key: 'donatestock',
    name: 'DonateStock',
    url: 'https://www.donatestock.com',
    category: 'securities',
    role: 'Appreciated securities transfer',
    blurb: 'The Foundation partners with DonateStock so you can transfer appreciated shares in a few clicks, without paperwork or a broker phone call.',
    action: 'Transfer shares via DonateStock',
    handoff: 'DonateStock notifies the Foundation on settlement; the shares are liquidated per policy and the gift is receipted at fair market value on the transfer date.',
  },
  freewill: {
    key: 'freewill',
    name: 'FreeWill',
    url: 'https://www.freewill.com',
    category: 'will_trust',
    role: 'Legally binding will and trust creation',
    blurb: 'Write a legally valid will online, at no cost, in about twenty minutes — and name the Foundation as a beneficiary in the same flow.',
    action: 'Create my will with FreeWill',
    handoff: 'FreeWill lets you notify the Foundation of your intention at the end. Doing so is entirely optional and never binding — a will stays revocable.',
  },
  plaid: {
    key: 'plaid', name: 'Plaid', url: 'https://plaid.com', category: 'immediate_giving',
    role: 'Bank authentication for ACH gifts',
    blurb: 'Bank transfers are authenticated through Plaid, so account and routing numbers are verified without being handled by the Foundation.',
    action: 'Used automatically at ACH checkout', handoff: null,
  },
  thegivingblock: {
    key: 'thegivingblock', name: 'The Giving Block', url: 'https://thegivingblock.com',
    category: 'immediate_giving', role: 'Cryptocurrency donations',
    blurb: 'Give in Bitcoin, Ethereum, Solana, USDC and 60+ other assets. Crypto gifts are liquidated immediately per the Foundation\'s investment policy.',
    action: 'Give cryptocurrency', handoff: 'Receipted at fair market value on the date of contribution, per IRS guidance.',
  },
  dafdirect: {
    key: 'dafdirect', name: 'DAF Direct', url: 'https://www.dafdirect.org',
    category: 'immediate_giving', role: 'Donor advised fund grants',
    blurb: 'Recommend a grant from your donor advised fund at Fidelity Charitable, Schwab Charitable, Vanguard Charitable and others.',
    action: 'Recommend a DAF grant', handoff: 'The IRS gift date is the date of the grant cheque, not the date of your recommendation.',
  },
};

/* ────────────────── Retirement account (401k / IRA) module ────────────────── */

const CUSTODIAN_STEPS = {
  Fidelity: [
    'Sign in at fidelity.com and open Accounts & Trade, then Update Accounts / Features.',
    'Choose Beneficiaries, then select the retirement account you wish to designate.',
    'Under Add Beneficiary choose Non-Person / Charity or Trust.',
    'Enter Art of Living Foundation, tax ID 95-4386417, and the percentage you wish to leave.',
    'Confirm the percentages across all beneficiaries total 100% and submit.',
  ],
  Vanguard: [
    'Sign in at vanguard.com and go to My Accounts, then Profile & account settings.',
    'Select Beneficiaries and choose the IRA or retirement plan.',
    'Add a beneficiary and choose Organization or charity rather than Person.',
    'Enter Art of Living Foundation, tax ID 95-4386417, and your chosen percentage.',
    'Review the allocation summary and submit — no notarisation is required.',
  ],
  'Charles Schwab': [
    'Sign in at schwab.com and open Service, then Account Settings, then Beneficiaries.',
    'Select the retirement account and choose Add / Edit beneficiaries.',
    'Select Charity or non-profit as the beneficiary type.',
    'Enter Art of Living Foundation, tax ID 95-4386417, and the percentage.',
    'Submit electronically; a confirmation is emailed within one business day.',
  ],
  'Employer 401(k) plan': [
    'Sign in to your plan provider (Fidelity NetBenefits, Empower, Principal, Voya and similar).',
    'Open Profile or Beneficiaries — this is separate from your investment elections.',
    'If you are married, most plans require notarised spousal consent to name a non-spouse beneficiary.',
    'Add Art of Living Foundation, tax ID 95-4386417, with your chosen percentage.',
    'Upload or post the signed consent form if your plan requires one.',
  ],
  Other: [
    'Ask your plan administrator for a Beneficiary Designation Change form.',
    'Name Art of Living Foundation, a California nonprofit public benefit corporation, tax ID 95-4386417.',
    'State the percentage you wish to leave — any figure from 1% to 100%.',
    'Return the form to the custodian, not to the Foundation.',
    'Send us a copy if you would like the intention recorded and acknowledged.',
  ],
};

/**
 * Retirement beneficiary calculator: the donor enters the total account value
 * and the percentage they intend to leave. We project the account forward to
 * expected maturity and discount it back, and we compare what heirs would
 * actually keep after income tax against what the Foundation would receive.
 */
function iraProjection({ accountValue, percentage, age, gender = 'Female',
  health = 'Average', growthScenario = 'base', heirTaxRate = 0.32 }) {
  const pledged = accountValue * (percentage / 100);
  const s = actuarial.giftScenarios({
    giftType: 'ira_401k', faceValue: pledged, age, gender, health,
  });
  const years = s.base.yearsToReceipt;
  const projectedAccount = accountValue * Math.pow(1 + actuarial.GROWTH.ira_401k[
    growthScenario === 'optimistic' ? 'optimistic' : growthScenario === 'conservative' ? 'conservative' : 'base'
  ], years);
  const projectedPledged = projectedAccount * (percentage / 100);

  return {
    accountValue, percentage, pledgedToday: round(pledged),
    yearsToExpectedReceipt: years,
    expectedReceiptYear: s.base.expectedReceiptYear,
    projectedAccountValue: round(projectedAccount),
    projectedGiftValue: round(projectedPledged),
    presentValueToFoundation: s.base.npv,
    scenarios: { optimistic: s.optimistic.npv, base: s.base.npv, pessimistic: s.pessimistic.npv },
    // The core argument: retirement assets are the worst asset to leave to heirs.
    ifLeftToHeirs: {
      grossValue: round(projectedPledged),
      incomeTaxToHeirs: round(projectedPledged * heirTaxRate),
      heirsActuallyKeep: round(projectedPledged * (1 - heirTaxRate)),
      taxRateAssumed: heirTaxRate,
    },
    ifLeftToFoundation: {
      grossValue: round(projectedPledged),
      incomeTax: 0,
      foundationReceives: round(projectedPledged),
    },
    taxAdvantage: round(projectedPledged * heirTaxRate),
    qcdEligible: age >= 70.5,
    qcdAnnualLimit: 105000,
    custodianSteps: CUSTODIAN_STEPS,
  };
}

/* ─────────────────────── Securities / DonateStock module ──────────────────── */

/**
 * The central argument for giving shares rather than cash.
 *
 * Selling first realises the capital gain, and the tax on it is money that
 * leaves the system entirely. Transferring the shares means neither the donor
 * nor the charity ever pays it.
 *
 * We present two honest views of the same fact, because a single view is
 * always slightly misleading:
 *
 *   sameShares  - you part with the same block of stock either way. Giving the
 *                 shares directly delivers more to the Foundation. It also
 *                 "costs" you more, but only because you gave more.
 *   sameGift    - you decide what the Foundation should receive. Selling first
 *                 forces you to liquidate a larger position to net the same
 *                 amount, and the difference is exactly the capital-gains tax.
 */
function stockComparison({ marketValue, costBasis, capitalGainsRate = 0.238, incomeTaxRate = 0.37 }) {
  const gain = Math.max(0, marketValue - costBasis);
  const basisRatio = marketValue > 0 ? costBasis / marketValue : 1;

  // ── View 1: the same block of stock, two routes ──
  const capitalGainsTax = gain * capitalGainsRate;
  const netProceeds = marketValue - capitalGainsTax;
  const costIfSold = netProceeds * (1 - incomeTaxRate);
  const costIfGiven = marketValue * (1 - incomeTaxRate);

  // ── View 2: the same amount delivered to the Foundation ──
  // To net G after tax you must liquidate G / [1 - (1 - basisRatio) * rate].
  const grossUpFactor = 1 - (1 - basisRatio) * capitalGainsRate;
  const stockRequiredIfSold = grossUpFactor > 0 ? marketValue / grossUpFactor : marketValue;
  const extraStockRequired = stockRequiredIfSold - marketValue;

  return {
    marketValue, costBasis, unrealisedGain: round(gain),
    capitalGainsRateAssumed: capitalGainsRate, incomeTaxRateAssumed: incomeTaxRate,

    sameShares: {
      note: `Giving this ${'$'}${Math.round(marketValue).toLocaleString('en-US')} block of stock, two ways.`,
      sellThenDonate: {
        capitalGainsTax: round(capitalGainsTax),
        charityReceives: round(netProceeds),
        charitableDeduction: round(netProceeds),
        incomeTaxSaving: round(netProceeds * incomeTaxRate),
        netCostToYou: round(costIfSold),
      },
      donateShares: {
        capitalGainsTax: 0,
        charityReceives: round(marketValue),
        charitableDeduction: round(marketValue),
        incomeTaxSaving: round(marketValue * incomeTaxRate),
        netCostToYou: round(costIfGiven),
      },
      extraToCharity: round(marketValue - netProceeds),
      extraToCharityPercent: netProceeds > 0 ? round(((marketValue - netProceeds) / netProceeds) * 100, 1) : 0,
    },

    sameGift: {
      note: `Delivering ${'$'}${Math.round(marketValue).toLocaleString('en-US')} to the Foundation, two ways.`,
      giftToFoundation: round(marketValue),
      donateShares: {
        stockYouMustLiquidate: round(marketValue),
        capitalGainsTax: 0,
        netCostToYou: round(costIfGiven),
      },
      sellThenDonate: {
        stockYouMustLiquidate: round(stockRequiredIfSold),
        // The extra stock you must sell IS the capital-gains tax, exactly.
        capitalGainsTax: round(extraStockRequired),
        netCostToYou: round(costIfGiven + extraStockRequired),
      },
      extraStockRequired: round(extraStockRequired),
    },

    // The economically real number: tax nobody ever pays.
    capitalGainsTaxAvoided: round(capitalGainsTax),
    headline: gain > 0
      ? `Transferring the shares keeps ${'$'}${Math.round(capitalGainsTax).toLocaleString('en-US')} out of capital-gains tax — money that reaches the Foundation instead of the Treasury.`
      : 'These shares carry no unrealised gain, so there is no capital-gains advantage to transferring them rather than selling.',
    partner: PARTNERS.donatestock,
  };
}

/**
 * Mark-to-market valuation of every pledged securities gift.
 * Prices come from the security_prices table, which a scheduled job refreshes
 * from the market data provider; each row carries its own as-of timestamp.
 */
function securitiesValuation() {
  const rows = db.prepare(`
    SELECT pg.id, pg.sec_ticker ticker, pg.sec_shares_pledged shares, pg.sec_cost_basis basis,
           pg.sec_market_value booked, pg.npv, d.first_name, d.last_name, d.country
    FROM planned_gifts pg JOIN donors d ON d.id = pg.donor_id
    WHERE pg.gift_type = 'securities' AND pg.sec_ticker IS NOT NULL`).all();
  const priceOf = db.prepare('SELECT * FROM security_prices WHERE ticker = ?');

  let totalMarket = 0, totalBasis = 0, totalBooked = 0;
  const holdings = rows.map((r) => {
    const p = priceOf.get(r.ticker);
    const price = p ? p.last_price : (r.shares ? r.booked / r.shares : 0);
    const market = price * (r.shares || 0);
    const dayChange = p && p.prev_close ? (p.last_price - p.prev_close) * (r.shares || 0) : 0;
    totalMarket += market; totalBasis += r.basis || 0; totalBooked += r.booked || 0;
    return {
      id: r.id, ticker: r.ticker, name: p?.name || r.ticker,
      donor: `${r.first_name} ${r.last_name.charAt(0)}.`, country: r.country,
      shares: r.shares, lastPrice: round(price), asOf: p?.as_of || null,
      costBasis: round(r.basis || 0), marketValue: round(market),
      unrealisedGain: round(market - (r.basis || 0)),
      dayChange: round(dayChange),
      bookedValue: round(r.booked || 0),
      revaluation: round(market - (r.booked || 0)),
    };
  }).sort((a, b) => b.marketValue - a.marketValue);

  return {
    asOf: now(),
    holdings,
    totals: {
      positions: holdings.length,
      marketValue: round(totalMarket),
      costBasis: round(totalBasis),
      unrealisedGain: round(totalMarket - totalBasis),
      bookedValue: round(totalBooked),
      revaluation: round(totalMarket - totalBooked),
      capitalGainsAvoided: round((totalMarket - totalBasis) * 0.238),
    },
    partner: PARTNERS.donatestock,
  };
}

/**
 * Simulate a market tick. In production a scheduled job writes the same rows
 * from the market data feed; the schema and the read path are identical.
 */
function refreshSecurityPrices() {
  const rows = db.prepare('SELECT * FROM security_prices').all();
  const upd = db.prepare('UPDATE security_prices SET prev_close = last_price, last_price = ?, as_of = ? WHERE ticker = ?');
  const t = now();
  const tx = db.transaction(() => {
    for (const r of rows) {
      const drift = 1 + (Math.sin(Date.now() / 8.64e7 + r.ticker.charCodeAt(0)) * 0.004) + (Math.random() - 0.5) * 0.012;
      upd.run(Math.round(r.last_price * drift * 100) / 100, t, r.ticker);
    }
  });
  tx();
  return { updated: rows.length, asOf: t };
}

/* ────────────────────────── Life insurance module ─────────────────────────── */

const CARRIERS = [
  { name: 'Northwestern Mutual', newPolicy: true, minFace: 25000 },
  { name: 'New York Life', newPolicy: true, minFace: 25000 },
  { name: 'MassMutual', newPolicy: true, minFace: 50000 },
  { name: 'Allianz Life', newPolicy: true, minFace: 50000 },
  { name: 'Prudential Financial', newPolicy: true, minFace: 25000 },
  { name: 'Zurich Life', newPolicy: false, minFace: 100000 },
  { name: 'Aviva', newPolicy: false, minFace: 100000 },
];

/**
 * Illustrate a new charitable life insurance policy: a modest annual premium,
 * itself deductible when the Foundation owns the policy, becomes a large gift.
 */
function insuranceIllustration({ age, gender = 'Female', faceValue, ownership = 'foundation' }) {
  // Premium rate per $1,000 of face value, rising with issue age.
  const ratePer1000 = 2.4 + Math.max(0, age - 30) * 0.42 + (gender === 'Male' ? 0.6 : 0);
  const annualPremium = (faceValue / 1000) * ratePer1000;
  const le = actuarial.lifeExpectancy(age, gender);
  const totalPremiums = annualPremium * le;
  const s = actuarial.giftScenarios({ giftType: 'life_insurance', faceValue, age, gender });
  const deductible = ownership === 'foundation';

  return {
    age, gender, faceValue, ownership,
    annualPremium: round(annualPremium),
    monthlyPremium: round(annualPremium / 12),
    lifeExpectancy: le,
    totalPremiumsExpected: round(totalPremiums),
    leverage: round(faceValue / Math.max(1, totalPremiums), 2),
    presentValueToFoundation: s.base.npv,
    scenarios: { optimistic: s.optimistic.npv, base: s.base.npv, pessimistic: s.pessimistic.npv },
    premiumsDeductible: deductible,
    annualTaxSaving: deductible ? round(annualPremium * 0.37) : 0,
    netAnnualCost: deductible ? round(annualPremium * 0.63) : round(annualPremium),
    carriers: CARRIERS.filter((c) => c.newPolicy && faceValue >= c.minFace),
    note: deductible
      ? 'When the Foundation is both owner and beneficiary, each premium you pay is itself a deductible charitable gift.'
      : 'When you retain ownership and name the Foundation as beneficiary only, premiums are not deductible, but you keep the right to change the designation at any time.',
  };
}

/** Premium schedule and payment history for every insurance gift on file. */
function premiumSchedule() {
  const gifts = db.prepare(`
    SELECT pg.id, pg.li_policy_number, pg.li_insurer_name, pg.li_face_value,
           pg.li_annual_premium, pg.li_aolf_percentage, d.first_name, d.last_name, d.id donor_id
    FROM planned_gifts pg JOIN donors d ON d.id = pg.donor_id
    WHERE pg.gift_type = 'life_insurance'`).all();
  const prem = db.prepare(`SELECT status, COUNT(*) n, SUM(amount) v FROM policy_premiums
    WHERE planned_gift_id = ? GROUP BY status`);
  const next = db.prepare(`SELECT * FROM policy_premiums WHERE planned_gift_id = ?
    AND status = 'scheduled' ORDER BY due_date LIMIT 1`);

  const policies = gifts.map((g) => {
    const byStatus = Object.fromEntries(prem.all(g.id).map((r) => [r.status, r]));
    return {
      id: g.id, policyNumber: g.li_policy_number, insurer: g.li_insurer_name,
      donor: `${g.first_name} ${g.last_name}`, donorId: g.donor_id,
      faceValue: g.li_face_value, foundationShare: g.li_aolf_percentage,
      annualPremium: g.li_annual_premium,
      paid: { count: byStatus.paid?.n || 0, total: round(byStatus.paid?.v || 0) },
      missed: { count: byStatus.missed?.n || 0, total: round(byStatus.missed?.v || 0) },
      scheduled: { count: byStatus.scheduled?.n || 0, total: round(byStatus.scheduled?.v || 0) },
      nextDue: next.get(g.id)?.due_date || null,
      lapseRisk: (byStatus.missed?.n || 0) >= 2,
    };
  }).sort((a, b) => b.faceValue - a.faceValue);

  return {
    policies,
    totals: {
      count: policies.length,
      faceValue: round(policies.reduce((s, p) => s + (p.faceValue || 0), 0)),
      annualPremiums: round(policies.reduce((s, p) => s + (p.annualPremium || 0), 0)),
      premiumsPaid: round(policies.reduce((s, p) => s + p.paid.total, 0)),
      atLapseRisk: policies.filter((p) => p.lapseRisk).length,
    },
    carriers: CARRIERS,
  };
}

/* ─────────────────── Multi-state consultant network ───────────────────────── */

/** The Foundation's donor concentration, per the programme team. */
const PRIORITY_STATES = ['CA', 'WA', 'DC', 'NC', 'GA', 'FL', 'TX', 'AZ', 'NY', 'NJ'];

function consultantCoverage() {
  const consultants = db.prepare('SELECT * FROM consultants WHERE is_active = 1').all()
    .map((c) => ({
      ...c,
      licensed_states: JSON.parse(c.licensed_states || '[]'),
      specialties: JSON.parse(c.specialties || '[]'),
      capacity: c.max_concurrent_cases - c.current_case_count,
    }));
  // A firm with no listed states is a cross-border/referral specialist, not a
  // firm licensed in all fifty. Counting it as state coverage would overstate
  // the panel, so it is reported separately.
  const referralOnly = consultants.filter((c) => c.licensed_states.length === 0);
  const stateLicensed = consultants.filter((c) => c.licensed_states.length > 0);

  const coverage = PRIORITY_STATES.map((st) => {
    const firms = stateLicensed.filter((c) => c.licensed_states.includes(st));
    return {
      state: st,
      firms: firms.length,
      capacity: firms.reduce((s, c) => s + Math.max(0, c.capacity), 0),
      specialties: [...new Set(firms.flatMap((c) => c.specialties))],
      covered: firms.length > 0,
      redundant: firms.length > 1, // no single point of failure in this state
      names: firms.map((c) => `${c.first_name} ${c.last_name}${c.firm_name ? ` — ${c.firm_name}` : ''}`),
    };
  });

  return {
    priorityStates: PRIORITY_STATES,
    coverage,
    statesCovered: coverage.filter((c) => c.covered).length,
    statesWithRedundancy: coverage.filter((c) => c.redundant).length,
    totalStates: PRIORITY_STATES.length,
    consultants: consultants.map(({ password_hash, ...c }) => c),
    referralSpecialists: referralOnly.map((c) => ({
      name: `${c.first_name} ${c.last_name}`, firm: c.firm_name, specialties: c.specialties,
    })),
    model: 'Donor-engaged and donor-paid. The consultant contracts directly with the donor, so the Foundation never pays for advice given to its own donors and no conflict of interest arises. The Foundation is notified only of the final documentation and allocation.',
  };
}

/** The donor (or their adviser) returns the completed plan for tracking. */
function recordCaseDocumentation(caseId, body) {
  const c = db.prepare('SELECT * FROM complex_cases WHERE id = ?').get(caseId);
  if (!c) return null;
  const id = uuid();
  db.prepare(`INSERT INTO case_documents
    (id,case_id,document_type,allocation_amount,allocation_percent,instrument,consultant_firm,notes)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, caseId, body.documentType || 'other',
    body.allocationAmount != null ? Number(body.allocationAmount) : null,
    body.allocationPercent != null ? Number(body.allocationPercent) : null,
    body.instrument || null, body.consultantFirm || null, body.notes || null);
  db.prepare("UPDATE complex_cases SET status='docs_received', updated_at=? WHERE id=?").run(now(), caseId);
  return { ok: true, documentId: id, caseId, status: 'docs_received' };
}

const round = (n, p = 2) => Math.round((n || 0) * 10 ** p) / 10 ** p;

module.exports = {
  PARTNERS, CUSTODIAN_STEPS, CARRIERS, PRIORITY_STATES,
  iraProjection, stockComparison, securitiesValuation, refreshSecurityPrices,
  insuranceIllustration, premiumSchedule, consultantCoverage, recordCaseDocumentation,
};
