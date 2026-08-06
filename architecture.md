# CHAK Social Media OS — Architecture

## Overview

**CHAK Social Media OS** is an AI-powered platform for managing social media presence across multiple platforms. It acts as an intelligent social media manager — publishing content, managing engagement, growing audiences, and analyzing performance.

Unlike traditional social media management tools that rely on official platform APIs, CHAK uses an **embedded browser engine** (Playwright) to interact with social platforms. Users log into their accounts through a browser built directly into the app. The session cookies are captured, encrypted, and stored in the database for reuse.

This means zero dependency on official APIs, no rate limits, no OAuth approval processes, and the ability to support **any platform that has a web interface** — including platforms not in the pre-defined list.

### Extensibility by Design

CHAK is built to be **modifiable and expandable** by the end user. If a platform is not in the supported list, the user can:

1. **Add it manually** — Give the platform a name and URL, log in through the embedded browser, and the system stores the session
2. **Use the generic connector** — For basic actions (posting text, reading notifications), the generic browser driver works out of the box
3. **Write a custom connector** — For advanced actions (uploading media, reading DMs, liking posts), advanced users can add a simple script with CSS selectors that the Playwright engine executes. Connectors are hot-loaded at runtime from the database — no code deploy needed.

The platform does not gatekeep what sites users can connect. Any website with a login form and content forms is automatable.

### Platform Action Cycle

CHAK operates on a continuous AI-driven cycle:
1. **Plan** — AI schedules the best times and plans content
2. **Create** — AI generates and improves captions, hashtags, hooks, thumbnails
3. **Publish** — Multi-platform publishing with AI-adapted formatting
4. **Analyze** — Performance analytics, competitor tracking, trend detection
5. **Engage** — AI reads and replies to comments, manages DMs, detects leads
6. **Learn** — Brand learning captures tone, style, audience preferences
7. **Improve** — AI recommends better strategies based on results

Each cycle iteration makes the AI smarter and marketing more effective.

---

## Hosting Strategy

| Layer | Provider | Status | Rationale |
|-------|----------|--------|-----------|
| Frontend | **Vercel** | Built | Edge-optimised Next.js, preview deployments, zero config |
| Admin panel | **Vercel** (separate project) | Built | Isolated bundle so it can be locked down independently |
| Backend (API) | **Render** (Docker) | Built | Managed containers, auto-deploy from Git, long-lived processes |
| Database | **Neon** (serverless Postgres) | Built | Branch-per-environment; preview deploys get their own data |
| Browser Engine | **Render** private service | *Not built* | Needs real Chromium — cannot run on Vercel or a `starter` instance |
| Job queue | **Redis** (Render Key Value / Upstash) | *Not built* | Required before scheduled publishing works |
| Media storage | **S3 / R2 / Cloudinary** | *Not built* | Generated video needs a home before that feature ships |

See `DEPLOYMENT.md` for the full procedure and `render.yaml` for the blueprint.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER (Vercel)                            │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    NEXT.JS APPLICATION                              │  │
│  │                                                                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  │  │
│  │  │ Dashboard   │  │ Social      │  │ AI Studio  │  │ Settings │  │  │
│  │  │ Shell       │  │ Media View  │  │ (content)  │  │ (org,    │  │  │
│  │  │             │  │             │  │            │  │  billing)│  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └──────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │  Embedded Browser (iframe / popup window)                    │  │  │
│  │  │  User logs into TikTok, Instagram, etc. right inside CHAK   │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                              │                                            │
│                              │ HTTPS/WSS                                   │
└──────────────────────────────┼────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────────────────┐
│                         API LAYER (Render)                                │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                        API GATEWAY                                   ││
│  │         Auth │ Rate Limit │ Request Logging │ WebSocket Manager     ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Auth     │ │ Content  │ │ Schedule │ │ Engage   │ │ Analytics    │  │
│  │ Service  │ │ Service  │ │ Service  │ │ Service  │ │ Service      │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐  │
│  │ Media    │ │ Billing  │ │ Report   │ │ Session Manager          │  │
│  │ Service  │ │ Service  │ │ Service  │ │ (encrypts/decrypts       │  │
│  └──────────┘ └──────────┘ └──────────┘ │  browser cookies)        │  │
│                                          └──────────────────────────┘  │
└──────────────────────────────┬────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────────────────┐
│                    BROWSER ENGINE LAYER (Render Workers)                   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                    Playwright Cluster                                 ││
│  │   Headless Chromium instances managed via browser pool               ││
│  │                                                                      ││
│  │  ┌────────────────┐ ┌────────────────┐ ┌────────────────────────┐   ││
│  │  │ Session        │ │ Action         │ │ Data Collection         │   ││
│  │  │ Capturer       │ │ Executor       │ │ Worker                  │   ││
│  │  │                │ │                │ │                         │   ││
│  │  │ User logs in → │ │ Injects        │ │ Navigates profiles,     │   ││
│  │  │ captures       │ │ cookies →      │ │ extracts followers,     │   ││
│  │  │ cookies +      │ │ posts content, │ │ reads comments,         │   ││
│  │  │ localStorage   │ │ replies to     │ │ collects analytics      │   ││
│  │  │                │ │ comments,      │ │ data → stores in DB     │   ││
│  │  │ → encrypts &   │ │ sends DMs,     │ │                         │   ││
│  │  │   stores in DB │ │ etc.           │ │                         │   ││
│  │  └────────────────┘ └────────────────┘ └────────────────────────┘   ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │  Session Cookie Storage (PostgreSQL)                                 ││
│  │  ┌────────────────────────────────────────────────────────────────┐  ││
│  │  │  Each connected_account stores:                                │  ││
│  │  │  • Encrypted cookies (AES-256-GCM)                            │  ││
│  │  │  • Encrypted localStorage snapshots                           │  ││
│  │  │  • User agent string used during login                        │  ││
│  │  │  • Last verified timestamp                                    │  ││
│  │  │  • Session health status                                      │  ││
│  │  └────────────────────────────────────────────────────────────────┘  ││
│  └──────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────┬────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────────────────┐
│                         AI / ML LAYER                                     │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                       LLM Orchestrator                               ││
│  │   OpenAI GPT-4o │ Anthropic Claude │ Mistral (fallback)              ││
│  └──────────────────────────────────────────────────────────────────────┘│
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │   NLP    │ │ Vision   │ │ Content  │ │Prediction│ │  Vector DB   │  │
│  │  Engine  │ │ Engine   │ │ Analyzer │ │ Engine   │ │  (Qdrant)    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │  Brand Learning — continuously adapts to brand voice, style, audience││
│  └──────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────┬────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────────────────┐
│                         DATA LAYER                                        │
│                                                                          │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐                │
│  │  PostgreSQL    │ │    Redis       │ │  Cloudinary    │                │
│  │  (primary DB)  │ │  (cache/queue) │ │  (media)      │                │
│  └────────────────┘ └────────────────┘ └────────────────┘                │
│  ┌────────────────┐ ┌────────────────┐                                   │
│  │ TimescaleDB    │ │ RabbitMQ       │                                   │
│  │ (time-series)  │ │ (events/queue) │                                   │
│  └────────────────┘ └────────────────┘                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Unlisted Platforms (Custom / User-Defined)

The pre-built connector list (TikTok, Instagram, etc.) covers the most popular platforms, but CHAK does not limit users to this list.

### How Adding an Unlisted Platform Works

```
1. User clicks "Add Custom Platform" in settings
2. User enters:
   - Platform name (e.g., "Snapchat", "Weibo", "VK")
   - Login URL (e.g., "https://web.snapchat.com")
   - (optional) Home URL for session verification
3. System creates a generic platform entry in the database
4. Embedded browser opens to the login URL
5. User logs in normally
6. Session is captured and stored
7. Platform appears in the dashboard alongside built-in ones
```

### Action Capability by Connector Type

| Connector Type | Capabilities | Who Creates It |
|----------------|-------------|----------------|
| **Built-in** | Full: publish, comments, DMs, analytics, stories | CHAK developers |
| **Community script** | Matches built-in, but maintained by community | Any user (submitted via PR or uploaded as JSON) |
| **Generic fallback** | Basic: session storage, notification checking, manual browsing through embedded view | System (automatic) |
| **Custom user script** | User-defined via a simple JSON/YAML selector file | Any user |

### Custom User Connector Scripts

Advanced users can write a connector script for an unlisted platform. The script is a simple JSON file that maps actions to CSS selectors:

```json
{
  "platform": "mysite",
  "version": 1,
  "selectors": {
    "home": "https://mysite.com/feed",
    "publish": {
      "button": "button[data-testid='create-post']",
      "textarea": "div[role='textbox']",
      "submit": "button[type='submit']"
    },
    "comments": {
      "container": "article[data-post-id] div.comments",
      "replyButton": "button.reply-btn",
      "replyInput": "textarea.reply-input"
    }
  }
}
```

These scripts are stored in the database and loaded at runtime by the Playwright engine. No deployment or server restart required. The system ships with a **script editor UI** inside the app for creating and testing these live.

### Community Script Marketplace

Over time, CHAK can include a marketplace where users share and discover connector scripts for various platforms — making the platform more powerful as its user base grows.

---

## Core Concept: Authentication & Connection

CHAK supports a **multi-level authentication system**. All three levels are optional and can coexist. The user chooses which method to use for each platform.

| Level | Method | Status | Use Case |
|-------|--------|--------|----------|
| 1 | Official Platform API | Optional, preferred when available | YouTube, LinkedIn, Telegram |
| 2 | OAuth 2.0 Login | Optional | Facebook, Instagram, TikTok, X, Reddit |
| 3 | Embedded Browser Session | **Default / Original** | Any platform with a web interface |

### Level 3: Embedded Browser Authentication (Default)

This is the core differentiator of CHAK. Instead of relying on official APIs or OAuth redirects, the user authenticates directly through a **browser window embedded in the application**.

### Disclaimer for Unofficial Methods

Whenever a non-official connection method is used (Level 3), the user is clearly informed:

> "You are connecting via an unofficial method. This may be subject to the platform's terms of service and reliability considerations. Your session is encrypted and stored securely."

This ensures transparency and informed consent.

### Connection Flow (Level 3 — Browser Session)

```
  User clicks "Connect Platform"
         │
         ▼
┌─────────────────────────────────────┐
│  API Gateway creates a session token │
│  and spawns a Playwright browser     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Playwright opens a headless         │
│  browser pointing to TikTok login    │
│                                      │
│  The browser stream is shown to the  │
│  user via a WebSocket + canvas or    │
│  iframe proxy inside the app         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  User logs into TikTok directly      │
│  through the embedded browser       │
│                                      │
│  (same as logging in on their own   │
│   computer — email, password, 2FA)  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Playwright captures session data:  │
│  • All cookies (session, auth, etc) │
│  • localStorage items               │
│  • sessionStorage items             │
│  • User agent string                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Session data is encrypted          │
│  (AES-256-GCM) and stored in        │
│  the `connected_accounts` table     │
│  in PostgreSQL                      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  For all future actions (posting,   │
│  reading comments, sending DMs),    │
│  Playwright restores the session    │
│  cookies into a browser context     │
│  and performs the action            │
└─────────────────────────────────────┘
```

### Why This Approach

| Concern | Benefit |
|---------|---------|
| **No API approval** | No need to apply for API access, no review process, no compliance paperwork |
| **Any platform** | Works with any social media site that has a web interface |
| **No rate limits** | Not subject to API rate limits (only subject to platform anti-bot measures) |
| **Full feature access** | Browser sees everything the user sees — comments, DMs, stories, analytics — no API limitations |
| **New platforms** | Adding a new platform means writing a connector script, not waiting for API access |
| **Cost** | No API costs, only compute cost for Playwright workers |

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Session expiry | Health check worker verifies sessions daily; auto-notifies user to re-login |
| 2FA challenges | Proxy the browser stream to the user in real-time so they can complete 2FA |
| Platform anti-bot detection | Realistic user agents, random delays, human-like mouse movements, rotating proxies |
| Account ban risk | User is informed whenever an unofficial connection method is used, including associated reliability and policy considerations; CHAK mimics human behavior |
| Session invalidation | Stored session data (cookies + localStorage) survives pageloads and most refreshes |

---

## Frontend Architecture (Vercel)

```
┌──────────────────────────────────────────────────────────────┐
│                    NEXT.JS APP (Vercel)                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  App Router (app/)                                     │  │
│  │  / — Landing                                          │  │
│  │  /dashboard — Main app shell                          │  │
│  │  /dashboard/social — Social Media OS                  │  │
│  │  /dashboard/studio — CHAK Studio                      │  │
│  │  /dashboard/analytics — CHAK Analytics                 │  │
│  │  /dashboard/crm — CHAK CRM                            │  │
│  │  /dashboard/commerce — CHAK Commerce                   │  │
│  │  /dashboard/automations — CHAK Automations             │  │
│  │  /dashboard/settings — User/org settings              │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Embedded Browser Component                             │  │
│  │                                                         │  │
│  │  <EmbeddedBrowser                                       │  │
│  │    platform="instagram"                                 │  │
│  │    mode="login" | "interact"                            │  │
│  │    targetUrl="https://instagram.com/login"              │  │
│  │    onSessionReady={handleSession}                       │  │
│  │  />                                                     │  │
│  │                                                         │  │
│  │  Implementation:                                        │  │
│  │  - WebSocket connection to Playwright worker            │  │
│  │  - Renders the browser view via canvas streaming or     │  │
│  │    a lightweight viewport proxy                         │  │
│  │  - User can click and type directly in the viewport     │  │
│  │  - On successful login, cookies are captured            │  │
│  │  - For ongoing actions, browser runs headlessly         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Shared Components                                     │  │
│  │  ui/ — Button, Input, Modal, Table, Calendar, Charts  │  │
│  │  layout/ — Sidebar, Topbar, DashboardShell             │  │
│  │  media/ — MediaUploader, MediaEditor, VideoPlayer       │  │
│  │  social/ — PlatformIcon, PostCard, CommentThread        │  │
│  │  ai/ — AISuggestion, CaptionGenerator, HashtagPicker   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  State & Data                                          │  │
│  │  Zustand — Client state (UI, selections, modals)      │  │
│  │  TanStack Query — Server state (caching, sync)        │  │
│  │  WebSocket client — real-time (browser stream, alerts)  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Frontend Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS + Radix UI primitives |
| Charts | Recharts / Tremor |
| Forms | React Hook Form + Zod |
| Rich Text | TipTap / Plate |
| AI Streaming | Vercel AI SDK |
| Auth (CHAK login) | NextAuth.js / JWT |
| Browser Streaming | WebSocket → Canvas API |

---

## Backend Architecture (Render)

```
┌──────────────────────────────────────────────────────────────┐
│                  RENDER DASHBOARD                             │
│                                                              │
│  Web Services                                                │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐  │
│  │ API Gateway │ │ Auth Svc   │ │ Content    │ │ Scheduler│  │
│  │ (1 instance)│ │ (1 instance)│ │ Svc (2+    │ │ Svc      │  │
│  │             │ │            │ │ instances) │ │ (1 inst) │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐  │
│  │Engagement  │ │ Analytics  │ │ Media Svc  │ │ Billing  │  │
│  │Svc (2+ inst)│ │ Svc (1+    │ │ (1+ inst)  │ │ Svc      │  │
│  │            │ │ instances) │ │            │ │ (1 inst) │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘  │
│                                                              │
│  Background Workers (Browser Engine)                         │
│  ┌────────────────────┐ ┌────────────────────┐               │
│  │ Session Capturer   │ │ Action Executor    │               │
│  │ (Playwright)       │ │ (Playwright)       │               │
│  │                    │ │                    │               │
│  │ • Opens browser    │ │ • Restores session │               │
│  │ • Streams viewport │ │ • Posts content    │               │
│  │ • Captures cookies │ │ • Replies to cmts  │               │
│  │ • Encrypts + saves │ │ • Sends DMs        │               │
│  └────────────────────┘ └────────────────────┘               │
│  ┌────────────────────┐ ┌────────────────────┐               │
│  │ Data Collector     │ │ Session Health     │               │
│  │ (Playwright)       │ │ Checker            │               │
│  │                    │ │                    │               │
│  │ • Scrapes analytics│ • Verifies sessions  │               │
│  │ • Reads comments   │   are still valid    │               │
│  │ • Gets follower    │ • Auto-refreshes if  │               │
│  │   data             │   possible           │               │
│  │ • Competitor scans │ • Notifies on expiry │               │
│  └────────────────────┘ └────────────────────┘               │
│                                                              │
│  Databases                                                  │
│  ┌────────────────────┐ ┌────────────────────┐               │
│  │ PostgreSQL 16      │ │ Redis              │               │
│  │ (all app data)     │ │ (cache + Bull queue)│               │
│  └────────────────────┘ └────────────────────┘               │
└──────────────────────────────────────────────────────────────┘
```

### Backend Tech Stack

| Layer | Choice | Status |
|-------|--------|--------|
| Runtime | **Go 1.25** | Built |
| Framework | **Gin** | Built |
| API Style | REST, `/api/v1` | Built |
| Data access | **`database/sql`** — no ORM, with a SQLite/Postgres dialect layer | Built |
| Database driver | `jackc/pgx/v5` (Neon) · `modernc.org/sqlite` (local) | Built |
| AI layer | Provider-agnostic: Gemini, OpenAI, Anthropic, DeepSeek, OpenRouter, Ollama | Built |
| Metering | Append-only credit ledger, reserve/commit two-phase | Built |
| Admin auth | Bearer `ADMIN_TOKEN`, constant-time compare | Built |
| CORS | Exact-match origin allowlist | Built |
| Queue | Redis-backed worker | *Not built* |
| End-user auth | JWT + MFA + RBAC (see SRS §3.1) | *Not built* — `X-User-Id` header is currently unverified |
| Browser automation | Playwright | *Not built* |
| Encryption | AES-256-GCM for session cookies | *Not built* |

> **v1.0 of this document specified Node.js + Hono + Drizzle + BullMQ + Socket.io.
> That stack was never built.** The table above is the system as it exists.

---

## Browser Engine Architecture

```
┌──────────────────────────────────────────────────────────┐
│                 PLAYWRIGHT BROWSER POOL                    │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Browser Pool Manager                                │  │
│  │  • Maintains N warm browser instances               │  │
│  │  • Reuses contexts for performance                  │  │
│  │  • Handles concurrency limits                       │  │
│  │  • Rotates user agents / fingerprints               │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Session      │  │ Action       │  │ Data           │  │
│  │ Capturer     │  │ Executor     │  │ Collector      │  │
│  │              │  │              │  │                │  │
│  │ 1. Open      │  │ 1. Load      │  │ 1. Navigate to │  │
│  │    browser   │  │    cookies   │  │    profile     │  │
│  │ 2. Navigate  │  │ 2. Restore   │  │ 2. Extract     │  │
│  │    to login  │  │    session   │  │    followers   │  │
│  │ 3. Stream    │  │ 3. Perform   │  │ 3. Get post    │  │
│  │    viewport  │  │    action    │  │    stats       │  │
│  │    → user    │  │    (post,    │  │ 4. Read        │  │
│  │ 4. Wait for  │  │    reply,    │  │    comments    │  │
│  │    login     │  │    DM)       │  │ 5. Store in DB │  │
│  │ 5. Capture   │  │ 4. Confirm   │  │                │  │
│  │    cookies + │  │    success   │  │                │  │
│  │    storage   │  │ 5. Report    │  │                │  │
│  │ 6. Encrypt   │  │    result    │  │                │  │
│  │ 7. Save to DB│  │              │  │                │  │
│  └──────────────┘  └──────────────┘  └────────────────┘  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Session Verification Worker                         │  │
│  │  • Runs on cron every 6-12 hours                    │  │
│  │  • For each account: restore session, check if      │  │
│  │    still logged in by navigating to profile         │  │
│  │  • If session expired → mark account as "expired"   │  │
│  │  • Notify user to re-authenticate                   │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### How Actions Work (e.g., Publishing a Post)

```
1. User creates content in the CHAK UI
2. User clicks "Publish to Instagram"
3. API creates a job in the queue *(queue not yet built — currently synchronous)*
4. Action Executor picks up the job
5. Playwright:
   a. Fetches encrypted session for the Instagram account
   b. Decrypts cookies + localStorage
   c. Creates a browser context with restored session
   d. Navigates to instagram.com
   e. Verifies session is still valid
   f. Fills in the post form with the content
   g. Uploads media via file input
   h. Writes caption
   i. Clicks "Post"
   j. Confirms the post was published
   k. Captures the post URL
6. Saves the result to the database
7. Notifies the user via WebSocket
```

---

## Database Schema

> **Build status.** The tables below are the *target* schema. What exists today
> is: `users`, `usage_events`, `credit_ledger`, `operations`, `margin_alerts`,
> `custom_destinations` — the billing and metering core, listed after the
> target schema. Everything org-scoped (`organizations`, `org_members`,
> `connected_accounts`, `contents`, `scheduled_posts`, `engagements`,
> `analytics_snapshots`, `brand_profiles`) is **specified but not built**, which
> is why there is currently no multi-tenancy and no seat enforcement despite
> plans selling 3/10/50 seats.

```
┌──────────────────────────────────────────────────────────┐
│  CORE TABLES                                              │
│                                                          │
│  users                                                    │
│    id UUID PK                                              │
│    email VARCHAR UNIQUE                                    │
│    password_hash VARCHAR                                   │
│    name VARCHAR                                            │
│    avatar_url VARCHAR                                      │
│    created_at TIMESTAMPTZ                                  │
│                                                          │
│  organizations                                             │
│    id UUID PK                                              │
│    name VARCHAR                                            │
│    slug VARCHAR UNIQUE                                     │
│    plan plan_type (free, pro, business, enterprise)        │
│    created_at TIMESTAMPTZ                                  │
│                                                          │
│  org_members                                               │
│    id UUID PK                                              │
│    org_id UUID FK→organizations                            │
│    user_id UUID FK→users                                   │
│    role role_type (owner, admin, editor, viewer)           │
│                                                          │
│  connected_accounts                                        │
│    id UUID PK                                              │
│    org_id UUID FK→organizations                            │
│    platform platform_type                                  │
│    account_name VARCHAR (display name on platform)         │
│    account_username VARCHAR (handle on platform)           │
│    account_id VARCHAR (platform user ID)                   │
│    profile_data JSONB (avatar, bio, follower count)        │
│                                                          │
│    -- Encrypted browser session data                      │
│    encrypted_cookies TEXT (AES-256-GCM)                   │
│    encrypted_storage TEXT (localStorage + sessionStorage)  │
│    encryption_iv VARCHAR (initialization vector)           │
│    encryption_tag VARCHAR (auth tag)                      │
│    user_agent VARCHAR (UA used during login)              │
│    proxy_config JSONB (optional proxy used)               │
│                                                          │
│    last_verified_at TIMESTAMPTZ                            │
│    status account_status (active, expired, revoked)       │
│    created_at TIMESTAMPTZ                                  │
│    updated_at TIMESTAMPTZ                                  │
│                                                          │
│  contents                                                  │
│    id UUID PK                                              │
│    org_id UUID FK→organizations                            │
│    type content_type (video, image, carousel, text, story) │
│    title VARCHAR                                           │
│    caption TEXT                                            │
│    media_urls TEXT[]                                        │
│    thumbnail_url VARCHAR                                   │
│    hashtags TEXT[]                                          │
│    ai_score DECIMAL                                        │
│    ai_analysis JSONB                                       │
│    tags TEXT[]                                              │
│    folder_id UUID FK→folders                               │
│    status content_status (draft, scheduled, published)      │
│    created_at TIMESTAMPTZ                                  │
│                                                          │
│  scheduled_posts                                           │
│    id UUID PK                                              │
│    content_id UUID FK→contents                             │
│    account_id UUID FK→connected_accounts                   │
│    scheduled_for TIMESTAMPTZ                               │
│    published_at TIMESTAMPTZ                                │
│    platform_post_url VARCHAR (URL after publishing)        │
│    status schedule_status (pending, publishing, done,      │
│                            failed)                         │
│    platform_specific JSONB (per-platform formatting)       │
│    error_message TEXT                                      │
│    retry_count INT DEFAULT 0                               │
│                                                          │
│  engagements (comments + DMs)                              │
│    id UUID PK                                              │
│    org_id UUID FK→organizations                            │
│    account_id UUID FK→connected_accounts                   │
│    type engagement_type (comment, dm, mention)             │
│    platform_engagement_id VARCHAR                           │
│    author_name VARCHAR                                      │
│    author_avatar VARCHAR                                    │
│    text TEXT                                                │
│    sentiment sentiment_type (positive, negative, neutral)  │
│    lead_score DECIMAL (0-100)                              │
│    ai_generated_reply TEXT                                  │
│    human_reply TEXT                                         │
│    status engagement_status (unread, ai_replied, replied,  │
│                              escalated)                     │
│    created_at TIMESTAMPTZ                                   │
│                                                          │
│  analytics_snapshots                                       │
│    id UUID PK                                              │
│    account_id UUID FK→connected_accounts                   │
│    date DATE                                                │
│    followers INT                                            │
│    following INT                                            │
│    posts_count INT                                          │
│    reach INT                                                │
│    impressions INT                                          │
│    profile_views INT                                        │
│    engagement_rate DECIMAL                                  │
│    raw_data JSONB (full scraped data)                      │
│    collected_at TIMESTAMPTZ                                 │
│                                                          │
│  brand_profiles                                             │
│    id UUID PK                                               │
│    org_id UUID FK→organizations                             │
│    tone VARCHAR                                              │
│    voice_guidelines TEXT                                     │
│    products TEXT[]                                           │
│    target_audience TEXT[]                                    │
│    preferred_ctas TEXT[]                                     │
│    emoji_preferences TEXT[]                                  │
│    embedding vector(1536)                                    │
│    updated_at TIMESTAMPTZ                                    │
│                                                          │
│  ai_conversations                                           │
│    id UUID PK                                               │
│    org_id UUID FK→organizations                             │
│    user_id UUID FK→users                                    │
│    title VARCHAR                                             │
│    messages JSONB[]                                          │
│    context JSONB                                             │
│    created_at TIMESTAMPTZ                                    │
└──────────────────────────────────────────────────────────┘
```

### Billing & Metering Tables (built)

```sql
-- Append-only. Balance is SUM(delta); there is deliberately no balance column,
-- so concurrent generations cannot race a lost update and every charge is
-- auditable for a billing dispute.
credit_ledger (
  id, user_id, entry_kind, delta, operation_id, reason, created_at
)
-- entry_kind: grant | purchase | hold | release | charge | refund | expire | adjust

-- One row per metered generation. est_* is what we reserved; actual_* is what
-- the vendor really delivered. The gap between them is the money a flat
-- per-job charge would have lost.
operations (
  id, user_id, idempotency_key UNIQUE, state, modality, model, provider, intent,
  est_units, est_credits, est_vendor_usd,
  actual_units, unit_kind, actual_vendor_usd,
  charged_credits, billable_usd, margin_usd,
  vendor_billed_on_failure, error, created_at, settled_at
)
-- state: reserved | committed | failed | refunded

-- Written whenever an operation would price at or below vendor cost. Surfaced
-- above every other panel in the admin dashboard.
margin_alerts (
  id, user_id, operation_id, model, vendor_usd, billable_usd, detail, created_at
)

-- User-added publishing targets. Read per request, so a new destination is
-- live immediately with no deploy.
custom_destinations (
  id, user_id, name, kind, mode, config_json, enabled, created_at, updated_at
)
-- mode: api (JSON endpoint mapping) | browser (Playwright selectors) | export

-- Extended with cost columns so text spend is visible even though it is never
-- billed: units, unit_kind, vendor_cost_usd, billable_usd, margin_usd, operation_id
usage_events (...)
```

---

## API Design

```
POST   /api/auth/register          # Create CHAK account
POST   /api/auth/login             # Login to CHAK
POST   /api/auth/refresh           # Refresh JWT

POST   /api/connect/start          # Spawn browser for login
       Body: { platform: "instagram" }
       Response: { sessionId, wsUrl }
       → Client connects to wsUrl to see the browser

POST   /api/connect/:id/capture    # Finalize session capture
       Body: { sessionId }
       → Server captures cookies, encrypts, stores

GET    /api/accounts                # List connected accounts
DELETE /api/accounts/:id            # Disconnect account
POST   /api/accounts/:id/verify    # Force session health check

GET    /api/content                 # List content (paginated)
POST   /api/content                 # Upload/create content
GET    /api/content/:id
PATCH  /api/content/:id
DELETE /api/content/:id

POST   /api/publish                 # Publish immediately
       Body: { contentId, accountIds[] }
       → Queues a Playwright action for each account

POST   /api/schedule                # Schedule content
       Body: { contentId, accountIds[], scheduledFor }
DELETE /api/schedule/:id

GET    /api/engagements             # Comments + DMs (paginated)
PATCH  /api/engagements/:id/reply   # Reply (AI-generated or manual)
GET    /api/engagements/leads       # High lead score engagements

GET    /api/analytics/overview
GET    /api/analytics/accounts/:id  # Per-account analytics

POST   /api/ai/analyze              # Analyze content via AI
POST   /api/ai/captions             # Generate captions
POST   /api/ai/hashtags             # Generate hashtags
POST   /api/ai/reply                # Generate reply suggestion
POST   /api/ai/chat                 # AI Assistant conversation

GET    /api/brand                   # Get brand profile
PATCH  /api/brand                   # Update brand profile

WS     /ws/browser/:sessionId       # Browser viewport stream
WS     /ws/notifications            # Real-time alerts
```

---

---

## Billing & Metering Architecture

This section did not exist in v1.0. The commercial model was undefined, which
meant the ledger charged a flat $0.04 for any image *or* video — a 25-100x
undercount on generative video.

### What is metered

| Covered by the subscription (unmetered) | Metered in credits |
|---|---|
| Captions, hooks, hashtags, titles | **AI image generation** |
| **Blog and micro-blog writing** | **AI video generation** |
| Publishing to all destinations | |
| Content analysis, scoring, viral research | |
| Comment auto-reply, DM assistant, lead scoring | |
| Scheduling, calendar, analytics, repurposing | |

Rationale: a caption costs ~$0.0001 of vendor spend and a blog draft ~$0.05,
so text is a fixed COGS line (~$1.50-$15/user/month by tier). One 8-second Veo
clip is ~$2.20 — five thousand times a caption — and has to be metered.

### Flow

```
   ┌────────────┐   estimate    ┌──────────────┐
   │  Frontend  │──────────────>│ Cost engine  │  vendor cost x markup
   │            │<──────────────│  pricing.go  │  -> credits
   └─────┬──────┘   preview     └──────────────┘
         │ reserve
         ▼
   ┌──────────────┐  check plan, caps, balance, margin floor
   │  metering.go │──> 402 insufficient · 403 plan · needsConfirm
   └─────┬────────┘
         │ hold N credits (append-only ledger entry)
         ▼
   ┌──────────────┐
   │  Provider    │  Veo / Sora / Imagen / FLUX / ...
   └─────┬────────┘
         │ ACTUAL units returned (may differ from estimate)
         ▼
   ┌──────────────┐  release hold, charge actual, record margin
   │   commit     │  mirror into usage_events for reporting
   └──────────────┘
```

### Invariants

1. **No operation is sold below vendor cost.** `assertProfitable()` checks the
   effective markup against `MinMarkup = 1.5` and records a `margin_alert`
   otherwise. The admin dashboard surfaces these above every other panel.
2. **No credit is spent that the customer does not have.** Credits are held
   before dispatch, not after.
3. **An unpriced model is never free.** Unknown models bill at the most
   expensive known rate for their modality.
4. **Balance is `SUM(delta)` over an append-only ledger** — no balance column,
   so concurrent generations cannot race a lost update and every charge is
   auditable.

### Where cost lands

| Event | Who pays |
|---|---|
| Successful generation | Customer, at actual units |
| Vendor overran the estimate | Customer, at actual units (reconciled on commit) |
| Generation failed, vendor did not bill | Nobody — hold released |
| Generation failed, vendor billed anyway | **The house**, funded by the 15% failure allowance inside every price |
| Text of any kind | The house, as a fixed subscription cost |

---

## Publishing Destination Architecture

Blog destinations follow the same extensibility principle as social connectors:
the built-in list is a convenience, not a boundary.

```
                      ┌──────────────────────┐
   POST /publish/blog │  destination router  │
                      └───────┬──────────────┘
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
      ┌────────────┐   ┌─────────────┐  ┌──────────────┐
      │  Built-in  │   │ API mapping │  │   Browser    │
      │  adapters  │   │  (user JSON)│  │  (selectors) │
      ├────────────┤   ├─────────────┤  ├──────────────┤
      │ dev.to     │   │ endpoint    │  │ composeUrl   │
      │ Hashnode   │   │ authHeader  │  │ sessionRef   │
      │ LinkedIn   │   │ fieldMap    │  │ selectors{}  │
      │ Reddit     │   │ wrapper     │  │              │
      │ Medium     │   │ urlPath     │  │ -> Playwright│
      │ Own site   │   │             │  │    worker    │
      └─────┬──────┘   └──────┬──────┘  └──────┬───────┘
            └─────────────────┼────────────────┘
                              ▼
                   ┌─────────────────────┐
                   │ any failure/no auth │
                   │  -> formatted export│  never lose the draft
                   └─────────────────────┘
```

**Product Hunt is deliberately not a publish target.** Its GraphQL v2 API is
read-only for launches; submission is manual by design. The system produces a
launch kit (tagline, description, maker's first comment, gallery specs, timing
checklist) and uses the read API for tracking your launch and competitors'.

**Canonical URLs matter.** Cross-posting the same article without
`canonical_url` splits SEO between the copies. Every adapter that supports it
points back at the owner's own domain.


## Security Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  SESSION ENCRYPTION                                          │
│  • All browser session cookies encrypted at rest             │
│    (AES-256-GCM)                                              │
│  • Encryption key stored as Render environment secret        │
│  • Each session has unique IV + auth tag                     │
│  • Cookies never exposed to the frontend or any API response │
│                                                              │
│  AUTHENTICATION (CHAK login)                                 │
│  • JWT with short-lived access tokens (15 min)              │
│  • Refresh tokens (7 days) with rotation                    │
│  • MFA via TOTP for CHAK accounts                          │
│                                                              │
│  AUTHORIZATION                                                │
│  • RBAC: owner → admin → editor → viewer                     │
│  • Row-level security at service layer                       │
│                                                              │
│  BROWSER SESSION SAFETY                                      │
│  • Playwright runs in isolated Docker containers             │
│  • No persistent storage in the container (stateless)        │
│  • Session data is only decrypted in-memory during use       │
│  • Browser environment is destroyed after each action        │
│                                                              │
│  DATA PROTECTION                                              │
│  • TLS 1.3 in transit                                        │
│  • Encrypted database connections                            │
│  • Audit logs for all mutation operations                    │
│  • 90-day log retention                                      │
  │  • Regular security monitoring                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Folder Structure

```
chak/
├── apps/
│   ├── web/                          # Next.js frontend (Vercel)
│   │   ├── app/                      # App Router pages
│   │   ├── components/
│   │   │   ├── ui/                   # Primitive UI components
│   │   │   ├── layout/               # Dashboard shell, sidebar
│   │   │   ├── social/               # Post cards, comment threads
│   │   │   ├── media/                # Uploaders, editors
│   │   │   ├── ai/                   # AI suggestions, generators
│   │   │   └── browser/              # Embedded browser component
│   │   ├── lib/                      # API client, utilities
│   │   ├── hooks/                    # Custom React hooks
│   │   ├── stores/                   # Zustand stores
│   │   └── types/                    # Frontend types
│   │
│   ├── api/                          # Backend services (Render)
│   │   ├── gateway/                  # API Gateway
│   │   ├── services/
│   │   │   ├── auth/
│   │   │   ├── content/
│   │   │   ├── scheduler/
│   │   │   ├── engagement/
│   │   │   ├── analytics/
│   │   │   ├── media/
│   │   │   └── billing/
│   │   ├── browser/                  # Playwright engine
│   │   │   ├── session-capturer.ts
│   │   │   ├── action-executor.ts
│   │   │   ├── data-collector.ts
│   │   │   ├── health-checker.ts
│   │   │   └── browser-pool.ts
│   │   ├── workers/                  # queue job processors (planned)
│   │   │   ├── publisher.worker.ts
│   │   │   ├── collector.worker.ts
│   │   │   └── verifier.worker.ts
│   │   └── shared/
│   │       ├── database/             # schema + migrations
│   │       ├── types/                # Shared TypeScript types
│   │       ├── queue/                # queue definitions (planned)
│   │       ├── encryption/           # AES encrypt/decrypt
│   │       └── utils/
│   │
│   └── connectors/                   # Platform-specific browser scripts
│       ├── core/                     # Base connector interface
│       ├── tiktok/                   # TikTok login + action scripts
│       ├── instagram/                # Instagram login + action scripts
│       ├── facebook/
│       ├── youtube/
│       ├── reddit/
│       ├── x/
│       ├── linkedin/
│       ├── whatsapp-web/
│       ├── telegram/
│       ├── pinterest/
│       └── threads/
│
├── packages/
│   ├── ui/                           # Shared component library
│   ├── config/                       # ESLint, TypeScript configs
│   └── validators/                   # Zod schemas
│
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.browser            # Playwright with Chromium
│   ├── Dockerfile.worker
│   └── docker-compose.yml            # Local dev
│
├── .github/
│   └── workflows/
│       ├── deploy-frontend.yml       # Vercel
│       └── deploy-backend.yml        # Render
│
├── turbo.json
├── package.json
└── tsconfig.json
```

---

## Connector Architecture (Browser-Based)

```
Each connector defines how to log in and perform actions on a platform.

connector/
  tiktok/
    login.ts          # Navigate to TikTok login, fill form, handle 2FA
    publish.ts        # Upload video, write caption, set settings, post
    comments.ts       # Navigate to post, read comments, reply
    messages.ts       # Open DMs, read conversations, send messages
    analytics.ts      # Navigate to profile, extract follower count, views
    selectors.ts      # CSS selectors for all elements
    config.ts         # Platform-specific settings (URLs, timeouts)

interface PlatformConnector {
  platform: Platform
  
  // Called when user wants to connect an account
  loginSteps(): LoginStep[]
  // Each step: { action: 'navigate' | 'fill' | 'click' | 'wait',
  //              selector, value?, screenshot? }
  
  // Called by Action Executor for publishing
  publish(context: BrowserContext, content: PostInput): Promise<PostResult>
  
  // Called by Data Collector for engagement
  getComments(context: BrowserContext, postUrl: string): Promise<Comment[]>
  replyToComment(context: BrowserContext, url: string, text: string): Promise<void>
  
  // Called by Data Collector for analytics
  getAnalytics(context: BrowserContext): Promise<AnalyticsData>
  
  // Called by Session Health Checker
  isLoggedIn(page: Page): Promise<boolean>
}
```

Each connector is an independent module that knows:
- What URLs to navigate to
- What CSS selectors to interact with
- What steps to perform for each action
- How to handle platform-specific UI

Adding a new platform = writing a new connector module. No API approval needed.

---

## Deployment Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  GitHub Push  │────>│  CI Checks   │────>│   Deploy     │
│  (main branch)│     │  (lint, test,│     │              │
│              │     │   typecheck) │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                    ┌─────────────────────────────┤
                    │                             │
                    ▼                             ▼
          ┌──────────────────┐          ┌──────────────────┐
          │  Vercel (Web)    │          │  Render (API)    │
          │                  │          │                  │
          │  • Auto-build    │          │  • Build Docker  │
          │  • Preview Depl. │          │    images        │
          │  • ISR + SSR     │          │  • Run migrations│
          │  • Edge Functions │          │  • Deploy        │
          │                  │          │    services +    │
          │                  │          │    workers       │
          └──────────────────┘          └──────────────────┘
```

### Environment Variables

```env
# ---- Vercel (frontend + admin) ----
NEXT_PUBLIC_PALIUS_API=https://palius-backend.onrender.com/api/v1
PALIUS_ADMIN_TOKEN=            # admin project only

# ---- Render (backend) ----
DATABASE_URL=postgresql://...  # Neon POOLED string (-pooler host)
DB_MAX_CONNS=10
DB_MAX_IDLE=5
APP_ENV=production
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
ADMIN_TOKEN=                   # generated by Render

# AI providers — AI_PROVIDER=auto picks the first key present
AI_PROVIDER=auto
GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=
OPENROUTER_API_KEY=

# Pricing — optional JSON override so vendor price changes need no redeploy
PALIUS_RATE_CARD=/etc/palius/ratecard.json

# Blog publishing (all optional; unconfigured destinations export instead)
DEVTO_API_KEY=
HASHNODE_API_KEY=
HASHNODE_PUBLICATION_ID=
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_AUTHOR_URN=
REDDIT_ACCESS_TOKEN=
MEDIUM_TOKEN=
MEDIUM_USER_ID=
PRODUCTHUNT_TOKEN=             # read-only: tracking, not launching
OWN_SITE_WEBHOOK_URL=

# Not yet built
REDIS_URL=
SESSION_ENCRYPTION_KEY=        # AES-256 for cookie encryption
PLAYWRIGHT_WORKER_URL=
```

---

## Render Setup

| Resource | Plan | Spec | Status |
|----------|------|------|--------|
| `palius-backend` (single Go service) | Starter | 512 MB RAM, 0.5 CPU | **Built** |
| Neon Postgres | Free/Launch | serverless, autoscaling | **Built** |
| Browser workers | Professional (×2) | 2 GB RAM, 1 CPU each — need Chromium | Not built |
| Redis (Key Value) | Starter | 250 MB | Not built |

> The service split shown elsewhere in this document (auth / content /
> engagement / analytics as separate services) is a **target** architecture. The
> backend currently ships as one Go binary; splitting it is premature until
> traffic justifies the operational cost.


> **Note:** Browser workers need more RAM because they run headless Chromium (Playwright). A single Chromium instance uses ~300-500 MB. With 2 GB RAM, each worker can handle 3-4 concurrent browser sessions.

---

## Scaling Considerations

- **Vercel**: Automatic edge scaling, ISR for landing/docs, Edge Functions for auth checks
- **Render**: Scale browser workers horizontally as more accounts are added
- **Browser Pool**: Instead of one Playwright per job, maintain a warm pool of browsers for low latency
- **Database**: Connection pooling (PgBouncer), read replicas for analytics queries
- **Queue** *(planned)*: Redis-backed with priorities — publishing jobs outrank data collection
- **Session Expiry**: Health checker runs every 6h; expired sessions trigger in-app notification to reconnect
