import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { exec } from 'child_process';

import { setupPresenceHandler } from './src/handlers/presenceHandler.js';
import { setupChatHandler } from './src/handlers/chatHandler.js';
import { setupCallHandler } from './src/handlers/callHandler.js';
import { createCronRouter } from './src/routes/cronRoutes.js';
import { logCronRequest } from './src/lib/cronLogger.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const portArgIndex = process.argv.indexOf('--port');
const PORT = Number(
  (portArgIndex !== -1 ? process.argv[portArgIndex + 1] : null) || process.env.PORT || 5000
);
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// ==========================================
// 📥 INCOMING REQUEST LOGGER (console + CronLog table)
// ==========================================
const redactUrl = (url) =>
  String(url).replace(/([?&](?:secret|token)=)[^&]*/gi, '$1***');

const redactParams = (params) => {
  if (!params) return params;
  const out = { ...params };
  for (const key of ['secret', 'token']) {
    if (key in out) out[key] = '***';
  }
  return out;
};

const resolveJobName = (req) => {
  if (req.query?.job) return req.query.job;
  if (req.query?.name) return req.query.name;
  const pathOnly = String(req.originalUrl || req.url || '').split('?')[0];
  const cronSegment = pathOnly.match(/^\/(?:api\/)?cron(?:\/(.+))?$/);
  if (cronSegment) return cronSegment[1] || 'Cron Heartbeat';
  return 'Incoming Request';
};

app.use((req, res, next) => {
  const startedAt = Date.now();
  const path = redactUrl(req.originalUrl);
  const durationMs = () => Date.now() - startedAt;

  const persist = () => {
    logCronRequest(req, {
      jobName: resolveJobName(req),
      queryParams: redactParams(req.query),
      payload: redactParams(req.body),
      status: res.statusCode >= 400 ? 'FAILED' : 'SUCCESS',
      statusCode: res.statusCode,
      durationMs: durationMs()
    }).catch((err) => {
      console.error('[REQUEST_LOG_ERROR]', err);
    });
  };

  res.on('finish', () => {
    console.log(`[REQUEST] ${req.method} ${path} ${res.statusCode} ${durationMs()}ms`);
    persist();
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      console.log(`[REQUEST] ${req.method} ${path} CLOSED ${durationMs()}ms`);
      persist();
    }
  });

  next();
});

// Standard Express Middlewares
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(','),
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.io Setup with optimized ping/transports for Render & WebSocket stability
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(','),
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// ==========================================
// 🩺 HTTP HEALTH CHECK & METRIC ENDPOINTS (FOR RENDER)
// ==========================================

const startTime = Date.now();

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Devlomatix CRM WebRTC & Socket.io Signaling Server',
    environment: NODE_ENV,
    connectedClients: io.engine.clientsCount,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000)
  });
});

app.get('/health', (req, res) => {
  // 200 OK is mandatory for Render Health Check path
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    clientsCount: io.engine.clientsCount
  });
});

app.get('/metrics', (req, res) => {
  res.json({
    uptime: process.uptime(),
    activeSockets: io.engine.clientsCount,
    memoryUsage: process.memoryUsage()
  });
});

// ==========================================
// ⏰ KEEPALIVE CRON ROUTER
// ==========================================
const cronRouter = createCronRouter(io);
app.use('/cron', cronRouter);

// ==========================================
// 🔌 SOCKET.IO CONNECTION ROUTER
// ==========================================

io.on('connection', (socket) => {
  console.log(`[SOCKET_CONNECT] New client connected: ${socket.id}`);

  // Attach module event handlers
  setupPresenceHandler(io, socket);
  setupChatHandler(io, socket);
  setupCallHandler(io, socket);

  socket.on('error', (err) => {
    console.error(`[SOCKET_ERROR] Socket ${socket.id} error:`, err);
  });
});

// ==========================================
// 🚀 SERVER BOOTSTRAP & GRACEFUL SHUTDOWN
// ==========================================

function findPortOwner(port) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'netstat -ano -p tcp' : `lsof -ti tcp:${port} -sTCP:LISTEN`;

    exec(cmd, (err, stdout) => {
      if (err || !stdout) return resolve(null);

      if (isWindows) {
        const match = stdout.match(
          new RegExp(`^\\s*TCP\\s+\\S*:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`, 'im')
        );
        return resolve(match ? Number(match[1]) : null);
      }

      const pid = Number(stdout.split(/\r?\n/).find(Boolean)?.trim());
      resolve(pid || null);
    });
  });
}

function findProcessName(pid) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows
      ? `tasklist /FI "PID eq ${pid}" /FO CSV /NH`
      : `ps -p ${pid} -o comm=`;

    exec(cmd, (err, stdout) => {
      if (err || !stdout) return resolve('unknown');

      if (isWindows) {
        const match = stdout.match(/"([^"]+)"/);
        return resolve(match ? match[1] : 'unknown');
      }

      resolve(stdout.split(/\r?\n/).find(Boolean)?.trim() || 'unknown');
    });
  });
}

async function reportPortConflict(port) {
  const pid = await findPortOwner(port);
  const killHint = process.platform === 'win32'
    ? `taskkill //PID ${pid} //F`
    : `kill ${pid}`;

  let owner = 'unknown process';
  if (pid) {
    const name = await findProcessName(pid);
    owner = `${name} (PID ${pid})`;
  }

  console.error(`
  ======================================================
  ❌ PORT CONFLICT: Port ${port} is already in use
  🔍 Held by: ${owner}
  🔧 Free it with:  ${pid ? killHint : 'close the other app using this port'}
  💡 Or run on another port:  npm run dev
  ======================================================
  `);
}

httpServer.on('error', async (err) => {
  if (err.code === 'EADDRINUSE') {
    await reportPortConflict(PORT);
    process.exit(1);
  }

  console.error('[SERVER_ERROR]', err);
  process.exit(1);
});

httpServer.listen(PORT, () => {
  console.log(`
  ======================================================
  🚀 Devlomatix Socket & WebRTC Server is Live!
  📡 Port: ${PORT}
  🌍 Environment: ${NODE_ENV}
  🩺 Health Endpoint: http://localhost:${PORT}/health
  ⏰ Cron Trigger:    http://localhost:${PORT}/cron
  ======================================================
  `);
});

// Graceful termination for Render deployments
process.on('SIGTERM', () => {
  console.log('[SIGTERM] Shutting down socket server gracefully...');
  httpServer.close(() => {
    console.log('[SERVER_CLOSED] Socket server closed cleanly.');
    process.exit(0);
  });
});
