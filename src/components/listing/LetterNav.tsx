import Link from 'next/link';
import { cx } from '../ui';
import { routes } from '@/lib/site';

/** A-Z of drug names: one link per letter that has drugs; the current one is marked. */
export function LetterNav({ letters, current, className }: { letters: Array<{ letter: string; n: number }>; current?: string; className?: string }) {
  return (
    <nav aria-label="الأدوية حسب الحرف" className={className}>
      <ul className="flex flex-wrap gap-2">
        {letters.map(({ letter, n }) => (
          <li key={letter}>
            {letter === current ? (
              <span aria-current="page" className="tap inline-flex min-w-11 items-center justify-center rounded-control bg-primary px-2 text-lg font-semibold text-on-primary">
                {letter}
              </span>
            ) : (
              <Link
                prefetch={false}
                href={routes.letter(letter)}
                aria-label={`حرف ${letter}، ${n} دواء`}
                className={cx(
                  'tap inline-flex min-w-11 items-center justify-center rounded-control border border-border bg-bg px-2 text-lg font-semibold text-ink',
                  'transition-colors hover:border-primary hover:bg-primary-tint hover:text-primary',
                )}
              >
                {letter}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
