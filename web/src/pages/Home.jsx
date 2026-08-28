import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api, useApi, money, compact, num, pct, Head, Icon, Modal, useReveal, useCountUp, BarList, PALETTE,
} from '../lib.jsx';

const HERO_VIDEO = 'k493mHHWTfw';
const WISDOM = [
  { id: 'k493mHHWTfw', title: 'A life dedicated to a violence-free world', note: 'An introduction to Gurudev' },
  { id: 'drpE8NlTivY', title: 'In conversation with Dr. Vivek Murthy', note: 'On loneliness and belonging' },
  { id: 'hu41ybUC0PE', title: 'With Harvard\'s Robert Waldinger', note: 'What makes a good life' },
  { id: 'roaD-qgPuCM', title: 'The Aubrey Marcus Podcast', note: 'Breath, mind and modern life' },
];

/* Approximate coordinates for the globe visualisation. */
const COORD = {
  US: [-98, 39], IN: [79, 22], DE: [10, 51], GB: [-2, 54], CA: [-106, 56], FR: [2, 47],
  CH: [8, 47], AU: [134, -25], NL: [5, 52], SE: [18, 60], SG: [104, 1], BR: [-51, -14],
  AE: [54, 24], IT: [12, 42], ES: [-4, 40], JP: [138, 36], ZA: [24, -29], MX: [-102, 23],
  KE: [38, 0], NO: [8, 61],
};

function Globe({ countries }) {
  const R = 148, cx = 170, cy = 170;
  const project = ([lon, lat]) => {
    const p = (lat * Math.PI) / 180, l = (lon * Math.PI) / 180;
    return { x: cx + R * Math.cos(p) * Math.sin(l), y: cy - R * Math.sin(p), z: Math.cos(p) * Math.cos(l) };
  };
  const max = Math.max(...countries.map((c) => c.raised)) || 1;
  return (
    <svg viewBox="0 0 340 340" width="100%" style={{ maxWidth: 340 }} role="img" aria-label="Global donor reach">
      <circle cx={cx} cy={cy} r={R} fill="rgba(212,134,11,.05)" stroke="var(--border-strong)" strokeWidth="1" />
      {[-60, -30, 0, 30, 60].map((lat) => {
        const p = (lat * Math.PI) / 180;
        return <ellipse key={lat} cx={cx} cy={cy - R * Math.sin(p)} rx={R * Math.cos(p)} ry={R * Math.cos(p) * 0.22}
          fill="none" stroke="var(--border)" strokeWidth="0.8" />;
      })}
      {[0, 30, 60, 90, 120, 150].map((lon) => (
        <ellipse key={lon} cx={cx} cy={cy} rx={Math.abs(R * Math.sin((lon * Math.PI) / 180))} ry={R}
          fill="none" stroke="var(--border)" strokeWidth="0.8" />
      ))}
      {countries.filter((c) => COORD[c.country]).map((c) => {
        const p = project(COORD[c.country]);
        const r = 3 + (c.raised / max) * 9;
        return (
          <g key={c.country} opacity={p.z > -0.15 ? 1 : 0.22}>
            <circle cx={p.x} cy={p.y} r={r + 5} fill="var(--saffron)" opacity=".16" />
            <circle cx={p.x} cy={p.y} r={r} fill="var(--saffron)" />
            <title>{c.country}: {compact(c.raised)} from {c.donors} supporters</title>
          </g>
        );
      })}
    </svg>
  );
}

function Meter({ c }) {
  const [v, ref] = useCountUp(c ? c.cashRaised + c.pipelineNpv : 0, 2100);
  const p = c ? Math.min(100, ((c.cashRaised + c.pipelineNpv) / c.goal) * 100) : 0;
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(p), 420); return () => clearTimeout(t); }, [p]);
  return (
    <div className="hero-meter" ref={ref} data-tour="meter">
      <div className="meter-head">
        <span className="meter-val num">{compact(v)}</span>
        <span className="meter-goal">of $45M endowment goal</span>
      </div>
      <div className="meter-track" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
        <div className="meter-fill" style={{ width: `${w}%` }} />
      </div>
      <div className="meter-legend">
        <span>{pct(p)} secured</span>
        <span>{c ? num(c.donorCount) : '—'} supporters</span>
        <span>{c ? c.countries : '—'} countries</span>
        <span>{c ? num(c.plannedGiftCount) : '—'} legacy commitments</span>
      </div>
    </div>
  );
}

export default function Home() {
  const { data: c } = useApi('/campaign');
  const { data: quotes } = useApi('/quotes');
  const { data: impact } = useApi('/impact/global');
  const [qi, setQi] = useState(0);
  const [video, setVideo] = useState(null);
  const [heroOn, setHeroOn] = useState(true);
  useReveal(c);

  useEffect(() => {
    if (!quotes?.length) return;
    const t = setInterval(() => setQi((i) => (i + 1) % quotes.length), 6400);
    return () => clearInterval(t);
  }, [quotes]);

  const q = quotes?.[qi];
  const funds = impact?.byFund || [];
  const countries = useMemo(
    () => (impact?.byCountry || []).filter((x) => x.raised > 0), [impact]);

  return (
    <>
      {/* ─────────────────────────── hero ─────────────────────────── */}
      <header className="hero">
        <div className="hero-video">
          {heroOn && (
            <iframe
              title="Gurudev Sri Sri Ravi Shankar"
              src={`https://www.youtube.com/embed/${HERO_VIDEO}?autoplay=1&mute=1&controls=0&loop=1&playlist=${HERO_VIDEO}&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1`}
              allow="autoplay; encrypted-media" tabIndex={-1} />
          )}
        </div>
        <div className="hero-scrim" />
        <div className="wrap hero-body">
          <div className="hero-eyebrow">Sri Sri Gurudev Ravishankar Foundation</div>
          <h1 className="display">Your legacy.<br />His mission.<br />Our world.</h1>
          {q && (
            <blockquote className="hero-quote fade-q" key={q.id}>
              “{q.text}”
              <cite>{q.attribution}</cite>
            </blockquote>
          )}
          <div className="hero-actions">
            <Link to="/give" className="btn btn-gold">Give now <Icon.arrow width={16} height={16} /></Link>
            <Link to="/planned-giving" className="btn btn-ghost">Explore legacy giving</Link>
          </div>
          <Meter c={c} />
        </div>
        <button className="video-toggle" onClick={() => setHeroOn(!heroOn)}>
          {heroOn ? 'Pause background film' : 'Play background film'}
        </button>
      </header>

      {/* ───────────────────────── statistics ─────────────────────── */}
      <section className="section-tight">
        <div className="wrap">
          <div className="stat-band">
            {[
              ['45', 'Years of service'],
              ['180+', 'Countries reached'],
              ['10,000', 'Centres worldwide'],
              ['800M', 'Lives touched'],
            ].map(([v, l]) => (
              <div className="stat reveal" key={l}>
                <div className="stat-val num">{v}</div>
                <div className="stat-lab">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────── why an endowment ─────────────────── */}
      <section className="section section-warm">
        <div className="wrap">
          <div className="grid g2" style={{ gap: 68, alignItems: 'center' }}>
            <div className="reveal">
              <div className="overline">Why an endowment</div>
              <h2 className="h-section">A gift that is given once, and keeps giving for ever.</h2>
              <p className="lede" style={{ marginTop: 22 }}>
                Ordinary giving funds a year. An endowment funds a century. The principal is never spent —
                only the investment return is drawn, at a disciplined 4.5% a year, so a gift made today is
                still teaching a child to breathe in 2126.
              </p>
              <p className="muted">
                That is why this campaign exists. Forty-five million dollars, raised once, ends the annual
                anxiety of fundraising and lets programme teams plan in decades rather than quarters.
                It is the difference between a charity that survives and a mission that endures.
              </p>
              <Link to="/planned-giving" className="link-gold">See the seven ways to give →</Link>
            </div>
            <div className="reveal">
              <div className="card card-feature" style={{ padding: 40 }}>
                <div className="overline">What $100,000 becomes</div>
                {[
                  ['Given once, today', '$100,000', 'var(--indigo)'],
                  ['Distributed each year, for ever', '$4,500', 'var(--saffron)'],
                  ['Given away over 100 years', '$450,000', 'var(--teal)'],
                  ['And the principal still stands', '$100,000', 'var(--earth)'],
                ].map(([l, v, col]) => (
                  <div key={l} className="between" style={{ padding: '17px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className="small">{l}</span>
                    <span className="serif-num" style={{ fontSize: 25, color: col, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
                <p className="tiny muted" style={{ marginTop: 20, marginBottom: 0 }}>
                  Illustrative, using the Foundation's 4.5% spending policy. Investment returns are not guaranteed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────────── the funds ─────────────────────── */}
      <section className="section" data-tour="funds">
        <div className="wrap">
          <Head center over="Where your gift lives"
            title="Five causes, one intention"
            lede="Give to the permanent endowment, or direct your gift to the work that moves you. Every restricted gift is tracked in its own net asset class — money given for children can never be spent on anything else." />
          <div className="grid g3">
            {funds.map((f, i) => (
              <article key={f.fund_code} className="card card-lift reveal"
                style={{ borderTop: `3px solid ${PALETTE[i % PALETTE.length]}` }}>
                <div className="overline" style={{ marginBottom: 10 }}>{f.fund_code}</div>
                <h3 className="h-sub" style={{ marginBottom: 12 }}>{f.fund_name}</h3>
                <p className="small muted" style={{ minHeight: 78 }}>{f.blurb}</p>
                <div className="between" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <div>
                    <div className="serif-num" style={{ fontSize: 24, color: 'var(--indigo)', fontWeight: 600 }}>
                      {compact(f.raised)}
                    </div>
                    <div className="tiny muted">of {compact(f.target_amount)} target</div>
                  </div>
                  <Link to={`/give?fund=${f.fund_code}`} className="link-gold">Give →</Link>
                </div>
                <div style={{ height: 4, background: 'var(--border)', marginTop: 14 }}>
                  <div style={{
                    height: '100%', width: `${Math.min(100, (f.raised / f.target_amount) * 100)}%`,
                    background: PALETTE[i % PALETTE.length],
                  }} />
                </div>
                {f.impact_line && (
                  <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>{f.impact_line}</p>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────────────── global reach ──────────────────────── */}
      <section className="section section-indigo">
        <div className="wrap">
          <div className="grid g2" style={{ gap: 68, alignItems: 'center' }}>
            <div className="reveal">
              <div className="overline">Global spread · one world family</div>
              <h2 className="h-section">Peace does not belong to one country.</h2>
              <p className="lede" style={{ marginTop: 20 }}>
                Supporters give in dollars, euros, rupees, francs and rand — from Pasadena to Bengaluru,
                Stockholm to Nairobi, São Paulo to Singapore. Every gift, in every currency, funds the same
                simple proposition: a mind at peace makes a world at peace.
              </p>
              <div style={{ marginTop: 32 }}>
                {countries.slice(0, 6).map((x) => (
                  <div key={x.country} className="between"
                    style={{ padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 14 }}>{x.country}</span>
                    <span className="num small" style={{ color: 'var(--earth)' }}>
                      {compact(x.raised)} · {x.donors} supporters
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="reveal" style={{ display: 'grid', placeItems: 'center' }}>
              <Globe countries={countries} />
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────── wisdom films ────────────────────── */}
      <section className="section">
        <div className="wrap">
          <Head over="In his own words" title="Gurudev, unedited"
            lede="Four decades of teaching, offered freely. Watch, then decide what your legacy should say." />
          <div className="grid g4">
            {WISDOM.map((v) => (
              <button key={v.id} className="card card-lift reveal"
                onClick={() => setVideo(v)}
                style={{ textAlign: 'left', cursor: 'pointer', padding: 0, border: '1px solid var(--border)', background: '#fff' }}>
                <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden', background: 'var(--indigo)' }}>
                  <img src={`https://img.youtube.com/vi/${v.id}/hqdefault.jpg`} alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: .88 }} loading="lazy" />
                  <span style={{
                    position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                  }}>
                    <span style={{
                      width: 52, height: 52, borderRadius: '50%', background: 'rgba(212,134,11,.94)',
                      display: 'grid', placeItems: 'center', color: '#fff', paddingLeft: 4,
                    }}><Icon.play width={20} height={20} /></span>
                  </span>
                </div>
                <div style={{ padding: '18px 20px 22px' }}>
                  <div className="overline" style={{ marginBottom: 8 }}>{v.note}</div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 19, color: 'var(--indigo)', lineHeight: 1.25 }}>
                    {v.title}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────── giving momentum ────────────────────── */}
      {impact && (
        <section className="section section-warm">
          <div className="wrap">
            <Head over="Transparency" title="The campaign, in the open"
              lede="These figures come straight from the platform's general ledger — the same numbers the finance team and the auditors see." />
            <div className="grid g2" style={{ gap: 52 }}>
              <div className="card reveal">
                <div className="overline">Raised by fund</div>
                <BarList items={funds.map((f, i) => ({
                  label: f.fund_name, value: f.raised, color: PALETTE[i % PALETTE.length],
                }))} />
              </div>
              <div className="card reveal">
                <div className="overline">How supporters give</div>
                <BarList items={(impact.byMethod || []).slice(0, 8).map((m, i) => ({
                  label: m.payment_method.replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()),
                  value: m.v, note: `${m.n} gifts`, color: PALETTE[i % PALETTE.length],
                }))} />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ──────────────────────── closing CTA ─────────────────────── */}
      <section className="section section-indigo" style={{ textAlign: 'center' }}>
        <div className="wrap narrow">
          <div className="overline center" style={{ justifyContent: 'center' }}>Make your sankalpa</div>
          <h2 className="h-section" style={{ marginBottom: 24 }}>
            A sankalpa is an intention you make to yourself.
          </h2>
          <p className="lede">
            Give fifty dollars today, or name the Foundation in your will and give nothing at all until you
            no longer need it. Both are received with the same reverence. Both outlive you.
          </p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 36 }}>
            <Link to="/give" className="btn btn-gold">Give today</Link>
            <Link to="/calculators" className="btn btn-ghost">See what a legacy gift would do</Link>
          </div>
        </div>
      </section>

      {video && (
        <Modal onClose={() => setVideo(null)}>
          <div className="ratio-16x9">
            <iframe title={video.title}
              src={`https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1`}
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          </div>
          <div style={{ padding: '22px 26px' }}>
            <div className="overline">{video.note}</div>
            <h3 className="h-sub">{video.title}</h3>
          </div>
        </Modal>
      )}
    </>
  );
}
