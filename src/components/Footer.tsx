import Link from 'next/link';
import { Container } from './ui';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { SITE, routes } from '@/lib/site';

const GROUPS = [
  {
    title: 'تصفح',
    links: [
      { href: routes.letters(), label: 'الأدوية من أ إلى ي' },
      { href: routes.ingredients(), label: 'المواد الفعالة' },
      { href: routes.companies(), label: 'الشركات' },
      { href: routes.categories(), label: 'التصنيفات' },
      { href: routes.atcIndex(), label: 'تصنيف ATC' },
      { href: routes.lastPrices(), label: 'أحدث الأسعار' },
      { href: routes.search(), label: 'البحث' },
    ],
  },
  {
    title: 'عن الموقع',
    links: [
      { href: routes.about(), label: 'من نحن' },
      { href: routes.guide(), label: 'دليل الاستخدام' },
      { href: '/api', label: 'API أسعار الأدوية للمطورين' },
      { href: routes.contact(), label: 'اتصل بنا' },
      { href: routes.privacy(), label: 'سياسة الخصوصية' },
      { href: routes.terms(), label: 'شروط الاستخدام' },
      { href: routes.disclaimer(), label: 'إخلاء المسؤولية الطبية' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <Container className="grid gap-8 py-10 md:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="type-small max-w-md text-text-2">{SITE.description}</p>
          <p className="type-small max-w-md rounded-control border border-border bg-bg p-3 text-text-2">
            المعلومات هنا للاسترشاد فقط ولا تغني عن استشارة الطبيب أو الصيدلي. الأسعار هي أسعار البيع المعلنة
            للجمهور وقد تختلف في بعض الصيدليات.
          </p>
          <ThemeToggle variant="group" className="mt-2" />
        </div>
        {GROUPS.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="mb-2 font-semibold text-ink">{group.title}</h2>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link prefetch={false} href={link.href} className="tap inline-flex items-center text-text-2 hover:text-primary">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <div className="border-t border-border">
        <Container className="type-small py-4 text-muted">
          © {new Date().getFullYear()} {SITE.name} — <span dir="ltr" lang="en">{SITE.domain}</span>
        </Container>
      </div>
    </footer>
  );
}
