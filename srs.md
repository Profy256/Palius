# CHAK Social Media OS — Software Requirements Specification

**Version:** 1.0
**Product:** CHAK Social Media OS
**Document Type:** Software Requirements Specification (SRS)

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) defines the functional and non-functional requirements for CHAK Social Media OS — an AI-powered platform that enables businesses, creators, and marketers to manage their entire social media presence from a single dashboard. The platform uses an embedded browser engine to interact with social platforms, eliminating dependency on official APIs.

### 1.2 Scope

CHAK Social Media OS is a web-based SaaS platform that provides:
- Social account connection via embedded browser (with optional API/OAuth support)
- AI-powered content creation and optimization
- Multi-platform publishing and scheduling
- Engagement management (comments, DMs) with AI auto-reply
- Analytics and performance tracking
- Competitor analysis
- Brand learning and AI marketing advisor
- Extensible connector system for any platform with a web interface

### 1.3 Definitions

| Term | Definition |
|------|------------|
| CHAK | The product name — Social Media OS |
| Connector | A module that handles authentication and actions for a specific social platform |
| Embedded Browser | A Playwright-controlled Chromium instance displayed inside the web app |
| Browser Session | Encrypted cookies and storage data captured after a user logs into a platform |
| Job queue | Redis-backed queue for async operations *(not yet built)* |
| Playwright | Browser automation library used to control Chromium |
| Connector Script | A JSON/YAML file mapping CSS selectors to actions for custom platforms |
| RBAC | Role-Based Access Control |
| LLM | Large Language Model (AI) |
| MFA | Multi-Factor Authentication |

### 1.4 References

- PRD.md — Product Requirements Document
- architecture.md — System Architecture Document

---

## 2. Overall Description

### 2.1 Product Perspective

CHAK Social Media OS is a standalone SaaS product and the flagship of the broader CHAK product ecosystem (Studio, Analytics, Automations, CRM, Commerce). It integrates with third-party social media platforms via browser automation.

### 2.2 User Characteristics

| Role | Description | Privileges |
|------|-------------|------------|
| Owner | Full access, billing, team management | All |
| Admin | Full access except billing | All except billing/delete org |
| Editor | Create, publish, schedule, engage | Content + engagement |
| Viewer | Read-only dashboards and analytics | View only |

### 2.3 Operating Environment

- **Frontend:** Modern web browsers (Chrome, Firefox, Safari, Edge)
- **Backend:** Go 1.25 on Linux (Render, Docker)
- **Browser Engine:** Headless Chromium (Playwright)
- **Database:** PostgreSQL 16
- **Cache/Queue:** Redis 7

### 2.4 Design and Implementation Constraints

- Backend is **Go 1.25 + Gin**; frontend and admin are **Next.js 15** (see `technical.md`)
- Production database is **Neon (Postgres)**; local development uses SQLite via a dialect layer
- All social platform interactions must go through the connector abstraction layer
- Browser session data must be encrypted at rest (AES-256-GCM)
- The connector system must support hot-loaded custom scripts without deployment
- Publishing destinations must be user-extensible without a deploy
- The system must support horizontal scaling of browser workers
- Long-running AI operations should be asynchronous via job queue *(queue not yet built — generation is currently synchronous)*
- **Every metered operation must be profitable.** No generation may be sold at or below vendor cost

### 2.5 Assumptions and Dependencies

- Users have valid accounts on the social platforms they connect
- Social platforms may update their UI, requiring connector script updates
- Browser automation is subject to platform anti-bot measures
- LLM API services (OpenAI, Anthropic) are available and responsive
- The embedded browser approach may not be permitted by some platform terms of service

---

## 3. Functional Requirements

### 3.1 Authentication & User Management

#### FR-01: User Registration
- **Description:** Users shall be able to create a CHAK account
- **Input:** Email, password, name
- **Validation:** Email format, password strength (min 8 chars, mixed case, number)
- **Output:** JWT access token (15 min) + refresh token (7 days)

#### FR-02: User Login
- **Description:** Users shall authenticate with email and password
- **Input:** Email, password
- **Output:** JWT access token + refresh token

#### FR-03: Multi-Factor Authentication (MFA)
- **Description:** Users shall be able to enable TOTP-based MFA on their account
- **Enforcement:** Org owners may require MFA for all members

#### FR-04: Role-Based Access Control
- **Description:** Each org member shall have a role (owner, admin, editor, viewer)
- **Enforcement:** All API endpoints must check RBAC permissions

#### FR-05: Organization Management
- **Description:** Users shall create or join organizations
- **Features:** Invite members, transfer ownership, leave org

### 3.2 Social Account Connection

#### FR-06: Connect Account via Embedded Browser (Level 3)
- **Description:** Users shall connect a social platform account by logging in through an embedded Playwright browser
- **Flow:**
  1. User selects platform (built-in or custom)
  2. System spawns a Playwright browser pointing to the platform login URL
  3. Browser viewport streams to the user via WebSocket
  4. User interacts with the browser (types credentials, completes 2FA)
  5. Upon successful login, system captures cookies, localStorage, and sessionStorage
  6. Data is encrypted (AES-256-GCM) and stored in `connected_accounts`
  7. System verifies the session by navigating to the profile page

#### FR-07: Connect Account via OAuth (Level 2)
- **Description:** Users shall be able to connect accounts via standard OAuth 2.0 flow where available
- **Flow:** Redirect to platform OAuth page → user authorizes → callback receives tokens

#### FR-08: Connect Account via Official API (Level 1)
- **Description:** Users shall be able to connect accounts using official API keys where the platform provides them

#### FR-09: Unofficial Method Disclaimer
- **Description:** When connecting via Level 3 (browser session), the system shall display a clear disclaimer informing the user about the unofficial nature of the connection and associated reliability/policy considerations
- **Action Required:** User must acknowledge before proceeding

#### FR-10: Disconnect Account
- **Description:** Users shall remove a connected account
- **Action:** Delete encrypted session data from database, revoke any tokens

#### FR-11: Session Health Check
- **Description:** The system shall periodically verify each connected account's session is still valid
- **Schedule:** Every 6 hours via background worker
- **Action:** If session expired, mark account status as "expired" and notify user

### 3.3 Custom / Unlisted Platforms

#### FR-12: Add Custom Platform
- **Description:** Users shall add any website as a social platform by providing a name and login URL
- **Input:** Platform name, login URL, optional home URL for verification
- **Output:** Custom platform appears in the account list, ready for connection

#### FR-13: Custom Connector Script
- **Description:** Users shall upload or write a JSON connector script that maps CSS selectors to actions
- **Supported actions:** publish, getComments, replyToComment, getMessages, sendMessage, getAnalytics
- **Storage:** Script stored in `connector_scripts` table, loaded at runtime

#### FR-14: Connector Script Editor
- **Description:** In-app editor for writing, testing, and debugging custom connector scripts
- **Features:** Syntax highlighting, live browser preview, test execution

#### FR-15: Export/Import Connector Script
- **Description:** Users shall export connector scripts as JSON files and import scripts from other users
- **Format:** Standard JSON schema with versioning

### 3.4 Content Management

#### FR-16: Create Content
- **Description:** Users shall create content items (video, image, carousel, text, story)
- **Fields:** Title, caption, media files, hashtags, folder, tags
- **Media upload:** Images (JPG, PNG, GIF, WebP), Videos (MP4, MOV, AVI), max 2 GB

#### FR-17: AI Content Analysis
- **Description:** Upon upload, the AI shall analyze the content and generate a score
- **Analysis:** Topic, language, audience, quality, duration, products, objects, brand mentions, speech, keywords
- **Output:** Content score (0-100), analysis metadata stored in JSONB

#### FR-18: AI Content Improvement
- **Description:** Before publishing, the AI shall suggest improvements
- **Suggestions:** Better hook, title, thumbnail, opening, CTA, hashtags, captions, keywords, descriptions

#### FR-19: Caption Generator
- **Description:** Generate captions in multiple styles
- **Styles:** Professional, funny, educational, sales, storytelling, luxury, friendly
- **Output:** Multiple caption options per style

#### FR-20: Smart Hashtag Generator
- **Description:** Automatically generate hashtags
- **Categories:** Trending, niche, brand, location, low competition
- **Count:** 5-30 hashtags per set, configurable

#### FR-21: Draft Management
- **Description:** Save unlimited drafts with folder organization
- **Features:** Folders, tags, search, version history, scheduled drafts

#### FR-22: Content Calendar
- **Description:** Visual calendar displaying scheduled and published content
- **Elements:** Scheduled posts, published posts, missed days, campaigns, holidays, marketing events
- **AI feature:** Recommend content to fill gaps in the calendar

#### FR-23: AI Content Repurposing
- **Description:** Convert one piece of content into multiple formats for different platforms
- **Example:** Long video → TikTok, Instagram Reel, YouTube Short, Facebook Reel, LinkedIn post, Reddit discussion, Blog draft, X thread

### 3.5 Publishing & Scheduling

#### FR-24: Publish Immediately
- **Description:** Publish content to one or more connected accounts immediately
- **Action:** Queue a Playwright action job for each account
- **AI adaptation:** Rewrite caption and formatting for each platform

#### FR-25: Schedule Post
- **Description:** Schedule content for future publication
- **Input:** Content, accounts, scheduled time
- **AI Scheduling:** Automatically determine best day, time, and platform (user may override)

#### FR-26: Multi-Platform Publishing
- **Description:** One upload adapted and published across multiple platforms simultaneously
- **Feature:** AI rewrites captions and formatting per platform

#### FR-27: Cancel Scheduled Post
- **Description:** Remove a scheduled post before it publishes
- **Condition:** Only if status is "pending"

#### FR-28: Republish Content
- **Description:** Republish previously published content to new platforms or at new times

### 3.6 Engagement Management

#### FR-29: Read Comments
- **Description:** Fetch and display comments from all connected accounts
- **Features:** Unified inbox, filter by platform, sentiment, status, date

#### FR-30: AI Comment Categorization
- **Description:** AI shall categorize each comment
- **Categories:** Questions, complaints, praise, spam, sales inquiries, refund requests

#### FR-31: Comment Sentiment Analysis
- **Description:** AI shall determine sentiment of each engagement
- **Values:** Positive, negative, neutral

#### FR-32: AI Auto Reply
- **Description:** AI shall automatically reply to comments based on business knowledge base
- **Configurable:** Which comment categories trigger auto-reply, reply templates, escalation rules
- **Knowledge base:** Pricing, shipping, business hours, product availability, refunds, contact info

#### FR-33: Manual Reply
- **Description:** Users shall manually reply to comments from within CHAK
- **Flow:** Reply text → queued as Playwright action → posted to platform

#### FR-34: DM Management
- **Description:** Unified inbox for direct messages from all connected accounts
- **AI Features:** Answer FAQs, collect customer info, qualify leads, escalate complex conversations, notify human staff

#### FR-35: Lead Detection
- **Description:** AI shall identify purchase intent from engagements
- **Output:** Lead score (0-100), recommendation (e.g., "Human follow-up recommended")

### 3.7 Analytics & Reporting

#### FR-36: Analytics Dashboard
- **Description:** Display key metrics for all connected accounts
- **Metrics:** Followers, reach, impressions, views, watch time, engagement rate, shares, saves, CTR

#### FR-37: Data Collection
- **Description:** Background worker shall periodically collect analytics data from each connected account
- **Frequency:** Daily (configurable)
- **Storage:** `analytics_snapshots` table with date-partitioned data

#### FR-38: AI Growth Manager
- **Description:** Monitor growth trends and produce reports
- **Monitoring:** Followers, views, reach, watch time, engagement, saves, shares, posting consistency, audience growth
- **Reports:** Daily, weekly, monthly

#### FR-39: AI Performance Coach
- **Description:** Explain performance changes and recommend improvements
- **Analysis:** Weak opening hook, low retention, poor posting time, weak CTA, hashtag saturation

#### FR-40: Competitor Analysis
- **Description:** Track competitor public activity
- **Data:** Posting frequency, engagement, popular topics, best-performing posts, audience growth, content categories

#### FR-41: AI Performance Prediction
- **Description:** Estimate content performance before publishing
- **Predictions:** Expected reach, engagement, watch time, viral potential, suggested improvements

#### FR-42: AI Alerts
- **Description:** Notify users about important events
- **Events:** Engagement drop, viral content, competitor surge, posting inconsistency, audience growth spike
- **Format:** Alert with explanation and recommendation

#### FR-43: A/B Testing
- **Description:** Generate variations and measure results
- **Variations:** Hooks, captions, titles, thumbnails, CTAs

### 3.8 AI & Intelligence

#### FR-44: AI Marketing Advisor
- **Description:** Natural-language Q&A about social media performance
- **Example questions:**
  - "Why did my engagement drop?"
  - "What should I post tomorrow?"
  - "Which platform performs best?"
  - "Which audience is growing fastest?"
  - "How can I increase sales from social media?"

#### FR-45: Brand Learning
- **Description:** AI shall continuously learn brand preferences
- **Learns:** Tone of voice, writing style, emoji preferences, brand personality, products, services, target audience, preferred CTAs
- **Storage:** `brand_profiles` table with vector embeddings

#### FR-46: AI Content Planner
- **Description:** Suggest content ideas and plans
- **Suggestions:** Daily ideas, weekly plans, monthly campaigns, seasonal campaigns, trending topics, industry-specific content

#### FR-47: Multi-Provider LLM Support
- **Description:** Support multiple LLM providers with automatic fallback
- **Primary:** OpenAI GPT-4o
- **Secondary:** Anthropic Claude 3.5 Sonnet
- **Fallback:** Mistral / Llama 3
- **Cost optimization:** GPT-4o-mini for simple tasks

### 3.9 Connector System

#### FR-48: Connector Interface
- **Description:** All platform connectors must implement the standard connector interface
- **Methods:**
  - `authenticate(credentials): Session`
  - `refreshToken(session): Session`
  - `publish(content): PostResult`
  - `getComments(postId, cursor?): Paginated<Comment>`
  - `replyToComment(commentId, text): Reply`
  - `getConversations(cursor?): Paginated<Conversation>`
  - `sendMessage(conversationId, text): Message`
  - `getAnalytics(period): AnalyticsData`
  - `getProfile(): Profile`
  - `getNotifications(cursor?): Paginated<Notification>`
  - `uploadMedia(media): MediaAsset`
  - `deletePost(postId): void`
  - `isLoggedIn(page): boolean`

#### FR-49: Built-In Connectors
- **Description:** The system shall ship with pre-built connectors for: TikTok, Instagram, Facebook, Reddit, X (Twitter), LinkedIn, Threads, Pinterest, YouTube, WhatsApp Business, Telegram

#### FR-50: Connector Script Loading
- **Description:** Custom connector scripts stored in the database shall be loaded at runtime without server restart
- **Caching:** Scripts cached in Redis with 1-hour TTL

### 3.10 Background Jobs

#### FR-51: Job Queue
- **Description:** All async operations shall go through the job queue *(not yet built — generation and publishing are currently synchronous)*
- **Queues:**
  - `publishing` — High priority
  - `engagement` — High priority
  - `analytics-collection` — Low priority
  - `ai-processing` — Medium priority
  - `session-verification` — Low priority
  - `notification` — High priority

#### FR-52: Job Retry
- **Description:** Failed jobs shall be retried with exponential backoff
- **Max retries:** 3 for publishing, 5 for data collection
- **Dead letter:** Failed jobs moved to dead letter queue for manual inspection

---

### 3.11 Billing, Credits & Metering

The subscription covers the platform. Only AI **image** and **video**
generation are metered, in credits, in the manner of Claude's Fable credits.

#### FR-60: Subscription Plans
- **Description:** The system shall offer tiered plans (Free, Solo, Creator, Business, Agency)
- **Included unmetered:** captions, hooks, hashtags, titles, **blog and micro-blog writing**, publishing, content analysis, viral research, comment auto-reply, DM assistant, scheduling, analytics, repurposing
- **Metered:** AI image generation, AI video generation

#### FR-61: Credit Allowance
- **Description:** Each paid plan shall include a monthly media-credit allowance
- **Unit:** 1 credit = $0.01 of billable value
- **Grant:** idempotent per calendar period — granting twice in one month grants once
- **Free tier:** zero credits and generation disabled; text remains fully available

#### FR-62: Cost Estimation
- **Description:** The system shall show the credit cost of a generation before it runs
- **Endpoint:** `POST /media/estimate` — read-only, no reservation
- **Output:** credits, vendor cost, resulting balance, affordability, whether confirmation is required

#### FR-63: Credit Reservation
- **Description:** Credits shall be held before a job is dispatched to a provider
- **Refuse when:** balance insufficient (HTTP 402), plan excludes media (403), monthly unit cap reached, account not active
- **Confirmation:** operations above the plan's threshold require explicit `confirmed: true`
- **Idempotency:** a repeated `idempotencyKey` returns the original operation without a second hold

#### FR-64: Actual-Usage Reconciliation
- **Description:** On completion the charge shall be recomputed from the units the provider **actually** returned, not the estimate
- **Rationale:** a request for 8 seconds may return 9.2; charging the estimate loses the difference on every overrun

#### FR-65: Failure Handling
- **Description:** A failed generation shall release its hold and charge the customer nothing
- **Vendor-billed failures:** cost is booked to the operator, funded by the failure allowance inside every price, and recorded for reporting

#### FR-66: Margin Floor
- **Description:** No operation shall be sold at or below vendor cost
- **Enforcement:** effective markup checked against `MinMarkup` at charge time; violations write a `margin_alert` and refuse the reservation
- **Unknown models:** billed at the most expensive known rate for their modality, never zero

#### FR-67: Credit Ledger
- **Description:** All credit movement shall be recorded as append-only signed entries
- **Balance:** computed as `SUM(delta)`; no mutable balance column
- **Kinds:** grant, purchase, hold, release, charge, refund, expire, adjust

#### FR-68: Overage & Credit Packs
- **Description:** Users shall purchase additional credits when the allowance is exhausted
- **Constraint:** overage and pack pricing must exceed blended vendor cost

#### FR-69: Model Selection
- **Description:** Users on paid plans shall choose any image or video model
- **Constraint:** price scales with the model; the markup, not an allowlist, protects margin
- **Default:** the system recommends by intent — exploration routes to draft-tier models, finals to standard/premium

### 3.12 AI Media Generation

#### FR-70: Image Generation
- **Models:** SDXL, FLUX schnell/dev/Pro, Imagen 3, Gemini Flash Image, Ideogram v3, Recraft v3, GPT Image 1, DALL-E 3
- **Metered by:** image count x quality tier
- **Selection criteria:** text-in-image fidelity is weighted heavily — thumbnails and quote cards need legible words

#### FR-71: Video Generation
- **Models:** Wan 2.2, Runway Gen-3 Turbo, Kling 2.5, Veo 3 Fast, Sora 2, Veo 3
- **Metered by:** **seconds** x resolution multiplier x clip count, plus audio where supported
- **Constraint:** must never be metered per-clip — a 20s request costs four times a 5s one

#### FR-72: Generation Cost Transparency
- **Description:** The UI shall display credit cost per model before selection, and remaining balance after

### 3.13 Blog Publishing Destinations

#### FR-73: Built-in Destinations
- **Targets:** dev.to, Hashnode, LinkedIn, Reddit, Medium, own site (webhook)
- **Canonical URL:** every adapter that supports it shall set the canonical back to the owner's domain
- **Reddit:** requires an explicit subreddit and posts a discussion, never an advert

#### FR-74: Product Hunt Launch Kit
- **Description:** The system shall generate a paste-ready launch kit
- **Rationale:** Product Hunt's API is read-only for launches; submission is manual by design
- **Output:** tagline (60 char), description (260 char), maker's first comment, topics, gallery specs, timing checklist
- **Tracking:** the read API shall provide live vote/comment counts for your launch and competitors'

#### FR-75: User-Defined Destinations
- **Description:** Users shall add any publishing target without a deploy
- **Modes:** `api` (JSON endpoint + field mapping), `browser` (embedded-browser login + CSS selectors), `export`
- **Storage:** `custom_destinations`, read per request

#### FR-76: Never Lose a Draft
- **Description:** Any destination that is unconfigured or fails shall return a formatted export rather than discarding the writing

### 3.14 Product Context & Output Scope

#### FR-77: Product Context Sources
- **Description:** The owner shall be able to teach the AI about the product through any of three interchangeable sources
- **Sources:** free-text description · uploaded documentation (PDF, DOC/DOCX, .md, .txt, photos) · website/product URL
- **Sufficiency:** any single source shall be enough to proceed; none is individually mandatory
- **Purpose:** the AI must understand what the product is and why it is being posted about before it writes anything

#### FR-78: Website URL as a Context Source
- **Description:** The website/product URL field shall be optional and shall exist primarily so the AI can learn a product it has no context for
- **Behavior:** when a URL is supplied the system shall scrape the page and treat the scraped content as the source of truth about the product
- **Secondary use:** when supplied, the URL is also the traffic destination (link in bio, url field, first comment, or article body per platform rules)
- **Constraint:** the system shall not require or nag for a URL when context was already provided by description or documents

#### FR-79: Output Scope Selection
- **Description:** The owner shall choose what a create run produces
- **Modes:** `both` (social posts + companion blog) · `social` (posts only, no blog) · `blog` (long-form only)
- **Blog-only:** the system shall generate no social variants, shall hide platform selection, and shall publish nothing to social media
- **Rationale:** some owners only ever want blogs; social publishing shall never be assumed

#### FR-80: Post-Planning Asset Requests
- **Description:** After planning content, the AI shall request any asset it still needs rather than substituting one
- **Assets:** product screenshot, photo, logo, blog cover image, demo video, document
- **Payload:** each request carries `type`, `reason`, `required`, and `for` (what it is needed for, e.g. "blog cover")
- **Constraint:** the AI shall never invent, assume, or substitute a visual or product detail it was not given — including stock imagery for a required blog cover
- **Blocking:** publishing shall be blocked while a `required` request is unfulfilled; the owner satisfies it by uploading the asset or giving instructions instead

---

## 4. External Interface Requirements

### 4.1 User Interfaces

#### UI-01: Dashboard Shell
- Persistent sidebar with navigation to all sections
- Top bar with organization switcher, search, notifications, user menu
- Responsive design (desktop-first, tablet-supported)

#### UI-02: Embedded Browser View
- Displays the Playwright browser viewport streamed via WebSocket
- User can click, type, and navigate within the viewport
- Status indicator showing connection state
- Controls: refresh, back, forward, close

#### UI-03: Content Editor
- Rich text editor for captions
- Media upload (drag and drop, file picker)
- AI suggestion panel (side drawer)
- Multi-platform preview
- Scheduling date/time picker

#### UI-04: Content Calendar
- Month/week/day views
- Drag and drop to reschedule
- Color-coded by platform and status
- AI suggestion indicators

#### UI-05: Unified Inbox
- Threaded comment and DM view
- Filter by platform, status, sentiment
- Quick reply box with AI suggestion
- Lead score badge

#### UI-06: Analytics Dashboard
- Date range selector
- Metric cards with trend indicators
- Charts (line, bar, pie) for each metric
- Platform comparison view
- Export to PDF/CSV

#### UI-07: Connector Script Editor
- Code editor with syntax highlighting
- Live browser preview
- Test execution with results
- Save/publish script

### 4.2 Hardware Interfaces

- **Browser Workers:** Linux x86_64 with minimum 2 GB RAM per worker (required for Chromium)
- **Storage:** SSD for database, S3-compatible for media
- **Network:** Minimum 100 Mbps for browser worker nodes

### 4.3 Software Interfaces

#### SI-01: LLM Provider API
- **Provider:** OpenAI, Anthropic, Together AI
- **Protocol:** REST/HTTPS with API key authentication
- **Fallback:** Automatic retry with next provider on failure

#### SI-02: Media Storage
- **Provider:** Cloudinary or S3-compatible
- **Interface:** REST API with signed URLs
- **Transformations:** Server-side image/video resizing, thumbnails

#### SI-03: Email Service
- **Provider:** SendGrid / Resend
- **Use cases:** Welcome emails, password reset, alerts, invites
- **Queue:** Via the job queue *(not yet built)*

#### SI-04: WebSocket
- **Protocol:** WebSocket over WSS
- **Channels:**
  - `/ws/browser/:sessionId` — Browser viewport stream
  - `/ws/notifications` — Real-time alerts
  - `/ws/job/:jobId` — Job status updates

### 4.4 Communication Interfaces

- **API Protocol:** REST over HTTPS (JSON)
- **Auth Header:** `Authorization: Bearer <JWT>`
- **Rate Limiting:**
  - Authenticated: 100 req/min per user
  - Unauthenticated: 20 req/min per IP
  - AI endpoints: 30 req/min per user
  - Publishing endpoints: 10 req/min per user

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Requirement | Target |
|-------------|--------|
| Page load time (initial) | < 2 seconds |
| Page load time (subsequent) | < 500ms (cached) |
| Content publish latency | < 2 minutes from queue to published |
| Comment fetch latency | < 5 seconds |
| AI caption generation | < 10 seconds |
| Analytics dashboard load | < 3 seconds |
| Browser session startup | < 3 seconds |
| Concurrent browser sessions per worker | 3-4 |

### 5.2 Scalability

- Must support horizontal scaling of browser workers (add more Render instances)
- Database must support read replicas for analytics queries
- Job queues must support multiple consumers
- File upload must scale independently via S3/Cloudinary
- Must handle minimum 1,000 connected accounts per org

### 5.3 Availability

- **Target uptime:** 99.5%
- **Planned maintenance:** < 4 hours/month
- **Browser worker failure:** Auto-restart via Render health checks
- **Database:** Automated daily backups with 7-day retention
- **Queue persistence:** jobs persisted in Redis with AOF

### 5.4 Security

#### SEC-01: Encryption at Rest
- All browser session cookies encrypted with AES-256-GCM
- Database connections encrypted (TLS 1.3)
- Media files encrypted at rest by Cloudinary/S3

#### SEC-02: Encryption in Transit
- All API traffic over TLS 1.3
- WebSocket connections over WSS

#### SEC-03: Authentication
- JWT access tokens: 15-minute expiry
- JWT refresh tokens: 7-day expiry with rotation
- MFA via TOTP (optional per user, enforceable by org owner)

#### SEC-04: Authorization
- RBAC enforced at API gateway and service level
- Row-level security: users can only access their org's data

#### SEC-05: Session Security
- Browser session data decrypted only in-memory during use
- Playwright containers destroyed after each action
- No persistent storage in browser containers

#### SEC-06: Audit Logging
- All mutations logged with: user, action, resource, timestamp, IP
- Log retention: 90 days
- Log storage: PostgreSQL (structured) + Elasticsearch (search)

#### SEC-07: Secret Management
- All API keys and encryption keys in Render environment secrets
- No secrets in code or database
- Key rotation policy: every 90 days

### 5.5 Reliability

- **Data durability:** Daily PostgreSQL backups, point-in-time recovery
- **Job reliability:** retry with exponential backoff and a dead-letter queue
- **Browser actions:** Screenshot on failure for debugging
- **Graceful degradation:** AI features degrade gracefully if LLM API is unavailable

### 5.6 Usability

- **Onboarding:** Guided setup wizard for new users
- **Empty states:** Helpful messages when no data exists
- **Error messages:** Human-readable, actionable error messages
- **Undo:** Support undo for destructive actions where feasible (delete content, cancel schedule)

### 5.7 Maintainability

- **Modular architecture:** Each connector and service independently deployable
- **Code standards:** TypeScript strict mode, ESLint, Prettier
- **Testing:**
  - Unit tests: minimum 80% coverage
  - Integration tests for all API endpoints
  - E2E tests for critical flows (login, connect account, publish)
- **Documentation:** Self-documenting API with OpenAPI spec

### 5.8 Unit Economics

- Every paid plan shall clear a 70% gross margin **at 100% allowance consumption**
- Per-operation margin shall not fall below 50%
- Vendor prices shall be overridable at runtime without a redeploy (`PALIUS_RATE_CARD`)
- Automated tests shall fail the build if any operation or plan becomes loss-making

### 5.9 Extensibility

- New platforms added via connector scripts without code changes
- Connector scripts hot-loaded from database at runtime
- Custom connector scripts do not require server restart
- Plugin system for future third-party extensions

### 5.10 Browser Automation Constraints

- Must use realistic user agents and viewport sizes
- Must implement random delays between actions (human-like behavior)
- Must support configurable proxy per account
- Must detect and handle CAPTCHA challenges (notify user)
- Must handle 2FA by streaming browser to user in real-time
- Must gracefully degrade on UI changes (log error, notify user)

---

## 6. Data Requirements

### 6.1 Data Models

See architecture.md for full database schema.

### 6.2 Data Retention

| Data Type | Retention | Rationale |
|-----------|-----------|-----------|
| User accounts | Indefinite (until deleted) | Account persistence |
| Connected account sessions | Indefinite (until disconnected or expired) | Ongoing access needed |
| Content drafts | 1 year after last edit | Cleanup stale drafts |
| Scheduled posts | 90 days after publish | Historical reference |
| Engagements (comments/DMs) | 2 years | Customer relationship history |
| Analytics snapshots | 2 years | Trend analysis |
| Audit logs | 90 days | Security compliance |
| AI conversations | 1 year | Context for AI assistant |
| Browser session cookies | Until user disconnects or session expires | Authentication |
| Media files | Until associated content is deleted | Storage cost |

### 6.3 Data Deletion

- Account deletion: all user data permanently deleted within 30 days
- Org deletion: all org data permanently deleted within 30 days
- Cookie deletion: immediate on account disconnect
- Soft delete supported for recoverable data (content, schedules)

---

## 7. Browser Engine Requirements

### 7.1 Playwright Configuration

- **Browser:** Chromium (headless)
- **Pool size:** 3-4 concurrent browsers per worker
- **Context isolation:** Each account action in a separate browser context
- **Viewport:** 1920x1080 (configurable per platform)
- **User agent:** Real device user agents, rotated periodically

### 7.2 Stealth Requirements

- Random mouse movements (Playwright Stealth plugin)
- Random viewport jitter (+/- 5px)
- Realistic scroll behavior
- WebDriver flag elimination
- Canvas fingerprint randomization
- Audio context spoofing
- Consistent timezone/language/geolocation per session

### 7.3 Error Handling

- Screenshot capture on any failure
- DOM snapshot on failure for debugging
- Error classification: network error, session expired, UI changed, CAPTCHA, unknown
- Automatic retry with exponential backoff for transient errors

---

## 8. Glossary

| Term | Definition |
|------|------------|
| AES-256-GCM | Advanced Encryption Standard 256-bit with Galois/Counter Mode |
| Job queue | Redis-backed queue for async operations *(not yet built)* |
| JWT | JSON Web Token |
| MFA | Multi-Factor Authentication |
| OAuth | Open Authorization protocol |
| Playwright | Browser automation library by Microsoft |
| RBAC | Role-Based Access Control |
| RAG | Retrieval-Augmented Generation (AI pattern) |
| REST | Representational State Transfer |
| SRS | Software Requirements Specification |
| TOTP | Time-based One-Time Password |
| WSS | WebSocket Secure |
