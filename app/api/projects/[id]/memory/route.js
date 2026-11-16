import { NextResponse } from 'next/server';
import { q, getProject } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, { params }) => {
  const { id } = await params;
  const p = await getProject(Number(id));
  if (!p) return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404 });
  const h = await q(
    'SELECT id, content, created_at FROM memory_versions WHERE project_id = $1 ORDER BY id DESC LIMIT 10',
    [p.id]
  );
  return NextResponse.json({ memory: p.memory, version: p.memory_version, history: h.rows });
});

// Kaydetme sürüm kontrollüdür: başka bir cihazda arada değiştiyse 409 döner, üzerine yazılmaz.
export const PUT = withAuth(async (req, { params }) => {
  const { id } = await params;
  const { memory, version } = await req.json().catch(() => ({}));
  const pid = Number(id);
  const text = String(memory ?? '').slice(0, 20000);

  const cur = await getProject(pid);
  if (!cur) return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404 });

  const r = await q(
    'UPDATE projects SET memory = $1, memory_version = memory_version + 1 WHERE id = $2 AND memory_version = $3 RETURNING memory_version',
    [text, pid, Number(version)]
  );
  if (!r.rowCount) {
    const now = await getProject(pid);
    return NextResponse.json(
      { error: 'Kayıt bu arada değişmiş. Güncel hali yüklendi, değişikliğini tekrar uygula.', memory: now.memory, version: now.memory_version },
      { status: 409 }
    );
  }
  if (cur.memory.trim()) await q('INSERT INTO memory_versions(project_id, content) VALUES ($1, $2)', [pid, cur.memory]);
  return NextResponse.json({ ok: true, version: r.rows[0].memory_version });
});
