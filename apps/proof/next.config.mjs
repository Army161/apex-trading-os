/** @type {import('next').NextConfig} */
// Only the shared packages the product is allowed to use are listed (docs/design/12 s4). tools/separation_check.mjs holds this
// list, the imports and package.json to the same set.
export default { reactStrictMode: true, poweredByHeader: false,
  transpilePackages: ['@apex/engine', '@apex/kernel', '@apex/claims', '@apex/data', '@apex/store', '@apex/sdk', '@apex/ui'] };
