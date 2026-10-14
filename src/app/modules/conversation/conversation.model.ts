import { Schema, model } from 'mongoose';
import { IConversation } from './conversation.interface';

const participantSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, required: true },
    },
    { _id: false }
);

const lastMessageSchema = new Schema(
    {
        text: { type: String, default: '' },
        sender: { type: Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date },
    },
    { _id: false }
);

const unreadSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        count: { type: Number, default: 0 },
    },
    { _id: false }
);

const conversationSchema = new Schema<IConversation>(
    {
        participants: { type: [participantSchema], default: [] },
        type: {
            type: String,
            enum: ['customer-support'],
            required: true,
        },
        lastMessage: { type: lastMessageSchema, default: null },
        unread: { type: [unreadSchema], default: [] },
    },
    { timestamps: true, toJSON: { virtuals: true } }
);

conversationSchema.index({ 'participants.user': 1, updatedAt: -1 });
conversationSchema.index({ type: 1 });

export const Conversation = model<IConversation>('Conversation', conversationSchema);
