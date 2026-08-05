/** Escapes SQL LIKE wildcards (`%`, `_`) and the escape character itself
 * (`\`) in `value`, so it can be substituted into a `LIKE ? ESCAPE '\'`
 * pattern without its literal characters being treated as wildcards —
 * e.g. searching for a track named "A_B" shouldn't match "AxB". */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
