import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // No server-side protection - all auth is handled client-side
  return NextResponse.next()
}

export const config = {
  matcher: []
}
