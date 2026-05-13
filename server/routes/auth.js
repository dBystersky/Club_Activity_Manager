import { Router } from 'express'
import { User } from '../models/User.js'
import { authMiddleware, createToken, requireAdmin } from '../middleware/auth.js'
import { normalizeAccessLevel } from '../lib/accessLevel.js'

function userResponse(doc) {
  return {
    id: doc._id,
    email: doc.email,
    accessLevel: normalizeAccessLevel(doc),
    profile: doc.profile,
  }
}

const router = Router()

// Register – create profile via email
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName, clubRole, bio } = req.body

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: 'Email and password are required' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    const existing = await User.findOne({ email: email.trim().toLowerCase() })
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' })
    }

    const user = await User.create({
      email: email.trim().toLowerCase(),
      password,
      accessLevel: 'member',
      profile: {
        displayName: displayName || '',
        clubRole: clubRole || '',
        bio: bio || '',
      },
    })

    const token = createToken(user._id)
    const profile = await User.findById(user._id).select('-password')

    res.status(201).json({
      user: userResponse(profile),
      token,
    })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({ error: 'Registration failed' })
  }
})

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password')
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const valid = await user.comparePassword(password)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = createToken(user._id)
    const profile = await User.findById(user._id).select('-password')

    res.json({
      user: userResponse(profile),
      token,
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Get current user (protected)
router.get('/me', authMiddleware, async (req, res) => {
  res.json({ user: userResponse(req.user) })
})

// Check if email is registered (for collaborator validation)
router.get('/check-email', authMiddleware, async (req, res) => {
  if (normalizeAccessLevel(req.user) === 'member') {
    return res.status(403).json({ error: 'You do not have permission to look up accounts' })
  }
  const email = req.query.email
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email query required' })
  }
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('_id')
  res.json({ registered: !!user })
})

// Admin: list accounts
router.get('/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ email: 1 }).select('-password')
    res.json({ users: users.map(userResponse) })
  } catch (err) {
    console.error('List users error:', err)
    res.status(500).json({ error: 'Failed to list users' })
  }
})

// Admin: create account (invited members, managers, etc.)
router.post('/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { email, password, displayName, clubRole, bio, accessLevel } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    let level = accessLevel ? String(accessLevel).toLowerCase() : 'member'
    if (!['member', 'manager', 'admin'].includes(level)) {
      return res.status(400).json({ error: 'Invalid access level' })
    }

    const existing = await User.findOne({ email: email.trim().toLowerCase() })
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' })
    }

    const created = await User.create({
      email: email.trim().toLowerCase(),
      password,
      accessLevel: level,
      profile: {
        displayName: displayName || '',
        clubRole: clubRole || '',
        bio: bio || '',
      },
    })

    const fresh = await User.findById(created._id).select('-password')
    res.status(201).json({ user: userResponse(fresh) })
  } catch (err) {
    console.error('Admin create user error:', err)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// Admin: update another user's profile and permission level
router.patch('/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { displayName, clubRole, bio, accessLevel, password } = req.body

    const user = await User.findById(req.params.id).select('+password')
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (password !== undefined && password !== '') {
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' })
      }
      user.password = password
    }

    if (displayName !== undefined) user.profile.displayName = displayName
    if (clubRole !== undefined) user.profile.clubRole = clubRole
    if (bio !== undefined) user.profile.bio = bio

    if (accessLevel !== undefined) {
      const next = String(accessLevel).toLowerCase()
      if (!['member', 'manager', 'admin'].includes(next)) {
        return res.status(400).json({ error: 'Invalid access level' })
      }
      const wasAdmin = normalizeAccessLevel(user) === 'admin'
      if (wasAdmin && next !== 'admin') {
        const otherAdmins = await User.countDocuments({
          accessLevel: 'admin',
          _id: { $ne: user._id },
        })
        if (otherAdmins === 0) {
          return res.status(400).json({ error: 'Cannot remove the last admin' })
        }
      }
      user.accessLevel = next
    }

    await user.save()

    const fresh = await User.findById(user._id).select('-password')
    res.json({ user: userResponse(fresh) })
  } catch (err) {
    console.error('Admin update user error:', err)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Update profile (protected)
router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const { displayName, clubRole, bio } = req.body
    const updates = {}
    if (displayName !== undefined) updates['profile.displayName'] = displayName
    if (clubRole !== undefined) updates['profile.clubRole'] = clubRole
    if (bio !== undefined) updates['profile.bio'] = bio

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    ).select('-password')

    res.json({ user: userResponse(user) })
  } catch (err) {
    console.error('Profile update error:', err)
    res.status(500).json({ error: 'Profile update failed' })
  }
})

export default router
