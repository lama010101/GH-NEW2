import { readFileSync, writeFileSync } from 'fs';
import createNextIntlPlugin from 'next-intl/plugin';

const SW_PATH = new URL('public/sw.js', import.meta.url);
const SW_VERSION_PLACEHOLDER = '__SW_VERSION__';

function injectServiceWorkerVersion() {
  try {
    const template = readFileSync(SW_PATH, 'utf8');
    if (!template.includes(SW_VERSION_PLACEHOLDER)) {
      return;
    }
    const version =
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.GITHUB_SHA ||
      Date.now().toString();
    writeFileSync(SW_PATH, template.replace(SW_VERSION_PLACEHOLDER, version), 'utf8');
  } catch (err) {
    console.warn('[next.config] Failed to inject SW version:', err.message);
  }
}

if (process.argv.includes('build')) {
  injectServiceWorkerVersion();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  images: {
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'im.runware.ai',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "img-src 'self' data: blob: https://im.runware.ai https://firebasestorage.googleapis.com https://*.supabase.co https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://*.tile.opentopomap.org https://*.a.ssl.fastly.net;",
          },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
