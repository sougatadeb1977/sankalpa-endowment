import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api, money, compact, num, dateFmt, titleize, Head, Icon, Loading, LineChart, BarList, PALETTE,
} from '../lib.jsx';

export default function Impact() {
  const [hub, setHub] = useState(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function load(path, body) {
    setBusy(true); setErr(null);
    try {
      const auth = body ? await api(path, { method: 'POST', body }) : await api(path);
      setHub(await api(`/donor/${auth.donor.id}/hub`));
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (!hub) {
    return (
      <section className="section">
        <div className="wrap narrow">
          <Head over="My impact" title="Sign in to your supporter dashboard"
            lede="Your lifetime giving, the lives it has touched, your pledges, your documents, and a short list of next steps chosen for your situation." />
          <div className="card card-feature">
            <div className="field">
              <label htmlFor="em">Email address on your supporter record</label>
              <input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.org" onKeyDown={(e) => e.key === 'Enter' && load('/auth/donor-login', { email })} />
            </div>
            {err && <p className="err">{err}</p>}
            <div className="row">
              <button className="btn" disabled={busy || !email} onClick={() => load('/auth/donor-login', { email })}>
                {busy ? <span className="spinner" /> : 'Sign in'}
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => load('/auth/demo-donor')}>
                Open a sample supporter account
              </button>
            </div>
            <p className="tiny muted" style={{ marginTop: 18, marginBottom: 0 }}>
              In production this is a one-time passcode sent to your email, per the specification. The sample
              account opens a real record from the database so you can see a full giving history.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const { donor, lifetime, transactions, givingByYear, givingByFund, pledges, plannedGifts, documents, recommendations } = hub;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <section className="section">
      <div className="wrap">
        {/* welcome */}
        <div className="between" style={{ marginBottom: 40 }}>
          <div>
            <div className="overline">Your supporter dashboard</div>
            <h1 className="h-section">{greeting}, {donor.firstName}. 🙏</h1>
            <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
              {donor.city ? `${donor.city}, ` : ''}{donor.country}
              {donor.memberSince && ` · supporting since ${new Date(donor.memberSince).getFullYear()}`}
              {donor.isLegacySociety && ' · Sankalpa Legacy Circle'}
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setHub(null)}>Sign out</button>
        </div>

        {/* lifetime cards */}
        <div className="grid g4" style={{ marginBottom: 34 }} data-tour="impact">
          {[
            ['Lifetime giving', money(lifetime.totalDonated), `${lifetime.giftCount} gifts over ${lifetime.yearsGiving} year${lifetime.yearsGiving === 1 ? '' : 's'}`],
            ['Lives touched', num(lifetime.livesTouched), 'at $10 per person reached'],
            ['Legacy commitments', money(lifetime.pipelineFaceValue), `${plannedGifts.length} documented instrument${plannedGifts.length === 1 ? '' : 's'}`],
            ['Present value to the endowment', money(lifetime.pipelineNpv), 'actuarially valued today'],
          ].map(([l, v, s]) => (
            <div className="kpi" key={l}>
              <div className="kpi-lab">{l}</div>
              <div className="kpi-val num">{v}</div>
              <div className="kpi-sub">{s}</div>
            </div>
          ))}
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 34, alignItems: 'start' }}>
          <div>
            {/* recommendations */}
            {recommendations && (
              <div className="card" style={{ marginBottom: 26 }}>
                <div className="between" style={{ marginBottom: 14 }}>
                  <div className="overline" style={{ margin: 0 }}>Chosen for you</div>
                  <span className="badge b-review">Propensity {recommendations.propensityScore}/100 · {recommendations.band}</span>
                </div>
                <p className="small muted" style={{ marginBottom: 20 }}>{recommendations.narrative}</p>
                {recommendations.actions.map((a, i) => (
                  <div key={i} style={{
                    padding: '18px 0', borderTop: '1px solid var(--border)',
                    display: 'flex', gap: 16, alignItems: 'flex-start',
                  }}>
                    <span className="serif-num" style={{ fontSize: 19, color: 'var(--saffron)', flex: 'none', width: 24 }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--serif)', fontSize: 19, color: 'var(--indigo)', marginBottom: 5 }}>{a.title}</div>
                      <p className="small muted" style={{ marginBottom: 8 }}>{a.body}</p>
                      <Link to={a.href} className="link-gold">{a.cta} →</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* giving history */}
            {givingByYear.length > 1 && (
              <div className="card" style={{ marginBottom: 26 }}>
                <div className="overline">Your giving, year by year</div>
                <LineChart data={givingByYear.map((y) => ({ label: y.year, value: y.total }))} height={200} />
              </div>
            )}

            {/* transactions */}
            <div className="card" style={{ marginBottom: 26 }}>
              <div className="overline">Recent gifts</div>
              <div className="table-scroll">
                <table className="data">
                  <thead><tr><th>Date</th><th>Fund</th><th>Method</th><th className="r">Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {transactions.slice(0, 12).map((t) => (
                      <tr key={t.id}>
                        <td>{dateFmt(t.transaction_date)}</td>
                        <td>{t.fund_name}</td>
                        <td className="muted">{titleize(t.payment_method)}</td>
                        <td className="r">{money(t.amount, 2)}</td>
                        <td><span className={`badge ${t.status === 'completed' ? 'b-active' : t.status === 'pending' ? 'b-pending' : 'b-lapsed'}`}>{t.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* pledges */}
            {pledges.length > 0 && (
              <div className="card">
                <div className="overline">Your pledges and commitments</div>
                {pledges.map((p) => (
                  <div key={p.id} className="between" style={{ padding: '15px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{titleize(p.pledge_type)}</div>
                      <div className="tiny muted">{p.fund_name} · committed {dateFmt(p.commitment_date)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="num" style={{ fontWeight: 600 }}>{money(p.face_value)}</div>
                      <span className={`badge b-${p.status === 'active' ? 'active' : p.status === 'committed' ? 'committed' : 'prospect'}`}>{p.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside>
            {/* fund split */}
            {givingByFund.length > 0 && (
              <div className="card" style={{ marginBottom: 22 }}>
                <div className="overline">Where your giving went</div>
                <BarList items={givingByFund.map((f, i) => ({
                  label: f.fund_name, value: f.total, color: PALETTE[i % PALETTE.length],
                  note: f.impact_cost_per_unit ? `${Math.round(f.total / f.impact_cost_per_unit).toLocaleString()} ${f.impact_unit.split(' ').slice(0, 2).join(' ')}` : null,
                }))} />
              </div>
            )}

            {/* documents */}
            <div className="card" style={{ marginBottom: 22 }}>
              <div className="between" style={{ marginBottom: 12 }}>
                <div className="overline" style={{ margin: 0 }}>Document vault</div>
                <Link to="/vault" className="link-gold" style={{ fontSize: 11 }}>Open →</Link>
              </div>
              {documents.length ? documents.slice(0, 5).map((d) => (
                <div key={d.id} className="between" style={{ padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                    <Icon.doc width={16} height={16} style={{ color: 'var(--earth)', flex: 'none' }} />
                    <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.file_name}
                    </span>
                  </div>
                  <span className={`badge ${d.parse_status === 'completed' ? 'b-active' : d.parse_status === 'needs_review' ? 'b-pending' : 'b-lapsed'}`}
                    style={{ flex: 'none' }}>
                    {d.parse_status === 'completed' ? 'verified' : d.parse_status.replace('_', ' ')}
                  </span>
                </div>
              )) : (
                <p className="small muted" style={{ marginBottom: 0 }}>
                  Nothing stored yet. Uploading your will or beneficiary form lets us honour your wishes exactly.
                </p>
              )}
            </div>

            {/* planned gifts */}
            {plannedGifts.length > 0 && (
              <div className="card" style={{ marginBottom: 22 }}>
                <div className="overline">Legacy instruments</div>
                {plannedGifts.map((g) => (
                  <div key={g.id} style={{ padding: '13px 0', borderBottom: '1px solid var(--border)' }}>
                    <div className="between">
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{titleize(g.gift_type)}</span>
                      <span className="num small">{money(g.npv)}</span>
                    </div>
                    <div className="tiny muted">
                      Present value · expected {g.expected_receipt_year || '—'}
                      {g.ai_extracted ? ' · AI-extracted from your documents' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="card card-feature" style={{ background: 'var(--lotus)' }}>
              <div className="overline">Thank you</div>
              <p className="quote" style={{ fontSize: 19 }}>
                “Love in action is service.”
              </p>
              <p className="tiny muted" style={{ marginBottom: 0 }}>
                Gurudev Sri Sri Ravi Shankar
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
