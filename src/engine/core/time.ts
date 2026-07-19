/**
 * Simulation time.
 *
 * Time advances in monthly ticks. A SimDate is an absolute month count from
 * year 0: `date = year * 12 + (month0)`, where month0 is 0..11.
 * Display months are 1..12. Worlds typically begin around year 1.
 */

export type SimDate = number;

export const MONTHS_PER_YEAR = 12;

export function makeDate(year: number, month1: number): SimDate {
  return year * 12 + (month1 - 1);
}

export function yearOf(d: SimDate): number {
  return Math.floor(d / 12);
}

/** Display month 1..12. */
export function monthOf(d: SimDate): number {
  return (((d % 12) + 12) % 12) + 1;
}

/** Whole years elapsed between two dates (age computation). */
export function yearsBetween(from: SimDate, to: SimDate): number {
  return Math.floor((to - from) / 12);
}

export function monthsBetween(from: SimDate, to: SimDate): number {
  return to - from;
}

export function addYears(d: SimDate, years: number): SimDate {
  return d + years * 12;
}

export function addMonths(d: SimDate, months: number): SimDate {
  return d + months;
}

/** Season index 0..3 (0 spring, 1 summer, 2 autumn, 3 winter), month-based. */
export function seasonOf(d: SimDate): number {
  const m = monthOf(d); // 1..12
  if (m >= 3 && m <= 5) return 0;
  if (m >= 6 && m <= 8) return 1;
  if (m >= 9 && m <= 11) return 2;
  return 3;
}

export const SEASON_NAMES = ["spring", "summer", "autumn", "winter"] as const;

/**
 * Format a date for narrative, e.g. "the 4th month of the year 213".
 * Cultures may layer their own month names on top of this in the UI.
 */
export function formatDate(d: SimDate): string {
  return `${monthOf(d)}/${yearOf(d)}`;
}
