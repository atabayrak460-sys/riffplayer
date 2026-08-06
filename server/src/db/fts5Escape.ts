/** Wraps `value` as a literal FTS5 MATCH phrase — doubling any embedded
 * double-quote (FTS5's own phrase-escaping rule) so the query can't break
 * out of the phrase or be reinterpreted as FTS5 query syntax (AND/OR/NOT,
 * `*`, `:`, `-`, ...). Mirrors likeEscape.ts's role for LIKE patterns. */
export function toFts5Phrase(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
