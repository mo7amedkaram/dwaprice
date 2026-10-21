import { redirect } from 'next/navigation';
import { Container, buttonClass } from '@/components/ui';
import { completeDevLoginAction } from '@/lib/api/dashboard-actions';
import { getLang } from '@/lib/api/lang';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({ kind: 'internal', path: '/developer/login/verify', title: 'تأكيد الدخول', description: 'تأكيد رابط الدخول إلى لوحة المطورين.' });
export const dynamic = 'force-dynamic';

// The link from the e-mail lands here; the token is consumed only when the button is pressed
// (mail scanners pre-fetch links, which must not burn the one-time token).
export default async function DevVerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const [{ token }, lang] = await Promise.all([searchParams, getLang()]);
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) redirect('/developer/login?error=token');
  const ar = lang === 'ar';
  return (
    <Container className="py-10 md:py-16">
      <form action={completeDevLoginAction} className="mx-auto max-w-md rounded-card border border-border bg-bg p-6 text-center">
        <input type="hidden" name="token" value={token} />
        <h1 className="type-h1 text-ink">{ar ? 'تأكيد الدخول' : 'Confirm login'}</h1>
        <p className="mt-2 text-text-2">
          {ar ? 'اضغط الزر لإتمام الدخول إلى لوحة المطورين. الرابط صالح 15 دقيقة ويُستخدم مرة واحدة.' : 'Press the button to finish logging in to the developer dashboard. The link is valid for 15 minutes and works once.'}
        </p>
        <button type="submit" className={buttonClass('primary', 'mt-5 w-full')}>{ar ? 'تأكيد الدخول' : 'Confirm login'}</button>
      </form>
    </Container>
  );
}
