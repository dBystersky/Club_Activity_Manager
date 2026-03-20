import { Router } from 'express'
import { User } from '../models/User.js'
import { authMiddleware, createToken } from '../middleware/auth.js'

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
      profile: {
        displayName: displayName || '',
        clubRole: clubRole || '',
        bio: bio || '',
      },
    })

    const token = createToken(user._id)
    const profile = await User.findById(user._id).select('-password')

    res.status(201).json({
      user: {
        id: profile._id,
        email: profile.email,
        profile: profile.profile,
      },
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
      user: {
        id: profile._id,
        email: profile.email,
        profile: profile.profile,
      },
      token,
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Get current user (protected)
router.get('/me', authMiddleware, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      email: req.user.email,
      profile: req.user.profile,
    },
  })
})

// Check if email is registered (for collaborator validation)
router.get('/check-email', authMiddleware, async (req, res) => {
  const email = req.query.email
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email query required' })
  }
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('_id')
  res.json({ registered: !!user })
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

    res.json({
      user: {
        id: user._id,
        email: user.email,
        profile: user.profile,
      },
    })
  } catch (err) {
    console.error('Profile update error:', err)
    res.status(500).json({ error: 'Profile update failed' })
  }
})

export default router
