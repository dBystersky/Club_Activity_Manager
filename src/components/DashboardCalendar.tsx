import { useMemo, useState } from 'react'
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export type CalendarEventInput = {
  id: string
  name: string
  date: string
  location?: string
}

export type CalendarTaskInput = {
  id: string
  title: string
  dueDate: string
  assignee?: string
  completed: boolean
}

function normalizeCalendarDay(value: string): string | null {
  const raw = value.trim().slice(0, 10)
  if (raw.length < 10) return null
  const d = parseISO(raw)
  return isValid(d) ? format(d, 'yyyy-MM-dd') : null
}

type CalendarViewMode = 'month' | 'week'

export interface DashboardCalendarProps {
  events: CalendarEventInput[]
  tasks: CalendarTaskInput[]
  showTasks?: boolean
  title?: string
  subtitle?: string
}

export function DashboardCalendar({
  events,
  tasks,
  showTasks = true,
  title = 'Calendar',
  subtitle = 'All events and tasks by date. Tasks appear on their due date.',
}: DashboardCalendarProps) {
  const [view, setView] = useState<CalendarViewMode>('month')
  const [focusedDate, setFocusedDate] = useState(() => new Date())

  const byDay = useMemo(() => {
    const map = new Map<string, { events: CalendarEventInput[]; tasks: CalendarTaskInput[] }>()
    const ensure = (key: string) => {
      if (!map.has(key)) map.set(key, { events: [], tasks: [] })
      return map.get(key)!
    }
    for (const e of events) {
      const key = normalizeCalendarDay(e.date)
      if (key) ensure(key).events.push(e)
    }
    if (showTasks) {
      for (const t of tasks) {
        const key = normalizeCalendarDay(t.dueDate)
        if (key) ensure(key).tasks.push(t)
      }
    }
    return map
  }, [events, tasks, showTasks])

  const gridDays = useMemo(() => {
    if (view === 'month') {
      const monthStart = startOfMonth(focusedDate)
      const monthEnd = endOfMonth(focusedDate)
      const start = startOfWeek(monthStart, { weekStartsOn: 1 })
      const end = endOfWeek(monthEnd, { weekStartsOn: 1 })
      return eachDayOfInterval({ start, end })
    }
    const wStart = startOfWeek(focusedDate, { weekStartsOn: 1 })
    const wEnd = endOfWeek(focusedDate, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: wStart, end: wEnd })
  }, [focusedDate, view])

  const navTitle = useMemo(() => {
    if (view === 'month') return format(focusedDate, 'MMMM yyyy')
    const wStart = startOfWeek(focusedDate, { weekStartsOn: 1 })
    const wEnd = endOfWeek(focusedDate, { weekStartsOn: 1 })
    if (
      wStart.getMonth() === wEnd.getMonth() &&
      wStart.getFullYear() === wEnd.getFullYear()
    ) {
      return `${format(wStart, 'd')}–${format(wEnd, 'd MMMM yyyy')}`
    }
    return `${format(wStart, 'd MMM')} – ${format(wEnd, 'd MMM yyyy')}`
  }, [focusedDate, view])

  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <section className="panel span-2 dashboard-calendar">
      <header className="panel-header dashboard-calendar-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="dashboard-calendar-nav">
          <button
            type="button"
            className="btn ghost cal-nav-btn"
            aria-label={view === 'month' ? 'Previous month' : 'Previous week'}
            onClick={() =>
              setFocusedDate((d) => (view === 'month' ? subMonths(d, 1) : subWeeks(d, 1)))
            }
          >
            <ChevronLeft size={18} />
          </button>
          <span className="dashboard-calendar-title">{navTitle}</span>
          <button
            type="button"
            className="btn ghost cal-nav-btn"
            aria-label={view === 'month' ? 'Next month' : 'Next week'}
            onClick={() =>
              setFocusedDate((d) => (view === 'month' ? addMonths(d, 1) : addWeeks(d, 1)))
            }
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className="btn ghost cal-today-btn"
            onClick={() => setFocusedDate(new Date())}
          >
            Today
          </button>
        </div>
      </header>
      <div className="dashboard-calendar-toolbar">
        <div className="event-filters calendar-view-toggle">
          <button
            type="button"
            className={view === 'month' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setView('month')}
          >
            Month
          </button>
          <button
            type="button"
            className={view === 'week' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setView('week')}
          >
            Week
          </button>
        </div>
      </div>
      <div className="dashboard-calendar-legend">
        <span className="cal-legend cal-legend-event">Event</span>
        {showTasks ? <span className="cal-legend cal-legend-task">Task</span> : null}
      </div>
      <div
        className={
          view === 'week'
            ? 'dashboard-calendar-weekdays cal-week-header'
            : 'dashboard-calendar-weekdays'
        }
      >
        {view === 'month'
          ? weekdayLabels.map((w) => (
              <div key={w} className="dashboard-calendar-weekday">
                {w}
              </div>
            ))
          : gridDays.map((day) => (
              <div key={format(day, 'yyyy-MM-dd')} className="dashboard-calendar-weekday">
                <span className="cal-weekday-name">{format(day, 'EEE')}</span>
                <span className="cal-weekday-date">{format(day, 'd MMM')}</span>
              </div>
            ))}
      </div>
      <div
        className={
          view === 'week'
            ? 'dashboard-calendar-grid cal-week-view'
            : 'dashboard-calendar-grid'
        }
      >
        {gridDays.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const cell = byDay.get(key)
          const inMonth = view === 'month' && isSameMonth(day, focusedDate)
          const today = isToday(day)
          return (
            <div
              key={key}
              className={
                'dashboard-calendar-cell' +
                (view === 'month' && !inMonth ? ' cal-other-month' : '') +
                (today ? ' cal-cell-today' : '')
              }
            >
              {view === 'month' && (
                <div className="dashboard-calendar-daynum">{format(day, 'd')}</div>
              )}
              <div className="dashboard-calendar-items">
                {cell?.events.map((e) => (
                  <div
                    key={`e-${e.id}`}
                    className="cal-item cal-item-event"
                    title={`Event: ${e.name}${e.location ? ` · ${e.location}` : ''}`}
                  >
                    {e.name}
                  </div>
                ))}
                {showTasks &&
                  cell?.tasks.map((t) => (
                    <div
                      key={`t-${t.id}`}
                      className={
                        'cal-item cal-item-task' + (t.completed ? ' cal-item-done' : '')
                      }
                      title={`Task: ${t.title}${t.assignee ? ` · ${t.assignee}` : ''}`}
                    >
                      {t.completed ? '✓ ' : ''}
                      {t.title}
                    </div>
                  ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
