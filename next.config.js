/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove experimental appDir as it's stable in Next.js 14
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['googleapis', 'puppeteer-core', '@sparticuz/chromium']
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude puppeteer from webpack bundling on server side
      config.externals = config.externals || []
      config.externals.push({
        'puppeteer-core': 'commonjs puppeteer-core',
        '@sparticuz/chromium': 'commonjs @sparticuz/chromium'
      })
    }
    return config
  }
}

module.exports = nextConfig
