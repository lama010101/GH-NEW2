import createNextIntlPlugin from 'next-intl/plugin';

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
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },
  async headers() {
    return [
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
