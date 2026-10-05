import React from "react"
import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AuthHashHandler } from '@/components/auth/auth-hash-handler'

const fontSans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: 'CALMER - Release Anger, Find Peace',
  description: 'A self-help platform: release anger through an interactive game, then reflect on it with an AI companion. Not a substitute for professional care.',
  keywords: ['mental health', 'anger management', 'emotion regulation', 'AI companion', 'stress relief'],
}

export const viewport: Viewport = {
  themeColor: '#1a1f2e',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`dark ${fontSans.variable} ${fontMono.variable}`}>
      <body className="font-sans antialiased min-h-screen">
        <AuthHashHandler />
        {children}
      </body>
    </html>
  )
}
