/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully client-side, local-first app: build to static files in ./out.
  output: "export",
  images: {
    unoptimized: true,
  },
}

export default nextConfig
