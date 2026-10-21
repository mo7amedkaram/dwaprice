import Link from 'next/link';
import { Badge, Ltr, Tag } from '../ui';
import { BoxIcon, InfoIcon } from '../icons';
import { DrugImage } from './DrugImage';
import { cleanCompanyName } from '@/lib/drug/logic';
import { routes } from '@/lib/site';
import { tradeName } from '@/lib/format';
import type { DrugPage } from '@/lib/data/types';

const RX: Record<string, { label: string; tone: 'rx' | 'primary' }> = {
  PRESCRIPTION: { label: 'بروشتة طبية', tone: 'rx' },
  OTC: { label: 'بدون روشتة', tone: 'primary' },
};

const ROLE: Record<string, string> = { manufacturer: 'تصنيع', marketer: 'تسويق', partner: 'شريك', company: '' };

/** Route in Arabic from the route class (recognition_route_class); the English source text otherwise. */
const ROUTE_AR: Record<string, string> = {
  oral: 'عن طريق الفم',
  topical: 'موضعي',
  injection: 'حقن',
  ophthalmic: 'للعين',
  otic: 'للأذن',
  nasal: 'للأنف',
  rectal: 'شرجي',
  vaginal: 'مهبلي',
  inhalation: 'استنشاق',
};

/** H1, English trade name and chips (ingredients, companies, form, route, Rx/OTC). */
export function DrugHero({ page, h1, imageAlt }: { page: DrugPage; h1: string; imageAlt: string }) {
  const rx = page.prescription_status ? RX[page.prescription_status] : undefined;
  const ingredients = (page.ingredients ?? []).filter((i) => i.name_en || i.name_ar);
  const companies = (page.company_links ?? [])
    .map((c) => ({ ...c, name: cleanCompanyName(c.name) }))
    .filter((c): c is typeof c & { name: string } => !!c.name);

  return (
    <div>
      <div className="flex items-start gap-4">
        <DrugImage src={page.image_url} alt={imageAlt} />
        <div className="min-w-0 flex-1">
          <h1 className="type-h1 text-ink">{h1}</h1>
          {page.name_ar && (
            <Ltr block className="mt-1 text-text-2">
              {tradeName(page.name_en)}
            </Ltr>
          )}
        </div>
      </div>
      <div>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="معلومات الدواء">
          {ingredients.map((i) => (
            <li key={`${i.position}-${i.name_en}`}>
              {i.slug ? (
                <Tag href={routes.ingredient(i.slug)}>
                  <span className="sr-only">المادة الفعالة: </span>
                  {i.name_ar ?? <Ltr>{i.name_en}</Ltr>}
                  {i.name_ar && i.name_en && (
                    <>
                      {' '}
                      <Ltr className="text-text-2">{i.name_en.replace(/\s*\(.*\)/, '')}</Ltr>
                    </>
                  )}
                </Tag>
              ) : (
                <Badge tone="neutral">{i.name_ar ?? <Ltr>{i.name_en}</Ltr>}</Badge>
              )}
            </li>
          ))}
          {companies.map((c) => (
            <li key={`${c.role}-${c.name}`}>
              {c.slug ? (
                <Tag href={routes.company(c.slug)}>
                  {ROLE[c.role] && <span className="me-1 text-text-2">{ROLE[c.role]}:</span>}
                  <Ltr>{c.name}</Ltr>
                </Tag>
              ) : (
                <Badge tone="neutral">
                  <Ltr>{c.name}</Ltr>
                </Badge>
              )}
            </li>
          ))}
          {page.dosage_form_ar && (
            <li>
              <Badge tone="neutral" icon={<BoxIcon size={14} />} className="min-h-11 rounded-control px-3">
                {page.dosage_form_ar}
              </Badge>
            </li>
          )}
          {page.route && (
            <li>
              <Badge tone="neutral" className="min-h-11 rounded-control px-3">
                {(page.route_class && ROUTE_AR[page.route_class]) ?? <Ltr>{page.route}</Ltr>}
              </Badge>
            </li>
          )}
          {rx && (
            <li>
              <Badge tone={rx.tone} icon={<InfoIcon size={14} />} className="min-h-11 rounded-control px-3">
                {rx.label}
              </Badge>
            </li>
          )}
        </ul>
        {page.category_slug && page.category_name_ar && (
          <p className="type-small mt-2 text-text-2">
            الفئة:{' '}
            <Link prefetch={false} href={routes.category(page.category_slug)} className="text-primary hover:underline">
              {page.category_name_ar}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
