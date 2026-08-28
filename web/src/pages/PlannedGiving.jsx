import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Head, Icon, useReveal } from '../lib.jsx';

const VEHICLES = [
  {
    key: 'will', name: 'A gift in your will', tag: 'Costs nothing today',
    line: 'The simplest and most common legacy gift. One sentence in your will names the Foundation for a fixed sum or a share of what remains.',
    good: 'You want to leave something meaningful but need every rupee and dollar while you are living.',
    how: ['Decide on an amount or a percentage of your estate', 'Give your solicitor the Foundation\'s legal name and EIN', 'Tell us, so we can thank you and plan responsibly', 'Change your mind any time — a will is always revocable'],
    benefit: 'Your taxable estate is reduced by the full value of the gift. You keep complete control while you live.',
  },
  {
    key: 'ira', name: 'Retirement account beneficiary', tag: 'The most tax-efficient gift there is',
    line: 'Name the Foundation as a beneficiary of your IRA, 401(k) or pension. It takes one form and about ten minutes.',
    good: 'You have retirement savings and heirs. Left to your children, this money is taxed as their income; left to charity, it passes entirely untaxed.',
    how: ['Request a beneficiary change form from your custodian', 'Name the Foundation for a percentage — 10%, 50%, whatever fits', 'Return the form; no lawyer and no cost', 'Your other assets pass to your family as planned'],
    benefit: 'Heirs can lose 30–40% of an inherited retirement account to income tax. A charity loses nothing.',
  },
  {
    key: 'insurance', name: 'Life insurance', tag: 'Turn an old policy into a legacy',
    line: 'Assign a policy you no longer need, or name the Foundation as a beneficiary for part of the death benefit.',
    good: 'The children you insured yourself for are grown, and the policy is quietly still running.',
    how: ['Find a policy whose original purpose has passed', 'Name the Foundation as full or partial beneficiary', 'Or transfer ownership outright for an immediate deduction', 'Continued premiums are themselves deductible'],
    benefit: 'A modest premium becomes a large gift. Transferring ownership gives you a deduction now.',
  },
  {
    key: 'stock', name: 'Appreciated securities', tag: 'Roughly 20% more impact, same cost',
    line: 'Give shares, bonds or funds held for more than a year, instead of the cash you were going to give.',
    good: 'You hold stock that has grown, and selling it would trigger capital-gains tax.',
    how: ['Choose your most appreciated long-held position', 'Transfer the shares directly — do not sell first', 'Deduct the full market value', 'The capital gain is never realised by anyone'],
    benefit: 'You avoid capital-gains tax entirely and still deduct the full market value.',
  },
  {
    key: 'crt', name: 'Charitable remainder trust', tag: 'Income for life, then a legacy',
    line: 'Transfer an appreciated asset into a trust. It sells the asset tax-free, pays you an income for life, and gives what remains to the Foundation.',
    good: 'You hold a highly appreciated asset — property, a business stake, concentrated stock — and want income without a tax bill.',
    how: ['Transfer the asset into the trust', 'The trust sells it with no immediate capital-gains tax', 'You receive a payout each year for life or a fixed term', 'The remainder passes to the Foundation'],
    benefit: 'Immediate partial deduction, capital-gains deferral, and a lifetime income stream.',
  },
  {
    key: 'cga', name: 'Charitable gift annuity', tag: 'A fixed cheque for the rest of your life',
    line: 'Make an irrevocable gift and the Foundation contracts to pay you a fixed amount every year, for as long as you live.',
    good: 'You want simplicity and certainty rather than a trust, and you are 60 or older.',
    how: ['Make a gift of $25,000 or more', 'Your rate is set by your age at the American Council on Gift Annuities schedule', 'Payments are fixed and never fall with the market', 'What remains at the end funds the endowment'],
    benefit: 'Rates rise with age — at 80 the schedule pays around 8.1% for life. Part of each payment is tax-free.',
  },
  {
    key: 'complex', name: 'Property, business and complex assets', tag: 'We will do the hard work',
    line: 'Real estate, farmland, private company shares, art, royalties, digital assets. These gifts are large, and they need a specialist.',
    good: 'Your wealth is not sitting in a brokerage account.',
    how: ['Tell us what you hold, in confidence', 'The platform triages the case within minutes', 'You are matched to a specialist licensed in your state', 'Someone calls you within the stated time — always'],
    benefit: 'Complex gifts are often the largest gifts. They should not be the hardest ones to make.',
  },
];

export default function PlannedGiving() {
  const [open, setOpen] = useState('will');
  const [partners, setPartners] = useState(null);
  useEffect(() => { api('/partners').then(setPartners).catch(() => {}); }, []);
  useReveal(partners);
  return (
    <>
      <section className="section-tight" style={{ background: 'var(--lotus)', borderBottom: '1px solid var(--border)', paddingTop: 92, paddingBottom: 82 }}>
        <div className="wrap narrow" style={{ textAlign: 'center' }}>
          <div className="overline center" style={{ justifyContent: 'center' }}>Legacy & planned giving</div>
          <h1 className="display" style={{ fontSize: 'clamp(2.3rem,5vw,4rem)', marginBottom: 24, color: 'var(--indigo)' }}>
            The gift you give from<br />the end of your life.
          </h1>
          <p className="lede">
            A legacy gift is not written from your savings. It is written from your intentions. Most cost you
            nothing at all while you are living — and they are, without exception, the largest gifts the
            Foundation ever receives.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <Head center over="Seven ways" title="Find the one that fits your life"
            lede="Not every gift suits every person. Read the one that sounds like you — and ignore the rest." />
          <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr)', gap: 0 }}>
            {VEHICLES.map((v, i) => {
              const isOpen = open === v.key;
              return (
                <article key={v.key} className="reveal"
                  style={{ borderTop: i === 0 ? '1px solid var(--border)' : 0, borderBottom: '1px solid var(--border)' }}>
                  <button onClick={() => setOpen(isOpen ? null : v.key)}
                    aria-expanded={isOpen}
                    style={{
                      width: '100%', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left',
                      padding: '30px 0', display: 'flex', gap: 24, alignItems: 'baseline',
                    }}>
                    <span className="serif-num" style={{ fontSize: 22, color: 'var(--saffron)', flex: 'none', width: 34 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ flex: 1 }}>
                      <span className="h-sub" style={{ display: 'block', marginBottom: 5 }}>{v.name}</span>
                      <span className="small" style={{ color: 'var(--earth)', fontWeight: 600 }}>{v.tag}</span>
                    </span>
                    <span style={{ flex: 'none', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .3s', color: 'var(--indigo)' }}>
                      <Icon.arrow width={20} height={20} />
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ paddingBottom: 40, paddingLeft: 58 }}>
                      <p className="lede" style={{ maxWidth: '58ch' }}>{v.line}</p>
                      <div className="grid g3" style={{ marginTop: 26, gap: 30 }}>
                        <div>
                          <div className="overline">Right for you if</div>
                          <p className="small">{v.good}</p>
                        </div>
                        <div>
                          <div className="overline">How it works</div>
                          <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13.5, lineHeight: 1.75 }}>
                            {v.how.map((h) => <li key={h} style={{ marginBottom: 6 }}>{h}</li>)}
                          </ol>
                        </div>
                        <div>
                          <div className="overline">The benefit</div>
                          <p className="small">{v.benefit}</p>
                          <Link to={v.key === 'complex' ? '/counsel' : '/calculators'} className="link-gold">
                            {v.key === 'complex' ? 'Speak to a specialist →' : 'Calculate my gift →'}
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────────── partner handoffs ─────────────── */}
      <section className="section section-warm">
        <div className="wrap">
          <Head center over="Doing it is the easy part"
            title="We hand you to the best tool for the job"
            lede="The Foundation does not try to be a law firm or a brokerage. For each vehicle we hand you to a partner that does it properly — and the record comes back to us automatically." />
          <div className="grid g3">
            {(partners || []).filter((p) => ['freewill', 'donatestock', 'gofundme'].includes(p.key)).map((p) => (
              <article key={p.key} className="card card-lift reveal" style={{ borderTop: '2px solid var(--saffron)' }}>
                <div className="overline">{p.role}</div>
                <h3 className="h-sub" style={{ marginBottom: 12 }}>{p.name}</h3>
                <p className="small muted" style={{ minHeight: 96 }}>{p.blurb}</p>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-gold">
                  {p.action} <Icon.arrow width={14} height={14} />
                </a>
                {p.handoff && (
                  <p className="tiny muted" style={{ marginTop: 16, marginBottom: 0 }}>{p.handoff}</p>
                )}
              </article>
            ))}
          </div>
          <div className="card reveal" style={{ marginTop: 30, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <Icon.doc width={22} height={22} style={{ color: 'var(--earth)', flex: 'none', marginTop: 2 }} />
            <p className="small muted" style={{ marginBottom: 0 }}>
              Already have a will or trust? You do not need to rewrite it. Upload it to the{' '}
              <Link to="/vault" className="link-gold" style={{ textTransform: 'none', fontSize: 13.5 }}>document vault</Link>{' '}
              and the AI parsing engine will read it, confirm the Foundation is named correctly, and extract
              the allocation — so nothing depends on anyone re-typing it.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="grid g2" style={{ gap: 60, alignItems: 'center' }}>
            <div className="reveal">
              <div className="overline">The Sankalpa Legacy Circle</div>
              <h2 className="h-section">Tell us, and we can plan.</h2>
              <p className="lede" style={{ marginTop: 20 }}>
                A legacy gift you have told us about is worth far more than a secret one — not in money,
                but in certainty. It lets the Foundation commit to a school, a programme, a decade.
              </p>
              <p className="muted">
                Everyone who documents a legacy intention joins the Legacy Circle. There is no minimum.
                There is no obligation — a revocable gift stays revocable, always. What you receive is an
                annual account of exactly what your intention is already making possible, and an open door
                at every centre in the world.
              </p>
              <div className="row" style={{ marginTop: 28 }}>
                <Link to="/vault" className="btn">Document my intention</Link>
                <Link to="/counsel" className="btn btn-ghost">Talk to someone first</Link>
              </div>
            </div>
            <div className="card card-feature reveal" style={{ padding: 40 }}>
              <div className="overline">What we will need, eventually</div>
              {[
                ['Legal name', 'Art of Living Foundation'],
                ['Tax status', '501(c)(3) public charity'],
                ['EIN', '95-4386417'],
                ['Suggested wording', '"I give ___ percent of my residuary estate to the Art of Living Foundation, a California nonprofit corporation, for its general endowment purposes."'],
              ].map(([l, v]) => (
                <div key={l} style={{ padding: '15px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="overline" style={{ marginBottom: 6 }}>{l}</div>
                  <div style={{ fontSize: 14.5, fontFamily: l === 'Suggested wording' ? 'var(--serif)' : undefined, fontStyle: l === 'Suggested wording' ? 'italic' : undefined }}>{v}</div>
                </div>
              ))}
              <p className="tiny muted" style={{ marginTop: 18, marginBottom: 0 }}>
                Sample wording only. Please have your own solicitor or attorney review any bequest language
                before you sign it.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
