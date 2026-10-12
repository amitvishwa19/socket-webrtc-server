/**
 * Chat Handler: Real-time messaging, typing indicators, read receipts, attachments,
 * in-memory caching, and PostgreSQL database persistence.
 */

import { prisma } from '../lib/prisma.js';

// In-Memory cache for low-latency retrieval: roomId -> Array<Message>
const roomCache = new Map();

/**
 * Persist message asynchronously to Supabase PostgreSQL crm_chat_messages
 */
async function saveMessageToDb(msg) {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO crm_chat_messages (id, room_id, workspace_id, sender_id, sender_name, sender_avatar, recipient_id, message, attachments, delivered, read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         delivered = EXCLUDED.delivered,
         read = EXCLUDED.read`,
      msg.id,
      msg.roomId,
      msg.workspaceId || null,
      msg.senderId,
      msg.senderName || null,
      msg.senderAvatar || null,
      msg.recipientId || null,
      msg.message,
      JSON.stringify(msg.attachments || []),
      msg.delivered ?? true,
      msg.read ?? false,
      msg.timestamp || new Date().toISOString()
    );
  } catch (err) {
    console.error('[CHAT_DB_ERROR] Failed to persist message:', err.message || err);
  }
}

/**
 * Load recent message history for a room
 */
async function getRoomHistory(roomId, limit = 50) {
  // If memory cache exists and has messages, return it immediately
  if (roomCache.has(roomId) && roomCache.get(roomId).length > 0) {
    return roomCache.get(roomId);
  }

  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, room_id as "roomId", workspace_id as "workspaceId", sender_id as "senderId",
              sender_name as "senderName", sender_avatar as "senderAvatar", recipient_id as "recipientId",
              message, attachments, delivered, read, created_at as "timestamp"
       FROM crm_chat_messages
       WHERE room_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      roomId,
      limit
    );

    const formatted = rows.map((r) => ({
      id: r.id,
      roomId: r.roomId,
      workspaceId: r.workspaceId,
      senderId: r.senderId,
      senderName: r.senderName,
      senderAvatar: r.senderAvatar,
      recipientId: r.recipientId,
      message: r.message,
      attachments: r.attachments || [],
      delivered: r.delivered,
      read: r.read,
      timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString()
    }));

    roomCache.set(roomId, formatted);
    return formatted;
  } catch (err) {
    console.error('[CHAT_HISTORY_ERROR] Failed to load history:', err.message || err);
    return roomCache.get(roomId) || [];
  }
}

export function setupChatHandler(io, socket) {
  /**
   * 1. User sends a direct or channel message
   */
  socket.on('chat:message:send', async (payload) => {
    try {
      const {
        roomId,
        recipientId,
        workspaceId,
        message,
        attachments = [],
        senderId,
        senderName,
        senderAvatar,
        clientMessageId
      } = payload || {};

      if (!message?.trim() && (!attachments || attachments.length === 0)) return;

      const effectiveSenderId = senderId || socket.userId || 'anonymous';
      const effectiveSenderName = senderName || socket.userName || 'User';
      const effectiveSenderAvatar = senderAvatar || socket.avatar || null;

      const messagePayload = {
        id: clientMessageId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        clientMessageId,
        roomId: roomId || 'general',
        workspaceId: workspaceId || socket.workspaceId || null,
        senderId: effectiveSenderId,
        senderName: effectiveSenderName,
        senderAvatar: effectiveSenderAvatar,
        recipientId: recipientId || null,
        message: message ? message.trim() : '',
        attachments: attachments || [],
        timestamp: new Date().toISOString(),
        delivered: true,
        read: false
      };

      // 1. Update in-memory room cache
      if (!roomCache.has(messagePayload.roomId)) {
        roomCache.set(messagePayload.roomId, []);
      }
      const cache = roomCache.get(messagePayload.roomId);
      cache.push(messagePayload);
      if (cache.length > 100) cache.shift(); // retain last 100 messages

      // 2. Persist to DB in the background
      saveMessageToDb(messagePayload);

      // 3. Emit ACK to sender
      socket.emit('chat:message:ack', {
        clientMessageId,
        serverId: messagePayload.id,
        roomId: messagePayload.roomId,
        status: 'sent',
        timestamp: messagePayload.timestamp
      });

      // 4. Broadcast to active room members (excluding the sender)
      if (roomId) {
        socket.to(`room:${roomId}`).emit('chat:message:receive', messagePayload);
      }

      // 5. If recipientId is specified and recipient is NOT self
      if (recipientId && recipientId !== effectiveSenderId) {
        // Check if recipient is already in this room
        let recipientInRoom = false;
        try {
          const roomSockets = await io.in(`room:${roomId}`).fetchSockets();
          recipientInRoom = roomSockets.some((s) => s.userId === recipientId);
        } catch {
          recipientInRoom = false;
        }

        // Deliver directly to recipient's personal room if not currently inside the chat room
        if (!recipientInRoom) {
          io.to(`user:${recipientId}`).emit('chat:message:receive', messagePayload);
          io.to(`user:${recipientId}`).emit('notification:new', {
            type: 'CHAT_MESSAGE',
            title: `Message from ${effectiveSenderName}`,
            body: message ? message.slice(0, 80) : 'Sent an attachment',
            senderId: effectiveSenderId,
            roomId
          });
        }
      }

      console.log(`[CHAT] Message sent in room ${roomId} by ${effectiveSenderId}`);
    } catch (err) {
      console.error('[CHAT_SEND_ERROR]', err);
    }
  });

  /**
   * 2. Join a chat room and retrieve recent history
   */
  socket.on('chat:room:join', async ({ roomId }) => {
    if (!roomId) return;
    socket.join(`room:${roomId}`);
    console.log(`[CHAT] Socket ${socket.id} (${socket.userId || 'guest'}) joined room ${roomId}`);

    try {
      const history = await getRoomHistory(roomId);
      socket.emit('chat:room:history', { roomId, messages: history });
    } catch (err) {
      console.error('[CHAT_ROOM_JOIN_ERROR]', err);
    }
  });

  /**
   * 3. Explicit request for room history
   */
  socket.on('chat:history:get', async ({ roomId }) => {
    if (!roomId) return;
    try {
      const history = await getRoomHistory(roomId);
      socket.emit('chat:room:history', { roomId, messages: history });
    } catch (err) {
      console.error('[CHAT_HISTORY_GET_ERROR]', err);
    }
  });

  /**
   * 4. Leave a chat room
   */
  socket.on('chat:room:leave', ({ roomId }) => {
    if (!roomId) return;
    socket.leave(`room:${roomId}`);
    console.log(`[CHAT] Socket ${socket.id} left room ${roomId}`);
  });

  /**
   * 5. Live Typing Indicator
   */
  socket.on('chat:typing', ({ roomId, recipientId, isTyping }) => {
    const payload = {
      roomId,
      userId: socket.userId,
      userName: socket.userName,
      isTyping: !!isTyping
    };

    if (roomId) {
      socket.to(`room:${roomId}`).emit('chat:typing', payload);
    }
  });

  /**
   * 6. Message Read Receipt
   */
  socket.on('chat:read', async ({ roomId, messageIds = [], readerId }) => {
    const currentReaderId = readerId || socket.userId;
    const payload = {
      roomId,
      messageIds,
      readerId: currentReaderId,
      readAt: new Date().toISOString()
    };

    if (roomId) {
      socket.to(`room:${roomId}`).emit('chat:read:receipt', payload);

      if (messageIds && messageIds.length > 0) {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE crm_chat_messages SET read = true WHERE room_id = $1 AND id = ANY($2::text[])`,
            roomId,
            messageIds
          );
        } catch (err) {
          console.error('[CHAT_READ_RECEIPT_ERROR]', err);
        }
      }
    }
  });
}
