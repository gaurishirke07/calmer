/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Baseline security headers (audit S10). No Content-Security-Policy yet: the
  // opt-in face/gesture models load scripts and WASM from cdn.jsdelivr.net and
  // storage.googleapis.com, so a CSP needs testing with those features on.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // No one may frame CALMER (clickjacking on sign-in or account deletion).
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Camera and mic only for CALMER itself (the opt-in face, voice and
          // gesture features), never for embedded third parties.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
