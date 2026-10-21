import Link from 'next/link';
import { SITE } from '@/lib/site';

/** Word mark + pill symbol. The full site name is the accessible name. */
export function Logo() {
  return (
    <Link href="/" aria-label={SITE.name} className="tap inline-flex shrink-0 items-center gap-2 rounded-control">
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="9" className="fill-primary" />
        <g transform="rotate(-45 16 16)">
          <rect x="7" y="12" width="18" height="8" rx="4" className="fill-bg" />
          <rect x="16" y="12" width="9" height="8" rx="4" className="fill-primary-tint" />
          <rect x="16" y="12" width="4" height="8" className="fill-primary-tint" />
        </g>
      </svg>
      <span className="text-base leading-none font-semibold whitespace-nowrap text-ink sm:text-lg">
        دليل الأدوية <span className="text-primary">المصري</span>
      </span>
    </Link>
  );
}
