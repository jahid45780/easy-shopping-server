import { Types } from 'mongoose';

export interface IMessage {
    conversation: Types.ObjectId;
    sender: Types.ObjectId;
    senderRole: string;
    text: string;
    images: string[];
    readBy: Types.ObjectId[];
    createdAt?: Date;
    updatedAt?: Date;
}
