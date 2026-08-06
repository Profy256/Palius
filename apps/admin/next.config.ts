import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 'standalone' is only needed for the Docker images; Vercel builds
  // its own output target and ignores it.
  output: process.env.DOCKER_BUILD ? 'standalone' : undefined,
};

export default nextConfig;
