import { useEffect, useRef, useState } from 'react'

export type Phase = 'idle' | 'work' | 'break'

interface TimerState {
  workMin: number
  breakMin: number
  phase: Phase
  /** Minted at start, so a round finishing twice is still one round. */
  roundId: string | null
  startedAt: number | null
  endsAt: number | null
  pausedAt: number | null
}

export interface FinishedRound {
  id: string
  startedAt: string
  minutes: number
}

export interface Pomodoro {
  phase: Phase
  paused: boolean
  workMin: number
  breakMin: number
  remainingMs: number
  /** 0 → 1 through the current phase. */
  progress: number
  start: () => void
  pause: () => void
  resume: () => void
  /** Abandons a work round unrecorded, or skips a break. */
  stop: () => void
  setDurations: (workMin: number, breakMin: number) => void
}

const KEY = 'circles.timer.v1'
const MIN = 60_000
const IDLE: TimerState = {
  workMin: 25,
  breakMin: 5,
  phase: 'idle',
  roundId: null,
  startedAt: null,
  endsAt: null,
  pausedAt: null,
}

/*
 * Wall-clock, not a counter: the remaining time is `endsAt - now`, so a
 * throttled background tab, a sleep or a reload cannot make it drift. The state
 * lives in localStorage for the same reason — reopen the app mid-round and the
 * round is still running, or already over and waiting to be logged.
 */
function load(): TimerState {
  try {
    return { ...IDLE, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return IDLE
  }
}

/** A soft two-note bell, synthesised so there is no audio asset to ship. */
function chime(): void {
  try {
    const ctx = new AudioContext()
    ;[660, 880].forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.18
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      osc.connect(gain).connect(ctx.destination)
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
      osc.start(t)
      osc.stop(t + 1.4)
    })
    setTimeout(() => void ctx.close(), 2000)
  } catch {
    // No audio is not worth an error.
  }
}

export const formatClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function usePomodoro(onWorkDone: (round: FinishedRound) => void): Pomodoro {
  const [s, setS] = useState(load)
  const [now, setNow] = useState(Date.now)
  const onDone = useRef(onWorkDone)
  onDone.current = onWorkDone
  /** The phase end already acted on — StrictMode runs effects twice. */
  const handled = useRef<number | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      // Private mode: the timer still works, it just won't survive a reload.
    }
  }, [s])

  const running = s.phase !== 'idle' && s.pausedAt === null
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [running])

  const total = (s.phase === 'break' ? s.breakMin : s.workMin) * MIN
  const remainingMs = s.endsAt === null ? total : s.endsAt - (s.pausedAt ?? now)

  useEffect(() => {
    if (!running || remainingMs > 0 || s.endsAt === null || handled.current === s.endsAt) return
    handled.current = s.endsAt
    // Only ring for an ending that just happened, not one found on reopening.
    // ponytail: 90s, because a hidden tab's timers can be throttled to one tick
    // a minute; a Notification would be exact, add it if late bells annoy.
    if (Date.now() - s.endsAt < 90_000) chime()

    if (s.phase === 'work') {
      onDone.current({
        id: s.roundId!,
        startedAt: new Date(s.startedAt!).toISOString(),
        minutes: s.workMin,
      })
      // The break runs from when work ended, not from now — reopen two hours
      // later and it is correctly already over.
      setS((p) => ({ ...p, phase: 'break', endsAt: p.endsAt! + p.breakMin * MIN }))
    } else {
      setS((p) => ({ ...p, phase: 'idle', roundId: null, startedAt: null, endsAt: null }))
    }
  }, [running, remainingMs, s])

  const clock = formatClock(remainingMs)
  useEffect(() => {
    document.title = s.phase === 'idle' ? 'Circles' : `${clock} · ${s.phase === 'work' ? 'Focus' : 'Break'}`
  }, [clock, s.phase])

  return {
    phase: s.phase,
    paused: s.pausedAt !== null,
    workMin: s.workMin,
    breakMin: s.breakMin,
    remainingMs,
    progress: Math.min(1, Math.max(0, 1 - remainingMs / total)),
    start: () => {
      const t = Date.now()
      setS((p) => ({
        ...p,
        phase: 'work',
        roundId: crypto.randomUUID(),
        startedAt: t,
        endsAt: t + p.workMin * MIN,
        pausedAt: null,
      }))
    },
    pause: () => setS((p) => ({ ...p, pausedAt: Date.now() })),
    resume: () =>
      setS((p) =>
        p.pausedAt === null ? p : { ...p, endsAt: p.endsAt! + (Date.now() - p.pausedAt), pausedAt: null },
      ),
    stop: () => setS((p) => ({ ...IDLE, workMin: p.workMin, breakMin: p.breakMin })),
    setDurations: (workMin, breakMin) => setS((p) => ({ ...p, workMin, breakMin })),
  }
}
