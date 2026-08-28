'use strict';
/**
 * SANKALPA - Persistent data layer.
 * Implements the full SRS section 6 schema (13 core tables + actuarial/reference
 * tables). SQLite in WAL mode; the database file lives on Azure App Service
 * persistent storage (/home/data) so every transaction and all historical data
 * survives restarts and redeploys.
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.SANKALPA_DATA_DIR ||
  (fs.existsSync('/home') ? '/home/data' : path.join(__dirname, '..', 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'sankalpa.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

db.exec(`
-- ======================= 6.1 users =======================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL, display_name TEXT,
  is_active INTEGER DEFAULT 1, is_email_verified INTEGER DEFAULT 0,
  mfa_totp_secret TEXT, mfa_phone TEXT,
  last_login_at TEXT, failed_login_count INTEGER DEFAULT 0, locked_until TEXT,
  password_changed_at TEXT, created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ======================= 6.2 donors ======================
CREATE TABLE IF NOT EXISTS donors (
  id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
  street_address TEXT, city TEXT, state TEXT, zip_code TEXT, country TEXT NOT NULL DEFAULT 'US',
  date_of_birth TEXT, gender TEXT, health_status TEXT DEFAULT 'Average',
  relationship_to_aolf TEXT NOT NULL DEFAULT 'supporter',
  pref_comm_method TEXT NOT NULL DEFAULT 'email',
  crm_tags TEXT DEFAULT '[]', total_donated REAL DEFAULT 0,
  first_gift_date TEXT, last_gift_date TEXT,
  is_legacy_society INTEGER DEFAULT 0, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_donors_email ON donors(email);
CREATE INDEX IF NOT EXISTS idx_donors_last_name ON donors(last_name);
CREATE INDEX IF NOT EXISTS idx_donors_country ON donors(country);

-- ======================= 6.9 funds =======================
CREATE TABLE IF NOT EXISTS funds (
  id TEXT PRIMARY KEY, fund_code TEXT UNIQUE NOT NULL, fund_name TEXT NOT NULL,
  fund_type TEXT NOT NULL, restriction_notes TEXT, restriction_status TEXT DEFAULT 'active',
  restriction_satisfied_date TEXT, target_amount REAL, current_balance REAL DEFAULT 0,
  is_endowment INTEGER DEFAULT 0, historic_dollar_value REAL,
  impact_unit TEXT, impact_cost_per_unit REAL, impact_line TEXT, blurb TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);

-- ============ 6.7 accounts (chart of accounts) ===========
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, account_code TEXT UNIQUE NOT NULL, account_name TEXT NOT NULL,
  account_type TEXT NOT NULL, account_subtype TEXT, net_asset_class TEXT,
  is_active INTEGER DEFAULT 1, parent_account_id TEXT REFERENCES accounts(id),
  normal_balance TEXT NOT NULL, description TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_code ON accounts(account_code);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);

-- ====================== 6.3 pledges ======================
CREATE TABLE IF NOT EXISTS pledges (
  id TEXT PRIMARY KEY, donor_id TEXT NOT NULL REFERENCES donors(id),
  pledge_type TEXT NOT NULL, status TEXT NOT NULL,
  face_value REAL, npv REAL, fund_id TEXT REFERENCES funds(id),
  restriction_type TEXT, restriction_notes TEXT,
  commitment_date TEXT, expected_receipt_date TEXT, received_date TEXT, lapsed_date TEXT,
  installment_total INTEGER, installment_amount REAL, installment_frequency TEXT,
  notes TEXT, assigned_dev_officer TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pledges_donor_id ON pledges(donor_id);
CREATE INDEX IF NOT EXISTS idx_pledges_status ON pledges(status);
CREATE INDEX IF NOT EXISTS idx_pledges_type ON pledges(pledge_type);

-- ========== 6.8 journal_entries / journal_lines ==========
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY, entry_date TEXT NOT NULL, description TEXT NOT NULL,
  reference_number TEXT, entry_type TEXT DEFAULT 'manual', status TEXT DEFAULT 'draft',
  posted_by TEXT REFERENCES users(id), posted_at TEXT,
  reversed_by_entry_id TEXT REFERENCES journal_entries(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_je_date ON journal_entries(entry_date);

CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY, journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id),
  line_number INTEGER NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id),
  fund_id TEXT REFERENCES funds(id),
  debit_amount REAL DEFAULT 0, credit_amount REAL DEFAULT 0,
  description TEXT, donor_id TEXT REFERENCES donors(id),
  created_at TEXT DEFAULT (datetime('now')),
  CHECK (debit_amount = 0 OR credit_amount = 0),
  CHECK (debit_amount >= 0 AND credit_amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_jl_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(account_id);

-- ==================== 6.4 transactions ===================
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, donor_id TEXT NOT NULL REFERENCES donors(id),
  pledge_id TEXT REFERENCES pledges(id), transaction_date TEXT NOT NULL,
  amount REAL NOT NULL, currency TEXT DEFAULT 'USD', payment_method TEXT NOT NULL,
  payment_reference TEXT, fund_id TEXT NOT NULL REFERENCES funds(id),
  status TEXT NOT NULL, is_recurring INTEGER DEFAULT 0, recurring_frequency TEXT,
  tribute_type TEXT, tribute_name TEXT,
  receipt_sent INTEGER DEFAULT 0, receipt_sent_at TEXT,
  journal_entry_id TEXT REFERENCES journal_entries(id),
  quid_pro_quo_value REAL DEFAULT 0,
  acknowledgment_sent INTEGER DEFAULT 0, acknowledgment_sent_at TEXT,
  source_channel TEXT DEFAULT 'web', country TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_donor ON transactions(donor_id);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_tx_fund ON transactions(fund_id);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_tx_method ON transactions(payment_method);

-- ===================== 6.5 documents =====================
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, donor_id TEXT REFERENCES donors(id),
  folder TEXT NOT NULL, file_name TEXT NOT NULL, file_size_bytes INTEGER DEFAULT 0,
  mime_type TEXT, storage_key TEXT, version_number INTEGER DEFAULT 1,
  parent_document_id TEXT REFERENCES documents(id),
  parse_status TEXT DEFAULT 'not_parsed', parse_confidence_min REAL,
  extracted_json TEXT, raw_text TEXT,
  uploaded_by_user_id TEXT REFERENCES users(id), description TEXT,
  tags TEXT DEFAULT '[]', expiry_date TEXT, shared_with TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_docs_donor ON documents(donor_id);
CREATE INDEX IF NOT EXISTS idx_docs_parse ON documents(parse_status);

-- =================== 6.6 planned_gifts ===================
CREATE TABLE IF NOT EXISTS planned_gifts (
  id TEXT PRIMARY KEY, donor_id TEXT NOT NULL REFERENCES donors(id),
  pledge_id TEXT REFERENCES pledges(id), gift_type TEXT NOT NULL,
  li_policy_number TEXT, li_insurer_name TEXT, li_face_value REAL,
  li_cash_surrender_val REAL, li_annual_premium REAL, li_aolf_percentage REAL,
  ira_institution TEXT, ira_account_value REAL, ira_aolf_percentage REAL, ira_growth_rate REAL,
  sec_ticker TEXT, sec_shares_pledged REAL, sec_cost_basis REAL, sec_market_value REAL,
  re_description TEXT, re_appraised_value REAL,
  bequest_type TEXT, bequest_amount REAL, bequest_percentage REAL,
  crt_trust_name TEXT, crt_trustee_name TEXT, crt_asset_value REAL,
  crt_payout_rate REAL, crt_type TEXT, crt_term_years INTEGER,
  cga_original_gift REAL, cga_acga_rate REAL, cga_annual_payment REAL,
  cga_payout_frequency TEXT, cga_actuarial_reserve REAL,
  npv REAL, npv_calculated_at TEXT, npv_discount_rate REAL,
  npv_optimistic REAL, npv_pessimistic REAL,
  projected_value REAL, expected_maturity_age INTEGER, expected_receipt_year INTEGER,
  document_id TEXT REFERENCES documents(id), ai_extracted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pg_donor ON planned_gifts(donor_id);
CREATE INDEX IF NOT EXISTS idx_pg_type ON planned_gifts(gift_type);

-- =================== 6.10 fixed_assets ===================
CREATE TABLE IF NOT EXISTS fixed_assets (
  id TEXT PRIMARY KEY, asset_tag TEXT UNIQUE NOT NULL, description TEXT NOT NULL,
  asset_category TEXT NOT NULL, acquisition_date TEXT NOT NULL, acquisition_cost REAL NOT NULL,
  salvage_value REAL DEFAULT 0, useful_life_years INTEGER NOT NULL,
  depreciation_method TEXT NOT NULL, accumulated_depreciation REAL DEFAULT 0,
  location TEXT, assigned_department TEXT, serial_number TEXT,
  status TEXT DEFAULT 'active', disposal_date TEXT, disposal_proceeds REAL,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);

-- ========= 6.11 audit_log (INSERT ONLY, immutable) ========
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, timestamp TEXT DEFAULT (datetime('now')),
  user_id TEXT, user_email TEXT, user_role TEXT,
  ip_address TEXT NOT NULL DEFAULT '0.0.0.0', user_agent TEXT,
  action TEXT NOT NULL, resource_type TEXT, resource_id TEXT,
  old_value TEXT, new_value TEXT, result TEXT NOT NULL DEFAULT 'success',
  failure_reason TEXT, session_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- ================== 6.12 complex_cases ===================
CREATE TABLE IF NOT EXISTS complex_cases (
  id TEXT PRIMARY KEY, donor_id TEXT REFERENCES donors(id),
  intake_full_name TEXT NOT NULL, intake_email TEXT NOT NULL, intake_phone TEXT,
  state_of_residence TEXT, country TEXT DEFAULT 'US',
  asset_types TEXT NOT NULL DEFAULT '[]', asset_value_range TEXT,
  description TEXT, pref_contact_method TEXT, best_contact_time TEXT,
  status TEXT DEFAULT 'received', ai_triage TEXT, ai_priority TEXT,
  assigned_consultant_id TEXT, assigned_dev_officer_id TEXT,
  planned_gift_id TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);

-- =================== 6.13 consultants ====================
CREATE TABLE IF NOT EXISTS consultants (
  id TEXT PRIMARY KEY, user_id TEXT, firm_name TEXT,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
  licensed_states TEXT DEFAULT '[]', specialties TEXT DEFAULT '[]',
  is_active INTEGER DEFAULT 1, max_concurrent_cases INTEGER DEFAULT 5,
  current_case_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);

-- ========= Reference / actuarial data (SRS 3.6.1) =========
CREATE TABLE IF NOT EXISTS mortality_table (
  age INTEGER NOT NULL, gender TEXT NOT NULL, life_expectancy REAL NOT NULL,
  PRIMARY KEY (age, gender)
);
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, effective_date TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY, text TEXT NOT NULL,
  attribution TEXT DEFAULT 'Gurudev Sri Sri Ravi Shankar', theme TEXT
);
CREATE TABLE IF NOT EXISTS investments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, asset_class TEXT NOT NULL,
  fund_id TEXT REFERENCES funds(id), cost_basis REAL NOT NULL, market_value REAL NOT NULL,
  target_allocation REAL, as_of_date TEXT, ytd_return REAL
);
CREATE TABLE IF NOT EXISTS endowment_history (
  id TEXT PRIMARY KEY, period TEXT NOT NULL, corpus REAL NOT NULL,
  contributions REAL DEFAULT 0, investment_return REAL DEFAULT 0,
  distributions REAL DEFAULT 0, pipeline_npv REAL DEFAULT 0, donor_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ai_interactions (
  id TEXT PRIMARY KEY, created_at TEXT DEFAULT (datetime('now')),
  kind TEXT NOT NULL, provider TEXT, prompt TEXT, response TEXT,
  latency_ms INTEGER, confidence REAL
);

-- ============ CRM interaction log (automated logging) ============
CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY, donor_id TEXT REFERENCES donors(id),
  occurred_at TEXT DEFAULT (datetime('now')),
  channel TEXT NOT NULL,            -- web | email | phone | meeting | event | system
  interaction_type TEXT NOT NULL,   -- gift | page_view | calculator_run | document_upload
                                    -- | case_intake | login | stewardship_touch | pledge_update
  subject TEXT, detail TEXT, source TEXT DEFAULT 'auto',
  logged_by TEXT, sentiment TEXT, related_resource TEXT
);
CREATE INDEX IF NOT EXISTS idx_int_donor ON interactions(donor_id);
CREATE INDEX IF NOT EXISTS idx_int_at ON interactions(occurred_at);

-- ============ Stewardship automation (triggers & tasks) ==========
CREATE TABLE IF NOT EXISTS stewardship_tasks (
  id TEXT PRIMARY KEY, donor_id TEXT REFERENCES donors(id),
  rule_key TEXT NOT NULL, title TEXT NOT NULL, detail TEXT,
  due_date TEXT, priority TEXT DEFAULT 'normal',
  channel TEXT DEFAULT 'email', status TEXT DEFAULT 'open',
  assigned_to TEXT, completed_at TEXT, completed_by TEXT,
  auto_generated INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stw_status ON stewardship_tasks(status);
CREATE INDEX IF NOT EXISTS idx_stw_due ON stewardship_tasks(due_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stw_unique ON stewardship_tasks(donor_id, rule_key, due_date);

-- ======= Securities price marks (pledged-equity valuation) =======
CREATE TABLE IF NOT EXISTS security_prices (
  ticker TEXT PRIMARY KEY, name TEXT, last_price REAL NOT NULL,
  prev_close REAL, as_of TEXT, source TEXT DEFAULT 'mark'
);

-- ============ Life insurance premium contributions ===============
CREATE TABLE IF NOT EXISTS policy_premiums (
  id TEXT PRIMARY KEY, planned_gift_id TEXT REFERENCES planned_gifts(id),
  donor_id TEXT REFERENCES donors(id), due_date TEXT NOT NULL,
  amount REAL NOT NULL, status TEXT DEFAULT 'scheduled',  -- scheduled | paid | missed
  paid_date TEXT, payment_method TEXT, transaction_id TEXT REFERENCES transactions(id)
);
CREATE INDEX IF NOT EXISTS idx_prem_gift ON policy_premiums(planned_gift_id);

-- ====== Consultant case documentation returned by the donor ======
CREATE TABLE IF NOT EXISTS case_documents (
  id TEXT PRIMARY KEY, case_id TEXT REFERENCES complex_cases(id),
  received_at TEXT DEFAULT (datetime('now')), document_type TEXT,
  allocation_amount REAL, allocation_percent REAL, instrument TEXT,
  consultant_firm TEXT, notes TEXT, verified INTEGER DEFAULT 0,
  planned_gift_id TEXT REFERENCES planned_gifts(id)
);
`);


/** Append-only audit trail (SRS 6.11 - never updated, never deleted). */
function audit(entry) {
  db.prepare(`INSERT INTO audit_log
    (id,timestamp,user_id,user_email,user_role,ip_address,user_agent,action,
     resource_type,resource_id,old_value,new_value,result,failure_reason,session_id)
    VALUES (@id,@timestamp,@user_id,@user_email,@user_role,@ip_address,@user_agent,@action,
     @resource_type,@resource_id,@old_value,@new_value,@result,@failure_reason,@session_id)`)
    .run({
      id: uuid(), timestamp: now(), user_id: null, user_email: null, user_role: null,
      ip_address: '0.0.0.0', user_agent: null, resource_type: null, resource_id: null,
      old_value: null, new_value: null, result: 'success', failure_reason: null,
      session_id: null, ...entry,
    });
}

/**
 * Post a balanced double-entry journal entry. Enforces the SRS 6.8 trigger
 * contract in application code: total debits must equal total credits.
 */
const postJournalEntry = db.transaction((entry, lines) => {
  const debits = lines.reduce((s, l) => s + (l.debit_amount || 0), 0);
  const credits = lines.reduce((s, l) => s + (l.credit_amount || 0), 0);
  if (Math.abs(debits - credits) > 0.005) {
    throw new Error(`Unbalanced journal entry: debits ${debits.toFixed(2)} != credits ${credits.toFixed(2)}`);
  }
  const id = entry.id || uuid();
  db.prepare(`INSERT INTO journal_entries
    (id,entry_date,description,reference_number,entry_type,status,posted_by,posted_at,created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id, entry.entry_date, entry.description, entry.reference_number || null,
    entry.entry_type || 'automated', entry.status || 'posted',
    entry.posted_by || null, entry.posted_at || now(), entry.created_by || null);
  const ins = db.prepare(`INSERT INTO journal_lines
    (id,journal_entry_id,line_number,account_id,fund_id,debit_amount,credit_amount,description,donor_id)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  lines.forEach((l, i) => ins.run(uuid(), id, i + 1, l.account_id, l.fund_id || null,
    l.debit_amount || 0, l.credit_amount || 0, l.description || null, l.donor_id || null));
  return id;
});

/** Automated CRM interaction logging - every donor touch, without manual entry. */
function logInteraction(e) {
  try {
    db.prepare(`INSERT INTO interactions
      (id,donor_id,occurred_at,channel,interaction_type,subject,detail,source,logged_by,related_resource)
      VALUES (@id,@donor_id,@occurred_at,@channel,@interaction_type,@subject,@detail,@source,@logged_by,@related_resource)`)
      .run({
        id: uuid(), occurred_at: now(), donor_id: null, channel: 'web', subject: null,
        detail: null, source: 'auto', logged_by: null, related_resource: null, ...e,
      });
  } catch { /* CRM logging must never break a donor action */ }
}

const cfg = (key, fallback) => {
  const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get(key);
  return row ? row.value : fallback;
};

module.exports = { db, uuid, now, audit, logInteraction, postJournalEntry, cfg, DB_PATH, DATA_DIR };
