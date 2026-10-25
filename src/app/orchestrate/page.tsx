'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface StepResult {
  agent_slug: string
  agent_name: string
  output?: string
  error?: string
}

export default function OrchestratePage() {
  const [task, setTask] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<StepResult[]>([])

  async function runOrchestration() {
    if (!task.trim() || loading) return
    setLoading(true)
    setResults([])

    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      })

      if (!res.ok) throw new Error('Orchestration failed')
      const data = await res.json()
      setResults(data.steps || [])
    } catch {
      setResults([{ agent_slug: '', agent_name: 'Error', error: 'Orchestration failed. Check your API key.' }])
    } finally {
      setLoading(false)
    }
  }

  const exampleTasks = [
    'Build a landing page for my SaaS product (design + code + copy)',
    'Conduct a security review of my web application',
    'Plan a product launch — from PRD to marketing campaign',
    'Create a sales strategy for entering a new market',
  ]

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">🎭 Agents Orchestrator</h1>
        <p className="text-muted-foreground">
          Describe a complex task. The Orchestrator will analyze it, decide which agents are needed,
          and run them in sequence — each specialist handling their part.
        </p>
      </div>

      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            {exampleTasks.map(t => (
              <button
                key={t}
                onClick={() => setTask(t)}
                className="rounded-full border px-3 py-1 text-xs hover:bg-accent"
              >
                {t.slice(0, 50)}...
              </button>
            ))}
          </div>
          <Textarea
            placeholder="Describe what you want to build or accomplish..."
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={4}
            className="mb-4"
          />
          <Button onClick={runOrchestration} disabled={loading || !task.trim()} size="lg" className="w-full">
            {loading ? 'Orchestrating...' : '🚀 Run Orchestration'}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Results</h2>
          {results.map((step, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Step {i + 1}</Badge>
                  <CardTitle className="text-base">{step.agent_name}</CardTitle>
                  {step.error && <Badge variant="destructive">Error</Badge>}
                </div>
              </CardHeader>
              <CardContent>
                {step.output ? (
                  <div className="whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm">
                    {step.output}
                  </div>
                ) : step.error ? (
                  <p className="text-sm text-destructive">{step.error}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
