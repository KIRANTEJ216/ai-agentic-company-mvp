'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Nav() {
  return (
    <nav className="border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          <span>🏢</span> AI Agentic Co
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/agents">
            <Button variant="ghost">Agents</Button>
          </Link>
          <Link href="/orchestrate">
            <Button variant="ghost">Orchestrate</Button>
          </Link>
          <Link href="/pricing">
            <Button variant="ghost">Pricing</Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="ghost">Dashboard</Button>
          </Link>
        </div>
      </div>
    </nav>
  )
}
