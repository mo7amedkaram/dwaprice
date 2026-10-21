import type { ReactNode } from 'react';
import { Code } from './CodeBlock';

// The small Markdown subset used in openapi.yaml descriptions: paragraphs, "* " bullets,
// `code`, **bold**, [text](url). Server component, no dependency.
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith('`')) out.push(<Code key={key}>{tok.slice(1, -1)}</Code>);
    else if (tok.startsWith('**')) out.push(<strong key={key} className="text-ink">{tok.slice(2, -2)}</strong>);
    else {
      const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      out.push(<a key={key} href={lm[2]} className="text-primary underline">{lm[1]}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*[*-]\s+/.test(l) || /^\s{2,}\S/.test(l))) {
          const items: string[] = [];
          for (const l of lines) {
            if (/^\s*[*-]\s+/.test(l)) items.push(l.replace(/^\s*[*-]\s+/, ''));
            else items[items.length - 1] += ' ' + l.trim();
          }
          return (
            <ul key={bi} className="mb-3 list-disc space-y-1 ps-5 text-text-2">
              {items.map((it, ii) => <li key={ii}>{inline(it, `${bi}-${ii}`)}</li>)}
            </ul>
          );
        }
        return <p key={bi} className="mb-3 text-text-2">{inline(lines.join(' '), String(bi))}</p>;
      })}
    </div>
  );
}
