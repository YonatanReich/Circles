import { useState } from 'react'
import appStyles from '../../App.module.css'
import { cx } from '../../lib/cx'
import { useBoard, useDeleteRound, useSaveRound } from '../../lib/queries'
import { useNow } from '../../lib/useNow'
import type { Pomodoro } from '../../lib/usePomodoro'
import { AppHeader } from '../AppHeader'
import { PerformanceView } from './PerformanceView'
import { RoundsView } from './RoundsView'
import { TimerView } from './TimerView'

type View = 'timer' | 'rounds' | 'performance'

const VIEWS: { id: View; label: string }[] = [
  { id: 'timer', label: 'Timer' },
  { id: 'rounds', label: 'Rounds' },
  { id: 'performance', label: 'Performance' },
]

interface Props {
  email: string | null
  timer: Pomodoro
  onHome: () => void
}

export function FocusApp({ email, timer, onHome }: Props) {
  const now = useNow()
  const { data, isPending, error } = useBoard()
  const saveRound = useSaveRound()
  const deleteRound = useDeleteRound()
  const [view, setView] = useState<View>('timer')

  const rounds = data?.rounds ?? []
  const goals = data?.goals ?? []
  const tags = data?.tags ?? []

  return (
    <div className={appStyles.app}>
      <AppHeader
        app="Focus"
        email={email}
        onHome={onHome}
        // The timer view is the timer; anywhere else the chip leads back to it.
        timer={view === 'timer' ? undefined : timer}
        onTimer={() => setView('timer')}
        tabs={
          <div className="segmented">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
        }
      />

      <main key={view} className={cx(appStyles.main, 'enter')}>
        {error ? (
          <p className={appStyles.error}>{error.message}</p>
        ) : isPending ? (
          <p className="empty">Loading…</p>
        ) : view === 'timer' ? (
          <TimerView timer={timer} rounds={rounds} goals={goals} now={now} onShowRounds={() => setView('rounds')} />
        ) : view === 'rounds' ? (
          <RoundsView
            rounds={rounds}
            goals={goals}
            tags={tags}
            now={now}
            defaultMinutes={timer.workMin}
            onSave={(r) => saveRound.mutate(r)}
            onDelete={(id) => deleteRound.mutate(id)}
          />
        ) : (
          <PerformanceView rounds={rounds} goals={goals} tags={tags} now={now} />
        )}
      </main>
    </div>
  )
}
