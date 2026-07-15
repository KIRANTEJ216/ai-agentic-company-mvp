import { NextResponse } from 'next/server'
import { agents, divisions } from '@/data/agents'

export async function GET() {
  return NextResponse.json({ agents, divisions })
}
