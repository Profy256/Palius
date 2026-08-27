// Reads/writes the user's AI provider config. In the desktop app the key is
// stored encrypted via Electron safeStorage; in a plain browser it falls back
// to localStorage (still only on the user's own machine).

export type ProviderId =
  | 'gemini'
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'openai-compatible';

export interface ProviderConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

const STORAGE_KEY = 'palius.ai.config';

interface PaliusBridge {
  secure?: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  platform?: string;
}

function bridge(): PaliusBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as any).palius ?? null;
}

export async function getProviderConfig(): Promise<ProviderConfig | null> {
  const b = bridge();
  try {
    if (b?.secure) {
      const raw = await b.secure.get(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ProviderConfig) : null;
    }
  } catch {
    // fall through to localStorage
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ProviderConfig) : null;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function setProviderConfig(cfg: ProviderConfig | null): Promise<void> {
  const raw = cfg ? JSON.stringify(cfg) : null;
  const b = bridge();
  try {
    if (b?.secure) {
      if (raw) await b.secure.set(STORAGE_KEY, raw);
      else await b.secure.delete(STORAGE_KEY);
      return;
    }
  } catch {
    // fall through
  }
  try {
    if (typeof localStorage !== 'undefined') {
      if (raw) localStorage.setItem(STORAGE_KEY, raw);
      else localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function isDesktop(): boolean {
  const b = bridge();
  return !!b?.secure;
}
