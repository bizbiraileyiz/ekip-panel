import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Şimdilik tek ayar: tüm projelerde ortak "Murat hakkında" metni
export const GET = withAuth(async () => NextResponse.json({ profile: await getSetting('murat_profile') }));

export const PUT = withAuth(async (req) => {
  const { profile } = await req.json().catch(() => ({}));
  await setSetting('murat_profile', String(profile ?? '').slice(0, 10000));
  return NextResponse.json({ ok: true });
});
