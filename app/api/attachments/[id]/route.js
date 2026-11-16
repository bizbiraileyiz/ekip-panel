import { q } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, { params }) => {
  const { id } = await params;
  const r = await q('SELECT name, mime, data FROM attachments WHERE id = $1', [Number(id)]);
  const a = r.rows[0];
  if (!a) return new Response('Bulunamadı', { status: 404 });
  return new Response(a.data, {
    headers: {
      'content-type': a.mime,
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
    },
  });
});
