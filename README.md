# 🚀 Devlomatix Socket.io & WebRTC Signaling Server

A high-performance standalone Node.js server for real-time **Chat, WebRTC Voice & Video Calling, and Screen Sharing** for Devlomatix Enterprise CRM.

---

## 📦 Features

- **WebRTC Signaling Engine**: Session Description Protocol (SDP) Offer/Answer exchange and ICE Candidates relay for P2P encrypted HD Voice/Video calls and Screen Sharing.
- **Real-Time Chat Broker**: Direct and group message dispatch, typing indicators, read receipts, and reactions.
- **Presence Tracking**: Online/offline and in-call status sync isolated by `workspaceId`.
- **Render Ready**: Includes `/health` endpoint, graceful shutdown, and `render.yaml` blueprint.

---

## 🛠️ Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
PORT=5000
NODE_ENV=development
CORS_ORIGIN=*
```

### 3. Run the Server
```bash
npm run dev   # With auto-reload on Node 18+
# or
npm start
```

Server will start on `http://localhost:5000`. Test the health endpoint:
```bash
curl http://localhost:5000/health
```

---

## ☁️ How to Deploy on Render (Step-by-Step)

### Option A: 1-Click Render Blueprint (Recommended)
1. Push this folder to a GitHub / GitLab repository.
2. In your [Render Dashboard](https://dashboard.render.com/), click **New +** -> **Blueprint**.
3. Connect your repository. Render will automatically read `render.yaml` and configure:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
4. Click **Apply**.

### Option B: Manual Web Service on Render
1. Click **New +** -> **Web Service**.
2. Connect your Git repository (or specify root directory as `socket-webrtc-server`).
3. Set the following settings:
   - **Name**: `devlomatix-socket-webrtc`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
4. Add Environment Variables:
   - `PORT`: `10000` (Render default)
   - `NODE_ENV`: `production`
   - `CORS_ORIGIN`: `*` (or your CRM production URL e.g. `https://devlomatix.com`)
5. Click **Create Web Service**.

Once deployed, your live socket URL will be:
`https://devlomatix-socket-webrtc.onrender.com`

---

## 🔌 Connecting from the Web CRM Client

In your Next.js frontend `.env.local`:
```env
NEXT_PUBLIC_SOCKET_SERVER_URL=https://devlomatix-socket-webrtc.onrender.com
```
