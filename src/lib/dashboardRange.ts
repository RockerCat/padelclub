export type DashboardRangeKey =
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_semester"
  | "custom";

export const DASHBOARD_RANGE_PRESETS: { value: DashboardRangeKey; label: string }[] = [
  { value: "this_week",     label: "Esta semana" },
  { value: "last_week",     label: "Semana pasada" },
  { value: "this_month",    label: "Este mes" },
  { value: "last_month",    label: "Mes pasado" },
  { value: "this_semester", label: "Este semestre" },
];

export interface DateBounds {
  start: Date;
  end: Date;
  startStr: string;
  endStr: string;
}

export interface DashboardRange {
  key: DashboardRangeKey;
  label: string;            // "Esta semana" — shown as the active-range badge across sections
  comparisonLabel: string;  // "semana anterior" — used in "Vs {comparisonLabel}"
  dateRangeLabel: string;   // "01 Jun 2026 - 18 Jun 2026" — exact dates of the active range
  hasComparison: boolean;   // false for "custom" — MVP doesn't compare custom ranges
  current: DateBounds;
  previous: DateBounds;     // immediately preceding period of the same length
}

const MONTH_ES_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_ES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function formatRangeLabel(start: Date, end: Date): string {
  return `${formatDateLabel(start)} - ${formatDateLabel(end)}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function getWeekMonday(d: Date): Date {
  const r = startOfDay(d);
  const day = r.getDay(); // 0=Dom..6=Sáb
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function semesterStart(year: number, half: 0 | 1): Date {
  return half === 0 ? new Date(year, 0, 1) : new Date(year, 6, 1);
}

function semesterEnd(year: number, half: 0 | 1): Date {
  return half === 0 ? new Date(year, 5, 30) : new Date(year, 11, 31);
}

function bounds(start: Date, end: Date): DateBounds {
  return { start, end, startStr: toDateStr(start), endStr: toDateStr(end) };
}

// Strict "YYYY-MM-DD" parser — returns null for anything malformed or invalid.
function parseDateStr(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

// Resolves the selected dashboard range (and its comparison period) for a given
// `?range=` query param (+ `from`/`to` when range=custom). Falls back to
// "this_week" when missing or invalid.
export function resolveDashboardRange(
  rangeParam: string | undefined,
  today: Date,
  customFrom?: string,
  customTo?: string
): DashboardRange {
  const day0 = startOfDay(today);

  if (rangeParam === "custom") {
    const from = customFrom ? parseDateStr(customFrom) : null;
    const to = customTo ? parseDateStr(customTo) : null;
    if (from && to && to >= from) {
      const lengthDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
      const prevEnd = addDays(from, -1);
      const prevStart = addDays(prevEnd, -(lengthDays - 1));
      return {
        key: "custom",
        label: "Rango personalizado",
        comparisonLabel: "período anterior",
        dateRangeLabel: formatRangeLabel(from, to),
        hasComparison: false,
        current: bounds(from, to),
        previous: bounds(prevStart, prevEnd),
      };
    }
    // Incomplete or invalid custom dates — fall back to the default range.
    return resolveDashboardRange(undefined, today);
  }

  const key: DashboardRangeKey = DASHBOARD_RANGE_PRESETS.some((o) => o.value === rangeParam)
    ? (rangeParam as DashboardRangeKey)
    : "this_week";

  switch (key) {
    case "last_week": {
      const monday = addDays(getWeekMonday(day0), -7);
      const sunday = addDays(monday, 6);
      const prevMonday = addDays(monday, -7);
      const prevSunday = addDays(prevMonday, 6);
      return {
        key,
        label: "Semana pasada",
        comparisonLabel: "semana anterior",
        dateRangeLabel: formatRangeLabel(monday, sunday),
        hasComparison: true,
        current: bounds(monday, sunday),
        previous: bounds(prevMonday, prevSunday),
      };
    }
    case "this_month": {
      const start = startOfMonth(day0);
      const end = endOfMonth(day0);
      const prevAnchor = new Date(day0.getFullYear(), day0.getMonth() - 1, 1);
      return {
        key,
        label: "Este mes",
        comparisonLabel: "mes anterior",
        dateRangeLabel: formatRangeLabel(start, end),
        hasComparison: true,
        current: bounds(start, end),
        previous: bounds(startOfMonth(prevAnchor), endOfMonth(prevAnchor)),
      };
    }
    case "last_month": {
      const anchor = new Date(day0.getFullYear(), day0.getMonth() - 1, 1);
      const prevAnchor = new Date(day0.getFullYear(), day0.getMonth() - 2, 1);
      const start = startOfMonth(anchor);
      const end = endOfMonth(anchor);
      return {
        key,
        label: "Mes pasado",
        comparisonLabel: "mes anterior",
        dateRangeLabel: formatRangeLabel(start, end),
        hasComparison: true,
        current: bounds(start, end),
        previous: bounds(startOfMonth(prevAnchor), endOfMonth(prevAnchor)),
      };
    }
    case "this_semester": {
      const year = day0.getFullYear();
      const half: 0 | 1 = day0.getMonth() < 6 ? 0 : 1;
      const prevHalf: 0 | 1 = half === 0 ? 1 : 0;
      const prevYear = half === 0 ? year - 1 : year;
      const start = semesterStart(year, half);
      const end = semesterEnd(year, half);
      return {
        key,
        label: "Este semestre",
        comparisonLabel: "semestre anterior",
        dateRangeLabel: formatRangeLabel(start, end),
        hasComparison: true,
        current: bounds(start, end),
        previous: bounds(semesterStart(prevYear, prevHalf), semesterEnd(prevYear, prevHalf)),
      };
    }
    case "this_week":
    default: {
      const monday = getWeekMonday(day0);
      const sunday = addDays(monday, 6);
      const prevMonday = addDays(monday, -7);
      const prevSunday = addDays(prevMonday, 6);
      return {
        key: "this_week",
        label: "Esta semana",
        comparisonLabel: "semana anterior",
        dateRangeLabel: formatRangeLabel(monday, sunday),
        hasComparison: true,
        current: bounds(monday, sunday),
        previous: bounds(prevMonday, prevSunday),
      };
    }
  }
}

export interface TrendBucket {
  label: string;
  start: Date;
  end: Date;
  startStr: string;
  endStr: string;
}

type TrendGranularity = "daily" | "weekly" | "monthly";

const WEEKDAY_ES_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function resolveTrendGranularity(range: DashboardRange): TrendGranularity {
  switch (range.key) {
    case "this_week":
    case "last_week":
      return "daily";
    case "this_month":
    case "last_month":
      return "weekly";
    case "this_semester":
      return "monthly";
    case "custom":
    default: {
      const days =
        Math.round((range.current.end.getTime() - range.current.start.getTime()) / 86_400_000) + 1;
      if (days <= 14) return "daily";
      if (days <= 92) return "weekly";
      return "monthly";
    }
  }
}

// Splits the active range into chart buckets for the "Tendencia de Ocupación"
// trend line — granularity follows the selected range (daily for week ranges,
// weekly for month ranges, monthly for the semester range).
export function getTrendBuckets(range: DashboardRange): TrendBucket[] {
  const granularity = resolveTrendGranularity(range);
  const { start, end } = range.current;
  const buckets: TrendBucket[] = [];

  if (granularity === "daily") {
    let cur = new Date(start);
    while (cur <= end) {
      buckets.push({ label: WEEKDAY_ES_SHORT[cur.getDay()], start: new Date(cur), end: new Date(cur), startStr: toDateStr(cur), endStr: toDateStr(cur) });
      cur = addDays(cur, 1);
    }
    return buckets;
  }

  if (granularity === "weekly") {
    let cur = new Date(start);
    while (cur <= end) {
      const bucketEnd = addDays(cur, 6) > end ? new Date(end) : addDays(cur, 6);
      buckets.push({
        label: `${String(cur.getDate()).padStart(2, "0")}-${String(bucketEnd.getDate()).padStart(2, "0")}`,
        start: new Date(cur),
        end: bucketEnd,
        startStr: toDateStr(cur),
        endStr: toDateStr(bucketEnd),
      });
      cur = addDays(bucketEnd, 1);
    }
    return buckets;
  }

  // monthly
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const monthEnd = endOfMonth(cur);
    const clippedEnd = monthEnd > end ? new Date(end) : monthEnd;
    buckets.push({
      label: MONTH_ES_SHORT[cur.getMonth()],
      start: new Date(cur),
      end: clippedEnd,
      startStr: toDateStr(cur),
      endStr: toDateStr(clippedEnd),
    });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return buckets;
}
