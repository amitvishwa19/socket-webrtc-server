import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { logCronRequest } from '../lib/cronLogger.js';

export function createCronRouter(io) {
  const router = Router();

  /**
   * Helper function to process and log any incoming cron trigger
   */
  async function handleCronTrigger(req, res, customJobName = null) {
    const startTime = Date.now();
    const query = req.query || {};
    const body = req.body || {};

    const jobName = customJobName ||
      query.job ||
      query.name ||
      body.job ||
      body.name ||
      'Cron Heartbeat';

    const source = query.source || body.source || null;
    const workspaceId = query.workspaceId || body.workspaceId || null;
    const cronId = query.cronId || body.cronId || null;

    try {
      // Collect server runtime metrics
      const activeClients = io ? io.engine?.clientsCount || 0 : 0;
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      const responsePayload = {
        success: true,
        jobName,
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
        serverMetrics: {
          uptimeSeconds: Math.floor(uptime),
          activeSockets: activeClients,
          heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100
        }
      };

      const durationMs = Date.now() - startTime;

      // Persist to PostgreSQL CronLog table
      const logRecord = await logCronRequest(req, {
        jobName,
        source,
        workspaceId,
        cronId,
        status: 'SUCCESS',
        statusCode: 200,
        response: responsePayload,
        durationMs
      });

      return res.status(200).json({
        ...responsePayload,
        logId: logRecord?.id || null,
        durationMs
      });
    } catch (error) {
      console.error('[CRON_ROUTE_ERROR]', error);

      const durationMs = Date.now() - startTime;

      const errorPayload = {
        success: false,
        jobName,
        status: 'FAILED',
        error: error.message,
        timestamp: new Date().toISOString()
      };

      const logRecord = await logCronRequest(req, {
        jobName,
        source,
        workspaceId,
        cronId,
        status: 'FAILED',
        statusCode: 500,
        errorMessage: error.message,
        response: errorPayload,
        durationMs
      });

      return res.status(500).json({
        ...errorPayload,
        logId: logRecord?.id || null,
        durationMs
      });
    }
  }

  // ==========================================
  // 1. PRIMARY CRON TRIGGER ENDPOINTS (GET/POST/ALL)
  // ==========================================

  // Root trigger: GET/POST /cron or /api/cron
  router.all('/', (req, res) => {
    return handleCronTrigger(req, res);
  });

  // Explicit trigger: /cron/trigger or /api/cron/trigger
  router.all('/trigger', (req, res) => {
    return handleCronTrigger(req, res);
  });

  // Keepalive trigger: /cron/keepalive or /api/cron/keepalive
  router.all('/keepalive', (req, res) => {
    return handleCronTrigger(req, res, 'Render Keepalive Ping');
  });

  // Webhook trigger: /cron/webhook or /api/cron/webhook
  router.all('/webhook', (req, res) => {
    return handleCronTrigger(req, res, 'External Webhook Cron');
  });

  // ==========================================
  // 2. MONITORING & AUDIT ENDPOINTS
  // ==========================================

  /**
   * GET /cron/history
   * Retrieve recent cron execution history from PostgreSQL table
   */
  router.get('/history', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const page = Math.max(parseInt(req.query.page) || 1, 1);
      const skip = (page - 1) * limit;

      const { status, jobName, source, workspaceId } = req.query;

      const where = {};
      if (status) where.status = status;
      if (jobName) where.jobName = { contains: jobName, mode: 'insensitive' };
      if (source) where.source = source;
      if (workspaceId) where.workspaceId = workspaceId;

      const [logs, total] = await Promise.all([
        prisma.cronLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.cronLog.count({ where })
      ]);

      return res.json({
        success: true,
        data: logs,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (err) {
      console.error('[CRON_HISTORY_ERROR]', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /cron/stats
   * Aggregated metrics of cron executions
   */
  router.get('/stats', async (req, res) => {
    try {
      const [totalCount, successCount, failedCount, recentLogs] = await Promise.all([
        prisma.cronLog.count(),
        prisma.cronLog.count({ where: { status: 'SUCCESS' } }),
        prisma.cronLog.count({ where: { status: { in: ['FAILED', 'UNAUTHORIZED', 'ERROR'] } } }),
        prisma.cronLog.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            jobName: true,
            source: true,
            status: true,
            statusCode: true,
            durationMs: true,
            createdAt: true
          }
        })
      ]);

      return res.json({
        success: true,
        stats: {
          totalExecutions: totalCount,
          successfulExecutions: successCount,
          failedExecutions: failedCount,
          successRatePercent: totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 100,
          recentExecutions: recentLogs
        }
      });
    } catch (err) {
      console.error('[CRON_STATS_ERROR]', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /cron/cleanup
   * Delete cron logs older than X days (default 30 days)
   */
  router.delete('/cleanup', async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const deleted = await prisma.cronLog.deleteMany({
        where: {
          createdAt: { lt: cutoffDate }
        }
      });

      return res.json({
        success: true,
        message: `Deleted ${deleted.count} cron logs older than ${days} days`,
        deletedCount: deleted.count
      });
    } catch (err) {
      console.error('[CRON_CLEANUP_ERROR]', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // 3. DYNAMIC NAMED CRON TRIGGER (:jobName)
  // ==========================================

  // e.g. /cron/sync-reports or /api/cron/cleanup-sessions
  router.all('/:jobName', (req, res) => {
    const jobName = req.params.jobName;
    return handleCronTrigger(req, res, jobName);
  });

  return router;
}

export default createCronRouter;
