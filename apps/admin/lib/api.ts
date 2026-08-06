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
      headers: { 'Content-Type': 'application/json', 'X-User-Id': PALIUS_USER_ID },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
