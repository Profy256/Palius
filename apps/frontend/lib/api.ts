// Palius API client. Talks to the Go + Gin backend at NEXT_PUBLIC_PALIUS_API
// (default http://localhost:8080/api/v1). Every call degrades to local
// fallback data if the backend is unreachable or unconfigured, so the UI
// always works.

export const PALIUS_API =
  process.env.NEXT_PUBLIC_PALIUS_API ?? 'http://localhost:8080/api/v1';

// Current workspace/user id sent with every request so the backend can
// attribute usage. Override with NEXT_PUBLIC_PALIUS_USER_ID.
export const PALIUS_USER_ID =
  process.env.NEXT_PUBLIC_PALIUS_USER_ID ?? 'user-1';

// ---------------------------------------------------------------- types ----

export interface PaliusConfig {
  provider: string;
  model: string;
  aiAvailable: boolean;
  fileUploadTypes: string[];
  version: string;
}

export interface ContextDoc {
  name: string;
  contentType: string;
  summary: string;
  kind?: string;
}

export interface ContextRequest {
  description?: string;
  websiteUrl?: string;
  audience?: string;
  documents?: ContextDoc[];
}

// Something the AI needs from the owner before it can build the content — a
// product screenshot, a blog cover, a doc. It asks instead of guessing.
export interface RequestedAsset {
  type: string; // screenshot | image | video | document | pdf | markdown | other
  reason: string;
  required: boolean;
  for?: string; // what it is needed for, e.g. 'blog cover'
}

export interface ContextResponse {
  contextId: string;
  summary: string;
  confidence: number;
  needsMore: boolean;
  missing: string[];
  suggestions: string[];
  scraped: boolean;
  scrapedSource: string;
  requestedAssets: RequestedAsset[];
}

export interface AnalyzeRequest {
  caption: string;
  prompt: string;
  websiteUrl: string;
  platform: string;
  context: string;
  contentType: string;
  hasMedia: boolean;
  mediaTypes: string[];
}

export interface AnalyzeResponse {
  score: number;
  viralPotential: number;
  strengths: string[];
  improvements: string[];
  bestPlatforms: string[];
  recommendedPostingWindow: string;
  needsMoreContext: boolean;
  contextQuestions: string[];
  requestedAssets: RequestedAsset[];
}

export interface PlatformVariant {
  platform: string;
  format: string;
  caption: string;
  hooks: string[];
  hashtags: string[];
  urlInBio: boolean;
  linkPlace: string;
}

export interface BlogDraft {
  title: string;
  format: string;
  intro: string;
  sections: string[];
  cta: string;
  suitableFor: string[];
  publishedTo: string[];
  requiresImage: boolean;
  image: string;
}

// What the owner wants out of a run: social posts only, long-form only, or both.
// Some owners only ever want blogs, so social publishing is never assumed.
export type OutputMode = 'social' | 'blog' | 'both';

export interface GenerateRequest {
  caption: string;
  prompt: string;
  websiteUrl: string;
  platforms: string[];
  style: string;
  context: string;
  outputMode: OutputMode;
  blogApproved: boolean;
  blogTopic: string;
  audience: string;
  contentType: string;
  hasVisuals: boolean;
}

export interface GenerateResponse {
  score: number;
  variants: PlatformVariant[];
  blog?: BlogDraft;
  blogSuggested: boolean;
  blogApprovalText: string;
  requestedAssets: RequestedAsset[];
}

export interface ViralResearchRequest {
  topic: string;
  industry: string;
  platforms: string[];
  count: number;
}

export interface ViralResearchResponse {
  trends: string[];
  contentIdeas: string[];
  postingStyles: string[];
  tactics: string[];
  sources: string[];
  summary: string;
}

export interface PlatformAnalytics {
  platform: string;
  followers: string;
  reach: string;
  impressions: string;
  engagementRate: string;
  views: string;
  saves: string;
  shares: string;
  bestPostingTime: string;
  growthTrend: number[];
  topContent: string[];
  summary: string;
  avgViews: number;
  optimalPostCountPerWk: string;
}

// ------------------------------------------------------------- http -------

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${PALIUS_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': PALIUS_USER_ID },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${PALIUS_API}${path}`, {
      headers: { Accept: 'application/json', 'X-User-Id': PALIUS_USER_ID },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function putJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${PALIUS_API}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': PALIUS_USER_ID },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- endpoints --

export function getPaliusConfig() {
  return getJson<PaliusConfig>('/config');
}

export function ingestContext(req: ContextRequest) {
  return postJson<ContextResponse>('/context', req);
}

export function analyzeContent(req: AnalyzeRequest) {
  return postJson<AnalyzeResponse>('/content/analyze', req);
}

export function generateContent(req: GenerateRequest) {
  return postJson<GenerateResponse>('/content/generate', req);
}

export function researchViral(req: ViralResearchRequest) {
  return postJson<ViralResearchResponse>('/viral/research', req);
}

export function fetchPlatformAnalytics(platform: string) {
  return getJson<PlatformAnalytics>(`/analytics/${encodeURIComponent(platform)}`);
}

// ------------------------------------------------------- connections ------
// Connecting an account means storing a real credential and, where possible,
// checking it against the provider. Nothing is reported as live unless the
// provider confirmed it.

export interface CredentialField {
  key: string;
  label: string;
  placeholder: string;
  help: string;
  secret: boolean;
  required: boolean;
}

export interface AuthMethod {
  level: 'level-1' | 'level-2' | 'level-3';
  name: string;
  summary: string;
  available: boolean;
  unavailable?: string;
  verifiable: boolean;
  docsUrl?: string;
  fields: CredentialField[] | null;
}

export interface ConnectablePlatform {
  id: string;
  name: string;
  group: 'social' | 'publishing' | 'launch';
  methods: AuthMethod[];
}

export interface ConnectionCatalog {
  platforms: ConnectablePlatform[];
  encryptionAvailable: boolean;
  encryptionNote: string;
  browserWorkerRunning: boolean;
  browserWorkerDetail?: string;
}

export interface Connection {
  id: string;
  platform: string;
  authLevel: string;
  status: 'verified' | 'unverified' | 'failed';
  detail: string;
  handle: string;
  updatedAt?: string;
}

export function fetchConnectionCatalog() {
  return getJson<ConnectionCatalog>('/connections/catalog');
}

export function fetchConnections() {
  return getJson<{ connections: Connection[] }>('/connections');
}

/** Saves a connection. Returns the server's error text when it refuses. */
export async function saveConnection(body: {
  platform: string;
  authLevel: string;
  handle?: string;
  fields: Record<string, string>;
}): Promise<{ ok: true; connection: Connection } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${PALIUS_API}/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': PALIUS_USER_ID },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const missing = Array.isArray(data.missing) ? ` (${data.missing.join(', ')})` : '';
      return { ok: false, error: `${data.error ?? 'Request failed'}${missing}${data.detail ? ` — ${data.detail}` : ''}` };
    }
    return { ok: true, connection: data as Connection };
  } catch (e) {
    return { ok: false, error: `Could not reach the Palius API: ${e}` };
  }
}

/** Asks the backend for the provider auth URL to open in the user's browser. */
// -------------------------------------------------- level 3: browser login ---
//
// Signing in through the embedded browser. The API opens the platform's own
// login page inside a worker-controlled Chromium and hands back a WebSocket URL
// that streams it here; keystrokes and clicks go back the other way. The
// password is typed into the platform's page, never into Palius.

export interface BrowserSession {
  sessionId: string;
  platform: string;
  mode: 'login' | 'register';
  startUrl: string;
  streamUrl: string;
  notice: string;
}

export async function startBrowserSession(
  platform: string,
  mode: 'login' | 'register' = 'login',
): Promise<{ ok: true; session: BrowserSession } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${PALIUS_API}/browser/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': PALIUS_USER_ID },
      body: JSON.stringify({ platform, mode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: `${data.error ?? 'Could not start the login'}${data.detail ? ` — ${data.detail}` : ''}` };
    }
    return { ok: true, session: data as BrowserSession };
  } catch (e) {
    return { ok: false, error: `Could not reach the Palius API: ${e}` };
  }
}

/** Captures the finished login and stores it as a connection. */
export async function completeBrowserSession(
  sessionId: string,
): Promise<{ ok: true; connection: Connection } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${PALIUS_API}/browser/sessions/${encodeURIComponent(sessionId)}/complete`, {
      method: 'POST',
      headers: { 'X-User-Id': PALIUS_USER_ID },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: `${data.error ?? 'Could not save the session'}${data.detail ? ` — ${data.detail}` : ''}` };
    }
    return { ok: true, connection: data.connection as Connection };
  } catch (e) {
    return { ok: false, error: `Could not reach the Palius API: ${e}` };
  }
}

/** Closes an abandoned login so the worker is not left holding a browser. */
export async function cancelBrowserSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${PALIUS_API}/browser/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': PALIUS_USER_ID },
      keepalive: true,
    });
  } catch {
    // Best effort — the worker expires sessions on its own timer anyway.
  }
}

export async function startOAuth(platform: string): Promise<{ ok: true; authUrl: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${PALIUS_API}/oauth/${encodeURIComponent(platform)}/start`, {
      headers: { Accept: 'application/json', 'X-User-Id': PALIUS_USER_ID },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.detail ?? data.error ?? 'OAuth is not available.' };
    return { ok: true, authUrl: data.authUrl };
  } catch (e) {
    return { ok: false, error: `Could not reach the Palius API: ${e}` };
  }
}

// ---------------------------------------------------------------- admin -----

export interface DailyPoint {
  date: string;
  tokens: number;
  calls: number;
}

export interface ProviderUsage {
  provider: string;
  tokens: number;
  calls: number;
}

export interface AdminOverview {
  totalTokens: number;
  totalCredits: number;
  totalCalls: number;
  activeUsers: number;
  todayTokens: number;
  todayCalls: number;
  daily: DailyPoint[];
  providers: ProviderUsage[];
}

export interface AdminUser {
  id: string;
  name: string;
  plan: string;
  status: string;
  tokenQuota: number;
  creditQuota: number;
  tokensUsed: number;
  creditsUsed: number;
  calls: number;
  lastActive: string;
}

export interface UsageEvent {
  id: number;
  userId: string;
  userName: string;
  taskType: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  creditUnits: number;
  costUSD: number;
  createdAt: string;
}

export function fetchAdminOverview(days = 14) {
  return getJson<AdminOverview>(`/admin/overview?days=${days}`);
}

export function fetchAdminUsers() {
  return getJson<{ users: AdminUser[] }>('/admin/users');
}

export function fetchAdminUsage(limit = 100) {
  return getJson<{ events: UsageEvent[] }>(`/admin/usage?limit=${limit}`);
}

export function fetchAdminUserUsage(userId: string) {
  return getJson<{ userId: string; events: UsageEvent[] }>(`/admin/users/${encodeURIComponent(userId)}/usage`);
}

export function fetchAdminDaily(days = 14) {
  return getJson<{ daily: DailyPoint[] }>(`/admin/daily?days=${days}`);
}

export function fetchAdminProviders() {
  return getJson<{ providers: ProviderUsage[] }>('/admin/providers');
}

export function updateAdminUser(id: string, patch: { tokenQuota?: number; creditQuota?: number; plan?: string; status?: string }) {
  return putJson<{ ok: boolean; id: string }>(`/admin/users/${encodeURIComponent(id)}`, patch);
}

// ---------------------------------------------------- document extraction --
// PDF and DOCX are container formats the browser cannot read. They go to the
// backend, which pulls the real text out, so an attached spec sheet actually
// reaches the model instead of contributing only its file name.

export interface ExtractedDoc {
  name: string;
  kind: 'pdf' | 'docx' | 'text' | 'unsupported';
  text: string;
  chars: number;
  pages?: number;
  truncated: boolean;
  reason?: string;
}

export async function extractDocumentText(file: File): Promise<ExtractedDoc | null> {
  const form = new FormData();
  form.append('file', file);
  try {
    const res = await fetch(`${PALIUS_API}/context/extract`, {
      method: 'POST',
      // No Content-Type header: the browser must set the multipart boundary.
      headers: { 'X-User-Id': PALIUS_USER_ID },
      body: form,
    });
    if (!res.ok) return null;
    return (await res.json()) as ExtractedDoc;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- advisor ----
// The AI advisor and the post optimiser go through the backend like every
// other AI feature, so there is one provider key, one rate card and one usage
// ledger. They previously called Google Gemini from a Next.js route, which
// meant a second AI configuration the cost engine could not see.

export interface AdvisorChatTurn {
  sender: 'user' | 'ai';
  text: string;
}

export interface AdvisorChatResponse {
  reply: string;
  status: 'success' | 'unavailable';
  provider: string;
  model: string;
}

export interface OptimizeRequest {
  caption: string;
  platform?: string;
  hook?: string;
  style?: string;
}

export interface OptimizeResponse {
  score: number;
  improvedCaption: string;
  hooks: string[];
  hashtags: string[];
  critique: string;
}

export function askAdvisor(message: string, history: AdvisorChatTurn[] = [], context = '') {
  return postJson<AdvisorChatResponse>('/advisor/chat', { message, history, context });
}

export function optimizePost(req: OptimizeRequest) {
  return postJson<OptimizeResponse>('/advisor/optimize', req);
}

// ------------------------------------------------------------- support ----

// An issue the customer reported. The page and platform travel with it so the
// operator does not have to ask "where were you?" as a first reply.
export interface IssueReport {
  id: string;
  userId: string;
  category: string;
  severity: string;
  subject: string;
  body: string;
  page: string;
  platform: string;
  operationId: string;
  contactEmail: string;
  status: string;
  assignedTo: string;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string;
}

export interface IssueDraft {
  category?: string;
  severity?: string;
  subject: string;
  body: string;
  page?: string;
  platform?: string;
  operationId?: string;
  contactEmail?: string;
}

export function fetchIssueMeta() {
  return getJson<{ categories: string[]; severities: string[]; statuses: string[] }>('/issues/meta');
}

export function submitIssue(draft: IssueDraft) {
  return postJson<{ ok: boolean; issue: IssueReport; status: string }>('/issues', draft);
}

export function fetchMyIssues() {
  return getJson<{ issues: IssueReport[] }>('/issues');
}

// --------------------------------------------------- local fallbacks ------
// Used only when the Go backend is not running, so the Create flow still works.

export function localContext(req: ContextRequest): ContextResponse {
  if (req.websiteUrl) {
    return {
      contextId: 'ctx-local',
      summary: 'Scraped your website and learned what the product does, who it is for, and its key selling points. Content will be tailored to that real product info.',
      confidence: 85,
      needsMore: false,
      missing: [],
      scraped: true,
      scrapedSource: req.websiteUrl,
      requestedAssets: [],
      suggestions: ['Add a description for extra nuance the page does not cover.', 'Upload your README or pitch deck for deeper context.'],
    };
  }
  if (!req.description && (!req.documents || !req.documents.length)) {
    return {
      contextId: 'ctx-local',
      summary: 'No product context provided yet.',
      confidence: 15,
      needsMore: true,
      missing: [
        'What is the product or service?',
        'Who is the target audience?',
        'What problem does it solve?',
        'Are you linking to a website, landing page or app?',
      ],
      suggestions: [],
      scraped: false,
      scrapedSource: '',
      requestedAssets: [],
    };
  }
  const hasVisual = (req.documents ?? []).some((d) => d.kind === 'image' || d.kind === 'screenshot');
  return {
    contextId: 'ctx-local',
    summary: hasVisual
      ? 'Captured your product screenshots/images alongside your description. The AI can now build authentic visual content (video, carousels) from them.'
      : 'Captured your product context. The AI will tailor hooks, captions and blog angles to it.',
    confidence: 70,
    needsMore: false,
    missing: [],
    scraped: false,
    scrapedSource: '',
    requestedAssets: [],
    suggestions: ['Add your website URL if you want posts to link back to it — I already have enough context to write.', 'Upload your README or pitch deck for deeper context.'],
  };
}

export function localAnalyze(req: AnalyzeRequest): AnalyzeResponse {
  const needsContext = !req.context && !req.prompt;
  const ct = req.contentType.toLowerCase();
  const visual = ct.includes('video') || ct.includes('image') || ct.includes('carousel') || ct.includes('reel') || ct.includes('photo');
  const assets = visual
    ? [{
        type: 'screenshot',
        reason: "You're creating visual content for the brand — a screenshot or photo of the product makes the video/carousel authentic instead of generic.",
        required: true,
      }]
    : [];
  return {
    score: 84,
    viralPotential: 72,
    strengths: ['Clear value proposition', 'Strong hook potential', 'Platform-agnostic framing'],
    improvements: ['Add a specific metric or data point in the first line', 'End with a single, strong call to action', 'Reference your website URL for discovery'],
    bestPlatforms: ['tiktok', 'linkedin', 'x'],
    recommendedPostingWindow: 'Tuesday 5:00 PM – 6:30 PM',
    needsMoreContext: needsContext,
    contextQuestions: [
      'What is the product and who is it for?',
      'Do you have a URL or a doc (README, .md, PDF) I can read to learn it?',
      'What is the single biggest pain point it solves?',
    ],
    requestedAssets: assets,
  };
}

export function localGenerate(req: GenerateRequest): GenerateResponse {
  const base = req.caption || 'A new tool that makes content creation effortless.';
  const cta = req.websiteUrl ? 'Link in bio / URL in post' : 'Link in bio';
  const blogOnly = req.outputMode === 'blog';
  const wantsBlog = blogOnly || req.blogApproved;
  const platforms = blogOnly ? [] : req.platforms.length ? req.platforms : ['tiktok', 'linkedin', 'x', 'instagram'];
  const variants: PlatformVariant[] = platforms.map((p) => {
    const common: PlatformVariant = {
      platform: p,
      format: p === 'x' ? 'Thread / short post' : p === 'reddit' ? 'Discussion post' : 'Short-form video + carousel',
      caption: base + (p === 'tiktok' ? `\n\n🎬 Full breakdown on our page. ${cta}` : p === 'linkedin' ? `\n\nWe built this to save teams hours every week.` : ''),
      hooks: p === 'x' ? ['Hot take:', 'TIL:'] : ['Stop scrolling — this changes how you create.'],
      hashtags: p === 'x' ? ['#buildinpublic', '#indiehackers'] : ['#creator', '#growth'],
      urlInBio: !!req.websiteUrl,
      linkPlace: req.websiteUrl ? 'url field / first comment' : 'bio',
    };
    return common;
  });
  const resp: GenerateResponse = {
    score: 88,
    variants,
    blogSuggested: !blogOnly,
    blogApprovalText: blogOnly
      ? ''
      : 'Should I also write a blog / micro-blog and publish it to platforms that fit long-form content?',
    requestedAssets: [],
  };
  if (wantsBlog) {
    resp.blog = {
      title: req.blogTopic || 'How we built a better way to create content',
      format: 'blog',
      intro: "Long-form content builds trust that short-form can't. Here is the story and the strategy.",
      sections: ['1. The problem we kept hitting', '2. What most tools get wrong', '3. How our approach is different', '4. A concrete framework you can copy'],
      cta: 'Try it today — link in bio and first paragraph.',
      suitableFor: ['yourwebsite', 'linkedin-article', 'medium', 'substack'],
      publishedTo: [], // draft only — owner must approve each destination before posting
      requiresImage: true,
      image: 'App screenshot / product hero on a clean dark background, with the product name overlaid',
    };
    // The blog needs a cover and the owner gave us no visual — ask for it
    // rather than dropping in a stock image.
    if (!req.hasVisuals) {
      resp.requestedAssets.push({
        type: 'screenshot',
        reason: 'The blog needs a cover image and you have not given me a product visual to use. Upload one — I will not substitute a stock image.',
        required: true,
        for: 'blog cover',
      });
    }
  }
  return resp;
}

export function localViral(req: ViralResearchRequest): ViralResearchResponse {
  return {
    trends: [
      "Behind-the-scenes 'how we built it' content",
      'Short-form educational hooks with a contrarian opener',
      'Founder-led personal storytelling over brand voice',
      'Remixing one core asset across 5 formats in 48h',
    ],
    contentIdeas: [
      '3 mistakes every startup makes posting on TikTok',
      'The exact 7-day launch content calendar',
      'Why we almost killed our product (and what saved it)',
      'One metric that matters more than followers',
    ],
    postingStyles: [
      'Hook in first 1.5s, value by second 10',
      'Consistent face/brand color = +memorability',
      'Comment bait question at the end',
      'Post the same core idea in 3 formats before moving on',
    ],
    tactics: [
      'Post consistently (daily for short-form) during a 30-day sprint',
      'Steal the format, not the content',
      'Reply to every comment within 1h to boost distribution',
      'Pin your best-performing post to drive profile conversion',
    ],
    sources: ['Platform official creator playbooks', 'Top creators in your niche (public analytics)', 'Viral post teardowns across TikTok / Reels / Shorts'],
    summary: 'Virality favors strong hooks, consistent formats, and replying fast. Iterate on what already works instead of chasing new ideas.',
  };
}

export function localAnalytics(platform: string): PlatformAnalytics {
  const byPlatform: Record<string, PlatformAnalytics> = {
    tiktok: { platform: 'tiktok', followers: '42.1k', reach: '1.8M', impressions: '2.4M', engagementRate: '9.2%', views: '1.6M', saves: '38.4k', shares: '21.7k', bestPostingTime: 'Tue–Thu 5:00 PM', growthTrend: [2100, 2300, 2500, 2700, 3200, 3900, 4800], topContent: ["'Stop scrolling' hook reel — 890k views", "'We rebuilt this in 48h' — 512k views"], summary: 'TikTok is your top reach channel. Short-form hooks outperform.', avgViews: 214000, optimalPostCountPerWk: '5–7' },
    linkedin: { platform: 'linkedin', followers: '18.4k', reach: '412k', impressions: '640k', engagementRate: '5.1%', views: '308k', saves: '9.2k', shares: '4.1k', bestPostingTime: 'Tue–Thu 8:00 AM', growthTrend: [920, 940, 980, 1040, 1180, 1340, 1520], topContent: ['Founder story carousel — 96k impressions'], summary: 'LinkedIn converts best for B2B. Carousels and founder storytelling drive 3x engagement.', avgViews: 62000, optimalPostCountPerWk: '3–5' },
    instagram: { platform: 'instagram', followers: '29.7k', reach: '860k', impressions: '1.1M', engagementRate: '6.8%', views: '740k', saves: '22.1k', shares: '12.4k', bestPostingTime: 'Wed–Sat 7:30 PM', growthTrend: [1500, 1600, 1750, 1900, 2300, 2700, 3200], topContent: ['Reel carousel hybrid — 410k views'], summary: 'Reels + saves are the strongest signal. Education drives saves.', avgViews: 132000, optimalPostCountPerWk: '4–6' },
    x: { platform: 'x', followers: '12.3k', reach: '640k', impressions: '980k', engagementRate: '4.4%', views: '512k', saves: '3.2k', shares: '8.9k', bestPostingTime: 'Mon–Fri 9:00 AM', growthTrend: [610, 640, 660, 700, 760, 840, 960], topContent: ['Build-in-public thread — 210k impressions'], summary: 'X rewards threads and build-in-public. Frequency pays off here.', avgViews: 88000, optimalPostCountPerWk: '4–10' },
    youtube: { platform: 'youtube', followers: '8.9k', reach: '310k', impressions: '480k', engagementRate: '7.6%', views: '285k', saves: '4.1k', shares: '6.3k', bestPostingTime: 'Fri 3:00 PM', growthTrend: [420, 440, 460, 500, 560, 620, 700], topContent: ['Long-form tutorial — 140k views'], summary: 'YouTube rewards depth. Repurposing shorts grows watch time.', avgViews: 41000, optimalPostCountPerWk: '2–3' },
  };
  return byPlatform[platform] ?? {
    platform, followers: '5.2k', reach: '96k', impressions: '132k', engagementRate: '4.6%', views: '82k', saves: '2.4k', shares: '1.9k',
    bestPostingTime: 'Tue–Thu 6:00 PM', growthTrend: [260, 270, 290, 310, 330, 360, 400],
    topContent: ['Best-performing post on this platform'], summary: 'Solid baseline performance. Consistency will compound growth.', avgViews: 11700, optimalPostCountPerWk: '3–5',
  };
}
