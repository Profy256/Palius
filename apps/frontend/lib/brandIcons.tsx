// Real brand marks, not emoji.
//
// Paths come from `simple-icons` (MIT), the same source most dashboards use, so
// each logo is the official glyph rather than an approximation. LinkedIn is the
// one exception: it was withdrawn from simple-icons at the trademark holder's
// request, so its path is inlined below.

import React from 'react';
import {
  siTiktok,
  siInstagram,
  siFacebook,
  siReddit,
  siX,
  siThreads,
  siPinterest,
  siYoutube,
  siWhatsapp,
  siTelegram,
  siProducthunt,
  siDevdotto,
  siHashnode,
  siMedium,
  siSubstack,
} from 'simple-icons';

interface Mark {
  title: string;
  path: string;
  hex: string;
}

// LinkedIn's standard 24x24 "in" glyph and brand colour.
const linkedin: Mark = {
  title: 'LinkedIn',
  hex: '0A66C2',
  path:
    'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
};

const MARKS: Record<string, Mark> = {
  tiktok: siTiktok,
  instagram: siInstagram,
  facebook: siFacebook,
  linkedin,
  reddit: siReddit,
  x: siX,
  threads: siThreads,
  pinterest: siPinterest,
  youtube: siYoutube,
  whatsapp: siWhatsapp,
  telegram: siTelegram,
  producthunt: siProducthunt,
  devto: siDevdotto,
  hashnode: siHashnode,
  medium: siMedium,
  substack: siSubstack,
  'hashnode-newsletter': siSubstack,
};

export function hasBrandMark(id: string): boolean {
  return id in MARKS;
}

/** Brand colour for a platform, or a neutral fallback. */
export function brandColor(id: string): string {
  const hex = MARKS[id]?.hex;
  if (!hex) return '#9CA3AF';
  // Pure-black marks disappear on a dark UI — lift them to near-white.
  if (hex.toLowerCase() === '000000' || hex.toLowerCase() === '0a0a0a') return '#F4F4F5';
  return `#${hex}`;
}

interface BrandIconProps {
  id: string;
  className?: string;
  /** Render in the brand colour instead of inheriting text colour. */
  colored?: boolean;
  title?: string;
}

/**
 * Renders a platform's logo. Anything without a known mark (your own site, a
 * user-added custom platform) falls back to a globe outline.
 */
export function BrandIcon({ id, className = 'w-5 h-5', colored = true, title }: BrandIconProps) {
  const mark = MARKS[id];

  if (!mark) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <title>{title ?? id}</title>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
      </svg>
    );
  }

  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      className={className}
      fill={colored ? brandColor(id) : 'currentColor'}
      aria-hidden="true"
    >
      <title>{title ?? mark.title}</title>
      <path d={mark.path} />
    </svg>
  );
}
