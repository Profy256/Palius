// Admin API client. Talks to the Palius Go + Gin backend at NEXT_PUBLIC_PALIUS_API
// (default http://localhost:8080/api/v1).

export const PALIUS_API =
  process.env.NEXT_PUBLIC_PALIUS_API ?? 'http://localhost:8080/api/v1';

export const PALIUS_USER_ID =
  process.env.NEXT_PUBLIC_PALIUS_USER_ID ?? 'user-1';

// ---------------------------------------------------------------- types ----

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

// ------------------------------------------------------------- http -------

// ---------------------------------------------------------------------------
// Admin credentials
//
// ADMIN_TOKEN guards every /admin/* endpoint. It is deliberately NOT read from
// a NEXT_PUBLIC_* variable: those are inlined into the JavaScript bundle at
// build time, so anyone who could load the admin page could read the master
// key out of it. The operator pastes it once and it lives in this browser's
// localStorage only.
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'palius-admin-token';
const ACTOR_KEY = 'palius-admin-actor';

export function adminToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(TOKEN_KEY) ?? '';
}

export function setAdminToken(token: string) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function setAdminActor(name: string) {
  if (typeof window === 'undefined') return;
  if (name) window.localStorage.setItem(ACTOR_KEY, name);
  else window.localStorage.removeItem(ACTOR_KEY);
}

// unauthorized is raised when the backend rejects the token, so the UI can ask
// for a new one instead of rendering an empty dashboard that looks like "no
// customers yet".
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

// verifyAdminToken checks a token against the API before it is saved, so a
// typo is caught at the prompt rather than as blank panels afterwards.
export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${PALIUS_API}/admin/overview?days=1`, {
      headers: { Accept: 'application/json', 'X-Admin-Token': token },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${PALIUS_API}${path}`, {
      headers: { Accept: 'application/json', ...adminHeaders() },
    });
    if (res.status === 401 || res.status === 503) {
      onUnauthorized?.();
      return null;
    }
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

export function fetchAdminOverview(days = 14) {
  return getJson<AdminOverview>(`/admin/overview?days=${days}`);
}

export function fetchAdminUsers() {
  return getJson<{ users: AdminUser[] }>('/admin/users');
}

export function fetchAdminUsage(limit = 200) {
  return getJson<{ events: UsageEvent[] }>(`/admin/usage?limit=${limit}`);
}

export function fetchAdminUserUsage(userId: string) {
  return getJson<{ userId: string; events: UsageEvent[] }>(`/admin/users/${encodeURIComponent(userId)}/usage`);
}

export function updateAdminUser(id: string, patch: { tokenQuota?: number; creditQuota?: number; plan?: string; status?: string }) {
  return putJson<{ ok: boolean; id: string }>(`/admin/users/${encodeURIComponent(id)}`, patch);
}

// ---------------------------------------------------- economics & monitoring

export interface BusinessOverview {
  periodStart: string;
  mrr: number;
  subscriberCount: number;
  paidSubscribers: number;
  freeUsers: number;
  mediaCostUSD: number;
  textCostUSD: number;
  failureCostUSD: number;
  totalCostUSD: number;
  grossProfitUSD: number;
  grossMarginPct: number;
  creditsGranted: number;
  creditsPurchased: number;
  creditsCharged: number;
  creditsHeld: number;
  creditLiability: number;
  operationsTotal: number;
  operationsFailed: number;
  failureRatePct: number;
  openMarginAlerts: number;
  usersOverAllowance: number;
  health: string;
}

export interface ModelSpend {
  model: string;
  provider: string;
  modality: string;
  operations: number;
  units: number;
  unitKind: string;
  vendorCostUSD: number;
  billableUSD: number;
  marginUSD: number;
  marginPct: number;
  credits: number;
}

export interface UserEconomics {
  userId: string;
  name: string;
  plan: string;
  status: string;
  monthlyUSD: number;
  includedCredits: number;
  creditsUsed: number;
  utilizationPct: number;
  mediaCostUSD: number;
  textCostUSD: number;
  totalCostUSD: number;
  profitUSD: number;
  marginPct: number;
  operations: number;
  videoSeconds: number;
  images: number;
  balance: number;
  flag: string;
}

export interface Operation {
  id: string;
  userId: string;
  state: string;
  modality: string;
  model: string;
  provider: string;
  intent: string;
  estUnits: number;
  estCredits: number;
  actualUnits: number;
  unitKind: string;
  actualVendorUSD: number;
  chargedCredits: number;
  billableUSD: number;
  marginUSD: number;
  vendorBilledOnFailure: boolean;
  error?: string;
  createdAt: string;
  settledAt?: string;
}

export interface MarginAlert {
  id: number;
  userId: string;
  operationId: string;
  model: string;
  vendorUSD: number;
  billableUSD: number;
  detail: string;
  createdAt: string;
}

export interface RateCardRow {
  model: string;
  provider: string;
  modality: string;
  vendorUnit: string;
  vendorUSD: number;
  credits: number;
  billableUSD: number;
  marginPct: number;
  verifiedOn: string;
  note?: string;
}

export interface PlanRow {
  plan: {
    id: string; name: string; monthlyUSD: number; includedCredits: number;
    estTextCostUSD: number; overagePerCreditUSD: number; mediaEnabled: boolean;
    maxVideoSecondsPerMonth: number; maxImagesPerMonth: number;
    features: string[]; audience: string;
  };
  economics: {
    maxMediaCostUSD: number; textCostUSD: number; maxTotalCostUSD: number;
    worstCaseMarginUSD: number; worstCaseMarginPct: number;
    expectedMarginPct: number; budgetClipsIncluded: number;
    premiumClipsIncluded: number; imagesIncluded: number; verdict: string;
  };
  subscribers: number;
}

export function fetchBusiness() {
  return getJson<BusinessOverview>('/admin/business');
}
export function fetchModelSpend() {
  return getJson<{ models: ModelSpend[]; note: string }>('/admin/models');
}
export function fetchUserEconomics() {
  return getJson<{ users: UserEconomics[] }>('/admin/economics');
}
export function fetchOperations(limit = 100, state = '') {
  const q = state ? `?limit=${limit}&state=${state}` : `?limit=${limit}`;
  return getJson<{ operations: Operation[] }>(`/admin/operations${q}`);
}
export function fetchMarginAlerts() {
  return getJson<{ alerts: MarginAlert[] }>('/admin/alerts');
}
export function fetchRateCard() {
  return getJson<{
    markups: Record<string, number>;
    minMarkup: number;
    creditValueUSD: number;
    blendedCostPerCredit: number;
    models: RateCardRow[];
    warning: string;
  }>('/admin/ratecard');
}
export function fetchAdminPlans() {
  return getJson<{ plans: PlanRow[]; packs: unknown[] }>('/admin/plans');
}
export function adjustCredits(userId: string, credits: number, reason: string) {
  return postJson<{ ok: boolean }>(`/admin/users/${encodeURIComponent(userId)}/credits`, { credits, reason });
}

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${PALIUS_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ------------------------------------------------- customers & monitoring --

// The operator's name travels with every privileged call so the audit trail
// records who did it rather than an anonymous "admin".
export function adminActor() {
  if (typeof window === 'undefined') return 'admin';
  return window.localStorage.getItem(ACTOR_KEY) || 'admin';
}

function adminHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-User-Id': PALIUS_USER_ID,
    'X-Admin-Actor': adminActor(),
  };
  // Only send the token when there is one: an empty header on a backend with
  // ADMIN_TOKEN unset is harmless, but sending "" where a value is expected
  // fails the constant-time compare for a confusing reason.
  const token = adminToken();
  if (token) headers['X-Admin-Token'] = token;
  return headers;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  company: string;
  country: string;
  signupSource: string;
  plan: string;
  status: string;
  segment: string;
  registeredAt: string;
  lastSeenAt: string;
  lastSeenAge: string;
  isActive: boolean;
  activeToday: boolean;
  isPaying: boolean;
  subscriptionState: string;
  subscribedSince: string;
  monthlyUSD: number;
  purchaseCount: number;
  purchasedCredits: number;
  purchasedUSD: number;
  lifetimeUSD: number;
  hasChurned: boolean;
  includedCredits: number;
  creditBalance: number;
  creditsUsedThisPeriod: number;
  utilizationPct: number;
  vendorCostUSD: number;
  profitUSD: number;
  operations: number;
  failedOperations: number;
  aiCalls: number;
  openIssues: number;
  totalIssues: number;
  flag: string;
}

export interface SegmentCounts {
  registered: number;
  newThisMonth: number;
  newThisWeek: number;
  activeToday: number;
  active7d: number;
  active30d: number;
  dormant: number;
  suspended: number;
  paying: number;
  subscribers: number;
  trialing: number;
  pastDue: number;
  creditBuyers: number;
  freeUsers: number;
  churned: number;
  mrr: number;
  arpu: number;
  packRevenueMTD: number;
  lifetimePackRevenueUSD: number;
  paidConversionPct: number;
  churnPct: number;
  planBreakdown: Record<string, number>;
  countryBreakdown: Record<string, number>;
  sourceBreakdown: Record<string, number>;
}

export interface Subscription {
  id: string;
  userId: string;
  userName: string;
  email: string;
  plan: string;
  status: string;
  monthlyUSD: number;
  interval: string;
  provider: string;
  startedAt: string;
  periodStart: string;
  periodEnd: string;
  canceledAt: string;
  cancelReason: string;
}

export interface CreditPurchase {
  id: string;
  userId: string;
  userName: string;
  email: string;
  packId: string;
  credits: number;
  amountUSD: number;
  status: string;
  provider: string;
  createdAt: string;
  refundedAt: string;
}

export interface LedgerEntry {
  id: number;
  userId: string;
  kind: string;
  delta: number;
  operationId: string;
  reason: string;
  createdAt: string;
}

export interface IssueReport {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPlan: string;
  category: string;
  severity: string;
  subject: string;
  body: string;
  page: string;
  platform: string;
  userAgent: string;
  operationId: string;
  contactEmail: string;
  status: string;
  assignedTo: string;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string;
}

export interface IssueStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  critical: number;
  openCritical: number;
  last24h: number;
  byCategory: Record<string, number>;
  oldestOpenAge: string;
  avgResolveHours: number;
}

export interface ActivityItem {
  at: string;
  kind: string;
  userId: string;
  userName: string;
  title: string;
  detail: string;
  amountUSD: number;
  severity: string;
  ref: string;
}

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  createdAt: string;
}

export interface CustomerDetail {
  customer: Customer;
  subscriptions: Subscription[];
  purchases: CreditPurchase[];
  ledger: LedgerEntry[];
  operations: Operation[];
  usage: UsageEvent[];
  issues: IssueReport[];
  balance: { balance: number; held: number; available: number; usedThisPeriod: number };
  adminNotes: string;
}

export function fetchSegments() {
  return getJson<SegmentCounts>('/admin/segments');
}

export function fetchCustomers(segment = 'all', q = '', sort = '') {
  const params = new URLSearchParams();
  if (segment && segment !== 'all') params.set('segment', segment);
  if (q) params.set('q', q);
  if (sort) params.set('sort', sort);
  const qs = params.toString();
  return getJson<{ customers: Customer[]; total: number; shown: number; segments: string[] }>(
    `/admin/customers${qs ? `?${qs}` : ''}`,
  );
}

export function fetchCustomerDetail(id: string) {
  return getJson<CustomerDetail>(`/admin/customers/${encodeURIComponent(id)}`);
}

export function fetchSubscriptions(status = '') {
  return getJson<{ subscriptions: Subscription[]; live: number; mrr: number; arr: number }>(
    `/admin/subscriptions${status ? `?status=${status}` : ''}`,
  );
}

export function fetchPurchases(status = '') {
  return getJson<{ purchases: CreditPurchase[]; revenueUSD: number; creditsSold: number }>(
    `/admin/purchases${status ? `?status=${status}` : ''}`,
  );
}

export function fetchIssues(filters: { status?: string; severity?: string; category?: string; q?: string } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v && v !== 'all') params.set(k, v);
  });
  const qs = params.toString();
  return getJson<{ issues: IssueReport[]; stats: IssueStats }>(`/admin/issues${qs ? `?${qs}` : ''}`);
}

export function updateIssue(
  id: string,
  patch: { status?: string; severity?: string; category?: string; assignedTo?: string; adminNote?: string },
) {
  return patchJson<{ ok: boolean; issue: IssueReport }>(`/admin/issues/${encodeURIComponent(id)}`, patch);
}

export function fetchActivity(limit = 120, kind = '') {
  return getJson<{ activity: ActivityItem[]; count: number }>(
    `/admin/activity?limit=${limit}${kind && kind !== 'all' ? `&kind=${kind}` : ''}`,
  );
}

export function fetchAudit(limit = 200) {
  return getJson<{ audit: AuditEntry[] }>(`/admin/audit?limit=${limit}`);
}

// ------------------------------------------------------ privileged actions --

export function suspendUser(id: string, reason: string) {
  return postJson<{ ok: boolean }>(`/admin/users/${encodeURIComponent(id)}/suspend`, { reason });
}
export function reactivateUser(id: string) {
  return postJson<{ ok: boolean }>(`/admin/users/${encodeURIComponent(id)}/reactivate`, {});
}
export function setSubscription(id: string, plan: string, trial = false) {
  return postJson<{ ok: boolean; subscription: Subscription }>(
    `/admin/users/${encodeURIComponent(id)}/subscription`,
    { plan, trial },
  );
}
export function cancelSubscription(id: string, reason = 'canceled by operator') {
  return deleteJson<{ ok: boolean }>(
    `/admin/users/${encodeURIComponent(id)}/subscription?reason=${encodeURIComponent(reason)}`,
  );
}
export function grantCreditPack(id: string, packId: string) {
  return postJson<{ ok: boolean; purchase: CreditPurchase }>(
    `/admin/users/${encodeURIComponent(id)}/purchase`,
    { packId },
  );
}
export function refundPurchase(purchaseId: string) {
  return postJson<{ ok: boolean }>(`/admin/purchases/${encodeURIComponent(purchaseId)}/refund`, {});
}
export function setAdminNote(id: string, note: string) {
  return postJson<{ ok: boolean }>(`/admin/users/${encodeURIComponent(id)}/note`, { note });
}
export function createUser(body: {
  name: string; email?: string; company?: string; country?: string; plan?: string;
}) {
  return postJson<{ ok: boolean; id: string }>('/admin/users', body);
}

// --------------------------------------------------------------- exports ---

export type ExportFormat = 'xlsx' | 'csv' | 'tsv' | 'json';

export const EXPORT_DATASETS = [
  { id: 'customers', label: 'Customers' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'purchases', label: 'Credit purchases' },
  { id: 'issues', label: 'Reported issues' },
  { id: 'usage', label: 'AI usage log' },
  { id: 'operations', label: 'Generation operations' },
  { id: 'ledger', label: 'Credit ledger' },
  { id: 'audit', label: 'Admin audit trail' },
  { id: 'activity', label: 'Activity feed' },
  { id: 'all', label: 'Everything (multi-sheet)' },
] as const;

// downloadExport streams the file through fetch rather than navigating to the
// URL, so the admin token header can be attached and a failure surfaces as a
// message instead of a blank tab.
export async function downloadExport(
  dataset: string,
  format: ExportFormat = 'xlsx',
  params: Record<string, string> = {},
): Promise<{ ok: true; filename: string } | { ok: false; error: string }> {
  const qs = new URLSearchParams({ format, ...params }).toString();
  try {
    const res = await fetch(`${PALIUS_API}/admin/export/${dataset}?${qs}`, {
      headers: adminHeaders(),
    });
    if (!res.ok) {
      return { ok: false, error: `Export failed (${res.status})` };
    }
    const blob = await res.blob();

    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match?.[1] ?? `palius-${dataset}.${format}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    return { ok: true, filename };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export failed' };
  }
}

async function patchJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${PALIUS_API}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function deleteJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${PALIUS_API}${path}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
