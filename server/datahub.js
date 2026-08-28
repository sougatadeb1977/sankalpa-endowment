'use strict';
/**
 * SANKALPA - Data Hub.
 *
 * One place to see, filter, audit and export everything the platform holds.
 * A finance team cannot be asked to trust a system whose contents it cannot
 * inspect, so every table is browsable with the same grammar: filter, sort,
 * paginate, export.
 *
 * Table access is whitelisted and every identifier is validated against that
 * whitelist before it reaches SQL. Values are always bound as parameters.
 */
const { db } = require('./db');

/** The catalogue. Nothing outside this map is reachable. */
const CATALOG = {
  transactions: {
    label: 'Transactions', group: 'Giving',
    description: 'Every gift received, with its payment channel, fund designation and posted journal entry.',
    dateColumn: 'transaction_date',
    columns: ['transaction_date', 'amount', 'currency', 'payment_method', 'status', 'fund_id', 'donor_id', 'payment_reference', 'is_recurring', 'receipt_sent', 'journal_entry_id', 'country'],
    search: ['payment_method', 'payment_reference', 'status', 'country'],
  },
  donors: {
    label: 'Donors', group: 'Constituents',
    description: 'The supporter register, including denormalised lifetime giving totals.',
    dateColumn: 'created_at',
    columns: ['first_name', 'last_name', 'email', 'city', 'state', 'country', 'total_donated', 'first_gift_date', 'last_gift_date', 'is_legacy_society', 'relationship_to_aolf', 'created_at'],
    search: ['first_name', 'last_name', 'email', 'country', 'city'],
  },
  pledges: {
    label: 'Pledges', group: 'Giving',
    description: 'Commitments and intentions, by instrument and status.',
    dateColumn: 'commitment_date',
    columns: ['pledge_type', 'status', 'face_value', 'npv', 'restriction_type', 'commitment_date', 'expected_receipt_date', 'donor_id', 'fund_id'],
    search: ['pledge_type', 'status', 'restriction_type'],
  },
  planned_gifts: {
    label: 'Planned gifts', group: 'Giving',
    description: 'Deferred gift instruments with their actuarial valuations.',
    dateColumn: 'created_at',
    columns: ['gift_type', 'npv', 'projected_value', 'npv_discount_rate', 'expected_receipt_year', 'expected_maturity_age', 'ai_extracted', 'donor_id', 'created_at'],
    search: ['gift_type'],
  },
  journal_entries: {
    label: 'Journal entries', group: 'Accounting',
    description: 'The general journal header — one row per posted entry.',
    dateColumn: 'entry_date',
    columns: ['entry_date', 'reference_number', 'description', 'entry_type', 'status', 'posted_at'],
    search: ['description', 'reference_number', 'entry_type', 'status'],
  },
  journal_lines: {
    label: 'Journal lines', group: 'Accounting',
    description: 'Every debit and credit in the ledger. This is the system of record.',
    dateColumn: null,
    columns: ['journal_entry_id', 'line_number', 'account_id', 'fund_id', 'debit_amount', 'credit_amount', 'description', 'donor_id'],
    search: ['description'],
  },
  accounts: {
    label: 'Chart of accounts', group: 'Accounting',
    description: 'The GAAP chart of accounts with net asset classification.',
    dateColumn: null,
    columns: ['account_code', 'account_name', 'account_type', 'account_subtype', 'net_asset_class', 'normal_balance', 'is_active'],
    search: ['account_code', 'account_name', 'account_type', 'net_asset_class'],
  },
  funds: {
    label: 'Funds', group: 'Accounting',
    description: 'Restricted and unrestricted funds with campaign targets.',
    dateColumn: null,
    columns: ['fund_code', 'fund_name', 'fund_type', 'target_amount', 'current_balance', 'is_endowment', 'restriction_status'],
    search: ['fund_code', 'fund_name', 'fund_type'],
  },
  fixed_assets: {
    label: 'Fixed assets', group: 'Accounting',
    description: 'The capital asset register and accumulated depreciation.',
    dateColumn: 'acquisition_date',
    columns: ['asset_tag', 'description', 'asset_category', 'acquisition_date', 'acquisition_cost', 'accumulated_depreciation', 'useful_life_years', 'status', 'location'],
    search: ['asset_tag', 'description', 'asset_category', 'status'],
  },
  documents: {
    label: 'Documents', group: 'Vault',
    description: 'The estate document vault and AI parse status.',
    dateColumn: 'created_at',
    columns: ['file_name', 'folder', 'parse_status', 'parse_confidence_min', 'file_size_bytes', 'donor_id', 'created_at'],
    search: ['file_name', 'folder', 'parse_status'],
  },
  interactions: {
    label: 'CRM interactions', group: 'Stewardship',
    description: 'Automatically captured donor activity.',
    dateColumn: 'occurred_at',
    columns: ['occurred_at', 'channel', 'interaction_type', 'subject', 'detail', 'source', 'donor_id'],
    search: ['interaction_type', 'channel', 'subject', 'source'],
  },
  stewardship_tasks: {
    label: 'Stewardship tasks', group: 'Stewardship',
    description: 'Tasks raised by the rules engine.',
    dateColumn: 'due_date',
    columns: ['due_date', 'rule_key', 'title', 'priority', 'channel', 'status', 'donor_id', 'created_at'],
    search: ['rule_key', 'title', 'priority', 'status'],
  },
  complex_cases: {
    label: 'Complex cases', group: 'Constituents',
    description: 'Complex-asset enquiries and their triage outcome.',
    dateColumn: 'created_at',
    columns: ['intake_full_name', 'intake_email', 'state_of_residence', 'asset_value_range', 'ai_priority', 'status', 'created_at'],
    search: ['intake_full_name', 'state_of_residence', 'ai_priority', 'status'],
  },
  consultants: {
    label: 'Consultant panel', group: 'Constituents',
    description: 'The multi-state adviser network and its capacity.',
    dateColumn: null,
    columns: ['firm_name', 'first_name', 'last_name', 'email', 'licensed_states', 'specialties', 'max_concurrent_cases', 'current_case_count', 'is_active'],
    search: ['firm_name', 'first_name', 'last_name', 'licensed_states'],
  },
  policy_premiums: {
    label: 'Insurance premiums', group: 'Giving',
    description: 'Premium schedule and payment history on life insurance gifts.',
    dateColumn: 'due_date',
    columns: ['due_date', 'amount', 'status', 'paid_date', 'payment_method', 'planned_gift_id', 'donor_id'],
    search: ['status', 'payment_method'],
  },
  security_prices: {
    label: 'Security prices', group: 'Reference',
    description: 'Market marks used to value pledged equity positions.',
    dateColumn: 'as_of',
    columns: ['ticker', 'name', 'last_price', 'prev_close', 'as_of', 'source'],
    search: ['ticker', 'name'],
  },
  investments: {
    label: 'Investment portfolio', group: 'Reference',
    description: 'Endowment portfolio holdings and allocation.',
    dateColumn: 'as_of_date',
    columns: ['name', 'asset_class', 'cost_basis', 'market_value', 'target_allocation', 'ytd_return', 'as_of_date'],
    search: ['name', 'asset_class'],
  },
  endowment_history: {
    label: 'Endowment history', group: 'Reference',
    description: 'Quarterly corpus, contributions, return and pipeline.',
    dateColumn: null,
    columns: ['period', 'corpus', 'contributions', 'investment_return', 'distributions', 'pipeline_npv', 'donor_count'],
    search: ['period'],
  },
  audit_log: {
    label: 'Audit log', group: 'Governance',
    description: 'Append-only record of every action. Never updated, never deleted.',
    dateColumn: 'timestamp',
    columns: ['timestamp', 'user_email', 'user_role', 'action', 'resource_type', 'resource_id', 'ip_address', 'result'],
    search: ['user_email', 'action', 'resource_type', 'result'],
  },
  ai_interactions: {
    label: 'AI interactions', group: 'Governance',
    description: 'Every AI call, its provider, latency and confidence — for model governance.',
    dateColumn: 'created_at',
    columns: ['created_at', 'kind', 'provider', 'latency_ms', 'confidence'],
    search: ['kind', 'provider'],
  },
  case_documents: {
    label: 'Returned case documents', group: 'Constituents',
    description: 'Outcomes returned by donors after consultant engagement.',
    dateColumn: 'received_at',
    columns: ['received_at', 'document_type', 'instrument', 'allocation_amount', 'allocation_percent', 'consultant_firm', 'verified', 'case_id'],
    search: ['document_type', 'instrument', 'consultant_firm'],
  },
  quotes: {
    label: 'Quote corpus', group: 'Reference',
    description: 'Curated quotations used across the donor hub.',
    dateColumn: null,
    columns: ['text', 'attribution', 'theme'],
    search: ['text', 'theme'],
  },
};

const isTable = (t) => Object.prototype.hasOwnProperty.call(CATALOG, t);

/** Inventory: what exists, how much of it, and over what period. */
function inventory() {
  const tables = Object.entries(CATALOG).map(([name, meta]) => {
    const rows = db.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n;
    let range = null;
    if (meta.dateColumn) {
      const r = db.prepare(
        `SELECT MIN(${meta.dateColumn}) lo, MAX(${meta.dateColumn}) hi FROM ${name}`).get();
      if (r && r.lo) range = { from: String(r.lo).slice(0, 10), to: String(r.hi).slice(0, 10) };
    }
    return {
      name, label: meta.label, group: meta.group, description: meta.description,
      rows, columns: meta.columns.length, dateColumn: meta.dateColumn, range,
    };
  });
  const groups = [...new Set(tables.map((t) => t.group))];
  return {
    tables: tables.sort((a, b) => b.rows - a.rows),
    groups,
    totalRows: tables.reduce((s, t) => s + t.rows, 0),
    totalTables: tables.length,
    pageSizeBytes: db.prepare('PRAGMA page_size').get().page_size,
    pageCount: db.prepare('PRAGMA page_count').get().page_count,
    journalMode: db.prepare('PRAGMA journal_mode').get().journal_mode,
    foreignKeys: db.prepare('PRAGMA foreign_keys').get().foreign_keys === 1,
  };
}

/** Paged, filtered, sorted read of one whitelisted table. */
function query(table, opts = {}) {
  if (!isTable(table)) throw new Error('Unknown table');
  const meta = CATALOG[table];
  const limit = Math.min(500, Math.max(1, parseInt(opts.limit, 10) || 50));
  const offset = Math.max(0, parseInt(opts.offset, 10) || 0);

  const where = [];
  const params = [];

  if (opts.year && meta.dateColumn && /^\d{4}$/.test(String(opts.year))) {
    where.push(`substr(${meta.dateColumn},1,4) = ?`);
    params.push(String(opts.year));
  }
  if (opts.q && meta.search.length) {
    const clause = meta.search.map((c) => `lower(COALESCE(${c},'')) LIKE ?`).join(' OR ');
    where.push(`(${clause})`);
    meta.search.forEach(() => params.push(`%${String(opts.q).toLowerCase()}%`));
  }
  // Column filters arrive as filter[column]=value; the column must be known.
  for (const [col, val] of Object.entries(opts.filters || {})) {
    if (!meta.columns.includes(col)) continue;
    where.push(`${col} = ?`);
    params.push(val);
  }

  const sortCol = meta.columns.includes(opts.sort) ? opts.sort
    : (meta.dateColumn || meta.columns[0]);
  const sortDir = String(opts.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const cols = meta.columns.join(', ');

  const total = db.prepare(`SELECT COUNT(*) n FROM ${table} ${whereSql}`).get(...params).n;
  const rows = db.prepare(
    `SELECT ${cols} FROM ${table} ${whereSql} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  // Distinct values for the small-cardinality columns, so the UI can offer
  // real filter choices instead of a free-text box.
  const facets = {};
  for (const c of meta.search) {
    const vals = db.prepare(
      `SELECT ${c} v, COUNT(*) n FROM ${table} WHERE ${c} IS NOT NULL
       GROUP BY ${c} HAVING n > 0 ORDER BY n DESC LIMIT 12`).all();
    if (vals.length > 1 && vals.length <= 12) facets[c] = vals;
  }

  const years = meta.dateColumn
    ? db.prepare(`SELECT substr(${meta.dateColumn},1,4) y, COUNT(*) n FROM ${table}
        WHERE ${meta.dateColumn} IS NOT NULL GROUP BY y ORDER BY y DESC`).all()
    : [];

  return {
    table, label: meta.label, description: meta.description,
    columns: meta.columns, rows, total, limit, offset,
    sort: sortCol, dir: sortDir.toLowerCase(), facets, years,
    hasMore: offset + rows.length < total,
  };
}

/** RFC 4180 CSV of the current filter selection (capped). */
function exportCsv(table, opts = {}) {
  const r = query(table, { ...opts, limit: 5000, offset: 0 });
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = r.columns.join(',');
  const body = r.rows.map((row) => r.columns.map((c) => esc(row[c])).join(',')).join('\n');
  return `${head}\n${body}\n`;
}

/**
 * Integrity checks a finance team would actually run before an audit.
 * These read the live database; nothing is precomputed.
 */
function quality() {
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const checks = [];
  const add = (name, detail, okFlag, severity = 'error') =>
    checks.push({ name, detail, status: okFlag ? 'pass' : severity });

  const bal = one(`SELECT COALESCE(SUM(debit_amount),0) d, COALESCE(SUM(credit_amount),0) c
    FROM journal_lines l JOIN journal_entries e ON e.id=l.journal_entry_id WHERE e.status='posted'`);
  add('General ledger in balance',
    `Debits $${Math.round(bal.d).toLocaleString('en-US')} against credits $${Math.round(bal.c).toLocaleString('en-US')}`,
    Math.abs(bal.d - bal.c) < 0.05);

  const unbal = db.prepare(`SELECT COUNT(*) n FROM (
    SELECT e.id FROM journal_entries e JOIN journal_lines l ON l.journal_entry_id=e.id
    GROUP BY e.id HAVING ABS(COALESCE(SUM(l.debit_amount),0) - COALESCE(SUM(l.credit_amount),0)) > 0.005)`).get().n;
  add('Every entry balances individually', `${unbal} unbalanced entries`, unbal === 0);

  const orphanLines = one(`SELECT COUNT(*) n FROM journal_lines l
    LEFT JOIN journal_entries e ON e.id=l.journal_entry_id WHERE e.id IS NULL`).n;
  add('No orphaned journal lines', `${orphanLines} lines without a parent entry`, orphanLines === 0);

  const orphanTx = one(`SELECT COUNT(*) n FROM transactions t
    LEFT JOIN donors d ON d.id=t.donor_id WHERE d.id IS NULL`).n;
  add('Every transaction has a donor', `${orphanTx} orphaned transactions`, orphanTx === 0);

  const noJe = one("SELECT COUNT(*) n FROM transactions WHERE status='completed' AND journal_entry_id IS NULL").n;
  add('Completed gifts are all posted to the ledger',
    `${noJe} completed gifts without a journal entry`, noJe === 0);

  const badLine = one('SELECT COUNT(*) n FROM journal_lines WHERE debit_amount > 0 AND credit_amount > 0').n;
  add('No line is both a debit and a credit', `${badLine} violations`, badLine === 0);

  const negative = one('SELECT COUNT(*) n FROM journal_lines WHERE debit_amount < 0 OR credit_amount < 0').n;
  add('No negative amounts in the ledger', `${negative} negative lines`, negative === 0);

  const npvNull = one('SELECT COUNT(*) n FROM planned_gifts WHERE npv IS NULL').n;
  add('Every planned gift is valued', `${npvNull} gifts without an NPV`, npvNull === 0, 'warn');

  const staleNpv = one(`SELECT COUNT(*) n FROM planned_gifts
    WHERE npv_calculated_at IS NULL OR julianday('now') - julianday(npv_calculated_at) > 40`).n;
  add('Valuations are current', `${staleNpv} gifts revalued more than 40 days ago`, staleNpv === 0, 'warn');

  const noEmail = one("SELECT COUNT(*) n FROM donors WHERE email IS NULL OR email = ''").n;
  add('Every donor is contactable', `${noEmail} donors without an email address`, noEmail === 0, 'warn');

  const dupEmail = db.prepare(`SELECT COUNT(*) n FROM (
    SELECT lower(email) e FROM donors WHERE deleted_at IS NULL GROUP BY e HAVING COUNT(*) > 1)`).get().n;
  add('No duplicate donor records', `${dupEmail} email addresses appear more than once`, dupEmail === 0, 'warn');

  const hitl = one("SELECT COUNT(*) n FROM documents WHERE parse_status='needs_review'").n;
  add('Human review queue within tolerance',
    `${hitl} documents awaiting confirmation`, hitl < 40, 'warn');

  return {
    checks,
    passed: checks.filter((c) => c.status === 'pass').length,
    warnings: checks.filter((c) => c.status === 'warn').length,
    failures: checks.filter((c) => c.status === 'error').length,
  };
}

/** Fiscal years present in the ledger, for the global period selector. */
function fiscalYears() {
  return db.prepare(`SELECT substr(entry_date,1,4) year, COUNT(*) entries,
      COALESCE(SUM((SELECT SUM(debit_amount) FROM journal_lines l WHERE l.journal_entry_id = e.id)),0) volume
    FROM journal_entries e WHERE e.status='posted'
    GROUP BY year ORDER BY year DESC`).all();
}

module.exports = { CATALOG, isTable, inventory, query, exportCsv, quality, fiscalYears };
