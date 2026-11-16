import { runTurn } from '@/lib/orchestrator';
import { withAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const MAX_FILES = 4;
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];

function parseFiles(raw) {
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_FILES) throw new Error(`En fazla ${MAX_FILES} dosya eklenebilir`);
  return raw.map((f) => {
    const mime = String(f?.mime || '');
    if (!ALLOWED.includes(mime)) throw new Error(`Desteklenmeyen dosya türü: ${mime || '?'} (resim ya da PDF olmalı)`);
    const data = Buffer.from(String(f?.data || ''), 'base64');
    if (!data.length) throw new Error('Boş dosya');
    if (data.length > MAX_BYTES) throw new Error(`${f.name || 'Dosya'} 4 MB'tan büyük`);
    return { name: String(f?.name || 'dosya').slice(0, 120), mime, data };
  });
}

// Cevapları satır satır JSON (NDJSON) olarak akıtır: typing / message / done / error
export const POST = withAuth(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const text = String(body.content || '').trim();
  let files;
  try {
    files = parseFiles(body.files);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
  if (!text && !files.length) return Response.json({ error: 'Mesaj boş' }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'));
        } catch {} // istemci ayrıldıysa tur yine de tamamlanır ve kaydedilir
      };
      // Uzun araç kullanımlarında bağlantı kopmasın diye ara sinyal
      const ping = setInterval(() => send({ type: 'ping' }), 15000);
      try {
        for await (const ev of runTurn(Number(id), (text || '(ek gönderildi)').slice(0, 20000), files)) send(ev);
      } catch (e) {
        send({ type: 'error', error: e.message });
      } finally {
        clearInterval(ping);
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
