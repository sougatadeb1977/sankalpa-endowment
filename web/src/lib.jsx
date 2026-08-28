import React, { useEffect, useRef, useState, useCallback } from 'react';

/* ───────────────────────────── API client ───────────────────────────── */

let TOKEN = sessionStorage.getItem('sankalpa_token') || null;
export const setToken = (t) => {
  TOKEN = t;
  if (t) sessionStorage.setItem('sankalpa_token', t);
  else sessionStorage.removeItem('sankalpa_token');
};
export const getToken = () => TOKEN;

export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** Fetch-on-mount hook with loading and error state. */
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api(path)
      .then((d) => live && setState({ data: d, loading: false, error: null }))
      .catch((e) => live && setState({ data: null, loading: false, error: e.message }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/* ─────────────────────────── formatting ─────────────────────────────── */

export const money = (n, dp = 0) =>
  n == null || Number.isNaN(n) ? '—'
    : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const compact = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
  return '$' + Math.round(v);
};

export const pct = (n, dp = 1) => (Number(n) || 0).toFixed(dp) + '%';
export const num = (n) => (Number(n) || 0).toLocaleString('en-US');
export const titleize = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const dateFmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

/**
 * Count a number up when it scrolls into view.
 * The animation is decoration, so it never gates the value: if the observer or
 * the frame loop is throttled (a background tab, reduced-motion, a browser that
 * pauses rAF), a fallback timer still lands on the true figure.
 */
export function useCountUp(target, duration = 1600) {
  const [v, setV] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    if (!target) return;
    let raf, done = false, started = false;
    const finish = () => { if (!done) { done = true; setV(target); } };
    const run = () => {
      if (started) return;
      started = true;
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / duration);
        setV(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick); else done = true;
      };
      raf = requestAnimationFrame(tick);
    };
    const el = ref.current;
    let io;
    if (el && 'IntersectionObserver' in window) {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) run();
      else {
        io = new IntersectionObserver(([e]) => { if (e.isIntersecting) run(); }, { threshold: 0.25 });
        io.observe(el);
      }
    } else run();
    const guard = setTimeout(finish, duration + 900);
    return () => { io?.disconnect(); cancelAnimationFrame(raf); clearTimeout(guard); };
  }, [target, duration]);
  return [v, ref];
}

/**
 * Adds .in to .reveal elements as they enter the viewport. A fallback timer
 * reveals anything still hidden, so content is never trapped behind an
 * observer that does not fire.
 */
export function useReveal(dep) {
  useEffect(() => {
    const reveal = (el) => el.classList.add('in');
    const els = [...document.querySelectorAll('.reveal:not(.in)')];
    let io;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) reveal(el);
        else io.observe(el);
      });
    } else els.forEach(reveal);
    const guard = setTimeout(() => els.forEach(reveal), 2200);
    return () => { io?.disconnect(); clearTimeout(guard); };
  }, [dep]);
}

/* ───────────────────────────── charts ───────────────────────────────── */

/** Area + line chart drawn as inline SVG. */
export function LineChart({ data, height = 220, color = 'var(--saffron)', fill = true, labelKey = 'label', valueKey = 'value' }) {
  if (!data || data.length < 2) return <div className="muted small">Not enough data to plot.</div>;
  const w = 800, h = height, pad = { t: 14, r: 10, b: 26, l: 10 };
  const vals = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...vals) * 1.08 || 1;
  const min = Math.min(0, ...vals);
  const x = (i) => pad.l + (i * (w - pad.l - pad.r)) / (data.length - 1);
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / (max - min || 1));
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${y(min)} L${x(0)},${y(min)} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={height} role="img" aria-label="Trend chart">
      <defs>
        <linearGradient id="lcg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={pad.l} x2={w - pad.r} y1={y(min + (max - min) * g)} y2={y(min + (max - min) * g)}
          stroke="var(--border)" strokeWidth="1" />
      ))}
      {fill && <path d={area} fill="url(#lcg)" />}
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) && (
        <text key={i} x={x(i)} y={h - 6} fontSize="11" fill="var(--ink-soft)"
          textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>{d[labelKey]}</text>
      ))}
    </svg>
  );
}

/** Horizontal bar list. */
export function BarList({ items, max, color = 'var(--indigo)', format = compact }) {
  const top = max || Math.max(...items.map((i) => i.value)) || 1;
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div className="between" style={{ marginBottom: 6, gap: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{it.label}</span>
            <span className="num small muted">{format(it.value)}{it.note ? ` · ${it.note}` : ''}</span>
          </div>
          <div style={{ height: 6, background: 'var(--border)' }}>
            <div style={{
              height: '100%', width: `${Math.max(1.5, (it.value / top) * 100)}%`,
              background: it.color || color, transition: 'width 1.1s cubic-bezier(.16,1,.3,1)',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Grouped column chart for scenario comparison. */
export function ScenarioChart({ horizons, height = 260 }) {
  if (!horizons?.length) return null;
  const w = 820, h = height, pad = { t: 16, r: 12, b: 46, l: 12 };
  const max = Math.max(...horizons.flatMap((x) => [x.optimistic, x.base, x.pessimistic])) * 1.1 || 1;
  const groupW = (w - pad.l - pad.r) / horizons.length;
  const barW = Math.min(26, (groupW - 22) / 3);
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const series = [
    { key: 'pessimistic', color: '#b9b2a2' },
    { key: 'base', color: 'var(--indigo)' },
    { key: 'optimistic', color: 'var(--saffron)' },
  ];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={height} role="img" aria-label="Scenario forecast by horizon">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={pad.l} x2={w - pad.r} y1={y(max * g)} y2={y(max * g)} stroke="var(--border)" />
      ))}
      {horizons.map((hz, i) => {
        const cx = pad.l + groupW * i + groupW / 2;
        return (
          <g key={hz.label}>
            {series.map((s, j) => {
              const v = hz[s.key] || 0;
              const bx = cx - (barW * 1.5 + 4) + j * (barW + 4);
              return <rect key={s.key} x={bx} y={y(v)} width={barW} height={Math.max(1, h - pad.b - y(v))} fill={s.color} />;
            })}
            <text x={cx} y={h - 26} fontSize="11.5" fill="var(--ink)" textAnchor="middle">{hz.label}</text>
            <text x={cx} y={h - 10} fontSize="10.5" fill="var(--ink-soft)" textAnchor="middle">{hz.count} gifts</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Donut for allocation / composition. */
export function Donut({ slices, size = 210, thickness = 26, centerLabel, centerValue }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Composition">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {slices.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color}
                strokeWidth={thickness} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
        </g>
        {centerValue && (
          <>
            <text x="50%" y="47%" textAnchor="middle" fontFamily="var(--serif)" fontSize="26"
              fill="var(--indigo)" fontWeight="600">{centerValue}</text>
            <text x="50%" y="60%" textAnchor="middle" fontSize="10.5" fill="var(--earth)"
              letterSpacing="1.4">{centerLabel}</text>
          </>
        )}
      </svg>
      <div style={{ flex: 1, minWidth: 190 }}>
        {slices.map((s, i) => (
          <div key={i} className="between" style={{ marginBottom: 9, gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5 }}>
              <i style={{ width: 10, height: 10, background: s.color, flex: 'none' }} />{s.label}
            </span>
            <span className="num small muted">{((s.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const PALETTE = ['#1a1464', '#d4860b', '#2a7b7b', '#8b5e3c', '#4a7ba7', '#f0c040', '#3a3184', '#a4703f'];

/* ───────────────────────────── icons ────────────────────────────────── */

const I = (p) => ({ width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', ...p });

export const Icon = {
  lotus: (p) => (
    <svg {...I(p)}><path d="M12 3c2 2.4 3 4.7 3 7a3 3 0 0 1-6 0c0-2.3 1-4.6 3-7Z" />
      <path d="M12 21c-4.4 0-8-2.3-8-5.2 0-1.2.6-2.3 1.7-3.2M12 21c4.4 0 8-2.3 8-5.2 0-1.2-.6-2.3-1.7-3.2" /></svg>),
  play: (p) => (<svg {...I(p)}><path d="M6 4.5v15l13-7.5-13-7.5Z" fill="currentColor" stroke="none" /></svg>),
  pause: (p) => (<svg {...I(p)}><rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none" /><rect x="14" y="5" width="4" height="14" fill="currentColor" stroke="none" /></svg>),
  next: (p) => (<svg {...I(p)}><path d="m9 6 6 6-6 6" /></svg>),
  prev: (p) => (<svg {...I(p)}><path d="m15 6-6 6 6 6" /></svg>),
  sound: (p) => (<svg {...I(p)}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M16 8.5a4.5 4.5 0 0 1 0 7" /><path d="M19 5.5a8.5 8.5 0 0 1 0 13" /></svg>),
  mute: (p) => (<svg {...I(p)}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="m17 9 4 6M21 9l-4 6" /></svg>),
  shield: (p) => (<svg {...I(p)}><path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>),
  sparkle: (p) => (<svg {...I(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /><circle cx="12" cy="12" r="2.5" /></svg>),
  doc: (p) => (<svg {...I(p)}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>),
  chart: (p) => (<svg {...I(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>),
  globe: (p) => (<svg {...I(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" /></svg>),
  heart: (p) => (<svg {...I(p)}><path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7 2.7C19 15.6 12 20 12 20Z" /></svg>),
  vault: (p) => (<svg {...I(p)}><rect x="3" y="4" width="18" height="16" rx="1" /><circle cx="12" cy="12" r="3.6" /><path d="M12 8.4V6M12 18v-2.4" /></svg>),
  menu: (p) => (<svg {...I({ ...p, width: 24, height: 24 })}><path d="M4 7h16M4 12h16M4 17h16" /></svg>),
  x: (p) => (<svg {...I(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>),
  check: (p) => (<svg {...I(p)}><path d="m5 12 5 5L19 7" /></svg>),
  arrow: (p) => (<svg {...I(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>),
  scales: (p) => (<svg {...I(p)}><path d="M12 4v16M7 20h10M3 9l4-5 4 5M13 9l4-5 4 5" /><path d="M3 9a4 4 0 0 0 8 0M13 9a4 4 0 0 0 8 0" /></svg>),
  users: (p) => (<svg {...I(p)}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 5.3a3.2 3.2 0 0 1 0 5.4M18.5 20a6.4 6.4 0 0 0-3-5.4" /></svg>),
};

/** Small reusable modal. */
export function Modal({ onClose, children, width }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" style={width ? { maxWidth: width } : undefined} onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        {children}
      </div>
    </div>
  );
}

/** Section heading with overline. */
export function Head({ over, title, lede, center, light }) {
  return (
    <div style={center ? { textAlign: 'center', maxWidth: 720, margin: '0 auto 52px' } : { marginBottom: 44 }}>
      {over && <div className={`overline${center ? ' center' : ''}`}>{over}</div>}
      <h2 className="h-section" style={light ? { color: 'var(--lotus)' } : undefined}>{title}</h2>
      {lede && <p className="lede" style={{ marginTop: 18, marginBottom: 0 }}>{lede}</p>}
    </div>
  );
}

export function Loading({ label = 'Loading' }) {
  return <div className="muted small" style={{ padding: '40px 0', display: 'flex', gap: 10, alignItems: 'center' }}>
    <span className="spinner" /> {label}…</div>;
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export const useMounted = () => {
  const r = useRef(true);
  useEffect(() => () => { r.current = false; }, []);
  return useCallback(() => r.current, []);
};
