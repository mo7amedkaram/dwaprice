import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiNav } from '@/components/api/ApiNav';
import { LoginForm } from '@/components/api/Forms';
import { Container } from '@/components/ui';
import { requestDevLoginAction } from '@/lib/api/dashboard-actions';
import { getLang } from '@/lib/api/lang';
import { getSession } from '@/lib/api/session';
import { buildMetadata } from '@/lib/seo/metadata';

export async function generateMetadata() {
  const ar = (await getLang()) === 'ar';
  return buildMetadata({
    kind: 'internal',
    path: '/developer/login',
    title: ar ? 'الدخول إلى لوحة المطورين' : 'Developer dashboard login',
    absoluteTitle: !ar,
    description: ar ? 'ادخل ببريدك الإلكتروني المسجل لتستلم رابط دخول.' : 'Enter your registered e-mail to receive a login link.',
  });
}

export default async function DevLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession('client')) redirect('/developer');
  const [{ error }, lang] = await Promise.all([searchParams, getLang()]);
  const ar = lang === 'ar';
  return (
    <>
      <ApiNav current="/developer" lang={lang} />
      <Container className="py-10 md:py-16">
        <div className="mx-auto max-w-md rounded-card border border-border bg-bg p-6">
          <h1 className="type-h1 text-ink">{ar ? 'لوحة المطورين' : 'Developer dashboard'}</h1>
          <p className="mt-2 text-text-2">
            {ar ? 'ادخل ببريدك الإلكتروني المسجل في حسابك وسنرسل لك رابط دخول بلا كلمة مرور.' : 'Enter the e-mail registered on your account and we send you a passwordless login link.'}
          </p>
          {error && (
            <p role="alert" className="mt-4 rounded-control bg-up-bg px-3 py-2 text-up">
              {ar ? 'رابط الدخول غير صالح أو انتهت صلاحيته (15 دقيقة، يُستخدم مرة واحدة). اطلب رابطًا جديدًا.' : 'The login link is invalid or expired (15 minutes, single use). Request a new one.'}
            </p>
          )}
          <div className="mt-5">
            <LoginForm action={requestDevLoginAction} lang={lang} />
          </div>
          <p className="type-small mt-5 text-text-2">
            {ar ? 'ليس لديك حساب؟ ' : 'No account yet? '}
            <Link prefetch={false} href={ar ? '/api/request-access' : '/api/en/request-access'} className="text-primary underline">{ar ? 'اطلب الوصول' : 'Request access'}</Link>
          </p>
        </div>
      </Container>
    </>
  );
}
