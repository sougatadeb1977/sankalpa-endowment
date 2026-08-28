'use strict';
/**
 * Seed worker.
 *
 * Building the demo database is a couple of minutes of synchronous SQLite
 * writes. Run in the API process it blocks the event loop completely, so the
 * server cannot answer the platform's health probe and App Service kills the
 * container mid-build — which is exactly how a half-populated database got
 * deployed once already.
 *
 * So it runs here, in its own process. The parent stays responsive and serves
 * 503 on data endpoints until this exits. SQLite in WAL mode handles the
 * concurrent reader without complaint.
 */
const { seed } = require('./seed');

try {
  const result = seed();
  process.send?.({ ok: true, result });
  process.exit(0);
} catch (e) {
  process.send?.({ ok: false, error: e.message });
  console.error('[sankalpa:seed-worker]', e.stack || e.message);
  process.exit(1);
}
