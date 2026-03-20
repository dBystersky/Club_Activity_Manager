import mongoose from 'mongoose'

const budgetItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    eventId: { type: String, default: '' },
    label: { type: String, required: true },
    amount: { type: Number, required: true },
    spent: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export const BudgetItem = mongoose.model('BudgetItem', budgetItemSchema)
