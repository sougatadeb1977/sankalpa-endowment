import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, num, Head, Icon, titleize, Loading } from '../lib.jsx';

const ASSETS = [
  ['real_estate', 'Property or land'], ['business_interest', 'A business or company stake'],
  ['farmland', 'Farmland or agricultural land'], ['art_collectibles', 'Art or collectibles'],
  ['private_equity', 'Private or pre-IPO shares'], ['cryptocurrency', 'Cryptocurrency'],
  ['oil_gas_royalties', 'Mineral or royalty interests'], ['intellectual_property', 'Intellectual property or royalties'],
  ['retirement', 'Retirement accounts'], ['insurance', 'Life insurance'],
];
const RANGES = ['Under $100,000', '$100,000 - $499,999', '$500,000 - $999,999',
  '$1,000,000 - $4,999,999', '$5,000,000+'];
const STATE_NAMES = {
  CA: 'California', WA: 'Washington', DC: 'Washington D.C.', NC: 'North Carolina',
  GA: 'Georgia', FL: 'Florida', TX: 'Texas', AZ: 'Arizona', NY: 'New York', NJ: 'New Jersey',
};

/* ─────────── the donor returns their finished plan for tracking ─────────── */

function ReturnDocumentation({ caseId, onDone }) {
  const [f, setF] = useState({
    documentType: 'will', instrument: 'bequest', allocationAmount: '',
    allocationPercent: '', consultantFirm: '', notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api(`/cases/${caseId}/documentation`, { method: 'POST', body: f });
      onDone(r);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <form className="card card-feature" onSubmit={submit} style={{ marginTop: 26 }}>
      <div className="overline">Close the loop</div>
      <h3 className="h-sub" style={{ marginBottom: 8 }}>Tell us what you and your adviser decided</h3>
      <p className="small muted">
        Once your own consultant has drafted the plan, send us only the outcome — the instrument and the
        allocation. We never need the full document, and we never need your other beneficiaries.
      </p>
      <div className="grid g2" style={{ gap: 0, columnGap: 20 }}>
        <div className="field"><label htmlFor="dt">Document type</label>
          <select id="dt" value={f.documentType} onChange={set('documentType')}>
            <option value="will">Will</option><option value="trust">Trust</option>
            <option value="beneficiary_designation">Beneficiary designation</option>
            <option value="deed">Deed or property transfer</option>
            <option value="other">Other</option>
          </select></div>
        <div className="field"><label htmlFor="inst">Instrument</label>
          <select id="inst" value={f.instrument} onChange={set('instrument')}>
            <option value="bequest">Bequest</option>
            <option value="charitable_remainder_trust">Charitable remainder trust</option>
            <option value="retirement_beneficiary">Retirement beneficiary</option>
            <option value="life_insurance">Life insurance</option>
            <option value="real_estate">Real estate transfer</option>
          </select></div>
        <div className="field"><label htmlFor="aa">Allocation amount (if fixed)</label>
          <input id="aa" type="number" min="0" step="1000" value={f.allocationAmount}
            onChange={set('allocationAmount')} placeholder="e.g. 500000" /></div>
        <div className="field"><label htmlFor="ap">Allocation percentage (if a share)</label>
          <input id="ap" type="number" min="0" max="100" step="1" value={f.allocationPercent}
            onChange={set('allocationPercent')} placeholder="e.g. 15" /></div>
      </div>
      <div className="field"><label htmlFor="cf">Firm that advised you</label>
        <input id="cf" value={f.consultantFirm} onChange={set('consultantFirm')} /></div>
      <div className="field"><label htmlFor="nt">Anything we should know</label>
        <textarea id="nt" rows={3} value={f.notes} onChange={set('notes')} /></div>
      {err && <p className="err">{err}</p>}
      <button className="btn btn-gold" disabled={busy}>
        {busy ? <><span className="spinner" /> Recording</> : 'Send the outcome to the Foundation'}
      </button>
    </form>
  );
}

export default function Counsel() {
  const [f, setF] = useState({
    fullName: '', email: '', phone: '', state: 'CA', country: 'US',
    assetTypes: [], assetValueRange: RANGES[3], description: '',
    prefContact: 'email', bestTime: 'morning',
  });
  const [done, setDone] = useState(null);
  const [recorded, setRecorded] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [network, setNetwork] = useState(null);

  useEffect(() => { api('/consultants/coverage').then(setNetwork).catch(() => {}); }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (a) => setF({
    ...f, assetTypes: f.assetTypes.includes(a) ? f.assetTypes.filter((x) => x !== a) : [...f.assetTypes, a],
  });

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { setDone(await api('/cases', { method: 'POST', body: f })); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <section className="section">
        <div className="wrap narrow">
          <div className="overline">Case received</div>
          <h1 className="h-section" style={{ marginBottom: 20 }}>{done.message}</h1>
          <div className="card card-feature">
            <div className="between" style={{ marginBottom: 18 }}>
              <span className="overline" style={{ margin: 0 }}>Triage result</span>
              <span className={`badge b-${done.priority === 'critical' ? 'critical' : done.priority === 'high' ? 'high' : 'review'}`}>
                {done.priority} priority
              </span>
            </div>
            <p style={{ fontSize: 15.5 }}>{done.triage}</p>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              {[
                ['Reference', done.caseId.slice(0, 8).toUpperCase()],
                ['Response commitment', `within ${done.sla}`],
                ['Specialties matched', done.specialties.map(titleize).join(', ')],
                ['Assigned specialist', done.suggestedConsultant
                  ? `${done.suggestedConsultant.first_name} ${done.suggestedConsultant.last_name}, ${done.suggestedConsultant.firm_name}`
                  : 'Escalated to the Director of Planned Giving'],
              ].map(([l, v]) => (
                <div key={l} className="between" style={{ padding: '11px 0' }}>
                  <span className="small muted">{l}</span>
                  <span className="small" style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {recorded ? (
            <div className="card" style={{ marginTop: 26, borderLeft: '2px solid var(--success)' }}>
              <div className="overline">Recorded</div>
              <p style={{ marginBottom: 0 }}>{recorded.message}</p>
            </div>
          ) : (
            <ReturnDocumentation caseId={done.caseId} onDone={setRecorded} />
          )}

          <p className="tiny muted" style={{ marginTop: 22 }}>
            Nothing you have told us is a commitment of any kind. You may stop at any point, and we will not
            contact you again if you ask us not to.
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="section">
        <div className="wrap">
          <Head over="Complex assets" title="When the gift does not fit a form."
            lede="A vineyard held in a company. Farmland across two states. Pre-public shares. These are the largest gifts we receive, and they should not be the hardest ones to make." />
          <form onSubmit={submit} className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 40, alignItems: 'start' }}>
            <div className="card">
              <div className="grid g2" style={{ gap: 0, columnGap: 20 }}>
                <div className="field"><label htmlFor="n">Your name *</label>
                  <input id="n" required value={f.fullName} onChange={set('fullName')} /></div>
                <div className="field"><label htmlFor="e">Email *</label>
                  <input id="e" type="email" required value={f.email} onChange={set('email')} /></div>
                <div className="field"><label htmlFor="p">Phone</label>
                  <input id="p" value={f.phone} onChange={set('phone')} /></div>
                <div className="field"><label htmlFor="s">State of residence</label>
                  <select id="s" value={f.state} onChange={set('state')}>
                    {Object.entries(STATE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    <option value="OTHER">Somewhere else</option>
                  </select>
                  <div className="hint">
                    {network && f.state !== 'OTHER'
                      ? `${network.coverage.find((c) => c.state === f.state)?.firms || 0} firms in the panel are licensed here.`
                      : 'We will find you a licensed adviser wherever you are.'}
                  </div>
                </div>
              </div>

              <div className="field">
                <label>What do you hold? Select all that apply.</label>
                <div className="chip-row">
                  {ASSETS.map(([id, l]) => (
                    <button type="button" key={id} className={`chip chip-sm${f.assetTypes.includes(id) ? ' on' : ''}`}
                      onClick={() => toggle(id)}>{l}</button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor="v">Approximate value</label>
                <select id="v" value={f.assetValueRange} onChange={set('assetValueRange')}>
                  {RANGES.map((r) => <option key={r}>{r}</option>)}
                </select>
                <div className="hint">A rough band is enough. We are not asking you to value anything precisely.</div>
              </div>

              <div className="field">
                <label htmlFor="d">Anything you would like us to know</label>
                <textarea id="d" rows={5} value={f.description} onChange={set('description')}
                  placeholder="For example: the property is jointly held, or I would like to keep an income from it during my lifetime." />
              </div>

              <div className="grid g2" style={{ gap: 0, columnGap: 20 }}>
                <div className="field"><label htmlFor="pc">How should we reach you?</label>
                  <select id="pc" value={f.prefContact} onChange={set('prefContact')}>
                    <option value="email">Email</option><option value="phone">Telephone</option>
                    <option value="video">Video call</option>
                  </select></div>
                <div className="field"><label htmlFor="bt">Best time</label>
                  <select id="bt" value={f.bestTime} onChange={set('bestTime')}>
                    <option value="morning">Morning</option><option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                  </select></div>
              </div>

              {err && <p className="err">{err}</p>}
              <button className="btn btn-gold" disabled={busy || !f.fullName || !f.email}>
                {busy ? <><span className="spinner" /> Triaging your case</> : 'Send in confidence'}
              </button>
            </div>

            <aside>
              <div className="card card-feature">
                <div className="overline">How this works</div>
                {[
                  ['Within minutes', 'The platform triages your case by asset complexity and value, and matches you to the specialties it needs.'],
                  ['Within your stated SLA', 'A consultant licensed in your state contacts you — always within the time we quote on the confirmation screen.'],
                  ['You engage them directly', 'The consultant contracts with you and is paid by you. The Foundation never pays for advice given about a gift to itself — which is exactly why the advice can be trusted.'],
                  ['You tell us the outcome', 'When the plan is signed, you send us the instrument and the allocation. Nothing else. We track it in the endowment pipeline from there.'],
                ].map(([w, t], i) => (
                  <div key={w} style={{ padding: '16px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 14 }}>
                    <span className="serif-num" style={{ color: 'var(--saffron)', fontSize: 18, flex: 'none' }}>{i + 1}</span>
                    <div>
                      <div className="overline" style={{ marginBottom: 5 }}>{w}</div>
                      <p className="small muted" style={{ marginBottom: 0 }}>{t}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ marginTop: 20, display: 'flex', gap: 14 }}>
                <Icon.shield width={22} height={22} style={{ color: 'var(--teal)', flex: 'none' }} />
                <p className="small muted" style={{ marginBottom: 0 }}>
                  Held in confidence. Complex case records are visible only to the assigned officer, the
                  assigned consultant and legal counsel — and every access is written to the audit log.
                </p>
              </div>
            </aside>
          </form>
        </div>
      </section>

      {/* ─────────────── the consultant panel ─────────────── */}
      <section className="section section-warm">
        <div className="wrap">
          <Head center over="The adviser network"
            title="No single firm is licensed in every state. So we built a panel."
            lede="Estate law is state law. Rather than pretend one firm can cover the country, the Foundation maintains a panel of independent firms, and the platform routes each case to one licensed where the donor actually lives." />
          {!network ? <Loading /> : (
            <>
              <div className="grid g4" style={{ marginBottom: 30 }}>
                {[
                  ['Priority states covered', `${network.statesCovered} of ${network.totalStates}`],
                  ['Firms on the panel', num(network.consultants.length)],
                  ['Open case capacity', num(network.coverage.reduce((s, c) => s + c.capacity, 0))],
                  ['Cost to the Foundation', '$0'],
                ].map(([l, v]) => (
                  <div className="kpi" key={l}><div className="kpi-lab">{l}</div>
                    <div className="kpi-val num">{v}</div></div>
                ))}
              </div>

              <div className="card" style={{ marginBottom: 26 }}>
                <div className="overline">Coverage across the states where our donors live</div>
                <div className="table-scroll">
                  <table className="data" style={{ minWidth: 620 }}>
                    <thead><tr><th>State</th><th className="r">Firms licensed</th>
                      <th className="r">Capacity</th><th>Specialties available</th></tr></thead>
                    <tbody>
                      {network.coverage.map((c) => (
                        <tr key={c.state}>
                          <td style={{ fontWeight: 600 }}>{STATE_NAMES[c.state] || c.state}</td>
                          <td className="r">{c.firms}</td>
                          <td className="r">{c.capacity} open cases</td>
                          <td className="small muted">{c.specialties.map(titleize).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card" style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                <Icon.scales width={26} height={26} style={{ color: 'var(--earth)', flex: 'none', marginTop: 3 }} />
                <div>
                  <h3 className="h-sub" style={{ marginBottom: 8 }}>Why you pay the adviser, and not us</h3>
                  <p className="small muted" style={{ marginBottom: 0 }}>{network.model}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
