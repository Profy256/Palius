// The single source of truth for every platform and destination the UI offers.
//
// Each picker used to carry its own hardcoded subset, so Reddit, Pinterest,
// WhatsApp, Telegram and Product Hunt were missing from most screens. Import
// from here instead of writing another list.
//
// Social platforms mirror the built-in connectors in the PRD; blog destinations
// mirror BlogDestinations() in the Go backend (apps/backend/publishing.go).

export interface SocialPlatform {
  id: string;
  label: string;
  icon: string;
  /** Level 1: official API · Level 2: OAuth · Level 3: embedded browser session */
  defaultAuth: 'level-1' | 'level-2' | 'level-3';
  /** Platforms that carry a feed of posts the AI can publish to and analyze. */
  posting: boolean;
}

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { id: 'tiktok', label: 'TikTok', icon: '🎵', defaultAuth: 'level-2', posting: true },
  { id: 'instagram', label: 'Instagram', icon: '📸', defaultAuth: 'level-2', posting: true },
  { id: 'facebook', label: 'Facebook', icon: '📘', defaultAuth: 'level-2', posting: true },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼', defaultAuth: 'level-1', posting: true },
  { id: 'reddit', label: 'Reddit', icon: '🤖', defaultAuth: 'level-3', posting: true },
  { id: 'x', label: 'X (Twitter)', icon: '🐦', defaultAuth: 'level-2', posting: true },
  { id: 'threads', label: 'Threads', icon: '🧵', defaultAuth: 'level-3', posting: true },
  { id: 'pinterest', label: 'Pinterest', icon: '📌', defaultAuth: 'level-3', posting: true },
  { id: 'youtube', label: 'YouTube', icon: '▶️', defaultAuth: 'level-1', posting: true },
  // Messaging channels: broadcast/DM surfaces rather than public feeds.
  { id: 'whatsapp', label: 'WhatsApp Business', icon: '💬', defaultAuth: 'level-1', posting: true },
  { id: 'telegram', label: 'Telegram', icon: '✈️', defaultAuth: 'level-1', posting: true },
];

export const PLATFORM_IDS = SOCIAL_PLATFORMS.map((p) => p.id);

/** Display name for a platform id — falls back to the id for custom platforms. */
export function platformLabel(id: string): string {
  if (id === 'all') return 'All';
  return SOCIAL_PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

export interface BlogDestination {
  id: string;
  label: string;
  kind: 'article' | 'microblog' | 'community' | 'launch';
  /** No write API — the system produces a paste-ready kit / export instead. */
  manual?: boolean;
  note?: string;
}

// Mirrors the backend catalog. `manual` entries never auto-publish; they hand
// the owner something ready to paste, which is the honest behavior when a
// platform has no write API.
export const BLOG_DESTINATIONS: BlogDestination[] = [
  { id: 'yourwebsite', label: 'Your own site', kind: 'article', note: 'The canonical home for every article.' },
  { id: 'devto', label: 'dev.to', kind: 'article', note: 'Best fit for developer-tool launches.' },
  { id: 'hashnode', label: 'Hashnode', kind: 'article' },
  { id: 'linkedin', label: 'LinkedIn article', kind: 'article' },
  { id: 'medium', label: 'Medium', kind: 'article', note: 'Best-effort — falls back to an export.' },
  { id: 'hashnode-newsletter', label: 'Substack / newsletter', kind: 'microblog', manual: true, note: 'No public write API — you get a ready-to-paste export.' },
  { id: 'reddit', label: 'Reddit', kind: 'community', note: 'Posts a discussion, never an advert. Needs a subreddit.' },
  { id: 'producthunt', label: 'Product Hunt', kind: 'launch', manual: true, note: "Launches are manual by design — you get a paste-ready kit (tagline, description, maker's first comment, topics)." },
];

// The AI names destinations loosely ("substack", "linkedin-article"). Resolve
// those to real catalog entries instead of rendering a raw id.
const DESTINATION_ALIASES: Record<string, string> = {
  website: 'yourwebsite',
  'your-website': 'yourwebsite',
  'linkedin-article': 'linkedin',
  substack: 'hashnode-newsletter',
  newsletter: 'hashnode-newsletter',
  blogger: 'yourwebsite',
  'product-hunt': 'producthunt',
};

export function resolveDestination(id: string): BlogDestination {
  const key = DESTINATION_ALIASES[id] ?? id;
  return (
    BLOG_DESTINATIONS.find((d) => d.id === key) ?? {
      id: key,
      label: key.replace(/[-_]/g, ' '),
      kind: 'article',
    }
  );
}

/** The social feed a published blog/launch item belongs to on the calendar. */
export function destinationPlatform(id: string): string {
  const d = resolveDestination(id);
  return d.id === 'yourwebsite' ? 'website' : d.id;
}
