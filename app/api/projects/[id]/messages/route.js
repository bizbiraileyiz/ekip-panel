import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// ?after=<id> ile sadece yeni mesajlar (telefon/bilgisayar senkronu için)
export const GET = withAuth(async (req, { params }) => {
  const { id } = await params;
  const after = Number(new URL(req.url).searchParams.get('after') || 0);
  const r = await q(
    `SELECT id, project_id, sender, content, created_at FROM (
       SELECT * FROM messages WHERE project_id = $1 AND id > $2 ORDER BY id DESC LIMIT 200
     ) t ORDER BY id ASC`,
    [Number(id), after]
  );
  return NextResponse.json(r.rows);
});
