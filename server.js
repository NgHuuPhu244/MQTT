/**
 * @file server.js
 * @description Zero-Knowledge Ephemeral RAM-Only Server disguised as a Multilingual Dictionary API & Web App.
 * 
 * Core Architectural Mandates:
 * 1. Strictly RAM-only: Data stored in volatile memory Map. Never written to disk.
 * 2. Zero-Log Policy: No access logs, no IP tracking, no User-Agent logging.
 * 3. Atomic Burn-After-Reading: Ciphertext purged from RAM on initial retrieval.
 * 4. Active TTL Sweeper: Automatic eviction of expired items with buffer zeroing.
 * 5. Memory-DoS Shield: Enforces strict maximum payload size and total memory ceiling.
 * 6. Decoy & Steganography: Camouflaged as "Từ Điển Đa Ngôn Ngữ" with real lexical search endpoints.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Configuration & Constraints
const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5 MB per drop
const MAX_TOTAL_RAM_BYTES = 100 * 1024 * 1024; // 100 MB max total drop buffer
const DEFAULT_TTL_SECONDS = 3600; // 1 hour
const MAX_TTL_SECONDS = 86400 * 7; // Max 7 days
const SWEEP_INTERVAL_MS = 5000; // Sweep expired drops every 5s

// Anti-DoS Rate Limiter (In-Memory Sliding Window Bucket)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 150; // max 150 requests per minute

function checkRateLimit(clientKey) {
  const now = Date.now();
  let record = rateLimitMap.get(clientKey);
  if (!record || (now - record.startTime) > RATE_LIMIT_WINDOW_MS) {
    record = { startTime: now, count: 1 };
    rateLimitMap.set(clientKey, record);
    return true;
  }
  record.count++;
  return record.count <= MAX_REQUESTS_PER_WINDOW;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (now - v.startTime > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(k);
    }
  }
}, 30000).unref();

/**
 * In-Memory Ephemeral Storage
 * Map<string, EphemeralDrop>
 * 
 * EphemeralDrop:
 * {
 *   id: string,
 *   ciphertextBuffer: Buffer,
 *   burnAfterReading: boolean,
 *   expiresAt: number,
 *   size: number
 * }
 */
const inMemoryStore = new Map();
let currentTotalRAMBytes = 0;

/**
 * Securely overwrites Buffer memory with zeros before release.
 * @param {Buffer} buf 
 */
function wipeBuffer(buf) {
  if (Buffer.isBuffer(buf)) {
    buf.fill(0);
  }
}

/**
 * Periodically sweeps and evicts expired drops.
 */
function sweepExpiredDrops() {
  const now = Date.now();
  for (const [id, drop] of inMemoryStore.entries()) {
    if (now >= drop.expiresAt) {
      currentTotalRAMBytes -= drop.size;
      wipeBuffer(drop.ciphertextBuffer);
      inMemoryStore.delete(id);
    }
  }
}
const sweeperTimer = setInterval(sweepExpiredDrops, SWEEP_INTERVAL_MS);
sweeperTimer.unref(); // Allow clean process exit on SIGTERM/SIGINT

/**
 * Store drop in volatile RAM
 */
export function storeDrop({ id, ciphertextBuffer, burnAfterReading = true, ttlSeconds = DEFAULT_TTL_SECONDS }) {
  if (!id || !Buffer.isBuffer(ciphertextBuffer) || ciphertextBuffer.length === 0) {
    throw new Error('Invalid drop parameters');
  }

  if (ciphertextBuffer.length > MAX_PAYLOAD_SIZE) {
    throw new Error(`Payload exceeds maximum allowed size of ${MAX_PAYLOAD_SIZE} bytes`);
  }

  if (currentTotalRAMBytes + ciphertextBuffer.length > MAX_TOTAL_RAM_BYTES) {
    throw new Error('Memory capacity reached. Ephemeral drop rejected.');
  }

  const validTTL = Math.min(Math.max(parseInt(ttlSeconds, 10) || DEFAULT_TTL_SECONDS, 60), MAX_TTL_SECONDS);
  const expiresAt = Date.now() + (validTTL * 1000);

  // If ID already exists, wipe previous buffer
  if (inMemoryStore.has(id)) {
    const prev = inMemoryStore.get(id);
    currentTotalRAMBytes -= prev.size;
    wipeBuffer(prev.ciphertextBuffer);
    inMemoryStore.delete(id);
  }

  const drop = {
    id,
    ciphertextBuffer,
    burnAfterReading: Boolean(burnAfterReading),
    expiresAt,
    size: ciphertextBuffer.length
  };

  inMemoryStore.set(id, drop);
  currentTotalRAMBytes += drop.size;
  return { id, expiresAt, burnAfterReading: drop.burnAfterReading };
}

/**
 * Retrieve drop and atomically evict if burn-after-reading is requested.
 */
export function retrieveDrop(id) {
  if (!inMemoryStore.has(id)) {
    return null;
  }

  const drop = inMemoryStore.get(id);

  // Check TTL
  if (Date.now() >= drop.expiresAt) {
    currentTotalRAMBytes -= drop.size;
    wipeBuffer(drop.ciphertextBuffer);
    inMemoryStore.delete(id);
    return null;
  }

  // Clone buffer so client receives it, then handle burn
  const resultBuffer = Buffer.from(drop.ciphertextBuffer);

  if (drop.burnAfterReading) {
    currentTotalRAMBytes -= drop.size;
    wipeBuffer(drop.ciphertextBuffer);
    inMemoryStore.delete(id);
  }

  return resultBuffer;
}

/**
 * Ephemeral P2P Signal Store (RAM-only for ECDH handshakes, expires in 10 minutes)
 * Key: roomId -> Array of signals [{ senderId, payload, timestamp }]
 */
const p2pSignalStore = new Map();

function cleanP2PSignals() {
  const cutoff = Date.now() - (10 * 60 * 1000);
  for (const [roomId, signals] of p2pSignalStore.entries()) {
    const filtered = signals.filter(s => s.timestamp > cutoff);
    if (filtered.length === 0) {
      p2pSignalStore.delete(roomId);
    } else {
      p2pSignalStore.set(roomId, filtered);
    }
  }
}
setInterval(cleanP2PSignals, 30000).unref();

/**
 * Camouflage Decoy Dictionary Data (Multilingual: VI, EN, JA, FR, TECH)
 */
const DECOY_DICTIONARY = [
  {
    word: "Mật mã học",
    lang: "vi",
    phonetic: "/mət˦ˀ˥ maː˦ˀ˥ hawk͡p̚˧˨/",
    pos: "Danh từ",
    definition: "Ngành khoa học nghiên cứu các kỹ thuật bảo mật thông tin, che giấu dữ liệu và xác thực nguồn gốc thông qua các thuật toán toán học.",
    translations: { en: "Cryptography", fr: "Cryptographie", ja: "暗号学 (Angōgaku)" },
    examples: ["Mật mã học hiện đại phụ thuộc nhiều vào lý thuyết số và độ phức tạp tính toán."]
  },
  {
    word: "Zero-Knowledge",
    lang: "en",
    phonetic: "/ˈzɪərəʊ ˈnɒlɪdʒ/",
    pos: "Thuật ngữ Kỹ thuật",
    definition: "Nguyên lý kiến trúc trong đó một bên chứng minh với bên khác rằng một mệnh đề là đúng mà không tiết lộ bất kỳ thông tin nào ngoài tính đúng đắn của mệnh đề.",
    translations: { vi: "Không tiết lộ tri thức", fr: "Preuve à divulgation nulle de connaissance", ja: "ゼロ知識証明" },
    examples: ["Zero-knowledge architecture guarantees that server operators cannot access customer plaintext data."]
  },
  {
    word: "Tính chất tạm thời (Ephemeral)",
    lang: "vi",
    phonetic: "/tïŋ˧˦ cət˦˥ taːm˧˨ tʰəːj˨˩/",
    pos: "Tính từ",
    definition: "Đặc tính chỉ tồn tại trong thời gian ngắn ngủi, không lưu vết vĩnh viễn trên bất kỳ phương tiện lưu trữ thứ cấp nào.",
    translations: { en: "Ephemeral", fr: "Éphémère", ja: "儚い / 一時的な" },
    examples: ["Khóa trao đổi ECDH có tính chất ephemeral giúp bảo đảm tính bí mật chuyển tiếp hoàn hảo (PFS)."]
  },
  {
    word: "Bộ nhớ khả biến (RAM)",
    lang: "vi",
    phonetic: "/ɓo˧˨ ɲəː˧˦ xaː˧˩ ɓiən˧˦/",
    pos: "Danh từ",
    definition: "Bộ nhớ truy cập ngẫu nhiên của máy tính, mất toàn bộ dữ liệu ngay khi ngắt nguồn điện.",
    translations: { en: "Random Access Memory", fr: "Mémoire vive", ja: "ランダムアクセスメモリ" },
    examples: ["Dữ liệu chỉ tồn tại trên RAM nhằm triệt tiêu hoàn toàn dấu vết lưu trữ trên đĩa cứng."]
  },
  {
    word: "Entropie",
    lang: "fr",
    phonetic: "/ɑ̃.tʁɔ.pi/",
    pos: "Danh từ",
    definition: "Độ hỗn loạn hoặc mức độ không thể dự đoán của một nguồn dữ liệu, là nền tảng cho việc sinh số ngẫu nhiên mật mã học an toàn.",
    translations: { vi: "Entropy", en: "Entropy", ja: "エントロピー" },
    examples: ["Un générateur de nombres aléatoires cryptographiques nécessite une haute entropie."]
  },
  {
    word: "プライバシー (Privacy)",
    lang: "ja",
    phonetic: "/pu-ra-i-ba-sī/",
    pos: "Danh từ",
    definition: "Quyền riêng tư cá nhân và quyền kiểm soát đối với thông tin nhạy cảm của chính mình.",
    translations: { vi: "Quyền riêng tư", en: "Privacy", fr: "Vie privée" },
    examples: ["個人のプライバシーを保護することは、デジタル社会における基本的人権である。"]
  },
  {
    word: "Diffie-Hellman",
    lang: "tech",
    phonetic: "/ˈdɪfi ˈhɛlmən/",
    pos: "Giao thức",
    definition: "Phương pháp toán học cho phép hai bên trao đổi một bí mật chung qua một kênh truyền thông không bảo mật mà không để lộ bí mật đó cho kẻ nghe lén.",
    translations: { vi: "Giao thức trao đổi khóa Diffie-Hellman", fr: "Échange de clés Diffie-Hellman", ja: "ディフィー・ヘルマン鍵共有" },
    examples: ["ECDH sử dụng đường cong elliptic P-256 cho tốc độ tính toán cao và kích thước khóa gọn nhẹ."]
  },
  {
    word: "Ẩn mã (Steganography)",
    lang: "vi",
    phonetic: "/ən˧˩ maː˦ˀ˥/",
    pos: "Danh từ",
    definition: "Nghệ thuật và khoa học về việc che giấu thông điệp bí mật bên trong một thông điệp hoặc vật mang vô hại khác nhằm che giấu sự tồn tại của việc giao tiếp.",
    translations: { en: "Steganography", fr: "Stéganographie", ja: "ステガノグラフィー" },
    examples: ["Hệ thống ngụy trang giao diện trao đổi bí mật dưới dạng một cuốn từ điển đa ngôn ngữ trực tuyến."]
  }
];

/**
 * MIME Type Lookup Helper
 */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

/**
 * Standard Security Headers applied to EVERY response.
 * Completely disables caching, suppresses identifying fingerprints, enforces strict CSP.
 */
function applySecurityHeaders(res) {
  res.removeHeader('X-Powered-By');
  res.setHeader('Server', 'LexiconServer/2.4'); // Camouflaged benign server header
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://upload.wikimedia.org https://*.wikipedia.org; connect-src 'self' https://*.wikipedia.org;"
  );
}

/**
 * Serve static assets from public/ directory
 */
function serveStaticFile(reqPath, res) {
  let cleanPath = reqPath.split('?')[0];
  if (cleanPath === '/' || cleanPath === '') {
    cleanPath = '/index.html';
  } else if (cleanPath === '/vault' || cleanPath === '/drop' || cleanPath === '/secure' || cleanPath === '/market' || cleanPath === '/shop' || cleanPath === '/bazaar') {
    cleanPath = '/vault.html';
  }

  // Prevent directory traversal attacks
  const safePath = path.normalize(path.join(__dirname, 'public', cleanPath));
  if (!safePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  fs.readFile(safePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback for client-side SPA routing (all routes point back to index.html)
        const indexPath = path.join(__dirname, 'public', 'index.html');
        fs.readFile(indexPath, (idxErr, idxData) => {
          if (idxErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
          } else {
            applySecurityHeaders(res);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(idxData);
          }
        });
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    applySecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

/**
 * Read request body safely with strict byte limit
 */
function readRequestBody(req, maxBytes = MAX_PAYLOAD_SIZE) {
  return new Promise((resolve, reject) => {
    let bytesReceived = 0;
    const chunks = [];

    req.on('data', chunk => {
      bytesReceived += chunk.length;
      if (bytesReceived > maxBytes) {
        req.destroy();
        reject(new Error('Payload entity too large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', err => {
      reject(err);
    });
  });
}

/**
 * Core HTTP Request Handler (ZERO-LOG: Does NOT log client IP, paths, or headers)
 */
export function createServer() {
  return http.createServer(async (req, res) => {
    // Zero-Log: Deliberately NO console.log(req.ip, req.headers, req.url)
    applySecurityHeaders(res);

    const clientKey = req.socket.remoteAddress || '127.0.0.1';
    if (!checkRateLimit(clientKey)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too Many Requests' }));
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    try {
      // -------------------------------------------------------------
      // 1. DECOY API ENDPOINTS: Multilingual Dictionary Search
      // -------------------------------------------------------------
      if (pathname === '/api/lexicon/query' && method === 'GET') {
        const query = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
        const lang = parsedUrl.searchParams.get('lang') || 'all';

        let results = DECOY_DICTIONARY;
        if (lang !== 'all') {
          results = results.filter(item => item.lang === lang);
        }
        if (query) {
          results = results.filter(item => 
            item.word.toLowerCase().includes(query) || 
            item.definition.toLowerCase().includes(query) ||
            Object.values(item.translations).some(t => t.toLowerCase().includes(query))
          );
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', count: results.length, data: results }));
        return;
      }

      if (pathname === '/api/lexicon/languages' && method === 'GET') {
        const languages = [
          { code: 'all', name: 'Tất cả ngôn ngữ' },
          { code: 'vi', name: 'Tiếng Việt' },
          { code: 'en', name: 'English' },
          { code: 'fr', name: 'Français' },
          { code: 'ja', name: '日本語' },
          { code: 'tech', name: 'Thuật ngữ Kỹ thuật' }
        ];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', languages }));
        return;
      }

      // Wikipedia Live Knowledge Integration Endpoint
      if (pathname === '/api/lexicon/wiki-summary' && method === 'GET') {
        const term = (parsedUrl.searchParams.get('q') || '').trim();
        const lang = (parsedUrl.searchParams.get('lang') || 'vi').toLowerCase();

        if (!term) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing search term' }));
          return;
        }

        const wikiDomain = lang === 'en' ? 'en.wikipedia.org' : 'vi.wikipedia.org';
        const wikiApiUrl = `https://${wikiDomain}/api/rest_v1/page/summary/${encodeURIComponent(term)}`;

        try {
          const wikiResponse = await fetch(wikiApiUrl, {
            headers: {
              'User-Agent': 'MultilingualLexiconApp/2.4 (Educational Reference Tool)'
            }
          });

          if (!wikiResponse.ok) {
            res.writeHead(wikiResponse.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'not_found', error: 'No Wikipedia article found' }));
            return;
          }

          const wikiData = await wikiResponse.json();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'success',
            title: wikiData.title,
            extract: wikiData.extract,
            description: wikiData.description,
            thumbnail: wikiData.thumbnail ? wikiData.thumbnail.source : null,
            articleUrl: wikiData.content_urls ? wikiData.content_urls.desktop.page : `https://${wikiDomain}/wiki/${encodeURIComponent(term)}`,
            lang
          }));
        } catch (fetchErr) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unable to reach Wikipedia service' }));
        }
        return;
      }

      // Wikipedia Live OpenSearch Suggestions Endpoint
      if (pathname === '/api/lexicon/opensearch' && method === 'GET') {
        const term = (parsedUrl.searchParams.get('q') || '').trim();
        const lang = (parsedUrl.searchParams.get('lang') || 'vi').toLowerCase();

        if (!term) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([]));
          return;
        }

        const wikiDomain = lang === 'en' ? 'en.wikipedia.org' : 'vi.wikipedia.org';
        const openSearchUrl = `https://${wikiDomain}/w/api.php?action=opensearch&format=json&search=${encodeURIComponent(term)}&limit=8`;

        try {
          const wikiResponse = await fetch(openSearchUrl, {
            headers: {
              'User-Agent': 'MultilingualLexiconApp/2.4 (Educational Reference Tool)'
            }
          });

          if (!wikiResponse.ok) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
            return;
          }

          const openSearchData = await wikiResponse.json();
          // openSearchData format: [query, [titles], [descriptions], [urls]]
          const titles = openSearchData[1] || [];
          const urls = openSearchData[3] || [];

          const suggestions = titles.map((title, idx) => ({
            title,
            url: urls[idx] || `https://${wikiDomain}/wiki/${encodeURIComponent(title)}`,
            lang
          }));

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', suggestions }));
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', suggestions: [] }));
        }
        return;
      }

      // -------------------------------------------------------------
      // 2. COVERT DROP API: Disguised as Lexicon Cache / Sync
      // -------------------------------------------------------------
      
      // CREATE DROP: POST /api/lexicon/cache-entry or /api/v1/drop
      if ((pathname === '/api/lexicon/cache-entry' || pathname === '/api/v1/drop') && method === 'POST') {
        const rawBody = await readRequestBody(req, MAX_PAYLOAD_SIZE);
        
        let payload;
        try {
          payload = JSON.parse(rawBody.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
          return;
        }

        const { ciphertext, burnAfterReading = true, ttl = DEFAULT_TTL_SECONDS } = payload;
        if (!ciphertext || typeof ciphertext !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing ciphertext string' }));
          return;
        }

        // Generate 128-bit cryptographically secure drop ID (32 hex chars)
        const dropId = crypto.randomBytes(16).toString('hex');
        const ciphertextBuffer = Buffer.from(ciphertext, 'utf8');

        const dropInfo = storeDrop({
          id: dropId,
          ciphertextBuffer,
          burnAfterReading,
          ttlSeconds: ttl
        });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          id: dropInfo.id,
          expiresAt: dropInfo.expiresAt,
          burnAfterReading: dropInfo.burnAfterReading
        }));
        return;
      }

      // RETRIEVE DROP: GET /api/lexicon/cache-entry/:id or /api/v1/drop/:id
      const dropMatch = pathname.match(/^\/(?:api\/lexicon\/cache-entry|api\/v1\/drop)\/([a-f0-9]{32})$/);
      if (dropMatch && method === 'GET') {
        const dropId = dropMatch[1];
        const cipherBuffer = retrieveDrop(dropId);

        if (!cipherBuffer) {
          // Uniform 404 response (prevents distinguishing between non-existent and already-burned)
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Entry not found or already purged' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          ciphertext: cipherBuffer.toString('utf8')
        }));
        return;
      }

      // -------------------------------------------------------------
      // 3. EPHEMERAL P2P SIGNALING: For Anonymous Ephemeral ECDH Handshake
      // -------------------------------------------------------------
      if (pathname === '/api/lexicon/p2p-signal' && method === 'POST') {
        const rawBody = await readRequestBody(req, 64 * 1024); // max 64KB for signaling
        let body;
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid signal payload' }));
          return;
        }

        const { channelId, senderId, signal } = body;
        if (!channelId || !senderId || !signal) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing channelId, senderId, or signal' }));
          return;
        }

        if (!p2pSignalStore.has(channelId)) {
          p2pSignalStore.set(channelId, []);
        }
        const signals = p2pSignalStore.get(channelId);
        signals.push({ senderId, signal, timestamp: Date.now() });

        // Cap signals per channel
        if (signals.length > 20) signals.shift();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'delivered' }));
        return;
      }

      if (pathname.startsWith('/api/lexicon/p2p-signal/') && method === 'GET') {
        const channelId = pathname.replace('/api/lexicon/p2p-signal/', '');
        const since = parseInt(parsedUrl.searchParams.get('since') || '0', 10);
        const senderId = parsedUrl.searchParams.get('senderId') || '';

        const signals = p2pSignalStore.get(channelId) || [];
        // Filter out signals from same sender and older than 'since'
        const incoming = signals.filter(s => s.senderId !== senderId && s.timestamp > since);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ signals: incoming, now: Date.now() }));
        return;
      }

      // -------------------------------------------------------------
      // 4. STATIC DECOY WEB APP: Multilingual Dictionary UI
      // -------------------------------------------------------------
      if (method === 'GET' || method === 'HEAD') {
        serveStaticFile(pathname, res);
        return;
      }

      // Method Not Allowed
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');

    } catch (err) {
      // Never expose stack trace or internal details to client
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'System error' }));
      }
    }
  });
}

// Auto-start when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    // Intentionally minimalistic initialization message (No telemetry / No sensitive info)
    process.stdout.write(`[System Ready] Ephemeral RAM Lexicon Service active on http://${HOST}:${PORT}\n`);
  });

  // Graceful shutdown with RAM purge
  const cleanExit = () => {
    for (const [, drop] of inMemoryStore) {
      wipeBuffer(drop.ciphertextBuffer);
    }
    inMemoryStore.clear();
    p2pSignalStore.clear();
    process.exit(0);
  };

  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);
}
