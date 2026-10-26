'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Nav() {
  return (
    <nav className="border-b">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          <span>🏢</span> AI Agentic Co
        </Link>
        <div className="flex flex-wrap items-center gap-1">
          <Link href="/social"><Button variant="ghost">Flologix Social</Button></Link>
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
