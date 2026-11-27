import { addDays, isSameDay, parseISO, set, startOfDay } from 'date-fns'
import { dayKey } from './deadlines'
import { matchesRecurrence } from './recurrence'
import type { RingTask } from './rings'
import { compareTasks } from './sort'
import type { Block, Task } from './types'

/** Everything on the calendar moves in quarter hours. */
export const SNAP_MIN = 15
export const DAY_MIN = 24 * 60
export const DEFAULT_BLOCK_MIN = 60

export type CalendarRange = 'day' | '3days' | 'week'

export const RANGES: { id: CalendarRange; label: string; days: number }[] = [
  { id: 'day', label: 'Today', days: 1 },
  { id: '3days', label: '3 days', days: 3 },
  { id: 'week', label: 'Week', days: 7 },
]

/** The visible days. Every range starts today — the calendar plans ahead, it does not keep a diary. */
export function rangeDays(now: Date, range: CalendarRange): Date[] {
  const n = RANGES.find((r) => r.id === range)?.days ?? 1
  const start = startOfDay(now)
  return Array.from({ length: n }, (_, i) => addDays(start, i))
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export const snap = (min: number, mode: 'round' | 'floor' | 'ceil' = 'round'): number =>
  Math[mode](min / SNAP_MIN) * SNAP_MIN

/** Minutes past local midnight by wall clock, so a DST day still lines up with its hour labels. */
export const minuteOfDay = (date: Date): number => date.getHours() * 60 + date.getMinutes()

/** The instant `min` wall-clock minutes into `day`. 1440 is the following midnight. */
export function atMinute(day: Date, min: number): Date {
  if (min >= DAY_MIN) return startOfDay(addDays(day, 1))
  return set(startOfDay(day), { hours: Math.floor(min / 60), minutes: min % 60, seconds: 0, milliseconds: 0 })
}

export interface Span {
  day: Date
  startMin: number
  endMin: number
}

/** A block as wall-clock minutes on the day it starts. Anything past midnight is cut at 24:00. */
export function blockSpan(block: Block): Span {
  const start = parseISO(block.start)
  const end = parseISO(block.end)
  const startMin = minuteOfDay(start)
  const endMin = isSameDay(start, end) ? minuteOfDay(end) : DAY_MIN
  return { day: startOfDay(start), startMin, endMin: Math.max(endMin, startMin + SNAP_MIN) }
}

export const formatMinute = (min: number): string =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`
}

export interface Placed<T> {
  item: T
  /** Zero-based lane within its cluster of overlapping items. */
  col: number
  /** Lanes the cluster needs, so every member can size itself to 1/cols. */
  cols: number
}

/**
 * Side-by-side lanes for overlapping blocks. Items are swept in start order;
 * a run of transitively overlapping items is one cluster, each item takes the
 * first lane free by its start, and the whole cluster shares one lane count so
 * widths line up.
 */
export function layoutLanes<T extends { startMin: number; endMin: number }>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  const out: Placed<T>[] = []
  let cluster: Placed<T>[] = []
  let laneEnds: number[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    for (const p of cluster) p.cols = laneEnds.length
    cluster = []
    laneEnds = []
  }

  for (const item of sorted) {
    if (item.startMin >= clusterEnd) flush()
    let col = laneEnds.findIndex((end) => end <= item.startMin)
    if (col === -1) col = laneEnds.push(item.endMin) - 1
    else laneEnds[col] = item.endMin
    const placed = { item, col, cols: 0 }
    cluster.push(placed)
    out.push(placed)
    clusterEnd = Math.max(clusterEnd, item.endMin)
  }
  flush()
  return out
}

/* ----------------------------------------------------------------- tray --- */

export type TrayMode = 'overdue' | 'deadline' | 'recurring'

export const TRAY_MODES: { id: TrayMode; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'deadline', label: 'By deadline' },
  { id: 'recurring', label: 'Recurring' },
]

/**
 * The cards under the calendar. Overdue matches the Overdue ring exactly,
 * recurring occurrences included; "by deadline" is every open one-off task,
 * soonest first; recurring is the habits, each showing its next occurrence.
 */
export function trayTasks(tasks: RingTask[], mode: TrayMode): RingTask[] {
  const open = tasks.filter((t) => !t.isCompleted)
  const picked =
    mode === 'overdue'
      ? open.filter((t) => t.isOverdue)
      : mode === 'deadline'
        ? open.filter((t) => !t.isRecurring)
        : open.filter((t) => t.isRecurring)
  return picked.sort(compareTasks)
}

/* ------------------------------------------------------------ placement --- */

/**
 * A recurring task's block *is* one day's occurrence, so it may only go on a
 * day the rule fires — inside the rule's own start and `until`. One-off work
 * can go anywhere.
 */
export function canPlaceOn(task: Task, day: Date): boolean {
  const rec = task.recurrence
  if (!rec) return true
  const d = startOfDay(day)
  if (d < startOfDay(parseISO(task.deadline))) return false
  if (rec.until && d > startOfDay(parseISO(rec.until))) return false
  return matchesRecurrence(d, rec)
}

/**
 * The block a card dropped on `day` should move instead of adding another: a
 * one-off task holds one block wherever it is; a recurring task one per day.
 */
export function blockFor(blocks: Block[], task: Task, day: Date): Block | undefined {
  return blocks.find(
    (b) => b.taskId === task.id && (!task.recurrence || isSameDay(parseISO(b.start), day)),
  )
}

/** The occurrence a block completes: its own day for recurring work, null for a one-off. */
export const occurrenceDayOf = (task: Task, block: Block): string | null =>
  task.recurrence ? dayKey(parseISO(block.start)) : null

export function isBlockDone(
  task: Task,
  block: Block,
  completedByTask: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  return task.recurrence
    ? !!completedByTask.get(task.id)?.has(dayKey(parseISO(block.start)))
    : !!task.completedAt
}

/**
 * How long a card lands for: the length of its latest block, so a habit
 * remembers it takes 30 minutes; otherwise an hour.
 */
export function cardMinutes(blocks: Block[], taskId: string): number {
  let latest: Block | undefined
  for (const b of blocks) if (b.taskId === taskId && (!latest || b.start > latest.start)) latest = b
  if (!latest) return DEFAULT_BLOCK_MIN
  const { startMin, endMin } = blockSpan(latest)
  return endMin - startMin
}

/** Where the schedule form starts: the next quarter hour today, nine o'clock on any other day. */
export function defaultStartMin(day: Date, now: Date, minutes: number): number {
  const start = isSameDay(day, now) ? snap(minuteOfDay(now), 'ceil') : 9 * 60
  return clamp(start, 0, DAY_MIN - minutes)
}

/* ------------------------------------------------------------------ drag --- */

/** What is being dragged. Pixel bookkeeping lives in the hook; this is only meaning. */
export type DragSource =
  | { kind: 'card'; task: Task; minutes: number }
  | { kind: 'move'; task: Task; block: Block; grabMin: number }
  | { kind: 'resize'; task: Task; block: Block; edge: 'start' | 'end' }

export interface DropSpan {
  startMin: number
  endMin: number
  valid: boolean
}

/**
 * Turns a pointer over a day column into the span a drop would produce.
 *
 * A card's top edge lands on the quarter hour under the pointer; a moved block
 * keeps the offset it was grabbed at; a resize moves only the grabbed edge and
 * never goes under one snap. Recurring work is invalid on a day its rule does
 * not fire, or on one that already holds another block of the same task.
 */
export function dropSpan(source: DragSource, day: Date, minute: number, blocks: Block[]): DropSpan {
  if (source.kind === 'resize') {
    const span = blockSpan(source.block)
    return source.edge === 'end'
      ? { startMin: span.startMin, endMin: clamp(snap(minute), span.startMin + SNAP_MIN, DAY_MIN), valid: true }
      : { startMin: clamp(snap(minute), 0, span.endMin - SNAP_MIN), endMin: span.endMin, valid: true }
  }

  const { task } = source
  const minutes =
    source.kind === 'card' ? source.minutes : blockSpan(source.block).endMin - blockSpan(source.block).startMin
  const raw = source.kind === 'card' ? snap(minute, 'floor') : snap(minute - source.grabMin)
  const startMin = clamp(raw, 0, DAY_MIN - minutes)
  const self = source.kind === 'move' ? source.block.id : blockFor(blocks, task, day)?.id
  const clash =
    !!task.recurrence &&
    blocks.some((b) => b.taskId === task.id && b.id !== self && isSameDay(parseISO(b.start), day))
  return { startMin, endMin: startMin + minutes, valid: canPlaceOn(task, day) && !clash }
}
