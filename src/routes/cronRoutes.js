import { Router } from 'express';

export function createCronRouter(io) {
  const router = Router();

  const handleCron = (req, res, namedJob = null) => {

    console.log(`[CRON] ${namedJob || req.query?.job || req.query?.name || 'Devlomatix Cron Heartbeat'} executed at ${new Date().toISOString()}`);
    const startedAt = Date.now();
    const { job, name, source, workspaceId, cronId } = req.query || {};
    const jobName = namedJob || job || name || 'Devlomatix Cron Heartbeat';

    res.json({
      success: true,
      status: 'awake',
      jobName,
      message: `Cron job [${jobName}] executed-render`,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.floor(process.uptime()),
      activeSockets: io?.engine?.clientsCount || 0,
      source: source || null,
      workspaceId: workspaceId || null,
      cronId: cronId || null,
      durationMs: Date.now() - startedAt
    });
  };

  router.all('/', (req, res) => handleCron(req, res));
  router.all('/:jobName', (req, res) => handleCron(req, res, req.params.jobName));

  return router;
}

export default createCronRouter;
