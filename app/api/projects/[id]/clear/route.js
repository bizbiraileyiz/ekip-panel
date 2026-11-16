import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { running } from '@/lib/orchestrator';

export const dynamic = 'force-dynamic';

// Sohbeti kalıcı olarak siler (ekleriyle birlikte). Karar kaydı ve "Hakkımda" etkilenmez.
export const POST = withAuth(async (_req, { params }) => {
  const { id } = await params;
  const pid = Number(id);
  if (running.has(pid)) return NextResponse.json({ error: 'Şu an cevap yazılıyor, bitince temizle.' }, { status: 409 });
  const r = await q('DELETE FROM messages WHERE project_id = $1', [pid]);
  return NextResponse.json({ ok: true, deleted: r.rowCount });
});
