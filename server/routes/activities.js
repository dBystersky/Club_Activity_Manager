import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { ClubEvent } from '../models/Event.js'
import { Task } from '../models/Task.js'
import { BudgetItem } from '../models/BudgetItem.js'
import { Meeting } from '../models/Meeting.js'
import { User } from '../models/User.js'

const router = Router()
router.use(authMiddleware)

const userEmail = (req) => (req.user?.email || '').trim().toLowerCase()

// Events – owned by user OR shared with user (members contains their email)
router.get('/events', async (req, res) => {
  const email = userEmail(req)
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
  const ev = await ClubEvent.create({ ...req.body, userId: req.user._id })
  const obj = ev.toObject()
  res.status(201).json({
    ...obj,
    id: ev._id.toString(),
    isOwner: true,
    ownerEmail: req.user.email,
  })
})

router.patch('/events/:id', async (req, res) => {
  const ev = await ClubEvent.findById(req.params.id)
  if (!ev) return res.status(404).json({ error: 'Event not found' })
  const isOwner = ev.userId.toString() === req.user._id.toString()
  if (!isOwner) {
    return res.status(403).json({ error: 'Only the event owner can edit this event' })
  }
  const updated = await ClubEvent.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true }
  )
  const obj = updated.toObject()
  res.json({
    ...obj,
    id: updated._id.toString(),
    isOwner: true,
    ownerEmail: req.user.email,
  })
})

// Tasks
router.get('/tasks', async (req, res) => {
  const tasks = await Task.find({ userId: req.user._id })
  res.json(tasks.map((t) => ({ ...t.toObject(), id: t._id.toString() })))
})

router.post('/tasks', async (req, res) => {
  const t = await Task.create({ ...req.body, userId: req.user._id })
  res.status(201).json({ ...t.toObject(), id: t._id.toString() })
})

router.patch('/tasks/:id', async (req, res) => {
  const t = await Task.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: req.body },
    { new: true }
  )
  if (!t) return res.status(404).json({ error: 'Task not found' })
  res.json({ ...t.toObject(), id: t._id.toString() })
})

// Budget items
router.get('/budget', async (req, res) => {
  const items = await BudgetItem.find({ userId: req.user._id })
  res.json(items.map((b) => ({ ...b.toObject(), id: b._id.toString() })))
})

router.post('/budget', async (req, res) => {
  const b = await BudgetItem.create({ ...req.body, userId: req.user._id })
  res.status(201).json({ ...b.toObject(), id: b._id.toString() })
})

router.patch('/budget/:id', async (req, res) => {
  const b = await BudgetItem.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: req.body },
    { new: true }
  )
  if (!b) return res.status(404).json({ error: 'Budget item not found' })
  res.json({ ...b.toObject(), id: b._id.toString() })
})

// Meetings
router.get('/meetings', async (req, res) => {
  const meetings = await Meeting.find({ userId: req.user._id })
  res.json(meetings.map((m) => ({ ...m.toObject(), id: m._id.toString() })))
})

router.post('/meetings', async (req, res) => {
  const m = await Meeting.create({ ...req.body, userId: req.user._id })
  res.status(201).json({ ...m.toObject(), id: m._id.toString() })
})

export default router
