import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // For now, allow all requests (auth will be handled by components)
  // In production, you would verify the session token here
  const { pathname } = request.nextUrl

  // Allow login page
  if (pathname === '/login') {
    return NextResponse.next()
  }

  // For protected routes, we'll handle auth in the components
  // since we need to check Firebase auth which requires client-side code
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
