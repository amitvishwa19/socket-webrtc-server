import { prisma } from './prisma.js';

const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];

const maskHeaders = (headers) => {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      out[key] = typeof value === 'string' && value.length > 0
        ? `${value.slice(0, 10)}...`
        : '***';
    } else {
      out[key] = value;
    }
  }
  return out;
};

const stripQuery = (url) => String(url).split('?')[0];

export async function logCronRequest(req, options = {}) {
  try {
    const rawUrl = req?.originalUrl || req?.url || options.endpoint || '/cron';
    const endpoint = options.endpoint || stripQuery(rawUrl);
    const method = req?.method || options.method || 'GET';

    const ipAddress = req?.headers?.['x-forwarded-for'] ||
      req?.headers?.['x-real-ip'] ||
      req?.socket?.remoteAddress ||
      '127.0.0.1';

    const userAgent = req?.headers?.['user-agent'] || 'cron-client';
    const headersObj = maskHeaders(req?.headers || {});

    let source = options.source;
    if (!source) {
      if (headersObj['x-render-cron'] || userAgent.toLowerCase().includes('render')) {
        source = 'RENDER';
      } else if (headersObj['x-vercel-cron'] || userAgent.toLowerCase().includes('vercel')) {
        source = 'VERCEL';
      } else if (userAgent.toLowerCase().includes('cron-job.org')) {
        source = 'CRON_JOB_ORG';
      } else if (userAgent.toLowerCase().includes('github')) {
        source = 'GITHUB_ACTIONS';
      } else {
        source = 'EXTERNAL_WEBHOOK';
      }
    }

    const queryParams = options.queryParams ?? (req?.query
      ? { ...req.query, secret: undefined, token: undefined }
      : null);

    const payload = options.payload ?? req?.body ?? null;

    const logRecord = await prisma.cronLog.create({
      data: {
        jobName: options.jobName || req?.query?.job || 'Incoming Request',
        source,
        endpoint,
        method,
        headers: headersObj,
        queryParams,
        payload,
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

export default logCronRequest;
