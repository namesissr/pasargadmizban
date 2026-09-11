import { z } from 'zod';
import { ok, parseBody, route } from '@/lib/api';
import { requireUser, assertSameOrigin } from '@/lib/auth';
import { markRead, unreadCount } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ ids: z.array(z.string()).optional() });

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireUser();

  let ids: string[] | undefined;
  try {
    ids = (await parseBody(req, schema)).ids;
  } catch {
    ids = undefined;
  }

  await markRead(user.id, ids);
  return ok({ unread: await unreadCount(user.id) });
});
