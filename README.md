# SANKALPA — The Gurudev Legacy Endowment Platform

*Sankalpa* (संकल्प) is the Sanskrit word for a sacred intention held in the heart — the vow you make
to yourself about the world you wish to leave behind. That is exactly what a legacy gift is.

**Live:** https://sankalpa.azurewebsites.net

A donor legacy and financial stewardship platform built to the Sri Sri Gurudev Ravishankar
Foundation SRS, powering a $45,000,000 permanent endowment campaign for the Art of Living
Foundation's humanitarian and educational work in 180 countries.

> *"Unless we have a stress-free mind and a violence-free society, we cannot achieve world peace."*
> — Gurudev Sri Sri Ravi Shankar

---

## The two halves

| Part | Audience | Access |
|---|---|---|
| **Donor Hub** — giving, planned giving, calculators, document vault, impact dashboard | Donors and the public | Open; account optional |
| **Fund Accounting & Financial Management Portal** — GAAP ledger, statements, actuarial forecast, stewardship, CRM, compliance | Finance, admin, board, legal, auditors | Password + TOTP MFA, role-gated |

Both halves share one database and one API. A gift made on the public site writes its own balanced
double-entry journal entry in the same instant — there is no re-keying and no reconciliation gap.

---

## Architecture

```
Browser (React 18 + Vite SPA, hand-written CSS design system)
        │  fetch /api/*
Express (Node 22)  ── actuarial.js   SSA mortality, IRS §7520, CRT/CGA, NPV scenarios
                   ── ai.js          document NER, donor scoring, NL analytics, case triage
                   ── partners.js    IRA / stock / insurance modules, consultant panel
                   ── stewardship.js rules engine → dated, deduplicated tasks
                   ── db.js          schema, audit trail, double-entry guard
SQLite (WAL) at /home/data/sankalpa.db  — Azure App Service persistent storage
```

**Hosting:** Azure App Service Linux (B1, West US 2), `always_on` enabled, Node 22 LTS.

### Why SQLite

The database file lives on App Service persistent storage, runs in WAL mode with foreign keys
enforced, and survives restarts and redeploys. Every gift, journal line, document, interaction and
audit event is written durably and never hard-deleted. For a workload of this shape — one writer,
many readers, strict transactional integrity — it is the right tool. The schema is plain SQL and
ports to PostgreSQL (the SRS target) without a rewrite; `db.js` is the only file that changes.

---

## Database — 22 tables, all history retained

Implements SRS §6 in full:

`users` · `donors` · `pledges` · `transactions` · `documents` · `planned_gifts` · `accounts`
· `journal_entries` · `journal_lines` · `funds` · `fixed_assets` · `audit_log` · `complex_cases`
· `consultants`

Plus the operational tables this platform adds:

`interactions` (automated CRM log) · `stewardship_tasks` · `security_prices` · `policy_premiums`
· `case_documents` · `mortality_table` · `investments` · `endowment_history` · `quotes`
· `system_config` · `ai_interactions`

**Integrity guarantees**

- Every journal entry is validated in a transaction: `SUM(debit) === SUM(credit)`, or the write is
  rejected. The API returns a 400 rather than persisting an unbalanced entry.
- `journal_lines` carries `CHECK` constraints so a line cannot be both a debit and a credit, and
  neither can be negative.
- `audit_log` is append-only — no code path updates or deletes a row.
- Financial and estate records are soft-deleted only (`deleted_at`), never destroyed. Estate
  documents carry a 99-year retention.

---

## The actuarial engine

Genuine mathematics, not illustration copy:

- **SSA period life tables** by age and gender, seeded to the database and interpolated.
- **IRS §7520 rate** as the base discount rate, held in `system_config` with an effective date.
- **Asset-class growth models** per SRS §3.6.2.
- **Risk spread** added to §7520 per asset class. The §7520 rate alone is correct for computing a
  donor's *deduction* (a risk-free legal calculation) but wrong for valuing a *pipeline* — an equity
  portfolio growing at 10.5% discounted at a risk-free 5.2% would value a future gift at several
  times face. The spread makes the discount risk-commensurate.
- **Realisation probability** by instrument. A revocable bequest is counted at 0.65; an irrevocable
  gift annuity at 0.99. A donor can amend a will at any time, and the pipeline should say so.
- **Three scenarios** — optimistic / base / pessimistic — varying growth, discount and longevity
  percentile together.

Calculators: bequest, retirement beneficiary, appreciated stock, life insurance, gift annuity
(ACGA schedule), and charitable remainder trust (CRUT and CRAT, with the IRS 10% minimum
remainder test enforced).

---

## The AI layer

Two tiers, and **every feature works on both**:

1. **LLM tier** — set `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_API_KEY` (or `OPENAI_API_KEY`, or
   `ANTHROPIC_API_KEY`) and a model narrates over database-computed facts.
2. **Deterministic tier (always on)** — a real rules-and-statistics engine, no key required.

Every figure the AI reports is computed from the ledger. The model, when enabled, only narrates —
it is never the source of a number.

| Capability | How it works |
|---|---|
| Estate document parsing | Legal-domain NER over wills and trusts: organisation beneficiary, percentage and fixed allocations (numeric and spelled), revocability, conditions, contingent beneficiaries, testator, effective date, account references. Per-entity confidence scoring; anything under 0.90 routes to a human review queue rather than into the donor record. |
| Donor propensity | RFM-style scoring over recency, monetary value, frequency, tenure, age band and existing commitments → a 0–100 score, band, and ranked next-best actions. |
| NL analytics | Intent-routed queries over the live ledger: campaign progress, pipeline by horizon, gift vehicles, funds, payment channels, geography, donors, pledges, year-over-year. |
| Complex case triage | Asset complexity × value → priority, required specialties, SLA, and a consultant licensed in the donor's state. |

---

## Partner integrations

| Partner | Purpose |
|---|---|
| [GoFundMe.org](https://www.gofundme.org) | Peer-to-peer and campaign fundraising (Foundation membership) |
| [DonateStock](https://www.donatestock.com) | Appreciated securities transfer in a few clicks |
| [FreeWill](https://www.freewill.com) | Free legally binding will and trust creation |
| Plaid | Bank authentication for ACH |
| The Giving Block | Cryptocurrency (60+ assets) |
| DAF Direct | Donor advised fund grant recommendations |

---

## Stewardship automation

A deferred gift matures over decades; the relationship has to survive that long. The rules engine
runs at boot and every six hours, evaluating every donor against seven triggers and materialising
dated tasks. Tasks are idempotent — `(donor, rule, due_date)` is unique, so re-running never
duplicates.

Triggers: birthday · first-gift anniversary · lapsing supporter · legacy conversation qualified ·
three-year estate document review · missing documentation · major gift acknowledgement (48h) ·
Legacy Circle milestone.

Completing a task writes a stewardship touch to the CRM automatically. Donor gifts, logins,
document uploads and case intakes all self-log — the platform runs at ~100% automated capture.

---

## The multi-state consultant panel

Estate law is state law, and no single firm is licensed nationwide. Rather than pretend otherwise,
the platform maintains a **panel** of 12 independent firms covering all ten states where the
Foundation's donors concentrate — CA, WA, DC, NC, GA, FL, TX, AZ, NY, NJ — and routes each case to
one licensed where the donor actually lives.

The donor **engages and pays the consultant directly.** The Foundation never pays for advice about a
gift to itself, which is precisely why that advice can be trusted. When the plan is signed, the
donor returns only the instrument and the allocation, and the platform tracks it in the pipeline
from there.

---

## Compliance

- **FASB ASC 958 / ASU 2016-14** — net asset classification (without restriction, purpose
  restricted, perpetual), statement of activities, statement of financial position.
- **PCI DSS SAQ A** — the schema contains no PAN, expiry or CVV column. Card data is tokenised by
  the processor and never reaches this server.
- **SOC 2 CC7.2** — immutable append-only audit trail with actor, role, IP, resource and result.
- **WCAG 2.1 AA** — keyboard operable, labelled fields, ≥4.5:1 body contrast, reduced-motion
  respected, content never gated behind an animation.
- **Retention** — audit log 7 years, financial records 7 years, estate documents 99 years.

Eight automated compliance checks run against the live database and are visible in the portal.

---

## Accessibility & the guided tour

**Maitri**, the floating guide, walks a visitor through all 18 steps of the platform: she navigates
the app, spotlights the element under discussion, and narrates using the browser's highest-quality
neural speech voice (ranked automatically; the visitor may override). Everything she says is also on
screen, so the tour works fully with sound off.

---

## Running locally

```bash
npm install
npm run seed          # build the demo campaign database
npm start             # http://localhost:8080
```

```bash
cd web && npm install && npm run build   # rebuild the SPA into ../public
```

### Environment

| Variable | Purpose |
|---|---|
| `PORT` | Listen port (default 8080) |
| `SANKALPA_DATA_DIR` | Database directory (defaults to `/home/data` on Azure) |
| `SANKALPA_RESEED` | Set to `1` to rebuild the demo database at boot |
| `SANKALPA_SECRET` | HMAC key for session tokens |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_DEPLOYMENT` | Enable LLM narration |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Alternative LLM providers |

### Demonstration credentials

Finance portal — password `Sankalpa2026!`, TOTP code `314159`:

| Email | Role |
|---|---|
| `finance@sankalpa.org` | Finance Director |
| `director@sankalpa.org` | Super Admin |
| `auditor@sankalpa.org` | Auditor (read-only) |
| `board@sankalpa.org` | Board Treasurer |

The donor hub opens a real supporter record via **"Open a sample supporter account."**

---

## Deploying to Azure

```bash
az group create -n sankalpa-rg -l westus2
az appservice plan create -g sankalpa-rg -n sankalpa-plan --is-linux --sku B1
az webapp create -g sankalpa-rg -p sankalpa-plan -n sankalpa --runtime "NODE|22-lts"
az webapp config set -g sankalpa-rg -n sankalpa --startup-file "node server/index.js" --always-on true
az webapp deploy -g sankalpa-rg -n sankalpa --src-path sankalpa.zip --type zip
```

---

## A note on the data

Campaign figures are internally consistent generated sample data — a deterministic seed builds 168
donors across 18 countries, ~1,500 transactions over four years, 74 planned gifts, and a general
ledger that balances to the cent. They are **not** the Art of Living Foundation's actual financial
records.

Quotations are drawn from gurudev.artofliving.org and the Foundation's published material; the
corpus should be replaced with the Foundation's own curated set before any public launch.

Nothing in this platform is legal or tax advice.
