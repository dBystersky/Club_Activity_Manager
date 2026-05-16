import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { DashboardCalendar } from './components/DashboardCalendar'
import { PlanningAlerts } from './components/PlanningAlerts'
import { UsersAdminPanel } from './components/UsersAdminPanel'
import { InventoryPanel } from './components/InventoryPanel'
import {
  ResourceAssignPicker,
  lockedResourcesForOtherEvents,
  lockedResourcesForTaskContext,
} from './components/ResourceAssignPicker'
import {
  activitiesApi,
  authApi,
  getToken,
  setToken,
  type AuthUser,
  type EventDoc,
  type TaskDoc,
  type BudgetItemDoc,
  type ResourceDoc,
} from './api'
import {
  analyzeEventConflicts,
  analyzeTaskConflicts,
  type PlanningIssue,
} from './planningConflicts'
import {
  canAddBudgetLineItems,
  canCreateTasks,
  canEditEventCollaborators,
  canManageClubAccounts,
  canManageInventory,
  canUseEventsAndSafety,
  canViewBudgetSection,
  normalizeAccessLevel,
  type AccessLevel,
} from './permissions'
import logoImage from './assets/mdn-2-01.webp'

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
  resourceIds: string[]
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
  resourceIds: string[]
}

interface BudgetItem {
  id: string
  eventId: string
  label: string
  amount: number
  spent: boolean
}

type Tab =
  | 'dashboard'
  | 'events'
  | 'tasks'
  | 'budget'
  | 'safety'
  | 'users'
  | 'inventory'
  | 'profile'

interface PersistedState {
  events: ClubEvent[]
  tasks: Task[]
  budgetItems: BudgetItem[]
}

const emptyState: PersistedState = {
  events: [],
  tasks: [],
  budgetItems: [],
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
    resourceIds: d.resourceIds ?? [],
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
    resourceIds: d.resourceIds ?? [],
  }
}

function formatAllocatedResources(
  ids: string[] | undefined,
  catalog: ResourceDoc[],
): string {
  if (!ids?.length) return '—'
  const map = new Map(catalog.map((r) => [r.id, r.name]))
  return ids.map((id) => map.get(id) ?? id).join(', ')
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

export function PlannerApp() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [state, setState] = useState<PersistedState>(emptyState)
  const [resources, setResources] = useState<ResourceDoc[]>([])
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
      const [events, tasks, budgetItems, resourceList] = await Promise.all([
        activitiesApi.getEvents(),
        activitiesApi.getTasks(),
        activitiesApi.getBudgetItems(),
        activitiesApi.getResources(),
      ])
      setResources(resourceList)
      setState({
        events: events.map(docToEvent),
        tasks: tasks.map(docToTask),
        budgetItems: budgetItems.map(docToBudgetItem),
      })
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to load data')
      setState(emptyState)
      setResources([])
    }
  }, [user])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  useEffect(() => {
    if (!user) return
    const a = normalizeAccessLevel(user.accessLevel)
    if (a === 'member' && (tab === 'events' || tab === 'budget' || tab === 'safety')) {
      setTab('dashboard')
    }
    if (a !== 'admin' && tab === 'users') {
      setTab('dashboard')
    }
    if (a !== 'admin' && tab === 'inventory') {
      setTab('dashboard')
    }
  }, [user, tab])

  function handleLogout() {
    setToken(null)
    setUser(null)
    setState(emptyState)
    setResources([])
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

  async function upsertEvent(partial: Omit<ClubEvent, 'id'>, id?: string): Promise<ClubEvent | undefined> {
    setApiError(null)
    try {
      if (id) {
        const updated = await activitiesApi.updateEvent(id, partial)
        const ev = docToEvent(updated)
        setState((prev) => ({
          ...prev,
          events: prev.events.map((e) => (e.id === id ? ev : e)),
        }))
        return ev
      }
      const created = await activitiesApi.createEvent(partial)
      const ev = docToEvent(created)
      setState((prev) => ({
        ...prev,
        events: [...prev.events, ev],
      }))
      return ev
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to save event')
      return undefined
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

  async function deleteTask(id: string) {
    setApiError(null)
    try {
      await activitiesApi.deleteTask(id)
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== id),
      }))
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to delete task')
    }
  }

  async function updateTaskPatch(id: string, patch: Partial<Omit<TaskDoc, 'id'>>) {
    setApiError(null)
    try {
      const updated = await activitiesApi.updateTask(id, patch)
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

  const access = normalizeAccessLevel(user.accessLevel)

  const accessLabel =
    access === 'admin' ? 'Admin' : access === 'manager' ? 'Manager' : 'Member'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <img
              className="logo-slot-sidebar"
              src={logoImage}
              alt="Monash Deep Neuron logo"
            />
            <div className="sidebar-brand-text">
              <div className="sidebar-title-row">
                <h1>Monash <br />Deep Neuron</h1>
              </div>
            </div>
          </div>
          <p className="sidebar-tagline">
            Planning for deep learning and AI research groups — events, tasks, budget and logistics.
          </p>
          <p className="sidebar-user">
            {user.email}
            <span className="sidebar-access-badge">{accessLabel}</span>
          </p>
        </div>
        <nav className="sidebar-nav">
          <button
            className={tab === 'dashboard' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('dashboard')}
          >
            Overview
          </button>
          {canUseEventsAndSafety(access) && (
            <button
              className={tab === 'events' ? 'nav-item active' : 'nav-item'}
              onClick={() => setTab('events')}
            >
              Events & milestones
            </button>
          )}
          <button
            className={tab === 'tasks' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('tasks')}
          >
            Tasks & Collaboration
          </button>
          {canViewBudgetSection(access) && (
            <button
              className={tab === 'budget' ? 'nav-item active' : 'nav-item'}
              onClick={() => setTab('budget')}
            >
              Budgeting
            </button>
          )}
          {canUseEventsAndSafety(access) && (
            <button
              className={tab === 'safety' ? 'nav-item active' : 'nav-item'}
              onClick={() => setTab('safety')}
            >
              Safety & Logistics
            </button>
          )}
          {canManageClubAccounts(access) && (
            <button
              className={tab === 'users' ? 'nav-item active' : 'nav-item'}
              onClick={() => setTab('users')}
            >
              Club accounts
            </button>
          )}
          {canManageInventory(access) && (
            <button
              className={tab === 'inventory' ? 'nav-item active' : 'nav-item'}
              onClick={() => setTab('inventory')}
            >
              Inventory
            </button>
          )}
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
            resources={resources}
            upcomingEvents={upcomingEvents}
            openTasks={openTasks}
            overdueTasks={overdueTasks}
            totalAllocated={totalAllocated}
            totalPlannedSpend={totalPlannedSpend}
            memberExperience={access === 'member'}
          />
        )}
        {tab === 'events' && canUseEventsAndSafety(access) && (
          <EventsView
            events={state.events}
            tasks={state.tasks}
            resources={resources}
            userEmail={user.email}
            onUpsert={upsertEvent}
            onDelete={deleteEvent}
            onAddTask={addTask}
            onToggleTask={toggleTaskCompletion}
            onDeleteTask={deleteTask}
            onUpdateTask={updateTaskPatch}
            canCreateTasks={canCreateTasks(access)}
            canEditEventCollaborators={canEditEventCollaborators(access)}
          />
        )}
        {tab === 'tasks' && (
          <TasksView
            events={state.events}
            tasks={state.tasks}
            resources={resources}
            onAddTask={addTask}
            onToggleTask={toggleTaskCompletion}
            onUpdateTask={updateTaskPatch}
            canCreateTasks={canCreateTasks(access)}
            userEmail={user.email}
          />
        )}
        {tab === 'budget' && canViewBudgetSection(access) && (
          <BudgetView
            events={state.events}
            items={state.budgetItems}
            onAddItem={addBudgetItem}
            onToggleSpent={toggleBudgetItemSpent}
            canAddBudgetLineItems={canAddBudgetLineItems(access)}
          />
        )}
        {tab === 'safety' && canUseEventsAndSafety(access) && (
          <SafetyView events={state.events} tasks={state.tasks} />
        )}
        {tab === 'users' && canManageClubAccounts(access) && (
          <UsersAdminPanel
            currentUserId={user.id}
            onCurrentUserUpdated={(u) => setUser(u)}
          />
        )}
        {tab === 'inventory' && canManageInventory(access) && (
          <InventoryPanel
            resources={resources}
            onChanged={() => void loadData()}
            onError={setApiError}
          />
        )}
        {tab === 'profile' && <ProfileView user={user} access={access} />}
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
  resources: ResourceDoc[]
  upcomingEvents: ClubEvent[]
  openTasks: Task[]
  overdueTasks: Task[]
  totalAllocated: number
  totalPlannedSpend: number
  memberExperience?: boolean
}

function DashboardView({
  events,
  tasks,
  resources,
  upcomingEvents,
  openTasks,
  overdueTasks,
  totalAllocated,
  totalPlannedSpend,
  memberExperience = false,
}: DashboardProps) {
  return (
    <div className="panel-grid">
      <DashboardCalendar events={events} tasks={tasks} />
      <section className="panel">
        <header className="panel-header">
          <h2>Upcoming events</h2>
          <p>Workshops, reading groups and outreach sessions.</p>
        </header>
        {upcomingEvents.length === 0 ? (
          <p className="empty-state">
            {memberExperience
              ? 'No upcoming events yet. When a lead adds you to an event, it will show here and on the calendar.'
              : 'No events yet. Start by adding your next workshop, milestone or deadline.'}
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
                    {e.resourceIds?.length ? (
                      <span title={formatAllocatedResources(e.resourceIds, resources)}>
                        Resources: {formatAllocatedResources(e.resourceIds, resources)}
                      </span>
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
            {memberExperience
              ? 'No open tasks assigned to you. Ask your lead to set the assignee field to your email when they create a task.'
              : 'No open tasks. Add experiments, writing, compute logistics or sponsor outreach tasks to get started.'}
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
                    {t.resourceIds?.length ? (
                      <span title={formatAllocatedResources(t.resourceIds, resources)}>
                        Resources: {formatAllocatedResources(t.resourceIds, resources)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className={`badge ${t.priority}`}>{t.priority}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!memberExperience && (
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
      )}
      {memberExperience && overdueTasks.length > 0 && (
        <section className="panel span-2">
          <div className="alert">
            <strong>{overdueTasks.length} overdue task(s)</strong> – check due dates for work assigned to you.
          </div>
        </section>
      )}
    </div>
  )
}

interface EventsViewProps {
  events: ClubEvent[]
  tasks: Task[]
  resources: ResourceDoc[]
  userEmail: string
  onUpsert: (partial: Omit<ClubEvent, 'id'>, id?: string) => Promise<ClubEvent | undefined>
  onDelete: (id: string) => Promise<void>
  onAddTask: (partial: Omit<Task, 'id' | 'completed'>) => Promise<void>
  onToggleTask: (id: string) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>
  onUpdateTask: (id: string, patch: Partial<Omit<TaskDoc, 'id'>>) => Promise<void>
  canCreateTasks: boolean
  canEditEventCollaborators: boolean
}

type EventFilter = 'all' | 'mine' | 'shared'

interface EventSubtasksPanelProps {
  eventId: string
  tasks: Task[]
  events: ClubEvent[]
  resources: ResourceDoc[]
  userEmail: string
  canCreateTasks: boolean
  onAddTask: (partial: Omit<Task, 'id' | 'completed'>) => Promise<void>
  onToggleTask: (id: string) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>
  onUpdateTask: (id: string, patch: Partial<Omit<TaskDoc, 'id'>>) => Promise<void>
}

function EventSubtasksPanel({
  eventId,
  tasks,
  events,
  resources,
  userEmail,
  canCreateTasks,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onUpdateTask,
}: EventSubtasksPanelProps) {
  const [subTitle, setSubTitle] = useState('')
  const [subAssignee, setSubAssignee] = useState('')
  const [subDue, setSubDue] = useState('')
  const [subResourceIds, setSubResourceIds] = useState<string[]>([])
  const [subIssues, setSubIssues] = useState<PlanningIssue[]>([])
  const [resourcesEditorTaskId, setResourcesEditorTaskId] = useState<string | null>(null)
  const [editorResourceIds, setEditorResourceIds] = useState<string[]>([])

  const subtasks = useMemo(() => {
    return tasks
      .filter((t) => t.eventId === eventId)
      .slice()
      .sort((a, b) => {
        const da = a.dueDate || ''
        const db = b.dueDate || ''
        if (da !== db) return da.localeCompare(db)
        return a.title.localeCompare(b.title)
      })
  }, [tasks, eventId])

  const me = userEmail.trim().toLowerCase()

  function rowCanToggle(task: Task): boolean {
    if (canCreateTasks) return true
    const a = (task.assignee || '').trim().toLowerCase()
    return Boolean(a && a === me)
  }

  function openSubtaskResourceEditor(taskId: string) {
    const t = tasks.find((x) => x.id === taskId)
    setResourcesEditorTaskId(taskId)
    setEditorResourceIds(t?.resourceIds?.slice() ?? [])
  }

  async function handleAddSubtask(e: React.FormEvent) {
    e.preventDefault()
    const title = subTitle.trim()
    if (!title) return
    const payload: Omit<Task, 'id' | 'completed'> = {
      title,
      assignee: subAssignee.trim(),
      dueDate: subDue,
      eventId,
      priority: 'medium',
      resourceIds: subResourceIds.slice(),
    }
    const issues = analyzeTaskConflicts(payload, { tasks, events })
    setSubIssues(issues)
    if (issues.some((i) => i.severity === 'conflict')) return
    await onAddTask(payload)
    setSubTitle('')
    setSubAssignee('')
    setSubDue('')
    setSubResourceIds([])
    setSubIssues([])
  }

  async function handleRemoveSubtask(id: string) {
    const ok = window.confirm('Remove this subtask from the event?')
    if (!ok) return
    await onDeleteTask(id)
    if (resourcesEditorTaskId === id) {
      setResourcesEditorTaskId(null)
    }
  }

  async function saveSubtaskResources() {
    if (!resourcesEditorTaskId) return
    await onUpdateTask(resourcesEditorTaskId, { resourceIds: editorResourceIds.slice() })
    setResourcesEditorTaskId(null)
  }

  const editingTaskTitle = resourcesEditorTaskId
    ? subtasks.find((t) => t.id === resourcesEditorTaskId)?.title
    : undefined

  return (
    <div className="event-subtasks-panel">
      <div className="subpanel-header">
        <div className="subpanel-title">Event subtasks</div>
        <div className="subpanel-meta">
          {canCreateTasks
            ? 'Create assignments scoped to this milestone.'
            : 'Click a row assigned to you to mark it complete.'}
        </div>
      </div>

      {canCreateTasks && (
        <form className="form" onSubmit={(e) => void handleAddSubtask(e)}>
          <PlanningAlerts issues={subIssues} />
          <label>
            <span>Subtask title</span>
            <input
              value={subTitle}
              onChange={(e) => setSubTitle(e.target.value)}
              placeholder="e.g. Finish SLURM sweep for baseline"
              required
            />
          </label>
          <div className="form-row">
            <label>
              <span>Assignee</span>
              <input
                value={subAssignee}
                onChange={(e) => setSubAssignee(e.target.value)}
                placeholder="researcher@student.monash.edu"
              />
            </label>
            <label>
              <span>Due date</span>
              <input value={subDue} onChange={(e) => setSubDue(e.target.value)} type="date" />
            </label>
          </div>
          <ResourceAssignPicker
            resources={resources}
            value={subResourceIds}
            onChange={setSubResourceIds}
            lockedByOtherEvents={lockedResourcesForTaskContext(events, eventId)}
            hint="Search to attach inventory for this subtask."
          />
          <div className="form-actions">
            <button type="submit" className="btn primary">
              Add subtask
            </button>
          </div>
        </form>
      )}

      {subtasks.length === 0 ? (
        <p className="empty-state">
          {canCreateTasks
            ? 'No subtasks yet. Break this milestone into concrete assignments above.'
            : 'No subtasks for this event yet.'}
        </p>
      ) : (
        <ul className="list compact">
          {subtasks.map((t) => (
            <li
              key={t.id}
              className={
                rowCanToggle(t)
                  ? t.completed
                    ? 'list-row completed selectable'
                    : 'list-row selectable'
                  : 'list-row'
              }
            >
              <div
                className="subtask-row-main"
                onClick={() => {
                  if (rowCanToggle(t)) void onToggleTask(t.id)
                }}
                role={rowCanToggle(t) ? 'button' : undefined}
              >
                <div className="list-title">{t.title}</div>
                <div className="list-meta">
                  <span>{t.assignee || 'Unassigned'}</span>
                  <span>{t.dueDate || 'No deadline'}</span>
                  {t.resourceIds?.length ? (
                    <span>{formatAllocatedResources(t.resourceIds, resources)}</span>
                  ) : null}
                </div>
              </div>
              <div className="badge-row">
                <span className={`badge ${t.priority}`}>{t.completed ? 'Done' : t.priority}</span>
                {canCreateTasks ? (
                  <>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        if (resourcesEditorTaskId === t.id) {
                          setResourcesEditorTaskId(null)
                          return
                        }
                        openSubtaskResourceEditor(t.id)
                      }}
                    >
                      {resourcesEditorTaskId === t.id ? 'Close' : 'Resources'}
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => void handleRemoveSubtask(t.id)}
                    >
                      Remove
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canCreateTasks && resourcesEditorTaskId && (
        <div className="task-resources-editor">
          <p className="form-static-label">
            Assign resources — {editingTaskTitle ?? 'Subtask'}
          </p>
          <ResourceAssignPicker
            resources={resources}
            value={editorResourceIds}
            onChange={setEditorResourceIds}
            lockedByOtherEvents={lockedResourcesForTaskContext(events, eventId)}
            hint="Adjust allocations for this subtask."
          />
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => setResourcesEditorTaskId(null)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={() => void saveSubtaskResources()}>
              Save resources
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EventsView({
  events,
  tasks,
  resources,
  userEmail,
  onUpsert,
  onDelete,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onUpdateTask,
  canCreateTasks,
  canEditEventCollaborators,
}: EventsViewProps) {
  const [editingId, setEditingId] = useState<string | undefined>()
  const [members, setMembers] = useState<string[]>([])
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [memberStatus, setMemberStatus] = useState<Record<string, 'registered' | 'invited'>>({})
  const [eventFilter, setEventFilter] = useState<EventFilter>('all')
  const editing = events.find((e) => e.id === editingId)
  const eventFormRef = useRef<HTMLFormElement>(null)
  const [planIssues, setPlanIssues] = useState<PlanningIssue[]>([])
  const [eventResourceDraft, setEventResourceDraft] = useState<string[]>([])

  useEffect(() => {
    setEventResourceDraft(editing?.resourceIds?.slice() ?? [])
  }, [editing?.id])

  const buildEventPayloadFromForm = useCallback(
    (data: FormData): Omit<ClubEvent, 'id'> => ({
      name: (data.get('name') as string) || '',
      date: (data.get('date') as string) || '',
      location: (data.get('location') as string) || '',
      priority: (data.get('priority') as Priority) || 'medium',
      status: (data.get('status') as EventStatus) || 'planning',
      budgetAllocated: Number(data.get('budgetAllocated') || 0),
      members,
      resourceIds: eventResourceDraft.slice(),
      isOwner: true,
      publicOnCalendar: data.get('publicOnCalendar') === 'on',
    }),
    [members, eventResourceDraft],
  )

  const runEventPlanCheck = useCallback(() => {
    const form = eventFormRef.current
    if (!form) return
    const data = new FormData(form)
    const payload = buildEventPayloadFromForm(data)
    setPlanIssues(
      analyzeEventConflicts(payload, {
        events,
        excludeEventId: editing?.id,
      }),
    )
  }, [buildEventPayloadFromForm, events, editing?.id])

  useEffect(() => {
    if (editing && !editing.isOwner) {
      setPlanIssues([])
      return
    }
    const id = requestAnimationFrame(() => runEventPlanCheck())
    return () => cancelAnimationFrame(id)
  }, [editing?.isOwner, editing?.id, editingId, events, members, eventResourceDraft, runEventPlanCheck])

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
    if (!canEditEventCollaborators) return
    if (members.length === 0) return
    members.forEach((email) => {
      if (requestedEmails.current.has(email)) return
      requestedEmails.current.add(email)
      authApi.checkEmail(email).then(
        (r) => setMemberStatus((s) => ({ ...s, [email]: r.registered ? 'registered' : 'invited' })),
        () => setMemberStatus((s) => ({ ...s, [email]: 'invited' }))
      )
    })
  }, [members, canEditEventCollaborators])

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const payload = buildEventPayloadFromForm(data)
    const issues = analyzeEventConflicts(payload, {
      events,
      excludeEventId: editing?.id,
    })
    setPlanIssues(issues)
    if (issues.some((i) => i.severity === 'conflict')) return
    const saved = await onUpsert(payload, editing?.id)
    if (saved) {
      setEditingId(saved.id)
      setMembers(saved.members ?? [])
      setEventResourceDraft(saved.resourceIds ?? [])
    }
    setPlanIssues([])
  }

  async function handleDeleteEvent() {
    if (!editing?.id) return
    const ok = window.confirm(
      'Delete this event permanently? Subtasks, budget items and other data linked to it will be removed.',
    )
    if (!ok) return
    try {
      await onDelete(editing.id)
      setEditingId(undefined)
      setMembers([])
      setEventResourceDraft([])
      setPlanIssues([])
    } catch {
      /* apiError set in parent */
    }
  }

  const eventHasConflicts = planIssues.some((i) => i.severity === 'conflict')

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h2>Events & milestones</h2>
          <p>
            Plan journal clubs, experiments, recruitment nights and outreach sessions
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
              <div className="readonly-row">
                <span className="readonly-label">Resources</span>
                <span>{formatAllocatedResources(editing.resourceIds, resources)}</span>
              </div>
              <EventSubtasksPanel
                eventId={editing.id}
                tasks={tasks}
                events={events}
                resources={resources}
                userEmail={userEmail}
                canCreateTasks={canCreateTasks}
                onAddTask={onAddTask}
                onToggleTask={onToggleTask}
                onDeleteTask={onDeleteTask}
                onUpdateTask={onUpdateTask}
              />
              <button type="button" className="btn ghost" onClick={() => setEditingId(undefined)}>
                Close
              </button>
            </div>
          ) : (
          <>
          <form
            ref={eventFormRef}
            className="form"
            onChange={runEventPlanCheck}
            onSubmit={handleSubmit}
            key={editing?.id ?? 'new-event'}
          >
            <PlanningAlerts issues={planIssues} />
            <label>
              <span>Event name</span>
              <input
                name="name"
                defaultValue={editing?.name}
                placeholder="NeurIPS workshop dry run"
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
                  placeholder="GPU lab / hybrid Zoom"
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
            <ResourceAssignPicker
              resources={resources}
              value={eventResourceDraft}
              onChange={setEventResourceDraft}
              lockedByOtherEvents={lockedResourcesForOtherEvents(events, editing?.id)}
              hint="Search and assign inventory. Each item may belong to only one active event until that event is completed."
            />
            {canEditEventCollaborators ? (
            <label>
              <span>Team members</span>
              <p className="form-hint">Add collaborators by email to involve them in this event.</p>
              <div className="members-input-row">
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMember())}
                  placeholder="collaborator@university.edu"
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
            ) : (
            <div className="form-static-block">
              <span className="form-static-label">Team members</span>
              <p className="form-hint">
                Only club admins can add or remove collaborators. Contact an admin if someone else
                should be on this event.
              </p>
              {members.length > 0 ? (
                <ul className="members-list members-list-readonly">
                  {members.map((email) => (
                    <li key={email} className="member-chip">
                      <span>{email}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="form-hint">No collaborators listed for this event.</p>
              )}
            </div>
            )}
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
                <button type="submit" className="btn primary" disabled={eventHasConflicts}>
                  {editing ? 'Save changes' : 'Add event'}
                </button>
              </div>
            </div>
          </form>
          {editing?.id ? (
            <EventSubtasksPanel
              eventId={editing.id}
              tasks={tasks}
              events={events}
              resources={resources}
              userEmail={userEmail}
              canCreateTasks={canCreateTasks}
              onAddTask={onAddTask}
              onToggleTask={onToggleTask}
              onDeleteTask={onDeleteTask}
              onUpdateTask={onUpdateTask}
            />
          ) : (
            <p className="form-hint event-subtasks-hint">
              Save the event first to add subtasks assigned to this milestone.
            </p>
          )}
          </>
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
  resources: ResourceDoc[]
  onAddTask: (task: Omit<Task, 'id' | 'completed'>) => Promise<void>
  onToggleTask: (id: string) => Promise<void>
  onUpdateTask: (id: string, patch: Partial<Omit<TaskDoc, 'id'>>) => Promise<void>
  canCreateTasks: boolean
  userEmail: string
}

function TasksView({
  events,
  tasks,
  resources,
  onAddTask,
  onToggleTask,
  onUpdateTask,
  canCreateTasks,
  userEmail,
}: TasksViewProps) {
  const taskFormRef = useRef<HTMLFormElement>(null)
  const [taskPlanIssues, setTaskPlanIssues] = useState<PlanningIssue[]>([])
  const [resourcesEditTaskId, setResourcesEditTaskId] = useState<string | null>(null)
  const [draftResourceIds, setDraftResourceIds] = useState<string[]>([])
  const [linkedEventDraft, setLinkedEventDraft] = useState('')
  const [newTaskResources, setNewTaskResources] = useState<string[]>([])

  const runTaskPlanCheck = useCallback(() => {
    const form = taskFormRef.current
    if (!form) return
    const data = new FormData(form)
    const payload: Omit<Task, 'id' | 'completed'> = {
      title: (data.get('title') as string) || '',
      assignee: (data.get('assignee') as string) || '',
      dueDate: (data.get('dueDate') as string) || '',
      eventId: linkedEventDraft,
      priority: (data.get('priority') as Priority) || 'medium',
      resourceIds: newTaskResources.slice(),
    }
    setTaskPlanIssues(analyzeTaskConflicts(payload, { tasks, events }))
  }, [tasks, events, linkedEventDraft, newTaskResources])

  useEffect(() => {
    const id = requestAnimationFrame(() => runTaskPlanCheck())
    return () => cancelAnimationFrame(id)
  }, [tasks, events, runTaskPlanCheck, linkedEventDraft, newTaskResources])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const payload: Omit<Task, 'id' | 'completed'> = {
      title: (data.get('title') as string) || '',
      assignee: (data.get('assignee') as string) || '',
      dueDate: (data.get('dueDate') as string) || '',
      eventId: linkedEventDraft,
      priority: (data.get('priority') as Priority) || 'medium',
      resourceIds: newTaskResources.slice(),
    }
    const issues = analyzeTaskConflicts(payload, { tasks, events })
    setTaskPlanIssues(issues)
    if (issues.some((i) => i.severity === 'conflict')) return
    await onAddTask(payload)
    form.reset()
    setLinkedEventDraft('')
    setNewTaskResources([])
    requestAnimationFrame(() => runTaskPlanCheck())
  }

  const taskHasConflicts = taskPlanIssues.some((i) => i.severity === 'conflict')

  const sorted = tasks
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  const me = userEmail.trim().toLowerCase()

  function taskRowCanToggle(t: Task): boolean {
    if (canCreateTasks) return true
    const a = (t.assignee || '').trim().toLowerCase()
    return Boolean(a && a === me)
  }

  function openTaskResourceEditor(taskId: string) {
    const t = tasks.find((x) => x.id === taskId)
    setResourcesEditTaskId(taskId)
    setDraftResourceIds(t?.resourceIds?.slice() ?? [])
  }

  async function saveTaskResources() {
    if (!resourcesEditTaskId) return
    await onUpdateTask(resourcesEditTaskId, { resourceIds: draftResourceIds.slice() })
    setResourcesEditTaskId(null)
  }

  const editingBoardTaskTitle = resourcesEditTaskId
    ? sorted.find((t) => t.id === resourcesEditTaskId)?.title
    : undefined

  const editingLockTask = resourcesEditTaskId
    ? sorted.find((t) => t.id === resourcesEditTaskId)
    : undefined

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h2>Tasks & collaboration</h2>
          <p>
            Assign modeling, experiments, writing and logistics responsibilities
            across the team.
          </p>
        </div>
      </header>

      <div className="view-grid">
        {canCreateTasks && (
        <section className="panel">
          <header className="panel-header">
            <h3>New task</h3>
            <p>Attach tasks to events to keep context clear.</p>
          </header>
          <form
            ref={taskFormRef}
            className="form"
            onChange={runTaskPlanCheck}
            onSubmit={handleSubmit}
          >
            <PlanningAlerts issues={taskPlanIssues} />
            <label>
              <span>Task title</span>
              <input
                name="title"
                placeholder="Ablation study on attention depth"
                required
              />
            </label>
            <div className="form-row">
              <label>
                <span>Assignee</span>
                <input name="assignee" placeholder="researcher@student.monash.edu" />
              </label>
              <label>
                <span>Due date</span>
                <input name="dueDate" type="date" />
              </label>
            </div>
            <div className="form-row">
              <label>
                <span>Linked event</span>
                <select
                  value={linkedEventDraft}
                  onChange={(e) => setLinkedEventDraft(e.target.value)}
                  aria-label="Linked event"
                >
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
            <ResourceAssignPicker
              resources={resources}
              value={newTaskResources}
              onChange={setNewTaskResources}
              lockedByOtherEvents={lockedResourcesForTaskContext(events, linkedEventDraft)}
              hint="Attach inventory by search. Items booked on another active event appear only if this task links to that event."
            />
            <p className="form-hint">
              Use a teammate&apos;s account email as assignee so members can see the task and mark it
              complete.
            </p>
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={taskHasConflicts}>
                Add task
              </button>
            </div>
          </form>
        </section>
        )}

        <section className="panel">
          <header className="panel-header">
            <h3>Task board</h3>
            <p>
              {canCreateTasks
                ? 'Click the task row to toggle completion. Use Resources to assign inventory.'
                : `Tasks where the assignee is your email (${userEmail}) appear here.`}
            </p>
          </header>
          {sorted.length === 0 ? (
            <p className="empty-state">
              No tasks yet. Capture experiments, evaluation, writing and admin
              work here.
            </p>
          ) : (
            <>
              <ul className="list">
                {sorted.map((t) => {
                  const event = events.find((e) => e.id === t.eventId)
                  const toggles = taskRowCanToggle(t)
                  return (
                    <li
                      key={t.id}
                      className={
                        toggles
                          ? t.completed
                            ? 'list-row completed selectable'
                            : 'list-row selectable'
                          : 'list-row'
                      }
                    >
                      <div
                        className="task-board-row-main"
                        onClick={() => {
                          if (toggles) void onToggleTask(t.id)
                        }}
                        role={toggles ? 'button' : undefined}
                      >
                        <div className="list-title">{t.title}</div>
                        <div className="list-meta">
                          <span>{t.assignee || 'Unassigned'}</span>
                          <span>{t.dueDate || 'No deadline'}</span>
                          {event && <span>{event.name}</span>}
                          {t.resourceIds?.length ? (
                            <span title={formatAllocatedResources(t.resourceIds, resources)}>
                              Resources: {formatAllocatedResources(t.resourceIds, resources)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {canCreateTasks ? (
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            if (resourcesEditTaskId === t.id) {
                              setResourcesEditTaskId(null)
                              return
                            }
                            openTaskResourceEditor(t.id)
                          }}
                        >
                          {resourcesEditTaskId === t.id ? 'Close' : 'Resources'}
                        </button>
                      ) : null}
                      <span className={`badge ${t.priority}`}>
                        {t.completed ? 'Done' : t.priority}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {canCreateTasks && resourcesEditTaskId && (
                <div className="task-resources-editor">
                  <p className="form-static-label">
                    Assign resources — {editingBoardTaskTitle ?? 'Task'}
                  </p>
                  <ResourceAssignPicker
                    resources={resources}
                    value={draftResourceIds}
                    onChange={setDraftResourceIds}
                    lockedByOtherEvents={lockedResourcesForTaskContext(
                      events,
                      editingLockTask?.eventId ?? '',
                    )}
                    hint="Same availability rules as when creating a task."
                  />
                  <div className="form-actions">
                    <button type="button" className="btn ghost" onClick={() => setResourcesEditTaskId(null)}>
                      Cancel
                    </button>
                    <button type="button" className="btn primary" onClick={() => void saveTaskResources()}>
                      Save resources
                    </button>
                  </div>
                </div>
              )}
            </>
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
  canAddBudgetLineItems: boolean
}

function BudgetView({ events, items, onAddItem, onToggleSpent, canAddBudgetLineItems }: BudgetViewProps) {
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
        {canAddBudgetLineItems ? (
        <section className="panel">
          <header className="panel-header">
            <h3>New budget item</h3>
            <p>Capture compute, data access, travel and marketing costs.</p>
          </header>
          <form className="form" onSubmit={handleSubmit}>
            <label>
              <span>Item</span>
              <input
                name="label"
                placeholder="Cloud GPU credits (monthly pool)"
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
        ) : (
        <section className="panel">
          <header className="panel-header">
            <h3>New budget item</h3>
            <p>Adding line items is limited to club admins.</p>
          </header>
          <p className="form-hint">
            You can still review planned spend below and mark items as spent once invoices are paid.
          </p>
        </section>
        )}

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

interface ProfileViewProps {
  user: AuthUser
  access: AccessLevel
}

function ProfileView({ user, access }: ProfileViewProps) {
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
          <p>
            Email: {user.email}
            <br />
            <span className="profile-access-note">
              Account access:{' '}
              {access === 'admin' ? 'Admin (full permissions)' : access === 'manager' ? 'Manager' : 'Member'}{' '}
              — this is set by your club; it is not the same as the club role field below.
            </span>
          </p>
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
              placeholder="e.g. Project lead, Reading group chair"
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

