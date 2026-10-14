import { Types } from 'mongoose';

export type ConversationType = 'customer-support';

export interface IParticipant {
    user: Types.ObjectId;
    role: string;
}

export interface ILastMessage {
    text: string;
    sender: Types.ObjectId;
    createdAt: Date;
}

export interface IUnread {
    user: Types.ObjectId;
    count: number;
}

export interface IConversation {
    participants: IParticipant[];
    type: ConversationType;
    lastMessage: ILastMessage | null;
    unread: IUnread[];
    createdAt?: Date;
    updatedAt?: Date;
}
