/**
 * `CalendarPost.date` is a bare day-of-month string, so several views used to
 * print a hardcoded "Oct" next to it. Format it against the current month
 * instead — one helper so the calendar, dashboard and analyzer agree.
 */
export function formatPostDay(day: string): string {
  const parsed = Number(day);
  if (!Number.isFinite(parsed)) return day;

  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), parsed);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
