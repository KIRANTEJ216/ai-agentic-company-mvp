import Stripe from 'stripe'
export async function POST(req:Request){
 const key=process.env.STRIPE_SECRET_KEY,secret=process.env.STRIPE_WEBHOOK_SECRET
 if(!key||!secret)return Response.json({error:'Stripe webhook not configured'},{status:503})
 try{
  // Never trust unsigned subscription events. This endpoint does not grant social allowance.
  const stripe=new Stripe(key)
  const event=stripe.webhooks.constructEvent(await req.text(),req.headers.get('stripe-signature')||'',secret)
  return Response.json({received:true,type:event.type,entitlements_updated:false})
 }catch{return Response.json({error:'Invalid webhook signature'},{status:400})}
}
