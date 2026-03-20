import mongoose from 'mongoose'

const meetingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    eventId: { type: String, default: '' },
    dateTime: { type: String, required: true },
    location: { type: String, required: true },
    agenda: { type: String, default: '' },
  },
  { timestamps: true }
)

export const Meeting = mongoose.model('Meeting', meetingSchema)
