/**
 * Presence Handler: Manages online users, status (online/busy/away), and workspace rooms
 */

// Memory store: workspaceId -> Map(userId -> { socketId, userId, name, avatar, status, lastSeen })
const workspaceUsers = new Map();

// Map: socketId -> { userId, workspaceId }
const socketToUser = new Map();

export function setupPresenceHandler(io, socket) {
  /**
   * User registers their presence in a workspace
   */
  socket.on('user:join', ({ userId, workspaceId, userName, avatar }) => {
    if (!userId || !workspaceId) return;

    socket.userId = userId;
    socket.workspaceId = workspaceId;
    socket.userName = userName || 'User';
    socket.avatar = avatar || null;

    // Join workspace room and personal user room for targeted notifications
    socket.join(`workspace:${workspaceId}`);
    socket.join(`user:${userId}`);

    socketToUser.set(socket.id, { userId, workspaceId });

    if (!workspaceUsers.has(workspaceId)) {
      workspaceUsers.set(workspaceId, new Map());
    }

    const usersMap = workspaceUsers.get(workspaceId);
    usersMap.set(userId, {
      userId,
      socketId: socket.id,
      name: userName || 'User',
      avatar: avatar || null,
      status: 'online',
      joinedAt: new Date().toISOString()
    });

    // Broadcast updated online users to all members in workspace
    const onlineList = Array.from(usersMap.values());
    io.to(`workspace:${workspaceId}`).emit('presence:sync', onlineList);

    console.log(`[PRESENCE] User joined: ${userName} (${userId}) in workspace ${workspaceId}`);
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
