'use client';

import { useState } from 'react';
import { cx } from '../ui';

/** Copies `text` to the clipboard; the label flips to "copied" for two seconds. */
export function CopyButton({ text, label = 'نسخ', copiedLabel = 'تم النسخ', className }: { text: string; label?: string; copiedLabel?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked: the text is selectable */
        }
      }}
      className={cx('tap inline-flex items-center rounded-control-sm border border-border bg-bg px-3 text-sm font-medium text-text-2 hover:border-primary hover:text-primary', className)}
      aria-live="polite"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
