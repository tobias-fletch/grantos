import {pool} from '@/lib/db/pool';
import {handleStagingOwnerSetup} from '@/lib/auth/staging-owner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleStagingOwnerSetup(pool, request);
}
