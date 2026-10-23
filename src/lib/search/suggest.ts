// The suggestion module SearchBox imports lazily on the first focus/hover (never on the first
// page load): the shared client that owns the worker and the highlight helpers. Importing this
// pulls in engine-shared + normalize + wildcard + client; the heavy SearchEngine class stays in the worker.
export { getSearchClient } from './client';
export { highlightSegments, matchedWords } from './engine-shared';
export { wildcardProblem } from './wildcard';
export type { SearchClient } from './client';
