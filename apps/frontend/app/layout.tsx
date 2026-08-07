import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Palius Social Media OS — AI Executive Assistant',
  description: 'AI-powered platform to manage, create, publish, engage, analyze, and automate social media presence across all platforms.',
  icons: {
    icon: [
      { url: '/palius-logo/favicon.svg', type: 'image/svg+xml' },
      { url: '/palius-logo/favicon.ico', rel: 'icon', sizes: 'any' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet" />
        <link rel="icon" type="image/svg+xml" href="/palius-logo/favicon.svg" />
        <link rel="icon" href="/palius-logo/favicon.ico" sizes="any" />
      </head>
      <body className="bg-ink text-fg antialiased selection:bg-brand-500/30 selection:text-brand-200">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
