import { Router } from 'express';

export function createInternalRouter(io) {
  const router = Router();
  const secret = process.env.INTERNAL_SERVICE_SECRET || 'devlomatix_internal_secret_key_2026';

  router.post('/emit', (req, res) => {
    const authHeader = req.headers['x-internal-secret'];
    if (authHeader !== secret) {
      return res.status(401).json({ error: 'Unauthorized: invalid internal secret' });
    }

    const { workspaceId, event, data } = req.body || {};
    if (!workspaceId || !event) {
      return res.status(400).json({ error: 'workspaceId and event are required' });
    }

    // Broadcast to all sockets subscribed to this workspace
    io.to(`workspace:${workspaceId}`).emit(event, data);

    console.log(`[INTERNAL_EMIT] Broadcasted event '${event}' to room 'workspace:${workspaceId}'`);

    return res.status(200).json({
      success: true,
      workspaceId,
      event
    });
  });

  return router;
}
