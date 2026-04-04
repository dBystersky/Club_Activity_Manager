import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { DashboardCalendar } from './components/DashboardCalendar'
import {
  activitiesApi,
  authApi,
  getToken,
  setToken,
  type AuthUser,
  type EventDoc,
  type TaskDoc,
  type BudgetItemDoc,
  type MeetingDoc,
} from './api'

type Priority = 'low' | 'medium' | 'high'

type EventStatus = 'planning' | 'confirmed' | 'completed'

interface ClubEvent {
  id: string
  name: string
  date: string
  location: string
  priority: Priority
  status: EventStatus
  budgetAllocated: number
  members: string[]
  isOwner: boolean
  ownerEmail?: string
  publicOnCalendar: boolean
}

interface Task {
  id: string
  eventId: string
  title: string
  assignee: string
  dueDate: string
  priority: Priority
  completed: boolean
}

interface BudgetItem {
  id: string
  eventId: string
  label: string
  amount: number
  spent: boolean
}

interface Meeting {
  id: string
  eventId?: string
  dateTime: string
  location: string
  agenda: string
}

type Tab = 'dashboard' | 'events' | 'tasks' | 'budget' | 'safety' | 'meetings' | 'profile'

interface PersistedState {
  events: ClubEvent[]
  tasks: Task[]
  budgetItems: BudgetItem[]
  meetings: Meeting[]
}

const emptyState: PersistedState = {
  events: [],
  tasks: [],
  budgetItems: [],
  meetings: [],
}

function docToEvent(d: EventDoc): ClubEvent {
  return {
    id: d.id,
    name: d.name,
    date: d.date ?? '',
    location: d.location ?? '',
    priority: (d.priority as Priority) ?? 'medium',
    status: (d.status as EventStatus) ?? 'planning',
    budgetAllocated: d.budgetAllocated ?? 0,
    members: d.members ?? [],
    isOwner: d.isOwner ?? true,
    ownerEmail: d.ownerEmail,
    publicOnCalendar: d.publicOnCalendar ?? false,
  }
}

function docToTask(d: TaskDoc): Task {
  return {
    id: d.id,
    eventId: d.eventId ?? '',
    title: d.title,
    assignee: d.assignee ?? '',
    dueDate: d.dueDate ?? '',
    priority: (d.priority as Priority) ?? 'medium',
    completed: d.completed ?? false,
  }
}

function docToBudgetItem(d: BudgetItemDoc): BudgetItem {
  return {
    id: d.id,
    eventId: d.eventId ?? '',
    label: d.label,
    amount: d.amount,
    spent: d.spent ?? false,
  }
}

function docToMeeting(d: MeetingDoc): Meeting {
  return { id: d.id, eventId: d.eventId, dateTime: d.dateTime, location: d.location, agenda: d.agenda ?? '' }
}

export function PlannerApp() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [state, setState] = useState<PersistedState>(emptyState)
  const [apiError, setApiError] = useState<string | null>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setAuthLoading(false)
      return
    }
    authApi
      .me()
      .then((data) => setUser(data.user))
      .catch(() => setToken(null))
      .finally(() => setAuthLoading(false))
  }, [])

  const loadData = useCallback(async () => {
    if (!user) return
    setApiError(null)
    try {
      const [events, tasks, budgetItems, meetings] = await Promise.all([
        activitiesApi.getEvents(),
        activitiesApi.getTasks(),
        activitiesApi.getBudgetItems(),
        activitiesApi.getMeetings(),
      ])
      setState({
        events: events.map(docToEvent),
        tasks: tasks.map(docToTask),
        budgetItems: budgetItems.map(docToBudgetItem),
        meetings: meetings.map(docToMeeting),
      })
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to load data')
      setState(emptyState)
    }
  }, [user])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  function handleLogout() {
    setToken(null)
    setUser(null)
    setState(emptyState)
    navigate('/', { replace: true })
  }

  const upcomingEvents = useMemo(
    () =>
      [...state.events]
        .filter((e) => e.status !== 'completed')
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 3),
    [state.events],
  )

  const openTasks = useMemo(
    () =>
      state.tasks
        .filter((t) => !t.completed)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 5),
    [state.tasks],
  )

  const totalAllocated = useMemo(
    () => state.events.reduce((sum, e) => sum + e.budgetAllocated, 0),
    [state.events],
  )
  const totalPlannedSpend = useMemo(
    () =>
      state.budgetItems.reduce(
        (sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0),
        0,
      ),
    [state.budgetItems],
  )

  const overdueTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return state.tasks.filter(
      (t) => !t.completed && t.dueDate && t.dueDate < today,
    )
  }, [state.tasks])

  async function upsertEvent(partial: Omit<ClubEvent, 'id'>, id?: string) {
    setApiError(null)
    try {
      if (id) {
        const updated = await activitiesApi.updateEvent(id, partial)
        setState((prev) => ({
          ...prev,
          events: prev.events.map((e) => (e.id === id ? docToEvent(updated) : e)),
        }))
      } else {
        const created = await activitiesApi.createEvent(partial)
        setState((prev) => ({
          ...prev,
          events: [...prev.events, docToEvent(created)],
        }))
      }
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to save event')
    }
  }

  async function deleteEvent(id: string) {
    setApiError(null)
    try {
      await activitiesApi.deleteEvent(id)
      setState((prev) => ({
        ...prev,
        events: prev.events.filter((e) => e.id !== id),
        tasks: prev.tasks.filter((t) => t.eventId !== id),
        budgetItems: prev.budgetItems.filter((b) => b.eventId !== id),
        meetings: prev.meetings.map((m) =>
          m.eventId === id ? { ...m, eventId: undefined } : m,
        ),
      }))
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to delete event')
      throw err
    }
  }

  async function addTask(partial: Omit<Task, 'id' | 'completed'>) {
    setApiError(null)
    try {
      const created = await activitiesApi.createTask({ ...partial, completed: false })
      setState((prev) => ({
        ...prev,
        tasks: [...prev.tasks, docToTask(created)],
      }))
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to add task')
    }
  }

  async function toggleTaskCompletion(id: string) {
    const task = state.tasks.find((t) => t.id === id)
    if (!task) return
    setApiError(null)
    try {
      const updated = await activitiesApi.updateTask(id, { completed: !task.completed })
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === id ? docToTask(updated) : t)),
      }))
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to update task')
    }
  }

  async function addBudgetItem(partial: Omit<BudgetItem, 'id' | 'spent'>) {
    setApiError(null)
    try {
      const created = await activitiesApi.createBudgetItem({ ...partial, spent: false })
      setState((prev) => ({
        ...prev,
        budgetItems: [...prev.budgetItems, docToBudgetItem(created)],
      }))
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to add budget item')
    }
  }

  async function toggleBudgetItemSpent(id: string) {
    const item = state.budgetItems.find((b) => b.id === id)
    if (!item) return
    setApiError(null)
    try {
      const updated = await activitiesApi.updateBudgetItem(id, { spent: !item.spent })
      setState((prev) => ({
        ...prev,
        budgetItems: prev.budgetItems.map((b) => (b.id === id ? docToBudgetItem(updated) : b)),
      }))
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to update budget item')
    }
  }

  async function addMeeting(partial: Omit<Meeting, 'id'>) {
    setApiError(null)
    try {
      const created = await activitiesApi.createMeeting(partial)
      setState((prev) => ({
        ...prev,
        meetings: [...prev.meetings, docToMeeting(created)],
      }))
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to add meeting')
    }
  }

  if (authLoading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Robotics Club Planner</h1>
          <p>Complex activity management for university robotics clubs.</p>
          <p className="sidebar-user">{user.email}</p>
        </div>
        <nav className="sidebar-nav">
          <button
            className={tab === 'dashboard' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('dashboard')}
          >
            Overview
          </button>
          <button
            className={tab === 'events' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('events')}
          >
            Events & Competitions
          </button>
          <button
            className={tab === 'tasks' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('tasks')}
          >
            Tasks & Collaboration
          </button>
          <button
            className={tab === 'budget' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('budget')}
          >
            Budgeting
          </button>
          <button
            className={tab === 'safety' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('safety')}
          >
            Safety & Logistics
          </button>
          <button
            className={tab === 'meetings' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('meetings')}
          >
            Meetings & Reminders
          </button>
          <button
            className={tab === 'profile' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('profile')}
          >
            Profile
          </button>
        </nav>
        <div className="sidebar-footnote">
          <span>Data is stored in MongoDB. Start the server with npm run dev:server.</span>
          <button type="button" className="btn ghost logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="content">
        {tab === 'dashboard' && (
          <DashboardView
            events={state.events}
            tasks={state.tasks}
            upcomingEvents={upcomingEvents}
            openTasks={openTasks}
            overdueTasks={overdueTasks}
            totalAllocated={totalAllocated}
            totalPlannedSpend={totalPlannedSpend}
          />
        )}
        {tab === 'events' && (
          <EventsView events={state.events} onUpsert={upsertEvent} onDelete={deleteEvent} />
        )}
        {tab === 'tasks' && (
          <TasksView
            events={state.events}
            tasks={state.tasks}
            onAddTask={addTask}
            onToggleTask={toggleTaskCompletion}
          />
        )}
        {tab === 'budget' && (
          <BudgetView
            events={state.events}
            items={state.budgetItems}
            onAddItem={addBudgetItem}
            onToggleSpent={toggleBudgetItemSpent}
          />
        )}
        {tab === 'safety' && <SafetyView events={state.events} tasks={state.tasks} />}
        {tab === 'meetings' && (
          <MeetingsView
            events={state.events}
            meetings={state.meetings}
            onAddMeeting={addMeeting}
          />
        )}
        {tab === 'profile' && <ProfileView user={user} />}
      </main>
      {apiError && (
        <div className="api-error-banner">
          {apiError}
          <button type="button" onClick={() => setApiError(null)}>Dismiss</button>
        </div>
      )}
    </div>
  )
}

interface DashboardProps {
  events: ClubEvent[]
  tasks: Task[]
  upcomingEvents: ClubEvent[]
  openTasks: Task[]
  overdueTasks: Task[]
  totalAllocated: number
  totalPlannedSpend: number
}

function DashboardView({
  events,
  tasks,
  upcomingEvents,
  openTasks,
  overdueTasks,
  totalAllocated,
  totalPlannedSpend,
}: DashboardProps) {
  return (
    <div className="panel-grid">
      <DashboardCalendar events={events} tasks={tasks} />
      <section className="panel">
        <header className="panel-header">
          <h2>Upcoming events</h2>
          <p>Competitions, showcases and outreach sessions.</p>
        </header>
        {upcomingEvents.length === 0 ? (
          <p className="empty-state">
            No events yet. Start by adding your next competition or demo.
          </p>
        ) : (
          <ul className="list">
            {upcomingEvents.map((e) => (
              <li key={e.id} className="list-row">
                <div>
                  <div className="list-title">{e.name}</div>
                  <div className="list-meta">
                    <span>{e.date || 'Date TBC'}</span>
                    <span>{e.location || 'Location TBC'}</span>
                    {e.members?.length ? (
                      <span className="members-count">{e.members.length} member{e.members.length !== 1 ? 's' : ''}</span>
                    ) : null}
                  </div>
                </div>
                <div className="badge-row">
                  {!e.isOwner && <span className="badge shared">Shared</span>}
                  <span className={`badge ${e.priority}`}>{e.priority}</span>
                  <span className="badge subtle">{e.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Critical tasks</h2>
          <p>Cross‑functional work that must land on time.</p>
        </header>
        {openTasks.length === 0 ? (
          <p className="empty-state">
            No open tasks. Create build, logistics or sponsorship tasks to get
            started.
          </p>
        ) : (
          <ul className="list">
            {openTasks.map((t) => (
              <li key={t.id} className="list-row">
                <div>
                  <div className="list-title">{t.title}</div>
                  <div className="list-meta">
                    <span>{t.assignee || 'Unassigned'}</span>
                    <span>{t.dueDate || 'No deadline'}</span>
                  </div>
                </div>
                <span className={`badge ${t.priority}`}>{t.priority}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel span-2">
        <header className="panel-header">
          <h2>Budget snapshot</h2>
          <p>High‑level view of allocated vs planned spend.</p>
        </header>
        <div className="budget-summary">
          <div>
            <div className="summary-label">Allocated to events</div>
            <div className="summary-value">
              ${totalAllocated.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="summary-label">Planned spend (line items)</div>
            <div className="summary-value">
              ${totalPlannedSpend.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </div>
          </div>
          <div>
            <div className="summary-label">Headroom</div>
            <div className="summary-value">
              ${(totalAllocated - totalPlannedSpend).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </div>
          </div>
        </div>
        {overdueTasks.length > 0 && (
          <div className="alert">
            <strong>{overdueTasks.length} overdue task(s)</strong> – review
            deadlines and rebalance work across the team.
          </div>
        )}
      </section>
    </div>
  )
}

interface EventsViewProps {
  events: ClubEvent[]
  onUpsert: (partial: Omit<ClubEvent, 'id'>, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

type EventFilter = 'all' | 'mine' | 'shared'

function EventsView({ events, onUpsert, onDelete }: EventsViewProps) {
  const [editingId, setEditingId] = useState<string | undefined>()
  const [members, setMembers] = useState<string[]>([])
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [memberStatus, setMemberStatus] = useState<Record<string, 'registered' | 'invited'>>({})
  const [eventFilter, setEventFilter] = useState<EventFilter>('all')
  const editing = events.find((e) => e.id === editingId)

  const filteredEvents = useMemo(() => {
    if (eventFilter === 'mine') return events.filter((e) => e.isOwner)
    if (eventFilter === 'shared') return events.filter((e) => !e.isOwner)
    return events
  }, [events, eventFilter])

  // Sync members when switching to another event
  useEffect(() => {
    setMembers(editing?.members ?? [])
    setMemberStatus({})
    requestedEmails.current.clear()
  }, [editing?.id, editing?.members])

  const requestedEmails = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (members.length === 0) return
    members.forEach((email) => {
      if (requestedEmails.current.has(email)) return
      requestedEmails.current.add(email)
      authApi.checkEmail(email).then(
        (r) => setMemberStatus((s) => ({ ...s, [email]: r.registered ? 'registered' : 'invited' })),
        () => setMemberStatus((s) => ({ ...s, [email]: 'invited' }))
      )
    })
  }, [members])

  function addMember() {
    const email = newMemberEmail.trim().toLowerCase()
    if (!email || members.includes(email)) return
    setMembers((prev) => [...prev, email])
    setNewMemberEmail('')
  }

  function removeMember(email: string) {
    setMembers((prev) => prev.filter((m) => m !== email))
    setMemberStatus((s) => {
      const next = { ...s }
      delete next[email]
      return next
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const payload: Omit<ClubEvent, 'id'> = {
      name: (data.get('name') as string) || '',
      date: (data.get('date') as string) || '',
      location: (data.get('location') as string) || '',
      priority: (data.get('priority') as Priority) || 'medium',
      status: (data.get('status') as EventStatus) || 'planning',
      budgetAllocated: Number(data.get('budgetAllocated') || 0),
      members,
      isOwner: true,
      publicOnCalendar: data.get('publicOnCalendar') === 'on',
    }
    onUpsert(payload, editing?.id)
    form.reset()
    setEditingId(undefined)
    setMembers([])
  }

  async function handleDeleteEvent() {
    if (!editing?.id) return
    const ok = window.confirm(
      'Delete this event permanently? Tasks and budget items linked to it will be removed. Meetings stay but will no longer be linked to this event.',
    )
    if (!ok) return
    try {
      await onDelete(editing.id)
      setEditingId(undefined)
      setMembers([])
    } catch {
      /* apiError set in parent */
    }
  }

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h2>Events & competitions</h2>
          <p>
            Plan competitions, demos, recruitment nights and outreach sessions
            in one place.
          </p>
        </div>
      </header>

      <div className="event-filters">
        <button
          type="button"
          className={eventFilter === 'all' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => setEventFilter('all')}
        >
          All
        </button>
        <button
          type="button"
          className={eventFilter === 'mine' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => setEventFilter('mine')}
        >
          My events
        </button>
        <button
          type="button"
          className={eventFilter === 'shared' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => setEventFilter('shared')}
        >
          Shared with me
        </button>
      </div>

      <div className="view-grid">
        <section className="panel">
          <header className="panel-header">
            <h3>
              {editing
                ? editing.isOwner
                  ? 'Edit event'
                  : 'Event details'
                : 'New event'}
            </h3>
            <p>
              {editing && !editing.isOwner
                ? `Shared with you by ${editing.ownerEmail || 'another member'}`
                : 'Capture the key constraints: time, place and budget.'}
            </p>
          </header>
          {editing && !editing.isOwner ? (
            <div className="event-readonly">
              <div className="readonly-row">
                <span className="readonly-label">Event</span>
                <span>{editing.name}</span>
              </div>
              <div className="readonly-row">
                <span className="readonly-label">Date</span>
                <span>{editing.date || 'TBC'}</span>
              </div>
              <div className="readonly-row">
                <span className="readonly-label">Location</span>
                <span>{editing.location || 'TBC'}</span>
              </div>
              <div className="readonly-row">
                <span className="readonly-label">Priority</span>
                <span>{editing.priority}</span>
              </div>
              <div className="readonly-row">
                <span className="readonly-label">Status</span>
                <span>{editing.status}</span>
              </div>
              <div className="readonly-row">
                <span className="readonly-label">Public calendar</span>
                <span>{editing.publicOnCalendar ? 'Listed publicly' : 'Not listed'}</span>
              </div>
              <div className="readonly-row">
                <span className="readonly-label">Budget</span>
                <span>${editing.budgetAllocated.toLocaleString()}</span>
              </div>
              {editing.members?.length ? (
                <div className="readonly-row">
                  <span className="readonly-label">Members</span>
                  <span>{editing.members.join(', ')}</span>
                </div>
              ) : null}
              <button type="button" className="btn ghost" onClick={() => setEditingId(undefined)}>
                Close
              </button>
            </div>
          ) : (
          <form
            className="form"
            onSubmit={handleSubmit}
            key={editing?.id ?? 'new-event'}
          >
            <label>
              <span>Event name</span>
              <input
                name="name"
                defaultValue={editing?.name}
                placeholder="RoboCup regional qualifier"
                required
              />
            </label>
            <div className="form-row">
              <label>
                <span>Date</span>
                <input name="date" type="date" defaultValue={editing?.date} />
              </label>
              <label>
                <span>Location</span>
                <input
                  name="location"
                  defaultValue={editing?.location}
                  placeholder="Engineering building lab"
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                <span>Priority</span>
                <select
                  name="priority"
                  defaultValue={editing?.priority ?? 'medium'}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                <span>Status</span>
                <select name="status" defaultValue={editing?.status ?? 'planning'}>
                  <option value="planning">Planning</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
            </div>
            <label>
              <span>Allocated budget (AUD)</span>
              <input
                name="budgetAllocated"
                type="number"
                min={0}
                defaultValue={editing?.budgetAllocated ?? 0}
              />
            </label>
            <label className="form-checkbox">
              <input
                type="checkbox"
                name="publicOnCalendar"
                defaultChecked={editing?.publicOnCalendar ?? false}
              />
              <span>
                Show on public calendar (name, date and location only — for visitors on the home
                page)
              </span>
            </label>
            <label>
              <span>Team members</span>
              <p className="form-hint">Add collaborators by email to involve them in this event.</p>
              <div className="members-input-row">
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMember())}
                  placeholder="teammate@university.edu"
                />
                <button type="button" className="btn primary" onClick={addMember}>
                  Add
                </button>
              </div>
              {members.length > 0 && (
                <ul className="members-list">
                  {members.map((email) => (
                    <li key={email} className="member-chip">
                      <span>{email}</span>
                      {memberStatus[email] && (
                        <span className={`member-badge ${memberStatus[email]}`} title={memberStatus[email] === 'registered' ? 'Registered user' : 'Invited (not yet registered)'}>
                          {memberStatus[email] === 'registered' ? '✓' : '○'}
                        </span>
                      )}
                      <button
                        type="button"
                        className="member-remove"
                        onClick={() => removeMember(email)}
                        aria-label={`Remove ${email}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </label>
            <div className="form-actions form-actions-spread">
              <div className="form-actions-left">
                {editing && (
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => void handleDeleteEvent()}
                  >
                    Delete event
                  </button>
                )}
              </div>
              <div className="form-actions-right">
                {editing && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setEditingId(undefined)}
                  >
                    Cancel
                  </button>
                )}
                <button type="submit" className="btn primary">
                  {editing ? 'Save changes' : 'Add event'}
                </button>
              </div>
            </div>
          </form>
          )}
        </section>

        <section className="panel">
          <header className="panel-header">
            <h3>Event list</h3>
            <p>Tap an event to view or edit. Only owners can change details.</p>
          </header>
          {filteredEvents.length === 0 ? (
            <p className="empty-state">
              {eventFilter === 'shared'
                ? 'No events shared with you yet.'
                : eventFilter === 'mine'
                  ? 'Create your first event to get started.'
                  : 'No events yet. Create one or get added to a shared event.'}
            </p>
          ) : (
            <ul className="list">
              {filteredEvents
                .slice()
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((e) => (
                  <li
                    key={e.id}
                    className={
                      editingId === e.id ? 'list-row selectable selected' : 'list-row selectable'
                    }
                    onClick={() => setEditingId(e.id)}
                  >
                    <div>
                      <div className="list-title">{e.name}</div>
                      <div className="list-meta">
                        <span>{e.date || 'Date TBC'}</span>
                        <span>{e.location || 'Location TBC'}</span>
                        {e.members?.length ? (
                          <span className="members-count">{e.members.length} member{e.members.length !== 1 ? 's' : ''}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="badge-column">
                      {!e.isOwner && <span className="badge shared">Shared</span>}
                      {e.publicOnCalendar && (
                        <span className="badge subtle" title="Shown on public home calendar">
                          Public
                        </span>
                      )}
                      <span className={`badge ${e.priority}`}>{e.priority}</span>
                      <span className="badge subtle">{e.status}</span>
                      <span className="badge subtle">
                        ${e.budgetAllocated.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

interface TasksViewProps {
  events: ClubEvent[]
  tasks: Task[]
  onAddTask: (task: Omit<Task, 'id' | 'completed'>) => Promise<void>
  onToggleTask: (id: string) => Promise<void>
}

function TasksView({ events, tasks, onAddTask, onToggleTask }: TasksViewProps) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const payload: Omit<Task, 'id' | 'completed'> = {
      title: (data.get('title') as string) || '',
      assignee: (data.get('assignee') as string) || '',
      dueDate: (data.get('dueDate') as string) || '',
      eventId: (data.get('eventId') as string) || '',
      priority: (data.get('priority') as Priority) || 'medium',
    }
    onAddTask(payload)
    form.reset()
  }

  const sorted = tasks
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h2>Tasks & collaboration</h2>
          <p>
            Assign build, software, sponsorship and logistics responsibilities
            across the team.
          </p>
        </div>
      </header>

      <div className="view-grid">
        <section className="panel">
          <header className="panel-header">
            <h3>New task</h3>
            <p>Attach tasks to events to keep context clear.</p>
          </header>
          <form className="form" onSubmit={handleSubmit}>
            <label>
              <span>Task title</span>
              <input
                name="title"
                placeholder="Design shooter wheel mounting"
                required
              />
            </label>
            <div className="form-row">
              <label>
                <span>Assignee</span>
                <input name="assignee" placeholder="Mechanical subteam" />
              </label>
              <label>
                <span>Due date</span>
                <input name="dueDate" type="date" />
              </label>
            </div>
            <div className="form-row">
              <label>
                <span>Linked event</span>
                <select name="eventId" defaultValue="">
                  <option value="">General club work</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Priority</span>
                <select name="priority" defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn primary">
                Add task
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <header className="panel-header">
            <h3>Task board</h3>
            <p>Click to mark work complete as the build progresses.</p>
          </header>
          {sorted.length === 0 ? (
            <p className="empty-state">
              No tasks yet. Capture mechanical, electrical, software and admin
              work here.
            </p>
          ) : (
            <ul className="list">
              {sorted.map((t) => {
                const event = events.find((e) => e.id === t.eventId)
                return (
                  <li
                    key={t.id}
                    className={
                      t.completed ? 'list-row completed selectable' : 'list-row selectable'
                    }
                    onClick={() => onToggleTask(t.id)}
                  >
                    <div>
                      <div className="list-title">{t.title}</div>
                      <div className="list-meta">
                        <span>{t.assignee || 'Unassigned'}</span>
                        <span>{t.dueDate || 'No deadline'}</span>
                        {event && <span>{event.name}</span>}
                      </div>
                    </div>
                    <span className={`badge ${t.priority}`}>
                      {t.completed ? 'Done' : t.priority}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

interface BudgetViewProps {
  events: ClubEvent[]
  items: BudgetItem[]
  onAddItem: (item: Omit<BudgetItem, 'id' | 'spent'>) => Promise<void>
  onToggleSpent: (id: string) => Promise<void>
}

function BudgetView({ events, items, onAddItem, onToggleSpent }: BudgetViewProps) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const payload: Omit<BudgetItem, 'id' | 'spent'> = {
      label: (data.get('label') as string) || '',
      amount: Number(data.get('amount') || 0),
      eventId: (data.get('eventId') as string) || '',
    }
    onAddItem(payload)
    form.reset()
  }

  const groupedByEvent = new Map<string, BudgetItem[]>()
  items.forEach((item) => {
    const key = item.eventId || 'general'
    const list = groupedByEvent.get(key) ?? []
    list.push(item)
    groupedByEvent.set(key, list)
  })

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h2>Budgeting</h2>
          <p>
            Track sponsorship money, university grants and line‑item spend by
            event.
          </p>
        </div>
      </header>

      <div className="view-grid">
        <section className="panel">
          <header className="panel-header">
            <h3>New budget item</h3>
            <p>Capture hardware, fabrication, travel and marketing costs.</p>
          </header>
          <form className="form" onSubmit={handleSubmit}>
            <label>
              <span>Item</span>
              <input
                name="label"
                placeholder="Aluminium box section (3m)"
                required
              />
            </label>
            <div className="form-row">
              <label>
                <span>Estimated amount (AUD)</span>
                <input
                  name="amount"
                  type="number"
                  min={0}
                  step={10}
                  required
                />
              </label>
              <label>
                <span>Event</span>
                <select name="eventId" defaultValue="">
                  <option value="">General club budget</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn primary">
                Add item
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <header className="panel-header">
            <h3>Budget breakdown</h3>
            <p>Toggle items as spent once invoices land.</p>
          </header>
          {items.length === 0 ? (
            <p className="empty-state">
              No budget items yet. Add expected spend so you can compare against
              allocated budgets.
            </p>
          ) : (
            <div className="stacked">
              {Array.from(groupedByEvent.entries()).map(([key, list]) => {
                const event = events.find((e) => e.id === key)
                const total = list.reduce((sum, i) => sum + i.amount, 0)
                const spent = list
                  .filter((i) => i.spent)
                  .reduce((sum, i) => sum + i.amount, 0)
                return (
                  <div key={key} className="subpanel">
                    <div className="subpanel-header">
                      <div className="subpanel-title">
                        {event ? event.name : 'General club budget'}
                      </div>
                      <div className="subpanel-meta">
                        <span>
                          Planned: ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span>
                          Spent:{' '}
                          ${spent.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>
                    <ul className="list compact">
                      {list.map((item) => (
                        <li
                          key={item.id}
                          className={
                            item.spent ? 'list-row completed selectable' : 'list-row selectable'
                          }
                          onClick={() => onToggleSpent(item.id)}
                        >
                          <div>
                            <div className="list-title">{item.label}</div>
                          </div>
                          <span className="badge subtle">
                            ${item.amount.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

interface SafetyViewProps {
  events: ClubEvent[]
  tasks: Task[]
}

function SafetyView({ events, tasks }: SafetyViewProps) {
  const eventSummaries = events.map((e) => {
    const relatedTasks = tasks.filter((t) => t.eventId === e.id)
    const safetyTasks = relatedTasks.filter((t) =>
      /risk|safety|induction|ppe|first aid/i.test(t.title),
    )
    const logisticsTasks = relatedTasks.filter((t) =>
      /transport|venue|booking|catering|travel/i.test(t.title),
    )
    return {
      event: e,
      safetyTasks,
      logisticsTasks,
    }
  })

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h2>Safety & logistics</h2>
          <p>
            Make sure risk assessments, inductions and transport are locked in
            before each event.
          </p>
        </div>
      </header>

      <section className="panel">
        <header className="panel-header">
          <h3>Health, safety & transport checklist</h3>
          <p>
            Use this as a high‑level dashboard. Create detailed actions in the
            Tasks tab.
          </p>
        </header>

        {events.length === 0 ? (
          <p className="empty-state">
            Create at least one event to start tracking safety and logistics.
          </p>
        ) : (
          <div className="stacked">
            {eventSummaries.map(({ event, safetyTasks, logisticsTasks }) => {
              const safetyComplete =
                safetyTasks.length > 0 &&
                safetyTasks.every((t) => t.completed === true)
              const logisticsComplete =
                logisticsTasks.length > 0 &&
                logisticsTasks.every((t) => t.completed === true)
              return (
                <div key={event.id} className="subpanel">
                  <div className="subpanel-header">
                    <div className="subpanel-title">{event.name}</div>
                    <div className="subpanel-meta">
                      <span>{event.date || 'Date TBC'}</span>
                      <span>{event.location || 'Location TBC'}</span>
                    </div>
                  </div>
                  <ul className="checklist">
                    <li className={safetyComplete ? 'ok' : 'pending'}>
                      <span>
                        Health & safety controls in place (risk assessment,
                        lab access, PPE, first aid)
                      </span>
                      <span className="badge subtle">
                        {safetyTasks.length === 0
                          ? 'No tasks yet'
                          : safetyComplete
                            ? 'All complete'
                            : `${safetyTasks.filter((t) => t.completed).length}/${
                                safetyTasks.length
                              } done`}
                      </span>
                    </li>
                    <li className={logisticsComplete ? 'ok' : 'pending'}>
                      <span>
                        Logistics confirmed (venue booking, bump‑in, transport,
                        return of equipment)
                      </span>
                      <span className="badge subtle">
                        {logisticsTasks.length === 0
                          ? 'No tasks yet'
                          : logisticsComplete
                            ? 'All complete'
                            : `${logisticsTasks.filter((t) => t.completed).length}/${
                                logisticsTasks.length
                              } done`}
                      </span>
                    </li>
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

interface MeetingsViewProps {
  events: ClubEvent[]
  meetings: Meeting[]
  onAddMeeting: (meeting: Omit<Meeting, 'id'>) => Promise<void>
}

function MeetingsView({ events, meetings, onAddMeeting }: MeetingsViewProps) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const payload: Omit<Meeting, 'id'> = {
      dateTime: (data.get('dateTime') as string) || '',
      location: (data.get('location') as string) || '',
      agenda: (data.get('agenda') as string) || '',
      eventId: (data.get('eventId') as string) || undefined,
    }
    onAddMeeting(payload)
    form.reset()
  }

  const sorted = meetings
    .slice()
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime))

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h2>Meetings & reminders</h2>
          <p>
            Keep design reviews, sponsor check‑ins and handover meetings
            organised.
          </p>
        </div>
      </header>

      <div className="view-grid">
        <section className="panel">
          <header className="panel-header">
            <h3>Schedule meeting</h3>
            <p>Link meetings to events to keep purpose clear.</p>
          </header>
          <form className="form" onSubmit={handleSubmit}>
            <label>
              <span>Date & time</span>
              <input name="dateTime" type="datetime-local" required />
            </label>
            <label>
              <span>Location / call link</span>
              <input
                name="location"
                placeholder="ENG 2.15 or online meeting link"
                required
              />
            </label>
            <label>
              <span>Agenda</span>
              <textarea
                name="agenda"
                rows={3}
                placeholder="Design review, sponsor update, outreach planning..."
              />
            </label>
            <label>
              <span>Related event (optional)</span>
              <select name="eventId" defaultValue="">
                <option value="">General club meeting</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button type="submit" className="btn primary">
                Add meeting
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <header className="panel-header">
            <h3>Meeting timeline</h3>
            <p>Use this as a lightweight schedule and reminder list.</p>
          </header>
          {sorted.length === 0 ? (
            <p className="empty-state">
              No meetings scheduled. Add design reviews, weekly stand‑ups and
              sponsor catch‑ups here.
            </p>
          ) : (
            <ul className="list">
              {sorted.map((m) => {
                const event = events.find((e) => e.id === m.eventId)
                return (
                  <li key={m.id} className="list-row">
                    <div>
                      <div className="list-title">
                        {event ? `${event.name} – meeting` : 'Club meeting'}
                      </div>
                      <div className="list-meta">
                        <span>{m.dateTime.replace('T', ' ')}</span>
                        <span>{m.location}</span>
                      </div>
                      {m.agenda && (
                        <div className="list-description">{m.agenda}</div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

interface ProfileViewProps {
  user: AuthUser
}

function ProfileView({ user }: ProfileViewProps) {
  const [displayName, setDisplayName] = useState(user.profile?.displayName ?? '')
  const [clubRole, setClubRole] = useState(user.profile?.clubRole ?? '')
  const [bio, setBio] = useState(user.profile?.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await authApi.updateProfile({ displayName, clubRole, bio })
      setMessage('Profile updated.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h2>Profile</h2>
          <p>Manage your account and club profile.</p>
        </div>
      </header>
      <section className="panel">
        <header className="panel-header">
          <h3>Your profile</h3>
          <p>Email: {user.email}</p>
        </header>
        <form className="form" onSubmit={handleSubmit}>
          <label>
            <span>Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </label>
          <label>
            <span>Club role</span>
            <input
              value={clubRole}
              onChange={(e) => setClubRole(e.target.value)}
              placeholder="e.g. Team Lead, Treasurer"
            />
          </label>
          <label>
            <span>Bio</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A bit about you..."
              rows={3}
            />
          </label>
          {message && (
            <div className={message === 'Profile updated.' ? 'form-message success' : 'auth-error'}>
              {message}
            </div>
          )}
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

