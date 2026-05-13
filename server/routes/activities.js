import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { ClubEvent } from '../models/Event.js'
import { Task } from '../models/Task.js'
import { BudgetItem } from '../models/BudgetItem.js'
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
    publicOnCalendar,
  }
}

function taskToJson(t) {
  return { ...t.toObject(), id: t._id.toString() }
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
    const tasks = await Task.find({
      assignee: assigneeRe,
      $or: [{ eventId: { $in: sharedIds } }, { eventId: '' }, { eventId: { $exists: false } }],
    })
    return res.json(tasks.map(taskToJson))
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
  const t = await Task.create({ ...req.body, userId: req.user._id })
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

  const updated = await Task.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true },
  )
  res.json(taskToJson(updated))
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

export default router
