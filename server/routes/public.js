import { Router } from 'express'
import { ClubEvent } from '../models/Event.js'

const router = Router()

/** Public, unauthenticated: events owners have marked for the public calendar. */
router.get('/public/events', async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    const list = await ClubEvent.find({
      publicOnCalendar: true,
    })
      .sort({ date: 1 })
      .lean()

    res.json(
      list.map((e) => ({
        id: e._id.toString(),
        name: e.name ?? '',
        date: e.date ?? '',
        location: e.location ?? '',
      })),
    )
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load public events' })
  }
})

export default router
