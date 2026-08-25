# THRIFT ⚡

> **Zero-Knowledge, Zero-Storage, Zero-Cost Peer-to-Peer File Sharing.**

THRIFT is a lightning-fast, privacy-first web application for transferring files, encrypted text snippets, and links directly between devices in real time.

Data moves directly peer-to-peer using **WebRTC DataChannels**. The signaling server facilitates cryptographic device pairing and session routing, but **never inspects, receives, proxies, or stores your file payloads or transfer history**.

---

## ✨ Features

### 🔒 Core Security & Privacy
- **True P2P Architecture**: Files stream directly browser-to-browser via DTLS/SCTP-encrypted WebRTC DataChannels.
- **Zero Traces**: No accounts, no cloud buckets, no upload libraries, and no logs containing secrets, file names, or contents.
- **Constant-Time Verification**: 256-bit pairing secret tokens verified with `crypto.timingSafeEqual` to prevent timing attacks.
- **Privacy-Preserving Telemetry**: Clean in-memory counters; client IPs are SHA-256 hashed and never stored or logged raw.

### 🚀 Resilience & Network Traversal
- **Reconnection Grace Period (30s)**: If a mobile screen sleeps or Wi-Fi drops, the session stays alive in memory. Reconnect tokens automatically restore the session upon network recovery without restarting.
- **Same-Subnet Local Discovery**: Devices on the same Wi-Fi/subnet detect active local sessions while preserving zero-knowledge pairing security.
- **E2EE WebSocket Relay Fallback**: When symmetric NATs or corporate firewalls completely block P2P WebRTC channels, THRIFT transparently falls back to an encrypted binary pipe through the signaling server (with per-session byte caps).
- **Coturn Ephemeral TURN Integration**: Built-in HMAC-SHA1 dynamic credential generation compatible with free, self-hosted [Coturn](https://github.com/coturn/coturn) servers (`static-auth-secret`).

### 🎨 UI/UX & Aesthetics
- **Swiss Cyberpunk Dark Mode**: High-contrast, typography-driven interface with fluid spring micro-interactions.
- **Continuous Orbiting Glow**: Conic-gradient orbiting border animations on the cryptographic QR generator card.
- **Real-Time Transfer Visualizer**: Live speed metrics (MB/s), visual chunk progress bars, SHA-256 assembly verification, and two-way transfer acknowledgments.

---

## 🛠️ Architecture & Protocol

```text
  Host Device                          Signaling Server                        Guest Device
       │                                       │                                     │
       │─── 1. CREATE_SESSION ────────────────>│                                     │
       │<── 2. SESSION_CREATED (QR/Token) ─────│                                     │
       │                                       │<─── 3. JOIN_SESSION (ID + Secret) ──│
       │<── 4. CONNECTION_REQUEST ─────────────│─── 5. JOINING ─────────────────────>│
       │─── 6. ACCEPT_CONNECTION ─────────────>│                                     │
       │<── 7. SESSION_CONNECTED + ICE ────────│─── 8. SESSION_CONNECTED + ICE ─────>│
       │                                       │                                     │
       │══════════════════ WebRTC SDP & ICE Candidate Signaling ═════════════════════│
       │                                                                             │
       │◄══════════════ Direct Encrypted WebRTC DataChannel (P2P) ══════════════════►│
       │                                                                             │
       │   [Send Chunk 1] ──────────────────────────────────────────────────────────>│
       │   [Send Chunk 2] ──────────────────────────────────────────────────────────>│
       │   [Send FILE_COMPLETE] ────────────────────────────────────────────────────>│
       │<── [TRANSFER_ACK] ──────────────────────────────────────────────────────────│
```

---

## 📁 Repository Structure

```text
.
├── client/                     React + Vite Frontend
│   └── src/
│       ├── components/         BorderGlow, QR, FileDrop, Navbar, Visualizer
│       ├── hooks/              useWebSocketSession & useWebRTC lifecycle hooks
│       ├── lib/webrtc/         DataChannel engine, SDP signaling, chunking
│       └── pages/              Home application page
├── server/                     Node.js Signaling & Fallback Relay Server
│   ├── monitoring/             In-memory metrics tracker (/health & /metrics)
│   ├── relay/                  E2EE WebSocket relay fallback handlers
│   ├── security/               Tokens, rate limiters, Coturn HMAC generator
│   ├── session/                Session lifecycle, grace timers, IP discovery
│   ├── websocket/              Protocol validation & connection handlers
│   └── tests/                  Comprehensive test suite (33 tests)
├── .env.example                Environment variable configuration template
└── package.json                Root scripts & workspace orchestrator
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- **Node.js**: v18.0.0 or newer
- **npm**: v9.0.0 or newer
- Two browser tabs or devices on the same local network

### 1. Installation
Install dependencies for both client and server:

```bash
npm install --prefix client
npm install --prefix server
```

### 2. Run Development Servers
Start both the signaling server and frontend Vite dev server concurrently:

```bash
# Terminal 1: Signaling Server (Port 4000)
npm run dev:server

# Terminal 2: Vite Client (Port 5173)
npm run dev:client
```

Open `http://localhost:5173` in your browser.

---

## 🧪 Running Tests & Build Verification

Run the full automated test suite:

```bash
npm test
```

*Output:*
```text
✔ Token Generation (6 tests)
✔ Ephemeral TURN Credentials (4 tests)
✔ Protocol Validation (13 tests)
✔ Rate Limiter (3 tests)
✔ Metrics & Monitoring (1 test)
✔ SessionManager Unit Tests (4 tests)
✔ Integration Tests with All Features (4 tests)

Total: 33/33 tests passed
```

Build the production client bundle:

```bash
npm run build
```

---

## ⚙️ Configuration & Environment Variables

Copy `.env.example` to `.env` in the `server/` directory:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Signaling server HTTP / WebSocket port |
| `NODE_ENV` | `development` | Environment mode (`development` / `production`) |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed frontend origin checked on WebSocket upgrade |
| `SESSION_TTL_MS` | `600000` (10m) | Expiration time for unpaired QR sessions |
| `SESSION_IDLE_TIMEOUT_MS` | `300000` (5m) | Inactivity timeout for paired sessions |
| `RECONNECT_GRACE_MS` | `30000` (30s) | Grace period to hold session when peer disconnects |
| `STUN_SERVERS` | Google STUN | Comma-separated public STUN server list |
| `TURN_SERVERS` | `""` | Comma-separated TURN server URLs |
| `TURN_SHARED_SECRET` | `""` | Coturn `static-auth-secret` for ephemeral HMAC generation |
| `TURN_CREDENTIAL_TTL_S` | `21600` (6h) | Ephemeral TURN token lifetime |
| `RELAY_MAX_BYTES` | `524288000` (500MB) | Max bytes allowed per session in E2EE relay mode |
| `VITE_WS_URL` *(Client)* | Auto-detected | Custom WebSocket signaling endpoint (`wss://...`) |

---

## 🌐 Production Deployment

### 1. Signaling Server
Deploy the server to any Node.js host (Docker, VPS, Railway, Render, Fly.io):

```bash
export NODE_ENV=production
export PORT=4000
export FRONTEND_ORIGIN=https://your-app-domain.com
npm start
```

### 2. Frontend Client
Build and deploy the static `client/dist/` output to any CDN/static host (Cloudflare Pages, Vercel, Netlify, Nginx, S3):

```bash
npm run build
```

*When deployed over HTTPS, the client automatically connects to `wss://` on the host or uses `VITE_WS_URL`.*

### 3. Self-Hosted Coturn TURN Server (Optional & 100% Free)
For high-reliability connections behind restrictive corporate firewalls:
```text
# /etc/turnserver.conf
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=your_super_secret_hex_key
realm=turn.yourdomain.com
```

Set `TURN_SHARED_SECRET=your_super_secret_hex_key` and `TURN_SERVERS=turn:turn.yourdomain.com:3478?transport=udp` in your server `.env`.

---

## 📊 Operational Telemetry

The signaling server exposes lightweight JSON endpoints:
- **`GET /health`**: Health status, uptime, and active session count.
- **`GET /metrics`**: Real-time counter snapshots (`sessions_created`, `reconnect_successes`, `relay_bytes_total`, `rate_limit_hits`, `webrtc_signals_routed`).

---

## 📜 License

MIT License — free for personal and commercial use.
