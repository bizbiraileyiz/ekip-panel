import { runTurn } from '@/lib/orchestrator';
import { withAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Cevapları satır satır JSON (NDJSON) olarak akıtır: typing / message / done / error
export const POST = withAuth(async (req, { params }) => {
  const { id } = await params;
  const { content } = await req.json().catch(() => ({}));
  const text = String(content || '').trim();
  if (!text) return Response.json({ error: 'Mesaj boş' }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'));
        } catch {} // istemci ayrıldıysa tur yine de tamamlanır ve kaydedilir
      };
      try {
        for await (const ev of runTurn(Number(id), text.slice(0, 20000))) send(ev);
      } catch (e) {
        send({ type: 'error', error: e.message });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
});
