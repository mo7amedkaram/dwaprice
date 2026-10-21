import { CopyButton } from './CopyButton';
import { cx } from '../ui';

/** Code or JSON, always LTR, with a copy button. */
export function CodeBlock({ code, title, className, maxHeight = false, lang = 'ar' }: { code: string; title?: string; className?: string; maxHeight?: boolean; lang?: 'ar' | 'en' }) {
  return (
    <div className={cx('overflow-hidden rounded-card border border-border bg-surface', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
        <span className="type-small font-medium text-text-2">{title}</span>
        <CopyButton text={code} label={lang === 'en' ? 'Copy' : 'نسخ'} copiedLabel={lang === 'en' ? 'Copied' : 'تم النسخ'} />
      </div>
      <pre dir="ltr" className={cx('overflow-x-auto p-3 text-start font-mono text-sm leading-relaxed text-ink', maxHeight && 'max-h-[28rem] overflow-y-auto')}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Inline code (field names, values). */
export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code dir="ltr" className="rounded-control-sm bg-surface px-1.5 py-0.5 font-mono text-[0.9em] [overflow-wrap:anywhere] text-ink">
      {children}
    </code>
  );
}
