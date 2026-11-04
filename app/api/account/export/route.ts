import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildExport } from '@/lib/gdpr';
import { loadExportRows } from '@/lib/gdpr-server';
export const dynamic = 'force-dynamic';
/** GDPR data export (req 9): the signed-in user's own data as a JSON download. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const rows = await loadExportRows(session.user.id);
  if (!rows) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new NextResponse(JSON.stringify(buildExport(rows), null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="she-cy-data.json"',
      'Cache-Control': 'no-store',
    },
  });
}
