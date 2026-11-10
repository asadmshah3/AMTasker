/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully client-side, local-first app: build to static files in ./out.
  output: "export",
  // Set BASE_PATH (e.g. "/AMTasker") to serve the site from a sub-path, as on GitHub Pages.
  basePath: process.env.BASE_PATH || undefined,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
