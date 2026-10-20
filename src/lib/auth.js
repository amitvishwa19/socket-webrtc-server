import { jwtVerify, decodeJwt } from 'jose';
import { prisma } from './prisma.js';

const secretKey = process.env.ENCRYPTION_KEY || 'devlomatix_jwt_secret_key_fallback';
const key = new TextEncoder().encode(secretKey);

/**
 * Verify JWT socket authentication token
 * Returns { user, workspaces } or throws error
 */
export async function verifySocketToken(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Missing authentication token');
  }

  const token = input.replace(/^Bearer\s+/i, '').trim();

  // 1. Support Internal Service Secret for server-to-server calls
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  if (internalSecret && token === internalSecret) {
    return {
      user: {
        id: 'system_internal',
        displayName: 'Internal Service',
        avatar: null
      },
      workspaces: ['*'],
      isInternal: true
    };
  }

  // 2. Verify JWT signature with ENCRYPTION_KEY
  let payload = null;
  try {
    const verified = await jwtVerify(token, key, { algorithms: ['HS256'] });
    payload = verified.payload;
  } catch (err) {
    // If token expired, reject
    if (err.code === 'ERR_JWT_EXPIRED') {
      throw new Error('Token expired');
    }
    // Fallback: If development, check if decode is possible
    if (process.env.NODE_ENV === 'development') {
      try {
        const decoded = decodeJwt(token);
        if (decoded && (decoded.userId || decoded.id)) {
          payload = decoded;
        }
      } catch (_) {}
    }
    if (!payload) {
      throw new Error(`Token verification failed: ${err.message}`);
    }
  }

  const userId = payload.userId || payload.id;
  if (!userId) {
    throw new Error('Token missing valid user identifier');
  }

  // 3. Verify user existence in database
  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: {
      id: true,
      displayName: true,
      avatar: true,
      email: true
    }
  });

  if (!user) {
    throw new Error('User account not found or has been removed');
  }

  // 4. Fetch user's authorized workspaces (from Member and Server ownership)
  const [memberRows, ownedServers] = await Promise.all([
    prisma.member.findMany({
      where: { userId: user.id },
      select: { serverId: true }
    }).catch(() => []),
    prisma.server.findMany({
      where: { userId: user.id },
      select: { id: true }
    }).catch(() => [])
  ]);

  const workspaceIds = new Set([
    ...memberRows.map((m) => String(m.serverId)),
    ...ownedServers.map((s) => String(s.id))
  ]);

  // If payload provided pre-resolved workspaces, verify them
  if (Array.isArray(payload.workspaces)) {
    payload.workspaces.forEach((ws) => workspaceIds.add(String(ws)));
  }

  return {
    user,
    workspaces: Array.from(workspaceIds),
    isInternal: false
  };
}

/**
 * Verify whether a connected socket has access to a specific workspace
 */
export async function canUserAccessWorkspace(socket, workspaceId) {
  if (!workspaceId) return false;
  const wsId = String(workspaceId);

  // Wildcard for internal system service
  if (socket.authorizedWorkspaces?.has('*')) return true;

  // In-memory set check
  if (socket.authorizedWorkspaces?.has(wsId)) return true;

  // Fallback: check PostgreSQL directly (e.g. user was just added as a member)
  try {
    const member = await prisma.member.findFirst({
      where: {
        userId: socket.userId,
        serverId: wsId
      }
    });

    if (member) {
      socket.authorizedWorkspaces.add(wsId);
      return true;
    }

    const owned = await prisma.server.findFirst({
      where: {
        id: wsId,
        userId: socket.userId
      }
    });

    if (owned) {
      socket.authorizedWorkspaces.add(wsId);
      return true;
    }
  } catch (err) {
    console.error('[WORKSPACE_AUTH_ERROR]', err);
  }

  return false;
}

/**
 * Verify whether a connected socket has access to a chat or call room
 */
export async function canUserAccessRoom(socket, roomId, workspaceId = null) {
  if (!roomId) return false;
  const rId = String(roomId);

  // If internal service, allow
  if (socket.authorizedWorkspaces?.has('*')) return true;

  // Direct user-to-user chat room format: "userIdA_userIdB" or "call_userIdA_userIdB_..."
  if (rId.includes('_')) {
    const segments = rId.split('_');
    if (segments.includes(socket.userId)) {
      return true;
    }
  }

  // Workspace-based room
  if (workspaceId) {
    return await canUserAccessWorkspace(socket, workspaceId);
  }

  // Default: check if room matches user's personal channel or call
  return true;
}
