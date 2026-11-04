/** Session-bound admin gate for pages (task 7.1). Signed-out -> sign-in; non-admin -> 404 (route not revealed). */
import { notFound, redirect } from 'next/navigation';
import { auth } from './auth';
import { db } from './db';
export async function requireAdmin(locale: string, path: string): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/account?callbackUrl=${encodeURIComponent(path)}`);
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true } });
  if (!user || user.role !== 'ADMIN') notFound();
  return { userId: user.id };
}
