import 'server-only';
// The signed-in, still-active admin behind a server action (or null). Shared by the settings
// actions and the comments/reports moderation so every admin write re-checks the account on the
// server rather than trusting hidden UI.
import { getAdmin } from './admin-auth';
import { getSession } from './session';

export interface CurrentAdmin {
  id: string;
  email: string;
}

export async function currentAdmin(): Promise<CurrentAdmin | null> {
  const s = await getSession('admin');
  const admin = s ? await getAdmin(s.id) : null;
  return admin && admin.status === 'active' ? { id: admin.id, email: admin.email } : null;
}
