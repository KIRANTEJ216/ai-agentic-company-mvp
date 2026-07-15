import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <section className="mb-20 text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight">
          Your AI-Powered{' '}
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Company
          </span>
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
          A complete team of AI specialists across engineering, marketing, sales, product, design, 
          security, and project management. Each agent is an expert in their domain, ready to 
          help you build, grow, and ship.
        </p>
        <div className="flex justify-center gap-4">
          <Link href="/agents">
            <Button size="lg">Browse Agents</Button>
          </Link>
          <Link href="/orchestrate">
            <Button size="lg" variant="outline">Try Orchestrator</Button>
          </Link>
        </div>
      </section>

      <section className="mb-20">
        <h2 className="mb-8 text-center text-3xl font-bold">7 Divisions, 43 Specialists</h2>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[
            { emoji: '💻', name: 'Engineering', desc: 'Frontend, backend, DevOps, data, ML, architecture, code review', color: '#3B82F6' },
            { emoji: '📢', name: 'Marketing', desc: 'Content, SEO, social, email, growth, brand, AI citations', color: '#F97316' },
            { emoji: '💼', name: 'Sales', desc: 'Outbound, demos, proposals, accounts, pipeline, coaching', color: '#10B981' },
            { emoji: '📊', name: 'Product', desc: 'PM, sprint prioritization, feedback, research, behavioral design', color: '#D946EF' },
            { emoji: '🎨', name: 'Design', desc: 'UI, UX research, IA, visual storytelling, whimsy', color: '#EC4899' },
            { emoji: '🔒', name: 'Security', desc: 'Architecture, appsec, pentesting, compliance, cloud', color: '#EF4444' },
            { emoji: '📋', name: 'Project Mgmt', desc: 'Coordination, portfolio, Jira, meetings, experiments, risk', color: '#0EA5E9' },
          ].map((div) => (
            <Card key={div.name} className="border-l-4" style={{ borderLeftColor: div.color }}>
              <CardContent className="p-4">
                <div className="mb-1 text-2xl">{div.emoji}</div>
                <h3 className="font-semibold">{div.name}</h3>
                <p className="text-sm text-muted-foreground">{div.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-20 text-center">
        <h2 className="mb-4 text-3xl font-bold">How It Works</h2>
        <div className="grid gap-8 md:grid-cols-3">
          <div className="rounded-lg border p-6">
            <div className="mb-2 text-3xl">1️⃣</div>
            <h3 className="mb-2 font-semibold">Pick an Agent</h3>
            <p className="text-sm text-muted-foreground">Browse specialists by division. Each has deep domain expertise.</p>
          </div>
          <div className="rounded-lg border p-6">
            <div className="mb-2 text-3xl">2️⃣</div>
            <h3 className="mb-2 font-semibold">Chat with Them</h3>
            <p className="text-sm text-muted-foreground">Describe your task. The agent uses its expertise to help you.</p>
          </div>
          <div className="rounded-lg border p-6">
            <div className="mb-2 text-3xl">3️⃣</div>
            <h3 className="mb-2 font-semibold">Orchestrate</h3>
            <p className="text-sm text-muted-foreground">Need multiple skills? The Orchestrator routes work across agents.</p>
          </div>
        </div>
      </section>

      <section className="text-center">
        <h2 className="mb-4 text-3xl font-bold">Ready to Build?</h2>
        <p className="mb-6 text-muted-foreground">Start with any agent or let the Orchestrator plan your workflow.</p>
        <div className="flex justify-center gap-4">
          <Link href="/agents">
            <Button size="lg">Browse All Agents →</Button>
          </Link>
        </div>
      </section>
    </div>
  )
}
