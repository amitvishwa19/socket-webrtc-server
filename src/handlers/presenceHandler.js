/**
 * Presence Handler: Manages online users, status (online/busy/away), and workspace rooms
 */

// Memory store: workspaceId -> Map(userId -> { socketId, userId, name, avatar, status, lastSeen })
const workspaceUsers = new Map();

// Map: socketId -> { userId, workspaceId }
const socketToUser = new Map();

import { registerUserPushToken } from '../utils/pushNotification.js';

export function setupPresenceHandler(io, socket) {
  /**
   * User registers their presence in a workspace
   */
  socket.on('user:join', ({ userId, workspaceId, userName, avatar, expoPushToken, deviceToken }) => {
    if (!userId) {
      console.warn(`[PRESENCE] user:join rejected - missing userId (socket: ${socket.id})`);
      return;
    }

    const cleanUserId = String(userId);
    const wsId = workspaceId ? String(workspaceId) : 'default';

    if (expoPushToken || deviceToken) {
      registerUserPushToken(cleanUserId, { expoPushToken, deviceToken });
    }

    socket.userId = cleanUserId;
    socket.workspaceId = wsId;
    socket.userName = userName || 'User';
    socket.avatar = avatar || null;

    // Join workspace room and personal user room for targeted notifications
    socket.join(`workspace:${wsId}`);
    socket.join(`user:${cleanUserId}`);
    socket.join(cleanUserId);

    socketToUser.set(socket.id, { userId: cleanUserId, workspaceId: wsId });

    if (!workspaceUsers.has(wsId)) {
      workspaceUsers.set(wsId, new Map());
    }

    const usersMap = workspaceUsers.get(wsId);
    usersMap.set(cleanUserId, {
      userId: cleanUserId,
      socketId: socket.id,
      name: userName || 'User',
      avatar: avatar || null,
      status: 'online',
      joinedAt: new Date().toISOString()
    });

    // Broadcast updated online users to all members in workspace
    const onlineList = Array.from(usersMap.values());
    io.to(`workspace:${wsId}`).emit('presence:sync', onlineList);

    console.log(`[PRESENCE] User joined: ${userName} (${cleanUserId}) in workspace ${wsId} [socket: ${socket.id}]`);
  });

  /**
   * User updates their status (e.g. 'online', 'busy', 'in-call', 'away')
   */
  socket.on('presence:status:update', ({ status }) => {
    const { userId, workspaceId } = socketToUser.get(socket.id) || {};
    if (!userId || !workspaceId) return;

    const usersMap = workspaceUsers.get(workspaceId);
    if (usersMap && usersMap.has(userId)) {
      const user = usersMap.get(userId);
      user.status = status || 'online';
      usersMap.set(userId, user);

      io.to(`workspace:${workspaceId}`).emit('presence:user:status', {
        userId,
        status: user.status
      });
    }
  });

  /**
   * Handle user disconnect
   */
  socket.on('disconnect', () => {
    const userMeta = socketToUser.get(socket.id);
    if (!userMeta) return;

    const { userId, workspaceId } = userMeta;
    socketToUser.delete(socket.id);

    if (workspaceUsers.has(workspaceId)) {
      const usersMap = workspaceUsers.get(workspaceId);
      usersMap.delete(userId);

      const onlineList = Array.from(usersMap.values());
      io.to(`workspace:${workspaceId}`).emit('presence:sync', onlineList);
      io.to(`workspace:${workspaceId}`).emit('presence:user:left', { userId });

      if (usersMap.size === 0) {
        workspaceUsers.delete(workspaceId);
      }
    }

    console.log(`[PRESENCE] User disconnected: ${userId} from workspace ${workspaceId}`);
  });
}

export function getUserSocket(userId) {
  for (const [socketId, meta] of socketToUser.entries()) {
    if (meta.userId === userId) return socketId;
  }
  return null;
}

export function getWorkspaceOnlineUsers(workspaceId) {
  if (!workspaceUsers.has(workspaceId)) return [];
  return Array.from(workspaceUsers.get(workspaceId).values());
}
