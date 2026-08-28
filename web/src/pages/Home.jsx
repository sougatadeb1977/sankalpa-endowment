import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useApi, compact, num, pct, Head, Icon, Modal, Tabs,
  useCountUp, BarList, PALETTE,
} from '../lib.jsx';
// Leaflet is ~180KB, and most visitors never open the map. Load it only when
// the Global reach panel is actually shown.
const WorldMap = lazy(() => import('../WorldMap.jsx'));

const HERO_VIDEO = 'k493mHHWTfw';
const WISDOM = [
  { id: 'k493mHHWTfw', title: 'A life dedicated to a violence-free world', note: 'An introduction to Gurudev' },
  { id: 'drpE8NlTivY', title: 'In conversation with Dr. Vivek Murthy', note: 'On loneliness and belonging' },
  { id: 'hu41ybUC0PE', title: 'With Harvard\'s Robert Waldinger', note: 'What makes a good life' },
  { id: 'roaD-qgPuCM', title: 'The Aubrey Marcus Podcast', note: 'Breath, mind and modern life' },
];

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

/* ─────────────────────────── panel: endowment ────────────────────────── */

function WhyEndowment() {
  return (
    <div className="grid g2" style={{ gap: 60, alignItems: 'center' }}>
      <div>
        <div className="overline">Why an endowment</div>
        <h2 className="h-section">A gift that is given once, and keeps giving for ever.</h2>
        <p className="lede" style={{ marginTop: 20 }}>
          Ordinary giving funds a year. An endowment funds a century. The principal is never spent —
          only the investment return is drawn, at a disciplined 4.5% a year, so a gift made today is
          still teaching a child to breathe in 2126.
        </p>
        <p className="muted">
          That is why this campaign exists. Forty-five million dollars, raised once, ends the annual
          anxiety of fundraising and lets programme teams plan in decades rather than quarters. It is
          the difference between a charity that survives and a mission that endures.
        </p>
        <Link to="/planned-giving" className="link-gold">See the seven ways to give →</Link>
      </div>
      <div className="card card-feature" style={{ padding: 36 }}>
        <div className="overline">What $100,000 becomes</div>
        {[
          ['Given once, today', '$100,000', 'var(--indigo)'],
          ['Distributed each year, for ever', '$4,500', 'var(--saffron)'],
          ['Given away over 100 years', '$450,000', 'var(--teal)'],
          ['And the principal still stands', '$100,000', 'var(--earth)'],
        ].map(([l, v, col]) => (
          <div key={l} className="between" style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
            <span className="small">{l}</span>
            <span className="serif-num" style={{ fontSize: 24, color: col, fontWeight: 700 }}>{v}</span>
          </div>
        ))}
        <p className="tiny muted" style={{ marginTop: 18, marginBottom: 0 }}>
          Illustrative, using the Foundation's 4.5% spending policy. Investment returns are not guaranteed.
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────── panel: funds ──────────────────────────── */

function Funds({ funds }) {
  return (
    <div data-tour="funds">
      <Head center over="Where your gift lives" title="Five causes, one intention"
        lede="Give to the permanent endowment, or direct your gift to the work that moves you. Every restricted gift is tracked in its own net asset class — money given for children can never be spent on anything else." />
      <div className="grid g3">
        {funds.map((f, i) => (
          <article key={f.fund_code} className="card card-lift"
            style={{ borderTop: `2px solid ${PALETTE[i % PALETTE.length]}` }}>
            <div className="overline" style={{ marginBottom: 10 }}>{f.fund_code}</div>
            <h3 className="h-sub" style={{ marginBottom: 12 }}>{f.fund_name}</h3>
            <p className="small muted" style={{ minHeight: 74 }}>{f.blurb}</p>
            <div className="between" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div>
                <div className="serif-num" style={{ fontSize: 22, color: 'var(--indigo)', fontWeight: 700 }}>
                  {compact(f.raised)}
                </div>
                <div className="tiny muted">of {compact(f.target_amount)} target</div>
              </div>
              <Link to={`/give?fund=${f.fund_code}`} className="link-gold">Give →</Link>
            </div>
            <div style={{ height: 4, background: 'var(--border)', marginTop: 12 }}>
              <div style={{
                height: '100%', width: `${Math.min(100, (f.raised / f.target_amount) * 100)}%`,
                background: PALETTE[i % PALETTE.length],
              }} />
            </div>
            {f.impact_line && (
              <p className="tiny muted" style={{ marginTop: 12, marginBottom: 0 }}>{f.impact_line}</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────── panel: reach ───────────────────────────── */

function Reach({ countries }) {
  const total = countries.reduce((s, c) => s + c.raised, 0);
  return (
    <div>
      <Head center over="Global spread · one world family"
        title="Peace does not belong to one country."
        lede="Supporters give in dollars, euros, rupees, francs and rand — from Pasadena to Bengaluru, Stockholm to Nairobi, São Paulo to Singapore. Every gift, in every currency, funds the same simple proposition: a mind at peace makes a world at peace." />

      <Suspense fallback={
        <div className="worldmap" style={{ height: 460, display: 'grid', placeItems: 'center' }}>
          <span className="muted small"><span className="spinner" /> Loading the map…</span>
        </div>
      }>
        <WorldMap countries={countries} height={460} />
      </Suspense>
      <div className="map-legend">
        <span><i className="dot" style={{ width: 9, height: 9 }} /> smaller</span>
        <span><i className="dot" style={{ width: 17, height: 17 }} /> larger</span>
        <span>Marker area is proportional to cash received. Click any country for detail.</span>
        <span style={{ marginLeft: 'auto' }}>
          {countries.length} countries · {compact(total)} received
        </span>
      </div>

      <div className="grid g3" style={{ marginTop: 34, gap: 30 }}>
        {[0, 1, 2].map((col) => (
          <div key={col}>
            {countries.slice(col * 6, col * 6 + 6).map((x) => (
              <div key={x.country} className="between"
                style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13.5 }}>{x.country}</span>
                <span className="num small" style={{ color: 'var(--earth)' }}>
                  {compact(x.raised)} · {x.donors}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────── panel: films ───────────────────────────── */

function Films({ onPlay }) {
  return (
    <div>
      <Head center over="In his own words" title="Gurudev, unedited"
        lede="Four decades of teaching, offered freely. Watch, then decide what your legacy should say." />
      <div className="grid g4">
        {WISDOM.map((v) => (
          <button key={v.id} className="card card-lift" onClick={() => onPlay(v)}
            style={{ textAlign: 'left', cursor: 'pointer', padding: 0, border: '1px solid var(--border)', background: '#fff' }}>
            <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden', background: 'var(--lotus-warm)' }}>
              <img src={`https://img.youtube.com/vi/${v.id}/hqdefault.jpg`} alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
              <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <span style={{
                  width: 50, height: 50, borderRadius: '50%', background: 'rgba(192,125,18,.94)',
                  display: 'grid', placeItems: 'center', color: '#fff', paddingLeft: 4,
                }}><Icon.play width={19} height={19} /></span>
              </span>
            </div>
            <div style={{ padding: '16px 18px 20px' }}>
              <div className="overline" style={{ marginBottom: 8 }}>{v.note}</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 700, color: 'var(--indigo)', lineHeight: 1.3 }}>
                {v.title}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── panel: transparency ─────────────────────────── */

function Transparency({ funds, impact }) {
  return (
    <div>
      <Head center over="Transparency" title="The campaign, in the open"
        lede="These figures come straight from the platform's general ledger — the same numbers the finance team and the auditors see." />
      <div className="grid g2" style={{ gap: 44 }}>
        <div className="card">
          <div className="overline">Raised by fund</div>
          <BarList items={funds.map((f, i) => ({
            label: f.fund_name, value: f.raised, color: PALETTE[i % PALETTE.length],
          }))} />
        </div>
        <div className="card">
          <div className="overline">How supporters give</div>
          <BarList items={(impact.byMethod || []).slice(0, 9).map((m, i) => ({
            label: m.payment_method.replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()),
            value: m.v, note: `${m.n} gifts`, color: PALETTE[i % PALETTE.length],
          }))} />
        </div>
      </div>
      <div className="card" style={{ marginTop: 22, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <Icon.shield width={22} height={22} style={{ color: 'var(--teal)', flex: 'none', marginTop: 2 }} />
        <p className="small muted" style={{ marginBottom: 0 }}>
          Every gift writes a balanced double-entry journal entry the moment it is received — debits
          equal credits, always, or the gift is refused. The finance portal is open to look at, and the
          books balance to the cent.
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────── the page ──────────────────────────────── */

export default function Home() {
  const { data: c } = useApi('/campaign');
  const { data: quotes } = useApi('/quotes');
  const { data: impact } = useApi('/impact/global');
  const [qi, setQi] = useState(0);
  const [video, setVideo] = useState(null);
  const [heroOn, setHeroOn] = useState(true);

  useEffect(() => {
    if (!quotes?.length) return;
    const t = setInterval(() => setQi((i) => (i + 1) % quotes.length), 6400);
    return () => clearInterval(t);
  }, [quotes]);

  const q = quotes?.[qi];
  const funds = impact?.byFund || [];
  const countries = useMemo(
    () => (impact?.byCountry || []).filter((x) => x.raised > 0), [impact]);

  const tabs = [
    { id: 'endowment', label: 'Why an endowment', render: () => <WhyEndowment /> },
    { id: 'funds', label: 'Where your gift lives', count: funds.length, render: () => <Funds funds={funds} /> },
    { id: 'reach', label: 'Global reach', count: countries.length, render: () => <Reach countries={countries} /> },
    { id: 'films', label: 'In his own words', render: () => <Films onPlay={setVideo} /> },
    { id: 'transparency', label: 'Transparency', render: () => <Transparency funds={funds} impact={impact} /> },
  ];

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
          <div className="hero-col">
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
        </div>
        <div className="hero-controls">
          <button className="video-toggle" onClick={() => setVideo(WISDOM[0])}>
            <Icon.play width={13} height={13} /> Watch with sound
          </button>
          <button className="video-toggle" onClick={() => setHeroOn(!heroOn)}>
            {heroOn ? 'Pause film' : 'Play film'}
          </button>
        </div>
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
              <div className="stat" key={l}>
                <div className="stat-val num">{v}</div>
                <div className="stat-lab">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────────────── tabbed content ────────────────────── */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          {impact ? <Tabs tabs={tabs} hashKey="home" />
            : <p className="muted small" style={{ padding: '40px 0' }}>Loading…</p>}
        </div>
      </section>

      {/* ──────────────────────── closing CTA ─────────────────────── */}
      <section className="section-tight section-indigo" style={{ textAlign: 'center' }}>
        <div className="wrap narrow">
          <div className="overline center" style={{ justifyContent: 'center' }}>Make your sankalpa</div>
          <h2 className="h-section" style={{ marginBottom: 20 }}>
            A sankalpa is an intention you make to yourself.
          </h2>
          <p className="lede">
            Give fifty dollars today, or name the Foundation in your will and give nothing at all until
            you no longer need it. Both are received with the same reverence. Both outlive you.
          </p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 30 }}>
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
          <div style={{ padding: '20px 24px' }}>
            <div className="overline">{video.note}</div>
            <h3 className="h-sub">{video.title}</h3>
          </div>
        </Modal>
      )}
    </>
  );
}
