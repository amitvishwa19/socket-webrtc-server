/**
 * Presence Handler: Manages online users, status (online/busy/away), and workspace rooms
 */

// Memory store: workspaceId -> Map(userId -> { socketId, userId, name, avatar, status, lastSeen })
const workspaceUsers = new Map();

// Map: socketId -> { userId, workspaceId }
const socketToUser = new Map();

import { registerUserPushToken } from '../utils/pushNotification.js';
import { canUserAccessWorkspace } from '../lib/auth.js';

export function setupPresenceHandler(io, socket) {
  /**
   * User registers their presence in a workspace
   */
  socket.on('user:join', async ({ workspaceId, expoPushToken, deviceToken }) => {
    // 🔒 Security: Use cryptographically verified identity from socket handshake
    const cleanUserId = socket.userId;
    if (!cleanUserId) {
      console.warn(`[PRESENCE] user:join rejected - unauthenticated socket ${socket.id}`);
      socket.emit('error:unauthorized', { message: 'Authentication required' });
      return;
    }

    const wsId = workspaceId ? String(workspaceId) : 'default';

    // 🔒 Security: Validate workspace membership
    if (wsId !== 'default') {
      const hasAccess = await canUserAccessWorkspace(socket, wsId);
      if (!hasAccess) {
        console.warn(`[PRESENCE] user:join rejected - user ${cleanUserId} lacks access to workspace ${wsId}`);
        socket.emit('error:unauthorized', { message: 'Unauthorized workspace access' });
        return;
      }
    }

    if (expoPushToken || deviceToken) {
      registerUserPushToken(cleanUserId, { expoPushToken, deviceToken });
    }

    socket.workspaceId = wsId;

    // Clean up previous workspace registration if rejoining different workspace
    const prevMeta = socketToUser.get(socket.id);
    if (prevMeta && prevMeta.workspaceId !== wsId) {
      const prevWsId = prevMeta.workspaceId;
      console.log(`[PRESENCE] User ${cleanUserId} migrating from workspace ${prevWsId} to ${wsId}`);
      if (workspaceUsers.has(prevWsId)) {
        const prevMap = workspaceUsers.get(prevWsId);
        prevMap.delete(cleanUserId);
        const prevOnlineList = Array.from(prevMap.values());
        io.to(`workspace:${prevWsId}`).emit('presence:sync', prevOnlineList);
        if (prevMap.size === 0) workspaceUsers.delete(prevWsId);
      }
      socket.leave(`workspace:${prevWsId}`);
    }

    // Join workspace room and personal user room for targeted notifications
    if (wsId !== 'default') {
      socket.join(`workspace:${wsId}`);
    }
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
      name: socket.userName || 'User',
      avatar: socket.avatar || null,
      status: 'online',
      joinedAt: new Date().toISOString()
    });

    // Broadcast updated online users to all members in workspace
    const onlineList = Array.from(usersMap.values());
    io.to(`workspace:${wsId}`).emit('presence:sync', onlineList);

    console.log(`[PRESENCE] User joined: ${socket.userName} (${cleanUserId}) in workspace ${wsId} [socket: ${socket.id}]`);
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
