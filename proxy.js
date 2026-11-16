import { NextResponse } from 'next/server';

// Hafif ön kontrol: çerez yoksa giriş sayfasına yönlendir.
// Asıl oturum doğrulaması her API route'unda veritabanından yapılır (lib/auth.js → withAuth).
const PUBLIC = ['/login', '/api/login'];

export function proxy(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  if (req.cookies.get('ekip_oturum')?.value) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
