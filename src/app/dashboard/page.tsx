'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardPage() {
  // For MVP: static demo data. In production, this comes from Supabase/Stripe.
  const stats = [
    { label: 'Conversations', value: '0', desc: 'Total agent conversations' },
    { label: 'Messages Sent', value: '0', desc: 'Across all agents' },
    { label: 'Tokens Used', value: '0', desc: 'Total AI usage' },
    { label: 'Plan', value: 'Starter', desc: 'Current subscription tier' },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Your usage, conversations, and account settings.</p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Conversations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-muted-foreground">
            No conversations yet. Start chatting with an agent to see them here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
