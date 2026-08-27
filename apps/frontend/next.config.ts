import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 'standalone' emits a self-contained server with only the modules actually
  // imported. Needed by the Docker images and by the Electron desktop build —
  // shipping the full 659MB node_modules inside the app instead is not viable.
  // Vercel builds its own output target and ignores this.
  output:
    process.env.DOCKER_BUILD || process.env.DESKTOP_BUILD ? 'standalone' : undefined,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
