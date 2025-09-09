import { NextResponse } from 'next/server'

export async function GET() {
  // Always return false since we're not using server-side auth verification
  return NextResponse.json({ authenticated: false })
}
