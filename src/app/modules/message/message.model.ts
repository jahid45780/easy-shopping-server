import { Schema, model } from 'mongoose';
import { IMessage } from './message.interface';

const messageSchema = new Schema<IMessage>(
    {
        conversation: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
        },
        sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        senderRole: { type: String, required: true },
        text: { type: String, default: '', trim: true, maxlength: 5000 },
        images: { type: [String], default: [] },
        readBy: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    },
    { timestamps: true, toJSON: { virtuals: true } }
);

messageSchema.index({ conversation: 1, createdAt: 1 });

export const Message = model<IMessage>('Message', messageSchema);
