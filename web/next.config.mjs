/** @type {import('next').NextConfig} */
export default { reactStrictMode: true, poweredByHeader: false,
  // The service worker is always fetched fresh, so a fix to it reaches an installed app on the next visit.
  headers: async () => [{ source: '/sw.js', headers: [{ key: 'cache-control', value: 'no-cache, no-store, must-revalidate' }, { key: 'service-worker-allowed', value: '/' }] }],
  transpilePackages: ['@apex/engine', '@apex/kernel', '@apex/autopilot', '@apex/data', '@apex/store', '@apex/claims', '@apex/ui', '@apex/sdk', '@apex/api', '@apex/mcp'] };
