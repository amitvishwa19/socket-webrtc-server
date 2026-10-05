import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import { setupPresenceHandler } from './src/handlers/presenceHandler.js';
import { setupChatHandler } from './src/handlers/chatHandler.js';
import { setupCallHandler } from './src/handlers/callHandler.js';
import { createCronRouter } from './src/routes/cronRoutes.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

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
// ⏰ INCOMING CRON ROUTER & TABLE LOGGER
// ==========================================
// Mounts on both /cron and /api/cron for flexible scheduler support (Render, Vercel, Cron-Job.org)
const cronRouter = createCronRouter(io);
app.use('/cron', cronRouter);
app.use('/api/cron', cronRouter);

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

httpServer.listen(PORT, () => {
  console.log(`
  ======================================================
  🚀 Devlomatix Socket & WebRTC Server is Live!
  📡 Port: ${PORT}
  🌍 Environment: ${NODE_ENV}
  🩺 Health Endpoint: http://localhost:${PORT}/health
  ⏰ Cron Trigger:    http://localhost:${PORT}/cron
  📊 Cron History:    http://localhost:${PORT}/cron/history
  📈 Cron Stats:      http://localhost:${PORT}/cron/stats
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
