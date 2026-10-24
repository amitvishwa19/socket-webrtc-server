import { Router } from 'express';
import crypto from 'crypto';
import { sendEmailPushNotification } from '../utils/pushNotification.js';

export function createInternalRouter(io) {
  const router = Router();
  const configuredSecret = process.env.INTERNAL_SERVICE_SECRET || 'devlomatix_internal_secret_key_2026';

  router.post('/emit', async (req, res) => {
    const authHeader = req.headers['x-internal-secret'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized: missing internal secret' });
    }

    const headerBuf = Buffer.from(String(authHeader));
    const secretBuf = Buffer.from(String(configuredSecret));

    if (headerBuf.length !== secretBuf.length || !crypto.timingSafeEqual(headerBuf, secretBuf)) {
      return res.status(401).json({ error: 'Unauthorized: invalid internal secret' });
    }

    const { workspaceId, targetUserId, targetRoom, event, data } = req.body || {};
    if (!workspaceId || !event) {
      return res.status(400).json({ error: 'workspaceId and event are required' });
    }

    // 1. Direct Targeted User dispatch (1-to-1 alert)
    if (targetUserId) {
      io.to(`user:${targetUserId}`).emit(event, data);
      io.to(String(targetUserId)).emit(event, data);
      console.log(`[INTERNAL_EMIT] Targeted event '${event}' dispatched to user '${targetUserId}'`);
    }
    // 2. Specific Resource Room (e.g. thread:xxx, deal:xxx)
    else if (targetRoom) {
      io.to(targetRoom).emit(event, data);
      console.log(`[INTERNAL_EMIT] Room event '${event}' dispatched to room '${targetRoom}'`);
    }
    // 3. Workspace-wide Broadcast
    else {
      io.to(`workspace:${workspaceId}`).emit(event, data);
      console.log(`[INTERNAL_EMIT] Broadcasted event '${event}' to room 'workspace:${workspaceId}'`);
    }

    // Background push notification trigger for emails if targetUserId is specified
    if (event === 'crm:mailbox:new_email' && targetUserId) {
      sendEmailPushNotification({
        userId: targetUserId,
        senderName: data?.contactName || data?.fromName || data?.fromEmail,
        subject: data?.subject,
        snippet: data?.snippet,
        threadId: data?.threadId,
        workspaceId
      }).catch(err => console.warn('[INTERNAL_PUSH_EMAIL_WARN]', err?.message));
    }

    return res.status(200).json({
      success: true,
      workspaceId,
      targetUserId: targetUserId || null,
      targetRoom: targetRoom || null,
      event
    });
  });

  return router;
}
