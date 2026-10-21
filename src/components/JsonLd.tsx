/** Renders one or more JSON-LD objects. `<` is escaped so content cannot close the script. */
export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown> | null> | null }) {
  const items = (Array.isArray(data) ? data : [data]).filter((d): d is Record<string, unknown> => d !== null);
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item).replace(/</g, '\\u003c') }}
        />
      ))}
    </>
  );
}
