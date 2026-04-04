import mongoose from 'mongoose'

const eventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    date: { type: String, default: '' },
    location: { type: String, default: '' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: {
      type: String,
      enum: ['planning', 'confirmed', 'completed'],
      default: 'planning',
    },
    budgetAllocated: { type: Number, default: 0 },
    members: { type: [String], default: [] },
    publicOnCalendar: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export const ClubEvent = mongoose.model('ClubEvent', eventSchema)
