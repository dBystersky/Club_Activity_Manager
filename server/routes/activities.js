import { Router } from 'express'
import { authMiddleware, requireAdmin } from '../middleware/auth.js'
import { ClubEvent } from '../models/Event.js'
import { Task } from '../models/Task.js'
import { BudgetItem } from '../models/BudgetItem.js'
import { Resource } from '../models/Resource.js'
import {
  escapeRegex,
  membersListsEqual,
  normalizeAccessLevel,
} from '../lib/accessLevel.js'

const router = Router()
router.use(authMiddleware)

const userEmail = (req) => (req.user?.email || '').trim().toLowerCase()

function level(req) {
  return normalizeAccessLevel(req.user)
}

async function ownedEventIdStrings(userId) {
  const ids = await ClubEvent.find({ userId }).distinct('_id')
  return ids.map((id) => id.toString())
}

async function sharedEventIdStrings(email) {
  const ids = await ClubEvent.find({ members: { $in: [email] } }).distinct('_id')
  return ids.map((id) => id.toString())
}

function normalizeResourceIds(body) {
  const raw = body.resourceIds
  if (!Array.isArray(raw)) return []
  return raw.map((id) => String(id).trim()).filter(Boolean)
}

/** Active events (planning/confirmed) cannot share the same inventory resource. */
async function findActiveEventResourceConflict(resourceIds, excludeMongoEventId) {
  const ids = [...new Set(resourceIds)]
  if (!ids.length) return null
  const q = {
    status: { $ne: 'completed' },
    resourceIds: { $in: ids },
  }
  if (excludeMongoEventId) q._id = { $ne: excludeMongoEventId }
  const doc = await ClubEvent.findOne(q).select('name resourceIds').lean()
  if (!doc) return null
  return {
    message: `Resource already allocated to active event "${doc.name || 'another event'}"`,
  }
}

/**
 * Task may reference a resource only if no active event holds it, or only the linked event holds it.
 */
async function assertTaskResourcesAllowed(resourceIds, taskEventIdStr) {
  const ids = [...new Set(resourceIds)]
  const eid = typeof taskEventIdStr === 'string' ? taskEventIdStr.trim() : ''
  for (const rid of ids) {
    const owners = await ClubEvent.find({
      status: { $ne: 'completed' },
      resourceIds: rid,
    })
      .select('_id name')
      .lean()
    if (!owners.length) continue
    if (owners.length > 1) {
      return 'Multiple active events reference this resource — contact an admin.'
    }
    const ownerId = owners[0]._id.toString()
    if (!eid || ownerId !== eid) {
      return `Resource is allocated to active event "${owners[0].name}". Link this task to that event or pick another item.`
    }
  }
  return null
}

/** Persist only schema fields; normalise publicOnCalendar so it always saves correctly. */
function eventWritePayload(body) {
  const members = Array.isArray(body.members) ? body.members : []
  const pr = body.publicOnCalendar
  const publicOnCalendar =
    pr === true ||
    pr === 'true' ||
    pr === 1 ||
    pr === 'on' ||
    pr === '1'

  return {
    name: typeof body.name === 'string' ? body.name : String(body.name ?? ''),
    date: typeof body.date === 'string' ? body.date : String(body.date ?? ''),
    location: typeof body.location === 'string' ? body.location : String(body.location ?? ''),
    priority: ['low', 'medium', 'high'].includes(body.priority) ? body.priority : 'medium',
    status: ['planning', 'confirmed', 'completed'].includes(body.status)
      ? body.status
      : 'planning',
    budgetAllocated: Number.isFinite(Number(body.budgetAllocated))
      ? Number(body.budgetAllocated)
      : 0,
    members,
    resourceIds: normalizeResourceIds(body),
    publicOnCalendar,
  }
}

function taskWritePayload(body) {
  return {
    title: typeof body.title === 'string' ? body.title : String(body.title ?? ''),
    assignee: typeof body.assignee === 'string' ? body.assignee : String(body.assignee ?? ''),
    dueDate: typeof body.dueDate === 'string' ? body.dueDate : String(body.dueDate ?? ''),
    eventId: typeof body.eventId === 'string' ? body.eventId : String(body.eventId ?? ''),
    priority: ['low', 'medium', 'high'].includes(body.priority) ? body.priority : 'medium',
    resourceIds: normalizeResourceIds(body),
  }
}

/** Partial updates for PATCH — only keys present on `body` are returned. */
function taskPatchPayload(body) {
  const out = {}
  if ('title' in body) {
    out.title = typeof body.title === 'string' ? body.title : String(body.title ?? '')
  }
  if ('assignee' in body) {
    out.assignee =
      typeof body.assignee === 'string' ? body.assignee : String(body.assignee ?? '')
  }
  if ('dueDate' in body) {
    out.dueDate = typeof body.dueDate === 'string' ? body.dueDate : String(body.dueDate ?? '')
  }
  if ('eventId' in body) {
    out.eventId = typeof body.eventId === 'string' ? body.eventId : String(body.eventId ?? '')
  }
  if ('priority' in body) {
    out.priority = ['low', 'medium', 'high'].includes(body.priority)
      ? body.priority
      : 'medium'
  }
  if ('resourceIds' in body) {
    out.resourceIds = normalizeResourceIds(body)
  }
  if ('completed' in body && typeof body.completed === 'boolean') {
    out.completed = body.completed
  }
  return out
}

function resourceToJson(r) {
  const o = r.toObject()
  return {
    id: r._id.toString(),
    name: o.name,
    storageLocation: o.storageLocation ?? '',
    type: o.type ?? '',
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }
}

function taskToJson(t) {
  return { ...t.toObject(), id: t._id.toString() }
}

function dedupeTasksById(docs) {
  const seen = new Set()
  const out = []
  for (const t of docs) {
    const sid = t._id.toString()
    if (seen.has(sid)) continue
    seen.add(sid)
    out.push(t)
  }
  return out
}

// Events – member: only where listed as collaborator; manager/admin: owned + shared
router.get('/events', async (req, res) => {
  const email = userEmail(req)
  const lv = level(req)

  if (lv === 'member') {
    const shared = await ClubEvent.find({
      members: { $in: [email] },
    }).populate('userId', 'email')

    const toEvent = (e, isOwner, ownerEmail) => {
      const obj = e.toObject ? e.toObject() : e
      return {
        ...obj,
        id: (obj._id || e._id).toString(),
        isOwner,
        ownerEmail: ownerEmail || (e.userId?.email ?? ''),
      }
    }
    return res.json(shared.map((e) => toEvent(e, false, e.userId?.email)))
  }

  const owned = await ClubEvent.find({ userId: req.user._id })
  const shared = await ClubEvent.find({
    userId: { $ne: req.user._id },
    members: { $in: [email] },
  }).populate('userId', 'email')

  const toEvent = (e, isOwner, ownerEmail) => {
    const obj = e.toObject ? e.toObject() : e
    return {
      ...obj,
      id: (obj._id || e._id).toString(),
      isOwner,
      ownerEmail: ownerEmail || (e.userId?.email ?? ''),
    }
  }

  const ownedList = owned.map((e) => toEvent(e, true, req.user.email))
  const sharedList = shared.map((e) => toEvent(e, false, e.userId?.email))
  res.json([...ownedList, ...sharedList])
})

router.post('/events', async (req, res) => {
  if (level(req) === 'member') {
    return res.status(403).json({ error: 'Members cannot create events' })
  }

  let payload = eventWritePayload(req.body)
  if (level(req) === 'manager') {
    const m = payload.members || []
    if (m.length > 0) {
      return res.status(403).json({ error: 'Managers cannot add collaborators when creating events' })
    }
    payload = { ...payload, members: [] }
  }

  const conflict = await findActiveEventResourceConflict(payload.resourceIds, null)
  if (conflict) {
    return res.status(400).json({ error: conflict.message })
  }

  const ev = await ClubEvent.create({
    ...payload,
    userId: req.user._id,
  })
  const obj = ev.toObject()
  res.status(201).json({
    ...obj,
    id: ev._id.toString(),
    isOwner: true,
    ownerEmail: req.user.email,
  })
})

router.patch('/events/:id', async (req, res) => {
  if (level(req) === 'member') {
    return res.status(403).json({ error: 'Members cannot edit events' })
  }

  const ev = await ClubEvent.findById(req.params.id)
  if (!ev) return res.status(404).json({ error: 'Event not found' })
  const isOwner = ev.userId.toString() === req.user._id.toString()
  if (!isOwner) {
    return res.status(403).json({ error: 'Only the event owner can edit this event' })
  }

  let payload = eventWritePayload(req.body)
  if (level(req) === 'manager') {
    if (!membersListsEqual(payload.members, ev.members)) {
      return res.status(403).json({ error: 'Managers cannot change event collaborators' })
    }
  }

  const conflict = await findActiveEventResourceConflict(payload.resourceIds, ev._id)
  if (conflict) {
    return res.status(400).json({ error: conflict.message })
  }

  const updated = await ClubEvent.findByIdAndUpdate(
    req.params.id,
    { $set: payload },
    { new: true, runValidators: true },
  )
  const obj = updated.toObject()
  res.json({
    ...obj,
    id: updated._id.toString(),
    isOwner: true,
    ownerEmail: req.user.email,
  })
})

router.delete('/events/:id', async (req, res) => {
  if (level(req) === 'member') {
    return res.status(403).json({ error: 'Members cannot delete events' })
  }

  const ev = await ClubEvent.findById(req.params.id)
  if (!ev) return res.status(404).json({ error: 'Event not found' })
  if (ev.userId.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'Only the event owner can delete this event' })
  }
  const idStr = ev._id.toString()
  await Promise.all([
    Task.deleteMany({ eventId: idStr }),
    BudgetItem.deleteMany({ eventId: idStr }),
  ])
  await ClubEvent.findByIdAndDelete(req.params.id)
  res.status(204).send()
})

// Tasks
router.get('/tasks', async (req, res) => {
  const email = userEmail(req)
  const lv = level(req)

  if (lv === 'member') {
    const sharedIds = await sharedEventIdStrings(email)
    const assigneeRe = new RegExp(`^${escapeRegex(email)}$`, 'i')
    const batches = []
    if (sharedIds.length > 0) {
      batches.push(await Task.find({ eventId: { $in: sharedIds } }))
    }
    batches.push(
      await Task.find({
        assignee: assigneeRe,
        $or: [{ eventId: '' }, { eventId: { $exists: false } }],
      }),
    )
    const merged = dedupeTasksById(batches.flat())
    return res.json(merged.map(taskToJson))
  }

  const ownedIds = await ownedEventIdStrings(req.user._id)
  const sharedIds = await sharedEventIdStrings(email)
  const eventScope = [...new Set([...ownedIds, ...sharedIds])]

  const tasks = await Task.find({
    $or: [{ userId: req.user._id }, { eventId: { $in: eventScope } }],
  })
  res.json(tasks.map(taskToJson))
})

router.post('/tasks', async (req, res) => {
  if (level(req) === 'member') {
    return res.status(403).json({ error: 'Members cannot create tasks' })
  }
  const payload = taskWritePayload(req.body)
  const taskErr = await assertTaskResourcesAllowed(payload.resourceIds, payload.eventId)
  if (taskErr) {
    return res.status(400).json({ error: taskErr })
  }
  const t = await Task.create({
    ...payload,
    completed: false,
    userId: req.user._id,
  })
  res.status(201).json(taskToJson(t))
})

router.patch('/tasks/:id', async (req, res) => {
  const email = userEmail(req)
  const lv = level(req)
  const t = await Task.findById(req.params.id)
  if (!t) return res.status(404).json({ error: 'Task not found' })

  if (lv === 'member') {
    const assigneeRe = new RegExp(`^${escapeRegex(email)}$`, 'i')
    if (!assigneeRe.test((t.assignee || '').trim())) {
      return res.status(403).json({ error: 'You can only update tasks assigned to you' })
    }
    const sharedIds = await sharedEventIdStrings(email)
    const eid = t.eventId || ''
    if (eid && !sharedIds.includes(String(eid))) {
      return res.status(403).json({ error: 'Task is not on an event you belong to' })
    }
    if (typeof req.body.completed !== 'boolean') {
      return res.status(400).json({ error: 'Only completed status can be updated' })
    }
    const updated = await Task.findByIdAndUpdate(
      req.params.id,
      { $set: { completed: req.body.completed } },
      { new: true },
    )
    return res.json(taskToJson(updated))
  }

  const ownedIds = await ownedEventIdStrings(req.user._id)
  const sharedIds = await sharedEventIdStrings(email)
  const eventScope = new Set([...ownedIds, ...sharedIds])
  const onOwnTask = t.userId.toString() === req.user._id.toString()
  const eid = t.eventId || ''
  const onScopedEvent = eid && eventScope.has(String(eid))

  if (!onOwnTask && !onScopedEvent) {
    return res.status(403).json({ error: 'Task not found' })
  }

  const patch = taskPatchPayload(req.body)
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  const mergedEventId =
    patch.eventId !== undefined ? String(patch.eventId || '').trim() : String(t.eventId || '').trim()
  const mergedResources =
    patch.resourceIds !== undefined ? patch.resourceIds : t.resourceIds || []

  const taskErr = await assertTaskResourcesAllowed(mergedResources, mergedEventId)
  if (taskErr) {
    return res.status(400).json({ error: taskErr })
  }

  const updated = await Task.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true })
  res.json(taskToJson(updated))
})

router.delete('/tasks/:id', async (req, res) => {
  if (level(req) === 'member') {
    return res.status(403).json({ error: 'Members cannot delete tasks' })
  }

  const email = userEmail(req)
  const t = await Task.findById(req.params.id)
  if (!t) return res.status(404).json({ error: 'Task not found' })

  const ownedIds = await ownedEventIdStrings(req.user._id)
  const sharedIds = await sharedEventIdStrings(email)
  const eventScope = new Set([...ownedIds, ...sharedIds])
  const onOwnTask = t.userId.toString() === req.user._id.toString()
  const eid = t.eventId || ''
  const onScopedEvent = eid && eventScope.has(String(eid))

  if (!onOwnTask && !onScopedEvent) {
    return res.status(403).json({ error: 'Task not found' })
  }

  await Task.findByIdAndDelete(req.params.id)
  res.status(204).send()
})

// Budget items
router.get('/budget', async (req, res) => {
  if (level(req) === 'member') {
    return res.json([])
  }
  const items = await BudgetItem.find({ userId: req.user._id })
  res.json(items.map((b) => ({ ...b.toObject(), id: b._id.toString() })))
})

router.post('/budget', async (req, res) => {
  if (level(req) !== 'admin') {
    return res.status(403).json({ error: 'Only admins can add budget items' })
  }
  const b = await BudgetItem.create({ ...req.body, userId: req.user._id })
  res.status(201).json({ ...b.toObject(), id: b._id.toString() })
})

router.patch('/budget/:id', async (req, res) => {
  if (level(req) === 'member') {
    return res.status(403).json({ error: 'Members cannot update budget items' })
  }
  const b = await BudgetItem.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: req.body },
    { new: true }
  )
  if (!b) return res.status(404).json({ error: 'Budget item not found' })
  res.json({ ...b.toObject(), id: b._id.toString() })
})

// Club inventory (MongoDB collection). Read: any authenticated user (for allocations).
// Create / delete: admin only.
router.get('/resources', async (_req, res) => {
  const list = await Resource.find().sort({ name: 1 }).lean()
  res.json(
    list.map((row) => ({
      id: row._id.toString(),
      name: row.name,
      storageLocation: row.storageLocation ?? '',
      type: row.type ?? '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  )
})

router.post('/resources', requireAdmin, async (req, res) => {
  const name =
    typeof req.body.name === 'string' ? req.body.name.trim() : String(req.body.name ?? '').trim()
  if (!name) {
    return res.status(400).json({ error: 'Resource name is required' })
  }
  const storageLocation =
    typeof req.body.storageLocation === 'string'
      ? req.body.storageLocation.trim()
      : String(req.body.storageLocation ?? '').trim()
  const type =
    typeof req.body.type === 'string'
      ? req.body.type.trim()
      : String(req.body.type ?? '').trim()

  const created = await Resource.create({ name, storageLocation, type })
  res.status(201).json(resourceToJson(created))
})

router.delete('/resources/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim()
  const doc = await Resource.findByIdAndDelete(id)
  if (!doc) return res.status(404).json({ error: 'Resource not found' })

  await Promise.all([
    ClubEvent.updateMany({ resourceIds: id }, { $pull: { resourceIds: id } }),
    Task.updateMany({ resourceIds: id }, { $pull: { resourceIds: id } }),
  ])

  res.status(204).send()
})

export default router
