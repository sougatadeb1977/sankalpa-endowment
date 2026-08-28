import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api, setToken, money, compact, num, pct, dateFmt, titleize, Icon, Loading,
  LineChart, BarList, ScenarioChart, Donut, PALETTE, useDebounced,
} from '../lib.jsx';

const TABS = [
  ['dashboard', 'Executive dashboard'],
  ['forecast', 'Actuarial forecast'],
  ['ledger', 'Fund accounting'],
  ['statements', 'Financial statements'],
  ['donors', 'Donors & pledges'],
  ['stewardship', 'Stewardship'],
  ['crm', 'CRM activity'],
  ['assets', 'Insurance & securities'],
  ['documents', 'Document review'],
  ['cases', 'Complex cases'],
  ['ai', 'AI analyst'],
  ['compliance', 'Compliance & audit'],
];

/* ─────────────────────────────── login ─────────────────────────────── */

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
    <div className="portal" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div className="brand-name" style={{ fontSize: 30 }}>SANKALPA</div>
          <div className="brand-sub">Fund Accounting & Financial Management Portal</div>
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
                <button type="button" key={e} className="chip chip-sm" onClick={() => { setEmail(e); setStage('password'); }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        </form>
        <p style={{ textAlign: 'center', marginTop: 20 }}>
          <Link to="/" className="link-gold">← Back to the donor hub</Link>
        </p>
      </div>
    </div>
  );
}

/* ────────────────────────────── panels ─────────────────────────────── */

function Dashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/portal/dashboard').then(setD).catch(() => {}); }, []);
  if (!d) return <Loading label="Loading the campaign position" />;
  const secured = d.cashRaised + d.pipeline.base;
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 26 }}>
        {[
          ['Total secured', compact(secured), `${pct(d.percentComplete)} of the $45M goal`],
          ['Cash received', compact(d.cashRaised), `${num(d.transactionCount)} transactions posted`],
          ['Pipeline present value', compact(d.pipeline.base), `${d.pipeline.count} planned gifts · ${compact(d.pipeline.faceValue)} face`],
          ['Supporters', num(d.donors), `${d.legacyCircle} in the Legacy Circle`],
        ].map(([l, v, s]) => (
          <div className="kpi" key={l}><div className="kpi-lab">{l}</div>
            <div className="kpi-val num">{v}</div><div className="kpi-sub">{s}</div></div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 26, marginBottom: 26 }}>
        <div className="card">
          <div className="overline">Endowment corpus by quarter</div>
          <LineChart height={250}
            data={d.endowmentHistory.map((h) => ({ label: h.period.replace('-', ' '), value: h.corpus }))} />
        </div>
        <div className="card">
          <div className="overline">Investment allocation</div>
          <Donut size={190} centerValue={compact(d.investments.reduce((s, i) => s + i.market_value, 0))}
            centerLabel="MARKET VALUE"
            slices={d.investments.map((i, k) => ({ label: i.name, value: i.market_value, color: PALETTE[k % PALETTE.length] }))} />
        </div>
      </div>

      <div className="grid g2" style={{ gap: 26, marginBottom: 26 }}>
        <div className="card">
          <div className="overline">Fund balances against target</div>
          {d.fundBalances.map((f, i) => (
            <div key={f.fund_code} style={{ marginBottom: 18 }}>
              <div className="between" style={{ marginBottom: 6 }}>
                <span className="small" style={{ fontWeight: 500 }}>{f.fund_name}</span>
                <span className="num small muted">{compact(f.balance)} of {compact(f.target_amount)}</span>
              </div>
              <div style={{ height: 6, background: 'var(--border)' }}>
                <div style={{
                  height: '100%', width: `${Math.min(100, (f.balance / f.target_amount) * 100)}%`,
                  background: PALETTE[i % PALETTE.length],
                }} />
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="overline">Pipeline by instrument</div>
          <BarList items={d.byType.map((t, i) => ({
            label: titleize(t.type), value: t.npv, note: `${t.count} gifts`, color: PALETTE[i % PALETTE.length],
          }))} />
        </div>
      </div>

      <div className="grid g2" style={{ gap: 26 }}>
        <div className="card">
          <div className="overline">Most recent gifts</div>
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 460 }}>
              <thead><tr><th>Date</th><th>Donor</th><th>Fund</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {d.recentGifts.map((g, i) => (
                  <tr key={i}>
                    <td className="muted">{dateFmt(g.transaction_date)}</td>
                    <td>{g.first_name} {g.last_name.charAt(0)}. <span className="tiny muted">{g.country}</span></td>
                    <td className="small">{g.fund_name}</td>
                    <td className="r">{money(g.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="overline">Attention required</div>
          {[
            ['Documents awaiting human review', d.hitlQueue, '/portal#documents'],
            ['Open complex-asset cases', d.openCases, '/portal#cases'],
            ['Average gift size', money(d.avgGift, 2), null],
            ['Raised so far this year', compact(d.ytdRaised), null],
            ['Discount rate in force (IRS §7520)', pct(d.discountRate * 100, 2), null],
          ].map(([l, v]) => (
            <div key={l} className="between" style={{ padding: '15px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="small">{l}</span>
              <span className="num" style={{ fontWeight: 600, fontSize: 17 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Forecast() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api('/actuarial/forecast').then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!d) return <Loading label="Running the actuarial model" />;
  return (
    <>
      <div className="between" style={{ marginBottom: 22 }}>
        <div>
          <h2 className="h-sub">Predictive revenue forecast</h2>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Every planned gift valued against SSA period life tables, the IRS §7520 rate of{' '}
            {pct(d.discountRate * 100, 2)}, an asset-class risk spread and a realisation probability by instrument.
          </p>
        </div>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await api('/portal/recalc-npv', { method: 'POST' }); await load(); } finally { setBusy(false); }
        }}>{busy ? <span className="spinner" /> : 'Recalculate all NPV'}</button>
      </div>

      <div className="grid g3" style={{ marginBottom: 26 }}>
        {[
          ['Pessimistic', d.totals.pessimistic, '#b9b2a2', 'Discount +2%, conservative growth, 90th percentile longevity'],
          ['Base case', d.totals.base, 'var(--indigo)', 'Current §7520 rate, conservative growth, median longevity'],
          ['Optimistic', d.totals.optimistic, 'var(--saffron)', 'Narrower spread, base growth, 10th percentile longevity'],
        ].map(([l, v, c, note]) => (
          <div className="card" key={l} style={{ borderTop: `3px solid ${c}` }}>
            <div className="kpi-lab">{l}</div>
            <div className="kpi-val num" style={{ color: c === '#b9b2a2' ? 'var(--ink-soft)' : c }}>{compact(v)}</div>
            <p className="tiny muted" style={{ marginTop: 8, marginBottom: 0 }}>{note}</p>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 26 }}>
        <div className="overline">Projected receipts by time horizon</div>
        <ScenarioChart horizons={d.horizons} />
        <div className="row" style={{ gap: 22, marginTop: 12, justifyContent: 'center' }}>
          {[['Pessimistic', '#b9b2a2'], ['Base', 'var(--indigo)'], ['Optimistic', 'var(--saffron)']].map(([l, c]) => (
            <span key={l} className="tiny" style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <i style={{ width: 10, height: 10, background: c }} />{l}
            </span>
          ))}
        </div>
      </div>

      <div className="grid g2" style={{ gap: 26 }}>
        <div className="card">
          <div className="overline">Horizon detail</div>
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 480 }}>
              <thead><tr><th>Horizon</th><th className="r">Gifts</th><th className="r">Face</th>
                <th className="r">Base NPV</th><th className="r">Optimistic</th><th className="r">Pessimistic</th></tr></thead>
              <tbody>
                {d.horizons.map((h) => (
                  <tr key={h.label}>
                    <td>{h.label}</td><td className="r">{h.count}</td>
                    <td className="r">{compact(h.faceValue)}</td>
                    <td className="r" style={{ fontWeight: 600 }}>{compact(h.base)}</td>
                    <td className="r muted">{compact(h.optimistic)}</td>
                    <td className="r muted">{compact(h.pessimistic)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td>Total</td><td className="r">{d.totals.count}</td>
                <td className="r">{compact(d.totals.faceValue)}</td>
                <td className="r">{compact(d.totals.base)}</td>
                <td className="r">{compact(d.totals.optimistic)}</td>
                <td className="r">{compact(d.totals.pessimistic)}</td>
              </tr></tfoot>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="overline">Face value vs present value, by instrument</div>
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 400 }}>
              <thead><tr><th>Instrument</th><th className="r">Count</th><th className="r">Face</th>
                <th className="r">NPV</th><th className="r">Ratio</th></tr></thead>
              <tbody>
                {d.byType.map((t) => (
                  <tr key={t.type}>
                    <td>{titleize(t.type)}</td><td className="r">{t.count}</td>
                    <td className="r">{compact(t.face)}</td><td className="r" style={{ fontWeight: 600 }}>{compact(t.npv)}</td>
                    <td className="r muted">{pct((t.npv / t.face) * 100, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>
            The ratio is the fraction of face value recognised today. Revocable bequests carry the deepest
            discount because a donor may amend a will at any time; gift annuities and remainder trusts are
            irrevocable and carry the least.
          </p>
        </div>
      </div>
    </>
  );
}

function Ledger() {
  const [tb, setTb] = useState(null);
  const [journal, setJournal] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [entry, setEntry] = useState({
    entryDate: new Date().toISOString().slice(0, 10), description: '', reference: '',
    lines: [{ accountCode: '1000', debit: '', credit: '' }, { accountCode: '4000', debit: '', credit: '' }],
  });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const load = () => {
    api('/portal/trial-balance').then(setTb).catch(() => {});
    api('/portal/journal?limit=25').then(setJournal).catch(() => {});
    api('/portal/accounts').then(setAccounts).catch(() => {});
  };
  useEffect(load, []);

  const dr = entry.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const cr = entry.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(dr - cr) < 0.005 && dr > 0;

  async function post() {
    setErr(null); setMsg(null);
    try {
      const r = await api('/portal/journal', { method: 'POST', body: entry });
      setMsg(`Entry ${r.journalEntryId.slice(0, 8).toUpperCase()} posted to the general ledger.`);
      setEntry({ ...entry, description: '', reference: '', lines: entry.lines.map((l) => ({ ...l, debit: '', credit: '' })) });
      load();
    } catch (e) { setErr(e.message); }
  }

  if (!tb || !accounts) return <Loading label="Loading the general ledger" />;

  return (
    <>
      <div className="grid g2" style={{ gap: 26, marginBottom: 26 }}>
        <div className="card">
          <div className="between" style={{ marginBottom: 16 }}>
            <div className="overline" style={{ margin: 0 }}>Trial balance</div>
            <span className={`badge ${tb.balanced ? 'b-active' : 'b-critical'}`}>
              {tb.balanced ? 'In balance' : 'Out of balance'}
            </span>
          </div>
          <div className="table-scroll" style={{ maxHeight: 460, overflowY: 'auto' }}>
            <table className="data" style={{ minWidth: 460 }}>
              <thead><tr><th>Code</th><th>Account</th><th className="r">Debit</th><th className="r">Credit</th></tr></thead>
              <tbody>
                {tb.rows.map((r) => (
                  <tr key={r.account_code}>
                    <td className="num muted">{r.account_code}</td>
                    <td className="small">{r.account_name}</td>
                    <td className="r">{r.debits ? money(r.debits, 2) : ''}</td>
                    <td className="r">{r.credits ? money(r.credits, 2) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td colSpan={2}>Totals</td>
                <td className="r">{money(tb.totalDebits, 2)}</td>
                <td className="r">{money(tb.totalCredits, 2)}</td>
              </tr></tfoot>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="overline">Post a manual journal entry</div>
          <div className="grid g2" style={{ gap: 0, columnGap: 16 }}>
            <div className="field"><label htmlFor="ed">Entry date</label>
              <input id="ed" type="date" value={entry.entryDate} onChange={(e) => setEntry({ ...entry, entryDate: e.target.value })} /></div>
            <div className="field"><label htmlFor="rf">Reference</label>
              <input id="rf" value={entry.reference} onChange={(e) => setEntry({ ...entry, reference: e.target.value })} placeholder="INV-2026-114" /></div>
          </div>
          <div className="field"><label htmlFor="ds">Description</label>
            <input id="ds" value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })}
              placeholder="Quarterly endowment spending distribution" /></div>

          {entry.lines.map((l, i) => (
            <div key={i} className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'nowrap' }}>
              <select value={l.accountCode} style={{ flex: 2, padding: '9px 10px', border: '1.5px solid var(--border)', fontSize: 12.5 }}
                onChange={(e) => { const ls = [...entry.lines]; ls[i] = { ...l, accountCode: e.target.value }; setEntry({ ...entry, lines: ls }); }}>
                {accounts.map((a) => <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.account_name}</option>)}
              </select>
              <input placeholder="Debit" type="number" step="0.01" value={l.debit} style={{ flex: 1, padding: '9px 10px', border: '1.5px solid var(--border)', minWidth: 0 }}
                onChange={(e) => { const ls = [...entry.lines]; ls[i] = { ...l, debit: e.target.value, credit: '' }; setEntry({ ...entry, lines: ls }); }} />
              <input placeholder="Credit" type="number" step="0.01" value={l.credit} style={{ flex: 1, padding: '9px 10px', border: '1.5px solid var(--border)', minWidth: 0 }}
                onChange={(e) => { const ls = [...entry.lines]; ls[i] = { ...l, credit: e.target.value, debit: '' }; setEntry({ ...entry, lines: ls }); }} />
            </div>
          ))}
          <div className="row" style={{ marginBottom: 14 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setEntry({ ...entry, lines: [...entry.lines, { accountCode: '1000', debit: '', credit: '' }] })}>
              Add line
            </button>
            <span className="small num" style={{ marginLeft: 'auto', color: balanced ? 'var(--success)' : 'var(--error)' }}>
              Dr {money(dr, 2)} · Cr {money(cr, 2)} {balanced ? '✓ balanced' : '— must balance'}
            </span>
          </div>
          {err && <p className="err">{err}</p>}
          {msg && <p className="small" style={{ color: 'var(--success)' }}>{msg}</p>}
          <button className="btn" disabled={!balanced || !entry.description} onClick={post}>Post entry</button>
          <p className="tiny muted" style={{ marginTop: 12, marginBottom: 0 }}>
            The server rejects any entry whose debits and credits do not agree — the same constraint the
            specification places on the database trigger.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="overline">General journal — most recent entries</div>
        <div className="table-scroll" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table className="data" style={{ minWidth: 720 }}>
            <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Account</th>
              <th className="r">Debit</th><th className="r">Credit</th></tr></thead>
            <tbody>
              {(journal || []).flatMap((e) => e.lines.map((l, i) => (
                <tr key={l.id}>
                  <td className="muted">{i === 0 ? dateFmt(e.entry_date) : ''}</td>
                  <td className="tiny num muted">{i === 0 ? e.reference_number : ''}</td>
                  <td className="small">{i === 0 ? e.description : ''}</td>
                  <td className="small">{l.account_code} {l.account_name}</td>
                  <td className="r">{l.debit_amount ? money(l.debit_amount, 2) : ''}</td>
                  <td className="r">{l.credit_amount ? money(l.credit_amount, 2) : ''}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Statements() {
  const [s, setS] = useState(null);
  useEffect(() => { api('/portal/statements').then(setS).catch(() => {}); }, []);
  if (!s) return <Loading label="Preparing the statements" />;
  const a = s.statementOfActivities;
  return (
    <>
      <div className="grid g2" style={{ gap: 26, marginBottom: 26 }}>
        <div className="card">
          <div className="overline">Statement of activities · FASB ASC 958</div>
          <table className="data" style={{ minWidth: 0 }}>
            <thead><tr><th>Revenue and support</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {a.revenue.map((r) => (
                <tr key={r.code}><td className="small">{r.code} {r.name}</td><td className="r">{money(r.net, 2)}</td></tr>
              ))}
              <tr><td style={{ fontWeight: 600 }}>Total revenue</td><td className="r" style={{ fontWeight: 600 }}>{money(a.totalRevenue, 2)}</td></tr>
            </tbody>
            <thead><tr><th>Expenses</th><th className="r" /></tr></thead>
            <tbody>
              {a.expense.map((r) => (
                <tr key={r.code}><td className="small">{r.code} {r.name}</td><td className="r">{money(r.net, 2)}</td></tr>
              ))}
              <tr><td style={{ fontWeight: 600 }}>Total expenses</td><td className="r" style={{ fontWeight: 600 }}>{money(a.totalExpense, 2)}</td></tr>
            </tbody>
            <tfoot><tr><td>Change in net assets</td><td className="r">{money(a.changeInNetAssets, 2)}</td></tr></tfoot>
          </table>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 26 }}>
            <div className="overline">Net asset classification · ASU 2016-14</div>
            <Donut size={180} centerValue={compact(a.totalRevenue)} centerLabel="TOTAL SUPPORT"
              slices={[
                { label: 'Without donor restriction', value: Math.max(0, a.withoutRestriction), color: PALETTE[0] },
                { label: 'With purpose restriction', value: Math.max(0, a.purposeRestricted), color: PALETTE[1] },
                { label: 'Perpetual (endowment corpus)', value: Math.max(0, a.perpetual), color: PALETTE[2] },
              ]} />
          </div>
          <div className="card">
            <div className="overline">Statement of financial position</div>
            <table className="data" style={{ minWidth: 0 }}>
              <thead><tr><th>Assets</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {s.statementOfFinancialPosition.assets.map((x) => (
                  <tr key={x.code}><td className="small">{x.code} {x.name}</td><td className="r">{money(x.net, 2)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total assets</td><td className="r">{money(s.statementOfFinancialPosition.totalAssets, 2)}</td></tr></tfoot>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="overline">Planned gift pipeline — disclosure note</div>
        <p className="small muted">{s.plannedGiftPipeline.note}</p>
        <div className="row" style={{ gap: 40 }}>
          {[['Gifts documented', s.plannedGiftPipeline.count],
            ['Aggregate face value', compact(s.plannedGiftPipeline.faceValue)],
            ['Present value, base case', compact(s.plannedGiftPipeline.base)],
            ['Range (pessimistic – optimistic)', `${compact(s.plannedGiftPipeline.pessimistic)} – ${compact(s.plannedGiftPipeline.optimistic)}`]]
            .map(([l, v]) => (
              <div key={l}><div className="kpi-lab">{l}</div>
                <div className="serif-num" style={{ fontSize: 24, color: 'var(--indigo)', fontWeight: 600 }}>{v}</div></div>
            ))}
        </div>
      </div>
    </>
  );
}

function Donors() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 320);
  const [rows, setRows] = useState(null);
  const [pledges, setPledges] = useState(null);
  const [sel, setSel] = useState(null);
  const [rec, setRec] = useState(null);

  useEffect(() => { api(`/portal/donors?q=${encodeURIComponent(dq)}`).then(setRows).catch(() => {}); }, [dq]);
  useEffect(() => { api('/portal/pledges').then(setPledges).catch(() => {}); }, []);
  useEffect(() => {
    if (!sel) { setRec(null); return; }
    setRec('loading');
    api(`/ai/recommendations/${sel.id}`).then(setRec).catch(() => setRec(null));
  }, [sel]);

  return (
    <>
      <div className="card" style={{ marginBottom: 26 }}>
        <div className="between" style={{ marginBottom: 16 }}>
          <div className="overline" style={{ margin: 0 }}>Donor register</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or country"
            style={{ padding: '9px 14px', border: '1.5px solid var(--border)', minWidth: 260 }} />
        </div>
        {!rows ? <Loading /> : (
          <div className="table-scroll" style={{ maxHeight: 520, overflowY: 'auto' }}>
            <table className="data" style={{ minWidth: 760 }}>
              <thead><tr><th>Donor</th><th>Country</th><th className="r">Age</th><th className="r">Gifts</th>
                <th className="r">Lifetime</th><th className="r">Pipeline NPV</th><th /></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => setSel(d)}>
                    <td>{d.first_name} {d.last_name}
                      {d.is_legacy_society ? <span className="badge b-fulfilled" style={{ marginLeft: 8 }}>Circle</span> : null}</td>
                    <td className="muted">{d.country}</td>
                    <td className="r muted">{d.age ?? '—'}</td>
                    <td className="r">{d.gift_count}</td>
                    <td className="r">{money(d.total_donated)}</td>
                    <td className="r" style={{ fontWeight: 600 }}>{d.pipeline_npv ? money(d.pipeline_npv) : '—'}</td>
                    <td className="r tiny link-gold" style={{ border: 0 }}>Brief →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sel && (
        <div className="card" style={{ marginBottom: 26, borderTop: '3px solid var(--teal)' }}>
          <div className="between" style={{ marginBottom: 14 }}>
            <div>
              <div className="overline" style={{ margin: 0 }}>Gift officer brief</div>
              <h3 className="h-sub">{sel.first_name} {sel.last_name}</h3>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => setSel(null)}>Close</button>
          </div>
          {rec === 'loading' ? <Loading label="Scoring propensity" /> : rec ? (
            <>
              <div className="row" style={{ gap: 30, marginBottom: 18 }}>
                {[['Propensity', `${rec.propensityScore}/100`], ['Band', rec.band],
                  ['Lifetime', money(rec.lifetimeGiving)], ['Pipeline', money(rec.pipelineNpv)],
                  ['Last gift', rec.recencyDays != null ? `${rec.recencyDays} days ago` : '—']].map(([l, v]) => (
                  <div key={l}><div className="kpi-lab">{l}</div>
                    <div className="serif-num" style={{ fontSize: 22, color: 'var(--indigo)', fontWeight: 600 }}>{v}</div></div>
                ))}
              </div>
              <p style={{ fontSize: 15 }}>{rec.narrative}</p>
              <div className="overline" style={{ marginTop: 20 }}>Recommended next conversations</div>
              {rec.actions.map((a, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                  <p className="small muted" style={{ marginBottom: 0 }}>{a.body}</p>
                </div>
              ))}
              <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>Engine: {rec.provider}</p>
            </>
          ) : <p className="muted small">No brief available.</p>}
        </div>
      )}

      <div className="card">
        <div className="overline">Pledge book</div>
        {!pledges ? <Loading /> : (
          <div className="table-scroll" style={{ maxHeight: 460, overflowY: 'auto' }}>
            <table className="data" style={{ minWidth: 700 }}>
              <thead><tr><th>Donor</th><th>Instrument</th><th>Fund</th><th>Committed</th>
                <th className="r">Face value</th><th>Status</th></tr></thead>
              <tbody>
                {pledges.map((p) => (
                  <tr key={p.id}>
                    <td>{p.first_name} {p.last_name}</td>
                    <td className="small">{titleize(p.pledge_type)}</td>
                    <td className="small muted">{p.fund_name}</td>
                    <td className="muted">{dateFmt(p.commitment_date)}</td>
                    <td className="r">{money(p.face_value)}</td>
                    <td><span className={`badge b-${p.status === 'active' ? 'active' : p.status === 'committed' ? 'committed' : 'prospect'}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Documents() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/portal/documents').then(setD).catch(() => {}); }, []);
  if (!d) return <Loading />;
  const review = d.filter((x) => x.parse_status === 'needs_review');
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 26 }}>
        {[['Documents in the vault', d.length], ['Awaiting human review', review.length],
          ['Auto-populated', d.filter((x) => x.parse_status === 'completed').length],
          ['Not yet parsed', d.filter((x) => x.parse_status === 'not_parsed').length]].map(([l, v]) => (
          <div className="kpi" key={l}><div className="kpi-lab">{l}</div><div className="kpi-val num">{v}</div></div>
        ))}
      </div>
      <div className="card">
        <div className="overline">Human-in-the-loop review queue — 2 business day SLA</div>
        <div className="table-scroll" style={{ maxHeight: 560, overflowY: 'auto' }}>
          <table className="data" style={{ minWidth: 700 }}>
            <thead><tr><th>Document</th><th>Donor</th><th>Folder</th><th>Uploaded</th>
              <th className="r">Min. confidence</th><th>Status</th></tr></thead>
            <tbody>
              {d.map((x) => (
                <tr key={x.id}>
                  <td className="small">{x.file_name}</td>
                  <td>{x.first_name ? `${x.first_name} ${x.last_name}` : '—'}</td>
                  <td className="muted small">{titleize(x.folder)}</td>
                  <td className="muted">{dateFmt(x.created_at)}</td>
                  <td className="r num" style={{ color: x.parse_confidence_min >= 0.9 ? 'var(--success)' : 'var(--saffron)' }}>
                    {x.parse_confidence_min ? pct(x.parse_confidence_min * 100, 1) : '—'}
                  </td>
                  <td><span className={`badge ${x.parse_status === 'completed' ? 'b-active' : x.parse_status === 'needs_review' ? 'b-pending' : 'b-lapsed'}`}>
                    {x.parse_status.replace('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Cases() {
  const [c, setC] = useState(null);
  useEffect(() => { api('/portal/cases').then(setC).catch(() => {}); }, []);
  if (!c) return <Loading />;
  return (
    <div className="grid g2" style={{ gap: 26 }}>
      {c.map((x) => (
        <div key={x.id} className="card" style={{
          borderTop: `3px solid ${x.ai_priority === 'critical' ? 'var(--error)' : x.ai_priority === 'high' ? 'var(--saffron)' : 'var(--steel)'}`,
        }}>
          <div className="between" style={{ marginBottom: 12 }}>
            <div>
              <div className="overline" style={{ margin: 0 }}>{x.asset_value_range}</div>
              <h3 className="h-sub">{x.intake_full_name}</h3>
            </div>
            <span className={`badge b-${x.ai_priority === 'critical' ? 'critical' : x.ai_priority === 'high' ? 'high' : 'review'}`}>
              {x.ai_priority}
            </span>
          </div>
          <div className="chip-row" style={{ marginBottom: 14 }}>
            {JSON.parse(x.asset_types || '[]').map((a) => (
              <span key={a} className="badge b-review">{titleize(a)}</span>
            ))}
          </div>
          <p className="small muted">{x.description}</p>
          {x.ai_triage && <p className="small" style={{ borderLeft: '3px solid var(--teal)', paddingLeft: 14 }}>{x.ai_triage}</p>}
          <div className="between" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
            <span className="tiny muted">
              {x.cons_first ? `${x.cons_first} ${x.cons_last}, ${x.firm_name}` : 'Unassigned'}
            </span>
            <span className="badge b-review">{x.status.replace(/_/g, ' ')}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AIConsole() {
  const [q, setQ] = useState('');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  useEffect(() => { api('/ai/status').then(setStatus).catch(() => {}); }, []);

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
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 26, alignItems: 'start' }}>
      <div className="card">
        <div className="overline">Ask the ledger anything</div>
        <p className="small muted">
          Every answer is computed from the live database — never estimated, never recalled from training data.
        </p>
        <div style={{ maxHeight: 460, overflowY: 'auto', margin: '18px 0' }}>
          {!log.length && <p className="muted small">Try one of the questions on the right, or type your own.</p>}
          {log.map((m, i) => m.role === 'you'
            ? <div key={i} className="ai-you">{m.text}</div>
            : (
              <div key={i} className="ai-bubble">
                <p style={{ marginBottom: 8 }}>{m.text}</p>
                <span className="tiny muted">{m.provider}{m.ms != null ? ` · ${m.ms}ms` : ''}</span>
              </div>
            ))}
          {busy && <div className="ai-bubble"><span className="spinner" /> Querying the ledger…</div>}
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()}
            placeholder="Ask about the campaign, the pipeline, funds, donors…"
            style={{ flex: 1, padding: '13px 16px', border: '1.5px solid var(--border)' }} />
          <button className="btn" onClick={() => ask()} disabled={busy || !q.trim()}>Ask</button>
        </div>
      </div>

      <div>
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="overline">Suggested questions</div>
          {SUGGEST.map((s) => (
            <button key={s} onClick={() => ask(s)} disabled={busy}
              style={{
                display: 'block', width: '100%', textAlign: 'left', background: 'none',
                border: 0, borderBottom: '1px solid var(--border)', padding: '12px 0',
                cursor: 'pointer', fontSize: 13.5,
              }}>{s}</button>
          ))}
        </div>
        {status && (
          <div className="card">
            <div className="overline">Engine status</div>
            {[['Provider', status.provider],
              ['Generative narration', status.llmEnabled ? 'Enabled' : 'Deterministic mode'],
              ['Interactions logged', num(status.recentInteractions)]].map(([l, v]) => (
              <div key={l} className="between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="small muted">{l}</span><span className="small" style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
            <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>
              {status.llmEnabled
                ? 'A language model is narrating answers over database-computed figures.'
                : 'No language-model key is configured, so answers are produced by the deterministic analytics engine. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY (or ANTHROPIC_API_KEY) to add generative narration over the same figures.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Compliance() {
  const [c, setC] = useState(null);
  const [audit, setAudit] = useState(null);
  useEffect(() => {
    api('/portal/compliance').then(setC).catch(() => {});
    api('/portal/audit?limit=80').then(setAudit).catch(() => {});
  }, []);
  if (!c) return <Loading />;
  return (
    <>
      <div className="card" style={{ marginBottom: 26 }}>
        <div className="overline">Automated compliance checks</div>
        {c.checks.map((x) => (
          <div key={x.name} className="between" style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
              <span style={{
                width: 26, height: 26, flex: 'none', display: 'grid', placeItems: 'center',
                color: x.status === 'pass' ? 'var(--success)' : x.status === 'warn' ? 'var(--saffron)' : 'var(--error)',
                border: '1.5px solid currentColor',
              }}>{x.status === 'pass' ? <Icon.check width={14} height={14} strokeWidth={2.4} /> : '!'}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{x.name}</div>
                <div className="tiny muted">{x.detail}</div>
              </div>
            </div>
            <span className="badge b-review" style={{ flex: 'none' }}>{x.standard}</span>
          </div>
        ))}
        <p className="tiny muted" style={{ marginTop: 16, marginBottom: 0 }}>
          Retention: audit log {c.retention.auditLogYears} years · estate documents {c.retention.documentYears} years ·
          financial records {c.retention.financialRecordYears} years. Soft delete only; financial data is never destroyed.
        </p>
      </div>

      <div className="card">
        <div className="overline">Immutable audit trail — most recent events</div>
        {!audit ? <Loading /> : (
          <div className="table-scroll" style={{ maxHeight: 520, overflowY: 'auto' }}>
            <table className="data" style={{ minWidth: 720 }}>
              <thead><tr><th>Timestamp</th><th>User</th><th>Role</th><th>Action</th>
                <th>Resource</th><th>IP</th><th>Result</th></tr></thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="tiny num muted">{new Date(a.timestamp).toLocaleString('en-GB')}</td>
                    <td className="small">{a.user_email || 'system'}</td>
                    <td className="tiny muted">{a.user_role ? titleize(a.user_role) : '—'}</td>
                    <td className="tiny num">{a.action}</td>
                    <td className="tiny muted">{a.resource_type || '—'}</td>
                    <td className="tiny num muted">{a.ip_address}</td>
                    <td><span className={`badge ${a.result === 'success' ? 'b-active' : 'b-critical'}`}>{a.result}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}


/* ───────────────────── stewardship automation ──────────────────────── */

function Stewardship() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const load = () => api('/portal/stewardship').then(setD).catch(() => {});
  useEffect(() => { load(); }, []);

  async function run() {
    setBusy(true);
    try { await api('/portal/stewardship/run', { method: 'POST' }); await load(); }
    finally { setBusy(false); }
  }
  async function complete(id) {
    await api(`/portal/stewardship/${id}/complete`, { method: 'POST' });
    load();
  }

  if (!d) return <Loading label="Loading the stewardship queue" />;
  const tasks = filter === 'all' ? d.tasks : d.tasks.filter((t) => t.rule_key === filter);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="between" style={{ marginBottom: 22 }}>
        <div>
          <h2 className="h-sub">Smart workflows &amp; stewardship</h2>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Rules are evaluated against the live database at boot and every six hours. A deferred gift takes
            decades to mature — the follow-ups cannot depend on anyone remembering.
          </p>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={run} disabled={busy}>
          {busy ? <span className="spinner" /> : 'Re-evaluate rules now'}
        </button>
      </div>

      <div className="grid g4" style={{ marginBottom: 26 }}>
        {[
          ['Open tasks', num(d.summary.open)],
          ['Due within 7 days', num(d.summary.dueThisWeek)],
          ['Overdue', num(d.summary.overdue)],
          ['Completed', num(d.summary.completed)],
        ].map(([l, v]) => (
          <div className="kpi" key={l}><div className="kpi-lab">{l}</div><div className="kpi-val num">{v}</div></div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 26 }}>
        <div className="overline">Active triggers</div>
        <div className="chip-row">
          <button className={`chip chip-sm${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
            All ({d.summary.open})
          </button>
          {d.summary.byRule.filter((r) => r.open > 0).map((r) => (
            <button key={r.rule_key} className={`chip chip-sm${filter === r.rule_key ? ' on' : ''}`}
              onClick={() => setFilter(r.rule_key)}>{r.label} ({r.open})</button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="overline">Task queue</div>
        <div className="table-scroll" style={{ maxHeight: 620, overflowY: 'auto' }}>
          <table className="data" style={{ minWidth: 800 }}>
            <thead><tr><th>Due</th><th>Priority</th><th>Task</th><th>Channel</th><th /></tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td className="num muted" style={{ whiteSpace: 'nowrap',
                    color: t.due_date < today ? 'var(--error)' : undefined }}>
                    {dateFmt(t.due_date)}
                  </td>
                  <td>
                    <span className={`badge b-${t.priority === 'high' ? 'high' : t.priority === 'low' ? 'lapsed' : 'review'}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.title}</div>
                    <div className="tiny muted" style={{ maxWidth: 620 }}>{t.detail}</div>
                  </td>
                  <td className="tiny muted">{titleize(t.channel)}</td>
                  <td className="r">
                    <button className="btn btn-sm btn-ghost" onClick={() => complete(t.id)}>Done</button>
                  </td>
                </tr>
              ))}
              {!tasks.length && (
                <tr><td colSpan={5} className="muted small">Nothing open under this trigger.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>
          Completing a task writes a stewardship touch to the donor's CRM record automatically — no manual
          logging, and no gap in the history.
        </p>
      </div>
    </>
  );
}

/* ──────────────────── automated CRM activity log ───────────────────── */

function CRM() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/portal/interactions?limit=120').then(setD).catch(() => {}); }, []);
  if (!d) return <Loading label="Loading interaction history" />;
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 26 }}>
        {[
          ['Interactions logged', num(d.total)],
          ['Captured automatically', num(d.automated)],
          ['Manual data entry required', num(d.total - d.automated)],
          ['Distinct activity types', num(d.byType.length)],
        ].map(([l, v]) => (
          <div className="kpi" key={l}><div className="kpi-lab">{l}</div><div className="kpi-val num">{v}</div></div>
        ))}
      </div>

      <div className="grid g2" style={{ gap: 26, marginBottom: 26 }}>
        <div className="card">
          <div className="overline">By activity type</div>
          <BarList format={num} items={d.byType.map((t, i) => ({
            label: titleize(t.interaction_type), value: t.n, color: PALETTE[i % PALETTE.length],
          }))} />
        </div>
        <div className="card">
          <div className="overline">By channel</div>
          <BarList format={num} items={d.byChannel.map((t, i) => ({
            label: titleize(t.channel), value: t.n, color: PALETTE[(i + 3) % PALETTE.length],
          }))} />
        </div>
      </div>

      <div className="card">
        <div className="overline">Recent activity — logged without anyone typing it</div>
        <div className="table-scroll" style={{ maxHeight: 560, overflowY: 'auto' }}>
          <table className="data" style={{ minWidth: 740 }}>
            <thead><tr><th>When</th><th>Donor</th><th>Type</th><th>Subject</th><th>Channel</th><th>Source</th></tr></thead>
            <tbody>
              {d.recent.map((i) => (
                <tr key={i.id}>
                  <td className="tiny num muted" style={{ whiteSpace: 'nowrap' }}>{dateFmt(i.occurred_at)}</td>
                  <td className="small">{i.first_name ? `${i.first_name} ${i.last_name}` : '—'}</td>
                  <td className="tiny">{titleize(i.interaction_type)}</td>
                  <td className="small">{i.subject}</td>
                  <td className="tiny muted">{titleize(i.channel)}</td>
                  <td><span className={`badge ${i.source === 'auto' ? 'b-active' : 'b-review'}`}>{i.source}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ─────────── life insurance & pledged securities tracking ──────────── */

function Assets() {
  const [ins, setIns] = useState(null);
  const [sec, setSec] = useState(null);
  const [busy, setBusy] = useState(false);
  const loadSec = () => api('/portal/securities').then(setSec).catch(() => {});
  useEffect(() => { api('/portal/insurance').then(setIns).catch(() => {}); loadSec(); }, []);
  if (!ins || !sec) return <Loading label="Valuing pledged assets" />;

  return (
    <>
      <div className="between" style={{ marginBottom: 22 }}>
        <div>
          <h2 className="h-sub">Pledged asset tracking</h2>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Life insurance premium performance and mark-to-market valuation of every pledged equity position.
          </p>
        </div>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => {
          setBusy(true); try { await loadSec(); } finally { setBusy(false); }
        }}>{busy ? <span className="spinner" /> : 'Re-mark prices'}</button>
      </div>

      <div className="grid g4" style={{ marginBottom: 26 }}>
        {[
          ['Securities at market', compact(sec.totals.marketValue), `${sec.totals.positions} positions`],
          ['Unrealised gain in pledged stock', compact(sec.totals.unrealisedGain),
            `${compact(sec.totals.capitalGainsAvoided)} of capital-gains tax avoided`],
          ['Insurance death benefit pledged', compact(ins.totals.faceValue), `${ins.totals.count} policies`],
          ['Premiums received to date', compact(ins.totals.premiumsPaid),
            `${ins.totals.atLapseRisk} policies at lapse risk`],
        ].map(([l, v, sub]) => (
          <div className="kpi" key={l}><div className="kpi-lab">{l}</div>
            <div className="kpi-val num">{v}</div><div className="kpi-sub">{sub}</div></div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 26 }}>
        <div className="between" style={{ marginBottom: 14 }}>
          <div className="overline" style={{ margin: 0 }}>Pledged securities — marked to market</div>
          <span className="tiny muted">as of {new Date(sec.asOf).toLocaleString('en-GB')}</span>
        </div>
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 820 }}>
            <thead><tr><th>Ticker</th><th>Donor</th><th className="r">Shares</th><th className="r">Last</th>
              <th className="r">Cost basis</th><th className="r">Market value</th>
              <th className="r">Unrealised gain</th><th className="r">Day change</th></tr></thead>
            <tbody>
              {sec.holdings.map((h) => (
                <tr key={h.id}>
                  <td style={{ fontWeight: 600 }}>{h.ticker}
                    <div className="tiny muted">{h.name}</div></td>
                  <td className="small">{h.donor} <span className="tiny muted">{h.country}</span></td>
                  <td className="r num">{num(h.shares)}</td>
                  <td className="r num">{money(h.lastPrice, 2)}</td>
                  <td className="r num muted">{money(h.costBasis)}</td>
                  <td className="r num" style={{ fontWeight: 600 }}>{money(h.marketValue)}</td>
                  <td className="r num" style={{ color: 'var(--success)' }}>{money(h.unrealisedGain)}</td>
                  <td className="r num" style={{ color: h.dayChange >= 0 ? 'var(--success)' : 'var(--error)' }}>
                    {h.dayChange >= 0 ? '+' : ''}{money(h.dayChange)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr>
              <td colSpan={4}>Total</td>
              <td className="r">{money(sec.totals.costBasis)}</td>
              <td className="r">{money(sec.totals.marketValue)}</td>
              <td className="r">{money(sec.totals.unrealisedGain)}</td>
              <td />
            </tr></tfoot>
          </table>
        </div>
        <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>
          Transferred through {sec.partner?.name}. Because the shares pass directly, the{' '}
          {compact(sec.totals.capitalGainsAvoided)} of embedded capital-gains tax is never paid by the donor or
          by the Foundation.
        </p>
      </div>

      <div className="card">
        <div className="overline">Life insurance policies &amp; premium performance</div>
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 860 }}>
            <thead><tr><th>Policy</th><th>Donor</th><th>Insurer</th><th className="r">Death benefit</th>
              <th className="r">AOLF share</th><th className="r">Annual premium</th>
              <th className="r">Paid</th><th className="r">Missed</th><th>Next due</th></tr></thead>
            <tbody>
              {ins.policies.map((p) => (
                <tr key={p.id}>
                  <td className="tiny num">{p.policyNumber}</td>
                  <td className="small">{p.donor}</td>
                  <td className="small muted">{p.insurer}</td>
                  <td className="r num">{money(p.faceValue)}</td>
                  <td className="r num muted">{p.foundationShare}%</td>
                  <td className="r num">{money(p.annualPremium)}</td>
                  <td className="r num">{p.paid.count} · {money(p.paid.total)}</td>
                  <td className="r num" style={{ color: p.missed.count ? 'var(--error)' : undefined }}>
                    {p.missed.count}
                  </td>
                  <td className="tiny muted">
                    {p.nextDue ? dateFmt(p.nextDue) : '—'}
                    {p.lapseRisk && <span className="badge b-critical" style={{ marginLeft: 8 }}>lapse risk</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>
          Two consecutive missed premiums flag a policy as a lapse risk, which raises a stewardship task
          automatically — a lapsed policy is a lost gift.
        </p>
      </div>
    </>
  );
}

/* ─────────────────────────────── shell ─────────────────────────────── */

export default function Portal() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('dashboard');
  if (!user) return <Login onIn={setUser} />;
  return (
    <div className="portal" data-tour="portal">
      <div className="portal-bar">
        <div className="brand-name" style={{ fontSize: 21, marginRight: 8 }}>SANKALPA</div>
        <div className="portal-tabs">
          {TABS.map(([id, l]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>
          ))}
        </div>
        <div className="tiny muted" style={{ whiteSpace: 'nowrap' }}>
          {user.name} · {titleize(user.role)}
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => { setToken(null); setUser(null); }}>Sign out</button>
      </div>
      <div style={{ padding: '32px var(--gut) 80px' }}>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'forecast' && <Forecast />}
        {tab === 'ledger' && <Ledger />}
        {tab === 'statements' && <Statements />}
        {tab === 'donors' && <Donors />}
        {tab === 'stewardship' && <Stewardship />}
        {tab === 'crm' && <CRM />}
        {tab === 'assets' && <Assets />}
        {tab === 'documents' && <Documents />}
        {tab === 'cases' && <Cases />}
        {tab === 'ai' && <AIConsole />}
        {tab === 'compliance' && <Compliance />}
      </div>
    </div>
  );
}
