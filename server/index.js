import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB } from './db.js'
import { User } from './models/User.js'
import authRoutes from './routes/auth.js'
import publicRoutes from './routes/public.js'
import activitiesRoutes from './routes/activities.js'

await connectDB()

/** Create seed account if missing; keep accessLevel in sync for reserved demo emails. */
async function ensureSeedUser(email, password, accessLevel, profile) {
  const found = await User.findOne({ email })
  if (!found) {
    await User.create({ email, password, accessLevel, profile })
    console.log(`Created seed user: ${email} / ${password} (${accessLevel})`)
    return
  }
  await User.updateOne({ email }, { $set: { accessLevel } })
}

// Seed demo admin if DB is empty (login: demo@club.local / demo123)
const existing = await User.findOne()
if (!existing) {
  await User.create({
    email: 'demo@club.local',
    password: 'demo123',
    accessLevel: 'admin',
    profile: {
      displayName: 'Demo Admin',
      clubRole: 'Club admin',
      bio: 'Pre-created demo account (full permissions)',
    },
  })
  console.log('Created demo user: demo@club.local / demo123 (admin)')
}

await User.updateOne({ email: 'demo@club.local' }, { $set: { accessLevel: 'admin' } })

await ensureSeedUser(
  'member@club.local',
  'demo123',
  'member',
  {
    displayName: 'Demo Member',
    clubRole: 'Member',
    bio: 'Pre-created account with member permissions',
  },
)
await ensureSeedUser(
  'manager@club.local',
  'demo123',
  'manager',
  {
    displayName: 'Demo Manager',
    clubRole: 'Team lead',
    bio: 'Pre-created account with manager permissions',
  },
)

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
