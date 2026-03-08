/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://veridex-backend-4dxt.onrender.com/api/:path*',
      },
    ];
  },
};

export default nextConfig;
