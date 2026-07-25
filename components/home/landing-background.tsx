'use client'

import React, { useEffect, useState } from 'react'

export function LandingBackground() {
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 })
  const [opacity, setOpacity] = useState(0)
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    let animationFrameId: number

    const handleMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = requestAnimationFrame(() => {
        setMousePos({ x: e.clientX, y: e.clientY })
        setOpacity(1)
      })
    }

    const handleScroll = () => {
      setScrollY(window.scrollY)
    }

    const handleMouseLeave = () => {
      setOpacity(0)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('scroll', handleScroll, { passive: true })
    document.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('scroll', handleScroll)
      document.removeEventListener('mouseleave', handleMouseLeave)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  // Floating translucent bubbles (underwater / floating air bubble feel)
  const bubbles = [
    { top: '80%', left: '8%', size: 14, duration: '28s', delay: '0s' },
    { top: '90%', left: '22%', size: 8, duration: '34s', delay: '3s' },
    { top: '75%', left: '38%', size: 18, duration: '40s', delay: '6s' },
    { top: '85%', left: '52%', size: 10, duration: '30s', delay: '2s' },
    { top: '95%', left: '68%', size: 22, duration: '45s', delay: '5s' },
    { top: '88%', left: '82%', size: 12, duration: '32s', delay: '1s' },
    { top: '70%', left: '92%', size: 16, duration: '38s', delay: '4s' },
    { top: '60%', left: '15%', size: 9, duration: '36s', delay: '7s' },
    { top: '65%', left: '44%', size: 15, duration: '42s', delay: '8s' },
    { top: '50%', left: '76%', size: 11, duration: '33s', delay: '2s' },
  ]

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#050505]">
      {/* Parallax Container */}
      <div 
        className="absolute inset-0 transition-transform duration-300 ease-out will-change-transform"
        style={{ transform: `translateY(${scrollY * -0.04}px)` }}
      >
        {/* 1. Base Dark Teal & Soft Coral Gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(15,118,110,0.2),rgba(5,5,5,0))]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_80%_60%,rgba(225,112,85,0.09),rgba(5,5,5,0))]" />

        {/* 2. Soft Animated Light Rays behind Hero */}
        <div className="absolute left-1/2 -top-[10%] h-[750px] w-[850px] -translate-x-1/2 opacity-25 bg-[radial-gradient(ellipse_at_top,rgba(20,184,166,0.4),rgba(16,185,129,0.15)_40%,transparent_70%)] blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />

        {/* 3. Animated Aurora Gradient Blobs (20-40s Breathing Loops) */}
        <div 
          className="absolute -top-[10%] -left-[10%] h-[55vw] w-[55vw] rounded-full bg-gradient-to-br from-teal-600/20 via-emerald-600/15 to-transparent blur-[120px] will-change-transform"
          style={{ animation: 'aurora-1 32s ease-in-out infinite' }}
        />
        <div 
          className="absolute top-[35%] -right-[15%] h-[60vw] w-[60vw] rounded-full bg-gradient-to-bl from-rose-500/15 via-orange-400/10 to-transparent blur-[140px] will-change-transform"
          style={{ animation: 'aurora-2 38s ease-in-out infinite' }}
        />
        <div 
          className="absolute top-[65%] left-[15%] h-[50vw] w-[50vw] rounded-full bg-gradient-to-tr from-emerald-700/15 via-teal-500/10 to-transparent blur-[130px] will-change-transform"
          style={{ animation: 'aurora-3 28s ease-in-out infinite' }}
        />

        {/* 4. Translucent Floating Bubbles (Underwater / Floating Air Bubbles) */}
        {bubbles.map((b, idx) => (
          <div
            key={idx}
            className="animate-bubble absolute rounded-full border border-teal-300/20 bg-gradient-to-t from-teal-500/10 to-emerald-300/10 shadow-[0_0_12px_rgba(20,184,166,0.15)] backdrop-blur-[2px]"
            style={{
              top: b.top,
              left: b.left,
              width: `${b.size}px`,
              height: `${b.size}px`,
              animationDuration: b.duration,
              animationDelay: b.delay,
              willChange: 'transform, opacity',
            }}
          />
        ))}
      </div>

      {/* 5. Subtle Vignette Edge Mask */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(5,5,5,0.85)_100%)]" />

      {/* 6. Soft Mouse-Follow Spotlight */}
      <div
        className="absolute -inset-px transition-opacity duration-700 pointer-events-none"
        style={{
          opacity,
          background: `radial-gradient(650px circle at ${mousePos.x}px ${mousePos.y}px, rgba(20, 184, 166, 0.08), transparent 80%)`,
        }}
      />

      {/* 7. Extremely Low-Opacity Noise Texture */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.025] mix-blend-overlay">
        <filter id="landing-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#landing-noise)" />
      </svg>
    </div>
  )
}

