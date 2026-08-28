import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, compact, pct, num, Head, Icon, Donut, PALETTE } from '../lib.jsx';

const TABS = [
  ['legacy', 'Bequest'],
  ['ira', 'Retirement account'],
  ['stock', 'Appreciated stock'],
  ['insurance', 'Life insurance'],
  ['cga', 'Gift annuity'],
  ['crt', 'Remainder trust'],
];

function Result({ rows, note }) {
  return (
    <div className="card card-feature">
      {rows.map(([l, v, big]) => (
        <div key={l} className="between" style={{ padding: big ? '18px 0' : '13px 0', borderBottom: '1px solid var(--border)' }}>
          <span className={big ? '' : 'small muted'} style={big ? { fontWeight: 600 } : undefined}>{l}</span>
          <span className={big ? 'serif-num' : 'num'}
            style={big ? { fontSize: 30, color: 'var(--indigo)', fontWeight: 600 } : { fontWeight: 600 }}>{v}</span>
        </div>
      ))}
      {note && <p className="tiny muted" style={{ marginTop: 18, marginBottom: 0 }}>{note}</p>}
    </div>
  );
}

function PartnerCard({ p }) {
  if (!p) return null;
  return (
    <div className="card" style={{ marginTop: 22, borderLeft: '2px solid var(--saffron)' }}>
      <div className="overline">Partner handoff</div>
      <h3 className="h-sub" style={{ marginBottom: 8 }}>{p.name}</h3>
      <p className="small muted">{p.blurb}</p>
      <a href={p.url} target="_blank" rel="noopener noreferrer" className="btn btn-gold btn-sm">
        {p.action} <Icon.arrow width={14} height={14} />
      </a>
      {p.handoff && <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>{p.handoff}</p>}
    </div>
  );
}

/* ─────────────────────────── bequest / legacy ─────────────────────────── */

function Legacy() {
  const [f, setF] = useState({ giftType: 'will_bequest', faceValue: 250000, age: 66, gender: 'Female', health: 'Average' });
  const [r, setR] = useState(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      try { setR(await api('/calc/legacy', { method: 'POST', body: f })); } catch { /* keep prior */ }
    }, 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [JSON.stringify(f)]);

  return (
    <div className="grid g2" style={{ gap: 44, alignItems: 'start' }}>
      <div className="card">
        <div className="overline">Tell us about the gift</div>
        <div className="field">
          <label htmlFor="gt">What would you leave?</label>
          <select id="gt" value={f.giftType} onChange={(e) => setF({ ...f, giftType: e.target.value })}>
            <option value="will_bequest">A bequest in my will</option>
            <option value="ira_401k">A share of my retirement account</option>
            <option value="life_insurance">A life insurance policy</option>
            <option value="securities">Appreciated shares (given now)</option>
            <option value="real_estate">Property</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="fv">Value of the gift — {money(f.faceValue)}</label>
          <input id="fv" type="range" className="slider" min="10000" max="5000000" step="10000"
            value={f.faceValue} onChange={(e) => setF({ ...f, faceValue: +e.target.value })} />
          <input type="number" value={f.faceValue} min="1000" step="1000"
            onChange={(e) => setF({ ...f, faceValue: +e.target.value || 0 })} style={{ marginTop: 10 }} />
        </div>
        <div className="grid g2" style={{ gap: 0, columnGap: 20 }}>
          <div className="field">
            <label htmlFor="ag">Your age — {f.age}</label>
            <input id="ag" type="range" className="slider" min="30" max="95" value={f.age}
              onChange={(e) => setF({ ...f, age: +e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="gd">Mortality table</label>
            <select id="gd" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
              <option>Female</option><option>Male</option><option>Unspecified</option>
            </select>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="hl">General health</label>
          <select id="hl" value={f.health} onChange={(e) => setF({ ...f, health: e.target.value })}>
            <option>Excellent</option><option>Average</option><option>Below Average</option>
          </select>
          <div className="hint">Adjusts life expectancy by −10% / 0 / +15%, exactly as the pipeline engine does.</div>
        </div>
      </div>

      <div>
        {r && (
          <>
            <Result rows={[
              ['Present value to the Foundation', money(r.base.npv), true],
              ['Face value of the gift', money(f.faceValue)],
              ['Expected years to receipt', `${r.base.yearsToReceipt} years`],
              ['Your life expectancy at this age', `${r.lifeExpectancy} years`],
              ['Discount rate applied', pct(r.base.discountRate * 100, 2)],
              ['Probability of realisation', pct(r.base.realizationProbability * 100, 0)],
            ]} note={r.taxNote} />
            <div className="card" style={{ marginTop: 22 }}>
              <div className="overline">In perpetuity</div>
              <p style={{ fontSize: 15.5, marginBottom: 14 }}>{r.impact}</p>
              <div className="between" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <span className="small muted">Distributed every year, for ever, at the 4.5% spending policy</span>
                <span className="serif-num" style={{ fontSize: 26, color: 'var(--saffron)', fontWeight: 600 }}>
                  {money(r.perpetualAnnualDistribution)}
                </span>
              </div>
            </div>
            <div className="card" style={{ marginTop: 22 }}>
              <div className="overline">Three scenarios</div>
              {['optimistic', 'base', 'pessimistic'].map((k) => (
                <div key={k} className="between" style={{ padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="small" style={{ textTransform: 'capitalize' }}>{k}</span>
                  <span className="num small muted">{r[k].yearsToReceipt}y · {pct(r[k].discountRate * 100, 2)}</span>
                  <span className="num" style={{ fontWeight: 600 }}>{money(r[k].npv)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────────────── retirement account (401k / IRA) ────────────────── */

function IRA({ partners }) {
  const [f, setF] = useState({ accountValue: 600000, percentage: 25, age: 68, gender: 'Female' });
  const [r, setR] = useState(null);
  const [custodian, setCustodian] = useState('Fidelity');
  useEffect(() => {
    const t = setTimeout(async () => {
      try { setR(await api('/calc/ira', { method: 'POST', body: f })); } catch { /* keep prior */ }
    }, 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [JSON.stringify(f)]);

  return (
    <>
      <div className="grid g2" style={{ gap: 44, alignItems: 'start' }}>
        <div className="card">
          <div className="overline">Your retirement account</div>
          <p className="small muted">
            Retirement savings are the single most tax-efficient asset to leave to charity, because your heirs
            would pay income tax on every dollar and a charity pays none.
          </p>
          <div className="field">
            <label htmlFor="av">Total account value — {money(f.accountValue)}</label>
            <input id="av" type="range" className="slider" min="25000" max="5000000" step="25000"
              value={f.accountValue} onChange={(e) => setF({ ...f, accountValue: +e.target.value })} />
            <input type="number" value={f.accountValue} min="1000" step="1000" style={{ marginTop: 10 }}
              onChange={(e) => setF({ ...f, accountValue: +e.target.value || 0 })} />
          </div>
          <div className="field">
            <label htmlFor="pcnt">Percentage you would leave the Foundation — {f.percentage}%</label>
            <input id="pcnt" type="range" className="slider" min="1" max="100" step="1"
              value={f.percentage} onChange={(e) => setF({ ...f, percentage: +e.target.value })} />
            <div className="chip-row" style={{ marginTop: 12 }}>
              {[5, 10, 25, 50, 100].map((p) => (
                <button key={p} type="button" className={`chip chip-sm${f.percentage === p ? ' on' : ''}`}
                  onClick={() => setF({ ...f, percentage: p })}>{p}%</button>
              ))}
            </div>
          </div>
          <div className="grid g2" style={{ gap: 0, columnGap: 20, marginBottom: 0 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="ia">Your age — {f.age}</label>
              <input id="ia" type="range" className="slider" min="30" max="95"
                value={f.age} onChange={(e) => setF({ ...f, age: +e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="ig">Mortality table</label>
              <select id="ig" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
                <option>Female</option><option>Male</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          {r && (
            <>
              <div className="grid g2" style={{ gap: 18, marginBottom: 22 }}>
                <div className="compare-col">
                  <div className="overline" style={{ marginBottom: 10 }}>If left to your heirs</div>
                  <div className="compare-row"><span>Gross value at receipt</span><span className="num">{money(r.ifLeftToHeirs.grossValue)}</span></div>
                  <div className="compare-row"><span>Income tax they owe</span>
                    <span className="num" style={{ color: 'var(--error)' }}>−{money(r.ifLeftToHeirs.incomeTaxToHeirs)}</span></div>
                  <div className="compare-row" style={{ fontWeight: 600 }}>
                    <span>They actually keep</span><span className="num">{money(r.ifLeftToHeirs.heirsActuallyKeep)}</span></div>
                  <p className="tiny muted" style={{ marginTop: 10, marginBottom: 0 }}>
                    Assuming a {pct(r.ifLeftToHeirs.taxRateAssumed * 100, 0)} marginal rate.
                  </p>
                </div>
                <div className="compare-col win">
                  <div className="overline" style={{ marginBottom: 10 }}>If left to the Foundation</div>
                  <div className="compare-row"><span>Gross value at receipt</span><span className="num">{money(r.ifLeftToFoundation.grossValue)}</span></div>
                  <div className="compare-row"><span>Income tax owed</span>
                    <span className="num" style={{ color: 'var(--success)' }}>{money(0)}</span></div>
                  <div className="compare-row" style={{ fontWeight: 600 }}>
                    <span>The Foundation receives</span><span className="num">{money(r.ifLeftToFoundation.foundationReceives)}</span></div>
                  <p className="tiny muted" style={{ marginTop: 10, marginBottom: 0 }}>
                    A charity is tax-exempt, so nothing is lost to tax.
                  </p>
                </div>
              </div>

              <Result rows={[
                ['Tax that is never paid by anyone', money(r.taxAdvantage), true],
                ['Value pledged today', money(r.pledgedToday)],
                ['Projected account value at maturity', money(r.projectedAccountValue)],
                ['Projected gift value', money(r.projectedGiftValue)],
                ['Present value to the endowment', money(r.presentValueToFoundation)],
                ['Expected year of receipt', String(r.expectedReceiptYear)],
              ]} note={r.qcdEligible
                ? `At ${f.age} you are also eligible for a Qualified Charitable Distribution — up to $${num(r.qcdAnnualLimit)} a year direct from your IRA, which satisfies your required minimum distribution and is excluded from taxable income entirely.`
                : `From age 70½ you will also be able to make Qualified Charitable Distributions of up to $${num(r.qcdAnnualLimit)} a year straight from the account.`} />
            </>
          )}
        </div>
      </div>

      {r && (
        <div className="card" style={{ marginTop: 34 }}>
          <div className="overline">Step-by-step: naming the Foundation as a beneficiary</div>
          <p className="small muted" style={{ marginBottom: 18 }}>
            This takes about ten minutes and costs nothing. It does not require a lawyer, and it does not
            change your will. Choose where the account is held:
          </p>
          <div className="chip-row" style={{ marginBottom: 26 }}>
            {Object.keys(r.custodianSteps).map((c) => (
              <button key={c} className={`chip chip-sm${custodian === c ? ' on' : ''}`}
                onClick={() => setCustodian(c)}>{c}</button>
            ))}
          </div>
          <div className="grid g2" style={{ gap: 40, alignItems: 'start' }}>
            <ol className="steps">
              {(r.custodianSteps[custodian] || []).map((s) => <li key={s}>{s}</li>)}
            </ol>
            <div className="card" style={{ background: 'var(--lotus)' }}>
              <div className="overline">What to enter on the form</div>
              {[['Beneficiary type', 'Charity / organisation — not a person'],
                ['Legal name', 'Art of Living Foundation'],
                ['Tax ID (EIN)', '95-4386417'],
                ['Entity type', 'California nonprofit public benefit corporation, 501(c)(3)'],
                ['Percentage', `${f.percentage}%`]].map(([l, v]) => (
                <div key={l} style={{ padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="overline" style={{ marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 14.5, fontFamily: l === 'Tax ID (EIN)' ? 'var(--mono)' : undefined }}>{v}</div>
                </div>
              ))}
              <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>
                Beneficiary designations override your will. If your will and your beneficiary form disagree,
                the form wins — which is why this is worth ten minutes.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ───────────────────── appreciated securities / DonateStock ───────────── */

function Stock({ partners }) {
  const [f, setF] = useState({ marketValue: 100000, costBasis: 25000 });
  const [r, setR] = useState(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      try { setR(await api('/calc/stock', { method: 'POST', body: f })); } catch { /* keep prior */ }
    }, 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [JSON.stringify(f)]);

  return (
    <div className="grid g2" style={{ gap: 44, alignItems: 'start' }}>
      <div>
        <div className="card">
          <div className="overline">Your shares</div>
          <p className="small muted">
            Shares held longer than a year can be transferred straight to the Foundation. Nobody realises the
            gain, so nobody pays tax on it.
          </p>
          <div className="field">
            <label htmlFor="mv">Current market value — {money(f.marketValue)}</label>
            <input id="mv" type="range" className="slider" min="5000" max="2000000" step="5000"
              value={f.marketValue} onChange={(e) => setF({
                marketValue: +e.target.value, costBasis: Math.min(f.costBasis, +e.target.value),
              })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="cb">What you originally paid — {money(f.costBasis)}</label>
            <input id="cb" type="range" className="slider" min="0" max={f.marketValue} step="1000"
              value={Math.min(f.costBasis, f.marketValue)}
              onChange={(e) => setF({ ...f, costBasis: +e.target.value })} />
            <div className="hint">
              Unrealised gain: {money(Math.max(0, f.marketValue - f.costBasis))}
            </div>
          </div>
        </div>
        <PartnerCard p={partners?.find((p) => p.key === 'donatestock')} />
      </div>

      <div>
        {r && (
          <>
            <div className="card card-feature" style={{ marginBottom: 22 }}>
              <div className="overline">The point</div>
              <p style={{ fontSize: 16, marginBottom: 0 }}>{r.headline}</p>
            </div>

            <div className="overline">Same block of stock, two routes</div>
            <div className="grid g2" style={{ gap: 18, marginBottom: 26 }}>
              <div className="compare-col">
                <div className="overline" style={{ marginBottom: 10 }}>Sell, then donate the cash</div>
                <div className="compare-row"><span>Capital gains tax</span>
                  <span className="num" style={{ color: 'var(--error)' }}>−{money(r.sameShares.sellThenDonate.capitalGainsTax)}</span></div>
                <div className="compare-row"><span>Foundation receives</span>
                  <span className="num">{money(r.sameShares.sellThenDonate.charityReceives)}</span></div>
                <div className="compare-row"><span>Your deduction</span>
                  <span className="num">{money(r.sameShares.sellThenDonate.charitableDeduction)}</span></div>
                <div className="compare-row" style={{ fontWeight: 600 }}><span>Net cost to you</span>
                  <span className="num">{money(r.sameShares.sellThenDonate.netCostToYou)}</span></div>
              </div>
              <div className="compare-col win">
                <div className="overline" style={{ marginBottom: 10 }}>Transfer the shares</div>
                <div className="compare-row"><span>Capital gains tax</span>
                  <span className="num" style={{ color: 'var(--success)' }}>{money(0)}</span></div>
                <div className="compare-row"><span>Foundation receives</span>
                  <span className="num" style={{ fontWeight: 600 }}>{money(r.sameShares.donateShares.charityReceives)}</span></div>
                <div className="compare-row"><span>Your deduction</span>
                  <span className="num">{money(r.sameShares.donateShares.charitableDeduction)}</span></div>
                <div className="compare-row" style={{ fontWeight: 600 }}><span>Net cost to you</span>
                  <span className="num">{money(r.sameShares.donateShares.netCostToYou)}</span></div>
              </div>
            </div>
            <p className="small muted" style={{ marginTop: -12, marginBottom: 26 }}>
              Transferring delivers <strong>{money(r.sameShares.extraToCharity)} more</strong> to the Foundation
              — {pct(r.sameShares.extraToCharityPercent, 1)} more. It costs you more only because you gave more.
            </p>

            <div className="overline">Or: deliver the same {money(r.sameGift.giftToFoundation)} either way</div>
            <div className="card">
              <div className="compare-row"><span>Transfer the shares — stock you must part with</span>
                <span className="num" style={{ fontWeight: 600 }}>{money(r.sameGift.donateShares.stockYouMustLiquidate)}</span></div>
              <div className="compare-row"><span>Sell first — stock you must part with</span>
                <span className="num" style={{ fontWeight: 600, color: 'var(--error)' }}>{money(r.sameGift.sellThenDonate.stockYouMustLiquidate)}</span></div>
              <div className="compare-row"><span>The difference, which is exactly the capital-gains tax</span>
                <span className="num">{money(r.sameGift.extraStockRequired)}</span></div>
              <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>
                Assumes a {pct(r.capitalGainsRateAssumed * 100, 1)} long-term capital-gains rate including the
                net investment income tax, and a {pct(r.incomeTaxRateAssumed * 100, 0)} marginal income-tax
                rate. Shares must be held more than one year. Please check your own position with your adviser.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── life insurance ───────────────────────────── */

function Insurance({ partners }) {
  const [f, setF] = useState({ age: 52, faceValue: 250000, gender: 'Female', ownership: 'foundation' });
  const [r, setR] = useState(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      try { setR(await api('/calc/insurance', { method: 'POST', body: f })); } catch { /* keep prior */ }
    }, 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [JSON.stringify(f)]);

  return (
    <div className="grid g2" style={{ gap: 44, alignItems: 'start' }}>
      <div className="card">
        <div className="overline">A new charitable policy</div>
        <p className="small muted">
          Life insurance turns a modest monthly amount into a large future gift. You can also assign a policy
          you already hold and no longer need.
        </p>
        <div className="field">
          <label htmlFor="lfv">Death benefit — {money(f.faceValue)}</label>
          <input id="lfv" type="range" className="slider" min="25000" max="2000000" step="25000"
            value={f.faceValue} onChange={(e) => setF({ ...f, faceValue: +e.target.value })} />
        </div>
        <div className="grid g2" style={{ gap: 0, columnGap: 20 }}>
          <div className="field">
            <label htmlFor="la">Your age — {f.age}</label>
            <input id="la" type="range" className="slider" min="25" max="80"
              value={f.age} onChange={(e) => setF({ ...f, age: +e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="lg">Mortality table</label>
            <select id="lg" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
              <option>Female</option><option>Male</option>
            </select>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Who owns the policy?</label>
          <div className="chip-row">
            {[['foundation', 'The Foundation owns it'], ['donor', 'I keep ownership']].map(([id, l]) => (
              <button key={id} type="button" className={`chip chip-sm${f.ownership === id ? ' on' : ''}`}
                onClick={() => setF({ ...f, ownership: id })}>{l}</button>
            ))}
          </div>
          <div className="hint">
            Foundation ownership makes every premium a deductible gift. Keeping ownership means premiums are
            not deductible, but you may change the beneficiary at any time.
          </div>
        </div>
      </div>

      <div>
        {r && (
          <>
            <Result rows={[
              ['Your monthly premium', money(r.monthlyPremium, 2), true],
              ['Annual premium', money(r.annualPremium)],
              [r.premiumsDeductible ? 'Net annual cost after tax relief' : 'Annual cost (not deductible)', money(r.netAnnualCost)],
              ['Death benefit to the Foundation', money(r.faceValue)],
              ['Total premiums you would expect to pay', money(r.totalPremiumsExpected)],
              ['Every $1 of premium becomes', `$${r.leverage.toFixed(2)} of gift`],
              ['Present value to the endowment', money(r.presentValueToFoundation)],
            ]} note={r.note} />

            {r.carriers?.length > 0 && (
              <div className="card" style={{ marginTop: 22 }}>
                <div className="overline">Carriers that write new charitable policies at this level</div>
                <div className="chip-row">
                  {r.carriers.map((c) => (
                    <span key={c.name} className="chip chip-sm" style={{ cursor: 'default' }}>{c.name}</span>
                  ))}
                </div>
                <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>
                  The Foundation's planned-giving team introduces you to a licensed agent; the policy is
                  written directly between you and the carrier. Underwriting and medical requirements are set
                  by the carrier, not by us.
                </p>
                <Link to="/counsel" className="link-gold" style={{ display: 'inline-block', marginTop: 16 }}>
                  Ask for an introduction →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── gift annuity ─────────────────────────────── */

function CGA() {
  const [f, setF] = useState({ giftAmount: 100000, donorAge: 75, gender: 'Female', frequency: 'quarterly' });
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      try { setR(await api('/calc/cga', { method: 'POST', body: f })); setErr(null); }
      catch (e) { setErr(e.message); setR(null); }
    }, 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [JSON.stringify(f)]);

  return (
    <div className="grid g2" style={{ gap: 44, alignItems: 'start' }}>
      <div className="card">
        <div className="overline">Charitable gift annuity</div>
        <p className="small muted">
          You make an irrevocable gift; the Foundation contracts to pay you a fixed amount every year for the
          rest of your life. Rates follow the American Council on Gift Annuities schedule.
        </p>
        <div className="field">
          <label htmlFor="ga">Gift amount — {money(f.giftAmount)}</label>
          <input id="ga" type="range" className="slider" min="25000" max="1000000" step="5000"
            value={f.giftAmount} onChange={(e) => setF({ ...f, giftAmount: +e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="da">Your age — {f.donorAge}</label>
          <input id="da" type="range" className="slider" min="60" max="95"
            value={f.donorAge} onChange={(e) => setF({ ...f, donorAge: +e.target.value })} />
          <div className="hint">Rates rise with age, because the expected payment period is shorter.</div>
        </div>
        <div className="grid g2" style={{ gap: 0, columnGap: 20 }}>
          <div className="field"><label htmlFor="cf">Payment frequency</label>
            <select id="cf" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}>
              <option value="quarterly">Quarterly</option><option value="monthly">Monthly</option>
              <option value="semiannual">Twice a year</option><option value="annual">Once a year</option>
            </select></div>
          <div className="field"><label htmlFor="cg">Mortality table</label>
            <select id="cg" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
              <option>Female</option><option>Male</option>
            </select></div>
        </div>
      </div>
      <div>
        {err && <p className="err">{err}</p>}
        {r && (
          <>
            <Result rows={[
              ['Your annuity rate', pct(r.acgaRate * 100, 1), true],
              ['Paid to you each year, for life', money(r.annualPayment)],
              [`Each ${f.frequency === 'annual' ? 'year' : f.frequency === 'monthly' ? 'month' : f.frequency === 'quarterly' ? 'quarter' : 'half-year'}`, money(r.paymentPerPeriod)],
              ['Expected total paid to you', money(r.totalExpectedPayments)],
              ['Your immediate charitable deduction', money(r.charitableDeduction)],
              ['Estimated tax saving at 37%', money(r.estimatedTaxSavings)],
              ['Tax-free portion of each payment', money(r.taxFreePortion)],
              ['Actuarial reserve the Foundation must hold', money(r.actuarialReserve)],
            ]} note="Illustration only. Your contract rate is fixed on the day the gift completes. Please consult your own tax adviser." />
            <div className="card" style={{ marginTop: 22 }}>
              <Donut size={190} centerValue={pct(r.acgaRate * 100, 1)} centerLabel="ANNUITY RATE"
                slices={[
                  { label: 'Present value of payments to you', value: r.actuarialReserve, color: PALETTE[0] },
                  { label: 'Charitable deduction today', value: r.charitableDeduction, color: PALETTE[1] },
                ]} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────── remainder trust ───────────────────────────── */

function CRT() {
  const [f, setF] = useState({
    assetValue: 1000000, donorAge: 68, payoutRate: 0.05, crtType: 'CRUT',
    trustTerm: 'life', termYears: 15, gender: 'Female', costBasis: 300000,
  });
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      try { setR(await api('/calc/crt', { method: 'POST', body: f })); setErr(null); }
      catch (e) { setErr(e.message); setR(null); }
    }, 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [JSON.stringify(f)]);

  return (
    <div className="grid g2" style={{ gap: 44, alignItems: 'start' }}>
      <div className="card">
        <div className="overline">Charitable remainder trust</div>
        <p className="small muted">
          Transfer an appreciated asset into a trust. It sells the asset without immediate capital-gains tax,
          pays you an income, and gives the remainder to the Foundation.
        </p>
        <div className="field">
          <label htmlFor="av2">Asset value — {money(f.assetValue)}</label>
          <input id="av2" type="range" className="slider" min="100000" max="10000000" step="50000"
            value={f.assetValue} onChange={(e) => setF({
              ...f, assetValue: +e.target.value, costBasis: Math.min(f.costBasis, +e.target.value),
            })} />
        </div>
        <div className="field">
          <label htmlFor="cb2">Your original cost basis — {money(f.costBasis)}</label>
          <input id="cb2" type="range" className="slider" min="0" max={f.assetValue} step="10000"
            value={Math.min(f.costBasis, f.assetValue)} onChange={(e) => setF({ ...f, costBasis: +e.target.value })} />
        </div>
        <div className="grid g2" style={{ gap: 0, columnGap: 20 }}>
          <div className="field">
            <label htmlFor="ca">Your age — {f.donorAge}</label>
            <input id="ca" type="range" className="slider" min="45" max="90"
              value={f.donorAge} onChange={(e) => setF({ ...f, donorAge: +e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="pr">Payout rate — {pct(f.payoutRate * 100, 1)}</label>
            <input id="pr" type="range" className="slider" min="0.05" max="0.12" step="0.005"
              value={f.payoutRate} onChange={(e) => setF({ ...f, payoutRate: +e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>Trust type</label>
          <div className="chip-row">
            {[['CRUT', 'Unitrust — payout varies'], ['CRAT', 'Annuity trust — fixed payout']].map(([id, l]) => (
              <button key={id} type="button" className={`chip chip-sm${f.crtType === id ? ' on' : ''}`}
                onClick={() => setF({ ...f, crtType: id })}>{l}</button>
            ))}
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Term</label>
          <div className="chip-row">
            {[['life', 'For my lifetime'], ['term', 'Fixed term of years']].map(([id, l]) => (
              <button key={id} type="button" className={`chip chip-sm${f.trustTerm === id ? ' on' : ''}`}
                onClick={() => setF({ ...f, trustTerm: id })}>{l}</button>
            ))}
          </div>
          {f.trustTerm === 'term' && (
            <>
              <input type="range" className="slider" min="2" max="20" value={f.termYears}
                style={{ marginTop: 14 }} onChange={(e) => setF({ ...f, termYears: +e.target.value })} />
              <div className="hint">{f.termYears} years</div>
            </>
          )}
        </div>
      </div>
      <div>
        {err && <p className="err">{err}</p>}
        {r && (
          <>
            <Result rows={[
              ['Your charitable deduction today', money(r.charitableDeduction), true],
              ['Income paid to you each year', money(r.annualIncome)],
              ['Over the trust term', `${r.termYears} years`],
              ['Total income you expect to receive', money(r.totalProjectedIncome)],
              ['Capital gain deferred at transfer', r.capitalGainDeferred != null ? money(r.capitalGainDeferred) : '—'],
              ['Estimated tax saving at 37%', money(r.estimatedTaxSavings)],
              ['Projected remainder to the Foundation', money(r.projectedRemainderToFoundation)],
              ['IRS §7520 rate used', pct(r.afr7520 * 100, 2)],
            ]} note={r.passesFivePercentTest
              ? 'This structure satisfies the IRS 10% minimum remainder requirement.'
              : null} />
            {!r.passesFivePercentTest && (
              <p className="err" style={{ marginTop: 14 }}>
                A charitable remainder trust must leave at least 10% of the initial value to charity in
                present-value terms. Reduce the payout rate or shorten the term.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────── page ─────────────────────────────────── */

export default function Calculators() {
  const [tab, setTab] = useState('legacy');
  const [partners, setPartners] = useState(null);
  useEffect(() => { api('/partners').then(setPartners).catch(() => {}); }, []);

  return (
    <section className="section">
      <div className="wrap">
        <Head over="Gift calculators" title="Real numbers, computed on the server."
          lede="No brochure estimates. These run Social Security mortality tables, the current IRS §7520 rate and the ACGA annuity schedule — the same engine that values the Foundation's entire planned-gift pipeline." />
        <div className="chip-row" style={{ marginBottom: 34 }} data-tour="calc">
          {TABS.map(([id, l]) => (
            <button key={id} className={`chip${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>{l}</button>
          ))}
        </div>

        {tab === 'legacy' && <Legacy />}
        {tab === 'ira' && <IRA partners={partners} />}
        {tab === 'stock' && <Stock partners={partners} />}
        {tab === 'insurance' && <Insurance partners={partners} />}
        {tab === 'cga' && <CGA />}
        {tab === 'crt' && <CRT />}

        <div className="card" style={{ marginTop: 44, display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          <Icon.scales width={26} height={26} style={{ color: 'var(--earth)', flex: 'none', marginTop: 3 }} />
          <div>
            <h3 className="h-sub" style={{ marginBottom: 8 }}>These are illustrations, not advice.</h3>
            <p className="small muted" style={{ marginBottom: 10 }}>
              The Foundation cannot give you legal or tax advice, and nothing on this page is a substitute for
              your own adviser. If a gift like this interests you, we will happily talk it through with you and
              your solicitor together — at no cost, and with no expectation.
            </p>
            <Link to="/counsel" className="link-gold">Arrange a conversation →</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
