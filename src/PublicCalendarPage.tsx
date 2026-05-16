import { format, isValid, parseISO, startOfToday } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { publicApi, type PublicEventDoc } from './api'
import { DashboardCalendar } from './components/DashboardCalendar'
import logoImage from './assets/mdn-2-01.webp'

const UPCOMING_CARD_LIMIT = 6

function eventDay(value: string): Date | null {
  const raw = value.trim().slice(0, 10)
  if (raw.length < 10) return null
  const d = parseISO(raw)
  return isValid(d) ? d : null
}

export function PublicCalendarPage() {
  const [events, setEvents] = useState<PublicEventDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const upcomingSpotlight = useMemo(() => {
    const today = startOfToday()
    return events
      .map((e) => ({ e, day: eventDay(e.date) }))
      .filter((row): row is { e: PublicEventDoc; day: Date } => row.day !== null && row.day >= today)
      .sort((a, b) => a.day.getTime() - b.day.getTime())
      .slice(0, UPCOMING_CARD_LIMIT)
      .map(({ e, day }) => ({ ...e, day }))
  }, [events])

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
          <img className="logo-slot-public" src={logoImage} alt="Monash Deep Neuron logo" />
          <div>
            <div className="public-calendar-title-row">
              <span className="brand-mark">✦</span>
              <h1 className="public-calendar-title">Monash Deep Neuron</h1>
            </div>
            <p className="public-calendar-tagline">
              Public calendar — workshops, reading groups and open sessions the club has chosen to list.
            </p>
          </div>
        </div>
        <Link to="/login" className="btn primary member-login-btn">
          Member login
        </Link>
      </header>

      {loading && <p className="public-calendar-status">Loading calendar…</p>}

      {!loading && upcomingSpotlight.length > 0 && (
        <section className="public-upcoming-spotlight" aria-labelledby="public-upcoming-heading">
          <h2 id="public-upcoming-heading" className="public-upcoming-spotlight-title">
            Coming up soon
          </h2>
          <p className="public-upcoming-spotlight-lede">
            Next public listings — full schedule on the calendar below.
          </p>
          <ul className="public-upcoming-cards">
            {upcomingSpotlight.map(({ day, ...ev }) => (
              <li key={ev.id}>
                <article className="public-upcoming-card">
                  <time className="public-upcoming-card-date" dateTime={format(day, 'yyyy-MM-dd')}>
                    {format(day, 'EEE d MMM yyyy')}
                  </time>
                  <h3 className="public-upcoming-card-title">{ev.name || 'Untitled event'}</h3>
                  <p className="public-upcoming-card-location">
                    {ev.location?.trim() ? ev.location : 'Location TBC'}
                  </p>
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}

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
                  : 'Open listings from members (name, date and location only).'
          }
        />
      </div>
    </div>
  )
}
