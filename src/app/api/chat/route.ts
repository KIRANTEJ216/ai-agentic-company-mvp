import { NextRequest, NextResponse } from 'next/server'
import { getAgentBySlug } from '@/data/agents'

export async function POST(req: NextRequest) {
  try {
    const { agent_slug, messages: conversationHistory } = await req.json()

    if (!agent_slug) {
      return NextResponse.json({ error: 'agent_slug is required' }, { status: 400 })
    }

    const agent = getAgentBySlug(agent_slug)
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const lastMessage = conversationHistory?.[conversationHistory.length - 1]?.content || ''
    if (!lastMessage) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const apiMessages = [
      { role: 'system', content: agent.system_prompt },
      ...(conversationHistory?.slice(-20) || []).map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
    ]

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
        'X-Title': 'AI Agentic Company',
      },
      body: JSON.stringify({
        model: agent.model,
        messages: apiMessages,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenRouter error:', response.status, errorText)
      return NextResponse.json(
        { error: `OpenRouter API error: ${response.status}` },
        { status: 502 }
      )
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') continue
                try {
                  const parsed = JSON.parse(data)
                  const content = parsed.choices?.[0]?.delta?.content || ''
                  if (content) {
                    controller.enqueue(new TextEncoder().encode(content))
                  }
                } catch {
                  // skip malformed JSON
                }
              }
            }
          }
        } catch (err) {
          console.error('Stream error:', err)
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
