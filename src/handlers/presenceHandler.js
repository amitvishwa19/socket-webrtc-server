/**
 * Presence Handler: Global userId-based online presence
 * No workspace scoping — all authenticated users share a global presence list.
 * Clients filter by their own team members locally.
 */

import { registerUserPushToken } from '../utils/pushNotification.js';

// Global online users map: userId -> { userId, socketId, name, avatar, status, joinedAt }
const onlineUsersMap = new Map();

// socketId -> userId (for cleanup on disconnect)
const socketToUserId = new Map();

const PRESENCE_ROOM = 'global:presence';

/**
 * Broadcast the current online user list to all presence subscribers
 */
function broadcastPresence(io) {
  const onlineList = Array.from(onlineUsersMap.values());
  io.to(PRESENCE_ROOM).emit('presence:sync', onlineList);
}

export function setupPresenceHandler(io, socket) {
  // Every authenticated socket immediately joins the global presence room
  socket.join(PRESENCE_ROOM);

  /**
   * User registers their presence (called after socket connects)
   * workspaceId is optional and only used for workspace-specific room joins (calls, chat)
   */
  socket.on('user:join', async ({ workspaceId, expoPushToken, deviceToken } = {}) => {
    // Identity comes from verified JWT on the socket handshake — not the payload
    const cleanUserId = socket.userId;
    if (!cleanUserId) {
      console.warn(`[PRESENCE] user:join rejected - unauthenticated socket ${socket.id}`);
      socket.emit('error:unauthorized', { message: 'Authentication required' });
      return;
    }

    // Register push tokens if provided
    if (expoPushToken || deviceToken) {
      registerUserPushToken(cleanUserId, { expoPushToken, deviceToken });
    }

    // Join personal user rooms for targeted notifications & calls
    socket.join(`user:${cleanUserId}`);
    socket.join(cleanUserId);

    // Join workspace room if provided (used for calls, chat — not for presence)
    if (workspaceId && workspaceId !== 'default') {
      socket.workspaceId = String(workspaceId);
      socket.join(`workspace:${String(workspaceId)}`);
    }

    // Track this socket -> userId mapping
    socketToUserId.set(socket.id, cleanUserId);

    // Register / refresh user in global online map
    onlineUsersMap.set(cleanUserId, {
      userId: cleanUserId,
      socketId: socket.id,
      name: socket.userName || 'User',
      avatar: socket.avatar || null,
      status: 'online',
      joinedAt: new Date().toISOString()
    });

    // Broadcast updated list to everyone
    broadcastPresence(io);

    console.log(`[PRESENCE] User online: ${socket.userName} (${cleanUserId}) [socket: ${socket.id}]`);
  });

  /**
   * User updates their status (e.g. 'online', 'busy', 'in-call', 'away')
   */
  socket.on('presence:status:update', ({ status }) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId || !onlineUsersMap.has(userId)) return;

    const user = onlineUsersMap.get(userId);
    user.status = status || 'online';
    onlineUsersMap.set(userId, user);

    broadcastPresence(io);
  });

  /**
   * Handle user disconnect — remove from online map and notify all
   */
  socket.on('disconnect', () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;

    socketToUserId.delete(socket.id);

    // Only remove if this socket was the active one for that userId
    // (handles reconnects where a new socket takes over)
    const existing = onlineUsersMap.get(userId);
    if (existing && existing.socketId === socket.id) {
      onlineUsersMap.delete(userId);
      broadcastPresence(io);
      console.log(`[PRESENCE] User offline: ${userId}`);
    }
  });
}

/**
 * Get the socketId for a given userId (used by call handler)
 */
export function getUserSocket(userId) {
  const entry = onlineUsersMap.get(String(userId));
  return entry?.socketId || null;
}

/**
 * Get all currently online users
 */
export function getOnlineUsers() {
  return Array.from(onlineUsersMap.values());
}

/**
 * Legacy export — returns all online users regardless of workspace
 */
export function getWorkspaceOnlineUsers(_workspaceId) {
  return getOnlineUsers();
}
