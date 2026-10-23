import Link from 'next/link';
import { cx } from '../ui';
import { letterLabel } from '@/lib/listing/logic';
import { routes } from '@/lib/site';

/**
 * Drugs A-Z: one button per English letter (A–Z) plus a "0-9" bucket, the current one marked.
 * The row is left-to-right (the letters are Latin) while the rest of the page stays RTL.
 */
export function LetterNav({ letters, current, className }: { letters: Array<{ letter: string; n: number }>; current?: string; className?: string }) {
  return (
    <nav aria-label="الأدوية حسب الحرف" className={className}>
      <ul dir="ltr" className="flex flex-wrap gap-2">
        {letters.map(({ letter, n }) => {
          const label = letterLabel(letter);
          const aria = letter === '0-9' ? `أدوية تبدأ برقم، ${n} دواء` : `حرف ${label}، ${n} دواء`;
          return (
            <li key={letter}>
              {letter === current ? (
                <span aria-current="page" className="tap inline-flex min-w-11 items-center justify-center rounded-control bg-primary px-2 text-lg font-semibold text-on-primary">
                  {label}
                </span>
              ) : (
                <Link
                  prefetch={false}
                  href={routes.letter(letter)}
                  aria-label={aria}
                  className={cx(
                    'tap inline-flex min-w-11 items-center justify-center rounded-control border border-border bg-bg px-2 text-lg font-semibold text-ink',
                    'transition-colors hover:border-primary hover:bg-primary-tint hover:text-primary',
                  )}
                >
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
