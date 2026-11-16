import { NextResponse } from 'next/server';
import { COOKIE, destroySession } from '@/lib/auth';

export async function POST(req) {
  await destroySession(req); // oturum sunucuda silinir; çalınmış çerez de geçersiz olur
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
