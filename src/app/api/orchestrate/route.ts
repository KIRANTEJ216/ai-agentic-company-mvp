import { NextRequest, NextResponse } from 'next/server'
import { agents, getAgentBySlug } from '@/data/agents'

const ORCHESTRATOR_PROMPT = `You are the Agents Orchestrator, CEO of an AI agentic company.
Your job is to analyze a user's task and determine which specialized agents should handle it.

Available agents:
{agents_list}

For each task, decide:
1. Which agent(s) to use and in what order
2. What each agent should produce
3. How their outputs combine

Respond with a JSON array of steps:
[
  {
    "agent_slug": "slug-of-agent",
    "task": "detailed task description for this agent"
  }
]

If one agent's output feeds another, order them sequentially.
If agents can work in parallel, they'll be run simultaneously.`

export async function POST(req: NextRequest) {
  try {
    const { task } = await req.json()
    if (!task) {
      return NextResponse.json({ error: 'Task description is required' }, { status: 400 })
    }

    const agentsList = agents
      .map(a => `- ${a.emoji} ${a.name} (slug: ${a.slug}) — ${a.description}`)
      .join('\n')

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
        'X-Title': 'AI Agentic Company - Orchestrator',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [
          { role: 'system', content: ORCHESTRATOR_PROMPT.replace('{agents_list}', agentsList) },
          { role: 'user', content: task },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Orchestrator error:', response.status, errorText)
      return NextResponse.json({ error: 'Orchestration failed' }, { status: 502 })
    }

    const data = await response.json()
    const steps = JSON.parse(data.choices[0].message.content)

    const results = []
    for (const step of steps) {
      const agent = getAgentBySlug(step.agent_slug)
      if (!agent) continue

      const stepResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: agent.model,
          messages: [
            { role: 'system', content: agent.system_prompt },
            { role: 'user', content: step.task },
          ],
        }),
      })

      if (!stepResponse.ok) {
        results.push({
          agent_slug: step.agent_slug,
          agent_name: agent.name,
          error: 'Agent execution failed',
        })
        continue
      }

      const stepData = await stepResponse.json()
      results.push({
        agent_slug: step.agent_slug,
        agent_name: agent.name,
        output: stepData.choices[0].message.content,
      })

      // update subsequent tasks with previous output
      for (const laterStep of steps) {
        if (laterStep.task) {
          laterStep.task = laterStep.task.replace('{previous_output}', stepData.choices[0].message.content)
        }
      }
    }

    return NextResponse.json({ steps: results })
  } catch (error) {
    console.error('Orchestrate API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
