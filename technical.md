# Palius / CHAK Social Media OS — Technical Document

**Version:** 2.0
**Product:** Palius Social Media OS (formerly CHAK / OpenClaw)
**Supersedes:** v1.0 (26 Jul), which specified a Node.js + Hono + Drizzle + BullMQ
stack. That stack was never built. This document describes the system as it
actually exists.

---

## 1. Technology Stack

### 1.1 Frontend — `apps/frontend`

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15 (App Router) | React framework |
| React | 19 | UI runtime |
| TypeScript | 5.7 | Type safety |
| Tailwind CSS | 3.4 | Styling, driven by a semantic token layer |
| lucide-react | 0.546 | Icon set |
| motion | 12 | Animation |
| `@google/genai` | 2.4 | Client-side Gemini calls from the Next API routes |

State is local React state lifted to `app/page.tsx`. There is no Redux/Zustand
and no TanStack Query — the app has one screen tree and a small number of
fetches, so a state library would be overhead. Revisit if server state grows.

### 1.2 Admin — `apps/admin`

Same stack as the frontend. Deployed as a **separate** Next.js project so it can
be locked behind its own auth and never shares a bundle with customer-facing
code.

### 1.3 Backend — `apps/backend`

| Technology | Version | Purpose |
|------------|---------|---------|
| Go | 1.25 | Runtime |
| Gin | 1.12 | HTTP framework |
| `database/sql` | stdlib | Data access — no ORM |
| `modernc.org/sqlite` | 1.55 | Local dev database (pure Go, no cgo) |
| `jackc/pgx/v5` | 5.10 | Production database driver (Neon) |

### 1.4 Infrastructure

| Service | Provider | Purpose |
|---------|----------|---------|
| Frontend hosting | **Vercel** | `apps/frontend` |
| Admin hosting | **Vercel** | `apps/admin`, separate project |
| API hosting | **Render** | `apps/backend`, Docker runtime |
| Database | **Neon** | Serverless Postgres, branch-per-environment |
| LLM APIs | Gemini / OpenAI / Anthropic / DeepSeek / OpenRouter / Ollama | Provider-agnostic |

See `DEPLOYMENT.md` for the full deploy procedure.

---

## 2. Repository Structure

A plain monorepo. **No Turborepo** — three apps with independent build
pipelines and no shared packages yet, so a build orchestrator would add
configuration without saving anything.

```
chak-os/
├── apps/
│   ├── frontend/          # Next.js 15 — customer UI
│   │   ├── app/           # App Router: layout, page, globals.css, api/
│   │   ├── components/    # 17 view + modal components
│   │   ├── lib/           # api.ts, types.ts, mockData.ts, date.ts
│   │   └── public/palius-logo/
│   ├── admin/             # Next.js 15 — operator dashboard
│   │   ├── components/    # AdminPanelView, EconomicsDashboard
│   │   └── lib/api.ts
│   └── backend/           # Go + Gin
│       ├── main.go              # routing, CORS allowlist, admin auth
│       ├── db.go                # SQLite/Postgres dialect layer
│       ├── usage.go             # schema, seeding, legacy usage queries
│       ├── models.go            # request/response types
│       ├── handlers.go          # context, analyze, generate, viral, analytics
│       ├── ai.go                # provider-agnostic LLM client
│       ├── fallback.go          # deterministic data when no API key is set
│       ├── scraper.go           # website context scraping
│       ├── pricing.go           # rate card + cost engine
│       ├── catalog.go           # image/video model catalog with quality scores
│       ├── plans.go             # plan catalog + unit economics
│       ├── metering.go          # credit ledger, reserve/commit/fail
│       ├── billing.go           # customer-facing billing endpoints
│       ├── admin.go             # legacy admin endpoints
│       ├── admin_economics.go   # business monitoring endpoints
│       ├── publishing.go        # built-in blog destination adapters
│       ├── destinations.go      # user-defined destinations + Product Hunt
│       ├── publishing_routes.go # publishing HTTP layer
│       └── economics_test.go    # guard tests on the business model
├── render.yaml            # Render blueprint for the backend
├── DEPLOYMENT.md          # Vercel + Render + Neon procedure
├── PRD.md  architecture.md  srs.md  technical.md
└── docker-compose.yml     # local full-stack via Docker
```

---

## 3. Key Technical Decisions

### 3.1 Why Go + Gin over Node + Hono

- **Concurrency.** Fan-out publishing hits N platform APIs at once; goroutines
  make that trivial and cheap.
- **Single static binary.** The Render image is ~20MB from `scratch`-adjacent
  Alpine, with no `node_modules` and no runtime install step.
- **Memory ceiling.** A Render `starter` instance is 512MB. Go's footprint
  leaves room for the browser workers that will sit alongside it.
- **Cost.** Long-lived AI requests hold a connection for seconds. Goroutines
  cost ~2KB each; Node needs the event loop free.

The v1.0 argument for Hono was edge-readiness. This backend cannot run on an
edge runtime anyway — it needs persistent connections, a Playwright pool, and a
job queue — so the premise did not hold.

### 3.2 Why `database/sql` over an ORM

- The whole data layer is ~15 tables of straightforward SQL.
- The credit ledger needs exact, auditable SQL. An ORM's query generation is a
  liability when the output is someone's invoice.
- The dialect layer (§4) is 120 lines and does everything an ORM would have
  been used for here.

### 3.3 Why credits only for image and video

Marginal cost per operation differs by four orders of magnitude:

| Operation | Vendor cost |
|---|---|
| One caption (Gemini Flash) | ~$0.0001 |
| One blog draft (Sonnet, 2k in / 3k out) | ~$0.051 |
| One image (Imagen 3) | ~$0.030 |
| One 8s video clip (Veo 3 Fast, 1080p + audio) | **~$2.20** |

Metering the cheap operations teaches customers to fear the product for no
commercial gain. Text — including **blog and micro-blog writing** — is a fixed
COGS line covered by the subscription. Only generation is metered. See §7.

### 3.4 Why a two-phase reserve/commit meter

Estimates and reality diverge: a request for 8 seconds can return 9.2. Charging
the estimate eats the difference on every overrun. Reserve holds credits before
dispatch; commit prices the units the vendor actually reported.

### 3.5 Why Playwright (unchanged from v1.0)

Stealth, modern async API, active maintenance. **Not yet implemented** — see §12.

---

## 4. Database Dialect Layer

`db.go` lets the same binary run on SQLite locally and Postgres in production.

```go
// Local dev has zero setup; production is Neon. The two disagree on enough
// syntax that the difference is handled explicitly rather than hoped away.
func openDatabase() *DB {
    url := env("DATABASE_URL", "")
    if url == "" { url = env("POSTGRES_URL", "") }

    if url != "" {
        activeDialect = dialectPostgres
        if !strings.Contains(url, "sslmode=") { url += "?sslmode=require" }
        conn, err := sql.Open("pgx", url)
        // Neon pools at the proxy; a small local pool avoids exhausting
        // the branch's connection limit.
        conn.SetMaxOpenConns(envInt("DB_MAX_CONNS", 10))
        return &DB{conn}
    }

    activeDialect = dialectSQLite
    conn, _ := sql.Open("sqlite", env("PALIUS_DB", "palius.db"))
    conn.SetMaxOpenConns(1) // SQLite is single-writer
    return &DB{conn}
}
```

Three differences are abstracted:

| Concern | SQLite | Postgres | Handled by |
|---|---|---|---|
| Placeholders | `?` | `$1, $2` | `rebind()` — skips `?` inside string literals |
| Types | `INTEGER … AUTOINCREMENT`, `DATETIME`, `REAL` | `BIGSERIAL`, `TIMESTAMPTZ`, `DOUBLE PRECISION` | `ddl()` |
| Date slicing | `substr(col,1,10)` | `to_char(col,'YYYY-MM-DD')` | `dayExpr()` |

`DB` and `Tx` wrap `*sql.DB`/`*sql.Tx` so call sites keep writing `?`.

---

## 5. Cost Engine

`pricing.go`. Three numbers per operation, all recorded:

1. **Vendor cost** — what the provider bills us.
2. **Billable** — `(vendor + failure pad) × markup`.
3. **Credits** — billable ÷ `CreditValueUSD`, **always rounded up**.

```go
const CreditValueUSD = 0.01   // 1 credit = $0.01 retail

// Text carries no markup — it is never billed in credits. 1.0 means
// "record at cost" so text still shows truthfully in COGS reporting.
TextMarkup:  1.0
ImageMarkup: 3.0
VideoMarkup: 2.5
FailureAllowance: 0.15   // ~15% of media jobs get paid for twice
```

### 5.1 Unit models

| Modality | Priced by | Dimensions |
|---|---|---|
| Text | 1M tokens, **input and output separately** | model |
| Image | per image | model, quality tier |
| Video | **per second** | model, resolution multiplier, audio, min-billable seconds |

Output tokens cost 3–5× input. The v1 ledger used one blended rate, which
undercounted every output-heavy job — blog writing worst of all.

### 5.2 The unknown-model rule

An unpriced model is billed at the **most expensive known rate** for its
modality, never at zero:

```go
per, audio, mult, minSecs = mostExpensiveVideoRate(rc)
out.Explanation = fmt.Sprintf(
    "unknown video model %q — billed at the most expensive known rate "+
    "($%.2f/s) so it cannot be under-charged; add it to the rate card", ...)
```

Without this, integrating a new provider silently gives away unlimited video.
`TestUnknownModelIsNeverFree` locks it in.

### 5.3 Runtime overrides

`PALIUS_RATE_CARD` points at a JSON file that overrides any subset of the built-in
card. Vendor price changes apply without a redeploy. The admin dashboard shows
live values and a `verifiedOn` date per model.

---

## 6. Generation Model Catalog

`catalog.go` scores every image/video model on quality, prompt adherence, text
rendering, and speed, then computes **efficiency = quality ÷ cost** and sorts by
it. Models are tiered `draft | standard | premium`.

`RecommendModel(modality, intent)` picks a default from the intent — exploring
variations routes to draft tier, rendering a final routes to standard/premium.
This is the largest single lever on COGS: users discard ~8 of 10 explorations,
and rendering those on Veo 3 instead of Runway Turbo costs 4× for output that
was always going to be thrown away.

**Model choice is not restricted on paid plans.** The markup is the margin
protection; an allowlist would only be packaging and would stop customers using
what they came for. An expensive model simply draws credits down faster.

### 6.1 Image models

| Model | ~$/image | Quality | Text-in-image | Tier |
|---|---|---|---|---|
| SDXL | 0.002 | 5 | 2 | draft |
| FLUX.1 [schnell] | 0.003 | 6 | 3 | draft |
| FLUX.1 [dev] | 0.025 | 8 | 5 | standard |
| Imagen 3 | 0.030 | 9 | 7 | standard |
| Gemini 2.5 Flash Image | 0.039 | 9 | 7 | standard |
| Ideogram v3 | 0.040 | 8 | **10** | standard |
| Recraft v3 | 0.040 | 8 | 9 | standard |
| GPT Image 1 | 0.011–0.167 | 9 | 9 | premium |
| FLUX 1.1 Pro | 0.040 | 9 | 6 | premium |
| DALL·E 3 | 0.040–0.080 | 7 | 5 | premium |

For a social tool, **text rendering** decides more than raw aesthetics —
thumbnails and quote cards need legible words. Hence Ideogram and GPT Image 1
outrank prettier models.

### 6.2 Video models

| Model | ~$/sec | 8s clip | Quality | Audio | Tier |
|---|---|---|---|---|---|
| Wan 2.2 | 0.03 | $0.24 | 5 | – | draft |
| Runway Gen-3 Turbo | 0.09 | $0.72 | 7 | – | draft |
| Kling 2.5 | 0.12 | $0.96 | 8 | – | standard |
| Veo 3 Fast | 0.15 | $1.20 | 9 | ✓ | standard |
| Sora 2 | 0.30 | $2.40 | 9 | ✓ | premium |
| Veo 3 | 0.40 | $3.20 | 10 | ✓ | premium |

Veo 3 Fast is the value pick: native audio removes a music-licensing and editing
step for a third of full Veo's price.

> All figures are public list prices captured for planning. **Verify before
> invoicing.** They are overridable at runtime (§5.3).

---

## 7. Metering

`metering.go`. Two invariants:

- **I1 — no operation is ever sold below vendor cost.** `assertProfitable()`
  checks the *effective* markup at charge time against `MinMarkup = 1.5`.
- **I2 — no credit is spent that the customer does not have.** Credits are
  reserved before dispatch.

### 7.1 Lifecycle

```
POST /media/estimate   cost preview, no writes
POST /media/reserve    hold credits → operationId
                       402 if short · needsConfirm if > plan threshold
   … provider does the work …
POST /media/commit     price ACTUAL units, release hold, charge
POST /media/fail       release hold; vendor cost booked to the house
```

### 7.2 Append-only ledger

Balance is `SUM(delta)`, never an `UPDATE` on a balance column. Two concurrent
generations cannot race a lost update, and every dispute has an audit trail.

| Entry kind | Sign | Meaning |
|---|---|---|
| `grant` | + | monthly plan allowance (idempotent per period) |
| `purchase` | + | credit pack |
| `hold` | − | reserved for an in-flight operation |
| `release` | + | hold released on commit or failure |
| `charge` | − | actual consumption |
| `refund` / `adjust` | ± | goodwill, manual correction |

### 7.3 Failed generations

Providers often bill for generations that error out. That cost is real but is
**not** the customer's fault, so it is booked to the house — funded by the
`FailureAllowance` already inside every price — and surfaced in the admin
dashboard so the true cost of failure is visible.

### 7.4 Other guards

- **Idempotency.** A repeated `idempotencyKey` returns the original operation;
  retries are free.
- **Suspended accounts** cannot spend, including credits granted before
  suspension.
- **Hard monthly caps** on video seconds and image count sit above credits as an
  abuse ceiling. Credits normally bind first.

---

## 8. Plans & Unit Economics

`plans.go`. Allowances are sized so **100% consumption still clears the margin
target**, worked here for Creator:

```
revenue                                $49.00
COGS budget at 70% target margin       $14.70
  less assumed text/blog vendor spend  −$3.00
  = media vendor budget                $11.70
× video markup (2.5)                   $29.25 billable
÷ credit value ($0.01)                 2,925 → 2,900 credits
```

| Plan | Price | Credits | Max cost | Worst-case margin | Buys |
|---|---|---|---|---|---|
| Free | $0 | 0 | $0.60 (text only) | — | no generation |
| Solo | $19 | 1,000 | $5.50 | 71.0% | ~3 clips / ~95 images |
| Creator | $49 | 2,900 | $14.60 | 70.2% | ~10 budget clips, ~4 premium, ~280 images |
| Business | $149 | 9,600 | $44.40 | 70.2% | ~33 / ~15 / ~927 |
| Agency | $499 | 33,000 | $147.00 | 70.5% | ~113 / ~52 / ~3,188 |

Per-operation margin runs **65% on video, 71% on images**.

**Free gets zero generation.** Text is cheap enough to give away; one image is
~100× a caption and one clip ~5,000×. The wall lands exactly at the expensive
operations, which is also the sharpest upgrade prompt available.

### 8.1 Credit packs

| Pack | Credits | Price | Our cost | Margin |
|---|---|---|---|---|
| 1k | 1,000 | $12 | $4.00 | 66.7% |
| 5k | 5,000 | $55 | $20.00 | 63.6% |
| 15k | 15,000 | $150 | $60.00 | 60.0% |

Priced above the implied plan rate: top-ups should be more profitable than
allowance, and they do not expire.

### 8.2 Guard tests

`economics_test.go` fails CI if anyone makes the business lose money:

- `TestEveryOperationIsProfitable` — every model × quality × duration × resolution
- `TestUnknownModelIsNeverFree`
- `TestEveryPaidPlanClearsMarginTarget`
- `TestOverageAndPacksPriceAboveCost`
- `TestTextIsNeverCharged`
- `TestCreditsAlwaysRoundUp`

---

## 9. Blog Publishing

`publishing.go` + `destinations.go`. Blog **writing** is subscription-covered;
this is about delivery.

### 9.1 Built-in adapters

| Destination | Auth | Canonical | Notes |
|---|---|---|---|
| dev.to | API key | ✓ | Tags must be lowercase alphanumeric; max 4 |
| Hashnode | API key | ✓ | GraphQL; needs `publicationId` |
| LinkedIn | OAuth | – | UGC API; no native long-form endpoint, posts intro + link |
| Reddit | OAuth | – | Requires explicit subreddit; posts a discussion, never an advert |
| Medium | API key | ✓ | Integration tokens frozen; best-effort, falls back to export |
| Own site | webhook | ✓ | Should be the canonical home for every article |

Cross-posting without `canonical_url` splits SEO across sites. Every adapter
that supports it points back at the owner's own domain.

### 9.2 Product Hunt

Product Hunt's GraphQL v2 API is **read-only for launches** — submissions are
manual by design. Pretending otherwise fails at 12:01am PT on launch day. The
adapter therefore does two honest things:

- `POST /publish/producthunt-kit` → tagline (60 char), description (260 char),
  maker's first comment, topics, gallery specs, and a timing checklist.
- `fetchProductHuntStats(slug)` → live votes/comments for tracking, and
  competitor launches feeding the viral-research view.

### 9.3 User-defined destinations

The built-in list is **not** the boundary. Three escape hatches:

1. **API mapping** — describe any REST endpoint as JSON: endpoint, auth header,
   field-name mapping, optional wrapper key, dotted path to the response URL.
   No code, no deploy.
2. **Browser session** — no API? Log in through the embedded browser; the
   encrypted session plus CSS selectors drive the compose form. This is the
   Level 3 connector model applied to blogs. Requires the Playwright worker.
3. **Export** — nothing works, so return a formatted draft rather than lose the
   writing. This is also what every unconfigured built-in adapter does.

Definitions live in `custom_destinations` and are read per request, so a new
destination is live immediately.

---

## 10. Database Schema (as built)

```sql
users (id, name, plan, status, token_quota, credit_quota, created_at)

usage_events (id, user_id, task_type, provider, model,
              input_tokens, output_tokens, credit_units, cost_usd,
              units, unit_kind, vendor_cost_usd, billable_usd,
              margin_usd, operation_id, created_at)

credit_ledger (id, user_id, entry_kind, delta, operation_id, reason, created_at)

operations (id, user_id, idempotency_key UNIQUE, state, modality, model,
            provider, intent,
            est_units, est_credits, est_vendor_usd,
            actual_units, unit_kind, actual_vendor_usd,
            charged_credits, billable_usd, margin_usd,
            vendor_billed_on_failure, error, created_at, settled_at)

margin_alerts (id, user_id, operation_id, model,
               vendor_usd, billable_usd, detail, created_at)

custom_destinations (id, user_id, name, kind, mode, config_json,
                     enabled, created_at, updated_at)
```

Schema is created on boot with `CREATE TABLE IF NOT EXISTS`; column additions
use tolerant `ALTER TABLE`. **Not yet built** (specified in `architecture.md`):
`organizations`, `org_members`, `connected_accounts`, `contents`,
`scheduled_posts`, `engagements`, `analytics_snapshots`, `brand_profiles`,
`connector_scripts`.

---

## 11. API Surface

Base: `/api/v1`

**Public**
```
GET  /health                    GET  /config
POST /context                   POST /content/analyze
POST /content/generate          POST /viral/research
GET  /analytics/:platform
```

`POST /context` takes any of `description`, `websiteUrl`, `documents[]` — one is
enough. A `websiteUrl` is scraped (`scraper.go`) and becomes the source of truth
about the product; it is optional, not required.

`POST /content/generate` takes `outputMode`: `social` | `blog` | `both`. In
`blog` mode it returns an empty `variants` array — nothing is written for or
posted to social platforms. Both `/context`, `/content/analyze` and
`/content/generate` return `requestedAssets[]` (`type`, `reason`, `required`,
`for`): what the AI still needs from the owner. It asks rather than substituting
a visual it was never given, and `required` entries block publishing.

**Billing & generation**
```
GET  /billing/plans             GET  /billing/packs
GET  /billing/balance           GET  /billing/models
POST /media/estimate            POST /media/reserve
POST /media/commit              POST /media/fail
GET  /media/operations
```

**Publishing**
```
GET  /publish/destinations      POST /publish/blog
POST /publish/producthunt-kit
GET  /destinations/custom       POST /destinations/custom
```

**Admin** — all require `Authorization: Bearer $ADMIN_TOKEN`
```
GET  /admin/business            GET  /admin/models
GET  /admin/economics           GET  /admin/operations
GET  /admin/alerts              GET  /admin/ratecard
GET  /admin/plans               GET  /admin/overview
GET  /admin/users               GET  /admin/users/:id/usage
PUT  /admin/users/:id           POST /admin/users/:id/credits
GET  /admin/usage               GET  /admin/daily
GET  /admin/providers
```

---

## 12. Security — Built vs Specified

### Built

- **Admin auth.** `ADMIN_TOKEN` bearer, constant-time compare. Refuses all
  requests if unset while `APP_ENV=production`.
- **CORS allowlist.** `ALLOWED_ORIGINS` is exact-matched and reflected with
  `Vary: Origin`. Reflecting an arbitrary origin alongside
  `Allow-Credentials: true` is equivalent to no CORS policy at all.
- **TLS to Neon** forced via `sslmode=require`.
- **Security headers** on both Vercel apps; admin is `noindex`.

### NOT built — required before public launch

- **End-user authentication.** `userId()` reads the `X-User-Id` header with no
  verification. Anyone can act as anyone. SRS §3.1 (FR-1…FR-11) specifies
  email/password, JWT, MFA, and RBAC; none exists.
- **Multi-tenancy.** No `organizations`/`org_members`, no roles, no seat
  enforcement — despite plans selling 3/10/50 seats.
- **AES-256-GCM session encryption** for browser cookies.
- Rate limiting, audit log, secret rotation.

---

## 13. Not Yet Implemented

Specified in `architecture.md` / `srs.md`, absent from the code:

| Component | Impact |
|---|---|
| Playwright browser engine, session capture, WebSocket streaming | Level 3 connectors are UI-only |
| Redis + job queue | No scheduled publishing; the calendar is display-only |
| Media object storage (S3/R2/Cloudinary) | Generated video has nowhere to live |
| pgvector brand embeddings | Brand learning is prompt-only |
| Transactional email | No notifications |
| Payment provider (Stripe) | Plans are modelled and enforced but not *sold* |

The Playwright worker needs a host with real Chromium — neither a Vercel
function nor a Render `starter` instance qualifies. Plan on a separate Render
private service or a small VM.

---

## 14. Performance Notes

- AI calls: 90s client timeout; every endpoint degrades to deterministic
  fallback data when no key is configured, so the UI always works.
- Publishing HTTP client: 30s timeout, bounded so a hung publish cannot pin a
  request.
- SQLite runs at `MaxOpenConns(1)` (single-writer); Postgres at 10/5.
- Admin dashboard polls every 30s.
- Frontend first-load JS: ~151KB. Admin: ~113KB.
