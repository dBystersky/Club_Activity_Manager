import mongoose from 'mongoose'

const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    storageLocation: { type: String, default: '', trim: true },
    type: { type: String, default: '', trim: true },
  },
  { timestamps: true },
)

export const Resource = mongoose.model('Resource', resourceSchema)
