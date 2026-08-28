import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, useApi, money, Head, Icon, Loading, Tabs } from '../lib.jsx';

const AMOUNTS = [50, 108, 250, 500, 1000, 2500];
const METHODS = [
  { id: 'card', name: 'Card', note: 'Visa · Mastercard · Amex' },
  { id: 'ach', name: 'Bank transfer', note: 'ACH via Plaid' },
  { id: 'apple_pay', name: 'Apple Pay', note: 'One touch' },
  { id: 'google_pay', name: 'Google Pay', note: 'One touch' },
  { id: 'paypal', name: 'PayPal', note: 'Balance or card' },
  { id: 'venmo', name: 'Venmo', note: 'Mobile only' },
  { id: 'daf', name: 'Donor advised fund', note: 'DAF Direct' },
  { id: 'stock', name: 'Appreciated stock', note: 'Avoid capital gains' },
  { id: 'crypto', name: 'Cryptocurrency', note: '60+ assets' },
  { id: 'wire', name: 'Wire transfer', note: 'International' },
  { id: 'check', name: 'Cheque', note: 'By post' },
  { id: 'gofundme', name: 'GoFundMe Pro', note: 'Peer fundraising' },
];
const FREQ = [['one-time', 'One time'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['annually', 'Annually']];

export default function Give() {
  const [params] = useSearchParams();
  const { data: funds } = useApi('/funds');
  const [amount, setAmount] = useState(250);
  const [custom, setCustom] = useState('');
  const [fund, setFund] = useState(params.get('fund') || 'END-GEN');
  const [freq, setFreq] = useState('one-time');
  const [method, setMethod] = useState('card');
  const [tribute, setTribute] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', address: '', city: '',
    state: '', zip: '', country: 'US', tributeType: 'honor', tributeName: '',
  });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);

  const value = custom ? parseFloat(custom) || 0 : amount;
  const selectedFund = useMemo(() => funds?.find((f) => f.fund_code === fund), [funds, fund]);

  useEffect(() => {
    if (!value || !fund) { setPreview(null); return; }
    let live = true;
    const t = setTimeout(() => {
      api(`/give/impact-preview?amount=${value}&fund=${fund}`)
        .then((d) => live && setPreview(d.message)).catch(() => {});
    }, 260);
    return () => { live = false; clearTimeout(t); };
  }, [value, fund]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const res = await api('/give', {
        method: 'POST',
        body: {
          ...form, amount: value, fund, frequency: freq, method,
          tributeType: tribute ? form.tributeType : null,
          tributeName: tribute ? form.tributeName : null,
        },
      });
      setDone(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <section className="section">
        <div className="wrap narrow" style={{ textAlign: 'center' }}>
          <div style={{
            width: 78, height: 78, margin: '0 auto 28px', borderRadius: '50%',
            background: 'var(--saffron)', display: 'grid', placeItems: 'center', color: '#fff',
          }}><Icon.check width={38} height={38} strokeWidth={2} /></div>
          <div className="overline center">Received with gratitude</div>
          <h1 className="h-section" style={{ marginBottom: 20 }}>{done.message}</h1>
          <p className="lede">{done.impact}</p>
          <div className="card card-feature" style={{ textAlign: 'left', marginTop: 38 }}>
            {[
              ['Receipt number', done.receiptNumber],
              ['Amount', money(done.amount, 2)],
              ['Designated to', done.fund],
              ['Method', done.method.replace(/_/g, ' ')],
              ['Journal entry posted', done.journalEntryId.slice(0, 8).toUpperCase()],
              ['Foundation EIN', done.ein],
            ].map(([l, v]) => (
              <div key={l} className="between" style={{ padding: '13px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="small muted">{l}</span>
                <span className="num" style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
            <p className="tiny muted" style={{ marginTop: 18, marginBottom: 0 }}>
              Your gift was recorded and a balanced double-entry journal entry was posted to the general ledger
              in the same instant. A tax receipt is on its way to {form.email}.
            </p>
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 34 }}>
            <Link to="/impact" className="btn">See your impact dashboard</Link>
            <Link to="/planned-giving" className="btn btn-ghost">Consider a legacy gift</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="wrap">
        <Head over="Give now" title="Every gift is received the same way — with reverence."
          lede="Choose an amount, choose where it goes, and give however you already pay. Guest checkout is fine; you do not need an account." />

        {!funds ? <Loading /> : (
          <form onSubmit={submit}>
            <div className="split-wide">
              <div>
                <Tabs hashKey="give" sticky={false} tabs={[
                  { id: 'amount', label: '1 · Your gift', render: () => (<>
                {/* amount */}
                <div className="card" style={{ marginBottom: 26 }} data-tour="amount">
                  <div className="overline">Your gift</div>
                  <div className="chip-row" style={{ marginBottom: 16 }}>
                    {AMOUNTS.map((a) => (
                      <button type="button" key={a} className={`chip${!custom && amount === a ? ' on' : ''}`}
                        onClick={() => { setAmount(a); setCustom(''); }}>${a.toLocaleString()}</button>
                    ))}
                  </div>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label htmlFor="custom">Or enter your own amount (USD)</label>
                    <input id="custom" type="number" min="1" step="1" placeholder="Other amount"
                      value={custom} onChange={(e) => setCustom(e.target.value)} />
                  </div>
                  <div className="chip-row">
                    {FREQ.map(([id, l]) => (
                      <button type="button" key={id} className={`chip chip-sm${freq === id ? ' on' : ''}`}
                        onClick={() => setFreq(id)}>{l}</button>
                    ))}
                  </div>
                  {preview && (
                    <p style={{
                      marginTop: 20, marginBottom: 0, padding: '15px 18px', background: 'var(--lotus)',
                      borderLeft: '3px solid var(--teal)', fontSize: 14.5,
                    }}>{preview}</p>
                  )}
                </div>

                {/* designation */}
                <div className="card" style={{ marginBottom: 26 }}>
                  <div className="overline">Where it goes</div>
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label htmlFor="fund">Fund designation</label>
                    <select id="fund" value={fund} onChange={(e) => setFund(e.target.value)}>
                      {funds.map((f) => <option key={f.fund_code} value={f.fund_code}>{f.fund_name}</option>)}
                    </select>
                  </div>
                  {selectedFund && <p className="small muted" style={{ marginBottom: 0 }}>{selectedFund.blurb}</p>}
                </div>

                  </>) },
                  { id: 'method', label: '2 · How you give', render: () => (<>
                {/* method */}
                <div className="card" style={{ marginBottom: 26 }} data-tour="methods">
                  <div className="overline">How you would like to give</div>
                  <div className="method-grid">
                    {METHODS.map((m) => (
                      <button type="button" key={m.id} className={`method${method === m.id ? ' on' : ''}`}
                        onClick={() => setMethod(m.id)}>
                        <span className="method-name">{m.name}</span>
                        <span className="tiny" style={{ opacity: .72 }}>{m.note}</span>
                      </button>
                    ))}
                  </div>
                  <p className="tiny muted" style={{ marginTop: 18, marginBottom: 0, display: 'flex', gap: 8 }}>
                    <Icon.shield width={15} height={15} style={{ flex: 'none', color: 'var(--teal)' }} />
                    Card details are tokenised by the payment processor and never reach the Foundation's servers.
                    This platform holds no card number, expiry or security code — PCI DSS SAQ A.
                  </p>
                </div>

                  </>) },
                  { id: 'details', label: '3 · Your details', render: () => (<>
                {/* details */}
                <div className="card">
                  <div className="overline">Your details, for the tax receipt</div>
                  <div className="grid g2" style={{ gap: 0, columnGap: 20 }}>
                    <div className="field"><label htmlFor="fn">First name *</label>
                      <input id="fn" required value={form.firstName} onChange={set('firstName')} /></div>
                    <div className="field"><label htmlFor="ln">Last name *</label>
                      <input id="ln" required value={form.lastName} onChange={set('lastName')} /></div>
                  </div>
                  <div className="field"><label htmlFor="em">Email address *</label>
                    <input id="em" type="email" required value={form.email} onChange={set('email')} />
                    <div className="hint">Your receipt and, if you wish, a yearly note on what your giving accomplished.</div>
                  </div>
                  <div className="grid g2" style={{ gap: 0, columnGap: 20 }}>
                    <div className="field"><label htmlFor="ci">City</label>
                      <input id="ci" value={form.city} onChange={set('city')} /></div>
                    <div className="field"><label htmlFor="co">Country</label>
                      <select id="co" value={form.country} onChange={set('country')}>
                        {['US', 'IN', 'GB', 'DE', 'FR', 'CH', 'CA', 'AU', 'NL', 'SE', 'NO', 'IT', 'ES', 'SG', 'AE', 'BR', 'MX', 'JP', 'ZA', 'KE']
                          .map((x) => <option key={x} value={x}>{x}</option>)}
                      </select></div>
                  </div>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
                    <input type="checkbox" checked={tribute} onChange={(e) => setTribute(e.target.checked)}
                      style={{ width: 'auto' }} />
                    Give in honour or memory of someone
                  </label>
                  {tribute && (
                    <div className="grid g2" style={{ gap: 0, columnGap: 20, marginTop: 16 }}>
                      <div className="field"><label htmlFor="tt">Tribute type</label>
                        <select id="tt" value={form.tributeType} onChange={set('tributeType')}>
                          <option value="honor">In honour of</option>
                          <option value="memory">In memory of</option>
                        </select></div>
                      <div className="field"><label htmlFor="tn">Their name</label>
                        <input id="tn" value={form.tributeName} onChange={set('tributeName')} /></div>
                    </div>
                  )}
                </div>
                  </>) },
                ]} />
              </div>

              {/* summary rail */}
              <aside style={{ position: 'sticky', top: 100 }}>
                <div className="card card-feature">
                  <div className="overline">Your gift</div>
                  <div className="serif-num" style={{ fontSize: 46, color: 'var(--indigo)', fontWeight: 600, lineHeight: 1 }}>
                    {money(value)}
                  </div>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    {freq === 'one-time' ? 'One-time gift' : `${freq.charAt(0).toUpperCase() + freq.slice(1)} — ${money(value * (freq === 'monthly' ? 12 : freq === 'quarterly' ? 4 : 1))} a year`}
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0', paddingTop: 20 }}>
                    {[
                      ['Designation', selectedFund?.fund_name || '—'],
                      ['Method', METHODS.find((m) => m.id === method)?.name],
                      ['Tax deductible', 'Yes — 501(c)(3)'],
                    ].map(([l, v]) => (
                      <div key={l} className="between" style={{ marginBottom: 11 }}>
                        <span className="small muted">{l}</span>
                        <span className="small" style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  {err && <p className="err">{err}</p>}
                  <button type="submit" className="btn btn-gold" style={{ width: '100%' }} disabled={busy || value < 1}>
                    {busy ? <><span className="spinner" /> Processing</> : <>Complete my gift</>}
                  </button>
                  <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>
                    No account required. You can cancel a recurring gift at any time, in one click, with no conversation.
                  </p>
                </div>

                <div className="card" style={{ marginTop: 20, borderLeft: '2px solid var(--saffron)' }}>
                  <div className="overline">Prefer to fundraise, not just give?</div>
                  <p className="small muted">
                    The Foundation holds a membership with GoFundMe.org. Start your own campaign for the
                    endowment — a birthday, a memorial, a milestone — and every gift is reconciled straight
                    into this ledger.
                  </p>
                  <a href="https://www.gofundme.org" target="_blank" rel="noopener noreferrer"
                    className="btn btn-sm btn-ghost">
                    Give or fundraise on GoFundMe.org <Icon.arrow width={14} height={14} />
                  </a>
                </div>

                <div className="card" style={{ marginTop: 20 }}>
                  <div className="overline">Considering something larger?</div>
                  <p className="small muted">
                    A gift of appreciated stock, a bequest, or a retirement account beneficiary designation
                    often costs you far less than the same gift in cash — sometimes nothing at all today.
                  </p>
                  <Link to="/calculators" className="link-gold">Run the numbers →</Link>
                </div>
              </aside>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
