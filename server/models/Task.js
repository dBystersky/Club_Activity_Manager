import mongoose from 'mongoose'

const taskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    eventId: { type: String, default: '' },
    title: { type: String, required: true },
    assignee: { type: String, default: '' },
    dueDate: { type: String, default: '' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    completed: { type: Boolean, default: false },
    resourceIds: { type: [String], default: [] },
  },
  { timestamps: true }
)

export const Task = mongoose.model('Task', taskSchema)
