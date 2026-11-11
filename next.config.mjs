/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The engine (src/) and the viewer (viewer/) are plain ES modules shared with the offline
  // optimiser and the single-file build; Next bundles them for the page, workers and API routes.
};
export default nextConfig;
