import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { running } from '@/lib/orchestrator';

export const dynamic = 'force-dynamic';

// Sohbeti temizler: mesajlar silinmez, arşivlenir (ekranda ve modellerin bağlamında görünmez).
// Karar kaydı ve "Hakkımda" etkilenmez.
export const POST = withAuth(async (_req, { params }) => {
  const { id } = await params;
  const pid = Number(id);
  if (running.has(pid)) return NextResponse.json({ error: 'Şu an cevap yazılıyor, bitince temizle.' }, { status: 409 });
  const r = await q('UPDATE messages SET archived = true WHERE project_id = $1 AND NOT archived', [pid]);
  return NextResponse.json({ ok: true, archived: r.rowCount });
});
