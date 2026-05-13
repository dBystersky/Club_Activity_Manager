import jwt from 'jsonwebtoken'
import { User } from '../models/User.js'
import { normalizeAccessLevel } from '../lib/accessLevel.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

/** Must run after authMiddleware. */
export function requireAdmin(req, res, next) {
  if (normalizeAccessLevel(req.user) !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(decoded.userId).select('-password')
    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }
    req.user = user
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' })
}
