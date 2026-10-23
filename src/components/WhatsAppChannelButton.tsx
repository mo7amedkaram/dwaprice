'use client';

// "Follow the latest price updates on WhatsApp": a WhatsApp-styled link to the site's WhatsApp
// Channel (an admin setting; nothing renders while the URL is empty). Opens in a new tab and
// records a GA4 event with the placement only — no personal data, no URL.
import { WhatsAppIcon } from './icons';
import { cx } from './ui';
import { track } from '@/lib/analytics';

export type ChannelPlacement = 'home' | 'header' | 'footer' | 'last_prices';

export function WhatsAppChannelButton({
  url,
  placement,
  size = 'md',
  className,
}: {
  url: string;
  placement: ChannelPlacement;
  /** md: the home/last-prices button · sm: compact, under the header search and in the footer. */
  size?: 'md' | 'sm';
  className?: string;
}) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track({ name: 'whatsapp_channel_click', params: { placement } })}
      className={cx(
        'tap inline-flex max-w-full items-center gap-2 rounded-control border border-[#25D366]/40 bg-[#25D366]/10 font-medium text-ink transition-colors',
        'hover:border-[#25D366] hover:bg-[#25D366]/20 focus-visible:outline-[#128C7E]',
        size === 'md' ? 'min-h-11 px-4 py-2' : 'min-h-9 px-3 py-1.5 text-sm',
        className,
      )}
    >
      <WhatsAppIcon size={size === 'md' ? 20 : 16} className="shrink-0 text-[#128C7E] dark:text-[#25D366]" />
      <span className="truncate">تابع آخر تحديثات الأسعار على واتساب</span>
    </a>
  );
}
