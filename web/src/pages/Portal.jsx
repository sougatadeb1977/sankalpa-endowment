import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api, setToken, money, compact, num, pct, dateFmt, titleize, Loading,
  LineChart, BarList, ScenarioChart, Donut, PALETTE, useDebounced,
} from '../lib.jsx';

/* ═════════════════════════ information architecture ═════════════════════════
   Grouped by what a finance team actually does, rather than by which screen was
   built first. The period selector in the top bar drives every view that has a
   period, so "which year am I looking at" is answered once, globally.
   ═════════════════════════════════════════════════════════════════════════ */

const NAV = [
  ['Overview', [
    ['dashboard', 'Executive summary'],
    ['yoy', 'Year on year'],
    ['forecast', 'Actuarial forecast'],
  ]],
  ['Fund accounting', [
    ['journal', 'General journal'],
    ['trial', 'Trial balance'],
    ['statements', 'Financial statements'],
    ['coa', 'Chart of accounts'],
  ]],
  ['Portfolio', [
    ['assets', 'Insurance & securities'],
  ]],
  ['Relationships', [
    ['donors', 'Donors & pledges'],
    ['stewardship', 'Stewardship'],
    ['crm', 'CRM activity'],
    ['cases', 'Complex cases'],
    ['documents', 'Document review'],
  ]],
  ['System', [
    ['datahub', 'Data hub'],
    ['ai', 'AI analyst'],
    ['compliance', 'Compliance & audit'],
    ['golive', 'Go-live plan'],
  ]],
];
const LABELS = Object.fromEntries(NAV.flatMap(([, items]) => items));

/* ────────────────────────── shared building blocks ────────────────────────── */

function Head({ title, lede, actions }) {
  return (
    <div className="phead">
      <div className="phead-row">
        <div>
          <h1>{title}</h1>
          {lede && <p>{lede}</p>}
        </div>
        {actions && <div className="phead-actions">{actions}</div>}
      </div>
    </div>
  );
}

function Panel({ title, tools, note, flush, children }) {
  return (
    <section className="panel">
      {(title || tools) && (
        <div className="panel-head">
          {title && <span className="panel-title">{title}</span>}
          {tools && <div className="panel-tools">{tools}</div>}
        </div>
      )}
      <div className={`panel-body${flush ? ' flush' : ''}`}>{children}</div>
      {note && <div className="panel-note">{note}</div>}
    </section>
  );
}

function Metrics({ items }) {
  return (
    <div className="metrics">
      {items.map(([lab, val, sub, delta]) => (
        <div className="metric" key={lab}>
          <div className="metric-lab">{lab}</div>
          <div className="metric-val">{val}</div>
          {(sub || delta != null) && (
            <div className="metric-sub">
              {delta != null && (
                <span className={delta >= 0 ? 'delta-up' : 'delta-down'}>
                  {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%{' '}
                </span>
              )}
              {sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Fetch that re-runs when its dependencies change, with a manual reload. */
function usePanel(path, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api(path)
      .then((d) => live && setState({ data: d, loading: false, error: null }))
      .catch((e) => live && setState({ data: null, loading: false, error: e.message }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload };
}

const yq = (year) => (year ? `?year=${year}` : '');

/* ═══════════════════════════════ login ═══════════════════════════════ */

function Login({ onIn }) {
  const [stage, setStage] = useState('password');
  const [email, setEmail] = useState('finance@sankalpa.org');
  const [password, setPassword] = useState('Sankalpa2026!');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function step1(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api('/auth/staff-login', { method: 'POST', body: { email, password } });
      setChallenge(r.challenge); setStage('mfa');
      if (r.demoCode) setCode(r.demoCode);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }
  async function step2(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api('/auth/staff-mfa', { method: 'POST', body: { challenge, code } });
      setToken(r.token); onIn(r.user);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <div style={{ background: 'var(--lotus)', minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 430 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="brand-name" style={{ fontSize: 26 }}>SANKALPA</div>
          <div className="brand-sub">Fund Accounting &amp; Financial Management</div>
        </div>
        <form className="card card-feature" onSubmit={stage === 'password' ? step1 : step2}>
          {stage === 'password' ? (
            <>
              <div className="overline">Secure sign in</div>
              <div className="field"><label htmlFor="pe">Work email</label>
                <input id="pe" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div className="field"><label htmlFor="pp">Password</label>
                <input id="pp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              {err && <p className="err">{err}</p>}
              <button className="btn" style={{ width: '100%' }} disabled={busy}>
                {busy ? <span className="spinner" /> : 'Continue'}
              </button>
            </>
          ) : (
            <>
              <div className="overline">Two-factor authentication</div>
              <p className="small muted">Enter the six-digit code from your authenticator app.</p>
              <div className="field">
                <label htmlFor="mc">Verification code</label>
                <input id="mc" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6}
                  style={{ fontFamily: 'var(--mono)', fontSize: 22, letterSpacing: '.4em', textAlign: 'center' }} required />
              </div>
              {err && <p className="err">{err}</p>}
              <button className="btn" style={{ width: '100%' }} disabled={busy}>
                {busy ? <span className="spinner" /> : 'Verify and sign in'}
              </button>
            </>
          )}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 22, paddingTop: 16 }}>
            <div className="overline" style={{ marginBottom: 8 }}>Demonstration credentials</div>
            <p className="tiny muted" style={{ marginBottom: 8 }}>
              Password <code>Sankalpa2026!</code> · TOTP code <code>314159</code>
            </p>
            <div className="chip-row">
              {[['finance@sankalpa.org', 'Finance Director'], ['director@sankalpa.org', 'Super Admin'],
                ['auditor@sankalpa.org', 'Auditor'], ['board@sankalpa.org', 'Board']].map(([e, r]) => (
                <button type="button" key={e} className="chip chip-sm"
                  onClick={() => { setEmail(e); setStage('password'); }}>{r}</button>
              ))}
            </div>
          </div>
        </form>
        <p style={{ textAlign: 'center', marginTop: 18 }}>
          <Link to="/" className="link-gold">← Back to the donor hub</Link>
        </p>
      </div>
    </div>
  );
}

/* ═════════════════════════ overview: dashboard ═══════════════════════ */

function Dashboard({ year }) {
  const { data: d, loading } = usePanel(`/portal/dashboard${yq(year)}`, [year]);
  if (loading || !d) return <Loading label="Loading the campaign position" />;
  const secured = d.cashRaised + d.pipeline.base;
  return (
    <>
      <Head title="Executive summary"
        lede={`The endowment campaign at a glance. Period: ${year || 'inception to date'}.`} />
      <Metrics items={[
        ['Total secured', compact(secured), `${pct(d.percentComplete)} of the $45M goal`],
        ['Cash received', compact(d.cashRaised), `${num(d.transactionCount)} transactions posted`],
        ['Pipeline present value', compact(d.pipeline.base), `${d.pipeline.count} planned gifts`],
        [year ? `Received in ${year}` : 'Received this year', compact(d.periodCash),
          `${num(d.periodGifts)} gifts from ${num(d.periodDonors)} donors`],
        ['Supporters', num(d.donors), `${d.legacyCircle} in the Legacy Circle`],
      ]} />

      <div className="split" style={{ gap: 22 }}>
        <Panel title="Endowment corpus by quarter">
          <LineChart height={240}
            data={d.endowmentHistory.map((h) => ({ label: h.period.replace('-', ' '), value: h.corpus }))} />
        </Panel>
        <Panel title="Investment allocation">
          <Donut size={180}
            centerValue={compact(d.investments.reduce((s, i) => s + i.market_value, 0))}
            centerLabel="MARKET VALUE"
            slices={d.investments.map((i, k) => ({
              label: i.name, value: i.market_value, color: PALETTE[k % PALETTE.length],
            }))} />
        </Panel>
      </div>

      <div className="split-even" style={{ gap: 22 }}>
        <Panel title="Fund balances against target">
          {d.fundBalances.map((f, i) => (
            <div key={f.fund_code} style={{ marginBottom: 16 }}>
              <div className="between" style={{ marginBottom: 5 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{f.fund_name}</span>
                <span className="num tiny muted">{compact(f.balance)} of {compact(f.target_amount)}</span>
              </div>
              <div style={{ height: 5, background: 'var(--border)' }}>
                <div style={{
                  height: '100%', width: `${Math.min(100, (f.balance / f.target_amount) * 100)}%`,
                  background: PALETTE[i % PALETTE.length],
                }} />
              </div>
            </div>
          ))}
        </Panel>
        <Panel title="Pipeline by instrument">
          <BarList items={d.byType.map((t, i) => ({
            label: titleize(t.type), value: t.npv, note: `${t.count} gifts`,
            color: PALETTE[i % PALETTE.length],
          }))} />
        </Panel>
      </div>

      <div className="split" style={{ gap: 22 }}>
        <Panel title="Most recent gifts" flush>
          <div className="table-scroll">
            <table className="ledger">
              <thead><tr><th>Date</th><th>Donor</th><th>Fund</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {d.recentGifts.map((g, i) => (
                  <tr key={i}>
                    <td className="code">{dateFmt(g.transaction_date)}</td>
                    <td>{g.first_name} {g.last_name.charAt(0)}. <span className="muted">{g.country}</span></td>
                    <td>{g.fund_name}</td>
                    <td className="r">{money(g.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Requires attention">
          {[
            ['Documents awaiting human review', num(d.hitlQueue)],
            ['Open complex-asset cases', num(d.openCases)],
            ['Average gift size', money(d.avgGift, 2)],
            ['Discount rate in force (IRS §7520)', pct(d.discountRate * 100, 2)],
          ].map(([l, v]) => (
            <div key={l} className="between" style={{ padding: '13px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13 }}>{l}</span>
              <span className="num" style={{ fontWeight: 700, fontSize: 15 }}>{v}</span>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}

/* ═════════════════════════ overview: year on year ════════════════════ */

function YearOnYear() {
  const { data: d, loading } = usePanel('/portal/yoy', []);
  const [metric, setMetric] = useState('revenue');
  if (loading || !d) return <Loading label="Comparing fiscal years" />;
  const rows = d.years;
  const latest = rows[rows.length - 1] || {};
  const fundYears = [...new Set(d.byFundYear.map((r) => r.year))];
  const funds = [...new Set(d.byFundYear.map((r) => r.fund_name))];

  return (
    <>
      <Head title="Year on year"
        lede="Six fiscal years of the general ledger, compared. Every figure is computed from posted journal entries, not from a cached report." />
      <Metrics items={[
        ['Fiscal years on file', String(rows.length), `${rows[0]?.year} to ${latest.year}`],
        [`Revenue ${latest.year}`, compact(latest.revenue), 'against prior year', latest.revenueGrowthPct],
        [`Cash received ${latest.year}`, compact(latest.cashReceived), 'against prior year', latest.cashGrowthPct],
        ['Programme expense ratio', latest.programRatio ? pct(latest.programRatio, 1) : '—',
          'of total expenses, latest year'],
      ]} />

      <Panel title="Trend" tools={
        <div className="filters">
          {[['revenue', 'Revenue'], ['expense', 'Expense'], ['cashReceived', 'Cash received'],
            ['donors', 'Donors'], ['averageGift', 'Average gift']].map(([k, l]) => (
            <button key={k} className={`chip chip-sm${metric === k ? ' on' : ''}`}
              onClick={() => setMetric(k)}>{l}</button>
          ))}
        </div>
      }>
        <LineChart height={250}
          data={rows.map((r) => ({ label: r.year, value: r[metric] }))}
          color={metric === 'expense' ? 'var(--earth)' : 'var(--saffron)'} />
      </Panel>

      <Panel title="Statement of activities by fiscal year" flush
        note="Revenue includes contributions, investment income and market movement. Expenses are shown on functional lines, as ASU 2016-14 requires.">
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Fiscal year</th><th className="r">Entries</th><th className="r">Revenue</th>
                <th className="r">Growth</th><th className="r">Expenses</th>
                <th className="r">Change in net assets</th><th className="r">Programme %</th>
                <th className="r">Cash received</th><th className="r">Gifts</th>
                <th className="r">Donors</th><th className="r">Average gift</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year}>
                  <td style={{ fontWeight: 700 }}>{r.year}</td>
                  <td className="r code">{num(r.entries)}</td>
                  <td className="r">{money(r.revenue)}</td>
                  <td className="r">
                    {r.revenueGrowthPct == null ? '—' : (
                      <span className={r.revenueGrowthPct >= 0 ? 'delta-up' : 'delta-down'}>
                        {r.revenueGrowthPct >= 0 ? '+' : ''}{r.revenueGrowthPct.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="r">{money(r.expense)}</td>
                  <td className="r" style={{ fontWeight: 600 }}>{money(r.changeInNetAssets)}</td>
                  <td className="r">{r.programRatio ? pct(r.programRatio, 0) : '—'}</td>
                  <td className="r">{money(r.cashReceived)}</td>
                  <td className="r code">{num(r.gifts)}</td>
                  <td className="r code">{num(r.donors)}</td>
                  <td className="r">{money(r.averageGift)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>All years</td>
                <td className="r">{num(rows.reduce((s, r) => s + r.entries, 0))}</td>
                <td className="r">{money(rows.reduce((s, r) => s + r.revenue, 0))}</td>
                <td className="r" />
                <td className="r">{money(rows.reduce((s, r) => s + r.expense, 0))}</td>
                <td className="r">{money(rows.reduce((s, r) => s + r.changeInNetAssets, 0))}</td>
                <td className="r" />
                <td className="r">{money(rows.reduce((s, r) => s + r.cashReceived, 0))}</td>
                <td className="r">{num(rows.reduce((s, r) => s + r.gifts, 0))}</td>
                <td className="r" /><td className="r" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <Panel title="Cash received by fund and fiscal year" flush>
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr><th>Fund</th>{fundYears.map((y) => <th key={y} className="r">{y}</th>)}<th className="r">Total</th></tr>
            </thead>
            <tbody>
              {funds.map((fn) => {
                const cells = fundYears.map((y) =>
                  d.byFundYear.find((r) => r.year === y && r.fund_name === fn)?.v || 0);
                return (
                  <tr key={fn}>
                    <td>{fn}</td>
                    {cells.map((v, i) => <td key={i} className="r">{v ? money(v) : '—'}</td>)}
                    <td className="r" style={{ fontWeight: 700 }}>{money(cells.reduce((a, b) => a + b, 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

/* ═════════════════════════ fund accounting ═══════════════════════════ */

function Journal({ year }) {
  const [q, setQ] = useState('');
  const [account, setAccount] = useState('');
  const [fund, setFund] = useState('');
  const [type, setType] = useState('');
  const [offset, setOffset] = useState(0);
  const dq = useDebounced(q, 350);
  const [accounts, setAccounts] = useState([]);
  const [funds, setFunds] = useState([]);

  useEffect(() => {
    api('/portal/accounts').then(setAccounts).catch(() => {});
    api('/funds').then(setFunds).catch(() => {});
  }, []);
  useEffect(() => { setOffset(0); }, [year, dq, account, fund, type]);

  const path = `/portal/journal?limit=25&offset=${offset}`
    + (year ? `&year=${year}` : '') + (dq ? `&q=${encodeURIComponent(dq)}` : '')
    + (account ? `&account=${account}` : '') + (fund ? `&fund=${fund}` : '')
    + (type ? `&type=${type}` : '');
  const { data: d, loading, reload } = usePanel(path, [path]);

  const [entry, setEntry] = useState({
    entryDate: new Date().toISOString().slice(0, 10), description: '', reference: '',
    lines: [{ accountCode: '1000', debit: '', credit: '' }, { accountCode: '4000', debit: '', credit: '' }],
  });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const dr = entry.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const cr = entry.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(dr - cr) < 0.005 && dr > 0;

  async function post() {
    setErr(null); setMsg(null);
    try {
      const r = await api('/portal/journal', { method: 'POST', body: entry });
      setMsg(`Entry ${r.journalEntryId.slice(0, 8).toUpperCase()} posted.`);
      setEntry({ ...entry, description: '', reference: '', lines: entry.lines.map((l) => ({ ...l, debit: '', credit: '' })) });
      reload();
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <Head title="General journal"
        lede="Every posted entry, filterable by period, account, fund, type and free text. This is the system of record — nothing is summarised on the way in." />

      <Panel title="Filter" tools={
        <button className="clear" onClick={() => { setQ(''); setAccount(''); setFund(''); setType(''); }}>
          Clear all
        </button>
      }>
        <div className="filters">
          <input placeholder="Search description or reference" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.account_name}</option>
            ))}
          </select>
          <select value={fund} onChange={(e) => setFund(e.target.value)}>
            <option value="">All funds</option>
            {funds.map((f) => <option key={f.fund_code} value={f.fund_code}>{f.fund_name}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All entry types</option>
            {(d?.entryTypes || []).map((t) => (
              <option key={t.t} value={t.t}>{titleize(t.t)} ({t.n})</option>
            ))}
          </select>
        </div>
      </Panel>

      <Panel
        title={`Entries${d ? ` — ${num(d.total)} matching` : ''}`}
        flush
        tools={d && (
          <>
            <button className="btn btn-sm btn-ghost" disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</button>
            <span className="tiny muted num">
              {d.total ? `${offset + 1}–${Math.min(offset + 25, d.total)}` : '0'} of {num(d.total)}
            </span>
            <button className="btn btn-sm btn-ghost" disabled={!d.hasMore}
              onClick={() => setOffset(offset + 25)}>Next</button>
          </>
        )}>
        {loading && !d ? <div style={{ padding: 20 }}><Loading /></div> : (
          <div className="table-scroll scroll-y">
            <table className="ledger">
              <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Account</th>
                <th>Fund</th><th className="r">Debit</th><th className="r">Credit</th></tr></thead>
              <tbody>
                {(d?.entries || []).flatMap((e) => e.lines.map((l, i) => (
                  <tr key={l.id}>
                    <td className="code">{i === 0 ? dateFmt(e.entry_date) : ''}</td>
                    <td className="code">{i === 0 ? e.reference_number : ''}</td>
                    <td>{i === 0 ? e.description : ''}</td>
                    <td>{l.account_code} {l.account_name}</td>
                    <td className="muted">{l.fund_code || '—'}</td>
                    <td className="r">{l.debit_amount ? money(l.debit_amount, 2) : ''}</td>
                    <td className="r">{l.credit_amount ? money(l.credit_amount, 2) : ''}</td>
                  </tr>
                )))}
                {d && !d.entries.length && (
                  <tr><td colSpan={7} className="muted" style={{ padding: 20 }}>No entries match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Post a manual journal entry"
        note="The server rejects any entry whose debits and credits do not agree — the same constraint the specification places on the database trigger.">
        <div className="filters" style={{ marginBottom: 14 }}>
          <input type="date" value={entry.entryDate} onChange={(e) => setEntry({ ...entry, entryDate: e.target.value })} />
          <input placeholder="Reference" value={entry.reference} style={{ minWidth: 140 }}
            onChange={(e) => setEntry({ ...entry, reference: e.target.value })} />
          <input placeholder="Description" value={entry.description} style={{ minWidth: 280 }}
            onChange={(e) => setEntry({ ...entry, description: e.target.value })} />
        </div>
        {entry.lines.map((l, i) => (
          <div key={i} className="filters" style={{ marginBottom: 8, flexWrap: 'nowrap' }}>
            <select value={l.accountCode} style={{ flex: 2 }}
              onChange={(e) => { const ls = [...entry.lines]; ls[i] = { ...l, accountCode: e.target.value }; setEntry({ ...entry, lines: ls }); }}>
              {accounts.map((a) => (
                <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.account_name}</option>
              ))}
            </select>
            <input placeholder="Debit" type="number" step="0.01" value={l.debit} style={{ flex: 1, minWidth: 90 }}
              onChange={(e) => { const ls = [...entry.lines]; ls[i] = { ...l, debit: e.target.value, credit: '' }; setEntry({ ...entry, lines: ls }); }} />
            <input placeholder="Credit" type="number" step="0.01" value={l.credit} style={{ flex: 1, minWidth: 90 }}
              onChange={(e) => { const ls = [...entry.lines]; ls[i] = { ...l, credit: e.target.value, debit: '' }; setEntry({ ...entry, lines: ls }); }} />
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-sm btn-ghost"
            onClick={() => setEntry({ ...entry, lines: [...entry.lines, { accountCode: '1000', debit: '', credit: '' }] })}>
            Add line
          </button>
          <span className="num small" style={{ marginLeft: 'auto', color: balanced ? 'var(--success)' : 'var(--error)' }}>
            Dr {money(dr, 2)} · Cr {money(cr, 2)} {balanced ? '✓ balanced' : '— must balance'}
          </span>
        </div>
        {err && <p className="err">{err}</p>}
        {msg && <p className="small" style={{ color: 'var(--success)' }}>{msg}</p>}
        <button className="btn btn-sm" style={{ marginTop: 12 }}
          disabled={!balanced || !entry.description} onClick={post}>Post entry</button>
      </Panel>
    </>
  );
}

function TrialBalance({ year }) {
  const { data: d, loading } = usePanel(`/portal/trial-balance${yq(year)}`, [year]);
  if (loading || !d) return <Loading label="Building the trial balance" />;
  const groups = ['asset', 'liability', 'equity', 'revenue', 'expense'];
  return (
    <>
      <Head title="Trial balance"
        lede={`Every account with activity in the period, and proof that the ledger balances. Period: ${d.period}.`}
        actions={<span className={`badge ${d.balanced ? 'b-active' : 'b-critical'}`}>
          {d.balanced ? 'In balance' : 'Out of balance'}
        </span>} />
      <Panel flush title={`${d.rows.length} accounts with activity`}>
        <div className="table-scroll">
          <table className="ledger">
            <thead><tr><th>Code</th><th>Account</th><th>Net asset class</th>
              <th className="r">Debits</th><th className="r">Credits</th><th className="r">Balance</th></tr></thead>
            <tbody>
              {groups.flatMap((g) => {
                const rows = d.rows.filter((r) => r.account_type === g);
                if (!rows.length) return [];
                return [
                  <tr className="group-row" key={g}><td colSpan={6}>{titleize(g)}</td></tr>,
                  ...rows.map((r) => (
                    <tr key={r.account_code}>
                      <td className="code">{r.account_code}</td>
                      <td>{r.account_name}</td>
                      <td className="muted">{r.net_asset_class ? titleize(r.net_asset_class) : '—'}</td>
                      <td className="r">{r.debits ? money(r.debits, 2) : ''}</td>
                      <td className="r">{r.credits ? money(r.credits, 2) : ''}</td>
                      <td className="r" style={{ fontWeight: 600 }}>{money(r.balance, 2)}</td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
            <tfoot><tr>
              <td colSpan={3}>Totals</td>
              <td className="r">{money(d.totalDebits, 2)}</td>
              <td className="r">{money(d.totalCredits, 2)}</td>
              <td className="r">{d.balanced ? '✓' : '✕'}</td>
            </tr></tfoot>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Statements({ year }) {
  const { data: s, loading } = usePanel(`/portal/statements${yq(year)}`, [year]);
  if (loading || !s) return <Loading label="Preparing the statements" />;
  const a = s.statementOfActivities;
  return (
    <>
      <Head title="Financial statements"
        lede={`Statement of activities and statement of financial position under FASB ASC 958 and ASU 2016-14. Period: ${s.period}.`} />
      <Metrics items={[
        ['Total revenue', money(a.totalRevenue), a.priorYear ? `against ${a.priorYear}` : 'inception to date', a.revenueChangePct],
        ['Total expenses', money(a.totalExpense), a.priorYear ? `against ${a.priorYear}` : '', a.expenseChangePct],
        ['Change in net assets', money(a.changeInNetAssets), 'surplus for the period'],
        ['Programme expense ratio', a.programExpenseRatio ? pct(a.programExpenseRatio, 1) : '—', 'of total expenses'],
      ]} />

      <div className="split-even" style={{ gap: 22 }}>
        <Panel title="Statement of activities" flush>
          <table className="ledger">
            <thead><tr><th>Revenue and support</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {a.revenue.map((r) => (
                <tr key={r.code}><td><span className="code">{r.code}</span> {r.name}</td>
                  <td className="r">{money(r.net, 2)}</td></tr>
              ))}
              <tr><td style={{ fontWeight: 700 }}>Total revenue</td>
                <td className="r" style={{ fontWeight: 700 }}>{money(a.totalRevenue, 2)}</td></tr>
              <tr className="group-row"><td colSpan={2}>Expenses</td></tr>
              {a.expense.map((r) => (
                <tr key={r.code}><td><span className="code">{r.code}</span> {r.name}</td>
                  <td className="r">{money(r.net, 2)}</td></tr>
              ))}
              <tr><td style={{ fontWeight: 700 }}>Total expenses</td>
                <td className="r" style={{ fontWeight: 700 }}>{money(a.totalExpense, 2)}</td></tr>
            </tbody>
            <tfoot><tr><td>Change in net assets</td>
              <td className="r">{money(a.changeInNetAssets, 2)}</td></tr></tfoot>
          </table>
        </Panel>

        <div>
          <Panel title="Net asset classification">
            <Donut size={175} centerValue={compact(a.totalRevenue)} centerLabel="TOTAL SUPPORT"
              slices={[
                { label: 'Without donor restriction', value: Math.max(0, a.withoutRestriction), color: PALETTE[0] },
                { label: 'With purpose restriction', value: Math.max(0, a.purposeRestricted), color: PALETTE[1] },
                { label: 'Perpetual (endowment corpus)', value: Math.max(0, a.perpetual), color: PALETTE[2] },
              ]} />
          </Panel>
          <Panel title="Statement of financial position" flush
            note="Assets are cumulative to the end of the selected period.">
            <table className="ledger">
              <thead><tr><th>Assets</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {s.statementOfFinancialPosition.assets.map((x) => (
                  <tr key={x.code}><td><span className="code">{x.code}</span> {x.name}</td>
                    <td className="r">{money(x.net, 2)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total assets</td>
                <td className="r">{money(s.statementOfFinancialPosition.totalAssets, 2)}</td></tr></tfoot>
            </table>
          </Panel>
        </div>
      </div>

      <Panel title="Planned gift pipeline — disclosure note" note={s.plannedGiftPipeline.note}>
        <div className="metrics" style={{ margin: 0, border: 0 }}>
          {[['Gifts documented', num(s.plannedGiftPipeline.count)],
            ['Aggregate face value', compact(s.plannedGiftPipeline.faceValue)],
            ['Present value, base case', compact(s.plannedGiftPipeline.base)],
            ['Range', `${compact(s.plannedGiftPipeline.pessimistic)} – ${compact(s.plannedGiftPipeline.optimistic)}`],
          ].map(([l, v]) => (
            <div className="metric" key={l} style={{ padding: '0 20px 0 0', borderRight: 0 }}>
              <div className="metric-lab">{l}</div>
              <div className="metric-val" style={{ fontSize: '1.3rem' }}>{v}</div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function ChartOfAccounts() {
  const { data: d, loading } = usePanel('/portal/accounts', []);
  if (loading || !d) return <Loading />;
  const groups = ['asset', 'liability', 'equity', 'revenue', 'expense'];
  return (
    <>
      <Head title="Chart of accounts"
        lede="The GAAP chart of accounts, pre-loaded at system initialisation. Accounts are never deleted — only inactivated — so historical entries always resolve." />
      <Panel flush title={`${d.length} accounts`}>
        <div className="table-scroll">
          <table className="ledger">
            <thead><tr><th>Code</th><th>Account</th><th>Subtype</th><th>Net asset class</th>
              <th>Normal balance</th><th className="r">Total debits</th><th className="r">Total credits</th></tr></thead>
            <tbody>
              {groups.flatMap((g) => {
                const rows = d.filter((r) => r.account_type === g);
                if (!rows.length) return [];
                return [
                  <tr className="group-row" key={g}><td colSpan={7}>{titleize(g)}</td></tr>,
                  ...rows.map((r) => (
                    <tr key={r.account_code}>
                      <td className="code">{r.account_code}</td>
                      <td>{r.account_name}</td>
                      <td className="muted">{r.account_subtype ? titleize(r.account_subtype) : '—'}</td>
                      <td className="muted">{r.net_asset_class ? titleize(r.net_asset_class) : '—'}</td>
                      <td className="muted">{titleize(r.normal_balance)}</td>
                      <td className="r">{r.total_debit ? money(r.total_debit) : '—'}</td>
                      <td className="r">{r.total_credit ? money(r.total_credit) : '—'}</td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

/* ═══════════════════════════ data hub ════════════════════════════════ */

function DataHub({ year }) {
  const { data: hub, loading } = usePanel('/portal/datahub', []);
  const [table, setTable] = useState('transactions');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState('');
  const [dir, setDir] = useState('desc');
  const dq = useDebounced(q, 350);

  useEffect(() => { setOffset(0); }, [table, dq, year]);

  const path = `/portal/datahub/${table}?limit=25&offset=${offset}`
    + (year ? `&year=${year}` : '') + (dq ? `&q=${encodeURIComponent(dq)}` : '')
    + (sort ? `&sort=${sort}&dir=${dir}` : '');
  const { data: rows, loading: rl } = usePanel(path, [path]);

  const byGroup = useMemo(() => {
    if (!hub) return [];
    const map = {};
    hub.inventory.tables.forEach((t) => { (map[t.group] = map[t.group] || []).push(t); });
    return Object.entries(map);
  }, [hub]);

  if (loading || !hub) return <Loading label="Reading the catalogue" />;
  const inv = hub.inventory;

  return (
    <>
      <Head title="Data hub"
        lede="Everything the platform holds, in one place: browse any table, filter by period, check integrity, and export. A finance team cannot be asked to trust a system whose contents it cannot inspect."
        actions={
          <a className="btn btn-sm btn-ghost"
            href={`/api/portal/datahub/${table}/export.csv${year ? `?year=${year}` : ''}`}>
            Export as CSV
          </a>
        } />

      <Metrics items={[
        ['Tables', num(inv.totalTables), 'all whitelisted and browsable'],
        ['Rows held', num(inv.totalRows), 'across every table'],
        ['Database size', `${Math.round((inv.pageSizeBytes * inv.pageCount) / 1048576)} MB`,
          `${inv.journalMode.toUpperCase()} journal · foreign keys ${inv.foreignKeys ? 'on' : 'off'}`],
        ['Fiscal years', num(hub.fiscalYears.length),
          `${hub.fiscalYears[hub.fiscalYears.length - 1]?.year}–${hub.fiscalYears[0]?.year}`],
        ['Integrity checks', `${hub.quality.passed}/${hub.quality.checks.length}`,
          `${hub.quality.warnings} warnings, ${hub.quality.failures} failures`],
      ]} />

      <div className="hub-grid">
        <div className="hub-list">
          {byGroup.map(([group, tables]) => (
            <div key={group}>
              <div className="hub-group">{group}</div>
              {tables.map((t) => (
                <button key={t.name} className={`hub-item${table === t.name ? ' on' : ''}`}
                  onClick={() => { setTable(t.name); setSort(''); }}>
                  {t.label}<span className="n">{num(t.rows)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div>
          <Panel
            title={rows ? `${rows.label} — ${num(rows.total)} rows` : 'Loading'}
            tools={
              <>
                <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)}
                  style={{ border: '1px solid var(--border-strong)', padding: '7px 10px', fontSize: 12.5 }} />
                <button className="btn btn-sm btn-ghost" disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 25))}>‹</button>
                <span className="tiny muted num">
                  {rows?.total ? `${offset + 1}–${Math.min(offset + 25, rows.total)}` : '0'}
                </span>
                <button className="btn btn-sm btn-ghost" disabled={!rows?.hasMore}
                  onClick={() => setOffset(offset + 25)}>›</button>
              </>
            }
            flush
            note={rows?.description}>
            {rl && !rows ? <div style={{ padding: 20 }}><Loading /></div> : rows && (
              <div className="table-scroll scroll-y">
                <table className="ledger">
                  <thead>
                    <tr>
                      {rows.columns.map((c) => (
                        <th key={c} style={{ cursor: 'pointer' }}
                          onClick={() => {
                            if (sort === c) setDir(dir === 'asc' ? 'desc' : 'asc');
                            else { setSort(c); setDir('desc'); }
                          }}>
                          {c.replace(/_/g, ' ')}
                          {rows.sort === c && (rows.dir === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.rows.map((r, i) => (
                      <tr key={i}>
                        {rows.columns.map((c) => {
                          const v = r[c];
                          const isMoney = /amount|value|balance|cost|price|total|npv|premium/.test(c)
                            && typeof v === 'number';
                          return (
                            <td key={c} className={typeof v === 'number' ? 'r' : ''}>
                              {v == null ? <span className="muted">—</span>
                                : isMoney ? money(v, 2)
                                  : typeof v === 'number' ? num(v)
                                    : String(v).length > 60 ? `${String(v).slice(0, 60)}…` : String(v)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {!rows.rows.length && (
                      <tr><td colSpan={rows.columns.length} className="muted" style={{ padding: 20 }}>
                        No rows match these filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Integrity checks"
            note="These run against the live database each time this page loads. Nothing is precomputed.">
            {hub.quality.checks.map((c) => (
              <div className="qa-row" key={c.name}>
                <span className={`qa-dot qa-${c.status}`} />
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{c.detail}</span>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ═════════════════════ go-live / productionisation ═══════════════════ */

const PLAN = [
  {
    phase: 'Phase 1', weeks: 'Weeks 1–4', title: 'Data platform and tenancy',
    body: 'Move from the embedded SQLite file to Azure Database for PostgreSQL Flexible Server with zone-redundant high availability, 35-day point-in-time restore and geo-redundant backup. The schema ports as written — only db.js changes — but the migration must run through a versioned tool so every environment is reproducible. Add a read replica for reporting, so a long analytical query can never block a gift being posted.',
    items: ['PostgreSQL Flexible Server, HA + PITR', 'Versioned migrations in CI', 'Read replica for reporting', 'Row-level security by role', 'Nightly logical backup to immutable storage'],
  },
  {
    phase: 'Phase 2', weeks: 'Weeks 3–8', title: 'Payments and money movement',
    body: 'Nothing on this platform currently moves money. Stripe (cards, ACH), PayPal and Braintree (PayPal, Venmo), The Giving Block (crypto) and DAF Direct need live credentials, webhook signature verification, and idempotency keys so a retried webhook cannot double-post a gift. Ledger posting moves behind the webhook rather than the request, and every settlement needs daily automated reconciliation against the processor payout file.',
    items: ['Stripe Payment Element + webhooks', 'Idempotent webhook handlers', 'Daily payout reconciliation', 'Refund and chargeback handling', 'PCI SAQ A attestation'],
  },
  {
    phase: 'Phase 3', weeks: 'Weeks 5–10', title: 'Identity, access and secrets',
    body: 'Replace the demonstration credentials with Microsoft Entra ID single sign-on for staff, enforced MFA, and SCIM provisioning so leavers lose access the day they leave. Donor accounts move to passwordless email OTP with optional passkeys. Every secret moves to Azure Key Vault behind a managed identity — no connection string or API key in an app setting.',
    items: ['Entra ID SSO + conditional access', 'WebAuthn passkeys for staff', 'Key Vault + managed identity', 'SCIM joiner/mover/leaver', 'Session revocation and device list'],
  },
  {
    phase: 'Phase 4', weeks: 'Weeks 8–14', title: 'Document pipeline and OCR',
    body: 'The NER engine, confidence scoring and human-review queue already work; what is missing is ingestion of real scanned documents. Add Azure AI Document Intelligence ahead of the existing pipeline, with blob storage under customer-managed keys, virus scanning on upload, and a signed-URL download path. Capture reviewer corrections as labelled training data from day one.',
    items: ['Document Intelligence OCR', 'Blob storage, customer-managed keys', 'Malware scanning on ingest', 'Reviewer corrections as training data', 'Retention and legal-hold policy'],
  },
  {
    phase: 'Phase 5', weeks: 'Weeks 10–16', title: 'Accounting hardening',
    body: 'A production ledger needs period close: lockable accounting periods, a formal reversal workflow rather than deletion, maker–checker approval on manual entries above a threshold, and a complete audit package export. Add multi-currency with daily rates, since a fifth of gifts arrive from outside the United States, and automate the Form 990 and Schedule A/B extracts.',
    items: ['Period close and lock', 'Maker–checker on manual entries', 'Journal reversal workflow', 'Multi-currency with daily FX', 'Form 990 / Schedule B extracts', 'Auditor read-only data room'],
  },
  {
    phase: 'Phase 6', weeks: 'Weeks 12–18', title: 'AI governance and live models',
    body: 'Connect Azure OpenAI inside the Foundation tenant with content filtering, private networking and zero data retention. The deterministic engine stays as the floor, so a model outage degrades the product rather than breaking it. Add prompt-injection defences on document text, an evaluation suite with a labelled golden set, per-donor opt-out of AI processing, and human review of every AI-influenced figure before it reaches a board report.',
    items: ['Azure OpenAI, private endpoint, zero retention', 'Golden-set evaluation in CI', 'Prompt-injection hardening', 'Model and prompt version pinning', 'Donor opt-out of AI processing'],
  },
  {
    phase: 'Phase 7', weeks: 'Weeks 14–20', title: 'Operations and assurance',
    body: 'Application Insights with distributed tracing, alerting on gift-posting failure and ledger imbalance, a documented runbook, and load testing to the campaign-launch peak. Then the external work: SOC 2 Type II readiness, an independent penetration test, a third-party WCAG 2.1 AA audit, and a data protection impact assessment covering GDPR for European donors and CCPA for Californian ones.',
    items: ['App Insights + imbalance alerting', 'Runbook and on-call rota', 'Load test to launch peak', 'SOC 2 Type II readiness', 'Third-party penetration test', 'Independent WCAG 2.1 AA audit', 'GDPR/CCPA impact assessment'],
  },
];

function GoLive() {
  return (
    <>
      <Head title="Go-live plan"
        lede="What stands between this platform and production. Written honestly: the accounting engine, actuarial model, AI pipeline and stewardship automation are real and working; what follows is the infrastructure, integration and assurance work a system holding estate documents and donor money must have." />

      <Panel title="Where this platform already stands">
        <div className="split-even" style={{ gap: 26 }}>
          <div>
            <div className="metric-lab" style={{ marginBottom: 10 }}>Built and working</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
              <li>Double-entry ledger that rejects unbalanced entries</li>
              <li>ASC 958 / ASU 2016-14 statements with prior-year comparatives</li>
              <li>Actuarial engine — SSA tables, §7520, risk spread, realisation probability</li>
              <li>Legal-domain NER with confidence scoring and a human review queue</li>
              <li>Stewardship rules engine and automated CRM capture</li>
              <li>Append-only audit trail and automated integrity checks</li>
              <li>Six fiscal years of data with year-on-year comparison</li>
            </ul>
          </div>
          <div>
            <div className="metric-lab" style={{ marginBottom: 10 }}>Not yet real</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
              <li>No money actually moves — gifts are recorded, not charged</li>
              <li>OCR of scanned PDFs and images is not connected</li>
              <li>Staff sign-in uses demonstration credentials, not SSO</li>
              <li>Market prices and carrier data are seeded, not live feeds</li>
              <li>Language-model narration is off until a key is configured</li>
              <li>All figures are generated sample data</li>
            </ul>
          </div>
        </div>
      </Panel>

      <Panel title="Sequenced plan — approximately twenty weeks"
        note="Phases overlap deliberately. Payments and identity are the long poles; the data platform migration must land first because everything else depends on it.">
        {PLAN.map((p) => (
          <div className="plan-phase" key={p.phase}>
            <div className="plan-meta">{p.phase} · {p.weeks}</div>
            <h3>{p.title}</h3>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 12px', maxWidth: '84ch' }}>{p.body}</p>
            <div className="chip-row">
              {p.items.map((i) => (
                <span key={i} className="chip chip-sm" style={{ cursor: 'default', fontWeight: 400 }}>{i}</span>
              ))}
            </div>
          </div>
        ))}
      </Panel>

      <Panel title="Indicative running cost, once live" flush
        note="Excludes payment processing fees (roughly 2.2% + 30¢ on cards, materially less on ACH) and one-off assurance: a SOC 2 Type II audit and an independent penetration test together typically run $45,000–$80,000 in the first year.">
        <div className="table-scroll">
          <table className="ledger">
            <thead><tr><th>Component</th><th>Service</th><th className="r">Monthly</th></tr></thead>
            <tbody>
              {[
                ['Application hosting', 'App Service P1v3, two instances, zone redundant', 290],
                ['Database', 'PostgreSQL Flexible Server, HA, 2 vCore + replica', 480],
                ['Document storage', 'Blob storage with customer-managed keys, ~500 GB', 45],
                ['OCR', 'Document Intelligence, ~2,000 pages a month', 65],
                ['Language model', 'Azure OpenAI, metered', 220],
                ['Identity', 'Entra ID P1, 40 staff seats', 240],
                ['Observability', 'Application Insights and Log Analytics', 120],
                ['Edge and secrets', 'Key Vault, Front Door, WAF', 260],
              ].map(([c, sv, m]) => (
                <tr key={c}><td style={{ fontWeight: 600 }}>{c}</td><td className="muted">{sv}</td>
                  <td className="r">{money(m)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={2}>Indicative total</td><td className="r">{money(1720)} a month</td></tr></tfoot>
          </table>
        </div>
      </Panel>
    </>
  );
}

/* ═══════════════════════ portfolio and relationships ═════════════════ */

function Forecast() {
  const { data: d, loading, reload } = usePanel('/actuarial/forecast', []);
  const [busy, setBusy] = useState(false);
  if (loading || !d) return <Loading label="Running the actuarial model" />;
  return (
    <>
      <Head title="Actuarial forecast"
        lede={`Every planned gift valued against SSA period life tables, the IRS §7520 rate of ${pct(d.discountRate * 100, 2)}, an asset-class risk spread and a realisation probability by instrument.`}
        actions={
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await api('/portal/recalc-npv', { method: 'POST' }); reload(); } finally { setBusy(false); }
          }}>{busy ? <span className="spinner" /> : 'Recalculate all NPV'}</button>
        } />
      <Metrics items={[
        ['Pessimistic', compact(d.totals.pessimistic), 'discount +2%, 90th percentile longevity'],
        ['Base case', compact(d.totals.base), 'current §7520 rate, median longevity'],
        ['Optimistic', compact(d.totals.optimistic), 'narrower spread, 10th percentile longevity'],
        ['Aggregate face value', compact(d.totals.faceValue), `${d.totals.count} instruments`],
      ]} />
      <Panel title="Projected receipts by time horizon">
        <ScenarioChart horizons={d.horizons} />
        <div className="row" style={{ gap: 22, marginTop: 10, justifyContent: 'center' }}>
          {[['Pessimistic', '#b9b2a2'], ['Base', 'var(--indigo)'], ['Optimistic', 'var(--saffron)']].map(([l, c]) => (
            <span key={l} className="tiny" style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <i style={{ width: 10, height: 10, background: c }} />{l}
            </span>
          ))}
        </div>
      </Panel>
      <div className="split-even" style={{ gap: 22 }}>
        <Panel title="Horizon detail" flush>
          <div className="table-scroll">
            <table className="ledger">
              <thead><tr><th>Horizon</th><th className="r">Gifts</th><th className="r">Face</th>
                <th className="r">Base NPV</th><th className="r">Optimistic</th><th className="r">Pessimistic</th></tr></thead>
              <tbody>
                {d.horizons.map((h) => (
                  <tr key={h.label}>
                    <td>{h.label}</td><td className="r code">{h.count}</td>
                    <td className="r">{compact(h.faceValue)}</td>
                    <td className="r" style={{ fontWeight: 600 }}>{compact(h.base)}</td>
                    <td className="r muted">{compact(h.optimistic)}</td>
                    <td className="r muted">{compact(h.pessimistic)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td className="r">{d.totals.count}</td>
                <td className="r">{compact(d.totals.faceValue)}</td>
                <td className="r">{compact(d.totals.base)}</td>
                <td className="r">{compact(d.totals.optimistic)}</td>
                <td className="r">{compact(d.totals.pessimistic)}</td></tr></tfoot>
            </table>
          </div>
        </Panel>
        <Panel title="Face value against present value, by instrument" flush
          note="The ratio is the fraction of face value recognised today. Revocable bequests carry the deepest discount because a donor may amend a will at any time.">
          <div className="table-scroll">
            <table className="ledger">
              <thead><tr><th>Instrument</th><th className="r">Count</th><th className="r">Face</th>
                <th className="r">NPV</th><th className="r">Ratio</th></tr></thead>
              <tbody>
                {d.byType.map((t) => (
                  <tr key={t.type}>
                    <td>{titleize(t.type)}</td><td className="r code">{t.count}</td>
                    <td className="r">{compact(t.face)}</td>
                    <td className="r" style={{ fontWeight: 600 }}>{compact(t.npv)}</td>
                    <td className="r muted">{pct((t.npv / t.face) * 100, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}

function Donors() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 320);
  const { data: rows } = usePanel(`/portal/donors?q=${encodeURIComponent(dq)}&limit=120`, [dq]);
  const { data: pledges } = usePanel('/portal/pledges', []);
  const [sel, setSel] = useState(null);
  const [rec, setRec] = useState(null);

  useEffect(() => {
    if (!sel) { setRec(null); return; }
    setRec('loading');
    api(`/ai/recommendations/${sel.id}`).then(setRec).catch(() => setRec(null));
  }, [sel]);

  return (
    <>
      <Head title="Donors & pledges"
        lede="The supporter register ranked by lifetime giving plus pipeline value. Select anyone for an AI-scored gift officer brief." />
      <Panel title="Donor register" flush tools={
        <input placeholder="Search name, email or country" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ border: '1px solid var(--border-strong)', padding: '7px 10px', fontSize: 12.5, minWidth: 240 }} />
      }>
        {!rows ? <div style={{ padding: 20 }}><Loading /></div> : (
          <div className="table-scroll scroll-y">
            <table className="ledger">
              <thead><tr><th>Donor</th><th>Country</th><th className="r">Age</th><th className="r">Gifts</th>
                <th className="r">Lifetime</th><th className="r">Pipeline NPV</th><th /></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => setSel(d)}>
                    <td>{d.first_name} {d.last_name}
                      {d.is_legacy_society ? <span className="badge b-fulfilled" style={{ marginLeft: 8 }}>Circle</span> : null}</td>
                    <td className="muted">{d.country}</td>
                    <td className="r code">{d.age ?? '—'}</td>
                    <td className="r code">{d.gift_count}</td>
                    <td className="r">{money(d.total_donated)}</td>
                    <td className="r" style={{ fontWeight: 600 }}>{d.pipeline_npv ? money(d.pipeline_npv) : '—'}</td>
                    <td className="r"><span className="link-gold" style={{ fontSize: 10.5, border: 0 }}>Brief →</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {sel && (
        <Panel title={`Gift officer brief — ${sel.first_name} ${sel.last_name}`}
          tools={<button className="btn btn-sm btn-ghost" onClick={() => setSel(null)}>Close</button>}>
          {rec === 'loading' ? <Loading label="Scoring propensity" /> : rec ? (
            <>
              <div className="metrics" style={{ margin: '0 0 16px', border: 0 }}>
                {[['Propensity', `${rec.propensityScore}/100`], ['Band', rec.band],
                  ['Lifetime', money(rec.lifetimeGiving)], ['Pipeline', money(rec.pipelineNpv)],
                  ['Last gift', rec.recencyDays != null ? `${rec.recencyDays}d ago` : '—']].map(([l, v]) => (
                  <div className="metric" key={l} style={{ padding: '0 22px 0 0', borderRight: 0 }}>
                    <div className="metric-lab">{l}</div>
                    <div className="metric-val" style={{ fontSize: '1.25rem' }}>{v}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 14 }}>{rec.narrative}</p>
              <div className="metric-lab" style={{ marginTop: 18, marginBottom: 8 }}>Recommended next conversations</div>
              {rec.actions.map((a, i) => (
                <div key={i} style={{ padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.title}</div>
                  <p className="small muted" style={{ marginBottom: 0 }}>{a.body}</p>
                </div>
              ))}
            </>
          ) : <p className="muted small">No brief available.</p>}
        </Panel>
      )}

      <Panel title="Pledge book" flush>
        {!pledges ? <div style={{ padding: 20 }}><Loading /></div> : (
          <div className="table-scroll scroll-y">
            <table className="ledger">
              <thead><tr><th>Donor</th><th>Instrument</th><th>Fund</th><th>Committed</th>
                <th className="r">Face value</th><th>Status</th></tr></thead>
              <tbody>
                {pledges.map((p) => (
                  <tr key={p.id}>
                    <td>{p.first_name} {p.last_name}</td>
                    <td>{titleize(p.pledge_type)}</td>
                    <td className="muted">{p.fund_name}</td>
                    <td className="code">{dateFmt(p.commitment_date)}</td>
                    <td className="r">{money(p.face_value)}</td>
                    <td><span className={`badge b-${p.status === 'active' ? 'active' : p.status === 'committed' ? 'committed' : 'prospect'}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function Stewardship() {
  const { data: d, loading, reload } = usePanel('/portal/stewardship', []);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  if (loading || !d) return <Loading label="Loading the stewardship queue" />;
  const tasks = filter === 'all' ? d.tasks : d.tasks.filter((t) => t.rule_key === filter);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <Head title="Stewardship"
        lede="Rules are evaluated against the live database at boot and every six hours. A deferred gift takes decades to mature — the follow-ups cannot depend on anyone remembering."
        actions={
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await api('/portal/stewardship/run', { method: 'POST' }); reload(); } finally { setBusy(false); }
          }}>{busy ? <span className="spinner" /> : 'Re-evaluate rules now'}</button>
        } />
      <Metrics items={[
        ['Open tasks', num(d.summary.open)],
        ['Due within 7 days', num(d.summary.dueThisWeek)],
        ['Overdue', num(d.summary.overdue)],
        ['Completed', num(d.summary.completed)],
      ]} />
      <Panel title="Active triggers">
        <div className="chip-row">
          <button className={`chip chip-sm${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
            All ({d.summary.open})
          </button>
          {d.summary.byRule.filter((r) => r.open > 0).map((r) => (
            <button key={r.rule_key} className={`chip chip-sm${filter === r.rule_key ? ' on' : ''}`}
              onClick={() => setFilter(r.rule_key)}>{r.label} ({r.open})</button>
          ))}
        </div>
      </Panel>
      <Panel title="Task queue" flush
        note="Completing a task writes a stewardship touch to the donor's CRM record automatically — no manual logging, and no gap in the history.">
        <div className="table-scroll scroll-y">
          <table className="ledger">
            <thead><tr><th>Due</th><th>Priority</th><th>Task</th><th>Channel</th><th /></tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td className="code" style={{ color: t.due_date < today ? 'var(--error)' : undefined }}>
                    {dateFmt(t.due_date)}
                  </td>
                  <td><span className={`badge b-${t.priority === 'high' ? 'high' : t.priority === 'low' ? 'lapsed' : 'review'}`}>{t.priority}</span></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    <div className="muted" style={{ maxWidth: 640, fontSize: 11.5 }}>{t.detail}</div>
                  </td>
                  <td className="muted">{titleize(t.channel)}</td>
                  <td className="r">
                    <button className="btn btn-sm btn-ghost" onClick={async () => {
                      await api(`/portal/stewardship/${t.id}/complete`, { method: 'POST' }); reload();
                    }}>Done</button>
                  </td>
                </tr>
              ))}
              {!tasks.length && <tr><td colSpan={5} className="muted" style={{ padding: 20 }}>Nothing open under this trigger.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function CRM() {
  const { data: d, loading } = usePanel('/portal/interactions?limit=120', []);
  if (loading || !d) return <Loading label="Loading interaction history" />;
  return (
    <>
      <Head title="CRM activity"
        lede="Donor interactions captured automatically as they happen — gifts, sign-ins, document uploads, case intakes and completed stewardship touches. No one types any of this." />
      <Metrics items={[
        ['Interactions logged', num(d.total)],
        ['Captured automatically', num(d.automated)],
        ['Manual entry required', num(d.total - d.automated)],
        ['Activity types', num(d.byType.length)],
      ]} />
      <div className="split-even" style={{ gap: 22 }}>
        <Panel title="By activity type">
          <BarList format={num} items={d.byType.map((t, i) => ({
            label: titleize(t.interaction_type), value: t.n, color: PALETTE[i % PALETTE.length],
          }))} />
        </Panel>
        <Panel title="By channel">
          <BarList format={num} items={d.byChannel.map((t, i) => ({
            label: titleize(t.channel), value: t.n, color: PALETTE[(i + 3) % PALETTE.length],
          }))} />
        </Panel>
      </div>
      <Panel title="Recent activity" flush>
        <div className="table-scroll scroll-y">
          <table className="ledger">
            <thead><tr><th>When</th><th>Donor</th><th>Type</th><th>Subject</th><th>Channel</th><th>Source</th></tr></thead>
            <tbody>
              {d.recent.map((i) => (
                <tr key={i.id}>
                  <td className="code">{dateFmt(i.occurred_at)}</td>
                  <td>{i.first_name ? `${i.first_name} ${i.last_name}` : '—'}</td>
                  <td>{titleize(i.interaction_type)}</td>
                  <td>{i.subject}</td>
                  <td className="muted">{titleize(i.channel)}</td>
                  <td><span className={`badge ${i.source === 'auto' ? 'b-active' : 'b-review'}`}>{i.source}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Assets() {
  const { data: ins } = usePanel('/portal/insurance', []);
  const { data: sec, reload } = usePanel('/portal/securities', []);
  const [busy, setBusy] = useState(false);
  if (!ins || !sec) return <Loading label="Valuing pledged assets" />;
  return (
    <>
      <Head title="Insurance & securities"
        lede="Life insurance premium performance and mark-to-market valuation of every pledged equity position."
        actions={
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => {
            setBusy(true); try { reload(); } finally { setBusy(false); }
          }}>{busy ? <span className="spinner" /> : 'Re-mark prices'}</button>
        } />
      <Metrics items={[
        ['Securities at market', compact(sec.totals.marketValue), `${sec.totals.positions} positions`],
        ['Unrealised gain', compact(sec.totals.unrealisedGain),
          `${compact(sec.totals.capitalGainsAvoided)} of capital-gains tax avoided`],
        ['Death benefit pledged', compact(ins.totals.faceValue), `${ins.totals.count} policies`],
        ['Premiums received', compact(ins.totals.premiumsPaid), `${ins.totals.atLapseRisk} at lapse risk`],
      ]} />
      <Panel title="Pledged securities, marked to market" flush
        note={`Transferred through ${sec.partner?.name}. Because the shares pass directly, the ${compact(sec.totals.capitalGainsAvoided)} of embedded capital-gains tax is never paid by the donor or by the Foundation.`}>
        <div className="table-scroll">
          <table className="ledger">
            <thead><tr><th>Ticker</th><th>Donor</th><th className="r">Shares</th><th className="r">Last</th>
              <th className="r">Cost basis</th><th className="r">Market value</th>
              <th className="r">Unrealised</th><th className="r">Day change</th></tr></thead>
            <tbody>
              {sec.holdings.map((h) => (
                <tr key={h.id}>
                  <td style={{ fontWeight: 700 }}>{h.ticker}<div className="muted" style={{ fontSize: 11 }}>{h.name}</div></td>
                  <td>{h.donor} <span className="muted">{h.country}</span></td>
                  <td className="r code">{num(h.shares)}</td>
                  <td className="r">{money(h.lastPrice, 2)}</td>
                  <td className="r muted">{money(h.costBasis)}</td>
                  <td className="r" style={{ fontWeight: 600 }}>{money(h.marketValue)}</td>
                  <td className="r delta-up">{money(h.unrealisedGain)}</td>
                  <td className={`r ${h.dayChange >= 0 ? 'delta-up' : 'delta-down'}`}>
                    {h.dayChange >= 0 ? '+' : ''}{money(h.dayChange)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={4}>Total</td>
              <td className="r">{money(sec.totals.costBasis)}</td>
              <td className="r">{money(sec.totals.marketValue)}</td>
              <td className="r">{money(sec.totals.unrealisedGain)}</td><td /></tr></tfoot>
          </table>
        </div>
      </Panel>
      <Panel title="Life insurance policies and premium performance" flush
        note="Two consecutive missed premiums flag a policy as a lapse risk, which raises a stewardship task automatically — a lapsed policy is a lost gift.">
        <div className="table-scroll">
          <table className="ledger">
            <thead><tr><th>Policy</th><th>Donor</th><th>Insurer</th><th className="r">Death benefit</th>
              <th className="r">AOLF share</th><th className="r">Annual premium</th>
              <th className="r">Paid</th><th className="r">Missed</th><th>Next due</th></tr></thead>
            <tbody>
              {ins.policies.map((p) => (
                <tr key={p.id}>
                  <td className="code">{p.policyNumber}</td>
                  <td>{p.donor}</td>
                  <td className="muted">{p.insurer}</td>
                  <td className="r">{money(p.faceValue)}</td>
                  <td className="r muted">{p.foundationShare}%</td>
                  <td className="r">{money(p.annualPremium)}</td>
                  <td className="r">{p.paid.count} · {money(p.paid.total)}</td>
                  <td className="r" style={{ color: p.missed.count ? 'var(--error)' : undefined }}>{p.missed.count}</td>
                  <td className="muted">
                    {p.nextDue ? dateFmt(p.nextDue) : '—'}
                    {p.lapseRisk && <span className="badge b-critical" style={{ marginLeft: 8 }}>lapse risk</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Documents() {
  const { data: d, loading } = usePanel('/portal/documents', []);
  if (loading || !d) return <Loading />;
  const review = d.filter((x) => x.parse_status === 'needs_review');
  return (
    <>
      <Head title="Document review"
        lede="The human-in-the-loop queue. Anything the AI scored below 90% confidence waits here for a person, with a two business day service level." />
      <Metrics items={[
        ['Documents in the vault', num(d.length)],
        ['Awaiting human review', num(review.length)],
        ['Auto-populated', num(d.filter((x) => x.parse_status === 'completed').length)],
        ['Not yet parsed', num(d.filter((x) => x.parse_status === 'not_parsed').length)],
      ]} />
      <Panel title="Review queue" flush>
        <div className="table-scroll scroll-y">
          <table className="ledger">
            <thead><tr><th>Document</th><th>Donor</th><th>Folder</th><th>Uploaded</th>
              <th className="r">Min. confidence</th><th>Status</th></tr></thead>
            <tbody>
              {d.map((x) => (
                <tr key={x.id}>
                  <td>{x.file_name}</td>
                  <td>{x.first_name ? `${x.first_name} ${x.last_name}` : '—'}</td>
                  <td className="muted">{titleize(x.folder)}</td>
                  <td className="code">{dateFmt(x.created_at)}</td>
                  <td className="r" style={{ color: x.parse_confidence_min >= 0.9 ? 'var(--success)' : 'var(--saffron)' }}>
                    {x.parse_confidence_min ? pct(x.parse_confidence_min * 100, 1) : '—'}
                  </td>
                  <td><span className={`badge ${x.parse_status === 'completed' ? 'b-active' : x.parse_status === 'needs_review' ? 'b-pending' : 'b-lapsed'}`}>
                    {x.parse_status.replace('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Cases() {
  const { data: c, loading } = usePanel('/portal/cases', []);
  const { data: docs } = usePanel('/portal/case-documents', []);
  if (loading || !c) return <Loading />;
  return (
    <>
      <Head title="Complex cases"
        lede="Complex-asset enquiries, triaged by value and complexity, routed to a consultant licensed in the donor's own state." />
      {docs && docs.length > 0 && (
        <Panel title="Documentation returned by donors" flush
          note="The donor engaged and paid their own adviser; only the outcome comes back to the Foundation.">
          <div className="table-scroll">
            <table className="ledger">
              <thead><tr><th>Received</th><th>Donor</th><th>State</th><th>Document</th><th>Instrument</th>
                <th className="r">Allocation</th><th>Advising firm</th></tr></thead>
              <tbody>
                {docs.map((x) => (
                  <tr key={x.id}>
                    <td className="code">{dateFmt(x.received_at)}</td>
                    <td>{x.intake_full_name}</td>
                    <td className="muted">{x.state_of_residence}</td>
                    <td>{titleize(x.document_type)}</td>
                    <td>{titleize(x.instrument)}</td>
                    <td className="r">
                      {x.allocation_amount ? money(x.allocation_amount)
                        : x.allocation_percent ? `${x.allocation_percent}%` : '—'}
                    </td>
                    <td className="muted">{x.consultant_firm || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <div className="split-even" style={{ gap: 22 }}>
        {c.map((x) => (
          <Panel key={x.id} title={`${x.ai_priority} priority · ${x.asset_value_range}`}>
            <h3 className="h-sub" style={{ marginBottom: 10 }}>{x.intake_full_name}</h3>
            <div className="chip-row" style={{ marginBottom: 12 }}>
              {JSON.parse(x.asset_types || '[]').map((a) => (
                <span key={a} className="badge b-review">{titleize(a)}</span>
              ))}
            </div>
            <p className="small muted">{x.description}</p>
            {x.ai_triage && (
              <p className="small" style={{ borderLeft: '2px solid var(--teal)', paddingLeft: 14 }}>{x.ai_triage}</p>
            )}
            <div className="between" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
              <span className="tiny muted">
                {x.cons_first ? `${x.cons_first} ${x.cons_last}, ${x.firm_name}` : 'Unassigned'}
              </span>
              <span className="badge b-review">{x.status.replace(/_/g, ' ')}</span>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}

function AIConsole() {
  const [q, setQ] = useState('');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const { data: status } = usePanel('/ai/status', []);
  const SUGGEST = [
    'How far are we from the $45 million goal?',
    'Break the pipeline down by expected receipt horizon.',
    'Which gift vehicles carry the most present value?',
    'Where in the world is our giving coming from?',
    'How do supporters actually pay?',
    'Show me the pledge book by status.',
    'What is the year-over-year trend?',
    'Which funds are furthest from target?',
  ];
  async function ask(question) {
    const text = (question ?? q).trim();
    if (!text) return;
    setBusy(true); setQ('');
    setLog((l) => [...l, { role: 'you', text }]);
    try {
      const r = await api('/ai/ask', { method: 'POST', body: { question: text } });
      setLog((l) => [...l, { role: 'ai', text: r.answer, provider: r.provider, ms: r.latencyMs }]);
    } catch (e) {
      setLog((l) => [...l, { role: 'ai', text: e.message, provider: 'error' }]);
    } finally { setBusy(false); }
  }
  return (
    <>
      <Head title="AI analyst"
        lede="Ask the ledger anything. Every answer is computed from the live database — never estimated, never recalled from training data." />
      <div className="split" style={{ gap: 22 }}>
        <Panel title="Conversation">
          <div style={{ maxHeight: 440, overflowY: 'auto', marginBottom: 16 }}>
            {!log.length && <p className="muted small">Try one of the questions on the right, or type your own.</p>}
            {log.map((m, i) => (m.role === 'you'
              ? <div key={i} className="ai-you">{m.text}</div>
              : (
                <div key={i} className="ai-bubble">
                  <p style={{ marginBottom: 8 }}>{m.text}</p>
                  <span className="tiny muted">{m.provider}{m.ms != null ? ` · ${m.ms}ms` : ''}</span>
                </div>
              )))}
            {busy && <div className="ai-bubble"><span className="spinner" /> Querying the ledger…</div>}
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()}
              placeholder="Ask about the campaign, the pipeline, funds, donors…"
              style={{ flex: 1, padding: '11px 14px', border: '1px solid var(--border-strong)' }} />
            <button className="btn btn-sm" onClick={() => ask()} disabled={busy || !q.trim()}>Ask</button>
          </div>
        </Panel>
        <div>
          <Panel title="Suggested questions">
            {SUGGEST.map((s) => (
              <button key={s} onClick={() => ask(s)} disabled={busy}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', background: 'none',
                  border: 0, borderBottom: '1px solid var(--border)', padding: '11px 0',
                  cursor: 'pointer', fontSize: 13,
                }}>{s}</button>
            ))}
          </Panel>
          {status && (
            <Panel title="Engine status"
              note={status.llmEnabled
                ? 'A language model is narrating answers over database-computed figures.'
                : 'No language-model key is configured, so answers come from the deterministic analytics engine. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY to add generative narration over the same figures.'}>
              {[['Provider', status.provider],
                ['Generative narration', status.llmEnabled ? 'Enabled' : 'Deterministic mode'],
                ['Interactions logged', num(status.recentInteractions)]].map(([l, v]) => (
                <div key={l} className="between" style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="small muted">{l}</span><span className="small" style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function Compliance() {
  const { data: c, loading } = usePanel('/portal/compliance', []);
  const { data: audit } = usePanel('/portal/audit?limit=100', []);
  if (loading || !c) return <Loading />;
  return (
    <>
      <Head title="Compliance & audit"
        lede="Automated checks against the live database, and the append-only record of every action taken in the system." />
      <Panel title="Automated compliance checks"
        note={`Retention: audit log ${c.retention.auditLogYears} years · estate documents ${c.retention.documentYears} years · financial records ${c.retention.financialRecordYears} years. Soft delete only; financial data is never destroyed.`}>
        {c.checks.map((x) => (
          <div className="qa-row" key={x.name}>
            <span className={`qa-dot qa-${x.status === 'pass' ? 'pass' : x.status === 'warn' ? 'warn' : 'error'}`} />
            <div>
              <div style={{ fontWeight: 600 }}>{x.name}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{x.detail}</div>
            </div>
            <span className="badge b-review" style={{ marginLeft: 'auto', flex: 'none' }}>{x.standard}</span>
          </div>
        ))}
      </Panel>
      <Panel title="Immutable audit trail" flush>
        {!audit ? <div style={{ padding: 20 }}><Loading /></div> : (
          <div className="table-scroll scroll-y">
            <table className="ledger">
              <thead><tr><th>Timestamp</th><th>User</th><th>Role</th><th>Action</th>
                <th>Resource</th><th>IP</th><th>Result</th></tr></thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="code">{new Date(a.timestamp).toLocaleString('en-GB')}</td>
                    <td>{a.user_email || 'system'}</td>
                    <td className="muted">{a.user_role ? titleize(a.user_role) : '—'}</td>
                    <td className="code">{a.action}</td>
                    <td className="muted">{a.resource_type || '—'}</td>
                    <td className="code muted">{a.ip_address}</td>
                    <td><span className={`badge ${a.result === 'success' ? 'b-active' : 'b-critical'}`}>{a.result}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ═══════════════════════════════ shell ═══════════════════════════════ */

export default function Portal() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard');
  const [year, setYear] = useState('');
  const [years, setYears] = useState([]);

  useEffect(() => {
    if (!user) return;
    api('/portal/datahub')
      .then((d) => setYears(d.fiscalYears.map((y) => y.year)))
      .catch(() => {});
  }, [user]);

  if (!user) return <Login onIn={setUser} />;

  const PANELS = {
    dashboard: <Dashboard year={year} />,
    yoy: <YearOnYear />,
    forecast: <Forecast />,
    journal: <Journal year={year} />,
    trial: <TrialBalance year={year} />,
    statements: <Statements year={year} />,
    coa: <ChartOfAccounts />,
    assets: <Assets />,
    donors: <Donors />,
    stewardship: <Stewardship />,
    crm: <CRM />,
    cases: <Cases />,
    documents: <Documents />,
    datahub: <DataHub year={year} />,
    ai: <AIConsole />,
    compliance: <Compliance />,
    golive: <GoLive />,
  };

  // Only some views are period-scoped; showing the selector elsewhere would lie.
  const periodAware = ['dashboard', 'journal', 'trial', 'statements', 'datahub'];

  return (
    <div className="pshell" data-tour="portal">
      <nav className="prail" aria-label="Finance portal">
        <div className="prail-brand">
          <div className="brand-name">SANKALPA</div>
          <div className="brand-sub">Fund Accounting</div>
        </div>
        <div className="prail-nav">
          {NAV.map(([group, items]) => (
            <div key={group}>
              <div className="prail-group">{group}</div>
              {items.map(([id, label]) => (
                <button key={id} className={`prail-item${view === id ? ' on' : ''}`}
                  onClick={() => setView(id)}>{label}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="prail-foot">
          <div className="tiny muted" style={{ marginBottom: 8 }}>
            {user.name}<br />{titleize(user.role)}
          </div>
          <button className="btn btn-sm btn-ghost" style={{ width: '100%' }}
            onClick={() => { setToken(null); setUser(null); }}>Sign out</button>
        </div>
      </nav>

      <div className="pmain">
        <header className="ptop">
          <span className="ptop-crumb">Finance portal / {LABELS[view]}</span>
          <span className="ptop-spacer" />
          {periodAware.includes(view) && (
            <div className="period-select">
              <label htmlFor="fy">Fiscal year</label>
              <select id="fy" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">Inception to date</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}
          <Link to="/" className="tiny link-gold" style={{ border: 0 }}>Donor hub →</Link>
        </header>
        <div className="pbody">{PANELS[view]}</div>
      </div>
    </div>
  );
}
