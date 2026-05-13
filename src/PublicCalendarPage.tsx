import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { publicApi, type PublicEventDoc } from './api'
import { DashboardCalendar } from './components/DashboardCalendar'

export function PublicCalendarPage() {
  const [events, setEvents] = useState<PublicEventDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    function load(initial: boolean) {
      if (initial) setLoading(true)
      publicApi
        .getEvents()
        .then((data) => {
          if (!cancelled) {
            setEvents(data)
            setError(null)
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Failed to load calendar')
          }
        })
        .finally(() => {
          if (!cancelled && initial) setLoading(false)
        })
    }

    load(true)

    function onVisible() {
      if (document.visibilityState === 'visible') load(false)
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <div className="public-calendar-page">
      <header className="public-calendar-top">
        <div className="public-calendar-brand">
          <div className="logo-slot logo-slot-lg" title="Logo" aria-label="Logo" />
          <div>
            <div className="public-calendar-title-row">
              <span className="brand-mark">✦</span>
              <h1 className="public-calendar-title">Robotics Club Planner</h1>
            </div>
            <p className="public-calendar-tagline">
              Public calendar — competitions, demos and open sessions the club has chosen to list.
            </p>
          </div>
        </div>
        <Link to="/login" className="btn primary member-login-btn">
          Member login
        </Link>
      </header>

      {loading && <p className="public-calendar-status">Loading calendar…</p>}

      <div className="panel-grid public-calendar-grid-wrap">
        <DashboardCalendar
          events={events}
          tasks={[]}
          showTasks={false}
          title="What's on"
          subtitle={
            error
              ? 'Calendar could not be refreshed; showing an empty grid. Try again later.'
              : loading
                ? 'Loading public events…'
                : events.length === 0
                  ? 'No public events yet. Members can opt in when creating or editing an event.'
                  : 'Events members have marked to show here (name, date and location only).'
          }
        />
      </div>
    </div>
  )
}
