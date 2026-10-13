/**
 * WebRTC Signaling & Call Handler: 1-on-1 and Group Voice/Video Calls & Screen Sharing
 * Persists Call Logs (completed, missed, declined, busy) directly into crm_chat_messages.
 */

import { saveMessageToDb, addMessageToRoomCache } from './chatHandler.js';

// Memory map: activeCallRooms (roomId -> { callerId, calleeId, callType, startedAt, participants: Set(socketId) })
const activeCalls = new Map();

/**
 * Record a call entry message into crm_chat_messages and broadcast to the chat room
 */
async function recordCallLogMessage(io, { call, callStatus, duration = 0 }) {
  if (!call || call.logRecorded) return;
  call.logRecorded = true;

  const isVideo = call.callType === 'video';
  const callTitle = isVideo ? 'Video Call' : 'Voice Call';
  let msgText = '';

  if (callStatus === 'completed') {
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    msgText = `${isVideo ? '📹' : '📞'} ${callTitle} • ${durStr}`;
  } else if (callStatus === 'declined') {
    msgText = `${isVideo ? '📹' : '📞'} Declined ${callTitle}`;
  } else if (callStatus === 'missed') {
    msgText = `${isVideo ? '📹' : '📞'} Missed ${callTitle}`;
  } else if (callStatus === 'busy') {
    msgText = `${isVideo ? '📹' : '📞'} Busy ${callTitle}`;
  } else {
    msgText = `${isVideo ? '📹' : '📞'} ${callTitle}`;
  }

  const messagePayload = {
    id: `call_${call.roomId}_${Date.now()}`,
    roomId: call.chatRoomId,
    workspaceId: call.workspaceId || null,
    senderId: call.callerId,
    senderName: call.callerName || 'Sales Representative',
    senderAvatar: call.callerAvatar || null,
    recipientId: call.calleeId,
    message: msgText,
    attachments: [
      {
        type: 'call_log',
        callType: call.callType || 'audio',
        callStatus, // 'completed' | 'declined' | 'missed' | 'busy'
        duration,
        callerId: call.callerId,
        callerName: call.callerName,
        calleeId: call.calleeId,
        calleeName: call.calleeName,
        timestamp: new Date().toISOString()
      }
    ],
    timestamp: new Date().toISOString(),
    delivered: true,
    read: false
  };

  try {
    addMessageToRoomCache(call.chatRoomId, messagePayload);
    await saveMessageToDb(messagePayload);

    // Broadcast in real-time to active chat room
    io.to(`room:${call.chatRoomId}`).emit('chat:message:receive', messagePayload);
    // Also notify direct personal user rooms
    if (call.callerId) io.to(`user:${call.callerId}`).emit('chat:message:receive', messagePayload);
    if (call.calleeId) io.to(`user:${call.calleeId}`).emit('chat:message:receive', messagePayload);

    console.log(`[CALL_LOG] Saved call log to crm_chat_messages (Room: ${call.chatRoomId}, Status: ${callStatus}, Duration: ${duration}s)`);
  } catch (err) {
    console.error('[CALL_LOG_ERROR] Failed to save call log:', err.message || err);
  }
}

export function setupCallHandler(io, socket) {
  /**
   * 1. CALL INVITATION (Caller -> Server -> Callee)
   */
  socket.on('call:invite', ({ calleeId, roomId, callType = 'audio', workspaceId, callerInfo = {} }) => {
    if (!calleeId) {
      console.warn(`[WEBRTC] call:invite dropped - missing calleeId from socket ${socket.id} (${socket.userId})`);
      return;
    }

    const cleanCalleeId = String(calleeId);
    const callerId = socket.userId ? String(socket.userId) : (callerInfo?.id ? String(callerInfo.id) : null);
    const callRoomId = roomId || `call_${callerId || 'anon'}_${cleanCalleeId}_${Date.now()}`;
    const chatRoomId = callerId ? [callerId, cleanCalleeId].sort().join('_') : `chat_${cleanCalleeId}`;
    const wsId = workspaceId || socket.workspaceId || null;
    socket.join(`call:${callRoomId}`);

    activeCalls.set(callRoomId, {
      roomId: callRoomId,
      chatRoomId,
      workspaceId: wsId,
      callerId,
      callerName: callerInfo.name || socket.userName || 'Sales Representative',
      callerAvatar: callerInfo.avatar || socket.avatar || null,
      calleeId: cleanCalleeId,
      calleeName: null,
      calleeAvatar: null,
      callType, // 'audio' | 'video'
      status: 'ringing',
      startedAt: new Date().toISOString(),
      connectedAt: null,
      logRecorded: false,
      participants: new Set([socket.id])
    });

    console.log(`[WEBRTC] Emitting call:incoming to user:${cleanCalleeId} & ${cleanCalleeId} (caller: ${callerId}, callee: ${cleanCalleeId})`);

    // Ring target user personal room
    io.to(`user:${cleanCalleeId}`).to(cleanCalleeId).emit('call:incoming', {
      roomId: callRoomId,
      callerId,
      callerName: callerInfo.name || socket.userName || 'Sales Representative',
      callerAvatar: callerInfo.avatar || socket.avatar,
      callerTitle: callerInfo.title || 'Team Member',
      callType,
      timestamp: new Date().toISOString()
    });

    // Notify caller that invite was dispatched
    socket.emit('call:invite:sent', { roomId: callRoomId, calleeId: cleanCalleeId });

    console.log(`[WEBRTC] Call invite sent from ${callerId} to ${cleanCalleeId} (Room: ${callRoomId}, Type: ${callType})`);
  });

  /**
   * 2. CALL RESPONSE (Callee accepts or rejects the call)
   */
  socket.on('call:response', async ({ roomId, accepted, reason = 'declined' }) => {
    if (!roomId) return;

    const call = activeCalls.get(roomId);

    if (accepted) {
      socket.join(`call:${roomId}`);
      if (call) {
        call.status = 'connected';
        call.connectedAt = new Date().toISOString();
        call.calleeName = socket.userName || call.calleeName;
        call.calleeAvatar = socket.avatar || call.calleeAvatar;
        call.participants.add(socket.id);
      }

      const payload = {
        roomId,
        calleeId: socket.userId,
        calleeName: socket.userName,
        calleeAvatar: socket.avatar
      };

      // Notify caller specifically (to avoid duplicate events and SDP Glare on callee)
      if (call?.callerId) {
        io.to(`user:${call.callerId}`).to(call.callerId).emit('call:accepted', payload);
      } else {
        socket.to(`call:${roomId}`).emit('call:accepted', payload);
      }

      console.log(`[WEBRTC] Call accepted for room ${roomId} by ${socket.userId}`);
    } else {
      // Notify caller that call was rejected
      if (call?.callerId) {
        io.to(`user:${call.callerId}`).to(call.callerId).emit('call:rejected', {
          roomId,
          calleeId: socket.userId,
          reason // 'declined', 'busy', 'timeout'
        });
      } else {
        socket.to(`call:${roomId}`).emit('call:rejected', { roomId, reason });
      }

      if (call) {
        call.calleeName = socket.userName || call.calleeName;
        call.calleeAvatar = socket.avatar || call.calleeAvatar;
        const callStatus = reason === 'busy' ? 'busy' : reason === 'timeout' ? 'missed' : 'declined';
        await recordCallLogMessage(io, {
          call,
          callStatus,
          duration: 0
        });
        activeCalls.delete(roomId);
      }

      console.log(`[WEBRTC] Call rejected for room ${roomId} by ${socket.userId} (Reason: ${reason})`);
    }
  });

  /**
   * 3. WEBRTC SDP OFFER (Caller sends Session Description Offer)
   */
  socket.on('call:sdp:offer', ({ roomId, sdp }) => {
    if (!roomId || !sdp) return;
    socket.to(`call:${roomId}`).emit('call:sdp:offer', {
      roomId,
      sdp,
      senderId: socket.userId
    });
  });

  /**
   * 4. WEBRTC SDP ANSWER (Callee sends Session Description Answer)
   */
  socket.on('call:sdp:answer', ({ roomId, sdp }) => {
    if (!roomId || !sdp) return;
    socket.to(`call:${roomId}`).emit('call:sdp:answer', {
      roomId,
      sdp,
      senderId: socket.userId
    });
  });

  /**
   * 5. ICE CANDIDATES (Network Route Discovery for NAT Traversal)
   */
  socket.on('call:ice:candidate', ({ roomId, candidate }) => {
    if (!roomId || !candidate) return;
    socket.to(`call:${roomId}`).emit('call:ice:candidate', {
      roomId,
      candidate,
      senderId: socket.userId
    });
  });

  /**
   * 6. MEDIA STATE TOGGLE (Mute Audio, Disable Video, Screen Share)
   */
  socket.on('call:media:toggle', ({ roomId, mediaType, enabled }) => {
    if (!roomId) return;
    socket.to(`call:${roomId}`).emit('call:media:toggle', {
      roomId,
      userId: socket.userId,
      mediaType,
      enabled
    });
  });

  /**
   * 7. HANGUP / END CALL
   */
  socket.on('call:hangup', async ({ roomId, duration = 0 }) => {
    if (!roomId) return;

    const call = activeCalls.get(roomId);
    const payload = {
      roomId,
      endedBy: socket.userId,
      endedByName: socket.userName,
      duration
    };

    io.to(`call:${roomId}`).emit('call:ended', payload);

    // If caller cancels before callee joined the room, notify callee personal room to stop ringing
    if (call) {
      if (call.callerId) io.to(`user:${call.callerId}`).emit('call:ended', payload);
      if (call.calleeId) io.to(`user:${call.calleeId}`).emit('call:ended', payload);

      let finalDuration = duration;
      let callStatus = 'completed';

      if (call.status === 'ringing') {
        callStatus = 'missed';
        finalDuration = 0;
      } else if (call.status === 'connected') {
        callStatus = 'completed';
        if (!finalDuration && call.connectedAt) {
          finalDuration = Math.max(1, Math.round((Date.now() - new Date(call.connectedAt).getTime()) / 1000));
        }
      }

      await recordCallLogMessage(io, {
        call,
        callStatus,
        duration: finalDuration
      });

      activeCalls.delete(roomId);
    }

    socket.leave(`call:${roomId}`);

    console.log(`[WEBRTC] Call ended in room ${roomId} by ${socket.userId} (Duration: ${duration}s)`);
  });

  /**
   * 8. Clean up active call on unexpected socket disconnect
   */
  socket.on('disconnect', async () => {
    for (const [roomId, call] of activeCalls.entries()) {
      if (call.participants.has(socket.id) || call.callerId === socket.userId || call.calleeId === socket.userId) {
        const payload = {
          roomId,
          endedBy: socket.userId,
          endedByName: socket.userName,
          reason: 'disconnected'
        };
        io.to(`call:${roomId}`).emit('call:ended', payload);
        if (call.callerId) io.to(`user:${call.callerId}`).emit('call:ended', payload);
        if (call.calleeId) io.to(`user:${call.calleeId}`).emit('call:ended', payload);

        let finalDuration = 0;
        let callStatus = 'missed';
        if (call.status === 'connected') {
          callStatus = 'completed';
          if (call.connectedAt) {
            finalDuration = Math.max(1, Math.round((Date.now() - new Date(call.connectedAt).getTime()) / 1000));
          }
        }

        await recordCallLogMessage(io, {
          call,
          callStatus,
          duration: finalDuration
        });

        activeCalls.delete(roomId);
        console.log(`[WEBRTC] Call in room ${roomId} ended due to disconnect of ${socket.userId}`);
      }
    }
  });

  /**
   * Multi-Party Room Mesh Signaling (For Team Group Calls)
   */
  socket.on('room:mesh:join', ({ roomId }) => {
    if (!roomId) return;
    socket.join(`mesh:${roomId}`);
    socket.to(`mesh:${roomId}`).emit('room:mesh:user-joined', {
      userId: socket.userId,
      socketId: socket.id,
      userName: socket.userName,
      avatar: socket.avatar
    });
  });

  socket.on('room:mesh:signal', ({ targetSocketId, signalData }) => {
    io.to(targetSocketId).emit('room:mesh:signal', {
      senderSocketId: socket.id,
      senderUserId: socket.userId,
      signalData
    });
  });
}
