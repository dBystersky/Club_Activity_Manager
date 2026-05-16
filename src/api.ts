const API_BASE = '/api'
const TOKEN_KEY = 'club-activity-token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`)
  }
  return data as T
}

export const authApi = {
  register: (body: {
    email: string
    password: string
    displayName?: string
    clubRole?: string
    bio?: string
  }) => request<{ user: AuthUser; token: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  login: (email: string, password: string) =>
    request<{ user: AuthUser; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: AuthUser }>('/auth/me'),
  checkEmail: (email: string) =>
    request<{ registered: boolean }>(`/auth/check-email?email=${encodeURIComponent(email)}`),
  updateProfile: (profile: { displayName?: string; clubRole?: string; bio?: string }) =>
    request<{ user: AuthUser }>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(profile),
    }),

  /** Admin only */
  listUsers: () => request<{ users: AuthUser[] }>('/auth/users'),

  /** Admin only */
  adminCreateUser: (body: {
    email: string
    password: string
    accessLevel?: 'member' | 'manager' | 'admin'
    displayName?: string
    clubRole?: string
    bio?: string
  }) =>
    request<{ user: AuthUser }>('/auth/users', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Admin only */
  adminUpdateUser: (
    id: string,
    body: {
      displayName?: string
      clubRole?: string
      bio?: string
      accessLevel?: 'member' | 'manager' | 'admin'
      password?: string
    },
  ) =>
    request<{ user: AuthUser }>(`/auth/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
}

export interface PublicEventDoc {
  id: string
  name: string
  date: string
  location: string
}

export const publicApi = {
  getEvents: async (): Promise<PublicEventDoc[]> => {
    const res = await fetch(`${API_BASE}/public/events`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`)
    }
    return data as PublicEventDoc[]
  },
}

export const activitiesApi = {
  getEvents: () => request<Array<EventDoc>>('/events'),
  createEvent: (body: Omit<EventDoc, 'id'>) =>
    request<EventDoc>('/events', { method: 'POST', body: JSON.stringify(body) }),
  updateEvent: (id: string, body: Partial<EventDoc>) =>
    request<EventDoc>(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEvent: (id: string) =>
    request<void>(`/events/${id}`, { method: 'DELETE' }),

  getTasks: () => request<Array<TaskDoc>>('/tasks'),
  createTask: (body: Omit<TaskDoc, 'id'>) =>
    request<TaskDoc>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id: string, body: Partial<TaskDoc>) =>
    request<TaskDoc>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTask: (id: string) =>
    request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  getBudgetItems: () => request<Array<BudgetItemDoc>>('/budget'),
  createBudgetItem: (body: Omit<BudgetItemDoc, 'id'>) =>
    request<BudgetItemDoc>('/budget', { method: 'POST', body: JSON.stringify(body) }),
  updateBudgetItem: (id: string, body: Partial<BudgetItemDoc>) =>
    request<BudgetItemDoc>(`/budget/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  getResources: () => request<ResourceDoc[]>('/resources'),
  createResource: (body: Pick<ResourceDoc, 'name' | 'storageLocation' | 'type'>) =>
    request<ResourceDoc>('/resources', { method: 'POST', body: JSON.stringify(body) }),
  deleteResource: (id: string) =>
    request<void>(`/resources/${id}`, { method: 'DELETE' }),
}

export interface AuthUser {
  id: string
  email: string
  accessLevel?: 'member' | 'manager' | 'admin'
  profile: { displayName?: string; clubRole?: string; bio?: string }
}

export interface EventDoc {
  id: string
  name: string
  date: string
  location: string
  priority: string
  status: string
  budgetAllocated: number
  members?: string[]
  resourceIds?: string[]
  isOwner?: boolean
  ownerEmail?: string
  publicOnCalendar?: boolean
}

export interface TaskDoc {
  id: string
  eventId: string
  title: string
  assignee: string
  dueDate: string
  priority: string
  completed: boolean
  resourceIds?: string[]
}

export interface ResourceDoc {
  id: string
  name: string
  storageLocation: string
  type: string
}

export interface BudgetItemDoc {
  id: string
  eventId: string
  label: string
  amount: number
  spent: boolean
}
