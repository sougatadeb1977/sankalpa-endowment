import React, { useMemo, useState } from 'react';

/**
 * An equirectangular world map.
 *
 * The earlier version drew a wireframe sphere out of nested ellipses, which
 * read as an abstract ball rather than the world. This uses coarse continent
 * outlines — deliberately low-detail, because the point is recognition and
 * placement, not cartographic accuracy — and plots each supporting country as
 * a marker area-scaled to what has been given there.
 *
 * Antarctica is omitted and the frame is clipped at 83°N/57°S: nobody gives
 * from the ice, and cropping it keeps the inhabited world large.
 */

const LAND = {
  northAmerica: [[-168, 66], [-160, 71], [-140, 70], [-125, 70], [-110, 68], [-95, 70], [-85, 70],
    [-78, 63], [-76, 57], [-70, 59], [-64, 60], [-56, 52], [-60, 47], [-67, 45], [-70, 42],
    [-75, 38], [-76, 35], [-81, 31], [-80, 25], [-84, 30], [-88, 30], [-94, 29], [-97, 26],
    [-99, 22], [-105, 20], [-106, 23], [-110, 24], [-113, 30], [-117, 32], [-122, 37],
    [-124, 42], [-124, 48], [-131, 53], [-140, 60], [-150, 60], [-158, 56], [-165, 60]],
  centralAmerica: [[-92, 18], [-88, 18], [-84, 16], [-83, 11], [-79, 9], [-77, 8], [-79, 7],
    [-83, 8], [-86, 11], [-88, 14], [-92, 15]],
  greenland: [[-45, 60], [-30, 60], [-20, 70], [-22, 78], [-35, 83], [-50, 82], [-58, 76], [-55, 68]],
  southAmerica: [[-81, 8], [-75, 11], [-70, 12], [-62, 11], [-52, 5], [-50, 0], [-44, -2],
    [-35, -6], [-38, -13], [-40, -20], [-48, -25], [-53, -34], [-58, -38], [-62, -40],
    [-65, -45], [-68, -50], [-70, -55], [-74, -52], [-73, -45], [-72, -38], [-71, -30],
    [-70, -20], [-75, -14], [-79, -6], [-80, 0], [-78, 2]],
  africa: [[-17, 15], [-16, 21], [-10, 27], [0, 32], [10, 34], [20, 33], [32, 31], [35, 24],
    [37, 18], [43, 12], [51, 12], [43, 4], [41, -2], [40, -10], [35, -18], [33, -25],
    [28, -33], [20, -35], [18, -33], [15, -25], [12, -17], [9, -1], [5, 4], [-5, 5],
    [-10, 6], [-13, 9]],
  madagascar: [[43, -12], [50, -15], [48, -25], [44, -22]],
  europe: [[-10, 36], [-9, 43], [-2, 43], [0, 49], [2, 51], [5, 53], [8, 55], [10, 58],
    [15, 56], [18, 55], [21, 56], [24, 58], [28, 60], [30, 62], [33, 58], [38, 50],
    [40, 45], [30, 45], [28, 41], [23, 40], [20, 40], [16, 42], [13, 40], [16, 38],
    [18, 40], [12, 44], [8, 44], [3, 42], [-2, 37], [-6, 36]],
  britain: [[-5, 50], [-3, 50], [1, 51], [0, 54], [-3, 55], [-2, 58], [-5, 58], [-6, 55], [-5, 52]],
  ireland: [[-10, 52], [-6, 52], [-6, 55], [-10, 54]],
  scandinavia: [[5, 58], [8, 63], [12, 65], [15, 68], [21, 70], [28, 71], [30, 68], [25, 66],
    [24, 62], [22, 60], [18, 59], [12, 59], [8, 58]],
  asia: [[30, 62], [40, 68], [55, 70], [70, 72], [80, 74], [100, 77], [110, 74], [125, 73],
    [140, 72], [160, 70], [170, 66], [178, 65], [172, 60], [162, 58], [155, 50], [143, 45],
    [135, 43], [131, 43], [127, 39], [122, 39], [121, 32], [118, 24], [110, 21], [107, 12],
    [104, 9], [100, 6], [98, 8], [99, 14], [95, 16], [93, 20], [89, 22], [85, 20],
    [80, 15], [77, 8], [73, 16], [70, 21], [68, 24], [62, 25], [58, 25], [52, 28],
    [48, 30], [44, 38], [40, 42], [34, 42]],
  japan: [[130, 31], [135, 34], [140, 36], [142, 42], [145, 44], [141, 45], [139, 40],
    [136, 36], [132, 33]],
  indonesia: [[95, 5], [104, 2], [110, 0], [117, 1], [125, 1], [131, -1], [140, -3],
    [140, -8], [131, -8], [124, -9], [117, -9], [110, -8], [104, -6], [98, -2]],
  philippines: [[120, 18], [124, 18], [126, 13], [126, 7], [122, 6], [120, 12]],
  australia: [[113, -22], [114, -34], [118, -35], [129, -32], [138, -35], [145, -38],
    [150, -37], [153, -28], [146, -19], [142, -11], [136, -12], [130, -11], [126, -14],
    [121, -20]],
  newZealand: [[173, -35], [178, -38], [176, -41], [172, -41], [167, -45], [170, -46], [174, -42]],
};

/* Approximate centroid of each country we have supporters in. */
export const COUNTRY = {
  US: { ll: [-98, 39], name: 'United States' },
  IN: { ll: [79, 22], name: 'India' },
  DE: { ll: [10, 51], name: 'Germany' },
  GB: { ll: [-2, 54], name: 'United Kingdom' },
  CA: { ll: [-106, 56], name: 'Canada' },
  FR: { ll: [2, 47], name: 'France' },
  CH: { ll: [8, 47], name: 'Switzerland' },
  AU: { ll: [134, -25], name: 'Australia' },
  NL: { ll: [5, 52], name: 'Netherlands' },
  SE: { ll: [16, 61], name: 'Sweden' },
  SG: { ll: [104, 1], name: 'Singapore' },
  BR: { ll: [-51, -14], name: 'Brazil' },
  AE: { ll: [54, 24], name: 'United Arab Emirates' },
  IT: { ll: [12, 42], name: 'Italy' },
  ES: { ll: [-4, 40], name: 'Spain' },
  JP: { ll: [138, 36], name: 'Japan' },
  ZA: { ll: [24, -29], name: 'South Africa' },
  MX: { ll: [-102, 23], name: 'Mexico' },
  KE: { ll: [38, 0], name: 'Kenya' },
  NO: { ll: [9, 61], name: 'Norway' },
};

const W = 1000;
const H = 480;
const LAT_MAX = 83;
const LAT_MIN = -57;

const px = ([lon, lat]) => [
  ((lon + 180) / 360) * W,
  ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H,
];
const toPath = (poly) => poly.map((p, i) => `${i ? 'L' : 'M'}${px(p).map((n) => n.toFixed(1)).join(',')}`).join(' ') + 'Z';

export default function WorldMap({ countries = [], height = 420, showLabels = true }) {
  const [hover, setHover] = useState(null);

  const points = useMemo(() => {
    const withCoords = countries.filter((c) => COUNTRY[c.country] && c.raised > 0);
    const max = Math.max(...withCoords.map((c) => c.raised), 1);
    return withCoords
      .map((c) => {
        const [x, y] = px(COUNTRY[c.country].ll);
        // Area-proportional, so a country giving four times as much reads as
        // four times the ink rather than four times the radius.
        const r = 5 + Math.sqrt(c.raised / max) * 20;
        return { ...c, x, y, r, name: COUNTRY[c.country].name };
      })
      .sort((a, b) => b.r - a.r);
  }, [countries]);

  const money = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);

  return (
    <figure className="worldmap" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} role="img"
        aria-label={`Supporters in ${points.length} countries`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="wm-halo">
            <stop offset="0%" stopColor="var(--saffron)" stopOpacity=".34" />
            <stop offset="100%" stopColor="var(--saffron)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* graticule — every 30° of longitude, 20° of latitude */}
        <g stroke="var(--border)" strokeWidth="0.6" opacity=".7">
          {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => (
            <line key={lon} x1={px([lon, LAT_MAX])[0]} y1={0} x2={px([lon, LAT_MIN])[0]} y2={H} />
          ))}
          {[60, 40, 20, 0, -20, -40].map((lat) => (
            <line key={lat} x1={0} y1={px([0, lat])[1]} x2={W} y2={px([0, lat])[1]} />
          ))}
        </g>
        {/* the equator, marked a shade stronger */}
        <line x1={0} y1={px([0, 0])[1]} x2={W} y2={px([0, 0])[1]}
          stroke="var(--border-strong)" strokeWidth="0.9" strokeDasharray="4 4" />

        {/* landmasses */}
        <g fill="var(--lotus-warm)" stroke="var(--border-strong)" strokeWidth="0.9"
          strokeLinejoin="round">
          {Object.entries(LAND).map(([k, poly]) => <path key={k} d={toPath(poly)} />)}
        </g>

        {/* supporters */}
        <g>
          {points.map((p) => (
            <g key={p.country}
              onMouseEnter={() => setHover(p.country)} onMouseLeave={() => setHover(null)}
              style={{ cursor: 'default' }}>
              <circle cx={p.x} cy={p.y} r={p.r * 2.1} fill="url(#wm-halo)" />
              <circle cx={p.x} cy={p.y} r={p.r} fill="var(--saffron)" fillOpacity=".82"
                stroke="#fff" strokeWidth="1.4" />
              <title>{p.name}: {money(p.raised)} from {p.donors} supporters</title>
            </g>
          ))}
        </g>

        {/* labels for the largest few, so the map reads without hovering */}
        {showLabels && (
          <g fontSize="12.5" fontFamily="var(--sans)" fill="var(--indigo)" fontWeight="600">
            {points.slice(0, 6).map((p) => {
              const flip = p.x > W - 130;
              return (
                <text key={p.country} x={p.x + (flip ? -(p.r + 8) : p.r + 8)} y={p.y + 4}
                  textAnchor={flip ? 'end' : 'start'}>
                  {p.country}
                  <tspan fill="var(--earth)" fontWeight="400"> {money(p.raised)}</tspan>
                </text>
              );
            })}
          </g>
        )}

        {hover && (() => {
          const p = points.find((x) => x.country === hover);
          if (!p) return null;
          return (
            <text x={p.x} y={p.y - p.r - 12} textAnchor="middle" fontSize="13"
              fontFamily="var(--sans)" fontWeight="700" fill="var(--indigo)">
              {p.name} · {money(p.raised)}
            </text>
          );
        })()}
      </svg>
    </figure>
  );
}
