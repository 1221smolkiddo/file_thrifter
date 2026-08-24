# THRIFT

THRIFT is a simple, private file-sharing app for moving files, text, and links directly between two devices.

It uses a short-lived pairing session to connect devices and WebRTC to transfer data peer-to-peer. The signaling server coordinates the connection, but it does not receive, store, inspect, or proxy file contents.

## Features

- Share files directly between paired devices
- Send text and links through the same private connection
- Pair devices with a QR code or pairing code
- No account, upload library, or transfer history
- Receiver-side download after a file is fully assembled
- Sender success is confirmed by the receiver's transfer acknowledgement
- Clear success and failure states for both devices
- Five-minute inactivity timeout after pairing
- Keep-alives prevent an active transfer from being interrupted by inactivity timeout
- Optional STUN and TURN server configuration for WebRTC connectivity
- WebSocket heartbeat and rate limiting on the signaling server
- Health endpoint at `/health`

## How It Works

1. The first device creates a session and displays a QR code and pairing code.
2. The second device scans the QR code or pastes the pairing code.
3. The host accepts the connection request.
4. Both devices establish an encrypted WebRTC DataChannel.
5. One device selects **Send files** and the other selects **Receive files**.
6. Files, text, or links are transferred directly between the browsers.
7. For files, the receiver assembles all chunks and sends an acknowledgement before the sender shows success.

The server is used for session creation, pairing, and WebRTC signaling only. It does not handle the file payload.

## Requirements

- Node.js 18 or newer
- npm
- Two modern browsers for testing device-to-device sharing

## Project Structure

```text
.
├── client/                 React and Vite frontend
│   └── src/
│       ├── components/     Pairing, QR, file drop, navigation, transfer UI
│       ├── hooks/          WebSocket session and WebRTC lifecycle hooks
│       ├── lib/webrtc/     DataChannel, signaling, and message helpers
│       └── pages/          Application pages
├── server/                 Node.js WebSocket signaling server
│   ├── security/           Tokens and rate limiting
│   ├── session/            Session lifecycle and timeout management
│   ├── websocket/          Protocol validation and connection handling
│   └── tests/              Backend tests
├── .env.example            Example server configuration
└── package.json             Root development and build scripts
```

## Getting Started

Install dependencies for both packages:

```bash
npm install --prefix client
npm install --prefix server
```

Start the signaling server in one terminal:

```bash
npm run dev:server
```

Start the Vite client in another terminal:

```bash
npm run dev:client
```

Open the URL printed by Vite, normally `http://localhost:5173`.

To build the frontend:

```bash
npm run build
```

To run the backend test suite:

```bash
npm --prefix server test
```

The server listens on port `4000` by default. The client expects the signaling server at `ws://<host>:4000` during development.

## Configuration

Use `.env.example` as the reference when configuring the server process. The current server reads configuration from environment variables; provide them through your shell, process manager, container, or deployment platform.

Important settings include:

| Variable | Default | Purpose |
| --- | ---: | --- |
| `PORT` | `4000` | Signaling server port |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed frontend origin in production |
| `SESSION_TTL_MS` | `600000` | Lifetime of an unpaired session, in milliseconds |
| `SESSION_IDLE_TIMEOUT_MS` | `300000` | Inactivity timeout after pairing, in milliseconds |
| `SESSION_CLEANUP_INTERVAL_MS` | `15000` | Expired-session cleanup interval |
| `STUN_SERVERS` | Google STUN servers | Comma-separated STUN URLs |
| `TURN_SERVERS` | Empty | Optional comma-separated TURN URLs |
| `TURN_USERNAME` | Empty | TURN username |
| `TURN_CREDENTIAL` | Empty | TURN credential |

For production, configure HTTPS for the frontend and WSS for signaling, set `NODE_ENV=production`, and set `FRONTEND_ORIGIN` to the deployed frontend origin. A TURN server is recommended for users behind restrictive NATs or firewalls.

## Privacy and Security

- Session secrets are generated with cryptographically secure random bytes and are never logged in plaintext.
- Session state and credentials are held in memory only.
- The server does not persist file contents or transfer history.
- Pairing and signaling messages are validated and rate-limited.
- WebRTC encrypts the DataChannel between peers.
- Unpaired sessions expire after the configured session lifetime.
- Paired sessions are destroyed after five minutes of inactivity by default.
- The inactivity timer is refreshed by signaling activity and transfer keep-alives; it does not impose a maximum transfer duration.

THRIFT is designed for private device-to-device transfers. The security of a transfer still depends on using a trusted deployment, protecting the pairing code, and using HTTPS/WSS in production.

## Troubleshooting

### Devices cannot connect

- Confirm the signaling server is running on port `4000`.
- Make sure both devices can reach the frontend and signaling server.
- Check that the production frontend origin matches `FRONTEND_ORIGIN`.
- Configure TURN servers when direct WebRTC connectivity is blocked.

### The pairing code no longer works

An unpaired session expires after `SESSION_TTL_MS`, which defaults to 10 minutes. Create a new session and pair again.

### The connection timed out

After pairing, the session is closed after `SESSION_IDLE_TIMEOUT_MS` without activity. The default is five minutes. An active file transfer sends keep-alives so the transfer is not stopped by this timeout.

### A transfer fails

The UI reports errors from the WebRTC connection or DataChannel. Reconnect the devices and try again. For network-specific failures, check browser console logs and configure a TURN server.

## License

No license has been specified for this repository yet.
