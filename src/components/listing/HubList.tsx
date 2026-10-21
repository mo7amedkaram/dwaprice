import Link from 'next/link';
import { DrugList } from './DrugList';
import { FilterForm } from './FilterForm';
import { EmptyState } from '../EmptyState';
import { Pagination } from '../Pagination';
import { buttonClass } from '../ui';
import { filterQuery, formatCount } from '@/lib/listing/logic';
import type { HubDrug, ListFilters } from '@/lib/data/types';

/** Filter form, result count, drug rows and pagination of a hub (company, category, ATC). */
export function HubList({
  path,
  filters,
  filtered,
  forms,
  rows,
  total,
  page,
  pages,
  pageSize,
  label,
  showCompany = true,
}: {
  path: string;
  filters: ListFilters;
  filtered: boolean;
  forms: Array<{ form_class: string | null; n: number }>;
  rows: HubDrug[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  label: string;
  showCompany?: boolean;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <section aria-labelledby="list-title">
      <h2 id="list-title" className="sr-only">
        {label}
      </h2>
      <FilterForm action={path} filters={filters} forms={forms} />
      <p className="type-small mt-4 text-text-2" aria-live="polite">
        {total > 0 ? (
          <>
            عرض <span className="price">{formatCount(from)}</span>–<span className="price">{formatCount(to)}</span> من{' '}
            <span className="price">{formatCount(total)}</span> دواء{filtered && ' (بعد التصفية)'}
          </>
        ) : null}
      </p>
      {rows.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="لا توجد أدوية مطابقة"
          description="جرّب شكلًا دوائيًا آخر أو نطاق سعر أوسع."
          action={
            <Link prefetch={false} href={path} className={buttonClass('secondary')}>
              عرض كل الأدوية
            </Link>
          }
        />
      ) : (
        <DrugList rows={rows} label={label} className="mt-3" showCompany={showCompany} />
      )}
      <Pagination className="mt-8" current={page} total={pages} basePath={path} params={Object.fromEntries(filterQuery(filters))} />
    </section>
  );
}
