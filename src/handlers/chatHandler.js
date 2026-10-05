/**
 * Chat Handler: Real-time messaging, typing indicators, read receipts, and attachments
 */

export function setupChatHandler(io, socket) {
  /**
   * User sends a direct or channel message
   */
  socket.on('chat:message:send', (payload) => {
    const {
      roomId,        // e.g. "dm:userA:userB" or "channel:general"
      recipientId,   // target user ID for direct message
      workspaceId,
      message,       // message text
      attachments = [],
      senderId,
      senderName,
      senderAvatar,
      clientMessageId
    } = payload;

    if (!message?.trim() && (!attachments || attachments.length === 0)) return;

    const messagePayload = {
      id: clientMessageId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      roomId,
      workspaceId: workspaceId || socket.workspaceId,
      senderId: senderId || socket.userId,
      senderName: senderName || socket.userName || 'User',
      senderAvatar: senderAvatar || socket.avatar,
      message: message ? message.trim() : '',
      attachments,
      timestamp: new Date().toISOString(),
      delivered: true
    };

    // If roomId is provided, broadcast to that room
    if (roomId) {
      socket.to(`room:${roomId}`).emit('chat:message:receive', messagePayload);
      // Also send ack back to sender so sender UI updates immediately
      socket.emit('chat:message:ack', { clientMessageId, serverId: messagePayload.id, status: 'sent' });
    }

    // If target recipientId is provided, deliver to their personal room
    if (recipientId) {
      io.to(`user:${recipientId}`).emit('chat:message:receive', messagePayload);
      io.to(`user:${recipientId}`).emit('notification:new', {
        type: 'CHAT_MESSAGE',
        title: `Message from ${senderName || 'Team Member'}`,
        body: message ? message.slice(0, 80) : 'Sent an attachment',
        senderId,
        roomId
      });
    }

    console.log(`[CHAT] Message sent in room ${roomId} by ${socket.userId}`);
  });

  /**
   * Join a specific chat channel or direct message room
   */
  socket.on('chat:room:join', ({ roomId }) => {
    if (!roomId) return;
    socket.join(`room:${roomId}`);
    console.log(`[CHAT] Socket ${socket.id} joined room ${roomId}`);
  });

  /**
   * Leave a chat room
   */
  socket.on('chat:room:leave', ({ roomId }) => {
    if (!roomId) return;
    socket.leave(`room:${roomId}`);
    console.log(`[CHAT] Socket ${socket.id} left room ${roomId}`);
  });

  /**
   * Live Typing Indicator
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
    if (recipientId) {
      io.to(`user:${recipientId}`).emit('chat:typing', payload);
    }
  });

  /**
   * Message Read Receipt
   */
  socket.on('chat:read', ({ roomId, messageIds = [], readerId }) => {
    const payload = {
      roomId,
      messageIds,
      readerId: readerId || socket.userId,
      readAt: new Date().toISOString()
    };

    if (roomId) {
      socket.to(`room:${roomId}`).emit('chat:read:receipt', payload);
    }
  });
}
