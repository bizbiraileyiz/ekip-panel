import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { q } from './db';

export const COOKIE = 'ekip_oturum';
const SESSION_DAYS = 30;
const FAIL_WINDOW_MIN = 15;
const FAIL_PER_IP = 5;
const FAIL_GLOBAL = 30;

const sha = (s) => createHash('sha256').update(s).digest('hex');

export function configured() {
  return Boolean(process.env.APP_PASSWORD && process.env.AUTH_SECRET);
}

// Şifre değişince parmak izi değişir → tüm eski oturumlar geçersiz olur.
const pwFingerprint = () => sha(`${process.env.APP_PASSWORD}|${process.env.AUTH_SECRET}`);

export function passwordMatches(input) {
  const a = Buffer.from(sha(String(input || '')));
  const b = Buffer.from(sha(process.env.APP_PASSWORD || ''));
  return timingSafeEqual(a, b);
}

export function clientIp(req) {
  // x-forwarded-for'un ilk değeri istemci tarafından uydurulabilir; proxy'nin eklediği son değeri kullan.
  const xff = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return req.headers.get('x-real-ip') || xff[xff.length - 1] || 'bilinmiyor';
}

export async function loginBlocked(ip) {
  await q(`DELETE FROM login_failures WHERE at < now() - interval '1 day'`);
  const r = await q(
    `SELECT count(*)::int AS all_n, count(*) FILTER (WHERE ip = $1)::int AS ip_n
     FROM login_failures WHERE at > now() - ($2 || ' minutes')::interval`,
    [ip, String(FAIL_WINDOW_MIN)]
  );
  const { all_n, ip_n } = r.rows[0];
  return ip_n >= FAIL_PER_IP || all_n >= FAIL_GLOBAL;
}

export async function recordFailure(ip) {
  await q('INSERT INTO login_failures(ip) VALUES ($1)', [ip]);
}

export async function createSession() {
  const token = randomBytes(32).toString('base64url');
  await q(
    `INSERT INTO sessions(token_hash, pw_fp, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [sha(token), pwFingerprint(), String(SESSION_DAYS)]
  );
  await q('DELETE FROM sessions WHERE expires_at < now()');
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export async function destroySession(req) {
  const token = req.cookies.get(COOKIE)?.value;
  if (token) await q('DELETE FROM sessions WHERE token_hash = $1', [sha(token)]);
}

export async function validSession(req) {
  if (!configured()) return false;
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return false;
  const r = await q('SELECT 1 FROM sessions WHERE token_hash = $1 AND pw_fp = $2 AND expires_at > now()', [
    sha(token),
    pwFingerprint(),
  ]);
  return r.rowCount > 0;
}

// Her API route'unu sunucu tarafı oturum kontrolüyle sarar.
export function withAuth(handler) {
  return async (req, ctx) => {
    if (!(await validSession(req))) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });
    return handler(req, ctx);
  };
}
