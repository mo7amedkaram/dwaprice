import Image from 'next/image';
import { PillIcon } from '../icons';
import { cx } from '../ui';

/**
 * Product photo only when the image was verified (drug_cards.image_url is
 * already null otherwise); a quiet placeholder icon everywhere else.
 * `unoptimized`: the verified images live on many third-party hosts, and a
 * wildcard remotePatterns would open the image optimizer to anyone.
 * (next/image adds ~5.5 KB gzipped to drug pages; next/dynamic did not avoid it.)
 */
export function DrugImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return (
    <div className={cx('relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-figure md:size-24', className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes="96px" unoptimized className="object-contain p-1 dark:brightness-90" />
      ) : (
        <PillIcon size={36} className="text-primary opacity-60" />
      )}
    </div>
  );
}
