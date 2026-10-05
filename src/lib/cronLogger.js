import { prisma } from './prisma.js';

/**
 * Utility to log incoming cron requests into the database from the socket server.
 */
export async function logCronRequest(req, options = {}) {
  try {
    const endpoint = req?.originalUrl || req?.url || options.endpoint || '/cron';
    const method = req?.method || options.method || 'GET';
    const headersObj = req?.headers || {};

    const ipAddress = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '127.0.0.1';
    const userAgent = req?.headers?.['user-agent'] || 'cron-client';

    let source = options.source;
    if (!source) {
      if (headersObj['x-render-cron'] || userAgent.toLowerCase().includes('render')) {
        source = 'RENDER';
      } else if (headersObj['x-vercel-cron'] || userAgent.toLowerCase().includes('vercel')) {
        source = 'VERCEL';
      } else if (userAgent.toLowerCase().includes('cron-job.org')) {
        source = 'CRON_JOB_ORG';
      } else {
        source = 'EXTERNAL_WEBHOOK';
      }
    }

    const logRecord = await prisma.cronLog.create({
      data: {
        jobName: options.jobName || req?.query?.job || 'Incoming Cron',
        source,
        endpoint,
        method,
        headers: headersObj,
        queryParams: req?.query || options.queryParams || null,
        payload: req?.body || options.payload || null,
        ipAddress: typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : null,
        userAgent,
        status: options.status || (options.statusCode && options.statusCode >= 400 ? 'FAILED' : 'SUCCESS'),
        statusCode: options.statusCode || 200,
        response: options.response || null,
        errorMessage: options.errorMessage || null,
        durationMs: options.durationMs || 0,
        workspaceId: options.workspaceId || null,
        cronId: options.cronId || null,
        completedAt: new Date()
      }
    });

    return logRecord;
  } catch (err) {
    console.error('[CRON_LOG_ERROR] Failed to save cron log to database:', err);
    return null;
  }
}
