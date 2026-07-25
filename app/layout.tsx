import React from "react"
import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import './globals.css'

const fontSans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: 'CALMER - Release Anger, Find Peace',
  description: 'A therapeutic platform that helps you release anger through an interactive game and find peace with an AI therapist chatbox.',
  keywords: ['mental health', 'anger management', 'therapy', 'AI chatbot', 'stress relief'],
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
        {children}
      </body>
    </html>
  )
}
