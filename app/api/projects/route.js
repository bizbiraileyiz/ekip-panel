import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const r = await q('SELECT id, name, auto_reply FROM projects ORDER BY id');
  return NextResponse.json(r.rows);
});

export const POST = withAuth(async (req) => {
  const { name } = await req.json().catch(() => ({}));
  const clean = String(name || '').trim().slice(0, 80);
  if (!clean) return NextResponse.json({ error: 'Proje adı gerekli' }, { status: 400 });
  const r = await q(
    'INSERT INTO projects(name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, auto_reply',
    [clean]
  );
  return NextResponse.json(r.rows[0]);
});
