import React, { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from 'react-leaflet';

/**
 * A real world map.
 *
 * Earlier attempts drew the world by hand — first a wireframe sphere, then
 * coarse continent polygons — and both looked like what they were: an
 * approximation. This uses Leaflet over CARTO's Positron basemap (OpenStreetMap
 * data), the same stack already proven in TidalNexus, so the geography is
 * actual geography.
 *
 * Each supporting country carries a marker whose AREA is proportional to what
 * has been given there, so four times the money reads as four times the ink
 * rather than four times the radius.
 */

/* Country centroids for the places we have supporters in. */
export const COUNTRY = {
  US: { ll: [39.5, -98.4], name: 'United States' },
  IN: { ll: [22.6, 79.0], name: 'India' },
  DE: { ll: [51.2, 10.4], name: 'Germany' },
  GB: { ll: [54.0, -2.0], name: 'United Kingdom' },
  CA: { ll: [56.1, -106.3], name: 'Canada' },
  FR: { ll: [46.6, 2.2], name: 'France' },
  CH: { ll: [46.8, 8.2], name: 'Switzerland' },
  AU: { ll: [-25.3, 133.8], name: 'Australia' },
  NL: { ll: [52.1, 5.3], name: 'Netherlands' },
  SE: { ll: [60.1, 18.6], name: 'Sweden' },
  SG: { ll: [1.35, 103.8], name: 'Singapore' },
  BR: { ll: [-14.2, -51.9], name: 'Brazil' },
  AE: { ll: [23.4, 53.8], name: 'United Arab Emirates' },
  IT: { ll: [41.9, 12.6], name: 'Italy' },
  ES: { ll: [40.5, -3.7], name: 'Spain' },
  JP: { ll: [36.2, 138.3], name: 'Japan' },
  ZA: { ll: [-30.6, 22.9], name: 'South Africa' },
  MX: { ll: [23.6, -102.6], name: 'Mexico' },
  KE: { ll: [0.02, 37.9], name: 'Kenya' },
  NO: { ll: [60.5, 8.5], name: 'Norway' },
};

const money = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);

export default function WorldMap({ countries = [], height = 460, center = [26, 8], zoom = 2 }) {
  const points = useMemo(() => {
    const withCoords = countries.filter((c) => COUNTRY[c.country] && c.raised > 0);
    const max = Math.max(...withCoords.map((c) => c.raised), 1);
    return withCoords
      .map((c) => ({
        ...c,
        ...COUNTRY[c.country],
        // Area-proportional: radius scales with the square root of the amount.
        r: 7 + Math.sqrt(c.raised / max) * 22,
      }))
      .sort((a, b) => b.raised - a.raised);
  }, [countries]);

  return (
    <div className="worldmap">
      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={2}
        maxZoom={7}
        style={{ height, width: '100%' }}
        scrollWheelZoom={false}
        worldCopyJump
        attributionControl
        maxBounds={[[-72, -200], [86, 200]]}
        maxBoundsViscosity={0.8}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {points.map((p, i) => (
          <CircleMarker
            key={p.country}
            center={p.ll}
            radius={p.r}
            pathOptions={{
              color: '#c07d12',
              fillColor: '#c07d12',
              fillOpacity: 0.42,
              weight: 1.6,
            }}
          >
            {/* The largest few label themselves, so the map reads at a glance. */}
            {i < 6 && (
              <Tooltip permanent direction="right" offset={[p.r - 2, 0]} className="wm-label">
                <strong>{p.country}</strong> {money(p.raised)}
              </Tooltip>
            )}
            <Popup>
              <div style={{ minWidth: 170 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 12.5 }}>
                  {money(p.raised)} received<br />
                  {p.donors} supporter{p.donors === 1 ? '' : 's'}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
