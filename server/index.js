import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB } from './db.js'
import { User } from './models/User.js'
import authRoutes from './routes/auth.js'
import publicRoutes from './routes/public.js'
import activitiesRoutes from './routes/activities.js'

await connectDB()

// Seed demo user if none exist (login: demo@club.local / demo123)
const existing = await User.findOne()
if (!existing) {
  await User.create({
    email: 'demo@club.local',
    password: 'demo123',
    profile: { displayName: 'Demo User', clubRole: 'Member', bio: 'Pre-created demo account' },
  })
  console.log('Created demo user: demo@club.local / demo123')
}

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api', publicRoutes)
app.use('/api', activitiesRoutes)

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
