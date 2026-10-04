'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

/** Shown on the dashboard to people who are someone's trusted person. */
export function SupportingLink() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    createClient()
      .rpc('my_supported_people')
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data)) setCount(data.length)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (count === 0) return null
  return (
    <Button asChild variant="outline">
      <Link href="/support">People you support ({count})</Link>
    </Button>
  )
}
