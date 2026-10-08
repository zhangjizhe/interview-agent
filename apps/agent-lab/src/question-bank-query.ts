/** Keep optional filters absent when the user has not selected a value. */
export function questionBankQuery(position: string, limit: number, query?: string): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (position.trim()) params.set('position', position.trim());
  if (query !== undefined) params.set('q', query.trim());
  return params.toString();
}
