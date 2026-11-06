import {
  addDays,
  addMonths,
  addWeeks,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { Goal, Round, Tag } from './types'

export type Span = 'day' | 'week' | 'month'

/** Weeks start on Sunday everywhere in the focus app. */
const WEEK = { weekStartsOn: 0 } as const

/** A half-open range: `start` inclusive, `end` exclusive. */
export interface Period {
  start: Date
  end: Date
}

export function periodOf(span: Span, anchor: Date): Period {
  if (span === 'day') {
    const start = startOfDay(anchor)
    return { start, end: addDays(start, 1) }
  }
  if (span === 'week') {
    const start = startOfWeek(anchor, WEEK)
    return { start, end: addWeeks(start, 1) }
  }
  const start = startOfMonth(anchor)
  return { start, end: addMonths(start, 1) }
}

export function shift(span: Span, anchor: Date, by: number): Date {
  return span === 'day' ? addDays(anchor, by) : span === 'week' ? addWeeks(anchor, by) : addMonths(anchor, by)
}

export function periodLabel(span: Span, anchor: Date): string {
  const { start, end } = periodOf(span, anchor)
  if (span === 'day') return format(start, 'EEEE, d MMMM')
  if (span === 'month') return format(start, 'MMMM yyyy')
  return `${format(start, 'd MMM')} – ${format(addDays(end, -1), 'd MMM')}`
}

const startOf = (r: Round) => parseISO(r.startedAt)

export function inPeriod(rounds: Round[], { start, end }: Period): Round[] {
  return rounds.filter((r) => {
    const t = startOf(r).getTime()
    return t >= start.getTime() && t < end.getTime()
  })
}

/** Rounds on one calendar day, earliest first. */
export function roundsOn(rounds: Round[], day: Date): Round[] {
  return inPeriod(rounds, periodOf('day', day)).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/** Every day a calendar view shows: whole weeks, Sunday to Saturday. */
export function calendarDays(span: Span, anchor: Date): Date[] {
  const { start, end } = periodOf(span, anchor)
  if (span === 'day') return [start]
  const first = startOfWeek(start, WEEK)
  const days: Date[] = []
  for (let d = first; d < end || d.getDay() !== 0; d = addDays(d, 1)) days.push(d)
  return days
}

/** Goals OR'd together, subjects OR'd together, the two AND'd — as on tasks. */
export interface RoundFilter {
  goalIds: string[]
  tagIds: string[]
}

export const NO_ROUND_FILTER: RoundFilter = { goalIds: [], tagIds: [] }

export function matchesRound(r: Round, f: RoundFilter): boolean {
  const goalOk = f.goalIds.length === 0 || (r.goalId !== null && f.goalIds.includes(r.goalId))
  const tagOk = f.tagIds.length === 0 || (r.tagId !== null && f.tagIds.includes(r.tagId))
  return goalOk && tagOk
}

const minutesOf = (rounds: Round[]) => rounds.reduce((sum, r) => sum + r.minutes, 0)

export interface Bar extends Period {
  label: string
  rounds: number
  minutes: number
}

/**
 * The performance chart: one bar per day of a week, or one per week of a
 * month. A week straddling the month's edge is clipped to it, so a month's
 * bars always add up to that month and nothing is counted twice.
 */
export function chartBars(rounds: Round[], span: 'week' | 'month', anchor: Date): Bar[] {
  const { start, end } = periodOf(span, anchor)
  const bar = (s: Date, e: Date, label: string): Bar => {
    const inside = inPeriod(rounds, { start: s, end: e })
    return { start: s, end: e, label, rounds: inside.length, minutes: minutesOf(inside) }
  }

  if (span === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i)
      return bar(d, addDays(d, 1), format(d, 'EEE'))
    })
  }

  const bars: Bar[] = []
  for (let s = startOfWeek(start, WEEK); s < end; s = addWeeks(s, 1)) {
    const from = s < start ? start : s
    const to = addWeeks(s, 1) > end ? end : addWeeks(s, 1)
    const last = addDays(to, -1)
    bars.push(bar(from, to, from.getDate() === last.getDate() ? format(from, 'd') : `${format(from, 'd')}–${format(last, 'd')}`))
  }
  return bars
}

/* ----------------------------------------------------------------- trends --- */

/**
 * The conclusions panel, in a shape meant to outlive the screen that draws it.
 *
 * Plain JSON with ISO dates and a version, so `JSON.stringify(report)` is the
 * exact payload a coaching LLM will be handed. Derived from the rounds on
 * demand rather than stored: a round added retroactively would otherwise leave
 * a stored trend quietly wrong.
 */
export interface TrendItem {
  axis: 'total' | 'goal' | 'subject'
  /** Goal or tag id; null for the total. */
  id: string | null
  name: string
  hours: number
  previousHours: number
  /** Whole percent. Null when there was nothing to compare against. */
  changePct: number | null
  /** The sentence the panel shows, so a model reads what the user read. */
  summary: string
}

export interface TrendReport {
  version: 1
  span: 'week' | 'month'
  period: { start: string; end: string }
  /** Cut short to match when `toDate` — see buildTrends. */
  previous: { start: string; end: string }
  /** True while the period is still running: both sides are measured to the same point. */
  toDate: boolean
  /** How the comparison reads in a sentence: "by this point last week". */
  previousLabel: string
  rounds: number
  previousRounds: number
  items: TrendItem[]
}

const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10
const fmtHours = (h: number) => (h === 0 ? 'no time' : `${h} h`)

export function changePct(now: number, before: number): number | null {
  if (before === 0) return null
  return Math.round(((now - before) / before) * 100)
}

function sentence(subject: string, h: number, prev: number, pct: number | null, cur: string, last: string): string {
  const head = subject
    ? `You put ${fmtHours(h)} into ${subject} ${cur}`
    : h === 0
      ? `You logged no focus time ${cur}`
      : `In total you focused for ${fmtHours(h)} ${cur}`
  if (pct === null) return h === 0 ? `${head}.` : `${head}, up from nothing ${last}.`
  const tail =
    pct === 0 ? 'no change' : `${pct > 0 ? 'an increase' : 'a decrease'} of ${Math.abs(pct)}%`
  return `${head}, compared to ${fmtHours(prev)} ${last} — ${tail}.`
}

export function buildTrends(
  rounds: Round[],
  span: 'week' | 'month',
  anchor: Date,
  now: Date,
  goals: Goal[],
  tags: Tag[],
): TrendReport {
  const cur = periodOf(span, anchor)
  const isCurrent = now >= cur.start && now < cur.end
  /*
   * Like with like. On the 5th of the month, five days of rounds against all
   * of last month is a guaranteed "decrease of 80%" that means nothing — so a
   * period still running is compared with the previous one cut at the same
   * point: Sunday-to-Thursday-10:00 against the same stretch last week.
   */
  const full = periodOf(span, shift(span, anchor, -1))
  const prev: Period = isCurrent
    ? { start: full.start, end: new Date(Math.min(full.end.getTime(), full.start.getTime() + (now.getTime() - cur.start.getTime()))) }
    : full
  const a = inPeriod(rounds, cur)
  const b = inPeriod(rounds, prev)

  const curLabel = isCurrent
    ? `this ${span}`
    : span === 'week'
      ? `the week of ${format(cur.start, 'd MMM')}`
      : `in ${format(cur.start, 'MMMM')}`
  const lastLabel = isCurrent
    ? `by this point last ${span}`
    : span === 'week'
      ? 'the week before'
      : `in ${format(prev.start, 'MMMM')}`

  const item = (axis: TrendItem['axis'], id: string | null, name: string, pick: (r: Round) => boolean): TrendItem => {
    const h = hours(minutesOf(a.filter(pick)))
    const p = hours(minutesOf(b.filter(pick)))
    const pct = changePct(h, p)
    return { axis, id, name, hours: h, previousHours: p, changePct: pct, summary: sentence(id ? `“${name}”` : '', h, p, pct, curLabel, lastLabel) }
  }

  const goalIds = new Set([...a, ...b].map((r) => r.goalId))
  const tagIds = new Set([...a, ...b].map((r) => r.tagId))

  const byHours = (x: TrendItem, y: TrendItem) => y.hours - x.hours || y.previousHours - x.previousHours
  const goalItems = goals
    .filter((g) => goalIds.has(g.id))
    .map((g) => item('goal', g.id, g.name, (r) => r.goalId === g.id))
    .sort(byHours)
  const tagItems = tags
    .filter((t) => tagIds.has(t.id))
    .map((t) => item('subject', t.id, t.name, (r) => r.tagId === t.id))
    .sort(byHours)

  return {
    version: 1,
    span,
    period: { start: cur.start.toISOString(), end: cur.end.toISOString() },
    previous: { start: prev.start.toISOString(), end: prev.end.toISOString() },
    toDate: isCurrent,
    previousLabel: lastLabel,
    rounds: a.length,
    previousRounds: b.length,
    items: [item('total', null, 'Total', () => true), ...goalItems, ...tagItems],
  }
}
