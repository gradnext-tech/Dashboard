/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove experimental appDir as it's stable in Next.js 14
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['googleapis', 'puppeteer-core', '@sparticuz/chromium']
  }
}

module.exports = nextConfig
