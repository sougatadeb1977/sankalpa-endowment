'use strict';
/**
 * SANKALPA - database seed.
 *
 * Builds a complete, internally consistent campaign history: chart of accounts,
 * funds, a globally distributed donor base, four years of gift transactions with
 * a matching balanced double-entry general ledger, a planned-gift pipeline, the
 * SSA mortality reference table and the campaign quote corpus.
 *
 * Idempotent: running it again on a populated database is a no-op unless
 * SANKALPA_RESEED=1 is set.
 */
const { db, uuid, postJournalEntry } = require('./db');
const actuarial = require('./actuarial');

// Deterministic PRNG so a rebuild reproduces the same campaign history.
let _s = 20260828;
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);
const iint = (lo, hi) => Math.floor(between(lo, hi + 1));
const dateStr = (d) => d.toISOString().slice(0, 10);

function seed() {
  const existing = db.prepare('SELECT COUNT(*) n FROM donors').get().n;
  if (existing > 0 && process.env.SANKALPA_RESEED !== '1') {
    return { skipped: true, donors: existing };
  }
  // Building the database posts thousands of journal entries, each of which is
  // its own transaction. At synchronous=NORMAL that is thousands of fsyncs and
  // the build takes minutes - long enough to look like a failed boot. Nothing
  // here needs crash durability, because a half-built demo database is thrown
  // away and rebuilt, so drop synchronous for the build and restore it after.
  db.pragma('synchronous = OFF');
  try {
    return buildSeed();
  } finally {
    db.pragma('synchronous = NORMAL');
    db.pragma('wal_checkpoint(TRUNCATE)');
  }
}

function buildSeed() {
  if (process.env.SANKALPA_RESEED === '1') {
    // Foreign keys are enforced in normal operation, so a straight table-by-table
    // teardown would abort on the first parent row that still has children. Drop
    // enforcement for the duration of the wipe and run it as one transaction, so
    // the rebuild is all-or-nothing rather than half-deleted.
    db.pragma('foreign_keys = OFF');
    try {
      const wipe = db.transaction(() => {
        for (const t of ['case_documents', 'policy_premiums', 'stewardship_tasks', 'interactions',
          'journal_lines', 'journal_entries', 'transactions', 'planned_gifts',
          'pledges', 'documents', 'complex_cases', 'consultants', 'donors', 'users',
          'accounts', 'funds', 'investments', 'fixed_assets', 'endowment_history',
          'security_prices', 'quotes', 'mortality_table', 'system_config',
          'ai_interactions', 'audit_log']) {
          db.exec(`DELETE FROM ${t}`);
        }
      });
      wipe();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  // ─────────────────────── system configuration ───────────────────────
  const cfgIns = db.prepare('INSERT OR REPLACE INTO system_config (key,value,effective_date) VALUES (?,?,?)');
  cfgIns.run('irs_7520_rate', '0.052', '2026-08-01');
  cfgIns.run('campaign_goal', '45000000', '2026-01-01');
  cfgIns.run('campaign_name', 'Sankalpa Endowment Campaign', '2026-01-01');
  cfgIns.run('foundation_ein', '95-4386417', '2026-01-01');
  cfgIns.run('spending_policy_rate', '0.045', '2026-01-01');

  // ─────────── SSA period life table (anchored interpolation) ─────────
  // Anchors drawn from the SSA Period Life Table shape; production systems
  // load the published table verbatim each January per SRS 3.6.1.
  const ANCHORS = {
    Male: [[0, 76.3], [20, 57.3], [40, 38.7], [50, 29.9], [60, 21.9], [65, 18.3],
      [70, 14.8], [75, 11.6], [80, 8.7], [85, 6.3], [90, 4.4], [95, 3.0], [100, 2.1], [110, 1.0]],
    Female: [[0, 81.2], [20, 62.1], [40, 42.8], [50, 33.6], [60, 25.1], [65, 21.0],
      [70, 17.1], [75, 13.4], [80, 10.1], [85, 7.3], [90, 5.1], [95, 3.4], [100, 2.3], [110, 1.0]],
  };
  const mIns = db.prepare('INSERT OR REPLACE INTO mortality_table (age,gender,life_expectancy) VALUES (?,?,?)');
  for (const [gender, pts] of Object.entries(ANCHORS)) {
    for (let age = 0; age <= 110; age++) {
      let le = pts[pts.length - 1][1];
      for (let i = 0; i < pts.length - 1; i++) {
        const [a1, v1] = pts[i], [a2, v2] = pts[i + 1];
        if (age >= a1 && age <= a2) { le = v1 + (v2 - v1) * (age - a1) / (a2 - a1); break; }
      }
      mIns.run(age, gender, Math.round(le * 10) / 10);
    }
  }
  // Non-binary / undisclosed donors use the blended table.
  for (let age = 0; age <= 110; age++) {
    const m = db.prepare('SELECT life_expectancy v FROM mortality_table WHERE age=? AND gender=?').get(age, 'Male').v;
    const f = db.prepare('SELECT life_expectancy v FROM mortality_table WHERE age=? AND gender=?').get(age, 'Female').v;
    mIns.run(age, 'Unspecified', Math.round(((m + f) / 2) * 10) / 10);
  }

  // ─────────────────────────── quote corpus ───────────────────────────
  // Sourced from gurudev.artofliving.org and the Foundation's published
  // material. Replace with the Foundation's full curated corpus before launch.
  const QUOTES = [
    ['Unless we have a stress-free mind and a violence-free society, we cannot achieve world peace.', 'peace'],
    ['My vision is a violence-free, stress-free society.', 'vision'],
    ['Peace starts within.', 'peace'],
    ['Love in action is service.', 'service'],
    ['Linking a one-world family.', 'unity'],
    ['Truth is spherical rather than linear; so it has to be contradictory.', 'wisdom'],
    ['When you are in love, there is no fear. Where there is fear, love disappears.', 'love'],
    ['The purpose of life is to be happy, and to make others happy.', 'joy'],
    ['A smile costs nothing but gives so much.', 'joy'],
    ['Every human being has the right to a violence-free, stress-free life.', 'vision'],
    ['Care for those around you. When you take care of others, nature takes care of you.', 'service'],
    ['Breath is the link between the body and the mind.', 'practice'],
  ];
  const qIns = db.prepare('INSERT INTO quotes (id,text,attribution,theme) VALUES (?,?,?,?)');
  QUOTES.forEach(([t, theme]) => qIns.run(uuid(), t, 'Gurudev Sri Sri Ravi Shankar', theme));

  // ──────────────────────────── funds ─────────────────────────────────
  const FUNDS = [
    ['END-GEN', 'General Endowment', 'endowment', 25000000, 1,
      'lives touched with stress-relief training', 10,
      '$10 reaches one more person with stress-relief training.',
      'The permanent corpus. Only the spending-policy distribution is ever used, so the principal serves in perpetuity.'],
    ['PRG-YTH', 'Youth Leadership Programs', 'restricted_purpose', 6000000, 0,
      'young people trained in leadership and resilience', 120,
      '$120 trains one young person in leadership and resilience.',
      'Youth Empowerment Seminars and leadership training in schools, universities and villages across 40 countries.'],
    ['PRG-VET', 'Veteran & Trauma Relief', 'restricted_purpose', 4500000, 0,
      'veterans and survivors given trauma relief', 350,
      '$350 gives one veteran or survivor a full course of trauma relief.',
      'Breath-based trauma relief for veterans, first responders and survivors of conflict and disaster.'],
    ['PRG-RUR', 'Rural Education & Development', 'restricted_purpose', 5500000, 0,
      'children given a full year of free schooling', 180,
      '$180 gives one rural child a full year of free schooling.',
      'Free schools, women\'s self-help groups, river rejuvenation and organic farming across rural India and Africa.'],
    ['PRG-DIS', 'Disaster Relief Reserve', 'restricted_purpose', 2500000, 0,
      'families reached with emergency relief', 75,
      '$75 reaches one family with emergency relief within 48 hours.',
      'A standing reserve so volunteer teams can deploy within 48 hours of an earthquake, flood or conflict displacement.'],
    ['GEN-MOST', 'Where Needed Most', 'operating', 1500000, 0,
      'lives touched across all programmes', 15,
      '$15 goes wherever the need is greatest that day.',
      'Unrestricted support - the most valuable gift of all, because it goes wherever the need is greatest today.'],
  ];
  const fIns = db.prepare(`INSERT INTO funds (id,fund_code,fund_name,fund_type,target_amount,
    is_endowment,impact_unit,impact_cost_per_unit,impact_line,blurb,historic_dollar_value)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const funds = FUNDS.map(([code, name, type, target, endow, unit, cost, line, blurb]) => {
    const id = uuid();
    fIns.run(id, code, name, type, target, endow, unit, cost, line, blurb, endow ? target * 0.4 : null);
    return { id, code, name, type, is_endowment: endow };
  });
  const fundBy = Object.fromEntries(funds.map((f) => [f.code, f]));

  // ─────────────── chart of accounts (SRS 3.4.1, verbatim) ────────────
  const COA = [
    ['1000', 'Cash and Cash Equivalents', 'asset', 'cash', null, 'debit'],
    ['1100', 'Short-Term Investments', 'asset', 'investment', null, 'debit'],
    ['1200', 'Pledges Receivable - Unconditional', 'asset', 'receivable', null, 'debit'],
    ['1201', 'Allowance for Uncollectible Pledges', 'asset', 'contra_receivable', null, 'credit'],
    ['1300', 'Long-Term Investments - Endowment', 'asset', 'investment', null, 'debit'],
    ['1400', 'Property and Equipment, Net', 'asset', 'fixed_asset', null, 'debit'],
    ['1500', 'Other Assets', 'asset', 'other', null, 'debit'],
    ['2000', 'Accounts Payable', 'liability', 'payable', null, 'credit'],
    ['2100', 'Accrued Liabilities', 'liability', 'accrual', null, 'credit'],
    ['2200', 'Deferred Revenue', 'liability', 'deferred', null, 'credit'],
    ['2300', 'CGA Obligations (Annuity Liability)', 'liability', 'annuity', null, 'credit'],
    ['2400', 'Loans Payable', 'liability', 'debt', null, 'credit'],
    ['3000', 'Net Assets Without Donor Restriction', 'equity', null, 'without_restriction', 'credit'],
    ['3100', 'Net Assets With Donor Restriction - Purpose', 'equity', null, 'with_restriction_purpose', 'credit'],
    ['3200', 'Net Assets With Donor Restriction - Perpetual', 'equity', null, 'with_restriction_perpetual', 'credit'],
    ['4000', 'Contributions - Without Restriction', 'revenue', 'contribution', 'without_restriction', 'credit'],
    ['4100', 'Contributions - With Purpose Restriction', 'revenue', 'contribution', 'with_restriction_purpose', 'credit'],
    ['4200', 'Contributions - Endowment (Perpetual)', 'revenue', 'contribution', 'with_restriction_perpetual', 'credit'],
    ['4300', 'Investment Income - Unrestricted', 'revenue', 'investment_income', 'without_restriction', 'credit'],
    ['4400', 'Investment Income - Restricted', 'revenue', 'investment_income', 'with_restriction_purpose', 'credit'],
    ['4500', 'Realized & Unrealized Investment Gains', 'revenue', 'investment_gain', 'without_restriction', 'credit'],
    ['4600', 'Net Assets Released from Restriction', 'revenue', 'reclassification', null, 'credit'],
    ['5000', 'Program Services Expense', 'expense', 'program', null, 'debit'],
    ['5100', 'Management & General Expense', 'expense', 'admin', null, 'debit'],
    ['5200', 'Fundraising Expense', 'expense', 'fundraising', null, 'debit'],
    ['5300', 'Depreciation Expense', 'expense', 'depreciation', null, 'debit'],
    ['5400', 'Payment Processing Fees', 'expense', 'admin', null, 'debit'],
    ['5500', 'Actuarial Adjustment - Annuity Obligations', 'expense', 'actuarial', null, 'debit'],
  ];
  const aIns = db.prepare(`INSERT INTO accounts (id,account_code,account_name,account_type,
    account_subtype,net_asset_class,normal_balance) VALUES (?,?,?,?,?,?,?)`);
  const acct = {};
  COA.forEach(([code, name, type, sub, nac, nb]) => {
    const id = uuid(); aIns.run(id, code, name, type, sub, nac, nb); acct[code] = id;
  });

  // ──────────────────────────── staff users ───────────────────────────
  const crypto = require('crypto');
  const hash = (pw) => crypto.scryptSync(pw, 'sankalpa-static-salt', 32).toString('hex');
  const STAFF = [
    ['director@sankalpa.org', 'super_admin', 'Ananya Krishnan', 'Director of Advancement'],
    ['finance@sankalpa.org', 'finance_director', 'Marcus Lindqvist', 'Finance Director'],
    ['accountant@sankalpa.org', 'accountant', 'Priya Raghavan', 'Senior Fund Accountant'],
    ['gifts@sankalpa.org', 'dev_officer', 'Thomas Auberjonois', 'Major Gifts Officer'],
    ['legal@sankalpa.org', 'legal_counsel', 'Elena Marchetti', 'Counsel, Planned Giving'],
    ['board@sankalpa.org', 'board_member', 'Dr. Ravi Menon', 'Board Treasurer'],
    ['auditor@sankalpa.org', 'auditor', 'Sofia Bergström', 'External Auditor'],
  ];
  const uIns = db.prepare(`INSERT INTO users (id,email,password_hash,role,display_name,
    is_email_verified,mfa_totp_secret,created_at) VALUES (?,?,?,?,?,1,?,datetime('now'))`);
  const staff = STAFF.map(([email, role, name]) => {
    const id = uuid();
    uIns.run(id, email, hash('Sankalpa2026!'), role, name, crypto.randomBytes(10).toString('hex'));
    return { id, email, role, name };
  });
  const devOfficer = staff.find((s) => s.role === 'dev_officer');
  const financeDir = staff.find((s) => s.role === 'finance_director');

  // ──────────────────────── global donor base ─────────────────────────
  const GEO = [
    ['US', 'United States', ['New York', 'Los Angeles', 'Chicago', 'Austin', 'Seattle', 'Boston', 'Pasadena', 'Miami'], ['NY', 'CA', 'IL', 'TX', 'WA', 'MA', 'CA', 'FL'], 0.30],
    ['IN', 'India', ['Bengaluru', 'Mumbai', 'Delhi', 'Pune', 'Chennai', 'Hyderabad'], ['KA', 'MH', 'DL', 'MH', 'TN', 'TG'], 0.14],
    ['DE', 'Germany', ['Berlin', 'Munich', 'Hamburg', 'Frankfurt'], ['BE', 'BY', 'HH', 'HE'], 0.08],
    ['GB', 'United Kingdom', ['London', 'Manchester', 'Edinburgh', 'Bristol'], ['LND', 'MAN', 'EDH', 'BST'], 0.07],
    ['CA', 'Canada', ['Toronto', 'Vancouver', 'Montreal'], ['ON', 'BC', 'QC'], 0.05],
    ['FR', 'France', ['Paris', 'Lyon', 'Bordeaux'], ['IDF', 'ARA', 'NAQ'], 0.05],
    ['CH', 'Switzerland', ['Zurich', 'Geneva', 'Basel'], ['ZH', 'GE', 'BS'], 0.04],
    ['AU', 'Australia', ['Sydney', 'Melbourne', 'Brisbane'], ['NSW', 'VIC', 'QLD'], 0.04],
    ['NL', 'Netherlands', ['Amsterdam', 'Rotterdam', 'Utrecht'], ['NH', 'ZH', 'UT'], 0.03],
    ['SE', 'Sweden', ['Stockholm', 'Gothenburg'], ['AB', 'O'], 0.03],
    ['SG', 'Singapore', ['Singapore'], ['SG'], 0.03],
    ['BR', 'Brazil', ['Sao Paulo', 'Rio de Janeiro'], ['SP', 'RJ'], 0.03],
    ['AE', 'United Arab Emirates', ['Dubai', 'Abu Dhabi'], ['DU', 'AZ'], 0.02],
    ['IT', 'Italy', ['Milan', 'Rome'], ['MI', 'RM'], 0.02],
    ['ES', 'Spain', ['Madrid', 'Barcelona'], ['M', 'B'], 0.02],
    ['JP', 'Japan', ['Tokyo', 'Osaka'], ['13', '27'], 0.02],
    ['ZA', 'South Africa', ['Cape Town', 'Johannesburg'], ['WC', 'GP'], 0.015],
    ['MX', 'Mexico', ['Mexico City', 'Guadalajara'], ['CMX', 'JAL'], 0.015],
    ['KE', 'Kenya', ['Nairobi'], ['30'], 0.01],
    ['NO', 'Norway', ['Oslo'], ['03'], 0.01],
  ];
  const FIRST = ['Ananya', 'Michael', 'Priya', 'Sophie', 'Rajesh', 'Elena', 'David', 'Meera',
    'Lars', 'Aisha', 'Thomas', 'Kavita', 'Isabella', 'Arjun', 'Margarethe', 'Chen',
    'Fatima', 'Henrik', 'Lakshmi', 'Pierre', 'Yuki', 'Sanjay', 'Clara', 'Vikram',
    'Anneke', 'Daniel', 'Shreya', 'Giovanni', 'Nadia', 'Robert', 'Deepa', 'Anders',
    'Maria', 'Sunil', 'Charlotte', 'Ramesh', 'Ingrid', 'Ahmed', 'Julia', 'Krishna',
    'Beatrix', 'Nikhil', 'Camille', 'Rohan', 'Astrid', 'Joseph', 'Anjali', 'Marco',
    'Hana', 'Vivek'];
  const LAST = ['Krishnan', 'Andersson', 'Sharma', 'Dubois', 'Müller', 'O\'Brien', 'Nakamura',
    'Iyer', 'van der Berg', 'Rossi', 'Chen', 'Okonkwo', 'Lindqvist', 'Patel', 'Schneider',
    'Marchetti', 'Silva', 'Kowalski', 'Reddy', 'Bergström', 'Fernandez', 'Whitfield',
    'Nair', 'Hoffmann', 'Dubois', 'Menon', 'Larsen', 'Kaur', 'Bianchi', 'Novak',
    'Desai', 'Haugen', 'Costa', 'Bhatt', 'Weber', 'Joshi', 'Almeida', 'Verma',
    'Petrov', 'Lehmann', 'Gupta', 'Moreau', 'Tanaka', 'Rao', 'Eriksson', 'Mehta',
    'Dupont', 'Banerjee', 'Klein', 'Pillai'];
  const RELATIONSHIP = ['student', 'teacher', 'volunteer', 'supporter', 'other'];
  const TAGS = ['sudarshan-kriya', 'silence-retreat', 'volunteer', 'teacher-training',
    'world-culture-festival', 'prison-program', 'youth-leadership', 'ashram-visitor',
    'monthly-donor', 'major-donor', 'corporate-match'];

  const dIns = db.prepare(`INSERT INTO donors (id,first_name,last_name,email,phone,street_address,
    city,state,zip_code,country,date_of_birth,gender,health_status,relationship_to_aolf,
    pref_comm_method,crm_tags,is_legacy_society,notes,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const donors = [];
  const N_DONORS = 420;
  const cum = [];
  let acc = 0;
  for (const g of GEO) { acc += g[4]; cum.push([acc, g]); }
  for (let i = 0; i < N_DONORS; i++) {
    const r = rnd() * acc;
    const geo = (cum.find(([c]) => r <= c) || cum[cum.length - 1])[1];
    const [cc, , cities, states] = geo;
    const ci = iint(0, cities.length - 1);
    const first = pick(FIRST), last = pick(LAST);
    const gender = rnd() < 0.56 ? 'Female' : rnd() < 0.95 ? 'Male' : 'Unspecified';
    const age = rnd() < 0.42 ? iint(58, 84) : iint(29, 57);
    const dob = new Date(Date.now() - age * 365.25 * 86400000 - iint(0, 364) * 86400000);
    const tagCount = iint(0, 3);
    const tags = [];
    for (let k = 0; k < tagCount; k++) { const t = pick(TAGS); if (!tags.includes(t)) tags.push(t); }
    const id = uuid();
    const created = new Date(Date.now() - iint(30, 1500) * 86400000);
    dIns.run(id, first, last,
      `${first.toLowerCase().replace(/[^a-z]/g, '')}.${last.toLowerCase().replace(/[^a-z]/g, '')}${i}@example.org`,
      `+${iint(1, 99)}${iint(1000000000, 9999999999)}`,
      `${iint(1, 999)} ${pick(['Lotus', 'Cedar', 'Rue de la Paix', 'Hauptstrasse', 'Ashram', 'Maple', 'Harmony', 'Kensington'])} ${pick(['Street', 'Avenue', 'Road', 'Lane', 'Weg'])}`,
      cities[ci], states[ci] || '', String(iint(10000, 99999)), cc,
      dateStr(dob), gender, rnd() < 0.25 ? 'Excellent' : rnd() < 0.85 ? 'Average' : 'Below Average',
      pick(RELATIONSHIP), rnd() < 0.8 ? 'email' : pick(['sms', 'mail']),
      JSON.stringify(tags), 0, null, created.toISOString());
    donors.push({ id, first, last, country: cc, age, gender, created });
  }

  // ─────────── transactions + matching double-entry journal ───────────
  const METHODS = [
    ['card', 0.42], ['ach', 0.10], ['paypal', 0.10], ['apple_pay', 0.07], ['google_pay', 0.05],
    ['check', 0.06], ['daf', 0.06], ['stock', 0.04], ['crypto', 0.035], ['venmo', 0.03],
    ['wire', 0.02], ['gofundme', 0.015],
  ];
  const methodCum = [];
  let ma = 0;
  for (const [m, w] of METHODS) { ma += w; methodCum.push([ma, m]); }
  const pickMethod = () => { const r = rnd() * ma; return (methodCum.find(([c]) => r <= c) || methodCum[0])[1]; };

  // Gifts land on funds in proportion to each fund's campaign target, so the
  // general endowment (the largest target) receives the largest share.
  const fundCum = [];
  let fa = 0;
  FUNDS.forEach(([code, , , target], i) => { fa += target; fundCum.push([fa, funds[i]]); });
  const pickFund = () => { const r = rnd() * fa; return (fundCum.find(([c]) => r <= c) || fundCum[0])[1]; };

  const tIns = db.prepare(`INSERT INTO transactions (id,donor_id,transaction_date,amount,currency,
    payment_method,payment_reference,fund_id,status,is_recurring,recurring_frequency,
    tribute_type,tribute_name,receipt_sent,receipt_sent_at,journal_entry_id,
    acknowledgment_sent,source_channel,country,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const revenueAccountFor = (fund) => fund.is_endowment ? '4200'
    : fund.type === 'operating' ? '4000' : '4100';

  let txCount = 0;
  const donorTotals = new Map();
  const START = new Date('2021-01-04').getTime();   // six fiscal years of history
  const SPAN = Date.now() - START;

  for (const d of donors) {
    const isMajor = rnd() < 0.085;
    const isRecurring = rnd() < 0.28;
    const n = isRecurring ? iint(8, 46) : isMajor ? iint(2, 8) : iint(1, 5);
    const firstGift = START + rnd() * SPAN * 0.7;
    for (let k = 0; k < n; k++) {
      const when = isRecurring
        ? new Date(firstGift + k * 30.4 * 86400000)
        : new Date(firstGift + rnd() * (Date.now() - firstGift));
      if (when.getTime() > Date.now()) continue;
      let amount;
      if (isMajor) amount = Math.round(between(2500, 60000) / 500) * 500;
      else if (isRecurring) amount = pick([25, 50, 75, 100, 108, 150, 250, 500]);
      else amount = pick([25, 50, 100, 108, 250, 500, 1000, 1500, 2500, 5000]);

      const fund = pickFund();
      const method = pickMethod();
      const status = rnd() < 0.975 ? 'completed' : rnd() < 0.6 ? 'pending' : 'failed';
      const txId = uuid();
      const tribute = rnd() < 0.09;

      let jeId = null;
      if (status === 'completed') {
        const fee = ['card', 'apple_pay', 'google_pay', 'paypal', 'venmo', 'gofundme'].includes(method)
          ? Math.round(amount * 0.022 * 100) / 100 + 0.30 : 0;
        const lines = [
          { account_id: acct['1000'], fund_id: fund.id, debit_amount: round2(amount - fee), donor_id: d.id, description: 'Cash received, net of processing' },
          { account_id: acct[revenueAccountFor(fund)], fund_id: fund.id, credit_amount: amount, donor_id: d.id, description: `Contribution - ${fund.name}` },
        ];
        if (fee > 0) lines.splice(1, 0, { account_id: acct['5400'], fund_id: fund.id, debit_amount: round2(fee), description: `${method} processing fee` });
        jeId = postJournalEntry({
          entry_date: dateStr(when),
          description: `Gift received - ${d.first} ${d.last} - ${fund.fund_code || fund.code}`,
          reference_number: `GIFT-${txId.slice(0, 8).toUpperCase()}`,
          entry_type: 'automated', status: 'posted',
          posted_by: financeDir.id, created_by: financeDir.id,
        }, lines);
        donorTotals.set(d.id, (donorTotals.get(d.id) || 0) + amount);
      }

      tIns.run(txId, d.id, dateStr(when), amount, 'USD', method,
        `${method}_${txId.slice(0, 12)}`, fund.id, status,
        isRecurring ? 1 : 0, isRecurring ? 'monthly' : null,
        tribute ? pick(['honor', 'memory']) : null,
        tribute ? `${pick(FIRST)} ${pick(LAST)}` : null,
        status === 'completed' ? 1 : 0,
        status === 'completed' ? when.toISOString() : null,
        jeId, status === 'completed' && amount >= 1000 ? 1 : 0,
        pick(['web', 'web', 'web', 'mobile', 'event', 'mail']), d.country,
        when.toISOString());
      txCount++;
    }
  }

  // Roll donor denormalised totals (SRS 6.2 trigger contract).
  const updDonor = db.prepare(`UPDATE donors SET total_donated=?,
    first_gift_date=(SELECT MIN(transaction_date) FROM transactions WHERE donor_id=? AND status='completed'),
    last_gift_date=(SELECT MAX(transaction_date) FROM transactions WHERE donor_id=? AND status='completed')
    WHERE id=?`);
  for (const d of donors) {
    const t = donorTotals.get(d.id) || 0;
    updDonor.run(round2(t), d.id, d.id, d.id);
  }
  db.exec(`UPDATE funds SET current_balance = COALESCE(
    (SELECT SUM(amount) FROM transactions t WHERE t.fund_id = funds.id AND t.status='completed'), 0)`);

  // ─────────────── planned gifts, pledges and documents ───────────────
  const GIFT_TYPES = ['will_bequest', 'will_bequest', 'will_bequest', 'ira_401k', 'ira_401k',
    'life_insurance', 'securities', 'crt', 'cga', 'real_estate', 'complex'];
  const INSURERS = ['Northwestern Mutual', 'New York Life', 'MassMutual', 'Allianz Life',
    'Zurich Life', 'Prudential Financial', 'Aviva'];
  const CUSTODIANS = ['Fidelity Investments', 'Vanguard', 'Charles Schwab', 'UBS',
    'Julius Baer', 'Merrill Lynch', 'BNP Paribas Wealth'];
  const TICKERS = ['AAPL', 'MSFT', 'BRK.B', 'JNJ', 'NVDA', 'UNH', 'V', 'PG', 'XOM', 'ASML'];

  const pgIns = db.prepare(`INSERT INTO planned_gifts (id,donor_id,pledge_id,gift_type,
    li_policy_number,li_insurer_name,li_face_value,li_cash_surrender_val,li_annual_premium,li_aolf_percentage,
    ira_institution,ira_account_value,ira_aolf_percentage,ira_growth_rate,
    sec_ticker,sec_shares_pledged,sec_cost_basis,sec_market_value,
    re_description,re_appraised_value,bequest_type,bequest_amount,bequest_percentage,
    crt_trust_name,crt_trustee_name,crt_asset_value,crt_payout_rate,crt_type,crt_term_years,
    cga_original_gift,cga_acga_rate,cga_annual_payment,cga_payout_frequency,cga_actuarial_reserve,
    ai_extracted,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const plIns = db.prepare(`INSERT INTO pledges (id,donor_id,pledge_type,status,face_value,fund_id,
    restriction_type,commitment_date,expected_receipt_date,notes,assigned_dev_officer,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const docIns = db.prepare(`INSERT INTO documents (id,donor_id,folder,file_name,file_size_bytes,
    mime_type,storage_key,parse_status,parse_confidence_min,uploaded_by_user_id,description,tags,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  // Older, more engaged donors are far likelier to make a planned gift.
  const candidates = donors
    .filter((d) => d.age >= 50)
    .sort((a, b) => (donorTotals.get(b.id) || 0) - (donorTotals.get(a.id) || 0));
  const plannedDonors = candidates.slice(0, 105);

  for (const d of plannedDonors) {
    const type = pick(GIFT_TYPES);
    const pgId = uuid();
    const commitDate = new Date(Date.now() - iint(20, 1200) * 86400000);
    let face = 0;
    const v = {
      li_policy_number: null, li_insurer_name: null, li_face_value: null,
      li_cash_surrender_val: null, li_annual_premium: null, li_aolf_percentage: null,
      ira_institution: null, ira_account_value: null, ira_aolf_percentage: null, ira_growth_rate: null,
      sec_ticker: null, sec_shares_pledged: null, sec_cost_basis: null, sec_market_value: null,
      re_description: null, re_appraised_value: null,
      bequest_type: null, bequest_amount: null, bequest_percentage: null,
      crt_trust_name: null, crt_trustee_name: null, crt_asset_value: null,
      crt_payout_rate: null, crt_type: null, crt_term_years: null,
      cga_original_gift: null, cga_acga_rate: null, cga_annual_payment: null,
      cga_payout_frequency: null, cga_actuarial_reserve: null,
    };

    switch (type) {
      case 'life_insurance': {
        face = Math.round(between(50000, 700000) / 5000) * 5000;
        Object.assign(v, {
          li_policy_number: `POL-${iint(100000, 999999)}`, li_insurer_name: pick(INSURERS),
          li_face_value: face, li_cash_surrender_val: round2(face * between(0.08, 0.3)),
          li_annual_premium: round2(face * between(0.008, 0.02)),
          li_aolf_percentage: pick([100, 100, 50, 25]),
        });
        face *= (v.li_aolf_percentage / 100);
        break;
      }
      case 'ira_401k': {
        const val = Math.round(between(80000, 1100000) / 5000) * 5000;
        const pctA = pick([100, 50, 25, 10]);
        Object.assign(v, {
          ira_institution: pick(CUSTODIANS), ira_account_value: val,
          ira_aolf_percentage: pctA, ira_growth_rate: 0.105,
        });
        face = val * pctA / 100;
        break;
      }
      case 'securities': {
        const shares = Math.round(between(150, 3200));
        const price = between(60, 480);
        Object.assign(v, {
          sec_ticker: pick(TICKERS), sec_shares_pledged: shares,
          sec_cost_basis: round2(shares * price * between(0.2, 0.6)),
          sec_market_value: round2(shares * price),
        });
        face = v.sec_market_value;
        break;
      }
      case 'real_estate': {
        face = Math.round(between(200000, 1400000) / 10000) * 10000;
        Object.assign(v, {
          re_description: `${pick(['Residential property', 'Commercial building', 'Farmland parcel', 'Vacation home'])} in ${pick(['Napa Valley', 'Provence', 'Kerala', 'Tuscany', 'Bavaria', 'Colorado'])}`,
          re_appraised_value: face,
        });
        break;
      }
      case 'crt': {
        const av = Math.round(between(300000, 2200000) / 10000) * 10000;
        Object.assign(v, {
          crt_trust_name: `The ${d.last} Charitable Remainder Trust`,
          crt_trustee_name: pick(['Northern Trust', 'Bessemer Trust', 'UBS Trustees', 'Fiduciary Trust']),
          crt_asset_value: av, crt_payout_rate: round4(between(0.05, 0.08)),
          crt_type: rnd() < 0.65 ? 'CRUT' : 'CRAT',
          crt_term_years: rnd() < 0.5 ? iint(3, 15) : null,
        });
        face = av;
        break;
      }
      case 'cga': {
        const gift = Math.round(between(25000, 320000) / 5000) * 5000;
        const rate = actuarial.acgaRate(d.age);
        Object.assign(v, {
          cga_original_gift: gift, cga_acga_rate: round4(rate),
          cga_annual_payment: round2(gift * rate), cga_payout_frequency: 'quarterly',
          cga_actuarial_reserve: round2(gift * between(0.45, 0.65)),
        });
        face = gift;
        break;
      }
      default: {
        const usePct = rnd() < 0.45;
        const est = Math.round(between(50000, 1800000) / 5000) * 5000;
        Object.assign(v, {
          bequest_type: usePct ? 'percentage' : 'specific',
          bequest_amount: est,
          bequest_percentage: usePct ? pick([5, 10, 15, 20, 25, 50]) : null,
        });
        face = est;
      }
    }

    const fund = rnd() < 0.62 ? fundBy['END-GEN'] : pickFund();
    const revocable = ['will_bequest', 'ira_401k', 'life_insurance'].includes(type) && rnd() < 0.75;
    const plId = uuid();
    plIns.run(plId, d.id,
      type === 'will_bequest' ? (revocable ? 'bequest_revocable' : 'bequest_irrevocable') : type,
      pick(['committed', 'committed', 'active', 'active', 'prospect']),
      round2(face), fund.id,
      fund.is_endowment ? 'endowment' : 'purpose_restricted',
      dateStr(commitDate), null,
      `Documented ${dateStr(commitDate)}. ${revocable ? 'Revocable intention - pipeline only, not recognised as revenue.' : 'Irrevocable commitment.'}`,
      devOfficer.id, commitDate.toISOString());

    pgIns.run(pgId, d.id, plId, type,
      v.li_policy_number, v.li_insurer_name, v.li_face_value, v.li_cash_surrender_val,
      v.li_annual_premium, v.li_aolf_percentage,
      v.ira_institution, v.ira_account_value, v.ira_aolf_percentage, v.ira_growth_rate,
      v.sec_ticker, v.sec_shares_pledged, v.sec_cost_basis, v.sec_market_value,
      v.re_description, v.re_appraised_value,
      v.bequest_type, v.bequest_amount, v.bequest_percentage,
      v.crt_trust_name, v.crt_trustee_name, v.crt_asset_value, v.crt_payout_rate,
      v.crt_type, v.crt_term_years,
      v.cga_original_gift, v.cga_acga_rate, v.cga_annual_payment, v.cga_payout_frequency,
      v.cga_actuarial_reserve,
      rnd() < 0.45 ? 1 : 0, commitDate.toISOString());

    db.prepare('UPDATE donors SET is_legacy_society=1 WHERE id=?').run(d.id);

    if (rnd() < 0.6) {
      const folder = { will_bequest: 'wills_trusts', crt: 'wills_trusts', life_insurance: 'insurance',
        ira_401k: 'retirement', securities: 'tax', cga: 'wills_trusts' }[type] || 'other';
      const parsed = rnd();
      docIns.run(uuid(), d.id, folder,
        `${d.last}_${type}_${commitDate.getFullYear()}.pdf`,
        iint(180000, 4200000), 'application/pdf', `vault/${d.id}/${uuid()}.pdf`,
        parsed < 0.65 ? 'completed' : parsed < 0.85 ? 'needs_review' : 'not_parsed',
        parsed < 0.65 ? round4(between(0.90, 0.99)) : parsed < 0.85 ? round4(between(0.62, 0.89)) : null,
        devOfficer.id, `${type.replace(/_/g, ' ')} documentation`, '["estate","verified"]',
        commitDate.toISOString());
    }
  }

  actuarial.recalculateAllNpv();

  // ══════════════════ operating ledger ══════════════════
  // A fund accounting system that only ever records contributions is not a
  // fund accounting system. These are the entries every nonprofit actually
  // posts: payroll and programme costs, investment income, realised gains,
  // the endowment spending distribution, depreciation, and multi-year pledges
  // recognised as receivables. They give the statement of activities a real
  // functional-expense split and make year-on-year comparison meaningful.
  const A = (code) => acct[code];
  const monthsBetween = (from, to) => {
    const out = [];
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    while (d <= to) {
      out.push(new Date(d));
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return out;
  };
  const months = monthsBetween(new Date(START), new Date());
  const endOfMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));

  // Contributions actually received each month drive the operating budget.
  const monthlyIncome = db.prepare(`SELECT substr(transaction_date,1,7) m, SUM(amount) v
    FROM transactions WHERE status='completed' GROUP BY m`).all()
    .reduce((acc, r) => { acc[r.m] = r.v; return acc; }, {});

  const opFund = fundBy['GEN-MOST'];
  const endFund = fundBy['END-GEN'];
  let opEntries = 0;

  months.forEach((m, idx) => {
    const key = m.toISOString().slice(0, 7);
    const income = monthlyIncome[key] || 0;
    if (income <= 0) return;
    const eom = endOfMonth(m);
    if (eom > new Date()) return;

    // Spend roughly 62-72% of what came in, split on nonprofit functional lines.
    const spend = income * between(0.62, 0.72);
    const program = round2(spend * between(0.74, 0.80));
    const admin = round2(spend * between(0.09, 0.12));
    const fundraising = round2(spend - program - admin);
    if (program <= 0 || admin <= 0 || fundraising <= 0) return;

    postJournalEntry({
      entry_date: dateStr(eom),
      description: `Monthly operating expenses - ${key}`,
      reference_number: `OPEX-${key}`,
      entry_type: 'automated', status: 'posted',
      posted_by: financeDir.id, created_by: financeDir.id,
    }, [
      { account_id: A('5000'), fund_id: opFund.id, debit_amount: program, description: 'Programme services' },
      { account_id: A('5100'), fund_id: opFund.id, debit_amount: admin, description: 'Management and general' },
      { account_id: A('5200'), fund_id: opFund.id, debit_amount: fundraising, description: 'Fundraising' },
      { account_id: A('1000'), fund_id: opFund.id, credit_amount: round2(program + admin + fundraising), description: 'Cash disbursed' },
    ]);
    opEntries++;

    // Quarter-end: sweep new endowment gifts into the investment pool, then
    // record income, market movement and the spending distribution.
    if ((m.getUTCMonth() + 1) % 3 === 0) {
      const qStart = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 2, 1));
      const newCorpus = db.prepare(`SELECT COALESCE(SUM(t.amount),0) v FROM transactions t
        JOIN funds f ON f.id=t.fund_id
        WHERE f.is_endowment=1 AND t.status='completed'
          AND t.transaction_date >= ? AND t.transaction_date <= ?`)
        .get(dateStr(qStart), dateStr(eom)).v;
      if (newCorpus > 0) {
        postJournalEntry({
          entry_date: dateStr(eom),
          description: `Endowment gifts swept to the investment pool - ${key}`,
          reference_number: `SWEEP-${key}`, entry_type: 'automated', status: 'posted',
          posted_by: financeDir.id, created_by: financeDir.id,
        }, [
          { account_id: A('1300'), fund_id: endFund.id, debit_amount: round2(newCorpus), description: 'Invested per the investment policy' },
          { account_id: A('1000'), fund_id: endFund.id, credit_amount: round2(newCorpus), description: 'Cash transferred to investments' },
        ]);
        opEntries++;
      }

      const corpusToDate = db.prepare(`SELECT COALESCE(SUM(t.amount),0) v FROM transactions t
        JOIN funds f ON f.id=t.fund_id
        WHERE f.is_endowment=1 AND t.status='completed' AND t.transaction_date <= ?`).get(dateStr(eom)).v;
      if (corpusToDate > 50000) {
        const income4 = round2(corpusToDate * between(0.0045, 0.0075));
        const gain = round2(corpusToDate * between(-0.012, 0.032));
        const distribution = round2(corpusToDate * 0.045 / 4);

        postJournalEntry({
          entry_date: dateStr(eom),
          description: `Endowment investment income - ${key}`,
          reference_number: `INV-${key}`, entry_type: 'automated', status: 'posted',
          posted_by: financeDir.id, created_by: financeDir.id,
        }, [
          { account_id: A('1300'), fund_id: endFund.id, debit_amount: income4, description: 'Interest and dividends reinvested' },
          { account_id: A('4400'), fund_id: endFund.id, credit_amount: income4, description: 'Investment income - restricted' },
        ]);
        opEntries++;

        if (gain > 0) {
          postJournalEntry({
            entry_date: dateStr(eom),
            description: `Unrealised market appreciation - ${key}`,
            reference_number: `MKT-${key}`, entry_type: 'automated', status: 'posted',
            posted_by: financeDir.id, created_by: financeDir.id,
          }, [
            { account_id: A('1300'), fund_id: endFund.id, debit_amount: gain, description: 'Change in fair value' },
            { account_id: A('4500'), fund_id: endFund.id, credit_amount: gain, description: 'Realised and unrealised gains' },
          ]);
          opEntries++;
        } else if (gain < 0) {
          postJournalEntry({
            entry_date: dateStr(eom),
            description: `Unrealised market depreciation - ${key}`,
            reference_number: `MKT-${key}`, entry_type: 'automated', status: 'posted',
            posted_by: financeDir.id, created_by: financeDir.id,
          }, [
            { account_id: A('4500'), fund_id: endFund.id, debit_amount: round2(-gain), description: 'Realised and unrealised losses' },
            { account_id: A('1300'), fund_id: endFund.id, credit_amount: round2(-gain), description: 'Change in fair value' },
          ]);
          opEntries++;
        }

        // UPMIFA spending policy: 4.5% a year, drawn quarterly into cash.
        postJournalEntry({
          entry_date: dateStr(eom),
          description: `Endowment spending distribution (4.5% policy) - ${key}`,
          reference_number: `DIST-${key}`, entry_type: 'automated', status: 'posted',
          posted_by: financeDir.id, created_by: financeDir.id,
        }, [
          { account_id: A('1000'), fund_id: opFund.id, debit_amount: distribution, description: 'Distribution to operations' },
          { account_id: A('1300'), fund_id: endFund.id, credit_amount: distribution, description: 'Drawn from endowment investments' },
        ]);
        opEntries++;
      }
    }

    // Year-end: depreciation on the fixed asset register.
    if (m.getUTCMonth() === 11) {
      const dep = db.prepare("SELECT COALESCE(SUM((acquisition_cost - salvage_value)/useful_life_years),0) v FROM fixed_assets WHERE acquisition_date <= ?").get(dateStr(eom)).v;
      if (dep > 0) {
        postJournalEntry({
          entry_date: dateStr(eom),
          description: `Annual depreciation - ${m.getUTCFullYear()}`,
          reference_number: `DEP-${m.getUTCFullYear()}`, entry_type: 'automated', status: 'posted',
          posted_by: financeDir.id, created_by: financeDir.id,
        }, [
          { account_id: A('5300'), fund_id: opFund.id, debit_amount: round2(dep), description: 'Depreciation expense' },
          { account_id: A('1400'), fund_id: opFund.id, credit_amount: round2(dep), description: 'Accumulated depreciation' },
        ]);
        opEntries++;
      }
    }
  });

  // Multi-year pledges recognised as receivables, then collected in instalments.
  const pledgeDonors = donors.filter((_, i) => i % 17 === 0).slice(0, 24);
  for (const d of pledgeDonors) {
    const total = Math.round(between(25000, 250000) / 5000) * 5000;
    const years = iint(3, 5);
    const perYear = round2(total / years);
    const start = new Date(START + rnd() * (Date.now() - START) * 0.4);
    const plId = uuid();
    plIns.run(plId, d.id, 'multi_year_installment', 'active', total, endFund.id, 'endowment',
      dateStr(start), null, `${years}-year pledge, ${'$'}${perYear.toLocaleString('en-US')} annually.`,
      devOfficer.id, start.toISOString());

    postJournalEntry({
      entry_date: dateStr(start),
      description: `Unconditional pledge recognised - ${d.first} ${d.last}`,
      reference_number: `PLG-${plId.slice(0, 8).toUpperCase()}`,
      entry_type: 'automated', status: 'posted',
      posted_by: financeDir.id, created_by: financeDir.id,
    }, [
      { account_id: A('1200'), fund_id: endFund.id, debit_amount: total, donor_id: d.id, description: 'Pledges receivable' },
      { account_id: A('4200'), fund_id: endFund.id, credit_amount: total, donor_id: d.id, description: 'Contribution - endowment' },
    ]);
    opEntries++;

    for (let y = 0; y < years; y++) {
      const due = new Date(start.getTime() + y * 365.25 * 86400000);
      if (due > new Date()) break;
      postJournalEntry({
        entry_date: dateStr(due),
        description: `Pledge instalment received - ${d.first} ${d.last}`,
        reference_number: `PLGP-${plId.slice(0, 8).toUpperCase()}-${y + 1}`,
        entry_type: 'automated', status: 'posted',
        posted_by: financeDir.id, created_by: financeDir.id,
      }, [
        { account_id: A('1000'), fund_id: endFund.id, debit_amount: perYear, donor_id: d.id, description: 'Cash received on pledge' },
        { account_id: A('1200'), fund_id: endFund.id, credit_amount: perYear, donor_id: d.id, description: 'Pledges receivable settled' },
      ]);
      opEntries++;
    }
  }

  // Allowance for uncollectible pledges - 4% of the outstanding receivable.
  const outstanding = db.prepare(`SELECT COALESCE(SUM(l.debit_amount) - SUM(l.credit_amount),0) v
    FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE a.account_code='1200'`).get().v;
  if (outstanding > 0) {
    postJournalEntry({
      entry_date: dateStr(new Date()),
      description: 'Allowance for uncollectible pledges (4%)',
      reference_number: 'ALLOW-CURRENT', entry_type: 'automated', status: 'posted',
      posted_by: financeDir.id, created_by: financeDir.id,
    }, [
      { account_id: A('5100'), fund_id: endFund.id, debit_amount: round2(outstanding * 0.04), description: 'Provision for uncollectible pledges' },
      { account_id: A('1201'), fund_id: endFund.id, credit_amount: round2(outstanding * 0.04), description: 'Allowance for uncollectible pledges' },
    ]);
    opEntries++;
  }

  // ─────────────────── investments & endowment history ────────────────
  const INV = [
    ['Global Equity Index Fund', 'equity', 0.42, 0.118],
    ['International Developed Equity', 'equity', 0.15, 0.094],
    ['Core Fixed Income', 'fixed_income', 0.22, 0.041],
    ['Real Assets / REIT Sleeve', 'real_assets', 0.08, 0.067],
    ['Sustainable Impact Fund', 'equity', 0.08, 0.102],
    ['Short-Term Treasury Reserve', 'cash', 0.05, 0.049],
  ];
  const corpus = db.prepare(
    "SELECT COALESCE(SUM(amount),0) v FROM transactions t JOIN funds f ON f.id=t.fund_id WHERE f.is_endowment=1 AND t.status='completed'").get().v;
  const invIns = db.prepare(`INSERT INTO investments (id,name,asset_class,fund_id,cost_basis,
    market_value,target_allocation,as_of_date,ytd_return) VALUES (?,?,?,?,?,?,?,?,?)`);
  for (const [name, cls, alloc, ret] of INV) {
    const mv = corpus * alloc;
    invIns.run(uuid(), name, cls, fundBy['END-GEN'].id, round2(mv / (1 + ret)), round2(mv),
      alloc, dateStr(new Date()), ret);
  }

  const ehIns = db.prepare(`INSERT INTO endowment_history (id,period,corpus,contributions,
    investment_return,distributions,pipeline_npv,donor_count) VALUES (?,?,?,?,?,?,?,?)`);
  const quarters = db.prepare(`SELECT substr(transaction_date,1,4) y,
      ((CAST(substr(transaction_date,6,2) AS INTEGER)-1)/3)+1 q,
      SUM(amount) v, COUNT(DISTINCT donor_id) dn
    FROM transactions WHERE status='completed' GROUP BY y,q ORDER BY y,q`).all();
  let running = 0, donorsSeen = 0;
  const finalPipeline = db.prepare('SELECT COALESCE(SUM(npv),0) v FROM planned_gifts').get().v;
  quarters.forEach((q, i) => {
    running += q.v;
    donorsSeen = Math.max(donorsSeen, q.dn * (i + 1) / 2);
    const ret = running * between(0.008, 0.028);
    ehIns.run(uuid(), `${q.y}-Q${q.q}`, round2(running + ret * i), round2(q.v), round2(ret),
      round2(running * 0.0045), round2(finalPipeline * (i + 1) / quarters.length),
      Math.round(donorsSeen));
  });

  // ───────────────────── fixed assets & consultants ───────────────────
  const faIns = db.prepare(`INSERT INTO fixed_assets (id,asset_tag,description,asset_category,
    acquisition_date,acquisition_cost,salvage_value,useful_life_years,depreciation_method,
    accumulated_depreciation,location,assigned_department) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  [['FA-1001', 'Donor CRM server infrastructure', 'equipment', '2024-03-15', 148000, 8000, 5],
   ['FA-1002', 'Meditation hall audio-visual system', 'equipment', '2023-11-02', 96500, 5000, 7],
   ['FA-1003', 'Regional office leasehold improvements', 'leasehold', '2023-06-20', 312000, 0, 10],
   ['FA-1004', 'Mobile relief vehicles (fleet of 4)', 'vehicles', '2025-01-10', 224000, 30000, 8],
   ['FA-1005', 'Sankalpa platform - capitalised development', 'intangible', '2026-02-01', 486000, 0, 5],
  ].forEach(([tag, desc, cat, date, cost, salvage, life]) => {
    const years = (Date.now() - new Date(date).getTime()) / (365.25 * 86400000);
    const accum = Math.min(cost - salvage, ((cost - salvage) / life) * years);
    faIns.run(uuid(), tag, desc, cat, date, cost, salvage, life, 'straight_line',
      round2(accum), pick(['Boone, NC', 'Pasadena, CA', 'Bengaluru, IN', 'Bad Antogast, DE']),
      pick(['Operations', 'Programs', 'Technology', 'Advancement']));
  });

  // The Foundation's donors concentrate in CA, WA, DC, NC, GA, FL, TX, AZ, NY
  // and NJ. No single firm is licensed everywhere, so the network is built as
  // a panel: every priority state has at least two firms with capacity, and
  // the donor contracts (and pays) the consultant directly.
  const cIns = db.prepare(`INSERT INTO consultants (id,firm_name,first_name,last_name,email,phone,
    licensed_states,specialties,max_concurrent_cases,current_case_count) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const CONSULTANTS = [
    ['Marchetti & Associates', 'Elena', 'Marchetti', ['NY', 'NJ', 'CT', 'MA', 'DC'], ['estate_law', 'cpa']],
    ['Whitfield Estate Counsel', 'James', 'Whitfield', ['CA', 'WA', 'OR', 'NV', 'AZ'], ['estate_law', 'real_estate']],
    ['Pacific Legacy Advisors', 'Grace', 'Yamamoto', ['CA', 'WA', 'AZ', 'HI'], ['financial_planning', 'estate_law']],
    ['Iyer Legacy Advisory', 'Meera', 'Iyer', ['TX', 'FL', 'GA', 'NC'], ['estate_law', 'financial_planning']],
    ['Carolina Trust Partners', 'Daniel', 'Boone', ['NC', 'GA', 'SC', 'VA'], ['estate_law', 'real_estate']],
    ['Lone Star Wealth Counsel', 'Alicia', 'Reyes', ['TX', 'AZ', 'NM', 'OK'], ['cpa', 'financial_planning']],
    ['Atlantic Fiduciary Group', 'Samuel', 'Okonkwo', ['NY', 'NJ', 'DC', 'MD', 'PA'], ['estate_law', 'cpa']],
    ['Sunbelt Planning Associates', 'Rachel', 'Kimball', ['FL', 'GA', 'AL', 'TN'], ['financial_planning', 'real_estate']],
    ['Cascade Estate Law', 'Peter', 'Lindgren', ['WA', 'OR', 'ID', 'CA'], ['estate_law']],
    ['Potomac Charitable Counsel', 'Nadia', 'Haddad', ['DC', 'MD', 'VA', 'NJ'], ['estate_law', 'cpa']],
    ['Desert Ridge Advisors', 'Marcus', 'Delgado', ['AZ', 'NV', 'TX', 'CA'], ['financial_planning', 'real_estate']],
    ['Global Cross-Border Trusts', 'Sophie', 'Dubois', [], ['estate_law', 'international']],
  ];
  CONSULTANTS.forEach(([firm, fn, ln, states, spec]) => {
    cIns.run(uuid(), firm, fn, ln,
      `${fn.toLowerCase()}@${firm.toLowerCase().replace(/[^a-z]/g, '')}.com`,
      `+1${iint(2000000000, 9999999999)}`,
      JSON.stringify(states), JSON.stringify(spec), iint(6, 14), iint(0, 4));
  });

  // ─────────── market prices for pledged securities ───────────────────
  const spIns = db.prepare(`INSERT OR REPLACE INTO security_prices
    (ticker,name,last_price,prev_close,as_of,source) VALUES (?,?,?,?,?,?)`);
  const PRICES = [
    ['AAPL', 'Apple Inc.', 232.4], ['MSFT', 'Microsoft Corporation', 428.1],
    ['BRK.B', 'Berkshire Hathaway Inc. Class B', 462.8], ['JNJ', 'Johnson & Johnson', 158.3],
    ['NVDA', 'NVIDIA Corporation', 176.9], ['UNH', 'UnitedHealth Group', 312.5],
    ['V', 'Visa Inc.', 341.2], ['PG', 'Procter & Gamble', 165.7],
    ['XOM', 'Exxon Mobil Corporation', 118.4], ['ASML', 'ASML Holding N.V.', 812.6],
  ];
  PRICES.forEach(([t, n, px]) => spIns.run(t, n, px, round2(px * between(0.988, 1.012)),
    new Date().toISOString(), 'seed-mark'));

  // Re-mark each pledged securities gift at the seeded price so the booked
  // value and the live valuation are consistent from the first page load.
  const secGifts = db.prepare("SELECT id, sec_ticker, sec_shares_pledged FROM planned_gifts WHERE gift_type='securities'").all();
  const secUpd = db.prepare('UPDATE planned_gifts SET sec_market_value = ? WHERE id = ?');
  for (const g of secGifts) {
    const px = db.prepare('SELECT last_price FROM security_prices WHERE ticker = ?').get(g.sec_ticker);
    if (px) secUpd.run(round2(px.last_price * (g.sec_shares_pledged || 0)), g.id);
  }

  // ─────────── life insurance premium payment history ─────────────────
  const prIns = db.prepare(`INSERT INTO policy_premiums
    (id,planned_gift_id,donor_id,due_date,amount,status,paid_date,payment_method)
    VALUES (?,?,?,?,?,?,?,?)`);
  const liGifts = db.prepare(`SELECT id, donor_id, li_annual_premium, created_at
    FROM planned_gifts WHERE gift_type='life_insurance' AND li_annual_premium > 0`).all();
  for (const g of liGifts) {
    const monthly = round2(g.li_annual_premium / 12);
    const start = new Date(g.created_at);
    for (let m = 0; m < 30; m++) {
      const due = new Date(start.getTime() + m * 30.44 * 86400000);
      const future = due.getTime() > Date.now();
      const missed = !future && rnd() < 0.04;
      prIns.run(uuid(), g.id, g.donor_id, dateStr(due), monthly,
        future ? 'scheduled' : missed ? 'missed' : 'paid',
        future || missed ? null : dateStr(due),
        future || missed ? null : pick(['ach', 'card', 'check']));
    }
  }

  // ─────────── returned documentation on closed complex cases ─────────
  const cdIns = db.prepare(`INSERT INTO case_documents
    (id,case_id,document_type,allocation_amount,allocation_percent,instrument,consultant_firm,notes,verified)
    VALUES (?,?,?,?,?,?,?,?,?)`);

  // ───────────────────────── complex cases ────────────────────────────
  const ccIns = db.prepare(`INSERT INTO complex_cases (id,donor_id,intake_full_name,intake_email,
    intake_phone,state_of_residence,country,asset_types,asset_value_range,description,
    pref_contact_method,best_contact_time,status,ai_priority,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const CASE_ASSETS = [
    [['real_estate', 'business_interest'], '$1,000,000 - $4,999,999', 'Family vineyard held in an LLC; owners wish to retain lifetime income.', 'critical'],
    [['cryptocurrency'], '$500,000 - $999,999', 'Long-held digital assets with very low cost basis.', 'medium'],
    [['farmland', 'real_estate'], '$5,000,000+', 'Two agricultural parcels across state lines, one with a mineral lease.', 'critical'],
    [['art_collectibles'], '$100,000 - $499,999', 'Collection of South Asian devotional art requiring qualified appraisal.', 'medium'],
    [['private_equity', 'business_interest'], '$5,000,000+', 'Pre-IPO shares with transfer restrictions.', 'critical'],
    [['intellectual_property'], 'Under $100,000', 'Book royalties to be assigned to the Foundation in perpetuity.', 'standard'],
    [['real_estate'], '$500,000 - $999,999', 'Retained life estate on a primary residence in Bavaria.', 'high'],
  ];
  CASE_ASSETS.forEach(([assets, range, desc, prio], i) => {
    const d = plannedDonors[i * 3] || donors[i];
    ccIns.run(uuid(), d.id, `${d.first} ${d.last}`, `${d.first.toLowerCase()}.case${i}@example.org`,
      `+1${iint(2000000000, 9999999999)}`, 'CA', d.country, JSON.stringify(assets), range, desc,
      'email', pick(['morning', 'afternoon', 'evening']),
      pick(['received', 'assigned', 'in_consultation', 'docs_received']), prio,
      new Date(Date.now() - iint(2, 200) * 86400000).toISOString());
  });

  // Two of the cases have come full circle: the donor engaged and paid a
  // consultant, the plan was executed, and the documentation came back to the
  // Foundation so the allocation can be tracked.
  db.prepare("SELECT id, intake_full_name FROM complex_cases WHERE status='docs_received' OR status='in_consultation' LIMIT 3")
    .all().forEach((c, k) => {
      cdIns.run(uuid(), c.id, pick(['will', 'trust', 'beneficiary_designation']),
        [750000, 1200000, 320000][k % 3], [null, 15, 25][k % 3],
        pick(['bequest', 'charitable_remainder_trust', 'retirement_beneficiary']),
        pick(['Whitfield Estate Counsel', 'Marchetti & Associates', 'Carolina Trust Partners']),
        'Plan executed by the donor\'s own counsel; the Foundation was notified of the final allocation only.',
        1);
      db.prepare("UPDATE complex_cases SET status='tracked' WHERE id=?").run(c.id);
    });

  // ─────────────────────── seed audit trail ───────────────────────────
  const audIns = db.prepare(`INSERT INTO audit_log (id,timestamp,user_email,user_role,ip_address,
    action,resource_type,result) VALUES (?,?,?,?,?,?,?,?)`);
  const ACTIONS = ['LOGIN', 'VIEW_DONOR', 'POST_JOURNAL_ENTRY', 'EXPORT_REPORT', 'VIEW_DOCUMENT',
    'UPDATE_PLEDGE', 'RUN_NPV_RECALC', 'MFA_CHALLENGE_PASSED', 'DOWNLOAD_AUDIT_PACKAGE'];
  for (let i = 0; i < 240; i++) {
    const u = pick(staff);
    audIns.run(uuid(), new Date(Date.now() - iint(0, 90) * 86400000 - iint(0, 86400) * 1000).toISOString(),
      u.email, u.role, `${iint(10, 220)}.${iint(0, 255)}.${iint(0, 255)}.${iint(1, 254)}`,
      pick(ACTIONS), pick(['donors', 'pledges', 'transactions', 'documents', 'journal_entries']),
      rnd() < 0.97 ? 'success' : 'failure');
  }

  // ─────────── historical CRM interactions (auto-logged) ──────────────
  const iIns = db.prepare(`INSERT INTO interactions
    (id,donor_id,occurred_at,channel,interaction_type,subject,detail,source)
    VALUES (?,?,?,?,?,?,?,?)`);
  const recentTx = db.prepare(`SELECT t.id, t.donor_id, t.amount, t.transaction_date, t.payment_method, f.fund_name
    FROM transactions t JOIN funds f ON f.id = t.fund_id
    WHERE t.status='completed' ORDER BY t.transaction_date DESC LIMIT 400`).all();
  for (const t of recentTx) {
    iIns.run(uuid(), t.donor_id, t.transaction_date + 'T12:00:00.000Z', 'web', 'gift',
      `Gift of $${Math.round(t.amount).toLocaleString('en-US')} to ${t.fund_name}`,
      `Paid by ${t.payment_method}.`, 'auto');
  }
  db.prepare("SELECT id, donor_id, created_at FROM documents WHERE donor_id IS NOT NULL LIMIT 60").all()
    .forEach((d) => iIns.run(uuid(), d.donor_id, d.created_at, 'web', 'document_upload',
      'Estate document uploaded to the vault', 'Routed to the AI parsing pipeline.', 'auto'));

  return {
    skipped: false,
    donors: donors.length, transactions: txCount,
    consultants: CONSULTANTS.length,
    operatingEntries: opEntries,
    fiscalYears: db.prepare("SELECT COUNT(DISTINCT substr(entry_date,1,4)) n FROM journal_entries").get().n,
    interactions: db.prepare('SELECT COUNT(*) n FROM interactions').get().n,
    premiums: db.prepare('SELECT COUNT(*) n FROM policy_premiums').get().n,
    plannedGifts: plannedDonors.length,
    accounts: COA.length, funds: funds.length,
    journalEntries: db.prepare('SELECT COUNT(*) n FROM journal_entries').get().n,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

module.exports = { seed };

if (require.main === module) {
  const t0 = Date.now();
  const r = seed();
  console.log('Seed result:', r, `(${Date.now() - t0}ms)`);
}
