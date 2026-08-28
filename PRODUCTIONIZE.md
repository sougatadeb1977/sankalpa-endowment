# Productionising Sankalpa

*What stands between this platform and a system that can hold real donor money and real estate documents.*

Written honestly. The accounting engine, actuarial model, AI extraction pipeline and stewardship
automation are real and working — they are not screenshots. What follows is the infrastructure,
integration and assurance work that a system of record for a $45M endowment must have before a
single live gift touches it.

---

## Where the platform already stands

**Built and working**

- Double-entry general ledger that **rejects** unbalanced entries at the API boundary, not just in the UI
- Six fiscal years of history: 420 donors, ~4,100 transactions, ~4,400 journal entries, ~11,700 journal lines
- FASB ASC 958 / ASU 2016-14 statement of activities and financial position, with prior-year comparatives and a functional expense split
- Period-scoped trial balance, general journal with account/fund/type/text filters, and year-on-year analysis
- Actuarial engine — SSA period life tables, IRS §7520, asset-class risk spreads, per-instrument realisation probability, three scenarios across five horizons
- Legal-domain NER over wills and trusts with per-entity confidence scoring and a sub-90% human review queue
- Stewardship rules engine (7 triggers, idempotent dated tasks) and ~100% automated CRM capture
- Data hub over 22 whitelisted tables with filtering, sorting, CSV export and 12 live integrity checks
- Append-only audit trail; soft-delete only on financial and estate records

**Not yet real**

| Gap | What is missing |
|---|---|
| Money movement | Gifts are recorded and posted to the ledger, but **no card is charged**. No processor credentials. |
| OCR | The parser reads text. Scanned PDFs and images need a document-AI service in front of it. |
| Staff identity | Demonstration credentials and a static TOTP code, not SSO. |
| Market data | Security prices are a seeded table with a re-mark function, not a live quote feed. |
| LLM narration | Off until a key is configured. The deterministic engine carries every feature meanwhile. |
| The data itself | All figures are generated sample data, not the Foundation's records. |

---

## Sequenced plan — approximately twenty weeks

Phases overlap deliberately. Payments and identity are the long poles; the data platform migration
must land first because everything else depends on it.

### Phase 1 · Weeks 1–4 — Data platform

Move from the embedded SQLite file to **Azure Database for PostgreSQL Flexible Server** with
zone-redundant HA, 35-day point-in-time restore and geo-redundant backup. The schema ports as
written — `db.js` is the only file that changes — but migrations must run through a versioned tool
(Flyway, node-pg-migrate) so every environment is reproducible. Add a read replica so a long
analytical query can never block a gift being posted.

`PostgreSQL Flexible Server, HA + PITR` · `versioned migrations in CI` · `read replica for reporting`
· `row-level security by role` · `nightly logical backup to immutable storage`

### Phase 2 · Weeks 3–8 — Payments

Connect Stripe (cards, ACH), PayPal/Braintree (PayPal, Venmo), The Giving Block (crypto) and DAF
Direct with live credentials. Three things matter more than the integration itself:

1. **Webhook signature verification** on every callback.
2. **Idempotency keys**, so a retried webhook cannot double-post a gift to the ledger.
3. **Ledger posting moves behind the webhook**, not the HTTP request — a gift is recorded when the
   processor confirms settlement, not when the browser says so.

Then daily automated reconciliation against the processor payout file, and refund/chargeback
handling that reverses the journal entry rather than deleting it.

### Phase 3 · Weeks 5–10 — Identity and secrets

Microsoft Entra ID SSO for staff with enforced MFA and conditional access; SCIM provisioning so a
leaver loses access the day they leave. Donors move to passwordless email OTP with optional
passkeys. Every secret moves to **Azure Key Vault behind a managed identity** — no connection
string or API key in an app setting, which is where they live today.

### Phase 4 · Weeks 8–14 — Document pipeline

The extraction engine works; ingestion of real documents does not. Put **Azure AI Document
Intelligence** (or Google Document AI) ahead of the existing pipeline. Blob storage under
customer-managed keys, malware scanning on upload, signed-URL downloads. Capture reviewer
corrections as labelled training data from day one — that data is the moat.

### Phase 5 · Weeks 10–16 — Accounting hardening

A production ledger needs **period close**: lockable accounting periods, a formal reversal workflow
instead of deletion, maker–checker approval on manual entries above a threshold, and a complete
audit package export. Add multi-currency with daily FX rates — roughly a fifth of gifts arrive from
outside the United States — and automate the Form 990 and Schedule A/B extracts.

### Phase 6 · Weeks 12–18 — AI governance

Azure OpenAI inside the Foundation tenant: content filtering, private endpoint, zero data
retention. **The deterministic engine stays as the floor**, so a model outage degrades the product
rather than breaking it. Add prompt-injection defences on document text (an uploaded will is
untrusted input), a golden-set evaluation suite in CI, per-donor opt-out of AI processing, and human
review of every AI-influenced figure before it reaches a board report.

### Phase 7 · Weeks 14–20 — Operations and assurance

Application Insights with distributed tracing; alerting on gift-posting failure and — critically —
**ledger imbalance**. A documented runbook and on-call rota. Load testing to the campaign-launch
peak. Then the external work: SOC 2 Type II readiness, an independent penetration test, a
third-party WCAG 2.1 AA audit, and a DPIA covering GDPR (European donors) and CCPA (Californian).

---

## Indicative running cost

| Component | Service | Monthly |
|---|---|---|
| Application hosting | App Service P1v3, 2 instances, zone redundant | $290 |
| Database | PostgreSQL Flexible Server, HA, 2 vCore + replica | $480 |
| Document storage | Blob with customer-managed keys, ~500 GB | $45 |
| OCR | Document Intelligence, ~2,000 pages/month | $65 |
| Language model | Azure OpenAI, metered | $220 |
| Identity | Entra ID P1, 40 staff seats | $240 |
| Observability | Application Insights + Log Analytics | $120 |
| Edge and secrets | Key Vault, Front Door, WAF | $260 |
| **Indicative total** | | **~$1,720 / month** |

Excludes payment processing fees (~2.2% + 30¢ on cards, materially less on ACH) and one-off
assurance: a SOC 2 Type II audit plus an independent penetration test typically run
**$45,000–$80,000** in the first year.

---

## Team to deliver it

| Role | Commitment |
|---|---|
| Full-stack engineer (lead) | Full time, 20 weeks |
| Backend/integrations engineer | Full time, weeks 3–18 |
| Cloud/platform engineer | Half time, 20 weeks |
| Nonprofit accountant (SME) | Two days a week, weeks 8–16 |
| Planned-giving officer (SME) | One day a week throughout |
| QA and accessibility | Half time, weeks 10–20 |
| Security and compliance lead | Half time, weeks 12–20 |

---

## The three things that would worry an auditor most

1. **Idempotency on money.** Until webhooks are idempotent, a processor retry can post a gift twice.
   This is the single highest-risk gap.
2. **Period close.** Without lockable periods, a prior-year figure can change after the statements
   have been issued. Every accountant will ask about this first.
3. **Secrets in app settings.** Functional today, indefensible in an audit. Key Vault is not
   optional.

Everything else on this list is important. Those three are blocking.
