import { NextResponse } from 'next/server';
import { ask, models, textTurns } from '@/lib/ai';
import { todayUsage } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 150;

// Bağlantı testi: iki API'yi ayrı ayrı, kısa bir mesajla dener.
export const POST = withAuth(async () => {
  const turns = textTurns('Bağlantı testi. Araç kullanma, sadece "tamam" yaz.');
  const check = async (who) => {
    try {
      const reply = await ask(who, 'Kısa cevap ver.', turns, { maxTokens: 1000 });
      return { ok: true, model: models()[who], reply: reply.slice(0, 300) };
    } catch (e) {
      return { ok: false, model: models()[who], error: e.message };
    }
  };
  const [claude, chatgpt] = await Promise.all([check('claude'), check('chatgpt')]);
  return NextResponse.json({
    claude,
    chatgpt,
    usage: { ...(await todayUsage()), limit: Number(process.env.DAILY_CALL_LIMIT || 0) || 'sınırsız' },
  });
});
