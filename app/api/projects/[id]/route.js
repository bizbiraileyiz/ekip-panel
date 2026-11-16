import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { running } from '@/lib/orchestrator';

export const dynamic = 'force-dynamic';

// Odayı tüm mesajları, ekleri ve listesiyle birlikte kalıcı siler.
export const DELETE = withAuth(async (_req, { params }) => {
  const { id } = await params;
  const pid = Number(id);
  if (running.has(pid)) return NextResponse.json({ error: 'Bu odada şu an cevap yazılıyor, bitince sil.' }, { status: 409 });
  await q('DELETE FROM projects WHERE id = $1', [pid]);
  // Hiç oda kalmadıysa boş bir "Genel" oda aç
  await q(`INSERT INTO projects(name) SELECT 'Genel' WHERE NOT EXISTS (SELECT 1 FROM projects)`);
  const r = await q('SELECT id, name, auto_reply FROM projects ORDER BY id');
  return NextResponse.json(r.rows);
});

// Oda ayarı: otomatik cevap aç/kapa
export const PATCH = withAuth(async (req, { params }) => {
  const { id } = await params;
  const { auto_reply } = await req.json().catch(() => ({}));
  const r = await q('UPDATE projects SET auto_reply = $1 WHERE id = $2 RETURNING id, name, auto_reply', [Boolean(auto_reply), Number(id)]);
  if (!r.rowCount) return NextResponse.json({ error: 'Oda bulunamadı' }, { status: 404 });
  return NextResponse.json(r.rows[0]);
});
