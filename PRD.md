# CHAK Social Media OS — Product Requirements Document

**Version:** 1.2
**Product:** CHAK Social Media OS
**Previous Name:** OpenClaw Social Media OS
**Pending rename:** Palius (candidate — "Grow your audience with Palius" / "Grow your social media accounts with Palius")

---

## Vision

CHAK Social Media OS is an AI-powered platform that helps businesses, creators, influencers, agencies, and marketers manage their entire social media presence from one intelligent dashboard. It goes beyond scheduling by acting as an AI social media manager that creates, publishes, engages, analyzes, learns, and continuously improves marketing performance across multiple platforms.

Its goal is to become the AI employee responsible for social media operations.

**Tagline (candidate):** "Grow your audience with CHAK" — or — "Grow your social media accounts with CHAK."

---

## Positioning & Target Market

CHAK is built for teams and individuals who do not have a full marketing department:

- **Solo developers / indie hackers** — one person shipping a product and a brand at the same time
- **Startups without a marketing team** — founders own growth; the AI is their first marketer
- **Small marketing teams** — small teams that need leverage, not more tools
- **Small businesses (SMBs)** — local + digital businesses that want to look professional everywhere
- **Influencers / creators** — personal brands that live on short-form and need to grow consistently

**Core value proposition:** one upload, researched and adapted for every relevant platform, published where it fits, driving traffic back to your website — without a marketing team.

---

## Supported Platforms

### Built-In Connectors (Initial)

| Platform | Capability |
|----------|-----------|
| TikTok | Full |
| Instagram | Full |
| Facebook | Full |
| Reddit | Full |
| X (Twitter) | Full |
| LinkedIn | Full |
| Threads | Full |
| Pinterest | Full |
| YouTube | Full |
| WhatsApp Business | Full |
| Telegram | Full |

### Any Platform (Unlisted)

CHAK does **not** limit users to the built-in list. Because the system uses an embedded browser (Playwright) to interact with all platforms, **any website with a web interface can be connected**.

**Ways to add an unlisted platform:**
1. **Quick connect** — Enter a name and login URL, log in through the embedded browser. The system stores the session. The platform appears in your dashboard immediately.
2. **Custom connector script** — Write a simple JSON file mapping CSS selectors to actions (publish, comment, read DMs). Upload it through the in-app script editor. No code deploy or server restart needed.
3. **Community scripts** — Import connector scripts shared by other CHAK users.

The architecture supports adding new platforms without changing the core system. Users are not dependent on the CHAK team to support a platform — they can add it themselves at any time.

---

## Core Modules

### 1. Social Account Management

Users connect multiple social media accounts through an embedded browser inside the application. Sessions are stored encrypted in the database.

**Dashboard displays:**
- Connected accounts
- Followers
- Engagement
- Reach
- Views
- Messages
- Comments
- Notifications

### 2. Secure Account Connection System

Every platform has its own connector. Each connector independently handles authentication, publishing, analytics, and messaging.

**Three-Level Authentication Priority:**

| Level | Method | Status | Description |
|-------|--------|--------|-------------|
| 1 | Official API | Optional, preferred when available | Direct integration with platform API (e.g., YouTube, LinkedIn, Telegram) |
| 2 | OAuth 2.0 | Optional | Standard OAuth authorization flow (e.g., Facebook, Instagram, TikTok) |
| 3 | Embedded Browser Session | **Default / Original** | User logs in through a secure browser session managed by CHAK. The encrypted session is reused to automate permitted actions on behalf of the user |

**Default method (Level 3):** Embedded browser — user logs into the platform inside the CHAK app. Session cookies are captured, encrypted, and stored in the database. Works for any platform with a web interface, no API or OAuth setup required.

> **Disclaimer:** Whenever an unofficial connection method is used (Level 3), the user is clearly informed of the associated reliability and policy considerations before proceeding. This ensures transparency about how the connection works and any platform terms that may apply.

### 3. Content Management

Users can upload:
- Videos
- Images
- Carousels
- Text posts
- Stories (where supported)
- Shorts
- Reels

**Content may be:**
- Published immediately
- Saved as drafts
- Scheduled
- Republished
- Posted to multiple platforms simultaneously

### 4. AI Content Analyzer

Immediately after upload the AI analyzes:
- Topic
- Language
- Audience
- Quality
- Duration
- Products
- Objects
- Brand mentions
- Speech
- Keywords

The AI generates a content score.

### 5. AI Content Improvement

Before publishing AI suggests:
- Better hook
- Better title
- Better thumbnail
- Better opening
- Better CTA
- Better hashtags
- Better captions
- Better keywords
- Better descriptions

### 6. Caption Generator

Generate multiple caption styles:
- Professional
- Funny
- Educational
- Sales
- Storytelling
- Luxury
- Friendly

### 7. Smart Hashtags

Automatically generate:
- Trending hashtags
- Niche hashtags
- Brand hashtags
- Location hashtags
- Low competition hashtags

### 8. AI Scheduling

Automatically determine:
- Best posting day
- Best posting time
- Best platform
- Best audience segment

Users may override recommendations.

### 9. Multi-Platform Publishing

One upload can be adapted and published across supported platforms. The AI rewrites captions and formatting for each platform instead of posting identical content everywhere.

### 10. Draft Management

Unlimited drafts with:
- Folders
- Tags
- Search
- Version history
- Scheduled drafts

### 11. Content Calendar

Visual calendar showing:
- Scheduled posts
- Published posts
- Missed days
- Campaigns
- Holidays
- Marketing events

The AI recommends content to fill gaps.

### 12. AI Repurposing

Convert one piece of content into many formats.

**Examples:**
- Long video → TikTok, Instagram Reel, YouTube Short, Facebook Reel
- Video → LinkedIn post, Reddit discussion, Blog draft, X thread

### 13. Comment Management

AI reads every comment and categorizes them:
- Questions
- Complaints
- Praise
- Spam
- Sales inquiries
- Refund requests

### 14. AI Auto Reply

Automatically answer comments using a configurable business knowledge base.

**Example topics:**
- Pricing
- Shipping
- Business hours
- Product availability
- Refunds
- Contact information

Rules are customizable by the business.

### 15. DM Assistant

The AI manages customer conversations:
- Answer FAQs
- Collect customer information
- Qualify leads
- Escalate complex conversations
- Notify human staff when necessary

### 16. Lead Detection

The AI identifies purchase intent and recommends human follow-up when appropriate.

### 17. AI Growth Manager

Continuously monitors:
- Followers
- Views
- Reach
- Watch time
- Engagement
- Saves
- Shares
- Posting consistency
- Audience growth

Produces daily, weekly, and monthly reports.

### 18. AI Performance Coach

Explains why performance changes:

**Examples:**
- Weak opening hook
- Low retention
- Poor posting time
- Weak CTA
- Hashtag saturation

Provides actionable recommendations.

### 19. AI Content Planner

Suggests:
- Daily ideas
- Weekly plans
- Monthly campaigns
- Seasonal campaigns
- Trending topics
- Industry-specific content

### 20. Competitor Analysis

Track competitor public activity:
- Posting frequency
- Engagement
- Popular topics
- Best-performing posts
- Audience growth trends
- Content categories

### 21. AI Performance Prediction

Before publishing estimate:
- Expected reach
- Expected engagement
- Expected watch time
- Viral potential
- Suggested improvements

### 22. A/B Testing

Generate multiple variations of:
- Hooks
- Captions
- Titles
- Thumbnails
- CTAs

Measure results and learn from them.

### 23. Brand Learning

The AI continuously learns:
- Tone of voice
- Writing style
- Emoji preferences
- Brand personality
- Products
- Services
- Target audience
- Preferred CTAs

Future content aligns with the brand automatically.

### 24. Analytics Dashboard

**Metrics include:**
- Followers
- Reach
- Impressions
- Views
- Watch time
- Engagement rate
- Shares
- Saves
- CTR
- Top-performing content
- Platform comparisons

### 25. AI Alerts

Notify users about important events:

**Examples:**
- Engagement dropped
- Viral content detected
- Competitor surge
- Posting inconsistency
- Audience growth spike

Each alert includes explanations and recommendations.

### 26. AI Marketing Advisor

Users can ask natural-language questions:

- "Why did my engagement drop?"
- "What should I post tomorrow?"
- "Which platform performs best?"
- "Which audience is growing fastest?"
- "How can I increase sales from social media?"

The AI analyzes connected accounts and provides data-driven recommendations.

---

## New Capabilities (v1.1)

### 27. TikTok-Style Create Flow

A primary **Add (+) button** (like TikTok) opens a create surface that feels like uploading a video into Gemini and writing a prompt:

- Big media drop zone at the top — drag & drop or browse (video, image, carousel)
- A **prompt field** describing what to create (e.g. "Launch teaser, movie-trailer energy, for solo developers")
- A **caption field** (the AI rewrites it per platform)
- Platform multi-select, audience, and caption-style pickers
- An **output-scope selector** — *social + blog*, *social posts only*, or *blog only*

One click runs the whole workflow: learn context → analyze → adapt → review → publish.

### 28. Website URL Field (Context Source)

Every create form has a **Website / Product URL** field. It is **optional**, and it exists so the AI can learn a product it knows nothing about: given a URL, it scrapes the page and uses what it reads as the source of truth about the product.

- **Not required.** Uploaded documentation or a written description does the same job — see §29. Any one context source is enough.
- The owner is never blocked or nagged for a URL when the AI already understands the product.
- When a URL *is* provided, it doubles as the traffic destination: the AI points traffic back to it (link in bio, url field, first comment, or article body depending on platform rules).

### 29. Product Context & Documentation Upload

The owner teaches the AI about the product through **any** of these — they are interchangeable, and one is enough:

- Free-text description
- **Uploaded documentation** — PDF, DOC/DOCX, .md, .txt, and photos
- Website URL (scraped, see §28)

The purpose is the same in every case: the AI must know what the product is and why it is being posted about. If it does not have enough context, it asks (§30) rather than guessing.

### 30. AI Context Questioning — Never Guess

When the AI cannot confidently create on-brand content, it pauses the flow and asks targeted questions ("What is the product and who is it for?", "What problem does it solve?", "Do you have a URL or a doc I can read?"). The owner answers inline (or uploads docs) and the AI continues with the enriched context.

This applies **after planning too**. Once the AI has planned the content, anything it still needs — a product screenshot, a photo, a logo, a cover image for the blog, a demo video, a document — is requested on the review screen with the reason and what it is for ("blog cover", "Instagram carousel"). It never invents, assumes, or substitutes a visual or a product detail it was not given. Required requests block publishing until the owner uploads the asset or gives instructions for what to do instead.

### 31. Blog & Micro-Blog Generation with Approval

Long-form is a first-class output, not an add-on. The output-scope selector (§27) decides what a run produces:

- **Social + blog** — the AI suggests a companion blog / micro-blog alongside the posts (toggle, default **on**)
- **Social posts only** — no blog is written
- **Blog only** — the AI writes long-form and **nothing is posted to social media**; platform selection disappears from the form and no social variants are generated

When a blog is produced, the AI:

- Writes a long-form draft (title, intro, sections, CTA)
- Proposes destinations that fit long-form content — the owner approves each one; unapproved destinations stay drafts
- Asks for a cover image when the destination requires one (§30) instead of picking one itself

**The approval list shows the full destination catalog, not only the AI's picks** — your own site, dev.to, Hashnode, LinkedIn articles, Medium, Substack/newsletter, Reddit, and Product Hunt. The AI's suggestions are marked *AI pick*; the owner can approve anything else. Destinations with no write API (Product Hunt, Substack) are marked **manual**: Palius prepares a paste-ready kit or export and files it as a draft rather than pretending to schedule a publish.

All platform and destination lists in the UI come from one registry (`lib/platforms.ts`, mirroring the backend catalog), so every picker offers the same set — all eleven built-in social connectors plus every blog and launch destination.

### 32. AI Viral Research

The AI can search social media platforms and the internet for content ideas and posting styles, and figure out how to make content go viral. Given a topic/niche, it returns:

- **Trending themes**
- **Content ideas** (with hooks)
- **Posting styles / formats** that are winning
- **Virality tactics** (distribution & engagement)
- **Sources** of the findings + a strategic summary

### 33. Per-Platform Analytics

Analytics are available for **each individual platform** (TikTok, Instagram, LinkedIn, X, YouTube, Reddit, and custom):

- Followers, reach, impressions, views, engagement rate, saves, shares
- Best posting time + optimal posting frequency
- 60-day growth trend chart
- Top-performing content
- An AI summary explaining performance per platform

---

---

## Pricing & Business Model

*New in v1.2. Earlier revisions specified no commercial model at all.*

### What costs money to run

Marginal cost per operation spans four orders of magnitude:

| Operation | Vendor cost |
|---|---|
| One caption | ~$0.0001 |
| One blog draft | ~$0.05 |
| One image | ~$0.03 |
| One 8-second video clip (Veo 3 Fast, 1080p, with audio) | **~$2.20** |

One video clip costs more than five thousand captions. That gap decides the
entire pricing model.

### The split

**The subscription covers everything cheap. Credits cover generation only** —
the same way Claude handles image and video on Fable.

| Included in every plan, unmetered | Metered in credits |
|---|---|
| AI captions, hooks, hashtags, titles, descriptions | **AI image generation** |
| **Blog & micro-blog writing** | **AI video generation** |
| Publishing to every destination | |
| Content analysis, scoring, viral research | |
| Comment auto-reply, DM assistant, lead qualification | |
| Competitor tracking, analytics, performance coaching | |
| Scheduling, calendar, repurposing | |

Metering cheap operations only teaches customers to be afraid of the product.
Text is a fixed cost line (~$1.50-$15 per user per month by tier), absorbed by
the subscription.

### Plans

| Plan | Price | Media credits | Roughly buys | Worst-case margin |
|---|---|---|---|---|
| **Free** | $0 | 0 | No generation at all | — |
| **Solo** | $19/mo | 1,000 | ~3 clips or ~95 images | 71% |
| **Creator** | $49/mo | 2,900 | ~10 budget clips, ~4 premium, or ~280 images | 70% |
| **Business** | $149/mo | 9,600 | ~33 / ~15 / ~930 | 70% |
| **Agency** | $499/mo | 33,000 | ~113 / ~52 / ~3,190 | 71% |

"Worst-case margin" is the margin **when a customer burns 100% of their
allowance**. Never sell an allowance you cannot afford to have fully used.

**Free tier gets zero image and video generation.** It gets the entire rest of
the platform. The wall lands exactly at the expensive operations, which is also
the sharpest upgrade prompt available.

### Credits

- **1 credit = $0.01** of billable value
- Charged at **actual vendor cost x markup** (3x image, 2.5x video), plus a 15%
  failure allowance
- Rounded **up** — a fractional credit rounded down leaks money at scale
- Top-up packs: 1,000 for $12, 5,000 for $55, 15,000 for $150 (60-67% margin)

### Model choice is not restricted

Paid subscribers may use **any** image or video model. Price scales with the
model, so an expensive choice simply draws credits down faster. The markup is
what protects margin; an allowlist would only be packaging and would stop
customers using what they came for.

The system *recommends* by intent — exploring variations routes to cheap
draft-tier models, rendering a final routes to premium. Users discard roughly 8
of 10 explorations, so this default is the single largest lever on cost.

### Three protections against losses

1. **Per-operation margin floor.** No generation is ever sold at or below vendor
   cost. Unknown models bill at the most expensive known rate, never zero.
2. **Hard allowance.** Generation is refused when credits run out, never
   silently absorbed. Suspended accounts cannot spend.
3. **Exact counting.** Credits are reserved on the estimate, then reconciled
   against the units the provider *actually* returned. A request for 8 seconds
   that returns 9.2 is charged for 9.2.

---

## AI Media Generation

*New in v1.2. Image and video generation were previously described only as part
of the separate CHAK Studio product.*

### Image models

Selection weights **text-in-image fidelity** heavily — thumbnails, quote cards
and promo graphics all need legible words, and most models still garble text.

| Tier | Models |
|---|---|
| Draft | SDXL, FLUX.1 [schnell] |
| Standard | FLUX.1 [dev], Imagen 3, Gemini 2.5 Flash Image, Ideogram v3, Recraft v3 |
| Premium | GPT Image 1, FLUX 1.1 Pro, DALL-E 3 |

Best for text in image: **Ideogram v3**, then GPT Image 1. Best value for bulk:
**FLUX schnell** at ~$0.003.

### Video models

| Tier | Models | Notes |
|---|---|---|
| Draft | Wan 2.2, Runway Gen-3 Turbo | No audio; good for b-roll and motion tests |
| Standard | Kling 2.5, **Veo 3 Fast** | Veo 3 Fast is the value pick — native audio |
| Premium | Sora 2, Veo 3 | Launch campaigns and paid ads only |

Video is metered **per second**, never per clip.

---

## Platform Action Cycle

CHAK operates on a continuous cycle:
1. **Plan** — AI content planner and scheduling
2. **Create** — AI-assisted content creation and improvement
3. **Publish** — Multi-platform publishing and repurposing
4. **Analyze** — Performance analytics and competitor tracking
5. **Engage** — Comment and DM management with AI replies
6. **Learn** — Brand learning from results and feedback
7. **Improve** — Recommendations for better performance

This cycle repeats continuously, with each iteration making the AI smarter and the marketing more effective.

---

## CHAK Product Ecosystem

CHAK is an AI software ecosystem. Every product is built as a standalone application while seamlessly integrating with the others.

| Product | Description |
|---------|-------------|
| **CHAK Social Media OS** | Flagship product — AI-powered social media management |
| **CHAK Studio** | AI creative studio — images, video, thumbnails, scripts, voice |
| **CHAK Analytics** | Business intelligence — social, web, sales, campaign analytics |
| **CHAK Automations** | No-code visual AI workflow automation — build automations without writing code |
| **CHAK CRM** | AI-powered customer relationship management — leads from comments/DMs enter the sales pipeline automatically |
| **CHAK Commerce** | AI-powered e-commerce and social selling with live selling, product catalog, and payment integrations |

---

## Unified AI Brain

Every CHAK application connects to a shared AI intelligence layer. The AI learns business goals, brand voice, products, customer behavior, and marketing performance. Knowledge gained in one CHAK product benefits the others.

**Example:**
A product created in CHAK Commerce can automatically appear in CHAK Studio for promotional content, be scheduled through CHAK Social Media OS, tracked in CHAK Analytics, converted into leads in CHAK CRM, and trigger follow-up workflows in CHAK Automations.

---

## Unified Dashboard

Users sign in once and access all CHAK products.

**Dashboard sections:**
- Social Media
- Studio
- Analytics
- CRM
- Commerce
- Automations
- AI Assistant
- Notifications
- Billing
- Team Management

---

## AI Executive Assistant

At the center of the ecosystem is the CHAK AI Assistant.

**Users can ask:**
- "Create next week's content plan."
- "Generate an advert for my new product."
- "Why did sales drop this month?"
- "Reply to customer questions automatically."
- "Create a complete marketing campaign."
- "Design promotional graphics."
- "Generate a product video."
- "Find my highest-converting audience."
- "Recommend the best posting time."
- "Show today's business summary."

The assistant coordinates all CHAK applications to complete tasks end-to-end.

---

## Extensibility & User-Defined Platforms

CHAK is designed to be modified and expanded by its users — not just by the development team.

### Built to Be Extended

- **No platform gatekeeping** — Any website with a login form can be connected. The user decides what platforms to use, not the system.
- **No deploy required** — Custom connector scripts are stored in the database and loaded at runtime. A user can add a new platform from the UI in under a minute without touching code.
- **Script editor** — The app includes a built-in editor where users can write, test, and debug custom connector scripts with live browser preview.
- **Hot-reload** — Connector scripts take effect immediately. No server restart, no CI/CD pipeline, no pull request needed.

### Extensible Publishing Destinations

The same principle applies to blogs. The built-in destinations (dev.to,
Hashnode, LinkedIn, Reddit, Medium, your own site) are a convenience, not a
boundary. Discover a new site and connect it yourself, three ways:

1. **API mapping** — the site has a REST API. Describe it as JSON: endpoint,
   auth header, and which field names carry the title and body. No code.
2. **Browser session** — no API. Log in through the embedded browser; the
   encrypted session plus CSS selectors drive the compose form.
3. **Export** — nothing works, so the system hands back a formatted draft
   rather than losing the writing.

Destinations are stored in the database and read per request, so a new one is
live immediately.

### Community Sharing

Connector scripts can be exported as JSON files and shared with other CHAK users. Over time, a community library of connectors for long-tail platforms naturally grows, making the product more valuable for everyone.

---

## Security Requirements

- End-to-end encrypted credentials and session data
- AES-256-GCM encryption for all browser session cookies at rest
- Encrypted browser session storage
- Role-based access control
- Audit logs
- Multi-factor authentication (CHAK account)
- Secure encryption key management
- Regular security monitoring

---

## Scalability

- Modular connector architecture — new platforms added via browser automation scripts without modifying the core system
- Hot-loaded user scripts — custom connectors are stored in the database and loaded at runtime, enabling users to add platforms without any deployment
- Horizontal scaling of Playwright browser workers
- Redis-backed job queue for async operations (publishing, data collection, AI processing) *— not yet built*

---

## Backend Architecture

The backend is built in **Go with the Gin framework** (`backend/`), replacing the in-app API routes as the source of AI logic.

**Provider-agnostic AI layer** — the AI is not locked to one vendor:

| Provider | Env vars | Notes |
|----------|----------|-------|
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` | JSON mode via `responseMimeType` |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | JSON mode via `response_format` |
| DeepSeek | `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `DEEPSEEK_BASE_URL` | OpenAI-compatible |
| OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL` | OpenAI-compatible |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL` | Claude Messages API |
| Ollama / any OpenAI-compatible endpoint | `OLLAMA_*` or custom `OPENAI_BASE_URL` | Local or self-hosted |

Select with `AI_PROVIDER` (`auto` picks the first key that is set). Every endpoint degrades to deterministic fallback data when no key is configured, so the UI always works.

**Data layer** — one binary, two dialects. Production runs on **Neon
(Postgres)**; local development falls back to SQLite with no setup. Selected by
the presence of `DATABASE_URL`.

**Endpoints** (`/api/v1`):

| Group | Endpoints |
|---|---|
| Core | `health`, `config`, `context`, `content/analyze`, `content/generate`, `viral/research`, `analytics/:platform` |
| Billing | `billing/plans`, `billing/packs`, `billing/balance`, `billing/models` |
| Generation | `media/estimate`, `media/reserve`, `media/commit`, `media/fail`, `media/operations` |
| Publishing | `publish/destinations`, `publish/blog`, `publish/producthunt-kit`, `destinations/custom` |
| Admin *(bearer token)* | `admin/business`, `admin/models`, `admin/economics`, `admin/operations`, `admin/alerts`, `admin/ratecard`, `admin/plans`, `admin/users`, `admin/usage` |

**Pricing is data, not code.** The vendor rate card is overridable at runtime
via `PALIUS_RATE_CARD`, so a price change from any provider is a config edit
rather than a deploy. Automated tests fail the build if a rate change would
make any operation or plan lose money.

---

## Deployment

| Piece | Host |
|---|---|
| `apps/frontend` — product UI | **Vercel** |
| `apps/admin` — operator dashboard | **Vercel** (separate project, access-controlled) |
| `apps/backend` — Go + Gin API | **Render** (Docker) |
| Database | **Neon** — serverless Postgres |

The backend speaks both Postgres and SQLite, so local development needs no
setup while production runs on Neon. See `DEPLOYMENT.md` and `render.yaml`.

---

## Build Status

Honest accounting of what exists today.

### Built

Full product UI (8 views) · provider-agnostic AI layer with deterministic
fallbacks · TikTok-style create flow with product context and AI questioning ·
viral research · per-platform analytics · engagement hub and DM lead manager ·
**cost engine, credit ledger, exact metering, plan economics** · **admin
business dashboard** (revenue, margin, per-model spend, per-customer
profitability, live operations, rate card) · **blog publishing** to dev.to,
Hashnode, LinkedIn, Reddit, Medium, own site · **Product Hunt launch kit** ·
**user-defined publishing destinations** · admin authentication · CORS
allowlist · Neon/Postgres support · Vercel + Render deployment configs.

### Not yet built

| Component | Consequence |
|---|---|
| **End-user authentication** | `X-User-Id` is unverified — anyone can act as anyone. **Blocks public launch.** |
| **Multi-tenancy** (orgs, roles, seats) | Plans sell 3/10/50 seats that nothing enforces |
| Playwright browser engine + session encryption | Level 3 connectors are UI-only |
| Redis job queue | No scheduled publishing; the calendar is display-only |
| Media object storage | Generated video has nowhere to live |
| Payment provider | Plans are modelled and enforced, but not *sold* |

---

## Roadmap Notes (not yet spec'd)

- **Multi-account, same-platform login** — logging into the same platform with multiple accounts at the same time (e.g. 5 tabs, different accounts, one session). *Isolated from this PRD; full spec still to be provided.* This affects the session model and the per-plan account limits, so it should be specified before connected-account enforcement is built.
- **Product boundary: generation vs CHAK Studio.** Image and video generation are currently metered inside Social Media OS. If Studio ships as a standalone product, decide whether credits pool across the ecosystem or are per-product.

---

## Long-Term Vision

CHAK becomes the AI operating system for modern businesses. Instead of using separate tools for social media, design, analytics, CRM, commerce, and automation, businesses use one integrated platform where AI plans, creates, publishes, analyzes, sells, automates, and continuously improves operations.

The ultimate goal is to provide every business with an AI-powered digital team capable of handling day-to-day marketing and operational work while humans focus on strategy, creativity, and growth.
