// Every origin the app talks to: itself, Supabase (REST + realtime), the CDN
// for the gesture WASM and transformers.js, Google storage (gesture model) and
// Hugging Face (the ViT face model; its files redirect to *.hf.co).
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://*.supabase.co'
const CSP = [
  "default-src 'self'",
  // Next.js inlines its bootstrap scripts; WebAssembly needs wasm-unsafe-eval.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE} ${SUPABASE.replace('https://', 'wss://')} https://cdn.jsdelivr.net https://storage.googleapis.com https://huggingface.co https://*.hf.co`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Baseline security headers (audit S10).
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
          // REPORT-ONLY for now: the browser logs what this policy WOULD block
          // (DevTools console) but blocks nothing. The opt-in gesture feature
          // loads WASM from cdn.jsdelivr.net and its model from
          // storage.googleapis.com, and camera features can't be exercised in
          // CI. Once the face/voice/gesture features run in Chrome with no
          // violations logged, rename the key to Content-Security-Policy.
          { key: 'Content-Security-Policy-Report-Only', value: CSP },
        ],
      },
    ]
  },
}

export default nextConfig
