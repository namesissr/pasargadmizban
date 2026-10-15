import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // ماژول‌های بومی (native) باید بیرون از باندل بمانند
  serverExternalPackages: ['bcryptjs', '@prisma/client', '@resvg/resvg-js', 'sharp'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
