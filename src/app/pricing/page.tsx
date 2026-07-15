'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const plans = [
  {
    name: 'Starter',
    price: '$29',
    period: '/month',
    description: 'For individuals exploring the power of specialized AI agents.',
    features: [
      '10 agent slots',
      '1,000 messages/month',
      'Single conversation per agent',
      'Email support',
    ],
    popular: false,
  },
  {
    name: 'Pro',
    price: '$79',
    period: '/month',
    description: 'For professionals who need the full agent roster daily.',
    features: [
      'All 43 agents',
      '10,000 messages/month',
      'Conversation history',
      'Orchestrator mode',
      'Priority support',
    ],
    popular: true,
  },
  {
    name: 'Team',
    price: '$199',
    period: '/month',
    description: 'For teams collaborating across every function.',
    features: [
      'Everything in Pro',
      '50,000 messages/month',
      'Team workspaces',
      'Custom agent builder',
      'API access',
      'Dedicated support',
    ],
    popular: false,
  },
]

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-4xl font-bold">Pricing</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Start with any plan. All include access to the full agent roster. Upgrade as your usage grows.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name} className={`relative ${plan.popular ? 'border-primary shadow-lg' : ''}`}>
            {plan.popular && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2" variant="default">
                Most Popular
              </Badge>
            )}
            <CardHeader>
              <CardTitle className="text-xl">{plan.name}</CardTitle>
              <div className="mt-2">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>
              <CardDescription className="mt-2">{plan.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <span className="text-green-500">✓</span> {f}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full" variant={plan.popular ? 'default' : 'outline'}>
                {plan.name === 'Starter' ? 'Start Free Trial' : 'Subscribe'}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="mt-16 text-center">
        <p className="text-sm text-muted-foreground">
          All plans include a 7-day free trial. No credit card required for Starter.
        </p>
      </div>
    </div>
  )
}
