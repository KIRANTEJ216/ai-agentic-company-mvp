'use client'

import { useParams } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { getAgentBySlug } from '@/data/agents'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { v4 as uuidv4 } from 'uuid'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export default function AgentChatPage() {
  const params = useParams()
  const slug = params.slug as string
  const agent = getAgentBySlug(slug)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(uuidv4())
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (!agent) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="mb-4 text-2xl font-bold">Agent not found</h1>
        <Link href="/agents">
          <Button>Browse Agents</Button>
        </Link>
      </div>
    )
  }

  async function sendMessage() {
    if (!input.trim() || loading) return

    const userMsg: Message = { id: uuidv4(), role: 'user', content: input }
    const assistantMsg: Message = { id: uuidv4(), role: 'assistant', content: '' }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setLoading(true)

    const history = messages.concat(userMsg)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_slug: slug, messages: history }),
      })

      if (!response.ok) throw new Error('Request failed')

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + text }
          }
          return updated
        })
      }
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: last.content || 'Error: Failed to get response. Check your API key.',
          }
        }
        return updated
      })
    } finally {
      setLoading(false)
    }
  }

  const divColors: Record<string, string> = {
    engineering: '#3B82F6',
    marketing: '#F97316',
    sales: '#10B981',
    product: '#D946EF',
    design: '#EC4899',
    security: '#EF4444',
    'project-management': '#0EA5E9',
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl gap-6 px-4 py-4">
      <Card className="flex w-80 flex-shrink-0 flex-col">
        <CardHeader className="pb-3">
          <div className="mb-1 text-3xl">{agent.emoji}</div>
          <CardTitle>{agent.name}</CardTitle>
          <Badge
            style={{
              backgroundColor: (divColors[agent.division] || '#666') + '20',
              color: divColors[agent.division] || '#666',
              border: 'none',
            }}
          >
            {agent.division}
          </Badge>
          <p className="mt-2 text-sm text-muted-foreground">{agent.description}</p>
          <p className="text-xs text-muted-foreground">Model: {agent.model}</p>
        </CardHeader>
        <CardContent className="flex-1">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Suggested tasks</div>
          <div className="flex flex-wrap gap-1">
            {agent.division === 'engineering' && ['Build a React component', 'Design an API', 'Review code', 'Architect a system'].map(t => (
              <button key={t} onClick={() => setInput(t)} className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent">
                {t}
              </button>
            ))}
            {agent.division === 'marketing' && ['Write a blog post', 'SEO audit', 'Email sequence', 'Content strategy'].map(t => (
              <button key={t} onClick={() => setInput(t)} className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent">
                {t}
              </button>
            ))}
            {agent.division === 'sales' && ['Outreach sequence', 'Demo script', 'Proposal review', 'Deal strategy'].map(t => (
              <button key={t} onClick={() => setInput(t)} className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent">
                {t}
              </button>
            ))}
            {(agent.division === 'product' || agent.division === 'design') && ['Write a PRD', 'Feedback analysis', 'Design system', 'User research plan'].map(t => (
              <button key={t} onClick={() => setInput(t)} className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent">
                {t}
              </button>
            ))}
            {agent.division === 'security' && ['Threat model', 'Security audit', 'Compliance check', 'Incident response'].map(t => (
              <button key={t} onClick={() => setInput(t)} className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent">
                {t}
              </button>
            ))}
            {agent.division === 'project-management' && ['Project plan', 'Risk assessment', 'Meeting notes', 'Experiment design'].map(t => (
              <button key={t} onClick={() => setInput(t)} className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent">
                {t}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="flex flex-1 flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            Chat with {agent.emoji} {agent.name}
          </CardTitle>
        </CardHeader>

        <ScrollArea ref={scrollRef} className="flex-1 px-4">
          {messages.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              <p className="mb-2 text-2xl">{agent.emoji}</p>
              <p>Ask {agent.name} anything about {agent.division}.</p>
              <p className="text-sm">Or click a suggested task above.</p>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {msg.role === 'assistant' && <span className="mr-1">{agent.emoji}</span>}
                <div className="whitespace-pre-wrap text-sm">{msg.content || (loading && msg.role === 'assistant' ? '...' : '')}</div>
              </div>
            </div>
          ))}
        </ScrollArea>

        <div className="border-t p-4">
          <div className="flex gap-2">
            <Textarea
              placeholder={`Ask ${agent.name} something...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              className="min-h-[44px] flex-1"
              rows={1}
            />
            <Button onClick={sendMessage} disabled={loading || !input.trim()} className="self-end">
              {loading ? '...' : 'Send'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
