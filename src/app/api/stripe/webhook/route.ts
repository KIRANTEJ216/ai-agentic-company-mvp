import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const sig = req.headers.get('stripe-signature') || ''

    // For MVP: log webhooks
    const event = JSON.parse(body)
    console.log('Stripe webhook:', event.type)

    switch (event.type) {
      case 'checkout.session.completed':
        console.log('Payment succeeded for session:', event.data.object.id)
        break
      case 'customer.subscription.updated':
        console.log('Subscription updated:', event.data.object.id)
        break
      case 'customer.subscription.deleted':
        console.log('Subscription cancelled:', event.data.object.id)
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook error' }, { status: 400 })
  }
}
