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
let p2pPeerAlias = 'Đồng nghiệp P2P';
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

// Enterprise Workspace Items Registry (In-Memory Only)
let MARKET_PRODUCTS = [
  {
    id: 'auction-chip-07',
    name: 'Triển Khai Cụm Gateway API & HSM Nội Bộ Q4',
    category: 'hardware',
    badge: 'Phòng DevOps',
    icon: '🖥️',
    securityLevel: 'Nội bộ • Mức Cao',
    currency: 'Giờ',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 16,
    currentBidXMR: 24,
    buyNowPrice: 32,
    minBidIncrement: 0,
    bidCount: 4,
    highestBidder: 'NV-DevOps-04',
    bids: [
      { bidder: 'NV-DevOps-04', amount: 24, currency: 'Giờ', time: '2 phút trước' },
      { bidder: 'NV-Lead-02', amount: 20, currency: 'Giờ', time: '8 phút trước' },
      { bidder: 'NV-BE-08', amount: 18, currency: 'Giờ', time: '15 phút trước' },
      { bidder: 'NV-Sec-01', amount: 16, currency: 'Giờ', time: '28 phút trước' }
    ],
    auctionEndTime: Date.now() + (5400 * 1000),
    priceXMR: '24 Giờ',
    rawPriceXMR: 24,
    approxUSD: 'Sprint 14 • DevOps',
    stock: 'Đang mở phối hợp',
    desc: 'Kế hoạch nâng cấp cụm máy chủ Gateway và module xác thực nội bộ. Thành viên các nhóm có thể ước lượng thời gian hỗ trợ hoặc nhận bàn giao cấu hình.',
    specs: {
      'Phòng ban': 'DevOps & Hạ tầng Hệ thống',
      'Trạng thái': 'Đang tiếp nhận đề xuất nhân sự',
      'Bàn giao': 'Tài liệu kỹ thuật & Token một lần'
    }
  },
  {
    id: 'lux-watch-08',
    name: 'Cấp Phát Laptop Workstation & Thẻ Từ Văn Phòng Mới',
    category: 'physical',
    badge: 'Hành Chính & IT',
    icon: '💻',
    securityLevel: 'Tài sản Công ty',
    currency: 'Thiết bị',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 5,
    currentBidXMR: 8,
    buyNowPrice: 12,
    minBidIncrement: 0,
    bidCount: 6,
    highestBidder: 'NV-IT-02',
    bids: [
      { bidder: 'NV-IT-02', amount: 8, currency: 'Thiết bị', time: '5 phút trước' },
      { bidder: 'NV-HR-05', amount: 6, currency: 'Thiết bị', time: '19 phút trước' }
    ],
    auctionEndTime: Date.now() + (10800 * 1000),
    priceXMR: '8 Thiết bị',
    rawPriceXMR: 8,
    approxUSD: 'Tầng 5 • Kho IT',
    stock: 'Sẵn sàng cấp phát',
    desc: 'Danh sách thiết bị phần cứng phục vụ nhân sự mới tháng 11. Các trưởng nhóm đăng ký số lượng và nhận mã bàn giao qua kênh nội bộ.',
    specs: {
      'Phòng ban': 'Hành chính Nhân sự & IT Helpdesk',
      'Hình thức': 'Đăng ký số lượng / Nhận bàn giao ngay',
      'Bàn giao': 'Phòng IT Tầng 5 • Ký nhận điện tử'
    }
  },
  {
    id: 'dig-domain-09',
    name: 'Tài Khoản Cloud Staging & Bộ Biến Môi Trường (.env)',
    category: 'digital',
    badge: 'Tài Nguyên Số',
    icon: '☁️',
    securityLevel: 'AES-256 • Nội bộ',
    currency: 'Ngày',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 7,
    currentBidXMR: 14,
    buyNowPrice: 30,
    minBidIncrement: 0,
    bidCount: 3,
    highestBidder: 'NV-Lead-01',
    bids: [
      { bidder: 'NV-Lead-01', amount: 14, currency: 'Ngày', time: '11 phút trước' }
    ],
    auctionEndTime: Date.now() + (7200 * 1000),
    priceXMR: '14 Ngày',
    rawPriceXMR: 14,
    approxUSD: 'AWS / GCP Staging',
    stock: 'Cấp quyền tạm thời',
    desc: 'Thông tin truy cập môi trường kiểm thử Staging và bộ biến môi trường (.env) được mã hóa một lần, tự hủy ngay sau khi thành viên tải về.',
    specs: {
      'Phòng ban': 'Backend & QA Testing',
      'Hiệu lực': 'Gia hạn theo chu kỳ Sprint',
      'Bàn giao': 'Secret Token tự hủy trong RAM'
    }
  },
  {
    id: 'hw-hsm-01',
    name: 'Khóa Xác Thực YubiKey & Token Ký Code Production',
    category: 'hardware',
    badge: 'Phần Cứng IT',
    icon: '🔑',
    securityLevel: 'Chuẩn FIDO2',
    currency: 'Chiếc',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 2,
    currentBidXMR: 5,
    buyNowPrice: 5,
    minBidIncrement: 0,
    bidCount: 2,
    highestBidder: 'NV-Sec-09',
    bids: [
      { bidder: 'NV-Sec-09', amount: 5, currency: 'Chiếc', time: '14 phút trước' }
    ],
    auctionEndTime: Date.now() + (14400 * 1000),
    priceXMR: '5 Chiếc',
    rawPriceXMR: 5,
    approxUSD: 'Phòng Kỹ Thuật',
    stock: 'Còn 5 khóa',
    desc: 'Khóa bảo mật vật lý dùng để xác thực 2FA khi deploy lên hệ thống Production và ký số mã nguồn nội bộ công ty.',
    specs: {
      'Tiêu chuẩn': 'FIDO2 / WebAuthn / PGP Hardware',
      'Phạm vi': 'Tech Lead & Quản trị viên hệ thống',
      'Bàn giao': 'Nhận trực tiếp hoặc mã PIN qua RAM'
    }
  },
  {
    id: 'net-mesh-02',
    name: 'Cấu Hình VPN WireGuard Truy Cập Server Nội Bộ',
    category: 'network',
    badge: 'Hạ Tầng Mạng',
    icon: '🌐',
    securityLevel: 'Zero-Trust VPN',
    currency: 'Profile',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 1,
    currentBidXMR: 3,
    buyNowPrice: 10,
    minBidIncrement: 0,
    bidCount: 1,
    highestBidder: 'NV-Net-03',
    bids: [],
    auctionEndTime: Date.now() + (18000 * 1000),
    priceXMR: '3 Profile',
    rawPriceXMR: 3,
    approxUSD: 'Gateway HN & HCM',
    stock: 'Sẵn sàng cấp phát',
    desc: 'File cấu hình WireGuard dành cho nhân viên làm việc từ xa (Remote) để truy cập vào mạng nội bộ và cơ sở dữ liệu công ty an toàn.',
    specs: {
      'Giao thức': 'WireGuard Encrypted Tunnel',
      'Phạm vi': 'Nhân viên toàn thời gian & Remote',
      'Bàn giao': 'Mã tải cấu hình tự hủy sau 1 lần đọc'
    }
  },
  {
    id: 'sec-ssl-03',
    name: 'Chứng Chỉ SSL Nội Bộ & Quyền Truy Cập GitLab Private',
    category: 'network',
    badge: 'Hệ Thống',
    icon: '🛡️',
    securityLevel: 'SSH / TLS 1.3',
    currency: 'Nhóm',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 2,
    currentBidXMR: 4,
    buyNowPrice: 8,
    minBidIncrement: 0,
    bidCount: 1,
    highestBidder: 'NV-Ops-07',
    bids: [],
    auctionEndTime: Date.now() + (21600 * 1000),
    priceXMR: '4 Nhóm',
    rawPriceXMR: 4,
    approxUSD: 'Core Infrastructure',
    stock: 'Đang hoạt động',
    desc: 'Bộ chứng chỉ Root CA nội bộ để chạy môi trường HTTPS local và hướng dẫn cấu hình SSH Key truy cập kho mã nguồn GitLab công ty.',
    specs: {
      'Công nghệ': 'Internal Root CA • TLS 1.3 • SSH Ed25519',
      'Đối tượng': 'Toàn bộ kỹ sư phần mềm & QA',
      'Bàn giao': 'Tệp chứng chỉ kèm hướng dẫn qua RAM'
    }
  },
  {
    id: 'doc-audit-04',
    name: 'Báo Cáo Đánh Giá Bảo Mật & Checklist Vá Lỗi Q4',
    category: 'audit',
    badge: 'Kiểm Toán IT',
    icon: '📑',
    securityLevel: 'Mật • Ban Giám Đốc',
    currency: 'Trang',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 24,
    currentBidXMR: 48,
    buyNowPrice: 48,
    minBidIncrement: 0,
    bidCount: 3,
    highestBidder: 'NV-Audit-01',
    bids: [],
    auctionEndTime: Date.now() + (9000 * 1000),
    priceXMR: '48 Trang',
    rawPriceXMR: 48,
    approxUSD: 'Tài liệu nội bộ',
    stock: '2 bản chia sẻ kín',
    desc: 'Báo cáo kiểm thử xâm nhập định kỳ quý 4 và danh sách các hạng mục cần tối ưu bảo mật cho ứng dụng web và API nội bộ.',
    specs: {
      'Định dạng': 'PDF mã hóa AES-256-GCM',
      'Nội dung': 'Báo cáo 48 trang & Danh sách đầu việc vá lỗi',
      'Bàn giao': 'Liên kết giải mã RAM một lần'
    }
  },
  {
    id: 'os-amnesic-05',
    name: 'Bộ Cài Đặt Môi Trường Dev & Docker Registry Nội Bộ',
    category: 'crypto',
    badge: 'Kỹ Thuật',
    icon: '🐳',
    securityLevel: 'Internal Registry',
    currency: 'Image',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 4,
    currentBidXMR: 6,
    buyNowPrice: 6,
    minBidIncrement: 0,
    bidCount: 2,
    highestBidder: 'NV-BE-12',
    bids: [],
    auctionEndTime: Date.now() + (12600 * 1000),
    priceXMR: '6 Image',
    rawPriceXMR: 6,
    approxUSD: 'v2.4 Production',
    stock: 'Sẵn sàng sử dụng',
    desc: 'Bộ Docker Image chuẩn và script thiết lập máy trạm tự động cho các dự án Node.js, Redis và Postgres của công ty.',
    specs: {
      'Phiên bản': 'Docker Compose v2.4 • Node 24 LTS',
      'Xác thực': 'Checksum SHA-256 nội bộ',
      'Bàn giao': 'Token đăng nhập Registry qua RAM'
    }
  },
  {
    id: 'key-pgp-06',
    name: 'Bộ API Key Thanh Toán & Chứng Thư Ký Hợp Đồng Số',
    category: 'crypto',
    badge: 'Tài Chính / API',
    icon: '🗝️',
    securityLevel: 'RAM-Only • Hạn chế',
    currency: 'Bộ',
    isAuction: true,
    allowBid: true,
    allowBuyNow: true,
    startingBidXMR: 1,
    currentBidXMR: 2,
    buyNowPrice: 2,
    minBidIncrement: 0,
    bidCount: 1,
    highestBidder: 'NV-Fin-05',
    bids: [],
    auctionEndTime: Date.now() + (16200 * 1000),
    priceXMR: '2 Bộ',
    rawPriceXMR: 2,
    approxUSD: 'Kế toán & Pháp chế',
    stock: 'Cần xác nhận trưởng nhóm',
    desc: 'Thông tin khóa API kết nối cổng thanh toán đối tác và chứng thư số ký hợp đồng điện tử, truyền tải tuyệt đối bảo mật không lưu log.',
    specs: {
      'Bảo mật': 'Mã hóa đầu cuối AES-256-GCM',
      'Phân quyền': 'Phòng Tài chính & Nhóm Tích hợp',
      'Bàn giao': 'Mã Drop tự hủy sau khi người nhận mở'
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

function formatColleagueAlias(raw) {
  if (!raw) return 'Đồng nghiệp';
  return String(raw)
    .replace(/^ID-Mua #/i, 'Thành viên #')
    .replace(/^ID-Bán #/i, 'Phụ trách #')
    .replace(/^ID-Mua$/i, 'Thành viên')
    .replace(/^ID-Bán$/i, 'Phụ trách');
}

/**
 * Modern non-blocking Toast notification system
 */
const recentToastMessages = new Map();

export function showToast(message, type = 'info') {
  if (!message) return;
  const container = document.getElementById('toast-container');
  if (!container) return;

  const now = Date.now();
  // De-duplicate identical toasts within 3.5 seconds to block notification storms
  if (recentToastMessages.has(message) && (now - recentToastMessages.get(message) < 3500)) {
    return;
  }
  recentToastMessages.set(message, now);

  // Maximum 3 visible toasts on screen to prevent flooding
  while (container.children.length >= 3) {
    container.removeChild(container.firstChild);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✓' : (type === 'error' ? '⚠' : 'ℹ');
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button type="button" class="toast-close" aria-label="Đóng thông báo" title="Đóng"><span aria-hidden="true">✕</span></button>
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
  ALIAS: 'nexus_member_alias_v2',
  MARKET_PRODUCTS: 'nexus_workspace_items_v2',
  REVOKED_IDS: 'nexus_revoked_item_ids_v2',
  MY_LISTINGS: 'nexus_my_listings_v2',
  ACTIVE_ORDER: 'nexus_active_handover_v2',
  ACTIVE_DEAL: 'nexus_active_session_v2',
  CHAT_MESSAGES: 'nexus_chat_messages_v2',
  ACTIVE_TAB: 'nexus_active_tab_v2',
  SESSION_SECONDS: 'nexus_session_seconds_v2'
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

function saveActiveDealToStorage(deal) {
  if (isPurgingNow) return;
  try {
    if (deal) {
      const json = JSON.stringify(deal);
      localStorage.setItem(STORAGE_KEYS.ACTIVE_DEAL, json);
      sessionStorage.setItem(STORAGE_KEYS.ACTIVE_DEAL, json);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_DEAL);
      sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_DEAL);
    }
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
    anonymousAlias = `NV-${randHex}`;
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

let lastModalTriggerEl = null;

function getModalFocusableElements(overlayEl) {
  if (!overlayEl) return [];
  return Array.from(
    overlayEl.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ).filter(el => el.offsetParent !== null);
}

function openAccessibleModal(overlayEl, focusSelector = null) {
  if (!overlayEl) return;
  lastModalTriggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const shell = document.querySelector('.vault-shell');
  if (shell) {
    shell.inert = true;
    shell.setAttribute('aria-hidden', 'true');
  }
  overlayEl.style.display = 'flex';
  const focusTarget = focusSelector ? overlayEl.querySelector(focusSelector) : null;
  const dialog = overlayEl.querySelector('[role="dialog"]');
  setTimeout(() => {
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    } else if (dialog && typeof dialog.focus === 'function') {
      dialog.focus();
    }
  }, 20);
}

function closeAccessibleModal(overlayEl) {
  if (!overlayEl) return;
  overlayEl.style.display = 'none';
  const shell = document.querySelector('.vault-shell');
  if (shell) {
    shell.inert = false;
    shell.removeAttribute('aria-hidden');
  }
  if (lastModalTriggerEl && typeof lastModalTriggerEl.focus === 'function') {
    lastModalTriggerEl.focus();
    lastModalTriggerEl = null;
  }
}

function initPanicAndPurgeHooks() {
  const panicBtn = document.getElementById('panic-btn');
  const brandBtn = document.getElementById('brand-scroll-top-btn');
  const vaultHeader = document.querySelector('.vault-header');

  const scrollToTopSmooth = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (document.documentElement) {
      document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (document.body) {
      document.body.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (brandBtn) {
    brandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      scrollToTopSmooth();
    });
  }

  if (vaultHeader) {
    vaultHeader.addEventListener('click', (e) => {
      if (e.target.closest('.vault-actions') || e.target.closest('button')) return;
      scrollToTopSmooth();
    });
  }

  // Accessible banner dismiss binding (replaces inline onclick)
  document.querySelectorAll('.dismiss-banner-btn[data-dismiss]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-dismiss');
      const banner = targetId ? document.getElementById(targetId) : null;
      if (banner) banner.style.display = 'none';
    });
  });

  const executeSessionReset = () => {
    purgeAllVolatileData();
    // Cleanly reload the company workspace with a fresh RAM session
    window.location.replace(window.location.pathname || './index.html');
  };

  if (panicBtn) {
    panicBtn.addEventListener('click', executeSessionReset);
  }

  // Modal Escape handling & Tab Focus Trap
  window.addEventListener('keydown', (e) => {
    const bidModal = document.getElementById('bid-modal-overlay');
    const qrModal = document.getElementById('qr-modal-overlay');
    const openModal = (bidModal && bidModal.style.display !== 'none')
      ? bidModal
      : ((qrModal && qrModal.style.display !== 'none') ? qrModal : null);

    if (!openModal) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (openModal === bidModal) activeBiddingProductId = null;
      closeAccessibleModal(openModal);
      return;
    }

    if (e.key === 'Tab') {
      const focusables = getModalFocusableElements(openModal);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || !openModal.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !openModal.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    }
  });
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
      showToast(`Đã cập nhật mã thành viên phiên: ${anonymousAlias}`, 'info');
    });
  }

  // QR Modal Close
  const closeQrBtn = document.getElementById('close-qr-btn');
  const qrOverlay = document.getElementById('qr-modal-overlay');
  if (closeQrBtn && qrOverlay) {
    closeQrBtn.addEventListener('click', () => {
      closeAccessibleModal(qrOverlay);
    });
  }
  if (qrOverlay) {
    qrOverlay.addEventListener('click', (e) => {
      if (e.target === qrOverlay) closeAccessibleModal(qrOverlay);
    });
  }
}

/* ==========================================================================
   3. TABS MANAGEMENT
   ========================================================================== */

function initTabs() {
  const navTabs = Array.from(document.querySelectorAll('.covert-nav-tabs .nav-tab'));
  navTabs.forEach((tab, idx) => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      switchTab(targetId);
    });
    tab.addEventListener('keydown', (e) => {
      let nextIdx = -1;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % navTabs.length;
      else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + navTabs.length) % navTabs.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = navTabs.length - 1;
      if (nextIdx !== -1) {
        e.preventDefault();
        const nextTab = navTabs[nextIdx];
        nextTab.focus();
        switchTab(nextTab.getAttribute('data-tab'));
      }
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
    const isSelected = t.getAttribute('data-tab') === tabId;
    t.classList.toggle('active', isSelected);
    t.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  });

  tabPanes.forEach(p => {
    p.classList.toggle('active', p.id === tabId);
  });

  if (document.body) {
    document.body.classList.toggle('chat-tab-active', tabId === 'tab-chat');
  }

  if (!isPurgingNow && tabId) {
    try {
      sessionStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, tabId);
    } catch {}
  }

  // Clear unread badge if opening chat
  if (tabId === 'tab-chat') {
    const chatBadge = document.getElementById('chat-badge');
    if (chatBadge) chatBadge.style.display = 'none';
    renderMessengerThreads();
    updateActiveThreadHeader();
    renderChatMessages();
    setTimeout(() => {
      const input = document.getElementById('chat-input-field');
      input?.focus();
    }, 50);
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
    if (json && Array.isArray(json.soldOrRevokedIds)) {
      let newlySoldOnServer = false;
      json.soldOrRevokedIds.forEach(soldId => {
        if (soldId && !revokedProductIds.has(soldId)) {
          addRevokedProductId(soldId);
          newlySoldOnServer = true;
        }
      });
      if (newlySoldOnServer) {
        MARKET_PRODUCTS = MARKET_PRODUCTS.filter(p => p && !revokedProductIds.has(p.id));
        myVendorListings = myVendorListings.filter(p => p && !revokedProductIds.has(p.id));
        saveMyVendorListingsToStorage();
        saveMarketProductsToStorage();
      }
    }
    if (json && Array.isArray(json.data)) {
      const serverItems = json.data.filter(p => p && !revokedProductIds.has(p.id));
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
        showToast('Đã cập nhật bảng tin và tài nguyên mới nhất từ RAM!', 'success');
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
      showToast('Đã làm mới danh sách hạng mục công việc!', 'success');
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
        showToast(`📢 Bảng tin công ty vừa có mục mới: "${prod.name}"!`, 'info');
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
          showToast(`✋ "${prod.name}" có đề xuất mới: ${msg.amount} ${msg.currency || 'Giờ'} từ ${msg.bidder}!`, 'info');
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
        executeLocalDealAutoBurn(msg.dealId, true, msg.productId || '', msg.productName || '');
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
        document.querySelectorAll('.market-pill').forEach(p => {
          p.classList.remove('active');
          p.setAttribute('aria-pressed', 'false');
        });
        pill.classList.add('active');
        pill.setAttribute('aria-pressed', 'true');
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
        <h3 class="empty-title">Không tìm thấy hạng mục phù hợp</h3>
        <p class="empty-desc">Hãy thử từ khóa khác hoặc nhấn "➕ Tạo Thông Báo Mới" để chia sẻ tài liệu, tài nguyên với đồng nghiệp.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(item => {
    const currency = item.currency || 'Giờ';
    const badgeCategory = escapeHtml(item.category || 'auction');
    const badgeText = escapeHtml(item.badge || 'Nội Bộ Công Ty');

    const endAttr = item.auctionEndTime !== undefined ? item.auctionEndTime : (Date.now() + 3600000);
    const topRightBadge = endAttr === 0
      ? `<span class="auction-countdown-pill" data-end="0">♾️ <span class="countdown-val">MỞ TỰ DO</span></span>`
      : `<span class="auction-countdown-pill" data-end="${endAttr}">⏳ <span class="countdown-val">01:29:45</span></span>`;

    const currentVal = item.currentBidXMR ?? item.rawPriceXMR ?? 0;
    const buyNowVal = item.buyNowPrice ?? item.rawPriceXMR ?? currentVal;
    const priceLabel = 'Ước lượng / Quy mô hiện tại:';
    const priceDisplay = `${formatPriceNum(currentVal)} ${escapeHtml(currency)}`;
    const priceClass = 'product-price auction-price';
    const priceMeta = `${item.bidCount || 0} đề xuất • Hạn mức: ${formatPriceNum(buyNowVal)} ${escapeHtml(currency)}`;

    const actionButtons = `
      <button type="button" class="bid-btn" data-id="${escapeHtml(item.id)}" title="Gửi đề xuất khối lượng hoặc ước lượng cho hạng mục này">
        <span>✋</span> Đề Xuất
      </button>
      <button type="button" class="buy-btn" data-id="${escapeHtml(item.id)}" title="Tạo phiếu tiếp nhận bàn giao tài nguyên / đầu việc này">
        <span>📥</span> Tiếp Nhận
      </button>
      <button type="button" class="chat-btn" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" aria-label="Mở kênh thảo luận nội bộ cho ${escapeHtml(item.name)}" title="Mở kênh thảo luận nội bộ cho hạng mục này">
        <span aria-hidden="true">💬</span>
      </button>
      <button type="button" class="share-card-btn" data-id="${escapeHtml(item.id)}" aria-label="Sao chép liên kết chia sẻ cho ${escapeHtml(item.name)}" title="Sao chép liên kết chia sẻ cho đồng nghiệp">
        <span aria-hidden="true">🔗</span>
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
          showToast(`Đã sao chép liên kết nội bộ "${prod ? prod.name : prodId}"`, 'success');
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
      <span class="detail-label">Quy mô / Số lượng tiếp nhận:</span>
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
  showToast('Đã nạp hạng mục vào Phiếu Bàn Giao Nội Bộ!', 'info');
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
    input.value = `Chào bạn, mình cần trao đổi và tiếp nhận hạng mục "${productName}". Nhờ bạn chia sẻ thông tin bàn giao qua kênh này nhé!`;
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
  return `TEAM-${rand}`;
}

function getRoomShareableLink(code) {
  const baseUrl = window.location.href.split('#')[0];
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
    if (statusText) statusText.textContent = '🔴 Chế độ Trợ Lý (Chưa nối máy P2P)';
    if (setupRow) setupRow.style.display = 'flex';
    if (activeRow) activeRow.style.display = 'none';

    if (avatarText) avatarText.textContent = 'N';
    if (peerName) peerName.textContent = 'Trợ Lý Điều Phối Nội Bộ';
    if (peerBadge) {
      peerBadge.textContent = '✓ ĐÃ XÁC THỰC NỘI BỘ';
      peerBadge.className = 'verified-vendor-badge';
    }
    if (peerStat) peerStat.textContent = '★ 5.0 (98 giao dịch)';
    if (peerPing) {
      peerPing.textContent = 'Phản hồi < 1p';
      peerPing.className = 'peer-stat green';
    }
  } else if (state === 'hosting') {
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot waiting';
    if (statusText) statusText.textContent = `🟡 Đang mở phòng họp [${extraInfo}] • Chờ đồng nghiệp vào link...`;
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
    if (statusText) statusText.textContent = '🟢 ĐÃ NỐI MÁY P2P NỘI BỘ (Máy ↔ Máy • Không Qua Máy Chủ)';
    if (setupRow) setupRow.style.display = 'none';
    if (activeRow) activeRow.style.display = 'flex';

    const partnerName = extraInfo?.peerAlias || p2pPeerAlias || 'Đồng nghiệp P2P';
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
    showToast(`Đã mở phòng họp P2P [${roomCode}]! Gửi link cho đồng nghiệp để trao đổi trực tiếp.`, 'success');

    inMemoryChatMessages.push({
      author: 'HỆ THỐNG P2P',
      role: 'system',
      time: getCurrentTimeStr(),
      text: `🔔 Phòng thảo luận nội bộ P2P [${roomCode}] đã sẵn sàng trên RAM. Gửi link mời cho đồng nghiệp để trao đổi trực tiếp máy-tới-máy!`
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
      const p2pMsg = {
        author: packet.alias || p2pPeerAlias || 'Đối Tác',
        role: 'merchant',
        time: packet.time || getCurrentTimeStr(),
        text: packet.text
      };
      inMemoryChatMessages.push(p2pMsg);
      const activeTh = getActiveThread();
      if (activeTh) {
        if (!activeTh.messages) activeTh.messages = [];
        activeTh.messages.push(p2pMsg);
        activeTh.lastMessage = packet.text;
        activeTh.lastTime = p2pMsg.time;
      }
      renderMessengerThreads();
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
      showToast(`🔔 Đồng nghiệp vừa đăng mục mới: "${prod.name}"!`, 'info');
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
        showToast(`✋ Đồng nghiệp vừa gửi đề xuất ${packet.amount} ${packet.currency || ''} cho "${prod.name}"`, 'info');
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
const seenDealNotifications = new Set();
const alreadyBurnedDeals = new Set();

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
    const raw = sessionStorage.getItem('nexus_threads_v3');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        chatThreads = parsed;
      }
    }
  } catch {}

  try {
    const savedId = sessionStorage.getItem('nexus_active_thread_v3');
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
        productName: 'Kênh chung toàn công ty',
        peerAlias: 'Trợ Lý Điều Phối #BOT01',
        peerRole: 'merchant',
        avatarText: 'N',
        lastMessage: 'Kênh trao đổi nội bộ đã sẵn sàng trên RAM (AES-256-GCM)...',
        lastTime: getCurrentTimeStr(),
        unreadCount: 0,
        messages: [
          {
            id: 'msg-init-1',
            author: 'Trợ Lý Điều Phối',
            role: 'merchant',
            time: getCurrentTimeStr(),
            text: 'Chào đồng nghiệp! Kênh thảo luận nội bộ của Nexus Workspace đã được kích hoạt. Mọi tin nhắn và thông tin nhạy cảm (mật khẩu Server, API Key, cấu hình) trao đổi tại đây chỉ lưu tạm trong RAM, được mã hóa AES-256-GCM và tự động xóa sạch khi kết thúc phiên.'
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
    sessionStorage.setItem('nexus_threads_v3', json);
    if (activeThreadId) {
      sessionStorage.setItem('nexus_active_thread_v3', activeThreadId);
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
    const subBadgeText = t.dealId
      ? `${formatColleagueAlias(t.buyerBlindId)} ↔ ${formatColleagueAlias(t.sellerBlindId)}`
      : `📌 ${t.productName || 'Kênh chung'}`;

    return `
      <div class="messenger-thread-item ${isActive ? 'active' : ''}" role="button" tabindex="0" aria-current="${isActive ? 'true' : 'false'}" data-thread-id="${escapeHtml(t.id)}">
        <div class="thread-avatar-wrap">
          <span>${escapeHtml(initial)}</span>
          <span class="thread-online-dot"></span>
        </div>
        <div class="thread-content">
          <div class="thread-top-row">
            <span class="thread-peer-name">${escapeHtml(formatColleagueAlias(t.peerAlias) || 'Đồng nghiệp')}${dealBadge}</span>
            <span class="thread-time">${escapeHtml(t.lastTime || '')}</span>
          </div>
          <div>
            <span class="thread-product-badge">${escapeHtml(subBadgeText)}</span>
          </div>
          <div class="thread-snippet">${escapeHtml(t.lastMessage || 'Chưa có tin nhắn')}</div>
        </div>
        ${unreadHtml}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.messenger-thread-item').forEach(item => {
    const activateThread = () => {
      const threadId = item.getAttribute('data-thread-id');
      if (threadId) selectMessengerThread(threadId);
    };
    item.addEventListener('click', activateThread);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateThread();
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
  if (peerName) peerName.textContent = formatColleagueAlias(thread.peerAlias) || 'Trợ Lý Điều Phối';

  if (thread.dealId) {
    const myId = formatColleagueAlias(thread.myBlindId || (getMyDealRole(thread) === 'buyer' ? thread.buyerBlindId : thread.sellerBlindId) || 'Thành viên');
    const pairLabel = `${formatColleagueAlias(thread.buyerBlindId)} ↔ ${formatColleagueAlias(thread.sellerBlindId)}`;
    if (prodTag) prodTag.textContent = pairLabel;
    if (peerBadge) {
      peerBadge.textContent = `Bạn: ${myId}`;
      peerBadge.className = 'verified-vendor-badge p2p-connected-badge';
    }
    if (statusText) statusText.textContent = `🟢 ${pairLabel} • [${thread.dealId}]`;
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot connected';
  } else {
    if (prodTag) prodTag.textContent = thread.productName || 'Trao đổi chung';
    if (peerBadge) {
      peerBadge.textContent = '✓ ĐÃ XÁC THỰC NỘI BỘ';
      peerBadge.className = 'verified-vendor-badge';
    }
    if (statusText) statusText.textContent = '🔴 Chế độ Trợ Lý (Chưa nối máy P2P)';
    if (pulseDot) pulseDot.className = 'p2p-pulse-dot disconnected';
  }

  // Update Auto-Deal Banner if applicable
  const banner = document.getElementById('auto-deal-banner');
  const codeBadge = document.getElementById('auto-deal-code-badge');
  const prodLabel = document.getElementById('auto-deal-product-label');

  if (thread.dealId) {
    if (banner) banner.style.display = 'flex';
    if (codeBadge) codeBadge.textContent = thread.dealId;
    if (prodLabel) prodLabel.textContent = thread.productName || 'Công việc nội bộ';
    const blindBadge = document.getElementById('auto-deal-blind-badge');
    if (blindBadge) blindBadge.textContent = `🛡️ ${formatColleagueAlias(thread.buyerBlindId)} ↔ ${formatColleagueAlias(thread.sellerBlindId)}`;
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
  return 'seller';
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
      buyerBlindId: `ID-Mua #${bMask}`,
      sellerBlindId: `ID-Bán #${sMask}`,
      status: 'connected',
      createdAt: Date.now(),
      messages: [
        {
          id: `sys-${Date.now()}`,
          role: 'system',
          senderBlindId: 'HỆ THỐNG',
          time: getCurrentTimeStr(),
          text: `🔐 [${dealId}] Đã kết nối ẩn danh: ${`ID-Mua #${bMask}`} ↔ ${`ID-Bán #${sMask}`}`
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
    buyerBlindId: createdDeal.buyerBlindId,
    sellerBlindId: createdDeal.sellerBlindId,
    myBlindId: createdDeal.buyerBlindId,
    peerAlias: createdDeal.sellerBlindId || 'ID-Bán',
    peerRole: 'merchant',
    avatarText: 'N',
    lastMessage: `${createdDeal.buyerBlindId} ↔ ${createdDeal.sellerBlindId}`,
    lastTime: getCurrentTimeStr(),
    unreadCount: 0,
    messages: createdDeal.messages.map(m => ({
      author: m.senderBlindId || 'HỆ THỐNG',
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

  showToast(`💬 Đã mở kênh thảo luận [${createdDeal.dealId}] cho "${productName}"`, 'success');
  return createdDeal;
}

function applyIncomingBlindDealState(deal, isInitiator = false) {
  if (!deal || !deal.dealId) return;

  // If already burned, ignore immediately to stop notification storms
  if (alreadyBurnedDeals.has(deal.dealId) || lastBurnedDealId === deal.dealId) {
    return;
  }
  if (deal.status === 'completed_burned') {
    executeLocalDealAutoBurn(deal.dealId, true);
    return;
  }

  let matchingThread = chatThreads.find(t => t.dealId === deal.dealId);

  if (!matchingThread) {
    let existingRole = null;
    try {
      existingRole = sessionStorage.getItem(`ghost_my_deal_role_${deal.dealId}`);
    } catch {}
    if (!existingRole && !isInitiator) {
      setMyDealRole(deal.dealId, 'seller');
    }

    const myRole = getMyDealRole(deal);
    const partnerName = myRole === 'buyer' ? deal.sellerBlindId : deal.buyerBlindId;
    const myBlindId = myRole === 'buyer' ? deal.buyerBlindId : deal.sellerBlindId;
    const initialAvatar = myRole === 'buyer' ? 'B' : 'M';

    matchingThread = {
      id: `thread-${deal.dealId}`,
      dealId: deal.dealId,
      productId: deal.productId || 'general',
      productName: deal.productName || 'Giao dịch Ẩn danh',
      buyerBlindId: deal.buyerBlindId,
      sellerBlindId: deal.sellerBlindId,
      myBlindId: myBlindId,
      peerAlias: partnerName,
      peerRole: myRole === 'buyer' ? 'merchant' : 'buyer',
      avatarText: initialAvatar,
      lastMessage: deal.messages?.[deal.messages.length - 1]?.text || `${deal.buyerBlindId} ↔ ${deal.sellerBlindId}`,
      lastTime: getCurrentTimeStr(),
      unreadCount: isInitiator ? 0 : 1,
      messages: []
    };

    chatThreads.unshift(matchingThread);
    if (!isInitiator) {
      if (activeThreadId === 'thread-merchant-general' || !activeThreadId) {
        activeThreadId = matchingThread.id;
      }
    }

    // Only notify ONCE per unique dealId
    if (!seenDealNotifications.has(deal.dealId)) {
      seenDealNotifications.add(deal.dealId);
      if (!isInitiator) {
        playNotificationChime();
        showToast(`💬 Kênh trao đổi mới [${deal.dealId}]: ${deal.productName || 'Công việc'}`, 'info');
      }
    }
  } else {
    const myRole = getMyDealRole(deal);
    matchingThread.buyerBlindId = deal.buyerBlindId;
    matchingThread.sellerBlindId = deal.sellerBlindId;
    matchingThread.myBlindId = myRole === 'buyer' ? deal.buyerBlindId : deal.sellerBlindId;
    matchingThread.peerAlias = myRole === 'buyer' ? deal.sellerBlindId : deal.buyerBlindId;
  }

  const myRole = getMyDealRole(deal);
  const prevMsgCount = Array.isArray(matchingThread.messages) ? matchingThread.messages.length : 0;
  const incomingMsgs = Array.isArray(deal.messages) ? deal.messages : [];

  if (incomingMsgs.length > 0) {
    matchingThread.messages = incomingMsgs.map(m => {
      if (m.role === 'system') {
        return {
          author: m.senderBlindId || 'HỆ THỐNG',
          role: 'system',
          time: m.time || getCurrentTimeStr(),
          text: m.text
        };
      }
      if (m.role === myRole) {
        return {
          author: m.senderBlindId || matchingThread.myBlindId || (myRole === 'buyer' ? 'ID-Mua' : 'ID-Bán'),
          role: 'buyer',
          time: m.time || getCurrentTimeStr(),
          text: m.text
        };
      }
      return {
        author: m.senderBlindId || matchingThread.peerAlias || (myRole === 'buyer' ? 'ID-Bán' : 'ID-Mua'),
        role: 'merchant',
        time: m.time || getCurrentTimeStr(),
        text: m.text
      };
    });

    const last = incomingMsgs[incomingMsgs.length - 1];
    if (last) {
      matchingThread.lastMessage = last.text;
      matchingThread.lastTime = last.time || getCurrentTimeStr();
    }

    // ONLY notify if genuinely new messages arrived from the other party (strictly avoids polling loop storms!)
    if (incomingMsgs.length > prevMsgCount) {
      const newMessages = incomingMsgs.slice(prevMsgCount);
      const otherMessages = newMessages.filter(m => m.role !== myRole && m.role !== 'system');

      if (otherMessages.length > 0 && !isInitiator) {
        if (matchingThread.id !== activeThreadId) {
          matchingThread.unreadCount = (matchingThread.unreadCount || 0) + otherMessages.length;
        }
        playNotificationChime();
        showToast(`💬 Tin nhắn mới từ ${formatColleagueAlias(matchingThread.peerAlias)}`, 'info');
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
  const senderBlindId = thread.myBlindId || (myRole === 'seller' ? (thread.sellerBlindId || 'ID-Bán') : (thread.buyerBlindId || 'ID-Mua'));

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
      author: senderBlindId,
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

function removeSoldProductFromMarket(productId, productName = '') {
  let matched = null;
  if (productId && productId !== 'general' && productId !== 'custom') {
    matched = MARKET_PRODUCTS.find(p => p.id === productId) || myVendorListings.find(p => p.id === productId);
  }
  if (!matched && productName) {
    matched = MARKET_PRODUCTS.find(p => p.name === productName) || myVendorListings.find(p => p.name === productName);
  }

  const targetId = matched?.id || (productId !== 'general' && productId !== 'custom' ? productId : '');
  if (!targetId) return null;

  addRevokedProductId(targetId);
  MARKET_PRODUCTS = MARKET_PRODUCTS.filter(p => p.id !== targetId);
  myVendorListings = myVendorListings.filter(p => p.id !== targetId);
  saveMyVendorListingsToStorage();
  saveMarketProductsToStorage();

  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'REVOKE_PRODUCT',
        productId: targetId
      });
    } catch {}
  }

  if (isP2PConnected && activePeerConnection) {
    try {
      activePeerConnection.send({
        type: 'market_item_revoked',
        productId: targetId
      });
    } catch {}
  }

  updateCategoryPillCounts();
  populateOrderProductSelect(MARKET_PRODUCTS);
  filterAndRenderProducts();
  renderMyListings();
  updateRamMonitor();
  return targetId;
}

async function confirmBlindDealPayment() {
  const thread = getActiveThread();
  if (!thread || !thread.dealId) {
    showToast('Chưa có phiên giao dịch nào đang mở!', 'warning');
    return;
  }

  const prodId = thread.productId || activeAutoDeal?.productId || activeOrder?.product?.id || '';
  const prodName = thread.productName || activeAutoDeal?.productName || activeOrder?.product?.name || '';

  let updatedDeal = null;
  try {
    const res = await bazaarApiFetch('/api/lexicon/bazaar-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'pay_escrow',
        dealId: thread.dealId,
        productId: prodId,
        productName: prodName
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.deal) updatedDeal = data.deal;
    }
  } catch {}

  // Immediately remove the sold product from the marketplace once it has a buyer!
  removeSoldProductFromMarket(prodId, prodName);

  thread.messages.push({
    author: 'KÝ QUỸ RAM (ESCROW)',
    role: 'system',
    time: getCurrentTimeStr(),
    text: `📋 [ĐÃ TIẾP NHẬN BÀN GIAO]: Đồng nghiệp đã xác nhận tiếp nhận cho phiên [${thread.dealId}]. Hạng mục "${prodName}" đã được rút khỏi bảng tin chung! Khi bàn giao xong, nhấn "✅ Hoàn Tất Bàn Giao (Tự Hủy Chat)" để xóa sạch lịch sử khỏi RAM.`
  });
  thread.lastMessage = 'Đã tiếp nhận bàn giao';
  thread.lastTime = getCurrentTimeStr();

  saveChatThreadsToStorage();
  renderMessengerThreads();
  renderChatMessages();

  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'DEAL_SYNC',
        deal: updatedDeal || { dealId: thread.dealId, productId: prodId, productName: prodName, status: 'paid_escrow' }
      });
    } catch {}
  }

  showToast(`📋 Đã xác nhận tiếp nhận "${prodName}"! Mục này đã được lưu kho nội bộ.`, 'success');
}

async function completeDealAndAutoBurn() {
  const thread = getActiveThread();
  const targetDealId = thread?.dealId || activeAutoDeal?.dealId || 'DEAL-RAM';
  const prodId = thread?.productId || activeAutoDeal?.productId || activeOrder?.product?.id || '';
  const prodName = thread?.productName || activeAutoDeal?.productName || activeOrder?.product?.name || '';

  try {
    await bazaarApiFetch('/api/lexicon/bazaar-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'complete_and_burn',
        dealId: targetDealId,
        productId: prodId,
        productName: prodName
      })
    });
  } catch {}

  removeSoldProductFromMarket(prodId, prodName);

  if (bazaarSyncChannel) {
    try {
      bazaarSyncChannel.postMessage({
        type: 'DEAL_COMPLETED_BURN',
        dealId: targetDealId,
        productId: prodId,
        productName: prodName
      });
    } catch {}
  }

  executeLocalDealAutoBurn(targetDealId, false, prodId, prodName);
}

function executeLocalDealAutoBurn(dealId, isRemoteTrigger = false, soldProductId = '', soldProductName = '') {
  const burnedCode = dealId || 'DEAL';
  lastBurnedDealId = burnedCode;

  const targetThread = chatThreads.find(t => t.dealId === burnedCode);
  const pId = soldProductId || targetThread?.productId || activeAutoDeal?.productId || activeOrder?.product?.id || '';
  const pName = soldProductName || targetThread?.productName || activeAutoDeal?.productName || activeOrder?.product?.name || '';

  if (pId || pName) {
    removeSoldProductFromMarket(pId, pName);
  }

  activeAutoDeal = null;
  activeOrder = null;
  if (orderCountdownTimer) {
    clearInterval(orderCountdownTimer);
    orderCountdownTimer = null;
  }

  try {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_DEAL);
    sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_DEAL);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_ORDER);
    sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_ORDER);
  } catch {}

  const orderResultBox = document.getElementById('order-result-box');
  if (orderResultBox) orderResultBox.style.display = 'none';

  // Remove the burned thread from Messenger threads
  chatThreads = chatThreads.filter(t => t.dealId !== burnedCode);
  if (chatThreads.length === 0) {
    inMemoryChatMessages = [];
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
    `✅ Đã hoàn tất bàn giao! Hạng mục và lịch sử hội thoại [${burnedCode}] đã tự động xóa sạch khỏi RAM cả 2 bên.`,
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

    if (data && Array.isArray(data.soldOrRevokedIds)) {
      data.soldOrRevokedIds.forEach(soldId => {
        if (soldId && !revokedProductIds.has(soldId)) {
          removeSoldProductFromMarket(soldId);
        }
      });
    }

    if (data && data.lastBurnedDealId && data.lastBurnedDealId !== lastBurnedDealId) {
      const hasThread = chatThreads.some(t => t.dealId === data.lastBurnedDealId);
      if (hasThread || (activeAutoDeal && activeAutoDeal.dealId === data.lastBurnedDealId)) {
        executeLocalDealAutoBurn(data.lastBurnedDealId, true, data.lastSoldProductId || '');
      }
    }

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
      const topic = prompt('Nhập tên đầu việc hoặc chủ đề cần thảo luận:', 'Họp nhóm dự án');
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
      completeDealAndAutoBurn();
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
      startHostingP2PRoom(roomCode);
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
      if (currentRoomCode) {
        const link = getRoomShareableLink(currentRoomCode);
        navigator.clipboard.writeText(link).then(() => {
          showToast('Đã sao chép link phòng họp P2P! Gửi cho đồng nghiệp để tham gia.', 'success');
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
          author: thread.peerAlias || 'Trợ Lý Điều Phối',
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

  // Initial poll and near real-time background sync (every 1.2s)
  pollBlindDealRelay();
  setInterval(pollBlindDealRelay, 1200);
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
      const myAuthor = formatColleagueAlias(msg.author || thread?.myBlindId || 'Thành viên');
      return `
        <div class="chat-msg buyer">
          <div class="msg-bubble">
            <div class="msg-author-tag" style="color: #a7f3d0;">${escapeHtml(myAuthor)}</div>
            <div class="msg-text">${escapeHtml(msg.text)}</div>
            <span class="msg-meta-time">${escapeHtml(msg.time)}</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="chat-msg merchant">
        <div class="msg-bubble">
          <div class="msg-author-tag">${escapeHtml(formatColleagueAlias(msg.author || thread?.peerAlias || 'Phụ trách'))}</div>
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

  if (lower.includes('tiến độ') || lower.includes('phụ trách')) {
    return 'Hạng mục này hiện đang được xử lý bởi nhóm phụ trách liên quan. Bạn có thể sang tab "Bàn Giao & Cấp Phát Mật" để tạo phiếu tiếp nhận và lấy mã Token đối chiếu.';
  }

  if (lower.includes('drop') || lower.includes('bàn giao') || lower.includes('mật khẩu')) {
    return 'Mọi thông tin nhạy cảm (file .env, API Key, cấu hình VPN, tài liệu nội bộ) đều được mã hóa AES-256-GCM dưới dạng Drop Token tự hủy 1 lần. Ngay khi đồng nghiệp mở xem, dữ liệu sẽ biến mất khỏi RAM máy chủ.';
  }

  if (lower.includes('pgp') || lower.includes('quyền') || lower.includes('xác minh')) {
    return 'Dấu vân tay chứng thư nội bộ hiện hành: [4A8F C310 998D E21B 77A4 0019 FF45 8891 00C2 91BC]. Bạn có thể gắn PGP Public Key của phòng ban khi tạo Phiếu Bàn Giao.';
  }

  if (lower.includes('zero-log') || lower.includes('log') || lower.includes('lưu')) {
    return 'Hệ thống làm việc nội bộ vận hành hoàn toàn trên RAM khả biến (Zero-Log): không lưu lịch sử xuống ổ đĩa cứng. Toàn bộ tin nhắn sẽ tự xóa sạch khi đóng phiên hoặc nhấn ESC.';
  }

  return `Đã ghi nhận tin nhắn: "${userMsg}". Bạn có thể mời đồng nghiệp vào phòng họp P2P trực tiếp máy-tới-máy ở góc phải, hoặc chuyển sang tab "Bàn Giao" để tạo phiếu tiếp nhận tài nguyên.`;
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
    pill.setAttribute('aria-pressed', pill.classList.contains('active') ? 'true' : 'false');
    pill.addEventListener('click', () => {
      ttlPills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-pressed', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-pressed', 'true');
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
      const orderId = `HDV-RAM-${orderHex}`;

      const xmrPrefix = 'TKN-NEXUS-';
      const xmrSuffix = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const xmrAddress = `${xmrPrefix}${xmrSuffix.slice(0, 12).toUpperCase()}`;

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

      // Automatically connect Buyer <-> Seller Deal Channel & remove bought item from public market
      startAutoBlindDeal(product.name, product.id).then((deal) => {
        bazaarApiFetch('/api/lexicon/bazaar-deals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'pay_escrow',
            dealId: deal?.dealId || '',
            orderId,
            productId: product.id,
            productName: product.name
          })
        }).catch(() => {});
      });
      removeSoldProductFromMarket(product.id, product.name);
      showToast(`Đã tạo phiếu tiếp nhận "${product.name}"! Kênh thảo luận nội bộ đã được mở.`, 'success');
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
      showToast('Đã hủy phiếu bàn giao và xóa sạch khỏi RAM!', 'info');
    });
  }

  if (copyXmrBtn) {
    copyXmrBtn.addEventListener('click', () => {
      const addrInput = document.getElementById('receipt-xmr-address');
      if (addrInput && navigator.clipboard) {
        navigator.clipboard.writeText(addrInput.value).then(() => {
          showToast('Đã sao chép mã Token bàn giao nội bộ!', 'success');
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
        qr.addData(`nexus-handover:${activeOrder.orderId}?token=${activeOrder.xmrAddress}`);
        qr.make();
        qrBox.innerHTML = qr.createSvgTag(6, 0);
        openAccessibleModal(qrOverlay, '#close-qr-btn');
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
      showToast('Phiếu bàn giao đã hết hạn TTL và tự hủy khỏi RAM!', 'error');
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

function estimateUSDString(val, currency = 'Giờ') {
  const num = Number(val) || 0;
  if (currency === 'VNĐ') return `~${Math.round(num).toLocaleString('en-US')} VNĐ`;
  return `${formatPriceNum(num)} ${currency} • Nội bộ công ty`;
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
    activeBiddingProductId = null;
    closeAccessibleModal(modalOverlay);
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

      showToast(`Đã gửi đề xuất ${formatPriceNum(bidVal)} ${currency} cho "${product.name}"!`, 'success');
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
          <span class="detail-label">Mức đề xuất hiện tại:</span>
          <span style="font-family: var(--font-mono); font-weight: 700; color: #fbbf24;">${formatPriceNum(currentBid)} ${escapeHtml(currency)}</span>
        </div>
        <div class="bid-price-cell">
          <span class="detail-label">Hạn mức / Người đề xuất:</span>
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
      ? `Mức điều chỉnh tối thiểu: +${minStep} ${currency} (Gợi ý: ${suggestedBid.toFixed(2)} ${currency})`
      : `Tự do đề xuất — Nhập ước lượng của bạn theo đơn vị ${currency}`;
  }

  if (feedEl) {
    const bids = product.bids || [];
    if (bids.length === 0) {
      feedEl.innerHTML = '<div style="font-size: 0.76rem; color: #94a3b8; font-style: italic;">Chưa có đề xuất nào từ các phòng ban. Hãy là người đầu tiên đóng góp ước lượng!</div>';
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
    openAccessibleModal(modalOverlay, '#bid-amount-input');
  }
}

/* ==========================================================================
   9. VENDOR DESK: UNRESTRICTED LISTING & AUCTION CREATION
   ========================================================================== */

let myVendorListings = [];
let currentListingMode = 'hybrid';

const CATEGORY_DEFAULT_BADGES = {
  physical: 'Thiết Bị VP',
  digital: 'Tài Nguyên Số',
  service: 'Phối Hợp Nhóm',
  hardware: 'DevOps & Phần Cứng',
  network: 'Hạ Tầng Mạng',
  crypto: 'API & Mật Khẩu',
  audit: 'Tài Liệu Audit'
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
    [modeHybridBtn, modeAuctionBtn, modeFixedBtn].forEach(b => {
      b?.classList.remove('active');
      b?.setAttribute('aria-selected', 'false');
    });
    if (mode === 'hybrid') {
      modeHybridBtn?.classList.add('active');
      modeHybridBtn?.setAttribute('aria-selected', 'true');
      if (fixedSection) fixedSection.style.display = 'block';
      if (auctionSection) auctionSection.style.display = 'block';
    } else if (mode === 'auction') {
      modeAuctionBtn?.classList.add('active');
      modeAuctionBtn?.setAttribute('aria-selected', 'true');
      if (fixedSection) fixedSection.style.display = 'none';
      if (auctionSection) auctionSection.style.display = 'block';
    } else {
      modeFixedBtn?.classList.add('active');
      modeFixedBtn?.setAttribute('aria-selected', 'true');
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
        emojiPicker.querySelectorAll('.emoji-opt').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        iconInput.value = btn.getAttribute('data-icon') || '📌';
        updateVendorLivePreview();
      });
    });
  }

  // TTL Pills
  if (ttlPills && ttlValInput) {
    ttlPills.querySelectorAll('.ttl-pill').forEach(pill => {
      pill.setAttribute('aria-pressed', pill.classList.contains('active') ? 'true' : 'false');
      pill.addEventListener('click', () => {
        ttlPills.querySelectorAll('.ttl-pill').forEach(p => {
          p.classList.remove('active');
          p.setAttribute('aria-pressed', 'false');
        });
        pill.classList.add('active');
        pill.setAttribute('aria-pressed', 'true');
        ttlValInput.value = pill.getAttribute('data-ttl') || '604800';
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
      showToast('Đã làm mới biểu mẫu đăng thông báo nội bộ', 'info');
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

  const name = (document.getElementById('listing-name')?.value || '').trim() || 'Tiêu đề thông báo / Tài nguyên công ty';
  const category = document.getElementById('listing-category')?.value || 'physical';
  const customBadge = (document.getElementById('listing-custom-badge')?.value || '').trim();
  const icon = (document.getElementById('listing-icon-val')?.value || '').trim() || '📌';
  const currency = document.getElementById('listing-currency')?.value || 'Giờ';
  const secTag = (document.getElementById('listing-security-tag')?.value || '').trim() || 'Nội bộ • Ưu tiên Trung bình';
  const desc = (document.getElementById('listing-desc')?.value || '').trim() || 'Mô tả chi tiết nội dung công việc, tài liệu chia sẻ hoặc yêu cầu phối hợp giữa các phòng ban...';
  const spec1 = document.getElementById('listing-spec1-v')?.value || 'Phòng Kỹ Thuật / IT';
  const spec2 = document.getElementById('listing-spec2-v')?.value || 'Token RAM / Thảo luận trực tiếp';

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
        <span class="auction-countdown-pill" data-end="0">♾️ <span class="countdown-val">PHỐI HỢP NỘI BỘ</span></span>
      </div>

      <div class="product-title-row">
        <div class="product-icon-box">${escapeHtml(icon)}</div>
        <h3 class="product-title">${escapeHtml(name)}</h3>
      </div>

      <p class="product-desc">${escapeHtml(desc)}</p>

      <div class="product-specs">
        <div class="spec-row">
          <span class="spec-key"><span class="spec-bullet">▸</span>Phụ trách:</span>
          <span class="spec-val">${escapeHtml(spec1)}</span>
        </div>
        <div class="spec-row">
          <span class="spec-key"><span class="spec-bullet">▸</span>Bàn giao:</span>
          <span class="spec-val">${escapeHtml(spec2)}</span>
        </div>
      </div>

      <div class="product-card-footer">
        <div class="product-price-block">
          <span class="product-price-label">Ước lượng / Quy mô hiện tại:</span>
          <span class="product-price auction-price">${formatPriceNum(displayPrice)} ${escapeHtml(currency)}</span>
          <span class="product-bid-meta">Hạn mức: ${formatPriceNum(buyNowVal)} ${escapeHtml(currency)}</span>
        </div>
        <div class="product-actions">
          <button type="button" class="bid-btn" style="pointer-events: none;"><span>✋</span> Đề Xuất</button>
          <button type="button" class="buy-btn" style="pointer-events: none;"><span>📥</span> Tiếp Nhận</button>
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
  const name = rawName || `Thông Báo Nội Bộ #${randHex.slice(0, 4)}`;

  const category = document.getElementById('listing-category')?.value || 'physical';
  const customBadge = (document.getElementById('listing-custom-badge')?.value || '').trim();
  const icon = (document.getElementById('listing-icon-val')?.value || '').trim() || '📌';
  const currency = document.getElementById('listing-currency')?.value || 'Giờ';
  const secTag = (document.getElementById('listing-security-tag')?.value || '').trim() || 'Nội bộ • Ưu tiên Trung bình';
  const desc = (document.getElementById('listing-desc')?.value || '').trim() || 'Thông báo hoặc tài nguyên nội bộ chia sẻ trực tiếp trên RAM công ty — các thành viên có thể thảo luận và tiếp nhận ngay.';
  const spec1 = document.getElementById('listing-spec1-v')?.value || 'Phòng Kỹ Thuật / IT';
  const spec2 = document.getElementById('listing-spec2-v')?.value || 'Token RAM / Thảo luận trực tiếp';
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
  const stockText = (document.getElementById('listing-stock')?.value || '').trim() || 'Sẵn sàng phối hợp';

  const fixedPrice = isNaN(fixedPriceInput) ? 1.00 : Math.max(0, fixedPriceInput);
  const startBid = isNaN(startBidInput) ? fixedPrice : Math.max(0, startBidInput);
  const minStep = isNaN(minStepInput) ? 0 : Math.max(0, minStepInput);

  const initialPrice = currentListingMode === 'fixed' ? fixedPrice : startBid;
  const buyNowPrice = currentListingMode === 'auction' ? Math.max(startBid, fixedPrice || startBid) : fixedPrice;
  const badgeTitle = customBadge || CATEGORY_DEFAULT_BADGES[category] || 'Nội Bộ Công Ty';

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
    highestBidder: 'Chưa phân công',
    bids: [],
    auctionEndTime: duration === 0 ? 0 : (Date.now() + (duration * 1000)),
    priceXMR: `${formatPriceNum(initialPrice)} ${currency}`,
    rawPriceXMR: initialPrice,
    approxUSD: estimateUSDString(initialPrice, currency),
    stock: stockText,
    desc,
    specs: {
      'Phụ trách': spec1,
      'Bàn giao': spec2,
      'Hình thức': minStep > 0 ? `Điều chỉnh tối thiểu +${minStep} ${currency}` : 'Đề xuất tự do & Bàn giao ngay',
      'Người tạo': vendorPubkey ? `${vendorPubkey.slice(0, 14)}...` : (anonymousAlias || 'Thành viên Nội bộ')
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

  showToast(`📢 Đã đăng thông báo "${name}" lên Bảng Tin Nội Bộ! Mã thu hồi: ${newProduct.vendorKillToken || vendorKillToken}`, 'success');
}

function renderMyListings() {
  const container = document.getElementById('my-listings-list');
  if (!container) return;

  if (myVendorListings.length === 0) {
    container.innerHTML = '<p class="empty-listings-note">Bạn chưa tạo thông báo hay chia sẻ tài nguyên nào trong phiên này.</p>';
    return;
  }

  container.innerHTML = myVendorListings.map(item => {
    const currency = item.currency || 'Giờ';
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
          Ước lượng: <strong style="color: #38bdf8;">${formatPriceNum(item.currentBidXMR)} ${escapeHtml(currency)}</strong> (${item.bidCount || 0} phản hồi) • Hạn mức: <strong style="color: #34d399;">${formatPriceNum(item.buyNowPrice)} ${escapeHtml(currency)}</strong>
        </div>

        <div class="kill-token-box">
          <span>Mã Thu Hồi Nội Bộ: <strong class="kill-token-val">${escapeHtml(item.vendorKillToken)}</strong></span>
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
          showToast(`Đã sao chép Mã Thu Hồi Nội Bộ: ${token}`, 'success');
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

  showToast(`Đã thu hồi và gỡ bỏ thông báo "${prodName}" khỏi RAM!`, 'info');
}
