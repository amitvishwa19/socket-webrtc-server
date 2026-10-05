/**
 * WebRTC Signaling & Call Handler: 1-on-1 and Group Voice/Video Calls & Screen Sharing
 */

// Memory map: activeCallRooms (roomId -> { callerId, calleeId, callType, startedAt, participants: Set(socketId) })
const activeCalls = new Map();

export function setupCallHandler(io, socket) {
  /**
   * 1. CALL INVITATION (Caller -> Server -> Callee)
   */
  socket.on('call:invite', ({ calleeId, roomId, callType = 'video', callerInfo = {} }) => {
    if (!calleeId) return;

    const callRoomId = roomId || `call_${socket.userId}_${calleeId}_${Date.now()}`;
    socket.join(`call:${callRoomId}`);

    activeCalls.set(callRoomId, {
      roomId: callRoomId,
      callerId: socket.userId,
      calleeId,
      callType, // 'audio' | 'video'
      status: 'ringing',
      startedAt: new Date().toISOString(),
      participants: new Set([socket.id])
    });

    // Ring target user
    io.to(`user:${calleeId}`).emit('call:incoming', {
      roomId: callRoomId,
      callerId: socket.userId,
      callerName: callerInfo.name || socket.userName || 'Sales Representative',
      callerAvatar: callerInfo.avatar || socket.avatar,
      callerTitle: callerInfo.title || 'Team Member',
      callType,
      timestamp: new Date().toISOString()
    });

    // Notify caller that invite was dispatched
    socket.emit('call:invite:sent', { roomId: callRoomId, calleeId });

    console.log(`[WEBRTC] Call invite sent from ${socket.userId} to ${calleeId} (Room: ${callRoomId}, Type: ${callType})`);
  });

  /**
   * 2. CALL RESPONSE (Callee accepts or rejects the call)
   */
  socket.on('call:response', ({ roomId, accepted, reason = 'declined' }) => {
    if (!roomId) return;

    const call = activeCalls.get(roomId);

    if (accepted) {
      socket.join(`call:${roomId}`);
      if (call) {
        call.status = 'connected';
        call.connectedAt = new Date().toISOString();
        call.participants.add(socket.id);
      }

      // Notify the call room that callee has joined & accepted
      io.to(`call:${roomId}`).emit('call:accepted', {
        roomId,
        calleeId: socket.userId,
        calleeName: socket.userName,
        calleeAvatar: socket.avatar
      });

      console.log(`[WEBRTC] Call accepted for room ${roomId} by ${socket.userId}`);
    } else {
      // Notify the caller that the call was rejected/busy
      if (call) {
        io.to(`user:${call.callerId}`).emit('call:rejected', {
          roomId,
          calleeId: socket.userId,
          reason // 'declined', 'busy', 'timeout'
        });
        activeCalls.delete(roomId);
      } else {
        socket.to(`call:${roomId}`).emit('call:rejected', { roomId, reason });
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
    // mediaType: 'audio' | 'video' | 'screen'
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
  socket.on('call:hangup', ({ roomId, duration = 0 }) => {
    if (!roomId) return;

    const call = activeCalls.get(roomId);
    io.to(`call:${roomId}`).emit('call:ended', {
      roomId,
      endedBy: socket.userId,
      endedByName: socket.userName,
      duration
    });

    // Leave room
    socket.leave(`call:${roomId}`);
    activeCalls.delete(roomId);

    console.log(`[WEBRTC] Call ended in room ${roomId} by ${socket.userId} (Duration: ${duration}s)`);
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
