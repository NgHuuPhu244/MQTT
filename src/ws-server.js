/**
 * @file src/ws-server.js
 * @description Zero-dependency RFC 6455 WebSocket Server & RBAC Event Hub for Nexus Workspace.
 *
 * Security & Protocol Design:
 * - Implements RFC 6455 HTTP/1.1 Upgrade handshake (SHA-1 Sec-WebSocket-Accept).
 * - First-message token authentication ({ type: 'auth', token }) — never accepts tokens in URL query strings.
 * - Strictly enforces maximum frame size (64 KB) to guard against memory exhaustion.
 * - Supports RBAC-scoped event broadcasting (predicate checked against live user record)
 *   and instant session revocation push ({ type: 'session_revoked' }).
 */

import crypto from 'node:crypto';

const WS_MAGIC_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_WS_PAYLOAD_BYTES = 64 * 1024;
const AUTH_TIMEOUT_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 25000;

/**
 * Encode an unmasked server-to-client WebSocket frame (RFC 6455 Section 5.2).
 * @param {number} opcode - 0x1 text, 0x8 close, 0x9 ping, 0xA pong
 * @param {Buffer} payloadBuf
 * @returns {Buffer}
 */
export function encodeWsFrame(opcode, payloadBuf = Buffer.alloc(0)) {
  const payload = Buffer.isBuffer(payloadBuf) ? payloadBuf : Buffer.from(payloadBuf);
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

/**
 * Encode a WebSocket close frame with status code and optional UTF-8 reason.
 */
function encodeCloseFrame(code = 1000, reason = '') {
  const reasonBuf = Buffer.from(String(reason || '').slice(0, 100), 'utf8');
  const payload = Buffer.alloc(2 + reasonBuf.length);
  payload.writeUInt16BE(code, 0);
  reasonBuf.copy(payload, 2);
  return encodeWsFrame(0x8, payload);
}

/**
 * Compute RFC 6455 Sec-WebSocket-Accept header value.
 */
export function computeWsAcceptKey(secWebSocketKey) {
  return crypto
    .createHash('sha1')
    .update(String(secWebSocketKey).trim() + WS_MAGIC_GUID)
    .digest('base64');
}

/**
 * Attach RFC 6455 WebSocket upgrade handler to a Node.js HTTP server.
 *
 * @param {import('node:http').Server} httpServer
 * @param {Object} hooks
 * @param {string} [hooks.wsPath='/ws/company']
 * @param {(token: string) => ({ token: string, user: object } | null)} hooks.verifyToken
 * @param {(userId: string) => (object | null)} hooks.getUserById
 */
export function attachCompanyWebSocket(httpServer, { wsPath = '/ws/company', verifyToken, getUserById }) {
  /** @type {Set<{ socket: any, token: string|null, userId: string|null, isAlive: boolean, authTimer: any }>} */
  const clients = new Set();

  function safeWrite(socket, buf) {
    if (!socket || socket.destroyed || !socket.writable) return;
    try {
      socket.write(buf);
    } catch {}
  }

  function sendJson(client, obj) {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    safeWrite(client.socket, encodeWsFrame(0x1, payload));
  }

  function closeClient(client, code = 1000, reason = '') {
    if (client.authTimer) {
      clearTimeout(client.authTimer);
      client.authTimer = null;
    }
    clients.delete(client);
    if (client.socket && !client.socket.destroyed) {
      safeWrite(client.socket, encodeCloseFrame(code, reason));
      try {
        client.socket.end();
      } catch {}
    }
  }

  // Heartbeat Ping/Pong sweeper
  const heartbeatTimer = setInterval(() => {
    for (const client of Array.from(clients)) {
      if (!client.isAlive) {
        closeClient(client, 1001, 'Heartbeat timeout');
        continue;
      }
      client.isAlive = false;
      safeWrite(client.socket, encodeWsFrame(0x9, Buffer.alloc(0)));
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();

  httpServer.on('upgrade', (req, socket) => {
    let pathname = '';
    try {
      const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      pathname = parsed.pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== wsPath) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const upgradeHeader = String(req.headers.upgrade || '').toLowerCase();
    const wsKey = req.headers['sec-websocket-key'];
    const wsVersion = String(req.headers['sec-websocket-version'] || '');

    if (upgradeHeader !== 'websocket' || !wsKey || wsVersion !== '13') {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const acceptKey = computeWsAcceptKey(wsKey);
    const handshakeHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      'X-Content-Type-Options: nosniff',
      '\r\n'
    ].join('\r\n');

    socket.write(handshakeHeaders);
    socket.setNoDelay(true);

    const client = {
      socket,
      token: null,
      userId: null,
      isAlive: true,
      authTimer: null
    };
    clients.add(client);

    // Require client authentication within AUTH_TIMEOUT_MS
    client.authTimer = setTimeout(() => {
      if (!client.userId) {
        closeClient(client, 4001, 'Auth timeout');
      }
    }, AUTH_TIMEOUT_MS);
    if (client.authTimer.unref) client.authTimer.unref();

    let rxBuffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      rxBuffer = Buffer.concat([rxBuffer, chunk]);

      while (rxBuffer.length >= 2) {
        const firstByte = rxBuffer[0];
        const secondByte = rxBuffer[1];
        const opcode = firstByte & 0x0f;
        const isMasked = (secondByte & 0x80) !== 0;
        let payloadLen = secondByte & 0x7f;
        let offset = 2;

        // Per RFC 6455 Section 5.1, client-to-server frames MUST be masked
        if (!isMasked) {
          closeClient(client, 1002, 'Unmasked client frame');
          return;
        }

        if (payloadLen === 126) {
          if (rxBuffer.length < 4) return;
          payloadLen = rxBuffer.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (rxBuffer.length < 10) return;
          const bigLen = rxBuffer.readBigUInt64BE(2);
          if (bigLen > BigInt(MAX_WS_PAYLOAD_BYTES)) {
            closeClient(client, 1009, 'Payload too large');
            return;
          }
          payloadLen = Number(bigLen);
          offset = 10;
        }

        if (payloadLen > MAX_WS_PAYLOAD_BYTES) {
          closeClient(client, 1009, 'Payload too large');
          return;
        }

        const totalFrameLen = offset + 4 + payloadLen;
        if (rxBuffer.length < totalFrameLen) {
          return; // Wait for remaining TCP bytes
        }

        const maskKey = rxBuffer.subarray(offset, offset + 4);
        const maskedPayload = rxBuffer.subarray(offset + 4, totalFrameLen);
        const payload = Buffer.allocUnsafe(payloadLen);
        for (let i = 0; i < payloadLen; i++) {
          payload[i] = maskedPayload[i] ^ maskKey[i % 4];
        }

        rxBuffer = rxBuffer.subarray(totalFrameLen);
        client.isAlive = true;

        if (opcode === 0x8) {
          // Close frame
          closeClient(client, 1000, 'Client closed');
          return;
        }
        if (opcode === 0x9) {
          // Ping -> Pong
          safeWrite(socket, encodeWsFrame(0xA, payload));
          continue;
        }
        if (opcode === 0xA) {
          // Pong
          continue;
        }
        if (opcode === 0x1) {
          // UTF-8 Text frame
          let msg;
          try {
            msg = JSON.parse(payload.toString('utf8'));
          } catch {
            continue;
          }
          handleClientMessage(client, msg);
        }
      }
    });

    socket.on('close', () => {
      if (client.authTimer) clearTimeout(client.authTimer);
      clients.delete(client);
    });

    socket.on('error', () => {
      if (client.authTimer) clearTimeout(client.authTimer);
      clients.delete(client);
    });
  });

  function handleClientMessage(client, msg) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'ping') {
      sendJson(client, { type: 'pong', ts: Date.now() });
      return;
    }

    if (msg.type === 'auth') {
      const token = String(msg.token || '').trim();
      const verified = verifyToken ? verifyToken(token) : null;
      if (!verified || !verified.user) {
        sendJson(client, { type: 'auth_error', error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
        closeClient(client, 4001, 'Unauthorized');
        return;
      }
      client.token = verified.token;
      client.userId = verified.user.id;
      if (client.authTimer) {
        clearTimeout(client.authTimer);
        client.authTimer = null;
      }
      sendJson(client, {
        type: 'auth_ok',
        userId: verified.user.id,
        role: verified.user.role,
        department: verified.user.department,
        protocol: 'RFC6455-WS'
      });
    }
  }

  /**
   * Broadcast a scoped sync event ONLY to authenticated users satisfying predicateFn(liveUser).
   */
  function notifySync(reason = 'updated', predicateFn = null, meta = {}) {
    for (const client of Array.from(clients)) {
      if (!client.userId || !client.token) continue;
      // Re-verify active token & live user role/department on every push
      const auth = verifyToken ? verifyToken(client.token) : null;
      if (!auth || !auth.user) {
        sendJson(client, { type: 'session_revoked', reason: 'Phiên đăng nhập đã hết hạn hoặc bị khóa' });
        closeClient(client, 4001, 'Session revoked');
        continue;
      }
      const liveUser = getUserById ? getUserById(auth.user.id) : auth.user;
      if (!liveUser || liveUser.active === false) {
        sendJson(client, { type: 'session_revoked', reason: 'Tài khoản đã bị vô hiệu hóa' });
        closeClient(client, 4001, 'Account disabled');
        continue;
      }
      if (typeof predicateFn === 'function' && !predicateFn(liveUser)) {
        continue;
      }
      sendJson(client, { type: 'sync', reason, ts: Date.now(), ...meta });
    }
  }

  /**
   * Immediately kick all active WebSocket connections for a revoked/locked user.
   */
  function kickUser(userId, reason = 'Tài khoản đã bị khóa hoặc thu hồi phiên') {
    for (const client of Array.from(clients)) {
      if (client.userId === userId) {
        sendJson(client, { type: 'session_revoked', reason });
        closeClient(client, 4001, 'Session revoked');
      }
    }
  }

  function getActiveConnectionCount() {
    let count = 0;
    for (const client of clients) {
      if (client.userId) count++;
    }
    return count;
  }

  function closeAll() {
    clearInterval(heartbeatTimer);
    for (const client of Array.from(clients)) {
      closeClient(client, 1001, 'Server shutting down');
    }
  }

  httpServer.on('close', closeAll);

  return {
    notifySync,
    kickUser,
    getActiveConnectionCount,
    closeAll
  };
}
