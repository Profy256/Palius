# Palius / CHAK — AI Social Media Operating System

An AI-powered platform that helps solo developers, startups without marketing
teams, small marketing teams, businesses and influencers run their entire social
media presence from one dashboard. One upload, adapted and published everywhere
it fits.

> **Pending rename:** Palius — "Grow your audience with Palius."

## Repository Layout

| App | Path | Stack | Local port |
|-----|------|-------|------|
| **Frontend** | `apps/frontend/` | Next.js 15 (App Router), React 19, Tailwind | 3000 |
| **Backend** | `apps/backend/` | Go 1.25 + Gin, Postgres/SQLite | 8080 |
| **Admin** | `apps/admin/` | Next.js 15, standalone operator dashboard | 3001 |

```
apps/
  frontend/   # Dashboard, create flow, calendar, social hub, AI hub, analytics
  backend/    # AI, cost engine, credit metering, publishing, admin monitoring
  admin/      # Business health, model spend, customer profitability, rate card
PRD.md            # Product requirements (v1.2)
architecture.md   # System architecture
srs.md            # Software requirements specification
technical.md      # Technical document (v2.0)
DEPLOYMENT.md     # Vercel + Render + Neon
render.yaml       # Render blueprint
```

---

## Billing model — read this first

**The subscription covers the platform. Credits cover generation only.**

| Unmetered, included in every plan | Metered in credits |
|---|---|
| Captions, hooks, hashtags, titles | **AI image generation** |
| **Blog & micro-blog writing** | **AI video generation** |
| Publishing to every destination | |
| Analysis, scoring, viral research | |
| Comment auto-reply, DM assistant | |
| Scheduling, calendar, analytics | |

Why: one caption costs ~$0.0001 of vendor spend; one 8-second video clip costs
~$2.20. Metering the cheap things teaches customers to fear the product.

| Plan | Price | Credits | Roughly buys |
|---|---|---|---|
| Free | $0 | 0 | No generation — everything else included |
| Solo | $19 | 1,000 | ~3 clips or ~95 images |
| Creator | $49 | 2,900 | ~10 budget clips, ~4 premium, ~280 images |
| Business | $149 | 9,600 | ~33 / ~15 / ~930 |
| Agency | $499 | 33,000 | ~113 / ~52 / ~3,190 |

Every plan clears **70% gross margin even at 100% allowance consumption**.
Per-operation margin is 65% on video, 71% on images. `go test ./...` fails the
build if a change makes any operation or plan lose money.

---

## Getting Started

### Option A — Docker

```bash
cp .env.example .env          # optional: add an AI key
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| App | http://localhost:3000 |
| Admin | http://localhost:3001 |
| API | http://localhost:8080/api/v1 |

### Option B — Local dev

```bash
# 1. Backend (SQLite, no setup needed)
cd apps/backend && go mod tidy && go run .

# 2. Frontend
cd apps/frontend && npm install && npm run dev     # :3000

# 3. Admin
cd apps/admin && npm install && npm run dev        # :3001
```

Without an AI key the backend serves deterministic fallback data, so the whole
UI works on a clean checkout.

### Verify

```bash
cd apps/backend  && go build ./... && go vet ./... && go test ./...
cd apps/frontend && npm run lint && npm run build
cd apps/admin    && npm run lint && npm run build
```

---

## Configuration

Set `AI_PROVIDER=auto` and any one key — Gemini, OpenAI, Anthropic, DeepSeek,
OpenRouter, or an Ollama / OpenAI-compatible endpoint.

Production also wants:

```env
DATABASE_URL=postgresql://...   # Neon pooled string; SQLite is used if unset
APP_ENV=production
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
ADMIN_TOKEN=                    # guards /api/v1/admin/*
PALIUS_RATE_CARD=/path/to.json  # optional vendor-price override, no redeploy
```

Blog destinations are all optional — an unconfigured one returns a formatted
export instead of failing: `DEVTO_API_KEY`, `HASHNODE_API_KEY` +
`HASHNODE_PUBLICATION_ID`, `LINKEDIN_ACCESS_TOKEN` + `LINKEDIN_AUTHOR_URN`,
`REDDIT_ACCESS_TOKEN`, `MEDIUM_TOKEN` + `MEDIUM_USER_ID`, `PRODUCTHUNT_TOKEN`,
`OWN_SITE_WEBHOOK_URL`.

---

## Key Features

- **TikTok-style create flow** — upload media, prompt like Gemini; website URL
  for digital products, product context (PDF/DOC/MD/photos), the AI asks when it
  lacks context, optional companion blog
- **Viral research** — content ideas, posting styles and virality tactics per
  platform
- **Per-platform analytics**, competitor tracking, performance coach
- **Engagement hub + DM lead qualification**
- **AI image & video generation** with a cost-scored model catalog; exploration
  routes to cheap models, finals to premium
- **Exact metering** — credits reserved on estimate, reconciled against the
  units the provider actually returned
- **Blog publishing** — dev.to, Hashnode, LinkedIn, Reddit, Medium, own site,
  plus a Product Hunt launch kit
- **Extensible everywhere** — add any social platform or blog destination
  yourself, via JSON API mapping or embedded-browser login. Stored in the
  database, live immediately, no deploy
- **Admin dashboard** — MRR, gross margin, per-model spend, per-customer
  profitability, live operations, margin alerts, live rate card

---

## Deployment

Vercel (frontend + admin) · Render (Go API) · Neon (Postgres).
See **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## Status

**Not production-ready.** Two blockers:

1. **No end-user authentication.** `userId()` reads an unverified `X-User-Id`
   header — anyone can act as any user.
2. **No multi-tenancy.** No organisations, roles or seat enforcement, despite
   plans selling 3/10/50 seats.

Also not yet built: Playwright browser engine and session encryption (Level 3
connectors are UI-only), Redis job queue (no scheduled publishing), media object
storage, payment provider. See the Build Status section of `PRD.md`.
