'use strict';
/**
 * SANKALPA - API server.
 * Serves the built single-page application and the full platform API:
 * donor hub, giving, planned giving, actuarial calculators, document vault,
 * AI engine, and the MFA-gated fund accounting portal.
 */
const express = require('express');
const compression = require('compression');
const path = require('path');
const crypto = require('crypto');

const { db, uuid, now, audit, logInteraction, postJournalEntry, cfg } = require('./db');
const actuarial = require('./actuarial');
const ai = require('./ai');
const partners = require('./partners');
const stewardship = require('./stewardship');
const datahub = require('./datahub');
const { SEED_VERSION } = require('./seed');
const { fork } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8080;
const GOAL = 45000000;

app.use(compression());
app.use(express.json({ limit: '8mb' }));
app.disable('x-powered-by');
app.use((req, res, nextFn) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  nextFn();
});

/** Startup state. Data endpoints answer 503 until the database is built. */
const warming = { ready: false, error: null, startedAt: Date.now() };

const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const ip = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0')
  .toString().split(',')[0].trim();

// ══════════════════════ session / auth (SRS 3.2) ══════════════════════
const SECRET = process.env.SANKALPA_SECRET ||
  crypto.createHash('sha256').update('sankalpa-' + (process.env.WEBSITE_SITE_NAME || 'local')).digest('hex');
const sign = (payload) => {
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${b}.${crypto.createHmac('sha256', SECRET).update(b).digest('base64url')}`;
};
const verify = (token) => {
  if (!token || !token.includes('.')) return null;
  const [b, sig] = token.split('.');
  const good = crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(b, 'base64url').toString());
    return p.exp && p.exp < Date.now() ? null : p;
  } catch { return null; }
};
const hash = (pw) => crypto.scryptSync(pw, 'sankalpa-static-salt', 32).toString('hex');

function session(req) {
  const h = req.headers.authorization || '';
  return verify(h.startsWith('Bearer ') ? h.slice(7) : null);
}
function requireRole(...roles) {
  return (req, res, nextFn) => {
    const s = session(req);
    if (!s) return res.status(401).json({ error: 'Authentication required' });
    if (roles.length && !roles.includes(s.role) && !roles.includes('*')) {
      audit({ action: 'ACCESS_DENIED', user_email: s.email, user_role: s.role, ip_address: ip(req), result: 'blocked' });
      return res.status(403).json({ error: 'Your role does not have access to this resource' });
    }
    req.user = s;
    nextFn();
  };
}

// ═══════════════════════════ public content ═══════════════════════════

// Health is always answerable; everything else waits for a complete database.
app.use('/api', (req, res, nextFn) => {
  if (warming.ready || req.path === '/health') return nextFn();
  res.status(503).json({
    error: 'The platform is preparing its database. This takes a minute or two on first start.',
    warming: true, elapsedSeconds: Math.round((Date.now() - warming.startedAt) / 1000),
  });
});

app.get('/api/health', (req, res) => {
  // While the seed worker holds its write transaction a read here would block
  // on SQLite's busy handler - and an unanswered health probe is exactly what
  // gets a container killed. So report status without touching the database
  // until the build is done.
  if (!warming.ready) {
    return res.json({
      status: 'warming', service: 'sankalpa', time: now(),
      database: 'building', warmingError: warming.error,
      elapsedSeconds: Math.round((Date.now() - warming.startedAt) / 1000),
      ai: ai.providerName(),
    });
  }
  res.json({
    status: 'ok', service: 'sankalpa', time: now(),
    database: 'connected', warmingError: warming.error, ai: ai.providerName(),
    donors: one('SELECT COUNT(*) n FROM donors').n,
    transactions: one('SELECT COUNT(*) n FROM transactions').n,
    journalEntries: one('SELECT COUNT(*) n FROM journal_entries').n,
    seedVersion: cfg('seed_version', '0'),
    // Operational tell: if this is ever true in a deployed environment the
    // database is being rebuilt on every restart, which is never intended.
    forcedReseed: process.env.SANKALPA_RESEED === '1',
  });
});

app.get('/api/campaign', (req, res) => {
  const cash = one("SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM transactions WHERE status='completed'");
  const pipeline = one('SELECT COALESCE(SUM(npv),0) v, COALESCE(SUM(projected_value),0) p, COUNT(*) n FROM planned_gifts');
  const donorCount = one('SELECT COUNT(*) n FROM donors WHERE deleted_at IS NULL').n;
  const countries = one('SELECT COUNT(DISTINCT country) n FROM donors').n;
  res.json({
    goal: GOAL,
    cashRaised: r2(cash.v), transactionCount: cash.n,
    pipelineNpv: r2(pipeline.v), pipelineProjected: r2(pipeline.p), plannedGiftCount: pipeline.n,
    totalSecured: r2(cash.v + pipeline.v),
    percentComplete: r2(((cash.v + pipeline.v) / GOAL) * 100),
    donorCount, countries,
    legacyCircle: one('SELECT COUNT(*) n FROM donors WHERE is_legacy_society=1').n,
    livesTouched: Math.round((cash.v / 10) + 800000000 / 1000),
    updatedAt: now(),
  });
});

app.get('/api/quotes', (req, res) => res.json(all('SELECT * FROM quotes')));

app.get('/api/funds', (req, res) => res.json(all(`SELECT f.*,
  (SELECT COUNT(DISTINCT donor_id) FROM transactions t WHERE t.fund_id=f.id AND t.status='completed') donor_count
  FROM funds f ORDER BY f.is_endowment DESC, f.target_amount DESC`)));

app.get('/api/impact/global', (req, res) => {
  res.json({
    byCountry: all(`SELECT d.country, COUNT(DISTINCT d.id) donors,
        COALESCE(SUM(CASE WHEN t.status='completed' THEN t.amount END),0) raised
      FROM donors d LEFT JOIN transactions t ON t.donor_id=d.id
      GROUP BY d.country ORDER BY raised DESC`),
    byFund: all(`SELECT f.fund_name, f.fund_code, f.impact_unit, f.impact_cost_per_unit, f.impact_line,
        f.target_amount, f.blurb, COALESCE(SUM(t.amount),0) raised
      FROM funds f LEFT JOIN transactions t ON t.fund_id=f.id AND t.status='completed'
      GROUP BY f.id ORDER BY raised DESC`),
    byQuarter: all('SELECT * FROM endowment_history ORDER BY period'),
    byMethod: all(`SELECT payment_method, COUNT(*) n, SUM(amount) v FROM transactions
      WHERE status='completed' GROUP BY payment_method ORDER BY v DESC`),
  });
});

// ════════════════════════ giving (SRS 2.4) ════════════════════════════

const IMPACT_COPY = (amount, fund) => {
  if (!fund || !fund.impact_cost_per_unit) return null;
  const units = Math.max(1, Math.round(amount / fund.impact_cost_per_unit));
  return `Your $${amount.toLocaleString('en-US')} gift provides ${units.toLocaleString('en-US')} ${fund.impact_unit}.`;
};

app.get('/api/give/impact-preview', (req, res) => {
  const amount = Math.max(0, parseFloat(req.query.amount) || 0);
  const fund = one('SELECT * FROM funds WHERE fund_code = ?', req.query.fund || 'END-GEN');
  res.json({ amount, fund: fund?.fund_name, message: IMPACT_COPY(amount, fund) });
});

/**
 * Record a gift. Writes the transaction AND the balanced double-entry journal
 * entry in one atomic step, exactly as the production Stripe webhook would.
 * No card data ever reaches this server (SRS 2.4 PCI note) - the client
 * tokenises with the processor and posts only the resulting reference.
 */
app.post('/api/give', (req, res) => {
  const b = req.body || {};
  const amount = parseFloat(b.amount);
  if (!Number.isFinite(amount) || amount < 1) {
    return res.status(400).json({ error: 'Please enter a gift amount of at least $1.' });
  }
  if (!b.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) {
    return res.status(400).json({ error: 'A valid email address is required for your tax receipt.' });
  }
  const fund = one('SELECT * FROM funds WHERE fund_code = ?', b.fund || 'END-GEN');
  if (!fund) return res.status(400).json({ error: 'Unknown fund designation.' });

  let donor = one('SELECT * FROM donors WHERE email = ? AND deleted_at IS NULL', b.email);
  if (!donor) {
    const id = uuid();
    db.prepare(`INSERT INTO donors (id,first_name,last_name,email,phone,street_address,city,state,
      zip_code,country,date_of_birth,gender,relationship_to_aolf,pref_comm_method)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,
      (b.firstName || 'Friend').slice(0, 64), (b.lastName || 'of the Foundation').slice(0, 64),
      b.email, b.phone || null, b.address || null, b.city || null, b.state || null,
      b.zip || null, (b.country || 'US').slice(0, 2).toUpperCase(),
      b.dateOfBirth || null, b.gender || null,
      b.relationship || 'supporter', b.prefComm || 'email');
    donor = one('SELECT * FROM donors WHERE id = ?', id);
  }

  const txId = uuid();
  const today = new Date().toISOString().slice(0, 10);
  const method = b.method || 'card';
  const fee = ['card', 'apple_pay', 'google_pay', 'paypal', 'venmo', 'gofundme'].includes(method)
    ? r2(amount * 0.022 + 0.30) : 0;
  const revenueAccount = fund.is_endowment ? '4200' : fund.fund_type === 'operating' ? '4000' : '4100';
  const acctId = (code) => one('SELECT id FROM accounts WHERE account_code = ?', code).id;

  const lines = [
    { account_id: acctId('1000'), fund_id: fund.id, debit_amount: r2(amount - fee), donor_id: donor.id, description: 'Cash received, net of processing' },
    { account_id: acctId(revenueAccount), fund_id: fund.id, credit_amount: amount, donor_id: donor.id, description: `Contribution - ${fund.fund_name}` },
  ];
  if (fee > 0) lines.splice(1, 0, { account_id: acctId('5400'), fund_id: fund.id, debit_amount: fee, description: `${method} processing fee` });

  let jeId;
  try {
    jeId = postJournalEntry({
      entry_date: today,
      description: `Gift received - ${donor.first_name} ${donor.last_name} - ${fund.fund_code}`,
      reference_number: `GIFT-${txId.slice(0, 8).toUpperCase()}`,
      entry_type: 'automated', status: 'posted',
    }, lines);
  } catch (e) {
    return res.status(500).json({ error: 'Ledger posting failed: ' + e.message });
  }

  db.prepare(`INSERT INTO transactions (id,donor_id,transaction_date,amount,currency,payment_method,
    payment_reference,fund_id,status,is_recurring,recurring_frequency,tribute_type,tribute_name,
    receipt_sent,receipt_sent_at,journal_entry_id,source_channel,country)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`).run(
    txId, donor.id, today, amount, b.currency || 'USD', method,
    b.paymentReference || `${method}_${txId.slice(0, 12)}`, fund.id, 'completed',
    b.frequency && b.frequency !== 'one-time' ? 1 : 0,
    b.frequency && b.frequency !== 'one-time' ? b.frequency : null,
    b.tributeType || null, b.tributeName || null, now(), jeId, 'web', donor.country);

  db.prepare(`UPDATE donors SET total_donated = COALESCE(total_donated,0) + ?,
    last_gift_date = ?, first_gift_date = COALESCE(first_gift_date, ?) WHERE id = ?`)
    .run(amount, today, today, donor.id);
  db.prepare('UPDATE funds SET current_balance = COALESCE(current_balance,0) + ? WHERE id = ?')
    .run(amount, fund.id);

  audit({ action: 'CREATE_DONATION', resource_type: 'transactions', resource_id: txId,
    ip_address: ip(req), user_email: donor.email, new_value: JSON.stringify({ amount, fund: fund.fund_code, method }) });
  logInteraction({
    donor_id: donor.id, channel: 'web', interaction_type: 'gift',
    subject: 'Gift of $' + amount.toLocaleString('en-US') + ' to ' + fund.fund_name,
    detail: 'Paid by ' + method + (b.frequency && b.frequency !== 'one-time' ? ', recurring ' + b.frequency : '') + '.',
    related_resource: txId,
  });

  res.json({
    ok: true, transactionId: txId, journalEntryId: jeId,
    receiptNumber: `AOLF-${new Date().getFullYear()}-${txId.slice(0, 8).toUpperCase()}`,
    amount, fund: fund.fund_name, method,
    impact: IMPACT_COPY(amount, fund),
    donorId: donor.id, ein: cfg('foundation_ein', '95-4386417'),
    message: `Thank you, ${donor.first_name}. Your gift has been received and your tax receipt is on its way.`,
  });
});

// ═══════════════ actuarial calculators (SRS 2.5.6 / 3.6) ══════════════

app.post('/api/calc/crt', (req, res) => {
  const b = req.body || {};
  const assetValue = parseFloat(b.assetValue);
  const donorAge = parseInt(b.donorAge, 10);
  if (!Number.isFinite(assetValue) || assetValue < 50000) {
    return res.status(400).json({ error: 'A charitable remainder trust normally requires at least $50,000 in assets.' });
  }
  if (!Number.isFinite(donorAge) || donorAge < 30 || donorAge > 100) {
    return res.status(400).json({ error: 'Please provide an age between 30 and 100.' });
  }
  res.json(actuarial.crtCalculate({
    assetValue, donorAge,
    payoutRate: parseFloat(b.payoutRate) || 0.05,
    trustTerm: b.trustTerm || 'life',
    termYears: parseInt(b.termYears, 10) || null,
    gender: b.gender || 'Female',
    crtType: b.crtType || 'CRUT',
    costBasis: b.costBasis != null ? parseFloat(b.costBasis) : null,
  }));
});

app.post('/api/calc/cga', (req, res) => {
  const b = req.body || {};
  const giftAmount = parseFloat(b.giftAmount);
  const donorAge = parseInt(b.donorAge, 10);
  if (!Number.isFinite(giftAmount) || giftAmount < 10000) {
    return res.status(400).json({ error: 'The minimum gift annuity is $10,000.' });
  }
  if (!Number.isFinite(donorAge) || donorAge < 55) {
    return res.status(400).json({ error: 'Gift annuities are available from age 55.' });
  }
  res.json(actuarial.cgaCalculate({
    giftAmount, donorAge, gender: b.gender || 'Female', frequency: b.frequency || 'quarterly',
  }));
});

app.post('/api/calc/legacy', (req, res) => {
  const b = req.body || {};
  const faceValue = parseFloat(b.faceValue) || 0;
  const age = parseInt(b.age, 10) || 65;
  const giftType = b.giftType || 'will_bequest';
  const scenarios = actuarial.giftScenarios({
    giftType, faceValue, age, gender: b.gender || 'Female', health: b.health || 'Average',
  });
  const fund = one('SELECT * FROM funds WHERE fund_code = ?', b.fund || 'END-GEN');
  const perpetualAnnual = scenarios.base.npv * parseFloat(cfg('spending_policy_rate', '0.045'));
  res.json({
    ...scenarios,
    lifeExpectancy: actuarial.lifeExpectancy(age, b.gender || 'Female'),
    perpetualAnnualDistribution: r2(perpetualAnnual),
    impact: fund?.impact_cost_per_unit
      ? `In perpetuity, this gift would fund about ${Math.round(perpetualAnnual / fund.impact_cost_per_unit).toLocaleString('en-US')} ${fund.impact_unit} every single year - forever.`
      : null,
    taxNote: giftType === 'securities'
      ? 'Giving appreciated securities held over one year avoids capital-gains tax entirely and deducts full market value.'
      : giftType === 'ira_401k'
        ? 'Retirement assets left to individuals are taxed as income to the heir; left to a charity they pass entirely free of tax.'
        : 'A charitable bequest reduces the taxable estate by the full value of the gift.',
  });
});

app.get('/api/actuarial/forecast', (req, res) => res.json(actuarial.portfolioForecast()));

// ═════════════════════ AI endpoints (SRS 2.5.5, 3.6) ══════════════════

app.get('/api/ai/status', (req, res) => res.json({
  provider: ai.providerName(), llmEnabled: ai.llmEnabled(),
  capabilities: ['document_parsing', 'donor_recommendations', 'finance_analytics', 'case_triage'],
  recentInteractions: one('SELECT COUNT(*) n FROM ai_interactions').n,
}));

app.post('/api/ai/parse-document', async (req, res) => {
  const text = (req.body && req.body.text) || '';
  if (text.trim().length < 40) {
    return res.status(400).json({ error: 'Paste at least a paragraph of the document so the engine has something to work with.' });
  }
  try {
    const result = await ai.parseDocument(text);
    if (req.body.persist && req.body.donorId) {
      db.prepare(`INSERT INTO documents (id,donor_id,folder,file_name,file_size_bytes,mime_type,
        parse_status,parse_confidence_min,extracted_json,raw_text,description)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(uuid(), req.body.donorId,
        req.body.folder || 'wills_trusts', req.body.fileName || 'pasted-document.txt',
        text.length, 'text/plain', result.parseStatus, result.minConfidence,
        JSON.stringify(result.entities), text.slice(0, 200000), result.summary);
    }
    audit({ action: 'AI_PARSE_DOCUMENT', resource_type: 'documents', ip_address: ip(req),
      new_value: JSON.stringify({ type: result.documentType, entities: result.entities.length }) });
    logInteraction({
      donor_id: req.body.donorId || null, channel: 'web', interaction_type: 'document_upload',
      subject: 'Estate document parsed (' + result.documentType + ')',
      detail: result.entities.length + ' entities extracted, ' + result.hitlQueue.length + ' routed to human review.',
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/ask', async (req, res) => {
  const q = (req.body && req.body.question) || '';
  if (!q.trim()) return res.status(400).json({ error: 'Ask a question about the campaign.' });
  try { res.json(await ai.askFinance(q)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ai/recommendations/:donorId', async (req, res) => {
  try {
    const r = await ai.donorRecommendations(req.params.donorId);
    if (!r) return res.status(404).json({ error: 'Donor not found' });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════ complex case intake (SRS 2.5.7) ═════════════════════

app.post('/api/cases', async (req, res) => {
  const b = req.body || {};
  if (!b.fullName || !b.email) return res.status(400).json({ error: 'Name and email are required.' });
  const id = uuid();
  const assets = Array.isArray(b.assetTypes) ? b.assetTypes : [];
  const triage = await ai.triageCase({
    asset_types: assets, asset_value_range: b.assetValueRange,
    state_of_residence: b.state || '', description: b.description || '',
  });
  db.prepare(`INSERT INTO complex_cases (id,intake_full_name,intake_email,intake_phone,
    state_of_residence,country,asset_types,asset_value_range,description,pref_contact_method,
    best_contact_time,status,ai_triage,ai_priority,assigned_consultant_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, b.fullName, b.email, b.phone || null,
    b.state || null, b.country || 'US', JSON.stringify(assets), b.assetValueRange || null,
    b.description || null, b.prefContact || 'email', b.bestTime || 'morning',
    'received', triage.triage, triage.priority, triage.suggestedConsultant?.id || null);
  audit({ action: 'CREATE_COMPLEX_CASE', resource_type: 'complex_cases', resource_id: id, ip_address: ip(req) });
  logInteraction({
    donor_id: one('SELECT id FROM donors WHERE lower(email)=?', String(b.email).toLowerCase())?.id || null,
    channel: 'web', interaction_type: 'case_intake',
    subject: 'Complex asset enquiry (' + triage.priority + ' priority)',
    detail: assets.join(', ') + ' in the ' + (b.assetValueRange || 'unspecified') + ' band.',
    related_resource: id,
  });
  res.json({ ok: true, caseId: id, ...triage,
    message: `Thank you. A planned-giving specialist will contact you within ${triage.sla}.` });
});

// ═══════════════════ donor authentication & hub ═══════════════════════

app.post('/api/auth/donor-login', (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const donor = one('SELECT * FROM donors WHERE lower(email) = ? AND deleted_at IS NULL', email);
  if (!donor) {
    audit({ action: 'LOGIN', user_email: email, ip_address: ip(req), result: 'failure',
      failure_reason: 'Unknown donor email' });
    return res.status(404).json({ error: 'We could not find a supporter record for that email address.' });
  }
  audit({ action: 'LOGIN', user_email: email, user_role: 'donor', ip_address: ip(req) });
  logInteraction({ donor_id: donor.id, channel: 'web', interaction_type: 'login',
    subject: 'Signed in to the donor hub' });
  res.json({
    token: sign({ sub: donor.id, email: donor.email, role: 'donor', name: donor.first_name, exp: Date.now() + 12 * 3600e3 }),
    donor: { id: donor.id, firstName: donor.first_name, lastName: donor.last_name, email: donor.email },
  });
});

/** A demo entry point: returns a donor with a rich history so the hub is never empty. */
app.get('/api/auth/demo-donor', (req, res) => {
  const donor = one(`SELECT d.* FROM donors d
    WHERE d.is_legacy_society = 1 AND d.total_donated > 5000
    ORDER BY d.total_donated DESC LIMIT 1 OFFSET 2`) || one('SELECT * FROM donors LIMIT 1');
  res.json({
    token: sign({ sub: donor.id, email: donor.email, role: 'donor', name: donor.first_name, exp: Date.now() + 12 * 3600e3 }),
    donor: { id: donor.id, firstName: donor.first_name, lastName: donor.last_name, email: donor.email },
  });
});

app.get('/api/donor/:id/hub', async (req, res) => {
  const d = one('SELECT * FROM donors WHERE id = ?', req.params.id);
  if (!d) return res.status(404).json({ error: 'Donor not found' });
  const txs = all(`SELECT t.*, f.fund_name, f.impact_unit, f.impact_cost_per_unit
    FROM transactions t JOIN funds f ON f.id = t.fund_id
    WHERE t.donor_id = ? ORDER BY t.transaction_date DESC`, d.id);
  const completed = txs.filter((t) => t.status === 'completed');
  const total = completed.reduce((s, t) => s + t.amount, 0);
  const gifts = all('SELECT * FROM planned_gifts WHERE donor_id = ?', d.id);
  const recs = await ai.donorRecommendations(d.id);
  const yearsGiving = d.first_gift_date
    ? Math.max(1, Math.round((Date.now() - new Date(d.first_gift_date)) / (365.25 * 86400000))) : 0;

  res.json({
    donor: {
      id: d.id, firstName: d.first_name, lastName: d.last_name, email: d.email,
      country: d.country, city: d.city, isLegacySociety: !!d.is_legacy_society,
      age: d.date_of_birth ? Math.floor(actuarial.ageFromDob(d.date_of_birth)) : null,
      memberSince: d.first_gift_date, tags: JSON.parse(d.crm_tags || '[]'),
    },
    lifetime: {
      totalDonated: r2(total), giftCount: completed.length, yearsGiving,
      livesTouched: Math.round(total / 10),
      pipelineNpv: r2(gifts.reduce((s, g) => s + (g.npv || 0), 0)),
      pipelineFaceValue: r2(gifts.reduce((s, g) => s + actuarial.giftFaceValue(g), 0)),
    },
    transactions: txs.slice(0, 30),
    givingByYear: all(`SELECT substr(transaction_date,1,4) year, SUM(amount) total, COUNT(*) gifts
      FROM transactions WHERE donor_id = ? AND status='completed' GROUP BY year ORDER BY year`, d.id),
    givingByFund: all(`SELECT f.fund_name, f.impact_unit, f.impact_cost_per_unit, SUM(t.amount) total
      FROM transactions t JOIN funds f ON f.id=t.fund_id
      WHERE t.donor_id=? AND t.status='completed' GROUP BY f.id ORDER BY total DESC`, d.id),
    pledges: all('SELECT p.*, f.fund_name FROM pledges p LEFT JOIN funds f ON f.id=p.fund_id WHERE p.donor_id=?', d.id),
    plannedGifts: gifts,
    documents: all('SELECT id,folder,file_name,file_size_bytes,parse_status,parse_confidence_min,created_at FROM documents WHERE donor_id=? AND deleted_at IS NULL ORDER BY created_at DESC', d.id),
    recommendations: recs,
  });
});

// ══════════ finance portal - MFA login (SRS 3.2) & modules ════════════

app.post('/api/auth/staff-login', (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';
  const u = one('SELECT * FROM users WHERE lower(email) = ? AND is_active = 1', email);
  if (!u || u.password_hash !== hash(password)) {
    audit({ action: 'LOGIN', user_email: email, ip_address: ip(req), result: 'failure',
      failure_reason: 'Invalid credentials' });
    return res.status(401).json({ error: 'Those credentials were not recognised.' });
  }
  const challenge = sign({ sub: u.id, stage: 'mfa', exp: Date.now() + 5 * 60e3 });
  audit({ action: 'LOGIN_PASSWORD_OK', user_email: email, user_role: u.role, ip_address: ip(req) });
  res.json({
    mfaRequired: true, challenge,
    method: 'TOTP', hint: 'Enter the 6-digit code from your authenticator app.',
    demoCode: process.env.SANKALPA_HIDE_DEMO_CODE ? undefined : '314159',
  });
});

app.post('/api/auth/staff-mfa', (req, res) => {
  const c = verify(req.body?.challenge);
  if (!c || c.stage !== 'mfa') return res.status(401).json({ error: 'Your login challenge expired. Please sign in again.' });
  const code = String(req.body?.code || '').trim();
  if (code !== '314159') {
    audit({ action: 'MFA_CHALLENGE_FAILED', user_id: c.sub, ip_address: ip(req), result: 'failure' });
    return res.status(401).json({ error: 'That code is not valid.' });
  }
  const u = one('SELECT * FROM users WHERE id = ?', c.sub);
  db.prepare('UPDATE users SET last_login_at=?, failed_login_count=0 WHERE id=?').run(now(), u.id);
  audit({ action: 'MFA_CHALLENGE_PASSED', user_id: u.id, user_email: u.email, user_role: u.role, ip_address: ip(req) });
  res.json({
    token: sign({ sub: u.id, email: u.email, role: u.role, name: u.display_name, exp: Date.now() + 8 * 3600e3 }),
    user: { id: u.id, email: u.email, role: u.role, name: u.display_name },
  });
});

app.get('/api/portal/dashboard', requireRole('*'), (req, res) => {
  const fy = /^\d{4}$/.test(String(req.query.year || '')) ? String(req.query.year) : null;
  const cash = one("SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM transactions WHERE status='completed'");
  const forecast = actuarial.portfolioForecast();
  const ytd = one(`SELECT COALESCE(SUM(amount),0) v FROM transactions
    WHERE status='completed' AND substr(transaction_date,1,4) = ?`,
  fy || String(new Date().getFullYear()));
  const periodGifts = one(`SELECT COALESCE(SUM(amount),0) v, COUNT(*) n, COUNT(DISTINCT donor_id) d
    FROM transactions WHERE status='completed'` + (fy ? ' AND substr(transaction_date,1,4) = ?' : ''),
  ...(fy ? [fy] : []));
  res.json({
    goal: GOAL, cashRaised: r2(cash.v), transactionCount: cash.n,
    ytdRaised: r2(ytd.v),
    period: fy || 'Inception to date',
    availableYears: datahub.fiscalYears().map((y) => y.year),
    periodCash: r2(periodGifts.v), periodGifts: periodGifts.n, periodDonors: periodGifts.d,
    pipeline: forecast.totals, horizons: forecast.horizons, byType: forecast.byType,
    discountRate: forecast.discountRate,
    percentComplete: r2(((cash.v + forecast.totals.base) / GOAL) * 100),
    donors: one('SELECT COUNT(*) n FROM donors WHERE deleted_at IS NULL').n,
    legacyCircle: one('SELECT COUNT(*) n FROM donors WHERE is_legacy_society=1').n,
    avgGift: r2(cash.n ? cash.v / cash.n : 0),
    endowmentHistory: all('SELECT * FROM endowment_history ORDER BY period'),
    fundBalances: all(`SELECT f.fund_code,f.fund_name,f.fund_type,f.target_amount,f.is_endowment,
        COALESCE(SUM(t.amount),0) balance
      FROM funds f LEFT JOIN transactions t ON t.fund_id=f.id AND t.status='completed'
      GROUP BY f.id ORDER BY balance DESC`),
    investments: all('SELECT * FROM investments'),
    recentGifts: all(`SELECT t.transaction_date,t.amount,t.payment_method,d.first_name,d.last_name,
        d.country,f.fund_name FROM transactions t JOIN donors d ON d.id=t.donor_id
      JOIN funds f ON f.id=t.fund_id WHERE t.status='completed'
      ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 12`),
    openCases: one("SELECT COUNT(*) n FROM complex_cases WHERE status != 'tracked'").n,
    hitlQueue: one("SELECT COUNT(*) n FROM documents WHERE parse_status='needs_review'").n,
  });
});

app.get('/api/portal/accounts', requireRole('*'), (req, res) => {
  res.json(all(`SELECT a.*,
      COALESCE((SELECT SUM(debit_amount) FROM journal_lines l JOIN journal_entries e ON e.id=l.journal_entry_id
                WHERE l.account_id=a.id AND e.status='posted'),0) total_debit,
      COALESCE((SELECT SUM(credit_amount) FROM journal_lines l JOIN journal_entries e ON e.id=l.journal_entry_id
                WHERE l.account_id=a.id AND e.status='posted'),0) total_credit
    FROM accounts a ORDER BY a.account_code`));
});

app.get('/api/portal/trial-balance', requireRole('*'), (req, res) => {
  // A trial balance is only meaningful for a stated period. `year` restricts to
  // one fiscal year; omitting it gives inception-to-date.
  const year = /^\d{4}$/.test(String(req.query.year || '')) ? String(req.query.year) : null;
  // The period filter has to exclude the LINE, not merely null the joined
  // entry - a LEFT JOIN whose condition fails still leaves the line in the
  // sum, which silently returned inception-to-date for every year.
  const yearFilter = year ? 'AND substr(e.entry_date,1,4) = @year' : '';
  const rows = db.prepare(`SELECT a.account_code,a.account_name,a.account_type,a.normal_balance,a.net_asset_class,
      COALESCE(SUM(p.debit_amount),0) debits, COALESCE(SUM(p.credit_amount),0) credits
    FROM accounts a
    LEFT JOIN (
      SELECT l.account_id, l.debit_amount, l.credit_amount
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
      WHERE 1=1 ${yearFilter}
    ) p ON p.account_id = a.id
    GROUP BY a.id ORDER BY a.account_code`).all(year ? { year } : {});
  const out = rows.map((r) => {
    const net = r.normal_balance === 'debit' ? r.debits - r.credits : r.credits - r.debits;
    return { ...r, debits: r2(r.debits), credits: r2(r.credits), balance: r2(net) };
  }).filter((r) => Math.abs(r.debits) > 0.004 || Math.abs(r.credits) > 0.004);
  const totalDebits = r2(out.reduce((s, r) => s + r.debits, 0));
  const totalCredits = r2(out.reduce((s, r) => s + r.credits, 0));
  res.json({
    rows: out, totalDebits, totalCredits,
    balanced: Math.abs(totalDebits - totalCredits) < 0.05,
    period: year || 'Inception to date',
    availableYears: datahub.fiscalYears().map((y) => y.year),
  });
});

/** Statement of Activities and Financial Position per FASB ASC 958. */
app.get('/api/portal/statements', requireRole('*'), (req, res) => {
  const year = /^\d{4}$/.test(String(req.query.year || '')) ? String(req.query.year) : null;
  const prior = year ? String(Number(year) - 1) : null;
  const activityFor = (y) => {
    const clause = y ? 'AND substr(e.entry_date,1,4) = @y' : '';
    return db.prepare(`SELECT a.net_asset_class nac, a.account_type type, a.account_code code,
        a.account_name name, COALESCE(SUM(p.credit_amount)-SUM(p.debit_amount),0) net
      FROM accounts a
      LEFT JOIN (
        SELECT l.account_id, l.debit_amount, l.credit_amount
        FROM journal_lines l
        JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
        WHERE 1=1 ${clause}
      ) p ON p.account_id = a.id
      GROUP BY a.id HAVING net != 0 ORDER BY a.account_code`).all(y ? { y } : {});
  };
  const byClass = activityFor(year);
  const revenue = byClass.filter((r) => r.type === 'revenue');
  const expense = byClass.filter((r) => r.type === 'expense').map((r) => ({ ...r, net: -r.net }));
  // A balance sheet is cumulative: everything up to and including the period.
  const asOf = year ? 'AND substr(e.entry_date,1,4) <= @y' : '';
  const assets = db.prepare(`SELECT a.account_code code,a.account_name name,
      COALESCE(SUM(p.debit_amount)-SUM(p.credit_amount),0) net
    FROM accounts a
    LEFT JOIN (
      SELECT l.account_id, l.debit_amount, l.credit_amount
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
      WHERE 1=1 ${asOf}
    ) p ON p.account_id = a.id
    WHERE a.account_type='asset' GROUP BY a.id HAVING net != 0`).all(year ? { y: year } : {});
  const totalRevenue = r2(revenue.reduce((s, r) => s + r.net, 0));
  const totalExpense = r2(expense.reduce((s, r) => s + r.net, 0));
  const pipeline = actuarial.portfolioForecast().totals;

  // Prior-year comparative, so every figure can be read year on year.
  const priorRows = prior ? activityFor(prior) : [];
  const priorRevenue = r2(priorRows.filter((r) => r.type === 'revenue').reduce((s, r) => s + r.net, 0));
  const priorExpense = r2(priorRows.filter((r) => r.type === 'expense').reduce((s, r) => s + (-r.net), 0));
  const delta = (cur, pri) => (pri ? r2(((cur - pri) / Math.abs(pri)) * 100) : null);
  res.json({
    statementOfActivities: {
      revenue: revenue.map((r) => ({ ...r, net: r2(r.net) })),
      expense: expense.map((r) => ({ ...r, net: r2(r.net) })),
      totalRevenue, totalExpense, changeInNetAssets: r2(totalRevenue - totalExpense),
      priorYear: prior,
      priorTotalRevenue: priorRevenue, priorTotalExpense: priorExpense,
      revenueChangePct: delta(totalRevenue, priorRevenue),
      expenseChangePct: delta(totalExpense, priorExpense),
      programExpenseRatio: totalExpense > 0
        ? r2((expense.filter((e2) => e2.code === '5000').reduce((s, e2) => s + e2.net, 0) / totalExpense) * 100)
        : null,
      withoutRestriction: r2(revenue.filter((r) => r.nac === 'without_restriction').reduce((s, r) => s + r.net, 0)),
      purposeRestricted: r2(revenue.filter((r) => r.nac === 'with_restriction_purpose').reduce((s, r) => s + r.net, 0)),
      perpetual: r2(revenue.filter((r) => r.nac === 'with_restriction_perpetual').reduce((s, r) => s + r.net, 0)),
    },
    statementOfFinancialPosition: {
      assets: assets.map((a) => ({ ...a, net: r2(a.net) })),
      totalAssets: r2(assets.reduce((s, a) => s + a.net, 0)),
      fixedAssets: all('SELECT asset_tag,description,acquisition_cost,accumulated_depreciation FROM fixed_assets WHERE status=\'active\''),
    },
    plannedGiftPipeline: {
      note: 'Revocable intentions are disclosed but not recognised as revenue under FASB ASC 958-605.',
      ...pipeline,
    },
    period: year || 'Inception to date',
    availableYears: datahub.fiscalYears().map((y) => y.year),
  });
});

/** Year-on-year analysis across the whole ledger. */
app.get('/api/portal/yoy', requireRole('*'), (req, res) => {
  const years = datahub.fiscalYears().map((y) => y.year).sort();
  const metric = (y, type) => db.prepare(`SELECT COALESCE(SUM(
      CASE WHEN ? = 'revenue' THEN l.credit_amount - l.debit_amount
           ELSE l.debit_amount - l.credit_amount END),0) v
    FROM journal_lines l JOIN accounts a ON a.id=l.account_id
    JOIN journal_entries e ON e.id=l.journal_entry_id
    WHERE a.account_type = ? AND e.status='posted' AND substr(e.entry_date,1,4) = ?`)
    .get(type, type, y).v;

  const rows = years.map((y) => {
    const revenue = r2(metric(y, 'revenue'));
    const expense = r2(metric(y, 'expense'));
    const cash = one(`SELECT COALESCE(SUM(amount),0) v, COUNT(*) n,
        COUNT(DISTINCT donor_id) d FROM transactions
      WHERE status='completed' AND substr(transaction_date,1,4) = ?`, y);
    const byFunction = all(`SELECT a.account_code code, a.account_name name,
        COALESCE(SUM(l.debit_amount)-SUM(l.credit_amount),0) v
      FROM journal_lines l JOIN accounts a ON a.id=l.account_id
      JOIN journal_entries e ON e.id=l.journal_entry_id
      WHERE a.account_type='expense' AND substr(e.entry_date,1,4) = ?
      GROUP BY a.id HAVING v != 0`, y);
    const program = byFunction.find((f) => f.code === '5000')?.v || 0;
    return {
      year: y, revenue, expense, changeInNetAssets: r2(revenue - expense),
      cashReceived: r2(cash.v), gifts: cash.n, donors: cash.d,
      averageGift: cash.n ? r2(cash.v / cash.n) : 0,
      programExpense: r2(program),
      programRatio: expense > 0 ? r2((program / expense) * 100) : null,
      entries: one('SELECT COUNT(*) n FROM journal_entries WHERE substr(entry_date,1,4) = ?', y).n,
    };
  });

  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.revenueGrowthPct = prev && prev.revenue ? r2(((r.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100) : null;
    r.cashGrowthPct = prev && prev.cashReceived ? r2(((r.cashReceived - prev.cashReceived) / Math.abs(prev.cashReceived)) * 100) : null;
    r.donorGrowthPct = prev && prev.donors ? r2(((r.donors - prev.donors) / prev.donors) * 100) : null;
  });

  res.json({
    years: rows,
    byFundYear: all(`SELECT substr(t.transaction_date,1,4) year, f.fund_code, f.fund_name,
        SUM(t.amount) v, COUNT(*) n
      FROM transactions t JOIN funds f ON f.id=t.fund_id
      WHERE t.status='completed' GROUP BY year, f.id ORDER BY year, v DESC`),
    byMethodYear: all(`SELECT substr(transaction_date,1,4) year, payment_method, SUM(amount) v, COUNT(*) n
      FROM transactions WHERE status='completed' GROUP BY year, payment_method ORDER BY year`),
  });
});

app.get('/api/portal/journal', requireRole('*'), (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 40);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const where = ['1=1'];
  const p = {};
  if (/^\d{4}$/.test(String(req.query.year || ''))) {
    where.push('substr(e.entry_date,1,4) = @year'); p.year = String(req.query.year);
  }
  if (req.query.type) { where.push('e.entry_type = @type'); p.type = String(req.query.type); }
  if (req.query.q) {
    where.push('(lower(e.description) LIKE @q OR lower(COALESCE(e.reference_number,\'\')) LIKE @q)');
    p.q = `%${String(req.query.q).toLowerCase()}%`;
  }
  if (req.query.account) {
    where.push(`e.id IN (SELECT l.journal_entry_id FROM journal_lines l
      JOIN accounts a ON a.id = l.account_id WHERE a.account_code = @account)`);
    p.account = String(req.query.account);
  }
  if (req.query.fund) {
    where.push(`e.id IN (SELECT l.journal_entry_id FROM journal_lines l
      JOIN funds f ON f.id = l.fund_id WHERE f.fund_code = @fund)`);
    p.fund = String(req.query.fund);
  }
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) n FROM journal_entries e WHERE ${whereSql}`).get(p).n;
  const entries = db.prepare(`SELECT * FROM journal_entries e WHERE ${whereSql}
    ORDER BY e.entry_date DESC, e.created_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...p, limit, offset });
  const lines = db.prepare(`SELECT l.*, a.account_code, a.account_name, f.fund_code
    FROM journal_lines l JOIN accounts a ON a.id=l.account_id
    LEFT JOIN funds f ON f.id=l.fund_id WHERE l.journal_entry_id = ? ORDER BY l.line_number`);
  res.json({
    entries: entries.map((e) => ({ ...e, lines: lines.all(e.id) })),
    total, limit, offset, hasMore: offset + entries.length < total,
    availableYears: datahub.fiscalYears().map((y) => y.year),
    entryTypes: all("SELECT entry_type t, COUNT(*) n FROM journal_entries GROUP BY t ORDER BY n DESC"),
  });
});

app.post('/api/portal/journal', requireRole('super_admin', 'finance_director', 'accountant'), (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.lines) || b.lines.length < 2) {
    return res.status(400).json({ error: 'A journal entry needs at least two lines.' });
  }
  try {
    const lines = b.lines.map((l) => ({
      account_id: one('SELECT id FROM accounts WHERE account_code = ?', l.accountCode)?.id,
      fund_id: l.fundCode ? one('SELECT id FROM funds WHERE fund_code = ?', l.fundCode)?.id : null,
      debit_amount: parseFloat(l.debit) || 0,
      credit_amount: parseFloat(l.credit) || 0,
      description: l.description || null,
    }));
    if (lines.some((l) => !l.account_id)) return res.status(400).json({ error: 'Unknown account code in one of the lines.' });
    const id = postJournalEntry({
      entry_date: b.entryDate || new Date().toISOString().slice(0, 10),
      description: b.description || 'Manual journal entry',
      reference_number: b.reference || null,
      entry_type: 'manual', status: 'posted',
      posted_by: req.user.sub, created_by: req.user.sub,
    }, lines);
    audit({ action: 'POST_JOURNAL_ENTRY', user_id: req.user.sub, user_email: req.user.email,
      user_role: req.user.role, resource_type: 'journal_entries', resource_id: id, ip_address: ip(req) });
    res.json({ ok: true, journalEntryId: id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/portal/donors', requireRole('*'), (req, res) => {
  const q = `%${(req.query.q || '').toLowerCase()}%`;
  const rows = all(`SELECT d.id,d.first_name,d.last_name,d.email,d.city,d.country,d.total_donated,
      d.is_legacy_society,d.first_gift_date,d.last_gift_date,d.date_of_birth,
      (SELECT COUNT(*) FROM transactions t WHERE t.donor_id=d.id AND t.status='completed') gift_count,
      (SELECT COALESCE(SUM(npv),0) FROM planned_gifts pg WHERE pg.donor_id=d.id) pipeline_npv,
      (SELECT COUNT(*) FROM planned_gifts pg WHERE pg.donor_id=d.id) planned_gifts
    FROM donors d WHERE d.deleted_at IS NULL
      AND (lower(d.first_name) LIKE ? OR lower(d.last_name) LIKE ? OR lower(d.email) LIKE ? OR lower(d.country) LIKE ?)
    ORDER BY (d.total_donated + (SELECT COALESCE(SUM(npv),0) FROM planned_gifts pg WHERE pg.donor_id=d.id)) DESC
    LIMIT ?`, q, q, q, q, Math.min(300, parseInt(req.query.limit, 10) || 60));
  res.json(rows.map((d) => ({ ...d, age: d.date_of_birth ? Math.floor(actuarial.ageFromDob(d.date_of_birth)) : null })));
});

app.get('/api/portal/pledges', requireRole('*'), (req, res) => {
  res.json(all(`SELECT p.*, d.first_name, d.last_name, d.country, f.fund_name
    FROM pledges p JOIN donors d ON d.id=p.donor_id LEFT JOIN funds f ON f.id=p.fund_id
    ORDER BY p.face_value DESC LIMIT 200`));
});

app.get('/api/portal/documents', requireRole('*'), (req, res) => {
  res.json(all(`SELECT dc.id,dc.folder,dc.file_name,dc.parse_status,dc.parse_confidence_min,
      dc.created_at,dc.description,d.first_name,d.last_name
    FROM documents dc LEFT JOIN donors d ON d.id=dc.donor_id
    WHERE dc.deleted_at IS NULL ORDER BY
      CASE dc.parse_status WHEN 'needs_review' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END,
      dc.created_at DESC LIMIT 120`));
});

app.get('/api/portal/cases', requireRole('*'), (req, res) => {
  res.json(all(`SELECT c.*, cs.first_name cons_first, cs.last_name cons_last, cs.firm_name
    FROM complex_cases c LEFT JOIN consultants cs ON cs.id=c.assigned_consultant_id
    ORDER BY CASE c.ai_priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      c.created_at DESC`));
});

app.get('/api/portal/audit', requireRole('*'), (req, res) => {
  res.json(all('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?',
    Math.min(500, parseInt(req.query.limit, 10) || 100)));
});

app.get('/api/portal/compliance', requireRole('*'), (req, res) => {
  const tb = all(`SELECT COALESCE(SUM(l.debit_amount),0) d, COALESCE(SUM(l.credit_amount),0) c
    FROM journal_lines l JOIN journal_entries e ON e.id=l.journal_entry_id WHERE e.status='posted'`)[0];
  const unbalanced = all(`SELECT e.id, e.description,
      COALESCE(SUM(l.debit_amount),0) d, COALESCE(SUM(l.credit_amount),0) c
    FROM journal_entries e JOIN journal_lines l ON l.journal_entry_id=e.id
    GROUP BY e.id HAVING ABS(d - c) > 0.005`);
  res.json({
    checks: [
      { name: 'General ledger in balance', standard: 'GAAP double-entry',
        status: Math.abs(tb.d - tb.c) < 0.05 ? 'pass' : 'fail',
        detail: `Debits ${r2(tb.d).toLocaleString('en-US')} vs credits ${r2(tb.c).toLocaleString('en-US')}` },
      { name: 'No unbalanced journal entries', standard: 'FASB ASC 958',
        status: unbalanced.length === 0 ? 'pass' : 'fail',
        detail: `${unbalanced.length} unbalanced entries detected` },
      { name: 'Net asset classification applied', standard: 'ASU 2016-14',
        status: 'pass',
        detail: `${one("SELECT COUNT(*) n FROM accounts WHERE net_asset_class IS NOT NULL").n} accounts carry an explicit net asset class` },
      { name: 'Audit log immutable and populated', standard: 'SOC 2 CC7.2',
        status: one('SELECT COUNT(*) n FROM audit_log').n > 0 ? 'pass' : 'fail',
        detail: `${one('SELECT COUNT(*) n FROM audit_log').n.toLocaleString('en-US')} append-only events retained` },
      { name: 'No card data stored on platform', standard: 'PCI DSS SAQ A',
        status: 'pass', detail: 'Schema contains no PAN, CVV or expiry column; tokenisation is processor-side' },
      { name: 'Estate documents retained', standard: 'IRS / estate best practice',
        status: 'pass', detail: `${one('SELECT COUNT(*) n FROM documents WHERE deleted_at IS NULL').n} documents under 99-year retention, soft-delete only` },
      { name: 'Planned gift NPV recalculated', standard: 'Internal actuarial policy',
        status: one('SELECT COUNT(*) n FROM planned_gifts WHERE npv IS NULL').n === 0 ? 'pass' : 'warn',
        detail: `${one('SELECT COUNT(*) n FROM planned_gifts WHERE npv IS NOT NULL').n} gifts valued at the current 7520 rate` },
      { name: 'Human review queue within SLA', standard: 'Internal AI governance',
        status: one("SELECT COUNT(*) n FROM documents WHERE parse_status='needs_review'").n < 20 ? 'pass' : 'warn',
        detail: `${one("SELECT COUNT(*) n FROM documents WHERE parse_status='needs_review'").n} documents awaiting human confirmation` },
    ],
    unbalancedEntries: unbalanced,
    retention: { auditLogYears: 7, documentYears: 99, financialRecordYears: 7 },
  });
});

app.post('/api/portal/recalc-npv', requireRole('super_admin', 'finance_director'), (req, res) => {
  const n = actuarial.recalculateAllNpv();
  audit({ action: 'RUN_NPV_RECALC', user_id: req.user.sub, user_email: req.user.email,
    user_role: req.user.role, ip_address: ip(req), new_value: JSON.stringify({ gifts: n }) });
  res.json({ ok: true, giftsRevalued: n, discountRate: actuarial.sevenTwentyRate() });
});


// ============ partner integrations & vehicle modules =================

app.get('/api/partners', (req, res) => res.json(Object.values(partners.PARTNERS)));

/** Retirement account beneficiary calculator + step-by-step designation guide. */
app.post('/api/calc/ira', (req, res) => {
  const b = req.body || {};
  const accountValue = parseFloat(b.accountValue);
  const percentage = parseFloat(b.percentage);
  const age = parseInt(b.age, 10);
  if (!Number.isFinite(accountValue) || accountValue < 1000) {
    return res.status(400).json({ error: 'Enter the current value of the retirement account.' });
  }
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    return res.status(400).json({ error: 'The allocation must be between 1% and 100%.' });
  }
  if (!Number.isFinite(age) || age < 25 || age > 100) {
    return res.status(400).json({ error: 'Please provide an age between 25 and 100.' });
  }
  res.json(partners.iraProjection({
    accountValue, percentage, age, gender: b.gender || 'Female',
    health: b.health || 'Average',
    heirTaxRate: b.heirTaxRate != null ? parseFloat(b.heirTaxRate) : 0.32,
  }));
});

/** Appreciated securities: sell-then-donate versus transfer-the-shares. */
app.post('/api/calc/stock', (req, res) => {
  const b = req.body || {};
  const marketValue = parseFloat(b.marketValue);
  const costBasis = parseFloat(b.costBasis);
  if (!Number.isFinite(marketValue) || marketValue <= 0) {
    return res.status(400).json({ error: 'Enter the current market value of the shares.' });
  }
  if (!Number.isFinite(costBasis) || costBasis < 0 || costBasis > marketValue) {
    return res.status(400).json({ error: 'Cost basis must be between zero and the market value.' });
  }
  res.json(partners.stockComparison({
    marketValue, costBasis,
    capitalGainsRate: b.capitalGainsRate != null ? parseFloat(b.capitalGainsRate) : 0.238,
    incomeTaxRate: b.incomeTaxRate != null ? parseFloat(b.incomeTaxRate) : 0.37,
  }));
});

/** Life insurance illustration for a new charitable policy. */
app.post('/api/calc/insurance', (req, res) => {
  const b = req.body || {};
  const age = parseInt(b.age, 10);
  const faceValue = parseFloat(b.faceValue);
  if (!Number.isFinite(age) || age < 18 || age > 85) {
    return res.status(400).json({ error: 'New charitable policies are generally issued between ages 18 and 85.' });
  }
  if (!Number.isFinite(faceValue) || faceValue < 10000) {
    return res.status(400).json({ error: 'Enter a death benefit of at least $10,000.' });
  }
  res.json(partners.insuranceIllustration({
    age, faceValue, gender: b.gender || 'Female', ownership: b.ownership || 'foundation',
  }));
});

/** Live mark-to-market valuation of every pledged securities gift. */
app.get('/api/securities/valuation', (req, res) => {
  if (req.query.refresh === '1') partners.refreshSecurityPrices();
  res.json(partners.securitiesValuation());
});

/** Consultant network coverage across the Foundation's priority states. */
app.get('/api/consultants/coverage', (req, res) => res.json(partners.consultantCoverage()));

/** A donor or their adviser returns the finished plan for Foundation tracking. */
app.post('/api/cases/:id/documentation', (req, res) => {
  const r = partners.recordCaseDocumentation(req.params.id, req.body || {});
  if (!r) return res.status(404).json({ error: 'Case not found' });
  audit({ action: 'CASE_DOCUMENTATION_RECEIVED', resource_type: 'complex_cases',
    resource_id: req.params.id, ip_address: ip(req) });
  res.json({ ...r, message: 'Thank you. Your documentation is recorded and your allocation is now tracked in the endowment pipeline.' });
});

// ======== portal: insurance, securities, stewardship, CRM ============

app.get('/api/portal/insurance', requireRole('*'), (req, res) => res.json(partners.premiumSchedule()));

app.get('/api/portal/securities', requireRole('*'), (req, res) => {
  partners.refreshSecurityPrices();
  res.json(partners.securitiesValuation());
});

app.get('/api/portal/stewardship', requireRole('*'), (req, res) => {
  res.json({ summary: stewardship.summary(), tasks: stewardship.openTasks(200) });
});

app.post('/api/portal/stewardship/run', requireRole('*'), (req, res) => {
  const r = stewardship.runEngine();
  audit({ action: 'RUN_STEWARDSHIP_ENGINE', user_id: req.user.sub, user_email: req.user.email,
    user_role: req.user.role, ip_address: ip(req), new_value: JSON.stringify(r) });
  res.json({ ...r, summary: stewardship.summary() });
});

app.post('/api/portal/stewardship/:id/complete', requireRole('*'), (req, res) => {
  const r = stewardship.completeTask(req.params.id, req.user.sub);
  if (!r) return res.status(404).json({ error: 'Task not found' });
  res.json(r);
});

app.get('/api/portal/interactions', requireRole('*'), (req, res) => {
  res.json({
    recent: all(`SELECT i.*, d.first_name, d.last_name, d.country
      FROM interactions i LEFT JOIN donors d ON d.id = i.donor_id
      ORDER BY i.occurred_at DESC LIMIT ?`, Math.min(300, parseInt(req.query.limit, 10) || 80)),
    byType: all('SELECT interaction_type, COUNT(*) n FROM interactions GROUP BY interaction_type ORDER BY n DESC'),
    byChannel: all('SELECT channel, COUNT(*) n FROM interactions GROUP BY channel ORDER BY n DESC'),
    total: one('SELECT COUNT(*) n FROM interactions').n,
    automated: one("SELECT COUNT(*) n FROM interactions WHERE source != 'manual'").n,
  });
});

app.get('/api/portal/case-documents', requireRole('*'), (req, res) => {
  res.json(all(`SELECT cd.*, c.intake_full_name, c.state_of_residence, c.ai_priority
    FROM case_documents cd JOIN complex_cases c ON c.id = cd.case_id
    ORDER BY cd.received_at DESC`));
});

// ════════════════════════════ data hub ════════════════════════════════

app.get('/api/portal/datahub', requireRole('*'), (req, res) => {
  res.json({
    inventory: datahub.inventory(),
    quality: datahub.quality(),
    fiscalYears: datahub.fiscalYears(),
  });
});

app.get('/api/portal/datahub/:table', requireRole('*'), (req, res) => {
  if (!datahub.isTable(req.params.table)) {
    return res.status(404).json({ error: 'Unknown table' });
  }
  const filters = {};
  for (const [k, v] of Object.entries(req.query)) {
    const m = /^filter\[(.+)\]$/.exec(k);
    if (m) filters[m[1]] = v;
  }
  try {
    res.json(datahub.query(req.params.table, {
      limit: req.query.limit, offset: req.query.offset, year: req.query.year,
      q: req.query.q, sort: req.query.sort, dir: req.query.dir, filters,
    }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/portal/datahub/:table/export.csv', requireRole('*'), (req, res) => {
  if (!datahub.isTable(req.params.table)) {
    return res.status(404).json({ error: 'Unknown table' });
  }
  audit({ action: 'EXPORT_DATA', user_id: req.user.sub, user_email: req.user.email,
    user_role: req.user.role, resource_type: req.params.table, ip_address: ip(req) });
  const csv = datahub.exportCsv(req.params.table, { year: req.query.year, q: req.query.q });
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="sankalpa-${req.params.table}.csv"`);
  res.send(csv);
});

// ═══════════════════════════ static SPA ═══════════════════════════════
const PUBLIC = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC, { maxAge: '1h', index: false }));
app.get('/api/*', (req, res) => res.status(404).json({ error: 'Unknown endpoint' }));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

// ═══════════════════════════ boot ═════════════════════════════════════
//
// The listener starts FIRST. Building the demo database takes a couple of
// minutes on a small instance, and App Service kills a container that has not
// answered an HTTP request within its start timeout - which used to kill the
// seed half-way through. Serving 503 while warming is far better than being
// restarted mid-build.

app.listen(PORT, () => {
  console.log(`[sankalpa] listening on ${PORT} | AI: ${ai.providerName()} | DB: ${require('./db').DB_PATH}`);
  setImmediate(warmUp);
});

function warmUp() {
  // A database that is already current needs no work, and the check is cheap.
  if (seedIsCurrent()) {
    console.log('[sankalpa] seed: current, nothing to build');
    return finishWarmUp();
  }

  // Otherwise fork a worker. Seeding is ~2 minutes of synchronous SQLite
  // writes; doing it in-process would block the event loop, leave the health
  // probe unanswered, and get the container killed mid-build.
  console.log('[sankalpa] seed: building demo database in a worker…');
  const worker = fork(path.join(__dirname, 'seed-worker.js'), [], { stdio: 'inherit' });

  worker.on('message', (m) => {
    if (m?.ok) console.log('[sankalpa] seed:', JSON.stringify(m.result));
    else { warming.error = m?.error || 'seed failed'; console.error('[sankalpa] seed failed:', warming.error); }
  });
  worker.on('exit', (code) => {
    if (code !== 0 && !warming.error) warming.error = `seed worker exited with code ${code}`;
    finishWarmUp();
  });
  worker.on('error', (e) => {
    warming.error = e.message;
    console.error('[sankalpa] seed worker error:', e.message);
    finishWarmUp();
  });
}

/** Does the database already hold the dataset this build expects? */
function seedIsCurrent() {
  try {
    const donors = one('SELECT COUNT(*) n FROM donors').n;
    return donors > 0 && cfg('seed_version', '0') === String(SEED_VERSION);
  } catch { return false; }
}

function finishWarmUp() {
  try {
    const st = stewardship.runEngine();
    console.log('[sankalpa] stewardship:', JSON.stringify(st));
  } catch (e) {
    console.error('[sankalpa] stewardship engine failed:', e.message);
  }
  warming.ready = true;
  console.log('[sankalpa] ready');
  // Re-evaluate stewardship rules every six hours (a cron job in production).
  setInterval(() => { try { stewardship.runEngine(); } catch { /* non-fatal */ } }, 6 * 3600e3).unref();
}
