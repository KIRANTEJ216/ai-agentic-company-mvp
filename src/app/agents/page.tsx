'use client'

import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { agents, divisions } from '@/data/agents'
import { getAgentsByDivisions } from '@/data/agents'
import { useState } from 'react'

export default function AgentsPage() {
  const [search, setSearch] = useState('')
  const grouped = getAgentsByDivisions()

  const filtered = Object.entries(grouped).map(([div, divAgents]): [string, typeof agents] => [
    div,
    divAgents.filter(a =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase())
    ),
  ]).filter(([, a]) => a.length > 0)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">All Agents</h1>
        <p className="mb-4 text-muted-foreground">
          {agents.length} specialists across 7 divisions. Pick one and start a conversation.
        </p>
        <Input
          placeholder="Search agents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {filtered.map(([division, divAgents]) => {
        const div = divisions[division]
        if (!div) return null
        return (
          <section key={division} className="mb-10">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold" style={{ color: div.color }}>
              <span>{div.emoji}</span> {div.label}
              <Badge variant="outline" className="ml-2 text-sm font-normal">
                {divAgents.length} agents
              </Badge>
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {divAgents.map((agent) => (
                <Link key={agent.id} href={`/agents/${agent.slug}`}>
                  <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{agent.emoji}</span>
                        <Badge style={{ backgroundColor: div.color + '20', color: div.color, border: 'none' }}>
                          {div.label}
                        </Badge>
                      </div>
                      <CardTitle className="mt-2 text-lg">{agent.name}</CardTitle>
                      <CardDescription className="text-sm">{agent.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
