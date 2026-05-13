import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    profile: {
      displayName: { type: String, default: '' },
      clubRole: { type: String, default: '' },
      bio: { type: String, default: '' },
    },
    accessLevel: {
      type: String,
      enum: ['member', 'manager', 'admin'],
      default: 'member',
    },
  },
  { timestamps: true }
)

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return
  this.password = await bcrypt.hash(this.password, 10)
})

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password)
}

export const User = mongoose.model('User', userSchema)
