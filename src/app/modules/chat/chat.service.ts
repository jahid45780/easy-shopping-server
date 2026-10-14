import { Types } from 'mongoose';
import { Conversation } from '../conversation/conversation.model';
import { Message } from '../message/message.model';
import { ConversationType } from '../conversation/conversation.interface';
import AppError from '../../utils/AppError';
import { emitMessage } from '../../utils/socket';

const POPULATE_PARTICIPANTS = {
    path: 'participants.user',
    select: 'name email role',
};

/**
 * Find-or-create a conversation. Single support lane, keyed on the requesting user.
 */
const findOrCreateConversation = async (
    userId: string,
    role: string,
    payload: { peerId?: string; type: ConversationType }
) => {
    const { type } = payload;

    if (type !== 'customer-support') {
        throw new AppError(400, 'Invalid conversation type.');
    }

    let conversation = await Conversation.findOne({
        type,
        'participants.user': new Types.ObjectId(userId),
    });

    if (!conversation) {
        conversation = await Conversation.create({
            type,
            participants: [{ user: new Types.ObjectId(userId), role }],
            unread: [{ user: new Types.ObjectId(userId), count: 0 }],
        });
    }

    return Conversation.findById(conversation._id).populate(POPULATE_PARTICIPANTS);
};

/**
 * All conversations the user participates in. Admins additionally see every
 * support conversation (the support inbox).
 */
const getMyConversations = async (userId: string, role: string) => {
    const orConditions: Record<string, unknown>[] = [
        { 'participants.user': new Types.ObjectId(userId) },
    ];

    if (role === 'admin' || role === 'superadmin') {
        orConditions.push({ type: 'customer-support' });
    }

    const conversations = await Conversation.find({ $or: orConditions })
        .populate(POPULATE_PARTICIPANTS)
        .sort({ 'lastMessage.createdAt': -1, updatedAt: -1 });

    return conversations.map((c) => {
        const obj = c.toObject();
        const myUnread = obj.unread?.find((u) => String(u.user) === String(userId));
        return { ...obj, myUnreadCount: myUnread ? myUnread.count : 0 };
    });
};

/** Ensure the user is allowed to access a conversation. */
const assertAccess = async (
    conversationId: string,
    userId: string,
    role: string
) => {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new AppError(404, 'Conversation not found.');

    const isParticipant = conversation.participants.some(
        (p) => String(p.user) === String(userId)
    );
    const isSupportAdmin =
        (role === 'admin' || role === 'superadmin') &&
        conversation.type === 'customer-support';

    if (!isParticipant && !isSupportAdmin) {
        throw new AppError(403, 'You do not have access to this conversation.');
    }

    return conversation;
};

/**
 * Paginated messages (ascending). Also resets the caller's unread counter and
 * marks the fetched messages as read by the caller.
 */
const getMessages = async (
    conversationId: string,
    userId: string,
    role: string,
    page = 1,
    limit = 30
) => {
    await assertAccess(conversationId, userId, role);

    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
        Message.find({ conversation: conversationId })
            .populate('sender', 'name email role')
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(limit),
        Message.countDocuments({ conversation: conversationId }),
    ]);

    // Reset my unread on this conversation.
    await Conversation.updateOne(
        { _id: conversationId, 'unread.user': new Types.ObjectId(userId) },
        { $set: { 'unread.$.count': 0 } }
    );

    // Mark messages read by me.
    await Message.updateMany(
        { conversation: conversationId, readBy: { $ne: new Types.ObjectId(userId) } },
        { $addToSet: { readBy: new Types.ObjectId(userId) } }
    );

    return {
        messages,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
};

/**
 * Create a message, update the conversation's lastMessage, bump unread for all
 * other participants, and emit over Socket.IO.
 */
const sendMessage = async (
    userId: string,
    role: string,
    payload: { conversationId: string; text?: string; images?: string[] }
) => {
    const { conversationId, text, images } = payload;

    if ((!text || !text.trim()) && (!images || images.length === 0)) {
        throw new AppError(400, 'Message must contain text or at least one image.');
    }

    const conversation = await assertAccess(conversationId, userId, role);

    // If a support admin replies but isn't yet a participant, add them.
    const isParticipant = conversation.participants.some(
        (p) => String(p.user) === String(userId)
    );
    if (!isParticipant) {
        conversation.participants.push({ user: new Types.ObjectId(userId), role });
        if (!conversation.unread.some((u) => String(u.user) === String(userId))) {
            conversation.unread.push({ user: new Types.ObjectId(userId), count: 0 });
        }
    }

    const message = await Message.create({
        conversation: new Types.ObjectId(conversationId),
        sender: new Types.ObjectId(userId),
        senderRole: role,
        text: text?.trim() || '',
        images: images || [],
        readBy: [new Types.ObjectId(userId)],
    });

    // Update lastMessage.
    conversation.lastMessage = {
        text: text?.trim() || (images && images.length ? '📷 Photo' : ''),
        sender: new Types.ObjectId(userId),
        createdAt: message.createdAt as Date,
    };

    // Increment unread for every participant except the sender.
    conversation.unread.forEach((u) => {
        if (String(u.user) !== String(userId)) u.count += 1;
    });
    // Ensure every non-sender participant has an unread bucket.
    conversation.participants.forEach((p) => {
        if (String(p.user) === String(userId)) return;
        if (!conversation.unread.some((u) => String(u.user) === String(p.user))) {
            conversation.unread.push({ user: p.user, count: 1 });
        }
    });

    await conversation.save();

    const populated = await Message.findById(message._id).populate('sender', 'name email role');

    const participantIds = conversation.participants.map((p) => String(p.user));
    emitMessage(populated, participantIds, conversationId);

    return populated;
};

/** Reset the caller's unread counter to 0 for a conversation. */
const markRead = async (conversationId: string, userId: string, role: string) => {
    await assertAccess(conversationId, userId, role);
    await Conversation.updateOne(
        { _id: conversationId, 'unread.user': new Types.ObjectId(userId) },
        { $set: { 'unread.$.count': 0 } }
    );
    return { conversationId, read: true };
};

/** Total unread across all of the caller's conversations. */
const getUnreadTotal = async (userId: string) => {
    const conversations = await Conversation.find({
        'participants.user': new Types.ObjectId(userId),
    }).select('unread');

    let total = 0;
    conversations.forEach((c) => {
        const mine = c.unread.find((u) => String(u.user) === String(userId));
        if (mine) total += mine.count;
    });

    return { total };
};

/** Admin support inbox: all support-lane conversations, with the viewing admin's
 *  unread count on each thread. */
const getSupportConversations = async (userId: string) => {
    const conversations = await Conversation.find({
        type: 'customer-support',
    })
        .populate(POPULATE_PARTICIPANTS)
        .sort({ 'lastMessage.createdAt': -1, updatedAt: -1 });

    if (conversations.length === 0) return [];

    // Unread for THIS admin = messages they haven't read and didn't send. It resets
    // when they open the thread (getMessages marks every message readBy the caller),
    // so the badge works even for threads no admin has joined yet.
    const adminObjId = new Types.ObjectId(userId);
    const counts = await Message.aggregate([
        {
            $match: {
                conversation: { $in: conversations.map((c) => c._id) },
                sender: { $ne: adminObjId },
                readBy: { $ne: adminObjId },
            },
        },
        { $group: { _id: '$conversation', count: { $sum: 1 } } },
    ]);
    const countMap = new Map<string, number>(counts.map((c: any) => [String(c._id), c.count]));

    return conversations.map((c) => {
        const obj = c.toObject();
        return { ...obj, myUnreadCount: countMap.get(String(c._id)) || 0 };
    });
};

export const ChatService = {
    findOrCreateConversation,
    getMyConversations,
    getMessages,
    sendMessage,
    markRead,
    getUnreadTotal,
    getSupportConversations,
};
