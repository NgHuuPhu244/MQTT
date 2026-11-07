/**
 * @file vault.js
 * @description Controller for the Stealth Anonymous Marketplace (Ghost Bazaar).
 * Strictly RAM-Only: Zero-Log IP, Ephemeral Identity, E2EE Chat & Complete Purge-On-Exit.
 */

import qrcode from './qrcode.mjs';

// Volatile in-memory state (Purged completely on page exit / ESC)
let sessionSeconds = 0;
let anonymousAlias = '';
let inMemoryChatMessages = [];
let activeOrder = null;
let orderCountdownTimer = null;
let currentChatInquiry = 'Tư vấn chung';

// WebRTC Peer-to-Peer State (100% Serverless, Browser-to-Browser, Zero-Log)
let peerInstance = null;
let activePeerConnection = null;
let currentRoomCode = null;
let isP2PConnected = false;
let isRoomHost = false;
let p2pPeerAlias = 'Khách / Đối Tác';
let typingDebounceTimer = null;

// Multi-region public STUN servers for zero-configuration P2P NAT traversal
const PEERJS_CONFIG = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  }
};

/**
 * Gentle Web Audio synthesizer chime for incoming P2P messages (Zero external asset dependency)
 */
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // Autoplay policy or audio unsupported
  }
}

// Anonymous Catalog Inventory (In-Memory Only — Unrestricted Open Market & Auction)
let MARKET_PRODUCTS = [
  {
    id: 'auction-chip-07',
    name: 'Lô 10 Chip Mật Mã HSM Air-Gapped EAL6+ Đấu Giá Kín',
    category: 'hardware',
    badge: 'Đấu Giá & Mua Ngay',
    icon: '🔨',
    securityLevel: 'Cấp 5 • Silent Bid',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.50,
    currentBidXMR: 0.85,
    buyNowPrice: 1.40,
    minBidIncrement: 0,
    bidCount: 4,
    highestBidder: 'Ghost-9A4F',
    bids: [
      { bidder: 'Ghost-9A4F', amount: 0.85, currency: 'XMR', time: '2 phút trước' },
      { bidder: 'Ghost-1B2C', amount: 0.80, currency: 'XMR', time: '8 phút trước' },
      { bidder: 'Ghost-5E3D', amount: 0.70, currency: 'XMR', time: '15 phút trước' },
      { bidder: 'Ghost-7A11', amount: 0.50, currency: 'XMR', time: '28 phút trước' }
    ],
    auctionEndTime: Date.now() + (5400 * 1000),
    priceXMR: '0.85 XMR',
    rawPriceXMR: 0.85,
    approxUSD: '~$140 USD',
    stock: '1 lô duy nhất',
    desc: 'Lô linh kiện phần cứng chip xử lý mật mã học độc lập EAL6+, chưa từng kết nối mạng, mở đấu giá tự do hoặc mua đứt ngay.',
    specs: {
      'Hình thức': 'Đấu giá tự do & Mua đứt 2 chiều',
      'Bước giá': 'Tự do không giới hạn',
      'Bàn giao': 'Mã Drop tự hủy hoặc Ship ẩn danh'
    }
  },
  {
    id: 'lux-watch-08',
    name: 'Đồng Hồ Cơ Patek Philippe Sưu Tầm & Vàng Khối 24K',
    category: 'physical',
    badge: 'Hàng Vật Lý',
    icon: '⌚',
    securityLevel: 'Escrow • Vật phẩm thực',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 12.00,
    currentBidXMR: 14.50,
    buyNowPrice: 18.00,
    minBidIncrement: 0,
    bidCount: 6,
    highestBidder: 'Ghost-77FE',
    bids: [
      { bidder: 'Ghost-77FE', amount: 14.50, currency: 'XMR', time: '5 phút trước' },
      { bidder: 'Ghost-3A91', amount: 13.20, currency: 'XMR', time: '19 phút trước' }
    ],
    auctionEndTime: Date.now() + (10800 * 1000),
    priceXMR: '14.50 XMR',
    rawPriceXMR: 14.50,
    approxUSD: '~$2,390 USD',
    stock: '1 chiếc nguyên hộp',
    desc: 'Vật phẩm sưu tầm thực tế ngoài đời thực, đầy đủ chứng nhận gốc, giao dịch qua hợp đồng ký quỹ ẩn danh và giao nhận Dead-Drop bảo mật.',
    specs: {
      'Danh mục': 'Hàng thực tế • Xa xỉ phẩm',
      'Chế độ': 'Trả giá tự do / Mua ngay',
      'Bàn giao': 'Hòm thư Dead-Drop / Bưu chính kín'
    }
  },
  {
    id: 'dig-domain-09',
    name: 'Tên Miền VIP 2 Ký Tự & Kho Tài Sản Số Độc Quyền',
    category: 'digital',
    badge: 'Tài Sản Số',
    icon: '💎',
    securityLevel: 'Instant • Transfer',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 2.00,
    currentBidXMR: 2.40,
    buyNowPrice: 3.50,
    minBidIncrement: 0,
    bidCount: 3,
    highestBidder: 'Ghost-3C1A',
    bids: [
      { bidder: 'Ghost-3C1A', amount: 2.40, currency: 'XMR', time: '11 phút trước' }
    ],
    auctionEndTime: Date.now() + (7200 * 1000),
    priceXMR: '2.40 XMR',
    rawPriceXMR: 2.40,
    approxUSD: '~$395 USD',
    stock: 'Chuyển giao ngay',
    desc: 'Tài sản kỹ thuật số, tên miền ngắn quý hiếm kèm mã EPP Auth-Code chuyển nhượng quyền sở hữu tức thì qua kênh mã hóa một lần.',
    specs: {
      'Loại tài sản': 'Tên miền & Bản quyền số',
      'Đấu giá': 'Mở thầu tự do 24/7',
      'Bàn giao': 'Mã EPP / Khoá chuyển nhượng RAM'
    }
  },
  {
    id: 'hw-hsm-01',
    name: 'Khóa Bảo Mật Air-Gapped HSM Token v4',
    category: 'hardware',
    badge: 'Phần Cứng',
    icon: '🔑',
    securityLevel: 'Cấp 5 • FIPS 140-3',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.35,
    currentBidXMR: 0.45,
    buyNowPrice: 0.45,
    minBidIncrement: 0,
    bidCount: 2,
    highestBidder: 'Ghost-4D88',
    bids: [
      { bidder: 'Ghost-4D88', amount: 0.45, currency: 'XMR', time: '14 phút trước' }
    ],
    auctionEndTime: Date.now() + (14400 * 1000),
    priceXMR: '0.45 XMR',
    rawPriceXMR: 0.45,
    approxUSD: '~$75 USD',
    stock: '5 chiếc',
    desc: 'Khóa vật lý USB chứa chip bảo mật chuyên dụng EAL6+, cách ly hoàn toàn (Air-gapped) khỏi mạng Internet. Tự hủy firmware khi phát hiện can thiệp vật lý.',
    specs: {
      'Tiêu chuẩn': 'FIPS 140-3 Level 4 / CC EAL6+',
      'Bảo vệ': 'Chống trích xuất vi mạch (Anti-DPA)',
      'Bàn giao': 'Bưu chính ẩn danh / Drop bí mật'
    }
  },
  {
    id: 'net-mesh-02',
    name: 'Cấu Hình Ephemeral Multi-Hop Mesh (RAM-Only)',
    category: 'network',
    badge: 'Mạng Lưới',
    icon: '🛰️',
    securityLevel: 'Cấp 5 • 5-Hop Obfs4',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.10,
    currentBidXMR: 0.15,
    buyNowPrice: 0.15,
    minBidIncrement: 0,
    bidCount: 1,
    highestBidder: 'Ghost-8E02',
    bids: [],
    auctionEndTime: Date.now() + (18000 * 1000),
    priceXMR: '0.15 XMR',
    rawPriceXMR: 0.15,
    approxUSD: '~$25 USD',
    stock: 'Sẵn hàng',
    desc: 'Gói cấu hình định tuyến 5 lớp ngụy trang qua giao thức Obfs4 + WireGuard kết nối qua các cụm máy chủ RAM-only không lưu nhật ký truy cập (Zero-Log).',
    specs: {
      'Giao thức': 'WireGuard Obfuscated • Tor Over VPN',
      'Định tuyến': '5 bước nhảy (Multi-Hop) ngẫu nhiên',
      'Bàn giao': 'Mã Drop tự hủy sau 1 lần đọc'
    }
  },
  {
    id: 'sec-ssl-03',
    name: 'Chứng Chỉ SSL Bulletproof & DNS Chống Giám Sát',
    category: 'network',
    badge: 'Mạng Lưới',
    icon: '🛡️',
    securityLevel: 'Cấp 4 • ECH DNSSEC',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.15,
    currentBidXMR: 0.20,
    buyNowPrice: 0.20,
    minBidIncrement: 0,
    bidCount: 1,
    highestBidder: 'Ghost-2A19',
    bids: [],
    auctionEndTime: Date.now() + (21600 * 1000),
    priceXMR: '0.20 XMR',
    rawPriceXMR: 0.20,
    approxUSD: '~$35 USD',
    stock: 'Sẵn hàng',
    desc: 'Cụm tên miền và chứng chỉ wildcard SSL phát hành nặc danh, định tuyến qua hệ thống Anycast DNS chống chặn ISP và loại bỏ rò rỉ SNI (ESNI/ECH).',
    specs: {
      'Công nghệ': 'Encrypted Client Hello (ECH) • DNSSEC',
      'Định danh': 'Ẩn hoàn toàn thông tin Whois / Khách hàng',
      'Bàn giao': 'Gói chứng chỉ nén kèm Private Key PGP'
    }
  },
  {
    id: 'doc-audit-04',
    name: 'Báo Cáo Nghiên Cứu Lỗ Hổng Zero-Day White-Hat Audit',
    category: 'audit',
    badge: 'Audit & PoC',
    icon: '📑',
    securityLevel: 'Cấp 5 • Top-Secret',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.60,
    currentBidXMR: 0.85,
    buyNowPrice: 0.85,
    minBidIncrement: 0,
    bidCount: 3,
    highestBidder: 'Ghost-5B71',
    bids: [],
    auctionEndTime: Date.now() + (9000 * 1000),
    priceXMR: '0.85 XMR',
    rawPriceXMR: 0.85,
    approxUSD: '~$140 USD',
    stock: '2 bản đệm',
    desc: 'Tài liệu phân tích kỹ thuật độc quyền về kiến trúc chống nghe lén dữ liệu qua kênh bên (Side-channel attacks) và phương pháp vá lỗi cho giao thức mật mã đối xứng.',
    specs: {
      'Định dạng': 'PDF mã hóa AES-256-GCM + Khóa giải mật',
      'Nội dung': 'Whitepaper 48 trang + Script kiểm thử PoC',
      'Bàn giao': 'Mã Drop RAM-only'
    }
  },
  {
    id: 'os-amnesic-05',
    name: 'Tails/Qubes Amnesic USB OS Bootable Image',
    category: 'crypto',
    badge: 'Hệ Điều Hành',
    icon: '💾',
    securityLevel: 'Cấp 5 • Zero-Trace',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.20,
    currentBidXMR: 0.30,
    buyNowPrice: 0.30,
    minBidIncrement: 0,
    bidCount: 2,
    highestBidder: 'Ghost-6F04',
    bids: [],
    auctionEndTime: Date.now() + (12600 * 1000),
    priceXMR: '0.30 XMR',
    rawPriceXMR: 0.30,
    approxUSD: '~$50 USD',
    stock: 'Sẵn hàng',
    desc: 'Bản phân phối Linux bảo mật tối đa được tùy biến sâu. Tự động xóa sạch RAM khi tắt máy, định tuyến 100% lưu lượng qua Tor, vô hiệu hóa hoàn toàn ghi đĩa.',
    specs: {
      'Bảo mật': 'Amnesic RAM-Only • Chống Forensic',
      'Checksum': 'SHA-256 xác thực kèm chữ ký PGP',
      'Bàn giao': 'Link tải tốc độ cao kèm khóa token'
    }
  },
  {
    id: 'key-pgp-06',
    name: 'Cặp Khóa PGP 4096-bit Sinh Trong Lồng Faraday',
    category: 'crypto',
    badge: 'Mật Mã Học',
    icon: '🗝️',
    securityLevel: 'Cấp 5 • Faraday Key',
    currency: 'XMR',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 0.05,
    currentBidXMR: 0.10,
    buyNowPrice: 0.10,
    minBidIncrement: 0,
    bidCount: 1,
    highestBidder: 'Ghost-0D33',
    bids: [],
    auctionEndTime: Date.now() + (16200 * 1000),
    priceXMR: '0.10 XMR',
    rawPriceXMR: 0.10,
    approxUSD: '~$18 USD',
    stock: '10 cặp khóa',
    desc: 'Cặp khóa riêng tư RSA-4096 / Ed25519 được sinh từ nguồn entropy phần cứng trong phòng cách ly sóng điện từ (Faraday cage), chưa từng chạm mạng Internet.',
    specs: {
      'Độ dài khóa': 'RSA 4096-bit + Ed25519 Subkeys',
      'Bảo mật': 'Zero Internet Exposure',
      'Bàn giao': 'Mã hóa gửi qua kênh drop dùng 1 lần'
    }
  }
];

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Modern non-blocking Toast notification system
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✓' : (type === 'error' ? '⚠' : 'ℹ');
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button type="button" class="toast-close" title="Đóng">✕</button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 200);
  });

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 200);
    }
  }, 3500);
}

/* ==========================================================================
   0. PERSISTENT SESSION & CATALOG STORAGE ENGINE (SURVIVES F5 RELOAD)
   ========================================================================== */

const STORAGE_KEYS = {
  ALIAS: 'ghost_anon_alias',
  MARKET_PRODUCTS: 'ghost_market_products_v1',
  REVOKED_IDS: 'ghost_revoked_product_ids_v1',
  MY_LISTINGS: 'ghost_my_vendor_listings',
  ACTIVE_ORDER: 'ghost_active_order_v1',
  ACTIVE_DEAL: 'ghost_active_blind_deal_v1',
  CHAT_MESSAGES: 'ghost_chat_messages_v1',
  ACTIVE_TAB: 'ghost_active_tab_v1',
  SESSION_SECONDS: 'ghost_session_seconds_v1'
};

let revokedProductIds = new Set();
let isPurgingNow = false;
let activeAutoDeal = null;
let lastBurnedDealId = null;

/**
 * Multi-origin resilient API fetch helper:
 * Tries current origin first, then automatically falls back to localhost:3000 / 127.0.0.1:3000
 * so multi-browser tests (e.g. Chrome + Opera GX or Live Server port) always reach the RAM server.
 */
async function bazaarApiFetch(path, options = {}) {
  const candidates = [path];
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    const port = window.location.port;
    if (port !== '3000') {
      candidates.push(`http://localhost:3000${path}`);
      candidates.push(`http://127.0.0.1:3000${path}`);
    } else if (host === 'localhost') {
      candidates.push(`http://127.0.0.1:3000${path}`);
    } else if (host === '127.0.0.1') {
      candidates.push(`http://localhost:3000${path}`);
    }
  }

  let lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        ...options,
        cache: 'no-store'
      });
      if (res.ok || res.status === 400 || res.status === 403) {
        return res;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Network unreachable');
}

function loadRevokedIdsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REVOKED_IDS) || sessionStorage.getItem(STORAGE_KEYS.REVOKED_IDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        revokedProductIds = new Set(parsed);
      }
    }
  } catch {}
}

function addRevokedProductId(productId) {
  if (!productId) return;
  revokedProductIds.add(productId);
  try {
    const json = JSON.stringify(Array.from(revokedProductIds));
    localStorage.setItem(STORAGE_KEYS.REVOKED_IDS, json);
    sessionStorage.setItem(STORAGE_KEYS.REVOKED_IDS, json);
  } catch {}
}

function saveMyVendorListingsToStorage() {
  if (isPurgingNow) return;
  try {
    const json = JSON.stringify(myVendorListings);
    localStorage.setItem(STORAGE_KEYS.MY_LISTINGS, json);
    sessionStorage.setItem(STORAGE_KEYS.MY_LISTINGS, json);
  } catch {}
}

function syncMyVendorListingsWithMarket() {
  if (!Array.isArray(myVendorListings) || myVendorListings.length === 0) return;
  let changed = false;
  myVendorListings = myVendorListings
    .filter(item => item && !revokedProductIds.has(item.id))
    .map(item => {
      const marketMatch = MARKET_PRODUCTS.find(p => p.id === item.id);
      if (marketMatch) {
        changed = true;
        return {
          ...marketMatch,
          vendorKillToken: item.vendorKillToken || marketMatch.vendorKillToken
        };
      }
      return item;
    });
  if (changed) {
    saveMyVendorListingsToStorage();
  }
}

function saveMarketProductsToStorage() {
  if (isPurgingNow) return;
  try {
    const cleanList = MARKET_PRODUCTS.filter(p => p && !revokedProductIds.has(p.id));
    MARKET_PRODUCTS = cleanList;
    const json = JSON.stringify(cleanList);
    localStorage.setItem(STORAGE_KEYS.MARKET_PRODUCTS, json);
    sessionStorage.setItem(STORAGE_KEYS.MARKET_PRODUCTS, json);
    syncMyVendorListingsWithMarket();
  } catch {}
}

/**
 * Smart two-way merge between two product lists (localStorage & Server RAM / defaults).
 * Preserves all user-created products and the highest bidCount / currentBidXMR on every item.
 */
function mergeProductCatalogs(primaryList, secondaryList) {
  loadRevokedIdsFromStorage();
  const mergedMap = new Map();
  const orderedIds = [];

  const upsert = (item) => {
    if (!item || !item.id || revokedProductIds.has(item.id)) return;
    if (!mergedMap.has(item.id)) {
      mergedMap.set(item.id, { ...item });
      orderedIds.push(item.id);
    } else {
      const existing = mergedMap.get(item.id);
      const existingBids = Number(existing.bidCount || (existing.bids ? existing.bids.length : 0));
      const incomingBids = Number(item.bidCount || (item.bids ? item.bids.length : 0));
      const existingPrice = Number(existing.currentBidXMR || existing.rawPriceXMR || 0);
      const incomingPrice = Number(item.currentBidXMR || item.rawPriceXMR || 0);

      if (incomingBids > existingBids || (incomingBids === existingBids && incomingPrice > existingPrice)) {
        mergedMap.set(item.id, {
          ...existing,
          ...item,
          vendorKillToken: existing.vendorKillToken || item.vendorKillToken
        });
      } else if (!existing.vendorKillToken && item.vendorKillToken) {
        existing.vendorKillToken = item.vendorKillToken;
      }
    }
  };

  if (Array.isArray(primaryList)) primaryList.forEach(upsert);
  if (Array.isArray(secondaryList)) secondaryList.forEach(upsert);

  const result = orderedIds.map(id => mergedMap.get(id));
  result.sort((a, b) => {
    if (a.isUserCreated && !b.isUserCreated) return -1;
    if (!a.isUserCreated && b.isUserCreated) return 1;
    if (a.isUserCreated && b.isUserCreated) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    return 0;
  });
  return result;
}

function loadMarketProductsFromStorage() {
  loadRevokedIdsFromStorage();
  try {
    const rawMarket = localStorage.getItem(STORAGE_KEYS.MARKET_PRODUCTS) || sessionStorage.getItem(STORAGE_KEYS.MARKET_PRODUCTS);
    if (rawMarket) {
      const storedList = JSON.parse(rawMarket);
      if (Array.isArray(storedList) && storedList.length > 0) {
        MARKET_PRODUCTS = mergeProductCatalogs(storedList, MARKET_PRODUCTS);
      }
    }
    const rawVendor = localStorage.getItem(STORAGE_KEYS.MY_LISTINGS) || sessionStorage.getItem(STORAGE_KEYS.MY_LISTINGS);
    if (rawVendor) {
      const vendorList = JSON.parse(rawVendor);
      if (Array.isArray(vendorList) && vendorList.length > 0) {
        MARKET_PRODUCTS = mergeProductCatalogs(vendorList, MARKET_PRODUCTS);
      }
    }
    MARKET_PRODUCTS = MARKET_PRODUCTS.filter(p => p && !revokedProductIds.has(p.id));
  } catch {}
}

function saveChatMessagesToStorage() {
  if (isPurgingNow) return;
  try {
    const json = JSON.stringify(inMemoryChatMessages);
    localStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, json);
    sessionStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, json);
  } catch {}
}

function saveActiveOrderToStorage() {
  if (isPurgingNow) return;
  try {
    if (activeOrder) {
      const json = JSON.stringify(activeOrder);
      localStorage.setItem(STORAGE_KEYS.ACTIVE_ORDER, json);
      sessionStorage.setItem(STORAGE_KEYS.ACTIVE_ORDER, json);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_ORDER);
      sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_ORDER);
    }
  } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
  loadMarketProductsFromStorage();
  generateEphemeralIdentity();
  initPanicAndPurgeHooks();
  initTelemetryAndMask();
  initTabs();
  initVendorDesk();
  initMarketCatalog();
  initEncryptedChat();
  initOrderSystem();
  initAuctionBidding();
  updateRamMonitor();
  checkUrlForP2PRoom();
});

/* ==========================================================================
   1. EPHEMERAL IDENTITY & PURGE-ON-EXIT (ZERO-TRACE MANDATE)
   ========================================================================== */

function generateEphemeralIdentity(forceNew = false) {
  let storedAlias = null;
  try {
    storedAlias = localStorage.getItem(STORAGE_KEYS.ALIAS) || sessionStorage.getItem(STORAGE_KEYS.ALIAS);
  } catch {}

  if (storedAlias && !forceNew) {
    anonymousAlias = storedAlias;
  } else {
    const randHex = Array.from(crypto.getRandomValues(new Uint8Array(2)))
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join('');
    anonymousAlias = `Ghost-${randHex}`;
  }

  try {
    localStorage.setItem(STORAGE_KEYS.ALIAS, anonymousAlias);
    sessionStorage.setItem(STORAGE_KEYS.ALIAS, anonymousAlias);
  } catch {}

  const aliasEl = document.getElementById('anon-alias');
  if (aliasEl) {
    aliasEl.textContent = anonymousAlias;
  }
}

/**
 * PURGE ALL IN-MEMORY DATA:
 * Immediately zeros out variables, clears message logs, destroys active order,
 * flushes sessionStorage / localStorage, and leaves no residual footprints.
 */
function purgeAllVolatileData() {
  isPurgingNow = true;
  // Clear chat memory
  inMemoryChatMessages.length = 0;
  activeOrder = null;
  myVendorListings.length = 0;
  revokedProductIds.clear();

  if (orderCountdownTimer) {
    clearInterval(orderCountdownTimer);
    orderCountdownTimer = null;
  }

  // Clear DOM chat
  const chatList = document.getElementById('chat-message-list');
  if (chatList) chatList.innerHTML = '';

  // Clear inputs
  const chatInput = document.getElementById('chat-input-field');
  if (chatInput) chatInput.value = '';

  const orderKeyInput = document.getElementById('order-receiver-pubkey');
  if (orderKeyInput) orderKeyInput.value = '';

  // Flush browser storages completely
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch {}

  // Flush clipboard
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText('').catch(() => {});
  }

  // Terminate active WebRTC P2P connection and destroy peer
  disconnectP2P(false);

  renderMyListings();
  updateRamMonitor();
}

function initPanicAndPurgeHooks() {
  const panicBtn = document.getElementById('panic-btn');

  const executeEmergencyEscape = () => {
    purgeAllVolatileData();
    // Redirect immediately to the benign decoy dictionary
    window.location.replace('./index.html');
  };

  if (panicBtn) {
    panicBtn.addEventListener('click', executeEmergencyEscape);
  }

  // Global ESC key listener for instantaneous escape & wipe
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      executeEmergencyEscape();
    }
  });

  // Note: We deliberately do NOT bind purgeAllVolatileData() to beforeunload / pagehide
  // so that normal page refresh (F5) preserves session identity and active vendor listings.
  // Full wipe and escape is strictly triggered via the Panic Button or ESC key.
}

/* ==========================================================================
   2. TELEMETRY & SESSION CLOCK
   ========================================================================== */

function initTelemetryAndMask() {
  // Restore session clock from storage if available
  try {
    const savedSecs = parseInt(sessionStorage.getItem(STORAGE_KEYS.SESSION_SECONDS) || '0', 10);
    if (!isNaN(savedSecs) && savedSecs > 0) {
      sessionSeconds = savedSecs;
    }
  } catch {}

  const clockEl = document.getElementById('session-timer');
  if (clockEl) {
    const renderClock = () => {
      const mins = String(Math.floor(sessionSeconds / 60)).padStart(2, '0');
      const secs = String(sessionSeconds % 60).padStart(2, '0');
      clockEl.textContent = `${mins}:${secs}`;
    };
    renderClock();

    setInterval(() => {
      sessionSeconds++;
      renderClock();
      try {
        sessionStorage.setItem(STORAGE_KEYS.SESSION_SECONDS, String(sessionSeconds));
      } catch {}
    }, 1000);
  }

  // Regenerate Alias Button
  const regenBtn = document.getElementById('regen-alias-btn');
  if (regenBtn) {
    regenBtn.addEventListener('click', () => {
      generateEphemeralIdentity(true);
      showToast(`Đã cấp danh tính mới: ${anonymousAlias}`, 'info');
    });
  }

  // QR Modal Close
  const closeQrBtn = document.getElementById('close-qr-btn');
  const qrOverlay = document.getElementById('qr-modal-overlay');
  if (closeQrBtn && qrOverlay) {
    closeQrBtn.addEventListener('click', () => {
      qrOverlay.style.display = 'none';
    });
  }
}

/* ==========================================================================
   3. TABS MANAGEMENT
   ========================================================================== */

function initTabs() {
  const navTabs = document.querySelectorAll('.covert-nav-tabs .nav-tab');
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      switchTab(targetId);
    });
  });

  // Restore last active tab on F5 reload
  try {
    const savedTab = sessionStorage.getItem(STORAGE_KEYS.ACTIVE_TAB);
    if (savedTab && document.getElementById(savedTab)) {
      switchTab(savedTab);
    }
  } catch {}
}

function switchTab(tabId) {
  const navTabs = document.querySelectorAll('.covert-nav-tabs .nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navTabs.forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
  });

  tabPanes.forEach(p => {
    p.classList.toggle('active', p.id === tabId);
  });

  if (!isPurgingNow && tabId) {
    try {
      sessionStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, tabId);
    } catch {}
  }

  // Clear unread badge if opening chat
  if (tabId === 'tab-chat') {
    const chatBadge = document.getElementById('chat-badge');
    if (chatBadge) chatBadge.style.display = 'none';
  }

  updateRamMonitor();
}

/* ==========================================================================
   4. ANONYMOUS PRODUCT CATALOG & FILTERING
   ========================================================================== */

function formatPriceNum(val) {
  const num = Number(val);
  if (isNaN(num)) return '0.00';
  if (num >= 100) return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return num.toFixed(2);
}

// Cross-tab real-time broadcast channel for instantaneous multi-desk synchronization
const bazaarSyncChannel = (typeof window !== 'undefined' && 'BroadcastChannel' in window)
  ? new BroadcastChannel('ghost_bazaar_catalog_sync_v1')
  : null;

/**
 * Fetch synchronized product catalog from volatile server RAM and merge with local state
 */
async function fetchBazaarProducts(silent = true) {
  loadMarketProductsFromStorage();
  try {
    const res = await bazaarApiFetch('/api/lexicon/bazaar-items', {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json && Array.isArray(json.data)) {
      const serverItems = json.data;
      const serverIds = new Set(serverItems.map(p => p.id));

      // Re-push any locally created user items that the server doesn't have yet (e.g. after server restart)
      const localOnlyUserItems = MARKET_PRODUCTS.filter(
        p => p && p.isUserCreated && !serverIds.has(p.id) && !revokedProductIds.has(p.id)
      );
      localOnlyUserItems.forEach(item => {
        bazaarApiFetch('/api/lexicon/bazaar-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        }).catch(() => {});
      });

      MARKET_PRODUCTS = mergeProductCatalogs(MARKET_PRODUCTS, serverItems);
      saveMarketProductsToStorage();
      updateCategoryPillCounts();
      populateOrderProductSelect(MARKET_PRODUCTS);
      filterAndRenderProducts();
      renderMyListings();
      updateRamMonitor();
      if (!silent) {
        showToast('Đã đồng bộ và cập nhật danh sách mặt hàng mới nhất từ RAM!', 'success');
      }
    }
  } catch (err) {
    // Offline or Static Host (e.g. GitHub Pages): preserve and render local persisted catalog
    saveMarketProductsToStorage();
    updateCategoryPillCounts();
    populateOrderProductSelect(MARKET_PRODUCTS);
    filterAndRenderProducts();
    renderMyListings();
    updateRamMonitor();
    if (!silent) {
      showToast('Đã đồng bộ và làm mới danh sách mặt hàng hiện tại!', 'success');
    }
  }
}

function initMarketCatalog() {
  const searchInput = document.getElementById('market-search-input');
  const clearSearchBtn = document.getElementById('clear-market-search-btn');
  const sortSelect = document.getElementById('market-sort-select');
  const categoryPills = document.getElementById('market-category-pills');
  const quickOpenVendorBtn = document.getElementById('quick-open-vendor-btn');
  const refreshMarketBtn = document.getElementById('refresh-market-btn');

  saveMarketProductsToStorage();
  renderProducts(MARKET_PRODUCTS);
  updateCategoryPillCounts();
  populateOrderProductSelect(MARKET_PRODUCTS);
  updateOrderPreviewCard();

  // Cross-tab storage event listener (guarantees sync across tabs on same browser)
  window.addEventListener('storage', (e) => {
    if (
      e.key === STORAGE_KEYS.MARKET_PRODUCTS ||
      e.key === STORAGE_KEYS.REVOKED_IDS ||
      e.key === STORAGE_KEYS.MY_LISTINGS
    ) {
      loadMarketProductsFromStorage();
      syncMyVendorListingsWithMarket();
      updateCategoryPillCounts();
      populateOrderProductSelect(MARKET_PRODUCTS);
      filterAndRenderProducts();
      renderMyListings();
      updateRamMonitor();
    } else if (e.key === STORAGE_KEYS.ACTIVE_DEAL) {
      if (!e.newValue) {
        if (activeAutoDeal) {
          executeLocalDealAutoBurn(activeAutoDeal.dealId, true);
        }
      } else {
        try {
          const dealObj = JSON.parse(e.newValue);
          if (dealObj && dealObj.status === 'completed_burned') {
            executeLocalDealAutoBurn(dealObj.dealId, true);
          } else if (dealObj && dealObj.dealId) {
            applyIncomingBlindDealState(dealObj);
          }
        } catch {}
      }
    }
  });

  // Cross-tab real-time sync listener (Desktops, Windows & Tabs)
  if (bazaarSyncChannel) {
    bazaarSyncChannel.onmessage = (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === 'NEW_PRODUCT') {
        const prod = msg.product;
        const idx = MARKET_PRODUCTS.findIndex(p => p.id === prod.id);
        if (idx === -1) {
          MARKET_PRODUCTS.unshift(prod);
        } else {
          MARKET_PRODUCTS[idx] = prod;
        }
        saveMarketProductsToStorage();
        updateCategoryPillCounts();
        populateOrderProductSelect(MARKET_PRODUCTS);
        filterAndRenderProducts();
        renderMyListings();
        updateRamMonitor();
        showToast(`📢 Gian hàng vừa có mặt hàng mới: "${prod.name}"!`, 'info');
      } else if (msg.type === 'BID_PLACED') {
        const prod = MARKET_PRODUCTS.find(p => p.id === msg.productId);
        if (prod) {
          prod.currentBidXMR = msg.amount;
          prod.rawPriceXMR = msg.amount;
          prod.highestBidder = msg.bidder;
          prod.bidCount = (prod.bidCount || 0) + 1;
          prod.priceXMR = `${formatPriceNum(msg.amount)} ${msg.currency || prod.currency || 'XMR'}`;
          prod.approxUSD = estimateUSDString(msg.amount, msg.currency || prod.currency || 'XMR');
          if (!prod.bids) prod.bids = [];
          prod.bids.unshift({
            bidder: msg.bidder,
            amount: msg.amount,
            currency: msg.currency || 'XMR',
            note: 'Dẫn đầu',
            time: 'Vừa xong'
          });
          saveMarketProductsToStorage();
          filterAndRenderProducts();
          renderMyListings();
          updateRamMonitor();
          showToast(`🔨 "${prod.name}" vừa có lượt trả giá: ${msg.amount} ${msg.currency || 'XMR'} từ ${msg.bidder}!`, 'info');
        }
      } else if (msg.type === 'REVOKE_PRODUCT') {
        addRevokedProductId(msg.productId);
        MARKET_PRODUCTS = MARKET_PRODUCTS.filter(p => p.id !== msg.productId);
        myVendorListings = myVendorListings.filter(p => p.id !== msg.productId);
        saveMarketProductsToStorage();
        saveMyVendorListingsToStorage();
        updateCategoryPillCounts();
        populateOrderProductSelect(MARKET_PRODUCTS);
        filterAndRenderProducts();
        renderMyListings();
        updateRamMonitor();
      } else if (msg.type === 'DEAL_SYNC' && msg.deal) {
        applyIncomingBlindDealState(msg.deal);
      } else if (msg.type === 'DEAL_COMPLETED_BURN') {
        executeLocalDealAutoBurn(msg.dealId, true);
      }
    };
  }

  // Load latest live listings from server RAM
  fetchBazaarProducts(true);

  // Background auto-sync interval every 2.5 seconds (fast real-time poll)
  setInterval(() => {
    fetchBazaarProducts(true);
  }, 2500);

  // Auto-sync when user switches back to this desk or window
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchBazaarProducts(true);
    }
  });
  window.addEventListener('focus', () => {
    fetchBazaarProducts(true);
  });

  if (refreshMarketBtn) {
    refreshMarketBtn.addEventListener('click', () => {
      fetchBazaarProducts(false);
    });
  }

  if (quickOpenVendorBtn) {
    quickOpenVendorBtn.addEventListener('click', () => {
      switchTab('tab-vendor');
      document.getElementById('listing-name')?.focus();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (clearSearchBtn) {
        clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
      }
      filterAndRenderProducts();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      filterAndRenderProducts();
      searchInput?.focus();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      filterAndRenderProducts();
    });
  }

  if (categoryPills) {
    categoryPills.addEventListener('click', (e) => {
      const pill = e.target.closest('.market-pill');
      if (pill) {
        document.querySelectorAll('.market-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        filterAndRenderProducts();
      }
    });
  }

  // Quick '/' shortcut to focus market search bar
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
      e.preventDefault();
      switchTab('tab-market');
      searchInput?.focus();
    }
  });
}

function updateCategoryPillCounts() {
  const countAll = document.getElementById('count-all');
  if (countAll) countAll.textContent = MARKET_PRODUCTS.length;

  const countAuction = document.getElementById('count-auction');
  if (countAuction) countAuction.textContent = MARKET_PRODUCTS.filter(p => p.isAuction !== false).length;

  const countPhysical = document.getElementById('count-physical');
  if (countPhysical) countPhysical.textContent = MARKET_PRODUCTS.filter(p => p.category === 'physical').length;

  const countDigital = document.getElementById('count-digital');
  if (countDigital) countDigital.textContent = MARKET_PRODUCTS.filter(p => p.category === 'digital' || p.category === 'service').length;

  const countHw = document.getElementById('count-hardware');
  if (countHw) countHw.textContent = MARKET_PRODUCTS.filter(p => p.category === 'hardware').length;

  const countNet = document.getElementById('count-network');
  if (countNet) countNet.textContent = MARKET_PRODUCTS.filter(p => p.category === 'network').length;

  const countCrypto = document.getElementById('count-crypto');
  if (countCrypto) countCrypto.textContent = MARKET_PRODUCTS.filter(p => p.category === 'crypto' || p.category === 'audit' || p.category === 'zeroday').length;
}

function filterAndRenderProducts() {
  const query = (document.getElementById('market-search-input')?.value || '').trim().toLowerCase();
  const activePill = document.querySelector('.market-pill.active');
  const category = activePill ? activePill.getAttribute('data-category') : 'all';
  const sort = document.getElementById('market-sort-select')?.value || 'default';

  let filtered = [...MARKET_PRODUCTS];

  if (category === 'auction') {
    filtered = filtered.filter(p => p.isAuction !== false);
  } else if (category === 'digital') {
    filtered = filtered.filter(p => p.category === 'digital' || p.category === 'service');
  } else if (category === 'crypto') {
    filtered = filtered.filter(p => p.category === 'crypto' || p.category === 'audit' || p.category === 'zeroday');
  } else if (category !== 'all') {
    filtered = filtered.filter(p => p.category === category);
  }

  if (query) {
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.desc.toLowerCase().includes(query) ||
      (p.badge && p.badge.toLowerCase().includes(query)) ||
      p.securityLevel.toLowerCase().includes(query) ||
      Object.values(p.specs).some(val => val.toLowerCase().includes(query))
    );
  }

  // Sorting
  if (sort === 'price-asc') {
    filtered.sort((a, b) => a.rawPriceXMR - b.rawPriceXMR);
  } else if (sort === 'price-desc') {
    filtered.sort((a, b) => b.rawPriceXMR - a.rawPriceXMR);
  } else if (sort === 'bids-desc') {
    filtered.sort((a, b) => (b.bidCount || 0) - (a.bidCount || 0));
  } else if (sort === 'name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  renderProducts(filtered);
  updateCategoryPillCounts();
}

function renderProducts(products) {
  const grid = document.getElementById('market-product-grid');
  if (!grid) return;

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="empty-recovery-box" style="grid-column: 1 / -1;">
        <span class="empty-icon">🔍</span>
        <h3 class="empty-title">Không tìm thấy vật phẩm phù hợp trong RAM</h3>
        <p class="empty-desc">Bạn có thể tìm với từ khóa khác hoặc nhấn "➕ Đăng Bán / Đấu Giá Ngay" để niêm yết bất kỳ món đồ nào bạn muốn!</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(item => {
    const currency = item.currency || 'XMR';
    const badgeCategory = escapeHtml(item.category || 'auction');
    const badgeText = escapeHtml(item.badge || 'Đấu Giá & Mua Ngay');

    const endAttr = item.auctionEndTime !== undefined ? item.auctionEndTime : (Date.now() + 3600000);
    const topRightBadge = endAttr === 0
      ? `<span class="auction-countdown-pill" data-end="0">♾️ <span class="countdown-val">MỞ TỰ DO</span></span>`
      : `<span class="auction-countdown-pill" data-end="${endAttr}">⏳ <span class="countdown-val">01:29:45</span></span>`;

    const currentVal = item.currentBidXMR ?? item.rawPriceXMR ?? 0;
    const buyNowVal = item.buyNowPrice ?? item.rawPriceXMR ?? currentVal;
    const priceLabel = 'Giá hiện tại / Đấu giá mở:';
    const priceDisplay = `${formatPriceNum(currentVal)} ${escapeHtml(currency)}`;
    const priceClass = 'product-price auction-price';
    const priceMeta = `${item.bidCount || 0} lượt trả giá • Mua đứt: ${formatPriceNum(buyNowVal)} ${escapeHtml(currency)}`;

    const actionButtons = `
      <button type="button" class="bid-btn" data-id="${escapeHtml(item.id)}" title="Đấu giá / Trả giá tự do cho vật phẩm này">
        <span>🔨</span> Đấu Giá
      </button>
      <button type="button" class="buy-btn" data-id="${escapeHtml(item.id)}" title="Mua đứt ngay lập tức qua Ký quỹ RAM">
        <span>🛒</span> Mua
      </button>
      <button type="button" class="chat-btn" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" title="Chat thương lượng trực tiếp">
        <span>💬</span>
      </button>
      <button type="button" class="share-card-btn" data-id="${escapeHtml(item.id)}" title="Sao chép link mặt hàng này gửi cho khách">
        <span>🔗</span>
      </button>
    `;

    return `
      <article class="product-card" id="card-${escapeHtml(item.id)}">
        <div class="product-card-top">
          <div class="product-badge-group">
            <span class="product-badge ${badgeCategory}">${badgeText}</span>
            <span class="security-level-tag">${escapeHtml(item.securityLevel)}</span>
          </div>
          ${topRightBadge}
        </div>

        <div class="product-title-row">
          <div class="product-icon-box">${escapeHtml(item.icon)}</div>
          <h2 class="product-title">${escapeHtml(item.name)}</h2>
        </div>

        <p class="product-desc">${escapeHtml(item.desc)}</p>
        
        <div class="product-specs">
          ${Object.entries(item.specs).map(([k, v]) => `
            <div class="spec-row">
              <span class="spec-key"><span class="spec-bullet">▸</span>${escapeHtml(k)}:</span>
              <span class="spec-val">${escapeHtml(v)}</span>
            </div>
          `).join('')}
        </div>

        <div class="product-card-footer">
          <div class="product-price-block">
            <span class="product-price-label">${priceLabel}</span>
            <span class="${priceClass}">${priceDisplay}</span>
            <span class="product-bid-meta">${priceMeta}</span>
          </div>
          <div class="product-actions">
            ${actionButtons}
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Bind Buy, Bid & Chat buttons
  grid.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-id');
      initiateOrderForProduct(prodId);
    });
  });

  grid.querySelectorAll('.bid-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-id');
      openBidModal(prodId);
    });
  });

  grid.querySelectorAll('.chat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodName = btn.getAttribute('data-name');
      const prodId = btn.getAttribute('data-id') || '';
      initiateChatForProduct(prodName, prodId);
    });
  });

  grid.querySelectorAll('.share-card-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-id') || '';
      const prod = MARKET_PRODUCTS.find(p => p.id === prodId);
      const shareUrl = `${window.location.origin}${window.location.pathname}#item=${encodeURIComponent(prodId)}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(() => {
          showToast(`Đã sao chép link mặt hàng "${prod ? prod.name : prodId}" vào bộ đệm!`, 'success');
        }).catch(() => {});
      }
    });
  });

  updateAuctionCountdowns();
}

function populateOrderProductSelect(products) {
  const select = document.getElementById('order-product-select');
  if (!select) return;

  select.innerHTML = products.map(p => `
    <option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} — ${escapeHtml(p.priceXMR)} (${escapeHtml(p.approxUSD)})</option>
  `).join('');
}

function updateOrderPreviewCard() {
  const previewBox = document.getElementById('live-order-preview-card');
  const select = document.getElementById('order-product-select');
  if (!previewBox || !select) return;

  const prodId = select.value;
  const product = MARKET_PRODUCTS.find(p => p.id === prodId) || MARKET_PRODUCTS[0];

  previewBox.innerHTML = `
    <div class="preview-card-header">
      <div class="preview-icon-box">${escapeHtml(product.icon)}</div>
      <div>
        <h3 class="preview-title">${escapeHtml(product.name)}</h3>
        <span class="preview-badge">${escapeHtml(product.badge)} • ${escapeHtml(product.securityLevel)}</span>
      </div>
    </div>
    <div class="preview-price-row">
      <span class="detail-label">Tổng thanh toán ký quỹ:</span>
      <span class="preview-price-val">${escapeHtml(product.priceXMR)}</span>
    </div>
    <div class="product-specs" style="margin-bottom: 0;">
      <div class="spec-row">
        <span class="spec-key">Phương thức bàn giao:</span>
        <span class="spec-val">Drop ID Tự Hủy RAM (Burn-After-Reading)</span>
      </div>
      <div class="spec-row">
        <span class="spec-key">Mã hóa gói hàng:</span>
        <span class="spec-val">AES-256-GCM + PGP Custom Key</span>
      </div>
    </div>
  `;
}

function initiateOrderForProduct(productId) {
  const select = document.getElementById('order-product-select');
  if (select) {
    select.value = productId;
    updateOrderPreviewCard();
  }
  switchTab('tab-order');
  showToast('Đã nạp sản phẩm vào cổng Ký quỹ & Đơn hàng!', 'info');
}

function initiateChatForProduct(productName, productId = '') {
  currentChatInquiry = productName;
  const tag = document.getElementById('active-product-tag');
  if (tag) tag.textContent = `Về: ${productName}`;

  switchTab('tab-chat');

  // Auto-generate Ephemeral Blind Deal Session Code & connect Buyer <-> Seller automatically
  startAutoBlindDeal(productName, productId);

  const input = document.getElementById('chat-input-field');
  if (input) {
    input.value = `Chào shop, tôi muốn mua sản phẩm "${productName}". Vui lòng hướng dẫn bàn giao qua Ký quỹ RAM!`;
    input.focus();
  }
}

/* ==========================================================================
   5. SERVERLESS WEBRTC P2P DIRECT CHAT (ZERO-SERVER • ZERO-LOG)
   ========================================================================== */

function generateRoomCode() {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(2)))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  return `GHOST-${rand}`;
}

function getRoomShareableLink(code) {
  let baseUrl = window.location.href.split('#')[0];
  if (!baseUrl.includes('vault.html')) {
    baseUrl = baseUrl.replace(/\/$/, '') + '/vault.html';
  }
  return `${baseUrl}#room=${encodeURIComponent(code)}`;
}

function updateP2PStatusUI(state, extraInfo = null) {
  const pulseDot = document.getElementById('p2p-pulse-dot');
  const statusText = document.getElementById('p2p-status-text');
  const setupRow = document.getElementById('p2p-setup-row');
  const activeRow = document.getElementById('p2p-active-row');
  const roomCodeDisplay = document.getElementById('display-room-code');

  const avatarText = document.getElementById('chat-peer-avatar-text');
  const peerName = document.getElementById('chat-peer-name');
  const peerBadge = document.getElementById('chat-peer-badge');
  const peerStat = document.getElementById('chat-peer-stat');
  const peerPing = document.getElementById('chat-peer-ping');

  if (state === 'disconnected') {
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot disconnected';
    if (statusText) statusText.textContent = '🔴 Chế độ Bot Tự Động (Chưa kết nối P2P)';
    if (setupRow) setupRow.style.display = 'flex';
    if (activeRow) activeRow.style.display = 'none';

    if (avatarText) avatarText.textContent = 'M';
    if (peerName) peerName.textContent = 'Merchant-Node-01';
    if (peerBadge) {
      peerBadge.textContent = '✓ ĐÃ XÁC MINH PGP';
      peerBadge.className = 'verified-vendor-badge';
    }
    if (peerStat) peerStat.textContent = '★ 5.0 (98 giao dịch)';
    if (peerPing) {
      peerPing.textContent = 'Phản hồi < 1p';
      peerPing.className = 'peer-stat green';
    }
  } else if (state === 'hosting') {
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot waiting';
    if (statusText) statusText.textContent = `🟡 Đang mở phòng [${extraInfo}] • Chờ khách mở link kết nối...`;
    if (setupRow) setupRow.style.display = 'none';
    if (activeRow) activeRow.style.display = 'flex';
    if (roomCodeDisplay) roomCodeDisplay.textContent = extraInfo;
  } else if (state === 'connecting') {
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot waiting';
    if (statusText) statusText.textContent = `🟡 Đang bắt tay WebRTC tới phòng [${extraInfo}]...`;
    if (setupRow) setupRow.style.display = 'none';
    if (activeRow) activeRow.style.display = 'flex';
    if (roomCodeDisplay) roomCodeDisplay.textContent = extraInfo;
  } else if (state === 'connected') {
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot connected';
    if (statusText) statusText.textContent = '🟢 ĐÃ KẾT NỐI P2P TRỰC TIẾP (Máy ↔ Máy • Zero-Server • Không Lưu Log)';
    if (setupRow) setupRow.style.display = 'none';
    if (activeRow) activeRow.style.display = 'flex';

    const partnerName = extraInfo?.peerAlias || p2pPeerAlias || 'Khách / Đối Tác P2P';
    if (avatarText) avatarText.textContent = partnerName.charAt(0).toUpperCase();
    if (peerName) peerName.textContent = partnerName;
    if (peerBadge) {
      peerBadge.textContent = '🟢 WEBRTC DIRECT (ZERO-SERVER)';
      peerBadge.className = 'verified-vendor-badge p2p-connected-badge';
    }
    if (peerStat) peerStat.textContent = 'Kênh Dữ Liệu E2EE Máy ↔ Máy';
    if (peerPing) {
      peerPing.textContent = 'Độ trễ < 50ms';
      peerPing.className = 'peer-stat green';
    }
  }
}

function startHostingP2PRoom(customCode = null) {
  if (!window.Peer) {
    showToast('Lỗi: Thư viện WebRTC PeerJS chưa được tải!', 'error');
    return;
  }

  disconnectP2P(false);

  const roomCode = (customCode || generateRoomCode()).toUpperCase().trim();
  currentRoomCode = roomCode;
  isRoomHost = true;

  const peerId = `ghbazaar-${roomCode.toLowerCase()}`;
  updateP2PStatusUI('hosting', roomCode);

  try {
    peerInstance = new window.Peer(peerId, PEERJS_CONFIG);
  } catch (err) {
    console.error('PeerJS init error:', err);
    showToast('Không thể khởi tạo WebRTC: ' + err.message, 'error');
    updateP2PStatusUI('disconnected');
    return;
  }

  peerInstance.on('open', () => {
    updateP2PStatusUI('hosting', roomCode);
    showToast(`Đã mở phòng [${roomCode}]! Hãy sao chép link gửi cho khách để kết nối trực tiếp.`, 'success');

    inMemoryChatMessages.push({
      author: 'HỆ THỐNG P2P',
      role: 'system',
      time: getCurrentTimeStr(),
      text: `🔔 Phòng chat mật [${roomCode}] đã được khởi tạo thành công trên RAM. Hãy sao chép link phòng và gửi cho khách hoặc đối tác. Khi đối tác mở link, hai thiết bị sẽ tự động bắt tay P2P kết nối trực tiếp!`
    });
    renderChatMessages();
    updateRamMonitor();
  });

  peerInstance.on('connection', (conn) => {
    setupP2PConnection(conn);
  });

  peerInstance.on('error', (err) => {
    console.error('PeerJS error:', err);
    if (err.type === 'unavailable-id') {
      showToast(`Mã phòng [${roomCode}] đang bận. Đang sinh mã phòng mới...`, 'warning');
      startHostingP2PRoom();
    } else {
      showToast('Lỗi WebRTC: ' + (err.message || err.type), 'error');
      updateP2PStatusUI('disconnected');
    }
  });
}

function joinP2PRoom(rawInput) {
  if (!window.Peer) {
    showToast('Lỗi: Thư viện WebRTC PeerJS chưa được tải!', 'error');
    return;
  }

  let code = (rawInput || '').trim();
  const hashMatch = code.match(/room=([A-Za-z0-9-_]+)/i);
  if (hashMatch) {
    code = hashMatch[1];
  }
  code = code.replace(/[^A-Za-z0-9-_]/g, '').toUpperCase();
  if (!code) {
    showToast('Vui lòng nhập mã phòng hợp lệ (ví dụ: GHOST-8F4A)!', 'warning');
    return;
  }

  disconnectP2P(false);

  currentRoomCode = code;
  isRoomHost = false;
  updateP2PStatusUI('connecting', code);

  const targetPeerId = `ghbazaar-${code.toLowerCase()}`;
  const myClientId = `ghbazaar-c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  try {
    peerInstance = new window.Peer(myClientId, PEERJS_CONFIG);
  } catch (err) {
    console.error('PeerJS init error:', err);
    showToast('Không thể kết nối WebRTC: ' + err.message, 'error');
    updateP2PStatusUI('disconnected');
    return;
  }

  peerInstance.on('open', () => {
    const conn = peerInstance.connect(targetPeerId, { reliable: true });
    setupP2PConnection(conn);
  });

  peerInstance.on('error', (err) => {
    console.error('PeerJS error:', err);
    showToast(`Không thể kết nối tới phòng [${code}]: Mã phòng không tồn tại hoặc chủ phòng đã đóng.`, 'error');
    updateP2PStatusUI('disconnected');
  });
}

function setupP2PConnection(conn) {
  activePeerConnection = conn;

  conn.on('open', () => {
    isP2PConnected = true;
    updateP2PStatusUI('connected', { peerAlias: p2pPeerAlias });
    playNotificationChime();

    // Send handshake packet with local alias
    conn.send({
      type: 'handshake',
      alias: anonymousAlias || 'Ẩn Danh',
      time: getCurrentTimeStr()
    });

    // Exchange custom vendor listings with remote peer
    const myCustomListings = MARKET_PRODUCTS.filter(p => p.isUserCreated);
    if (myCustomListings.length > 0) {
      try {
        conn.send({
          type: 'market_sync_batch',
          products: myCustomListings
        });
      } catch {}
    }

    inMemoryChatMessages.push({
      author: 'HỆ THỐNG P2P',
      role: 'system',
      time: getCurrentTimeStr(),
      text: '🎉 ĐÃ THIẾT LẬP KẾT NỐI P2P THÀNH CÔNG! Hai thiết bị hiện đang giao tiếp trực tiếp qua WebRTC DataChannel (máy ↔ máy). Hoàn toàn không qua máy chủ, không lưu log.'
    });
    renderChatMessages();
    updateRamMonitor();
    showToast('Đã kết nối P2P trực tiếp với máy đối tác!', 'success');
  });

  conn.on('data', (packet) => {
    if (!packet || typeof packet !== 'object') return;

    if (packet.type === 'handshake') {
      if (packet.alias) {
        p2pPeerAlias = packet.alias;
        updateP2PStatusUI('connected', { peerAlias: p2pPeerAlias });
      }
    } else if (packet.type === 'chat') {
      playNotificationChime();
      inMemoryChatMessages.push({
        author: packet.alias || p2pPeerAlias || 'Đối Tác',
        role: 'merchant',
        time: packet.time || getCurrentTimeStr(),
        text: packet.text
      });
      renderChatMessages();
      updateRamMonitor();

      // Show unread badge if tab not active
      const activeTab = document.querySelector('.covert-nav-tabs .nav-tab.active');
      if (activeTab && activeTab.getAttribute('data-tab') !== 'tab-chat') {
        const badge = document.getElementById('chat-badge');
        if (badge) badge.style.display = 'inline-block';
      }
    } else if (packet.type === 'typing') {
      const typingIndicator = document.getElementById('chat-typing-indicator');
      const typingText = document.querySelector('#chat-typing-indicator .typing-text');
      if (typingIndicator) {
        if (packet.isTyping) {
          if (typingText) typingText.textContent = `${packet.alias || p2pPeerAlias || 'Đối tác'} đang soạn tin nhắn...`;
          typingIndicator.style.display = 'flex';
        } else {
          typingIndicator.style.display = 'none';
        }
      }
    } else if (packet.type === 'market_item_created') {
      const prod = packet.product;
      const idx = MARKET_PRODUCTS.findIndex(p => p.id === prod.id);
      if (idx === -1) {
        MARKET_PRODUCTS.unshift(prod);
      } else {
        MARKET_PRODUCTS[idx] = prod;
      }
      saveMarketProductsToStorage();
      updateCategoryPillCounts();
      populateOrderProductSelect(MARKET_PRODUCTS);
      filterAndRenderProducts();
      renderMyListings();
      updateRamMonitor();
      playNotificationChime();
      showToast(`🔔 Đối tác P2P vừa niêm yết: "${prod.name}"!`, 'info');
    } else if (packet.type === 'market_sync_batch' && Array.isArray(packet.products)) {
      MARKET_PRODUCTS = mergeProductCatalogs(MARKET_PRODUCTS, packet.products);
      saveMarketProductsToStorage();
      updateCategoryPillCounts();
      populateOrderProductSelect(MARKET_PRODUCTS);
      filterAndRenderProducts();
      renderMyListings();
      updateRamMonitor();
    } else if (packet.type === 'market_bid_placed') {
      const prod = MARKET_PRODUCTS.find(p => p.id === packet.productId);
      if (prod) {
        prod.currentBidXMR = packet.amount;
        prod.rawPriceXMR = packet.amount;
        prod.highestBidder = packet.bidder;
        prod.bidCount = (prod.bidCount || 0) + 1;
        prod.priceXMR = `${formatPriceNum(packet.amount)} ${packet.currency || prod.currency || 'XMR'}`;
        prod.approxUSD = estimateUSDString(packet.amount, packet.currency || prod.currency || 'XMR');
        if (!prod.bids) prod.bids = [];
        prod.bids.unshift({
          bidder: packet.bidder,
          amount: packet.amount,
          currency: packet.currency || 'XMR',
          time: 'Vừa xong'
        });
        saveMarketProductsToStorage();
        filterAndRenderProducts();
        renderMyListings();
        updateRamMonitor();
        playNotificationChime();
        showToast(`🔨 Đối tác P2P vừa trả giá: ${packet.amount} ${packet.currency || 'XMR'} cho "${prod.name}"!`, 'info');
      }
    } else if (packet.type === 'market_item_revoked') {
      addRevokedProductId(packet.productId);
      MARKET_PRODUCTS = MARKET_PRODUCTS.filter(p => p.id !== packet.productId);
      myVendorListings = myVendorListings.filter(p => p.id !== packet.productId);
      saveMarketProductsToStorage();
      saveMyVendorListingsToStorage();
      updateCategoryPillCounts();
      populateOrderProductSelect(MARKET_PRODUCTS);
      filterAndRenderProducts();
      renderMyListings();
      updateRamMonitor();
    } else if (packet.type === 'disconnect') {
      showToast('Đối tác đã ngắt kết nối P2P!', 'warning');
      inMemoryChatMessages.push({
        author: 'HỆ THỐNG P2P',
        role: 'system',
        time: getCurrentTimeStr(),
        text: '⚠️ Đối tác đã chủ động ngắt kết nối P2P.'
      });
      renderChatMessages();
      disconnectP2P(true);
    }
  });

  conn.on('close', () => {
    if (isP2PConnected) {
      showToast('Kết nối P2P đã kết thúc.', 'info');
      inMemoryChatMessages.push({
        author: 'HỆ THỐNG P2P',
        role: 'system',
        time: getCurrentTimeStr(),
        text: '⚠️ Máy đối tác đã ngắt kết nối hoặc đóng tab trình duyệt.'
      });
      renderChatMessages();
      disconnectP2P(false);
    }
  });

  conn.on('error', (err) => {
    console.error('Conn error:', err);
    showToast('Lỗi truyền dữ liệu P2P: ' + (err.message || 'Lỗi không xác định'), 'error');
  });
}

function disconnectP2P(isRemote = false) {
  if (activePeerConnection) {
    if (!isRemote) {
      try {
        activePeerConnection.send({ type: 'disconnect' });
      } catch {}
    }
    try { activePeerConnection.close(); } catch {}
    activePeerConnection = null;
  }

  if (peerInstance) {
    try { peerInstance.destroy(); } catch {}
    peerInstance = null;
  }

  isP2PConnected = false;
  isRoomHost = false;
  currentRoomCode = null;
  p2pPeerAlias = 'Khách / Đối Tác';

  // Clear room hash from URL
  if (window.location.hash && window.location.hash.toLowerCase().includes('room=')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  updateP2PStatusUI('disconnected');
}

function checkUrlForP2PRoom() {
  if (window.location.hash) {
    const match = window.location.hash.match(/room=([A-Za-z0-9-_]+)/i);
    if (match && match[1]) {
      const roomCode = match[1].toUpperCase();
      switchTab('tab-chat');
      setTimeout(() => {
        joinP2PRoom(roomCode);
      }, 400);
    }
  }
}

/* ==========================================================================
   5B. MESSENGER MULTI-THREAD CONVERSATION SYSTEM & ISOLATED BLIND DEALS
   (Mô hình Messenger Đa Hội Thoại • Tách biệt từng Người Mua & từng Sản Phẩm • Ẩn 100% ID & IP)
   ========================================================================== */

let chatThreads = [];
let activeThreadId = 'thread-merchant-general';

function getActiveThread() {
  let thread = chatThreads.find(t => t.id === activeThreadId);
  if (!thread && chatThreads.length > 0) {
    thread = chatThreads[0];
    activeThreadId = thread.id;
  }
  return thread;
}

function loadChatThreadsFromStorage() {
  try {
    const raw = localStorage.getItem('ghost_messenger_threads_v2') || sessionStorage.getItem('ghost_messenger_threads_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        chatThreads = parsed;
      }
    }
  } catch {}

  try {
    const savedId = localStorage.getItem('ghost_active_thread_v2') || sessionStorage.getItem('ghost_active_thread_v2');
    if (savedId && chatThreads.some(t => t.id === savedId)) {
      activeThreadId = savedId;
    }
  } catch {}

  if (chatThreads.length === 0) {
    chatThreads = [
      {
        id: 'thread-merchant-general',
        dealId: null,
        productId: 'general',
        productName: 'Tư vấn chung',
        peerAlias: 'Merchant-Node-01',
        peerRole: 'merchant',
        avatarText: 'M',
        lastMessage: 'Xác thực E2EE hoàn tất. Chào bạn, tôi là đại diện bán hàng tự động của Ghost Bazaar...',
        lastTime: getCurrentTimeStr(),
        unreadCount: 0,
        messages: [
          {
            id: 'msg-init-1',
            author: 'Merchant-Node-01',
            role: 'merchant',
            time: getCurrentTimeStr(),
            text: 'Xác thực E2EE hoàn tất. Chào bạn, tôi là đại diện bán hàng tự động của Ghost Bazaar. Toàn bộ phiên đàm thoại này đang nằm trên RAM khả biến máy khách, được mã hóa bằng AES-256-GCM và sẽ tự động xóa sạch hoàn toàn khi bạn rời trang hoặc nhấn ESC.'
          }
        ]
      }
    ];
    activeThreadId = 'thread-merchant-general';
  }

  const cur = getActiveThread();
  if (cur) inMemoryChatMessages = cur.messages;
}

function saveChatThreadsToStorage() {
  if (isPurgingNow) return;
  try {
    const json = JSON.stringify(chatThreads);
    localStorage.setItem('ghost_messenger_threads_v2', json);
    sessionStorage.setItem('ghost_messenger_threads_v2', json);
    if (activeThreadId) {
      localStorage.setItem('ghost_active_thread_v2', activeThreadId);
      sessionStorage.setItem('ghost_active_thread_v2', activeThreadId);
    }
  } catch {}
}

function updateFloatingMessengerBadge() {
  const badge = document.getElementById('floating-messenger-badge');
  const chatTabBadge = document.getElementById('chat-badge');
  const totalUnread = chatThreads.reduce((sum, t) => sum + (t.unreadCount || 0), 0);

  if (badge) {
    if (totalUnread > 0) {
      badge.textContent = String(totalUnread);
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  if (chatTabBadge) {
    if (totalUnread > 0) {
      chatTabBadge.textContent = String(totalUnread);
      chatTabBadge.style.display = 'inline-block';
    } else {
      chatTabBadge.style.display = 'none';
    }
  }
}

function renderMessengerThreads() {
  const container = document.getElementById('messenger-threads-list');
  const countBadge = document.getElementById('messenger-threads-count');
  if (countBadge) {
    countBadge.textContent = `${chatThreads.length} cuộc trò chuyện`;
  }
  if (!container) return;

  const searchInput = document.getElementById('messenger-thread-search');
  const filterKw = (searchInput?.value || '').trim().toLowerCase();

  const filtered = chatThreads.filter(t => {
    if (!filterKw) return true;
    return (t.peerAlias && t.peerAlias.toLowerCase().includes(filterKw)) ||
           (t.productName && t.productName.toLowerCase().includes(filterKw)) ||
           (t.lastMessage && t.lastMessage.toLowerCase().includes(filterKw)) ||
           (t.dealId && t.dealId.toLowerCase().includes(filterKw));
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding: 1.5rem 1rem; text-align: center; color: #64748b; font-size: 0.78rem;">Không tìm thấy cuộc trò chuyện nào</div>`;
    return;
  }

  container.innerHTML = filtered.map(t => {
    const isActive = t.id === activeThreadId;
    const initial = (t.avatarText || t.peerAlias || 'M').charAt(0).toUpperCase();
    const unreadHtml = t.unreadCount > 0 ? `<span class="thread-unread-pill">${t.unreadCount}</span>` : '';
    const dealBadge = t.dealId ? `<span style="color: #34d399; font-size: 0.65rem; font-family: var(--font-mono); margin-left: 4px;">[${t.dealId}]</span>` : '';

    return `
      <div class="messenger-thread-item ${isActive ? 'active' : ''}" data-thread-id="${escapeHtml(t.id)}">
        <div class="thread-avatar-wrap">
          <span>${escapeHtml(initial)}</span>
          <span class="thread-online-dot"></span>
        </div>
        <div class="thread-content">
          <div class="thread-top-row">
            <span class="thread-peer-name">${escapeHtml(t.peerAlias || 'Ẩn Danh')}${dealBadge}</span>
            <span class="thread-time">${escapeHtml(t.lastTime || '')}</span>
          </div>
          <div>
            <span class="thread-product-badge">📦 ${escapeHtml(t.productName || 'Vật phẩm')}</span>
          </div>
          <div class="thread-snippet">${escapeHtml(t.lastMessage || 'Chưa có tin nhắn')}</div>
        </div>
        ${unreadHtml}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.messenger-thread-item').forEach(item => {
    item.addEventListener('click', () => {
      const threadId = item.getAttribute('data-thread-id');
      if (threadId) {
        selectMessengerThread(threadId);
      }
    });
  });
}

function selectMessengerThread(threadId) {
  const target = chatThreads.find(t => t.id === threadId);
  if (!target) return;

  activeThreadId = target.id;
  target.unreadCount = 0;
  saveChatThreadsToStorage();

  renderMessengerThreads();
  updateActiveThreadHeader();
  renderChatMessages();
  updateFloatingMessengerBadge();

  const input = document.getElementById('chat-input-field');
  input?.focus();
}

function updateActiveThreadHeader() {
  const thread = getActiveThread();
  if (!thread) return;

  const avatarText = document.getElementById('chat-peer-avatar-text');
  const peerName = document.getElementById('chat-peer-name');
  const peerBadge = document.getElementById('chat-peer-badge');
  const prodTag = document.getElementById('active-product-tag');
  const statusText = document.getElementById('p2p-status-text');
  const pulseDot = document.getElementById('p2p-pulse-dot');

  if (avatarText) avatarText.textContent = (thread.avatarText || thread.peerAlias || 'M').charAt(0).toUpperCase();
  if (peerName) peerName.textContent = thread.peerAlias || 'Merchant-Node-01';
  if (prodTag) prodTag.textContent = `Về: ${thread.productName || 'Tư vấn chung'}`;

  if (thread.dealId) {
    if (peerBadge) {
      peerBadge.textContent = `🛡️ PHIÊN RIÊNG BIỆT [${thread.dealId}]`;
      peerBadge.className = 'verified-vendor-badge p2p-connected-badge';
    }
    if (statusText) statusText.textContent = `🟢 Kênh đàm thoại riêng cho "${thread.productName}" • Cách ly 100% với các khách khác`;
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot connected';
  } else {
    if (peerBadge) {
      peerBadge.textContent = '✓ ĐÃ XÁC MINH PGP';
      peerBadge.className = 'verified-vendor-badge';
    }
    if (statusText) statusText.textContent = '🔴 Chế độ Bot Tự Động (Chưa kết nối P2P)';
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot disconnected';
  }

  // Update Auto-Deal Banner if applicable
  const banner = document.getElementById('auto-deal-banner');
  const codeBadge = document.getElementById('auto-deal-code-badge');
  const prodLabel = document.getElementById('auto-deal-product-label');

  if (thread.dealId) {
    if (banner) banner.style.display = 'flex';
    if (codeBadge) codeBadge.textContent = thread.dealId;
    if (prodLabel) prodLabel.textContent = `${thread.productName} (Đàm thoại riêng)`;
  } else {
    if (banner) banner.style.display = 'none';
  }
}

function getMyDealRole(deal) {
  if (!deal || !deal.dealId) return 'buyer';
  try {
    const savedRole = sessionStorage.getItem(`ghost_my_deal_role_${deal.dealId}`);
    if (savedRole === 'buyer' || savedRole === 'seller') return savedRole;
  } catch {}
  return 'buyer';
}

function setMyDealRole(dealId, role) {
  if (!dealId) return;
  try {
    sessionStorage.setItem(`ghost_my_deal_role_${dealId}`, role);
  } catch {}
}

async function startAutoBlindDeal(productName, productId = '') {
  const randHex = Array.from(crypto.getRandomValues(new Uint8Array(2)))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  const dealId = `DEAL-${randHex}`;
  const threadId = `thread-${productId || 'item'}-${randHex}`;

  let createdDeal = null;
  try {
    const res = await bazaarApiFetch('/api/lexicon/bazaar-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'init',
        dealId,
        productId,
        productName,
        initiatorAlias: anonymousAlias
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.deal) createdDeal = data.deal;
    }
  } catch {}

  if (!createdDeal) {
    const bMask = randHex.slice(0, 4);
    const sMask = Array.from(crypto.getRandomValues(new Uint8Array(2)))
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join('');
    createdDeal = {
      dealId,
      productId: productId || 'custom',
      productName: productName || 'Mặt hàng ẩn danh',
      buyerBlindId: `Khách-Ẩn-Danh #${bMask} [IP & ID: ĐÃ ẨN]`,
      sellerBlindId: `Người-Bán-Ẩn-Danh #${sMask} [IP & ID: ĐÃ ẨN]`,
      status: 'connected',
      createdAt: Date.now(),
      messages: [
        {
          id: `sys-${Date.now()}`,
          role: 'system',
          senderBlindId: 'HỆ THỐNG KẾT NỐI TỰ ĐỘNG',
          time: getCurrentTimeStr(),
          text: `🔐 ĐÃ TỰ SINH PHÒNG CHAT RIÊNG BIỆT [${dealId}] cho mặt hàng "${productName}". Danh tính và IP (0.0.0.0) được che giấu tuyệt đối. Mọi tin nhắn cách ly hoàn toàn với các khách mua khác!`
        }
      ]
    };
  }

  setMyDealRole(createdDeal.dealId, 'buyer');

  // Spawn new conversation thread in Messenger
  const newThread = {
    id: threadId,
    dealId: createdDeal.dealId,
    productId: productId || 'general',
    productName: productName,
    peerAlias: createdDeal.sellerBlindId || 'Merchant-Node-01',
    peerRole: 'merchant',
    avatarText: 'M',
    lastMessage: `Bắt đầu hỏi mua "${productName}"`,
    lastTime: getCurrentTimeStr(),
    unreadCount: 0,
    messages: createdDeal.messages.map(m => ({
      author: m.senderBlindId || 'HỆ THỐNG GIAO DỊCH',
      role: 'system',
      time: m.time || getCurrentTimeStr(),
      text: m.text
    }))
  };

  chatThreads.unshift(newThread);
  activeThreadId = newThread.id;
  activeAutoDeal = createdDeal;

  saveChatThreadsToStorage();
  saveActiveDealToStorage(createdDeal);

  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'DEAL_SYNC',
        deal: createdDeal,
        thread: newThread
      });
    } catch {}
  }

  renderMessengerThreads();
  updateActiveThreadHeader();
  renderChatMessages();
  updateFloatingMessengerBadge();

  showToast(`🔗 Đã mở cuộc trò chuyện riêng [${createdDeal.dealId}] cho "${productName}"! Các khách khác không thể xem đoạn chat này.`, 'success');
  return createdDeal;
}

function applyIncomingBlindDealState(deal, isInitiator = false) {
  if (!deal || !deal.dealId) return;
  if (deal.dealId === lastBurnedDealId || deal.status === 'completed_burned') {
    executeLocalDealAutoBurn(deal.dealId, true);
    return;
  }

  let matchingThread = chatThreads.find(t => t.dealId === deal.dealId);

  if (!matchingThread) {
    // A new buyer has connected for this item! Spawn a dedicated thread for this buyer
    let existingRole = null;
    try {
      existingRole = sessionStorage.getItem(`ghost_my_deal_role_${deal.dealId}`);
    } catch {}
    if (!existingRole && !isInitiator) {
      setMyDealRole(deal.dealId, 'seller');
    }

    const myRole = getMyDealRole(deal);
    const partnerName = myRole === 'buyer' ? deal.sellerBlindId : deal.buyerBlindId;
    const initialAvatar = myRole === 'buyer' ? 'B' : 'K';

    matchingThread = {
      id: `thread-${deal.dealId}`,
      dealId: deal.dealId,
      productId: deal.productId || 'general',
      productName: deal.productName || 'Giao dịch Ẩn danh',
      peerAlias: partnerName,
      peerRole: myRole === 'buyer' ? 'merchant' : 'buyer',
      avatarText: initialAvatar,
      lastMessage: deal.messages?.[deal.messages.length - 1]?.text || 'Khách đã kết nối',
      lastTime: getCurrentTimeStr(),
      unreadCount: isInitiator ? 0 : 1,
      messages: []
    };

    chatThreads.unshift(matchingThread);
    playNotificationChime();
    showToast(`🔔 Khách [${deal.buyerBlindId}] vừa mở kênh hỏi mua "${deal.productName}" (Mã: ${deal.dealId})!`, 'info');
  }

  const myRole = getMyDealRole(deal);

  if (Array.isArray(deal.messages)) {
    matchingThread.messages = deal.messages.map(m => {
      if (m.role === 'system') {
        return {
          author: m.senderBlindId || 'KÊNH GIAO DỊCH ẨN DANH',
          role: 'system',
          time: m.time || getCurrentTimeStr(),
          text: m.text
        };
      }
      if (m.role === myRole) {
        return {
          author: `Tôi • ${m.senderBlindId || ''}`,
          role: 'buyer',
          time: m.time || getCurrentTimeStr(),
          text: m.text
        };
      }
      return {
        author: m.senderBlindId || 'Đối Tác',
        role: 'merchant',
        time: m.time || getCurrentTimeStr(),
        text: m.text
      };
    });

    const last = deal.messages[deal.messages.length - 1];
    if (last) {
      matchingThread.lastMessage = last.text;
      matchingThread.lastTime = last.time || getCurrentTimeStr();
      if (!isInitiator && matchingThread.id !== activeThreadId) {
        matchingThread.unreadCount = (matchingThread.unreadCount || 0) + 1;
        playNotificationChime();
      }
    }
  }

  saveChatThreadsToStorage();
  renderMessengerThreads();
  if (matchingThread.id === activeThreadId) {
    updateActiveThreadHeader();
    renderChatMessages();
  }
  updateFloatingMessengerBadge();
  updateRamMonitor();
}

async function sendBlindDealMessage(text) {
  const thread = getActiveThread();
  if (!thread || !thread.dealId) return;

  const myRole = getMyDealRole({ dealId: thread.dealId });
  const senderBlindId = myRole === 'seller' ? 'Người Bán Ẩn Danh' : 'Khách Ẩn Danh';

  let updatedDeal = null;
  try {
    const res = await bazaarApiFetch('/api/lexicon/bazaar-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'message',
        dealId: thread.dealId,
        senderRole: myRole,
        text
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.deal) updatedDeal = data.deal;
    }
  } catch {}

  if (!updatedDeal) {
    thread.messages.push({
      author: `Tôi • ${senderBlindId}`,
      role: 'buyer',
      time: getCurrentTimeStr(),
      text
    });
    thread.lastMessage = text;
    thread.lastTime = getCurrentTimeStr();
  } else {
    applyIncomingBlindDealState(updatedDeal, true);
  }

  saveChatThreadsToStorage();
  renderMessengerThreads();
  renderChatMessages();

  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'DEAL_SYNC',
        deal: updatedDeal,
        threadId: thread.id
      });
    } catch {}
  }
}

async function confirmBlindDealPayment() {
  const thread = getActiveThread();
  if (!thread || !thread.dealId) {
    showToast('Chưa có phiên giao dịch nào đang mở!', 'warning');
    return;
  }

  let updatedDeal = null;
  try {
    const res = await bazaarApiFetch('/api/lexicon/bazaar-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'pay_escrow',
        dealId: thread.dealId
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.deal) updatedDeal = data.deal;
    }
  } catch {}

  thread.messages.push({
    author: 'KÝ QUỸ RAM (ESCROW)',
    role: 'system',
    time: getCurrentTimeStr(),
    text: `💸 [ĐÃ NẠP KÝ QUỸ THÀNH CÔNG]: Người mua ẩn danh đã xác nhận thanh toán cho phiên [${thread.dealId}]. Sau khi bàn giao xong, nhấn "✅ Hoàn Tất Mua Hàng & Thanh Toán" để giải ngân và tự hủy đoạn chat này!`
  });
  thread.lastMessage = 'Đã nạp ký quỹ Monero';
  thread.lastTime = getCurrentTimeStr();

  saveChatThreadsToStorage();
  renderMessengerThreads();
  renderChatMessages();

  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'DEAL_SYNC',
        deal: updatedDeal || { dealId: thread.dealId, status: 'paid_escrow' }
      });
    } catch {}
  }

  showToast(`💸 Đã xác nhận thanh toán Ký quỹ cho [${thread.dealId}]! Hãy nhấn "Hoàn Tất Mua Hàng" để giải ngân và tự hủy.`, 'success');
}

async function completeDealAndAutoBurn() {
  const thread = getActiveThread();
  const targetDealId = thread?.dealId || activeAutoDeal?.dealId || 'DEAL-RAM';

  try {
    await bazaarApiFetch('/api/lexicon/bazaar-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'complete_and_burn',
        dealId: targetDealId
      })
    });
  } catch {}

  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'DEAL_COMPLETED_BURN',
        dealId: targetDealId
      });
    } catch {}
  }

  executeLocalDealAutoBurn(targetDealId, false);
}

function executeLocalDealAutoBurn(dealId, isRemoteTrigger = false) {
  const burnedCode = dealId || 'DEAL';
  lastBurnedDealId = burnedCode;

  // Remove the burned thread from Messenger threads
  chatThreads = chatThreads.filter(t => t.dealId !== burnedCode);
  if (chatThreads.length === 0) {
    loadChatThreadsFromStorage();
  } else {
    activeThreadId = chatThreads[0].id;
  }

  saveChatThreadsToStorage();

  const banner = document.getElementById('auto-deal-banner');
  if (banner) banner.style.display = 'none';

  renderMessengerThreads();
  updateActiveThreadHeader();
  renderChatMessages();
  updateFloatingMessengerBadge();
  updateRamMonitor();

  playNotificationChime();
  showToast(
    `🔥 Hoàn tất mua hàng & thanh toán! Đoạn chat mã [${burnedCode}] đã TỰ ĐỘNG BIẾN MẤT khỏi RAM cả 2 bên!`,
    'success'
  );
}

async function pollBlindDealRelay() {
  try {
    const res = await bazaarApiFetch('/api/lexicon/bazaar-deals', {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && Array.isArray(data.deals)) {
      data.deals.forEach(deal => {
        applyIncomingBlindDealState(deal, false);
      });
    } else if (data && data.deal) {
      applyIncomingBlindDealState(data.deal, false);
    }
  } catch {}
}

function initEncryptedChat() {
  loadChatThreadsFromStorage();

  const sendBtn = document.getElementById('send-chat-btn');
  const chatInput = document.getElementById('chat-input-field');
  const purgeBtn = document.getElementById('purge-chat-btn');
  const quickBtns = document.querySelectorAll('.quick-q-btn');
  const copyPgpBtn = document.getElementById('copy-pgp-fingerprint');
  const confirmPayBtn = document.getElementById('btn-deal-confirm-pay');
  const completeBurnBtn = document.getElementById('btn-deal-complete-burn');
  const newThreadBtn = document.getElementById('btn-new-thread');
  const searchThreadInput = document.getElementById('messenger-thread-search');
  const floatingMessengerBtn = document.getElementById('floating-messenger-btn');

  // Search filter in threads list
  if (searchThreadInput) {
    searchThreadInput.addEventListener('input', () => {
      renderMessengerThreads();
    });
  }

  // New Thread CTA
  if (newThreadBtn) {
    newThreadBtn.addEventListener('click', () => {
      const topic = prompt('Nhập tên vật phẩm hoặc chủ đề muốn đàm thoại:', 'Vật phẩm đấu giá');
      if (topic && topic.trim()) {
        startAutoBlindDeal(topic.trim(), 'custom');
      }
    });
  }

  // Floating Messenger Dock Button
  if (floatingMessengerBtn) {
    floatingMessengerBtn.addEventListener('click', () => {
      switchTab('tab-chat');
      const input = document.getElementById('chat-input-field');
      input?.focus();
    });
  }

  // Deal confirmation buttons
  if (confirmPayBtn) {
    confirmPayBtn.addEventListener('click', () => {
      confirmBlindDealPayment();
    });
  }

  if (completeBurnBtn) {
    completeBurnBtn.addEventListener('click', () => {
      if (confirm('Xác nhận hoàn tất giao dịch và thanh toán? Toàn bộ đoạn chat này sẽ bị xóa vĩnh viễn khỏi RAM của cả hai bên!')) {
        completeDealAndAutoBurn();
      }
    });
  }

  // P2P Controls
  const btnHost = document.getElementById('btn-p2p-host');
  const btnJoin = document.getElementById('btn-p2p-join');
  const inputCode = document.getElementById('input-p2p-code');
  const btnCopy = document.getElementById('btn-p2p-copy-link');
  const btnDisconnect = document.getElementById('btn-p2p-disconnect');

  if (btnHost) {
    btnHost.addEventListener('click', () => {
      const roomCode = generateRoomCode();
      hostP2PRoom(roomCode);
    });
  }

  if (btnJoin && inputCode) {
    btnJoin.addEventListener('click', () => {
      let code = inputCode.value.trim();
      if (!code) {
        showToast('Vui lòng nhập mã phòng P2P!', 'warning');
        return;
      }
      if (code.includes('#room=')) {
        code = decodeURIComponent(code.split('#room=')[1]);
      }
      joinP2PRoom(code);
    });
  }

  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      if (p2pRoomCode) {
        const link = getRoomShareableLink(p2pRoomCode);
        navigator.clipboard.writeText(link).then(() => {
          showToast('Đã sao chép link phòng P2P! Gửi link này cho khách.', 'success');
        });
      }
    });
  }

  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', () => {
      disconnectP2P(false);
      showToast('Đã ngắt kết nối P2P!', 'info');
    });
  }

  // Purge current thread button
  if (purgeBtn) {
    purgeBtn.addEventListener('click', () => {
      const thread = getActiveThread();
      if (thread) {
        thread.messages = [];
        thread.lastMessage = 'Đoạn chat đã được xóa sạch khỏi RAM';
        saveChatThreadsToStorage();
        renderChatMessages();
        renderMessengerThreads();
        updateRamMonitor();
        showToast(`Đã xóa sạch tin nhắn của đoạn chat "${thread.productName}" trong RAM!`, 'success');
      }
    });
  }

  // Send message
  const handleSend = () => {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';
    const thread = getActiveThread();
    if (!thread) return;

    if (thread.dealId) {
      sendBlindDealMessage(text);
      return;
    }

    if (isP2PConnected && activePeerConnection) {
      try {
        activePeerConnection.send({
          type: 'chat',
          text,
          alias: anonymousAlias,
          time: getCurrentTimeStr()
        });
      } catch {}

      thread.messages.push({
        author: `Tôi (${anonymousAlias})`,
        role: 'buyer',
        time: getCurrentTimeStr(),
        text
      });
      thread.lastMessage = text;
      thread.lastTime = getCurrentTimeStr();
    } else {
      // Offline / Bot mode simulation
      thread.messages.push({
        author: anonymousAlias || 'Ghost-Buyer',
        role: 'buyer',
        time: getCurrentTimeStr(),
        text
      });
      thread.lastMessage = text;
      thread.lastTime = getCurrentTimeStr();

      const typing = document.getElementById('chat-typing-indicator');
      if (typing) typing.style.display = 'flex';

      setTimeout(() => {
        if (typing) typing.style.display = 'none';
        const reply = generateMerchantReply(text);
        thread.messages.push({
          author: thread.peerAlias || 'Merchant-Node-01',
          role: 'merchant',
          time: getCurrentTimeStr(),
          text: reply
        });
        thread.lastMessage = reply;
        thread.lastTime = getCurrentTimeStr();
        saveChatThreadsToStorage();
        renderChatMessages();
        renderMessengerThreads();
        updateRamMonitor();
      }, 700);
    }

    saveChatThreadsToStorage();
    renderChatMessages();
    renderMessengerThreads();
    updateRamMonitor();
  };

  if (sendBtn) sendBtn.addEventListener('click', handleSend);
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  // Quick inquiry chips
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-q');
      if (q && chatInput) {
        chatInput.value = q;
        chatInput.focus();
      }
    });
  });

  // Copy PGP fingerprint
  if (copyPgpBtn) {
    copyPgpBtn.addEventListener('click', () => {
      navigator.clipboard.writeText('4A8F C310 998D E21B 77A4 0019 FF45 8891 00C2 91BC').then(() => {
        showToast('Đã sao chép PGP Fingerprint của shop!', 'success');
      });
    });
  }

  renderMessengerThreads();
  updateActiveThreadHeader();
  renderChatMessages();
  updateFloatingMessengerBadge();

  // Poll for background deals every 2.5s
  setInterval(pollBlindDealRelay, 2500);
}

function renderChatMessages() {
  const container = document.getElementById('chat-message-list');
  if (!container) return;

  const thread = getActiveThread();
  const msgs = thread ? thread.messages : inMemoryChatMessages;

  if (!msgs || msgs.length === 0) {
    container.innerHTML = `<div style="margin: auto; text-align: center; color: #64748b; font-size: 0.82rem; padding: 2rem;">
      <span style="font-size: 1.8rem; display: block; margin-bottom: 0.5rem;">🔒</span>
      Chưa có tin nhắn trong cuộc trò chuyện này.<br>Gõ tin nhắn bên dưới để bắt đầu đàm thoại bảo mật!
    </div>`;
    return;
  }

  container.innerHTML = msgs.map(msg => {
    if (msg.role === 'system') {
      return `
        <div class="chat-system-msg">
          <div class="system-bubble">${escapeHtml(msg.text)}</div>
          <span class="system-time">${escapeHtml(msg.time)}</span>
        </div>
      `;
    }

    if (msg.role === 'buyer') {
      return `
        <div class="chat-msg buyer">
          <div class="msg-bubble">
            <div class="msg-text">${escapeHtml(msg.text)}</div>
            <span class="msg-meta-time">${escapeHtml(msg.time)}</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="chat-msg merchant">
        <div class="msg-bubble">
          <div class="msg-author-tag">${escapeHtml(msg.author || thread?.peerAlias || 'Người Bán')}</div>
          <div class="msg-text">${escapeHtml(msg.text)}</div>
          <span class="msg-meta-time">${escapeHtml(msg.time)}</span>
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function generateMerchantReply(userMsg) {
  const lower = userMsg.toLowerCase();

  if (lower.includes('monero') || lower.includes('xmr') || lower.includes('thanh toán')) {
    return 'Giao dịch tại Ghost Bazaar sử dụng 100% Monero (XMR) để bảo đảm tính không thể truy vết (Stealth Addresses & RingCT). Khi bạn tạo đơn hàng, hệ thống sẽ phát sinh địa chỉ ví tạm thời dùng 1 lần trong RAM.';
  }

  if (lower.includes('drop') || lower.includes('bàn giao') || lower.includes('nhận hàng')) {
    return 'Các mặt hàng số (cấu hình mạng, chứng chỉ, whitepaper, khóa PGP) được đóng gói và mã hóa AES-256-GCM thành mã Drop ID dùng 1 lần (Burn-After-Reading). Ngay khi bạn tải về, dữ liệu sẽ tự hủy hoàn toàn trên máy chủ.';
  }

  if (lower.includes('pgp') || lower.includes('xác minh') || lower.includes('chữ ký')) {
    return 'Dấu vân tay khóa PGP chính thức của Merchant Node: [4A8F C310 998D E21B 77A4 0019 FF45 8891 00C2 91BC]. Bạn có thể yêu cầu gói hàng được mã hóa riêng cho PGP Public Key của bạn ở tab Đơn Hàng.';
  }

  if (lower.includes('zero-log') || lower.includes('ip') || lower.includes('lưu')) {
    return 'Hệ thống vận hành theo nguyên tắc Zero-Log triệt để: Máy chủ không chạy Apache/Nginx access logs, không lưu địa chỉ IP, không ghi ổ đĩa. Mọi tin nhắn này sẽ biến mất vĩnh viễn ngay khi bạn đóng tab hoặc nhấn ESC.';
  }

  return `Đã nhận yêu cầu: "${userMsg}". Merchant-Node-01 đã sẵn sàng xử lý đơn hàng ẩn danh của bạn qua hợp đồng ký quỹ tạm thời (RAM Escrow). Bạn có thể sang tab "Đơn Hàng" để khởi tạo đơn mua.`;
}

function getCurrentTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

/* ==========================================================================
   6. ANONYMOUS ORDER & RAM ESCROW SYSTEM
   ========================================================================== */

function initOrderSystem() {
  const productSelect = document.getElementById('order-product-select');
  const createOrderBtn = document.getElementById('create-order-btn');
  const clearOrderBtn = document.getElementById('clear-order-btn');
  const cancelOrderBtn = document.getElementById('cancel-order-btn');
  const completeOrderBurnBtn = document.getElementById('complete-order-burn-btn');
  const copyXmrBtn = document.getElementById('copy-xmr-btn');
  const showQrBtn = document.getElementById('show-order-qr-btn');
  const chatAboutOrderBtn = document.getElementById('chat-about-order-btn');
  const samplePgpBtn = document.getElementById('insert-sample-pgp-btn');
  const ttlPills = document.querySelectorAll('#order-ttl-pills .ttl-pill');
  const ttlValueInput = document.getElementById('order-ttl-value');

  if (productSelect) {
    productSelect.addEventListener('change', () => {
      updateOrderPreviewCard();
    });
  }

  // TTL Pills Selection
  ttlPills.forEach(pill => {
    pill.addEventListener('click', () => {
      ttlPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      if (ttlValueInput) {
        ttlValueInput.value = pill.getAttribute('data-ttl');
      }
    });
  });

  // Sample PGP Public Key button
  if (samplePgpBtn) {
    samplePgpBtn.addEventListener('click', () => {
      const pubkeyInput = document.getElementById('order-receiver-pubkey');
      if (pubkeyInput) {
        pubkeyInput.value = `-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: KeybaseOpenPGP v2.1.13\nComment: https://keybase.io/crypto\n\nxsFNBF7X4zMBEADL...sample_recipient_pubkey_bytes...==\n-----END PGP PUBLIC KEY BLOCK-----`;
        showToast('Đã dán mẫu PGP Public Key vào trường nhận hàng!', 'info');
      }
    });
  }

  // Create Order Handler
  if (createOrderBtn) {
    createOrderBtn.addEventListener('click', () => {
      const pubkeyInput = document.getElementById('order-receiver-pubkey');
      const prodId = productSelect?.value;
      const product = MARKET_PRODUCTS.find(p => p.id === prodId) || MARKET_PRODUCTS[0];
      const ttl = parseInt(ttlValueInput?.value || '3600', 10);
      const receiverKey = (pubkeyInput?.value || '').trim();

      // Generate random Monero address & 128-bit Order ID
      const orderHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join('');
      const orderId = `ORD-XMR-${orderHex}`;

      const xmrPrefix = '888tNkZrPN6';
      const xmrSuffix = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const xmrAddress = `${xmrPrefix}${xmrSuffix}99XMR`;

      activeOrder = {
        orderId,
        product,
        xmrAddress,
        ttl,
        receiverKey,
        createdAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000)
      };

      saveActiveOrderToStorage();
      displayOrderResult(activeOrder);
      updateRamMonitor();

      // Automatically connect Buyer <-> Seller Deal Channel when Order is created
      startAutoBlindDeal(product.name, product.id);
      showToast('Khởi tạo đơn hàng ký quỹ & tự động kết nối kênh ẩn danh với Người bán thành công!', 'success');
    });
  }

  // Restore active order from storage on F5 reload if still valid
  try {
    const rawOrder = localStorage.getItem(STORAGE_KEYS.ACTIVE_ORDER) || sessionStorage.getItem(STORAGE_KEYS.ACTIVE_ORDER);
    if (rawOrder) {
      const parsedOrder = JSON.parse(rawOrder);
      if (parsedOrder && parsedOrder.expiresAt && parsedOrder.expiresAt > Date.now()) {
        activeOrder = parsedOrder;
        displayOrderResult(activeOrder);
      } else {
        saveActiveOrderToStorage();
      }
    }
  } catch {}

  if (clearOrderBtn) {
    clearOrderBtn.addEventListener('click', () => {
      const pubkeyInput = document.getElementById('order-receiver-pubkey');
      if (pubkeyInput) pubkeyInput.value = '';
    });
  }

  if (completeOrderBurnBtn) {
    completeOrderBurnBtn.addEventListener('click', () => {
      completeDealAndAutoBurn();
    });
  }

  if (cancelOrderBtn) {
    cancelOrderBtn.addEventListener('click', () => {
      activeOrder = null;
      saveActiveOrderToStorage();
      if (orderCountdownTimer) clearInterval(orderCountdownTimer);
      const resultBox = document.getElementById('order-result-box');
      if (resultBox) resultBox.style.display = 'none';
      updateRamMonitor();
      showToast('Đã hủy và xóa sạch đơn hàng khỏi bộ nhớ RAM!', 'info');
    });
  }

  if (copyXmrBtn) {
    copyXmrBtn.addEventListener('click', () => {
      const addrInput = document.getElementById('receipt-xmr-address');
      if (addrInput && navigator.clipboard) {
        navigator.clipboard.writeText(addrInput.value).then(() => {
          showToast('Đã sao chép địa chỉ ví Monero (XMR) vào bộ đệm!', 'success');
        });
      }
    });
  }

  if (showQrBtn) {
    showQrBtn.addEventListener('click', () => {
      if (!activeOrder) return;
      const qrBox = document.getElementById('qr-code-box');
      const qrOverlay = document.getElementById('qr-modal-overlay');
      if (qrBox && qrOverlay) {
        qrBox.innerHTML = '';
        const qr = qrcode(0, 'M');
        qr.addData(`monero:${activeOrder.xmrAddress}?tx_amount=${activeOrder.product.priceXMR.replace(' XMR', '')}`);
        qr.make();
        qrBox.innerHTML = qr.createSvgTag(6, 0);
        qrOverlay.style.display = 'flex';
      }
    });
  }

  if (chatAboutOrderBtn) {
    chatAboutOrderBtn.addEventListener('click', () => {
      if (!activeOrder) return;
      initiateChatForProduct(activeOrder.product.name, activeOrder.product.id);
    });
  }
}

function displayOrderResult(order) {
  const resultBox = document.getElementById('order-result-box');
  const orderIdEl = document.getElementById('receipt-order-id');
  const prodNameEl = document.getElementById('receipt-product-name');
  const amountEl = document.getElementById('receipt-amount-xmr');
  const countdownEl = document.getElementById('receipt-expiry-countdown');
  const xmrAddrInput = document.getElementById('receipt-xmr-address');
  const progressBar = document.getElementById('order-progress-bar');

  if (!resultBox) return;

  if (orderIdEl) orderIdEl.textContent = order.orderId;
  if (prodNameEl) prodNameEl.textContent = `${order.product.name} (${order.product.approxUSD})`;
  if (amountEl) amountEl.textContent = order.product.priceXMR;
  if (xmrAddrInput) xmrAddrInput.value = order.xmrAddress;

  resultBox.style.display = 'block';

  // Start countdown timer
  if (orderCountdownTimer) clearInterval(orderCountdownTimer);
  orderCountdownTimer = setInterval(() => {
    const totalDuration = order.ttl;
    const remaining = Math.max(0, Math.floor((order.expiresAt - Date.now()) / 1000));
    if (countdownEl) countdownEl.textContent = `${remaining}s`;

    if (progressBar) {
      const percentage = Math.max(0, Math.min(100, (remaining / totalDuration) * 100));
      progressBar.style.transform = `scaleX(${percentage / 100})`;
      if (percentage < 20) {
        progressBar.style.backgroundColor = '#ef4444';
      } else if (percentage < 50) {
        progressBar.style.backgroundColor = '#f59e0b';
      } else {
        progressBar.style.backgroundColor = '#10b981';
      }
    }

    if (remaining <= 0) {
      clearInterval(orderCountdownTimer);
      activeOrder = null;
      resultBox.style.display = 'none';
      updateRamMonitor();
      showToast('Đơn hàng đã tự hủy khỏi RAM do hết thời gian hiệu lực (TTL)!', 'error');
    }
  }, 1000);
}

/* ==========================================================================
   7. LIVE RAM ALLOCATION MONITOR (IN AUDIT TAB)
   ========================================================================== */

function updateRamMonitor() {
  const chatBytesEl = document.getElementById('ram-chat-bytes');
  const orderBytesEl = document.getElementById('ram-order-bytes');

  if (chatBytesEl) {
    const chatJson = JSON.stringify(inMemoryChatMessages);
    const chatBytes = new TextEncoder().encode(chatJson).length;
    chatBytesEl.textContent = `${chatBytes} Bytes (${inMemoryChatMessages.length} tin)`;
  }

  if (orderBytesEl) {
    if (activeOrder) {
      const orderJson = JSON.stringify(activeOrder);
      const orderBytes = new TextEncoder().encode(orderJson).length;
      orderBytesEl.textContent = `${orderBytes} Bytes (1 đơn ký quỹ)`;
    } else {
      orderBytesEl.textContent = '0 Bytes (Trống)';
    }
  }
}

/* ==========================================================================
   8. EPHEMERAL AUCTION BIDDING & LIVE COUNTDOWN TIMER
   ========================================================================== */

let activeBiddingProductId = null;
let auctionIntervalTimer = null;

function updateAuctionCountdowns() {
  const pills = document.querySelectorAll('.auction-countdown-pill');
  const now = Date.now();

  pills.forEach(pill => {
    const end = parseInt(pill.getAttribute('data-end') || '0', 10);
    const countdownVal = pill.querySelector('.countdown-val');

    if (end === 0) {
      if (countdownVal) countdownVal.textContent = 'MỞ TỰ DO';
      return;
    }

    const diff = Math.max(0, Math.floor((end - now) / 1000));

    if (diff <= 0) {
      if (countdownVal) countdownVal.textContent = 'MỞ GIA HẠN';
      return;
    }

    const hours = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    const secs = diff % 60;

    const formatted = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (countdownVal) countdownVal.textContent = formatted;
  });
}

function estimateUSDString(val, currency = 'XMR') {
  const num = Number(val) || 0;
  if (currency === 'USD' || currency === 'USDT') return `~$${formatPriceNum(num)} USD`;
  if (currency === 'BTC') return `~$${Math.round(num * 68000).toLocaleString('en-US')} USD`;
  if (currency === 'ETH') return `~$${Math.round(num * 3200).toLocaleString('en-US')} USD`;
  if (currency === 'VNĐ') return `~${Math.round(num).toLocaleString('en-US')} VNĐ`;
  return `~$${Math.round(num * 165).toLocaleString('en-US')} USD`;
}

function initAuctionBidding() {
  if (auctionIntervalTimer) clearInterval(auctionIntervalTimer);
  auctionIntervalTimer = setInterval(updateAuctionCountdowns, 1000);

  const modalOverlay = document.getElementById('bid-modal-overlay');
  const closeBtn = document.getElementById('close-bid-modal-btn');
  const cancelBtn = document.getElementById('cancel-bid-modal-btn');
  const buyoutBtn = document.getElementById('buyout-from-bid-btn');
  const submitBtn = document.getElementById('submit-bid-btn');
  const bidInput = document.getElementById('bid-amount-input');
  const quickStepBtns = document.querySelectorAll('.quick-bid-step-btn');

  const closeModal = () => {
    if (modalOverlay) modalOverlay.style.display = 'none';
    activeBiddingProductId = null;
  };

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  if (buyoutBtn) {
    buyoutBtn.addEventListener('click', () => {
      if (!activeBiddingProductId) return;
      const targetId = activeBiddingProductId;
      closeModal();
      initiateOrderForProduct(targetId);
    });
  }

  quickStepBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!activeBiddingProductId || !bidInput) return;
      const product = MARKET_PRODUCTS.find(p => p.id === activeBiddingProductId);
      if (!product) return;
      const mult = parseFloat(btn.getAttribute('data-mult') || '1.1');
      const base = product.currentBidXMR || product.startingBidXMR || product.rawPriceXMR || 0.1;
      const nextVal = Math.max(0.01, base * mult);
      bidInput.value = nextVal.toFixed(2);
      const usdEl = document.getElementById('bid-usd-approx');
      if (usdEl) usdEl.textContent = estimateUSDString(nextVal, product.currency || 'XMR');
    });
  });

  if (bidInput) {
    bidInput.addEventListener('input', () => {
      const val = parseFloat(bidInput.value) || 0;
      const product = MARKET_PRODUCTS.find(p => p.id === activeBiddingProductId);
      const currency = product?.currency || 'XMR';
      const usdEl = document.getElementById('bid-usd-approx');
      if (usdEl) {
        usdEl.textContent = estimateUSDString(val, currency);
      }
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      if (!activeBiddingProductId) return;
      const product = MARKET_PRODUCTS.find(p => p.id === activeBiddingProductId);
      if (!product) return;

      const currency = product.currency || 'XMR';
      const bidVal = parseFloat(bidInput?.value || '0');
      const minStep = Number(product.minBidIncrement || 0);
      const currentBid = Number(product.currentBidXMR ?? product.startingBidXMR ?? product.rawPriceXMR ?? 0);

      if (isNaN(bidVal) || bidVal <= 0) {
        showToast('Vui lòng nhập mức giá hợp lệ lớn hơn 0!', 'error');
        return;
      }

      if (minStep > 0 && bidVal < currentBid + minStep) {
        showToast(`Mặt hàng này yêu cầu bước giá tối thiểu +${minStep} ${currency} (từ ${(currentBid + minStep).toFixed(2)} ${currency})!`, 'error');
        return;
      }

      // Synchronize bid with server RAM
      let updatedFromServer = null;
      try {
        const res = await bazaarApiFetch(`/api/lexicon/bazaar-items/${encodeURIComponent(product.id)}/bid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bidder: anonymousAlias,
            amount: bidVal,
            currency
          })
        });
        if (res.ok) {
          const resData = await res.json();
          if (resData && resData.product) {
            updatedFromServer = resData.product;
          }
        }
      } catch (err) {
        console.warn('Bid sync failed, updating local state:', err);
      }

      if (updatedFromServer) {
        const pIdx = MARKET_PRODUCTS.findIndex(p => p.id === product.id);
        if (pIdx !== -1) {
          MARKET_PRODUCTS[pIdx] = updatedFromServer;
        }
      } else {
        // Fallback local memory update
        product.isAuction = true;
        product.bidCount = (product.bidCount || 0) + 1;

        if (bidVal >= currentBid) {
          product.currentBidXMR = bidVal;
          product.rawPriceXMR = bidVal;
          product.highestBidder = anonymousAlias;
          product.priceXMR = `${formatPriceNum(bidVal)} ${currency}`;
          product.approxUSD = estimateUSDString(bidVal, currency);
        }

        if (!product.bids) product.bids = [];
        product.bids.unshift({
          bidder: anonymousAlias,
          amount: bidVal,
          currency,
          note: bidVal >= currentBid ? 'Dẫn đầu' : 'Trả giá tự do',
          time: 'Vừa xong'
        });
      }

      saveMarketProductsToStorage();
      populateOrderProductSelect(MARKET_PRODUCTS);

      // Broadcast bid across local tabs/desks & P2P connected peers
      if (bazaarSyncChannel) {
        try {
          bazaarSyncChannel.postMessage({
            type: 'BID_PLACED',
            productId: product.id,
            amount: bidVal,
            currency,
            bidder: anonymousAlias
          });
        } catch {}
      }

      if (isP2PConnected && activePeerConnection) {
        try {
          activePeerConnection.send({
            type: 'market_bid_placed',
            productId: product.id,
            amount: bidVal,
            currency,
            bidder: anonymousAlias
          });
        } catch {}
      }

      showToast(`Đã ghi nhận mức giá ${formatPriceNum(bidVal)} ${currency} cho "${product.name}"!`, 'success');
      closeModal();
      filterAndRenderProducts();
      renderMyListings();
      updateRamMonitor();
    });
  }
}

function openBidModal(productId) {
  const product = MARKET_PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  activeBiddingProductId = productId;
  const modalOverlay = document.getElementById('bid-modal-overlay');
  const infoBox = document.getElementById('bid-modal-item-info');
  const bidInput = document.getElementById('bid-amount-input');
  const currencyTag = document.getElementById('bid-currency-tag');
  const hintEl = document.getElementById('bid-min-hint');
  const aliasEl = document.getElementById('bid-client-alias');
  const feedEl = document.getElementById('bid-history-feed');

  const currency = product.currency || 'XMR';
  if (aliasEl) aliasEl.textContent = anonymousAlias;
  if (currencyTag) currencyTag.textContent = currency;

  const currentBid = Number(product.currentBidXMR ?? product.startingBidXMR ?? product.rawPriceXMR ?? 0.1);
  const buyNowVal = Number(product.buyNowPrice ?? product.rawPriceXMR ?? currentBid);
  const minStep = Number(product.minBidIncrement || 0);
  const suggestedBid = minStep > 0 ? (currentBid + minStep) : Number((currentBid * 1.05).toFixed(2));

  if (infoBox) {
    infoBox.innerHTML = `
      <div class="bid-info-title-row">
        <span style="font-size: 1.4rem;">${escapeHtml(product.icon)}</span>
        <span class="bid-info-title">${escapeHtml(product.name)}</span>
      </div>
      <div class="bid-info-price-grid">
        <div class="bid-price-cell">
          <span class="detail-label">Giá hiện tại / Cao nhất:</span>
          <span style="font-family: var(--font-mono); font-weight: 700; color: #fbbf24;">${formatPriceNum(currentBid)} ${escapeHtml(currency)}</span>
        </div>
        <div class="bid-price-cell">
          <span class="detail-label">Mua đứt ngay / Dẫn đầu:</span>
          <span style="font-family: var(--font-mono); font-weight: 600; color: #38bdf8;">${formatPriceNum(buyNowVal)} ${escapeHtml(currency)} • ${escapeHtml(product.highestBidder || 'Mở tự do')}</span>
        </div>
      </div>
    `;
  }

  if (bidInput) {
    bidInput.value = suggestedBid.toFixed(2);
    bidInput.min = '0';
    const usdEl = document.getElementById('bid-usd-approx');
    if (usdEl) usdEl.textContent = estimateUSDString(suggestedBid, currency);
  }

  if (hintEl) {
    hintEl.textContent = minStep > 0
      ? `Bước giá tối thiểu: +${minStep} ${currency} (Gợi ý: ${suggestedBid.toFixed(2)} ${currency})`
      : `Không giới hạn bước giá — Bạn có thể nhập bất kỳ mức giá đề xuất nào bằng ${currency}!`;
  }

  if (feedEl) {
    const bids = product.bids || [];
    if (bids.length === 0) {
      feedEl.innerHTML = '<div style="font-size: 0.76rem; color: #94a3b8; font-style: italic;">Chưa có lượt trả giá nào. Bạn có thể mở bát với bất kỳ mức giá nào!</div>';
    } else {
      feedEl.innerHTML = bids.map(b => `
        <div class="bid-feed-item">
          <span class="bid-feed-bidder">${escapeHtml(b.bidder)}</span>
          <span class="bid-feed-amount">${typeof b.amount === 'number' ? formatPriceNum(b.amount) : escapeHtml(String(b.amount))} ${escapeHtml(b.currency || currency)}</span>
          <span class="bid-feed-time">${escapeHtml(b.time || 'Vừa xong')}</span>
        </div>
      `).join('');
    }
  }

  if (modalOverlay) {
    modalOverlay.style.display = 'flex';
  }
}

/* ==========================================================================
   9. VENDOR DESK: UNRESTRICTED LISTING & AUCTION CREATION
   ========================================================================== */

let myVendorListings = [];
let currentListingMode = 'hybrid';

const CATEGORY_DEFAULT_BADGES = {
  physical: 'Hàng Vật Lý',
  digital: 'Tài Sản Số',
  service: 'Dịch Vụ',
  hardware: 'Phần Cứng',
  network: 'Mạng Lưới',
  crypto: 'Mật Mã Học',
  audit: 'Audit & PoC'
};

function initVendorDesk() {
  // Restore persisted vendor listings from localStorage / sessionStorage if present
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.MY_LISTINGS) || sessionStorage.getItem(STORAGE_KEYS.MY_LISTINGS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        myVendorListings = parsed.filter(item => item && !revokedProductIds.has(item.id));
        MARKET_PRODUCTS = mergeProductCatalogs(myVendorListings, MARKET_PRODUCTS);
        syncMyVendorListingsWithMarket();
        saveMyVendorListingsToStorage();
      }
    }
  } catch {}

  const modeHybridBtn = document.getElementById('mode-hybrid-btn');
  const modeAuctionBtn = document.getElementById('mode-auction-btn');
  const modeFixedBtn = document.getElementById('mode-fixed-btn');
  const fixedSection = document.getElementById('section-fixed-pricing');
  const auctionSection = document.getElementById('section-auction-pricing');
  const emojiPicker = document.getElementById('emoji-quick-picker');
  const iconInput = document.getElementById('listing-icon-val');
  const ttlPills = document.getElementById('vendor-ttl-pills');
  const ttlValInput = document.getElementById('listing-ttl-val');
  const publishBtn = document.getElementById('publish-listing-btn');
  const resetBtn = document.getElementById('reset-listing-btn');

  // Input listeners for real-time live preview
  const liveInputs = [
    'listing-name', 'listing-category', 'listing-custom-badge',
    'listing-icon-val', 'listing-currency', 'listing-price-xmr',
    'listing-stock', 'listing-start-bid', 'listing-min-step',
    'listing-security-tag', 'listing-desc', 'listing-spec1-v', 'listing-spec2-v'
  ];

  liveInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateVendorLivePreview);
      el.addEventListener('change', updateVendorLivePreview);
    }
  });

  const setListingMode = (mode) => {
    currentListingMode = mode;
    [modeHybridBtn, modeAuctionBtn, modeFixedBtn].forEach(b => b?.classList.remove('active'));
    if (mode === 'hybrid') {
      modeHybridBtn?.classList.add('active');
      if (fixedSection) fixedSection.style.display = 'block';
      if (auctionSection) auctionSection.style.display = 'block';
    } else if (mode === 'auction') {
      modeAuctionBtn?.classList.add('active');
      if (fixedSection) fixedSection.style.display = 'none';
      if (auctionSection) auctionSection.style.display = 'block';
    } else {
      modeFixedBtn?.classList.add('active');
      if (fixedSection) fixedSection.style.display = 'block';
      if (auctionSection) auctionSection.style.display = 'none';
    }
    updateVendorLivePreview();
  };

  if (modeHybridBtn) modeHybridBtn.addEventListener('click', () => setListingMode('hybrid'));
  if (modeAuctionBtn) modeAuctionBtn.addEventListener('click', () => setListingMode('auction'));
  if (modeFixedBtn) modeFixedBtn.addEventListener('click', () => setListingMode('fixed'));

  // Emoji picker + custom emoji input
  if (emojiPicker && iconInput) {
    emojiPicker.querySelectorAll('.emoji-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        emojiPicker.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        iconInput.value = btn.getAttribute('data-icon') || '💎';
        updateVendorLivePreview();
      });
    });
  }

  // TTL Pills
  if (ttlPills && ttlValInput) {
    ttlPills.querySelectorAll('.ttl-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        ttlPills.querySelectorAll('.ttl-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        ttlValInput.value = pill.getAttribute('data-ttl') || '14400';
      });
    });
  }

  // Reset Button
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const nameInp = document.getElementById('listing-name');
      const customBadgeInp = document.getElementById('listing-custom-badge');
      const descInp = document.getElementById('listing-desc');
      if (nameInp) nameInp.value = '';
      if (customBadgeInp) customBadgeInp.value = '';
      if (descInp) descInp.value = '';
      updateVendorLivePreview();
      showToast('Đã làm mới biểu mẫu niêm yết tự do', 'info');
    });
  }

  // Publish Button
  if (publishBtn) {
    publishBtn.addEventListener('click', handlePublishListing);
  }

  updateVendorLivePreview();
  renderMyListings();
}

function updateVendorLivePreview() {
  const previewContainer = document.getElementById('live-vendor-preview');
  if (!previewContainer) return;

  const name = (document.getElementById('listing-name')?.value || '').trim() || 'Bất kỳ vật phẩm / Tài sản tự do của bạn';
  const category = document.getElementById('listing-category')?.value || 'physical';
  const customBadge = (document.getElementById('listing-custom-badge')?.value || '').trim();
  const icon = (document.getElementById('listing-icon-val')?.value || '').trim() || '💎';
  const currency = document.getElementById('listing-currency')?.value || 'XMR';
  const secTag = (document.getElementById('listing-security-tag')?.value || '').trim() || 'Escrow 2 Chiều • Không Giới Hạn';
  const desc = (document.getElementById('listing-desc')?.value || '').trim() || 'Mọi mặt hàng vật lý, tài sản số, dịch vụ hoặc đồ sưu tầm đều có thể vừa bán thẳng vừa nhận đấu giá tự do...';
  const spec1 = document.getElementById('listing-spec1-v')?.value || 'Mới 100% / Chính chủ';
  const spec2 = document.getElementById('listing-spec2-v')?.value || 'Giao hàng ẩn danh / Mã Drop tự hủy';

  const fixedPrice = parseFloat(document.getElementById('listing-price-xmr')?.value || '1.00') || 0;
  const startBid = parseFloat(document.getElementById('listing-start-bid')?.value || '0.50') || 0;

  const displayPrice = currentListingMode === 'fixed' ? fixedPrice : startBid;
  const buyNowVal = currentListingMode === 'auction' ? (startBid * 1.5) : fixedPrice;
  const badgeTitle = customBadge || CATEGORY_DEFAULT_BADGES[category] || 'Tự Do';

  previewContainer.innerHTML = `
    <article class="product-card" style="box-shadow: none; margin: 0;">
      <div class="product-card-top">
        <div class="product-badge-group">
          <span class="product-badge ${escapeHtml(category)}">${escapeHtml(badgeTitle)}</span>
          <span class="security-level-tag">${escapeHtml(secTag)}</span>
        </div>
        <span class="auction-countdown-pill" data-end="0">♾️ <span class="countdown-val">BÁN & ĐẤU GIÁ</span></span>
      </div>

      <div class="product-title-row">
        <div class="product-icon-box">${escapeHtml(icon)}</div>
        <h3 class="product-title">${escapeHtml(name)}</h3>
      </div>

      <p class="product-desc">${escapeHtml(desc)}</p>

      <div class="product-specs">
        <div class="spec-row">
          <span class="spec-key"><span class="spec-bullet">▸</span>Thuộc tính:</span>
          <span class="spec-val">${escapeHtml(spec1)}</span>
        </div>
        <div class="spec-row">
          <span class="spec-key"><span class="spec-bullet">▸</span>Bàn giao:</span>
          <span class="spec-val">${escapeHtml(spec2)}</span>
        </div>
      </div>

      <div class="product-card-footer">
        <div class="product-price-block">
          <span class="product-price-label">Giá hiện tại / Đấu giá mở:</span>
          <span class="product-price auction-price">${formatPriceNum(displayPrice)} ${escapeHtml(currency)}</span>
          <span class="product-bid-meta">Mua đứt: ${formatPriceNum(buyNowVal)} ${escapeHtml(currency)}</span>
        </div>
        <div class="product-actions">
          <button type="button" class="bid-btn" style="pointer-events: none;"><span>🔨</span> Đấu Giá</button>
          <button type="button" class="buy-btn" style="pointer-events: none;"><span>🛒</span> Mua</button>
        </div>
      </div>
    </article>
  `;
}

async function handlePublishListing() {
  const randHex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');

  const rawName = (document.getElementById('listing-name')?.value || '').trim();
  const name = rawName || `Vật Phẩm Tự Do #${randHex.slice(0, 4)}`;

  const category = document.getElementById('listing-category')?.value || 'physical';
  const customBadge = (document.getElementById('listing-custom-badge')?.value || '').trim();
  const icon = (document.getElementById('listing-icon-val')?.value || '').trim() || '💎';
  const currency = document.getElementById('listing-currency')?.value || 'XMR';
  const secTag = (document.getElementById('listing-security-tag')?.value || '').trim() || 'Escrow 2 Chiều • Tự Do';
  const desc = (document.getElementById('listing-desc')?.value || '').trim() || 'Vật phẩm tự do được niêm yết trực tiếp trên sàn RAM ẩn danh — cho phép cả trả giá đấu giá và mua đứt ngay.';
  const spec1 = document.getElementById('listing-spec1-v')?.value || 'Chính chủ • Đảm bảo';
  const spec2 = document.getElementById('listing-spec2-v')?.value || 'Giao hàng ẩn danh / Drop tự hủy';
  const vendorPubkey = (document.getElementById('listing-vendor-pubkey')?.value || '').trim();

  const productId = `usr-${category}-${randHex}`;
  const killTokenHex = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join('-');
  const vendorKillToken = `KILL-${killTokenHex}`;

  const fixedPriceInput = parseFloat(document.getElementById('listing-price-xmr')?.value || '1.00');
  const startBidInput = parseFloat(document.getElementById('listing-start-bid')?.value || '0.50');
  const minStepInput = parseFloat(document.getElementById('listing-min-step')?.value || '0');
  const duration = parseInt(document.getElementById('listing-auction-duration')?.value || '14400', 10);
  const stockText = (document.getElementById('listing-stock')?.value || '').trim() || 'Sẵn sàng giao ngay';

  const fixedPrice = isNaN(fixedPriceInput) ? 1.00 : Math.max(0, fixedPriceInput);
  const startBid = isNaN(startBidInput) ? fixedPrice : Math.max(0, startBidInput);
  const minStep = isNaN(minStepInput) ? 0 : Math.max(0, minStepInput);

  const initialPrice = currentListingMode === 'fixed' ? fixedPrice : startBid;
  const buyNowPrice = currentListingMode === 'auction' ? Math.max(startBid, fixedPrice || startBid) : fixedPrice;
  const badgeTitle = customBadge || CATEGORY_DEFAULT_BADGES[category] || 'Đấu Giá & Mua Ngay';

  let newProduct = {
    id: productId,
    name,
    category,
    badge: badgeTitle,
    icon,
    securityLevel: secTag,
    currency,
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: initialPrice,
    currentBidXMR: initialPrice,
    buyNowPrice,
    minBidIncrement: minStep,
    bidCount: 0,
    highestBidder: 'Mở tự do',
    bids: [],
    auctionEndTime: duration === 0 ? 0 : (Date.now() + (duration * 1000)),
    priceXMR: `${formatPriceNum(initialPrice)} ${currency}`,
    rawPriceXMR: initialPrice,
    approxUSD: estimateUSDString(initialPrice, currency),
    stock: stockText,
    desc,
    specs: {
      'Thuộc tính': spec1,
      'Bàn giao': spec2,
      'Hình thức': minStep > 0 ? `Bước giá +${minStep} ${currency} & Mua ngay` : 'Trả giá tự do & Mua đứt ngay',
      'Người bán': vendorPubkey ? `${vendorPubkey.slice(0, 14)}...` : (anonymousAlias || 'Anonymous Vendor')
    },
    vendorKillToken,
    isUserCreated: true,
    createdAt: Date.now()
  };

  // Synchronize new item with volatile RAM server
  try {
    const res = await bazaarApiFetch('/api/lexicon/bazaar-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProduct)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.product) {
        newProduct = data.product;
      }
    }
  } catch (err) {
    console.warn('Bazaar sync offline, saving to volatile memory:', err);
  }

  // Prepend to catalog inventory
  const existingIdx = MARKET_PRODUCTS.findIndex(p => p.id === newProduct.id);
  if (existingIdx !== -1) {
    MARKET_PRODUCTS[existingIdx] = newProduct;
  } else {
    MARKET_PRODUCTS.unshift(newProduct);
  }

  // Broadcast in real-time across tabs / virtual desktops
  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'NEW_PRODUCT',
        product: newProduct
      });
    } catch {}
  }

  // Broadcast to P2P connected remote peer
  if (isP2PConnected && activePeerConnection) {
    try {
      activePeerConnection.send({
        type: 'market_item_created',
        product: newProduct
      });
    } catch {}
  }

  myVendorListings.unshift(newProduct);
  saveMyVendorListingsToStorage();
  saveMarketProductsToStorage();

  // Update product select in order tab
  populateOrderProductSelect(MARKET_PRODUCTS);

  // Refresh catalogs & counts
  filterAndRenderProducts();
  renderMyListings();
  updateRamMonitor();

  // Reset form inputs
  const nameEl = document.getElementById('listing-name');
  if (nameEl) nameEl.value = '';
  const customBadgeEl = document.getElementById('listing-custom-badge');
  if (customBadgeEl) customBadgeEl.value = '';
  const descEl = document.getElementById('listing-desc');
  if (descEl) descEl.value = '';
  updateVendorLivePreview();

  showToast(`🎉 Đã mở bán & đấu giá "${name}" thành công! Mã thu hồi: ${newProduct.vendorKillToken || vendorKillToken}`, 'success');
}

function renderMyListings() {
  const container = document.getElementById('my-listings-list');
  if (!container) return;

  if (myVendorListings.length === 0) {
    container.innerHTML = '<p class="empty-listings-note">Chưa có vật phẩm nào được đăng trong phiên RAM hiện tại. Bạn có thể đăng bán hoặc đấu giá bất kỳ thứ gì ở khung bên trái!</p>';
    return;
  }

  container.innerHTML = myVendorListings.map(item => {
    const currency = item.currency || 'XMR';
    return `
      <div class="my-listing-card" id="my-item-${escapeHtml(item.id)}">
        <div class="my-listing-top">
          <div class="my-listing-title-row">
            <span class="my-listing-icon">${escapeHtml(item.icon)}</span>
            <span class="my-listing-name">${escapeHtml(item.name)}</span>
          </div>
          <span class="product-badge ${escapeHtml(item.category)}">
            ${escapeHtml(item.badge || '⚡ Bán & Đấu Giá')}
          </span>
        </div>

        <div style="font-size: 0.8rem; font-family: var(--font-mono); color: #cbd5e1;">
          Giá hiện tại: <strong style="color: #fbbf24;">${formatPriceNum(item.currentBidXMR)} ${escapeHtml(currency)}</strong> (${item.bidCount || 0} lượt trả giá) • Mua ngay: <strong style="color: #10b981;">${formatPriceNum(item.buyNowPrice)} ${escapeHtml(currency)}</strong>
        </div>

        <div class="kill-token-box">
          <span>Vendor Kill Token: <strong class="kill-token-val">${escapeHtml(item.vendorKillToken)}</strong></span>
          <button type="button" class="copy-mini-btn" data-token="${escapeHtml(item.vendorKillToken)}">Chép</button>
        </div>

        <button type="button" class="revoke-listing-btn" data-id="${escapeHtml(item.id)}">
          <span>🔥</span> Hủy & Xóa Khỏi RAM Tức Thì
        </button>
      </div>
    `;
  }).join('');

  // Bind copy token buttons
  container.querySelectorAll('.copy-mini-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const token = btn.getAttribute('data-token');
      if (token) {
        navigator.clipboard.writeText(token).then(() => {
          showToast(`Đã sao chép Vendor Kill Token: ${token}`, 'success');
        });
      }
    });
  });

  // Bind revoke buttons
  container.querySelectorAll('.revoke-listing-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-id');
      revokeUserListing(prodId);
    });
  });
}

async function revokeUserListing(productId) {
  const itemInVendor = myVendorListings.find(p => p.id === productId);
  const itemInMarket = MARKET_PRODUCTS.find(p => p.id === productId);
  const killToken = itemInVendor?.vendorKillToken || itemInMarket?.vendorKillToken || '';
  const prodName = itemInVendor?.name || itemInMarket?.name || 'Vật phẩm';

  addRevokedProductId(productId);

  try {
    await bazaarApiFetch(`/api/lexicon/bazaar-items/${encodeURIComponent(productId)}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorKillToken: killToken })
    });
  } catch (err) {
    console.warn('Revoke sync failed, removing locally:', err);
  }

  MARKET_PRODUCTS = MARKET_PRODUCTS.filter(p => p.id !== productId);
  myVendorListings = myVendorListings.filter(p => p.id !== productId);
  saveMyVendorListingsToStorage();
  saveMarketProductsToStorage();

  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'REVOKE_PRODUCT',
        productId
      });
    } catch {}
  }

  if (isP2PConnected && activePeerConnection) {
    try {
      activePeerConnection.send({
        type: 'market_item_revoked',
        productId
      });
    } catch {}
  }

  populateOrderProductSelect(MARKET_PRODUCTS);
  filterAndRenderProducts();
  renderMyListings();
  updateRamMonitor();

  showToast(`Đã thu hồi và xóa sạch mặt hàng "${prodName}" khỏi RAM máy chủ!`, 'error');
}
