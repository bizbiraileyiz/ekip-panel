import { NextResponse } from 'next/server';
import { COOKIE, configured, passwordMatches, clientIp, loginBlocked, recordFailure, createSession } from '@/lib/auth';

export async function POST(req) {
  if (!configured()) {
    return NextResponse.json({ error: 'Sunucuda APP_PASSWORD / AUTH_SECRET tanımlı değil' }, { status: 500 });
  }
  const ip = clientIp(req);
  if (await loginBlocked(ip)) {
    return NextResponse.json({ error: 'Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.' }, { status: 429 });
  }
  const { password } = await req.json().catch(() => ({}));
  if (!passwordMatches(password)) {
    await recordFailure(ip);
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: 'Şifre yanlış' }, { status: 401 });
  }
  const { token, maxAge } = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  return res;
}
