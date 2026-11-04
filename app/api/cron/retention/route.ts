import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { runRetention } from '@/lib/gdpr-server';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
/** Vercel Cron (GET, daily). Returns counts only. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await runRetention(new Date()));
}
