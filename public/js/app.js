/**
 * @file app.js
 * @description Main application controller binding Decoy Lexicon UI with Covert Zero-Knowledge Drop & P2P system.
 */

import {
  fetchDictionaryEntries,
  getWikipediaUrl,
  getWiktionaryUrl,
  getGoogleSearchUrl,
  getDuckDuckGoUrl,
  fetchLiveWikipedia,
  fetchWikipediaSuggestions
} from './decoy-dictionary.js';
import {
  generateSymmetricKey,
  exportKeyToBase64Url,
  importKeyFromBase64Url,
  encryptPayload,
  decryptPayload,
  bufferToBase64Url,
  base64UrlToBuffer,
  generateECDHKeyPair,
  exportECDHPublicKey,
  importECDHPublicKey,
  deriveECDHSharedKey,
  buildDropUrl,
  parseDropUrlFragment,
  purgeUrlFragment,
  wipeMemory
} from './crypto-engine.js';

// Application State
let activeLanguage = 'all';
let badgeClickCount = 0;
let countdownInterval = null;
let activeSuggestionIndex = -1;

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

// Covert trigger keywords that cause instant redirection to the dedicated Vault page
const COVERT_REDIRECT_TRIGGERS = [
  ':market',
  'market',
  ':shop',
  'shop',
  ':bazaar',
  'bazaar',
  'chợ',
  'cho',
  ':black',
  'black',
  ':drop',
  'vault',
  '//drop',
  ':vault',
  ':secure',
  'secure',
  'matrix',
  'terminal',
  'zero-trust',
  ':msg',
  'mật mã',
  'mat ma',
  'drop'
];

function isCovertTrigger(inputVal) {
  if (!inputVal) return false;
  const normalized = inputVal.trim().toLowerCase();
  return COVERT_REDIRECT_TRIGGERS.includes(normalized);
}

function redirectToVault() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.classList.add('covert-pulse');
    searchInput.value = 'Xác thực mã bí mật: Đang mở Chợ Ẩn Danh (Ghost Bazaar)...';
    searchInput.disabled = true;
  }
  setTimeout(() => {
    window.location.href = './vault.html' + (window.location.hash || '');
  }, 120);
}

// P2P State
let p2pActive = false;
let p2pKeyPair = null;
let p2pMyPubB64 = null;
let p2pPeerPubKey = null;
let p2pSharedKey = null;
let p2pChannelId = null;
let p2pSenderId = null;
let p2pPollTimer = null;
let p2pLastPollTime = 0;

document.addEventListener('DOMContentLoaded', async () => {
  // Auto-forward if user opened room invite via root page (e.g. thuviendangonngu.com/#room=GHOST-XXXX)
  if (window.location.hash && window.location.hash.toLowerCase().includes('room=')) {
    window.location.href = './vault.html' + window.location.hash;
    return;
  }

  initDecoyDictionary();
  initCovertTriggers();
  initDropCreation();
  initManualDecryption();
  initP2PMessaging();
  checkUrlForSecretDrop();
});

/* ==========================================================================
   1. DECOY DICTIONARY LOGIC
   ========================================================================== */

async function initDecoyDictionary() {
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-search-btn');
  const langPills = document.getElementById('lang-pills');
  const quickTags = document.querySelectorAll('.tag-btn');

  // Initial render
  await renderDictionary();

  // Initialize Omnibox Engine Switcher & Live Suggestions right on the Search Bar
  initOmniboxSearchBar();

  clearBtn.addEventListener('click', async () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    hideOmniboxSuggestions();
    await renderDictionary('', activeLanguage);
    searchInput.focus();
  });

  // Language filter pills
  langPills.addEventListener('click', async (e) => {
    if (e.target.classList.contains('pill')) {
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      activeLanguage = e.target.getAttribute('data-lang');
      await renderDictionary(searchInput.value.trim(), activeLanguage);
    }
  });

  // Quick tag chips
  quickTags.forEach(btn => {
    btn.addEventListener('click', async () => {
      const word = btn.getAttribute('data-word');
      searchInput.value = word;
      clearBtn.style.display = 'block';
      await renderDictionary(word, activeLanguage);
    });
  });
}

// Active Search Engine Configuration
let activeEngine = 'wiki-vi';

const ENGINE_CONFIG = {
  'wiki-vi': {
    name: 'Wikipedia (VI)',
    icon: '🇻🇳',
    placeholder: 'Tìm kiếm trực tiếp trên Wikipedia Tiếng Việt... (Mẹo: gõ :drop hoặc vault)',
    searchUrl: term => `https://vi.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(term)}`
  },
  'wiki-en': {
    name: 'Wikipedia (EN)',
    icon: '🌐',
    placeholder: 'Search directly on Wikipedia English... (Hint: type :drop or vault)',
    searchUrl: term => `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(term)}`
  },
  'wiktionary': {
    name: 'Wiktionary',
    icon: '📖',
    placeholder: 'Tra cứu mục từ trên Wiktionary... (Mẹo: gõ :drop hoặc vault)',
    searchUrl: term => `https://vi.wiktionary.org/wiki/Special:Search?search=${encodeURIComponent(term)}`
  },
  'google': {
    name: 'Google',
    icon: '🔍',
    placeholder: 'Tìm kiếm mở rộng trên Google... (Mẹo: gõ :drop hoặc vault)',
    searchUrl: term => `https://www.google.com/search?q=${encodeURIComponent(term)}`
  },
  'local': {
    name: 'Từ Điển',
    icon: '📚',
    placeholder: 'Tra cứu trong từ điển nội bộ... (Mẹo: gõ :drop hoặc vault)',
    searchUrl: null
  }
};

function initOmniboxSearchBar() {
  const engineBtn = document.getElementById('engine-btn');
  const engineMenu = document.getElementById('engine-menu');
  const engineIcon = document.getElementById('engine-icon');
  const engineLabel = document.getElementById('engine-label');
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-search-btn');
  const submitBtn = document.getElementById('search-submit-btn');

  // Toggle Engine Menu Dropdown
  if (engineBtn && engineMenu) {
    engineBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = engineMenu.style.display === 'block';
      engineMenu.style.display = isOpen ? 'none' : 'block';
      hideOmniboxSuggestions();
    });

    // Select Engine Option
    engineMenu.querySelectorAll('.engine-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        engineMenu.querySelectorAll('.engine-menu-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        activeEngine = item.getAttribute('data-engine');
        const cfg = ENGINE_CONFIG[activeEngine];
        if (cfg) {
          engineIcon.textContent = cfg.icon;
          engineLabel.textContent = cfg.name;
          searchInput.placeholder = cfg.placeholder;
        }
        engineMenu.style.display = 'none';
        searchInput.focus();
      });
    });
  }

  // Real-time Input on Search Bar: Covert Trigger Check + Live Suggestions Dropdown
  let suggestionDebounce = null;
  searchInput.addEventListener('input', async () => {
    const val = searchInput.value.trim();
    clearBtn.style.display = val ? 'block' : 'none';

    // 1. Covert Trigger Check -> Instantly Redirect to Vault
    if (isCovertTrigger(val)) {
      hideOmniboxSuggestions();
      redirectToVault();
      return;
    }

    // 2. Filter local dictionary view
    await renderDictionary(val, activeLanguage);

    // 3. Query Wikipedia OpenSearch Suggestions for the Omnibox Dropdown
    if (val.length >= 2) {
      if (suggestionDebounce) clearTimeout(suggestionDebounce);
      suggestionDebounce = setTimeout(async () => {
        const langCode = activeEngine === 'wiki-en' ? 'en' : 'vi';
        const suggestions = await fetchWikipediaSuggestions(val, langCode);
        renderOmniboxSuggestions(val, suggestions);
      }, 150);
    } else {
      hideOmniboxSuggestions();
    }
  });

  // Keyboard Navigation on Search Bar (Arrow keys, Enter, Esc)
  searchInput.addEventListener('keydown', (e) => {
    const box = document.getElementById('omnibox-suggestions');
    const isBoxOpen = box && box.style.display === 'block';
    const items = isBoxOpen ? box.querySelectorAll('.omnibox-action-row, .omnibox-suggestion-item') : [];

    if (e.key === 'ArrowDown' && isBoxOpen && items.length > 0) {
      e.preventDefault();
      activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
      updateSuggestionHighlight(items);
    } else if (e.key === 'ArrowUp' && isBoxOpen && items.length > 0) {
      e.preventDefault();
      activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
      updateSuggestionHighlight(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isBoxOpen && activeSuggestionIndex >= 0 && items[activeSuggestionIndex]) {
        items[activeSuggestionIndex].click();
        return;
      }
      executeOmniboxSearch();
    } else if (e.key === 'Escape') {
      hideOmniboxSuggestions();
      if (engineMenu) engineMenu.style.display = 'none';
    }
  });

  // Global '/' shortcut to focus search bar
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  // Submit Button Click on Search Bar
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      executeOmniboxSearch();
    });
  }

  // Click outside closes dropdowns
  document.addEventListener('click', (e) => {
    if (engineMenu && !engineBtn.contains(e.target) && !engineMenu.contains(e.target)) {
      engineMenu.style.display = 'none';
    }
    const omnibox = document.getElementById('omnibox-suggestions');
    if (omnibox && !searchInput.contains(e.target) && !omnibox.contains(e.target)) {
      hideOmniboxSuggestions();
    }
  });
}

function executeOmniboxSearch(overrideTerm = null) {
  const searchInput = document.getElementById('search-input');
  const val = (overrideTerm !== null ? overrideTerm : searchInput.value).trim();

  hideOmniboxSuggestions();

  if (!val) {
    searchInput.focus();
    return;
  }

  // Secret keyword check
  if (isCovertTrigger(val)) {
    redirectToVault();
    return;
  }

  const cfg = ENGINE_CONFIG[activeEngine];
  if (cfg && cfg.searchUrl) {
    // Directly execute search on the selected engine (e.g. Wikipedia)
    const url = cfg.searchUrl(val);
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    // Local search: smooth scroll to dictionary list
    const resultsEl = document.getElementById('dictionary-list');
    if (resultsEl) resultsEl.scrollIntoView({ behavior: 'smooth' });
  }
}

function renderOmniboxSuggestions(query, suggestions) {
  const box = document.getElementById('omnibox-suggestions');
  if (!box) return;

  const cfg = ENGINE_CONFIG[activeEngine] || ENGINE_CONFIG['wiki-vi'];

  let html = `
    <div class="omnibox-action-row" data-query="${escapeHtml(query)}">
      <span class="action-icon">🔍</span>
      <span class="action-text">Tìm kiếm "<strong>${escapeHtml(query)}</strong>" trên ${escapeHtml(cfg.name)}</span>
      <span class="action-enter">↵ Enter</span>
    </div>
  `;

  if (suggestions && suggestions.length > 0) {
    html += `<div class="omnibox-section-title">Gợi ý từ Wikipedia:</div>`;
    suggestions.forEach(item => {
      html += `
        <div class="omnibox-suggestion-item" data-url="${escapeHtml(item.url)}" data-title="${escapeHtml(item.title)}">
          <span class="sugg-icon">🌐</span>
          <span class="sugg-title">${escapeHtml(item.title)}</span>
          <span class="sugg-badge">Wikipedia</span>
        </div>
      `;
    });
  }

  box.innerHTML = html;
  box.style.display = 'block';

  // Bind click events on suggestions
  box.querySelector('.omnibox-action-row')?.addEventListener('click', () => {
    executeOmniboxSearch(query);
  });

  box.querySelectorAll('.omnibox-suggestion-item').forEach(el => {
    el.addEventListener('click', () => {
      const url = el.getAttribute('data-url');
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        hideOmniboxSuggestions();
      }
    });
  });
}

function hideOmniboxSuggestions() {
  activeSuggestionIndex = -1;
  const box = document.getElementById('omnibox-suggestions');
  if (box) {
    box.style.display = 'none';
    box.innerHTML = '';
  }
}

function updateSuggestionHighlight(items) {
  items.forEach((item, idx) => {
    if (idx === activeSuggestionIndex) {
      item.classList.add('highlighted');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('highlighted');
    }
  });
}

let wikiSearchTimeout = null;

async function checkAndRenderLiveWikipedia(query) {
  const liveWrapper = document.getElementById('wiki-live-wrapper');
  if (!liveWrapper) return;

  if (!query || query.length < 2 || isCovertTrigger(query)) {
    liveWrapper.style.display = 'none';
    liveWrapper.innerHTML = '';
    return;
  }

  // Clear previous debounce
  if (wikiSearchTimeout) clearTimeout(wikiSearchTimeout);

  wikiSearchTimeout = setTimeout(async () => {
    const wikiData = await fetchLiveWikipedia(query, activeLanguage === 'en' ? 'en' : 'vi');
    if (wikiData && wikiData.extract) {
      liveWrapper.innerHTML = `
        <div class="wiki-live-card">
          <div class="wiki-badge-row">
            <span class="wiki-source-tag">📖 BÁCH KHOA TOÀN THƯ WIKIPEDIA (${(wikiData.lang || 'VI').toUpperCase()})</span>
            <a href="${escapeHtml(wikiData.articleUrl)}" target="_blank" rel="noopener noreferrer" class="wiki-visit-link">
              Đọc toàn bộ bài viết trên Wikipedia ↗
            </a>
          </div>
          <div class="wiki-card-body">
            ${wikiData.thumbnail ? `
              <div class="wiki-thumb-wrapper">
                <img src="${escapeHtml(wikiData.thumbnail)}" alt="${escapeHtml(wikiData.title)}" class="wiki-thumb">
              </div>
            ` : ''}
            <div class="wiki-text-col">
              <h3 class="wiki-entry-title">${escapeHtml(wikiData.title)}</h3>
              ${wikiData.description ? `<p class="wiki-entry-desc">${escapeHtml(wikiData.description)}</p>` : ''}
              <p class="wiki-entry-extract">${escapeHtml(wikiData.extract)}</p>
            </div>
          </div>
        </div>
      `;
      liveWrapper.style.display = 'block';
    } else {
      liveWrapper.style.display = 'none';
      liveWrapper.innerHTML = '';
    }
  }, 250);
}

async function renderDictionary(query = '', lang = 'all') {
  const listEl = document.getElementById('dictionary-list');
  const countEl = document.getElementById('results-count');

  // Trigger Live Wikipedia lookup concurrently
  checkAndRenderLiveWikipedia(query);

  const entries = await fetchDictionaryEntries(query, lang);
  countEl.textContent = `Hiển thị ${entries.length} mục từ vựng phù hợp:`;

  if (entries.length === 0) {
    listEl.innerHTML = `
      <div class="empty-recovery-box">
        <span class="empty-icon">📖</span>
        <h3 class="empty-title">Không tìm thấy mục từ trong từ điển nội bộ</h3>
        <p class="empty-desc">
          Từ khóa "<strong>${escapeHtml(query)}</strong>" không có trong dữ liệu lưu sẵn. Bạn có thể tra cứu tức thì trên các nền tảng bách khoa mở:
        </p>
        <div class="empty-actions">
          <button type="button" class="btn-small empty-wiki-vi-btn">🇻🇳 Tra trên Wikipedia (VI)</button>
          <button type="button" class="btn-small empty-wiki-en-btn">🌐 Tra trên Wikipedia (EN)</button>
          <button type="button" class="btn-small empty-google-btn">🔍 Tra trên Google Search</button>
        </div>
      </div>
    `;

    listEl.querySelector('.empty-wiki-vi-btn')?.addEventListener('click', () => {
      window.open(getWikipediaUrl(query, 'vi'), '_blank', 'noopener,noreferrer');
    });
    listEl.querySelector('.empty-wiki-en-btn')?.addEventListener('click', () => {
      window.open(getWikipediaUrl(query, 'en'), '_blank', 'noopener,noreferrer');
    });
    listEl.querySelector('.empty-google-btn')?.addEventListener('click', () => {
      window.open(getGoogleSearchUrl(query), '_blank', 'noopener,noreferrer');
    });

    return;
  }

  listEl.innerHTML = entries.map(item => `
    <article class="word-card">
      <div class="word-header">
        <h2 class="word-title">${escapeHtml(item.word)}</h2>
        <span class="word-pos">${escapeHtml(item.pos)}</span>
      </div>
      <div class="word-phonetic-row">
        <span class="word-phonetic">${escapeHtml(item.phonetic || '')}</span>
        <div class="word-card-actions">
          <button type="button" class="audio-pronounce-btn" data-word="${escapeHtml(item.word)}" data-lang="${escapeHtml(item.lang)}" title="Nghe phát âm chuẩn">
            <span>🔊</span> Nghe
          </button>
          <button type="button" class="word-action-btn copy-def-btn" data-word="${escapeHtml(item.word)}" data-def="${escapeHtml(item.definition)}" title="Sao chép từ & định nghĩa">
            <span>📋</span> Chép
          </button>
        </div>
      </div>
      <p class="word-def">${escapeHtml(item.definition)}</p>
      <div class="word-translations">
        ${Object.entries(item.translations || {}).map(([l, val]) => `
          <div class="translation-row">
            <span class="trans-lang">${l.toUpperCase()}:</span>
            <span class="trans-val">${escapeHtml(val)}</span>
          </div>
        `).join('')}
      </div>
      ${item.examples && item.examples.length ? `
        <div class="word-example">"${escapeHtml(item.examples[0])}"</div>
      ` : ''}

      <!-- External Links to Major Platforms for this Word -->
      <div class="card-ext-bar">
        <span class="card-ext-label">Tra cứu mở rộng:</span>
        <div class="card-ext-links">
          <a href="${getWikipediaUrl(item.word, 'vi')}" target="_blank" rel="noopener noreferrer" class="card-ext-pill wiki" title="Xem trên Wikipedia Tiếng Việt">
            <span>🇻🇳</span> Wiki (VI)
          </a>
          <a href="${getWikipediaUrl(item.word, 'en')}" target="_blank" rel="noopener noreferrer" class="card-ext-pill wiki" title="Xem trên Wikipedia English">
            <span>🌐</span> Wiki (EN)
          </a>
          <a href="${getWiktionaryUrl(item.word, 'vi')}" target="_blank" rel="noopener noreferrer" class="card-ext-pill wiktionary" title="Xem trên Wiktionary">
            <span>📚</span> Wiktionary
          </a>
          <a href="${getGoogleSearchUrl(item.word)}" target="_blank" rel="noopener noreferrer" class="card-ext-pill google" title="Tìm trên Google">
            <span>🔍</span> Google
          </a>
        </div>
      </div>
    </article>
  `).join('');

  // Bind Web Speech Audio Pronunciation Buttons
  listEl.querySelectorAll('.audio-pronounce-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const word = btn.getAttribute('data-word');
      const lang = btn.getAttribute('data-lang');
      speakPronunciation(word, lang, btn);
    });
  });

  // Bind Quick Copy Definition Buttons
  listEl.querySelectorAll('.copy-def-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const word = btn.getAttribute('data-word');
      const def = btn.getAttribute('data-def');
      const textToCopy = `${word}: ${def}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          showToast(`Đã sao chép định nghĩa "${word}"`, 'success');
        }).catch(() => {
          showToast('Không thể sao chép văn bản.', 'error');
        });
      }
    });
  });
}

function speakPronunciation(text, lang, btnEl = null) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/\s*\(.*?\)\s*/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(clean);
  if (lang === 'vi') utterance.lang = 'vi-VN';
  else if (lang === 'fr') utterance.lang = 'fr-FR';
  else if (lang === 'ja') utterance.lang = 'ja-JP';
  else utterance.lang = 'en-US';
  utterance.rate = 0.9;

  if (btnEl) {
    btnEl.classList.add('playing');
    btnEl.innerHTML = '<span>🔊</span> Đang đọc...';
    utterance.onend = () => {
      btnEl.classList.remove('playing');
      btnEl.innerHTML = '<span>🔊</span> Nghe';
    };
    utterance.onerror = () => {
      btnEl.classList.remove('playing');
      btnEl.innerHTML = '<span>🔊</span> Nghe';
    };
  }

  window.speechSynthesis.speak(utterance);
}

/* ==========================================================================
   2. COVERT SYSTEM TRIGGERS & MODAL MANAGEMENT
   ========================================================================== */

function initCovertTriggers() {
  const modal = document.getElementById('covert-modal');
  const closeBtn = document.getElementById('close-covert-btn');
  const toggleBtn = document.getElementById('covert-toggle-btn');
  const versionBadge = document.getElementById('version-badge');
  const navTabs = document.querySelectorAll('.nav-tab');

  // Trigger 1: Secret shortcut Ctrl + Shift + K -> Redirect to Vault
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
      e.preventDefault();
      redirectToVault();
    }
    // Escape closes modal if open
    if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
      closeCovertModal();
    }
  });

  // Trigger 2: Stealth invisible 3-click on dictionary book icon 📚
  const brandIcon = document.querySelector('.brand-icon');
  if (brandIcon) {
    brandIcon.addEventListener('click', () => {
      badgeClickCount++;
      if (badgeClickCount >= 3) {
        badgeClickCount = 0;
        redirectToVault();
      }
    });
  }

  // Optional legacy element hooks (guarded)
  if (toggleBtn) toggleBtn.addEventListener('click', () => redirectToVault());
  if (versionBadge) {
    versionBadge.addEventListener('click', () => {
      badgeClickCount++;
      if (badgeClickCount >= 3) {
        badgeClickCount = 0;
        redirectToVault();
      }
    });
  }

  // Close modal
  if (closeBtn) closeBtn.addEventListener('click', () => closeCovertModal());

  // Tab switching
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(tab.getAttribute('data-tab'));
      if (targetPane) targetPane.classList.add('active');
    });
  });
}

function openCovertModal(tabId = 'tab-create') {
  const modal = document.getElementById('covert-modal');
  modal.style.display = 'flex';

  const tabBtn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  if (tabBtn) tabBtn.click();
}

function closeCovertModal() {
  const modal = document.getElementById('covert-modal');
  modal.style.display = 'none';

  // Security cleanup: purge decrypted plaintext from DOM and stop countdown
  const decryptedText = document.getElementById('decrypted-plaintext');
  if (decryptedText) decryptedText.textContent = '';
  document.getElementById('decrypted-result-box').style.display = 'none';

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function toggleCovertModal() {
  const modal = document.getElementById('covert-modal');
  if (modal.style.display === 'none' || !modal.style.display) {
    openCovertModal('tab-create');
  } else {
    closeCovertModal();
  }
}

/* ==========================================================================
   3. ZERO-KNOWLEDGE EPHEMERAL DROP CREATION (TAB 1)
   ========================================================================== */

function initDropCreation() {
  const encryptBtn = document.getElementById('encrypt-drop-btn');
  const clearBtn = document.getElementById('clear-create-btn');
  const plaintextInput = document.getElementById('plaintext-input');
  const burnCheckbox = document.getElementById('burn-checkbox');
  const ttlSelect = document.getElementById('ttl-select');
  const resultBox = document.getElementById('create-result-box');
  const dropUrlInput = document.getElementById('drop-url-result');
  const copyBtn = document.getElementById('copy-drop-url-btn');

  clearBtn.addEventListener('click', () => {
    plaintextInput.value = '';
    resultBox.style.display = 'none';
  });

  encryptBtn.addEventListener('click', async () => {
    const text = plaintextInput.value;
    if (!text.trim()) {
      alert('Vui lòng nhập nội dung cần mã hóa.');
      return;
    }

    encryptBtn.disabled = true;
    encryptBtn.innerHTML = '<span>⏳</span> Đang tính toán mật mã...';

    try {
      // Step 1: Generate high-entropy AES-256-GCM symmetric key
      const key = await generateSymmetricKey();
      
      // Step 2: Encrypt plaintext payload with 12-byte IV & 128-bit GCM tag
      const encryptedPackage = await encryptPayload(text, key);
      const ciphertextBase64 = bufferToBase64Url(encryptedPackage);

      // Step 3: Export key to Base64URL for storage in URL fragment ONLY
      const keyBase64Url = await exportKeyToBase64Url(key);

      // Step 4: Send ONLY ciphertext and retention policies to RAM server
      const burn = burnCheckbox.checked;
      const ttl = parseInt(ttlSelect.value, 10);

      const response = await fetch('/api/lexicon/cache-entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ciphertext: ciphertextBase64,
          burnAfterReading: burn,
          ttl: ttl
        })
      });

      if (!response.ok) {
        throw new Error('Máy chủ từ chối lưu đệm RAM: ' + response.statusText);
      }

      const resData = await response.json();
      const dropId = resData.id;

      // Step 5: Construct Zero-Knowledge URL with Fragment Identifier (#k=...)
      const secretUrl = buildDropUrl(dropId, keyBase64Url);

      dropUrlInput.value = secretUrl;
      document.getElementById('result-burn-badge').textContent = burn ? '✓ Tự hủy: Bật (1 lần đọc)' : '✓ Tự hủy: Tắt';
      document.getElementById('result-ttl-badge').textContent = `✓ TTL: ${ttl}s`;
      resultBox.style.display = 'block';

      // Memory hygiene: clear plaintext textarea
      plaintextInput.value = '';
      wipeMemory(encryptedPackage);

    } catch (err) {
      alert('Lỗi tạo Drop: ' + err.message);
    } finally {
      encryptBtn.disabled = false;
      encryptBtn.innerHTML = '<span>🔒</span> Mã Hóa & Lưu Đệm RAM';
    }
  });

  copyBtn.addEventListener('click', async () => {
    if (dropUrlInput.value) {
      await navigator.clipboard.writeText(dropUrlInput.value);
      copyBtn.textContent = 'Đã sao chép!';
      setTimeout(() => copyBtn.textContent = 'Sao chép Link', 2000);
    }
  });
}

/* ==========================================================================
   4. MANUAL DECRYPTION & AUTOMATIC FRAGMENT HANDLER (TAB 3)
   ========================================================================== */

function initManualDecryption() {
  const decryptBtn = document.getElementById('manual-decrypt-btn');
  const dropIdInput = document.getElementById('manual-drop-id');
  const dropKeyInput = document.getElementById('manual-drop-key');
  const copyPlaintextBtn = document.getElementById('copy-plaintext-btn');
  const purgeBtn = document.getElementById('purge-now-btn');

  decryptBtn.addEventListener('click', async () => {
    const dropId = dropIdInput.value.trim();
    const key = dropKeyInput.value.trim();

    if (!dropId || !key) {
      alert('Vui lòng nhập đầy đủ Drop ID và Khóa giải mã.');
      return;
    }

    await performDecryption(dropId, key);
  });

  copyPlaintextBtn.addEventListener('click', async () => {
    const text = document.getElementById('decrypted-plaintext').textContent;
    if (text) {
      await navigator.clipboard.writeText(text);
      copyPlaintextBtn.textContent = 'Đã sao chép!';
      setTimeout(() => copyPlaintextBtn.textContent = 'Sao chép nội dung', 2000);
    }
  });

  purgeBtn.addEventListener('click', () => {
    purgeDecryptedView();
  });
}

async function performDecryption(dropId, base64UrlKey) {
  const resultBox = document.getElementById('decrypted-result-box');
  const plaintextEl = document.getElementById('decrypted-plaintext');
  const countdownEl = document.getElementById('countdown-timer');

  try {
    // 1. Fetch ciphertext package from RAM-only endpoint
    const response = await fetch(`/api/lexicon/cache-entry/${encodeURIComponent(dropId)}`);
    if (response.status === 404) {
      throw new Error('Drop không tồn tại hoặc ĐÃ TỰ HỦY (Burned-After-Reading).');
    }
    if (!response.ok) {
      throw new Error('Lỗi truy xuất máy chủ: ' + response.statusText);
    }

    const json = await response.json();
    const ciphertextBase64 = json.ciphertext;
    const encryptedBytes = base64UrlToBuffer(ciphertextBase64);

    // 2. Import raw key from URL fragment into Web Crypto API
    const cryptoKey = await importKeyFromBase64Url(base64UrlKey);

    // 3. Decrypt ciphertext payload strictly in client browser RAM
    const plaintext = await decryptPayload(encryptedBytes, cryptoKey);

    // 4. Render to DOM
    plaintextEl.textContent = plaintext;
    resultBox.style.display = 'block';

    // 5. Anti-forensics: purge secret URL fragment from browser history immediately
    purgeUrlFragment();

    // 6. Start 60-second screen self-destruction timer
    startCountdown(60);

    wipeMemory(encryptedBytes);

  } catch (err) {
    alert('Không thể giải mật: ' + err.message);
  }
}

function startCountdown(seconds) {
  if (countdownInterval) clearInterval(countdownInterval);
  let remaining = seconds;
  const timerEl = document.getElementById('countdown-timer');
  timerEl.textContent = remaining;

  countdownInterval = setInterval(() => {
    remaining--;
    timerEl.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      purgeDecryptedView();
    }
  }, 1000);
}

function purgeDecryptedView() {
  const plaintextEl = document.getElementById('decrypted-plaintext');
  if (plaintextEl) plaintextEl.textContent = '';
  document.getElementById('decrypted-result-box').style.display = 'none';
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

/**
 * Checks if the current page URL contains a Zero-Knowledge fragment payload.
 * Format: #entry?id=<dropId>&k=<keyBase64Url>
 */
async function checkUrlForSecretDrop() {
  const secret = parseDropUrlFragment();
  if (secret) {
    // Forward directly to dedicated vault page with URL fragment intact
    window.location.replace('/vault.html' + window.location.hash);
  }
}

/* ==========================================================================
   5. ANONYMOUS IN-MEMORY P2P MESSAGING (TAB 2: ECDH P-256 + HKDF)
   ========================================================================== */

function initP2PMessaging() {
  const channelInput = document.getElementById('p2p-channel-id');
  const genChannelBtn = document.getElementById('gen-p2p-channel-btn');
  const joinBtn = document.getElementById('join-p2p-btn');
  const leaveBtn = document.getElementById('leave-p2p-btn');
  const sendBtn = document.getElementById('send-p2p-btn');
  const msgInput = document.getElementById('p2p-message-input');

  genChannelBtn.addEventListener('click', () => {
    // Generate 6-word or hex channel ID
    const randomBytes = new Uint8Array(8);
    window.crypto.getRandomValues(randomBytes);
    channelInput.value = bufferToBase64Url(randomBytes).toLowerCase();
  });

  joinBtn.addEventListener('click', async () => {
    const channelId = channelInput.value.trim();
    if (!channelId) {
      alert('Vui lòng nhập hoặc sinh mã kênh.');
      return;
    }
    await startP2PSession(channelId);
  });

  leaveBtn.addEventListener('click', () => {
    terminateP2PSession();
  });

  sendBtn.addEventListener('click', async () => {
    await sendP2PMessage();
  });

  msgInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      await sendP2PMessage();
    }
  });
}

async function startP2PSession(channelId) {
  p2pActive = true;
  p2pChannelId = channelId;
  p2pSenderId = 'peer_' + Math.random().toString(36).substring(2, 10);
  p2pLastPollTime = Date.now() - 5000;

  document.getElementById('p2p-chat-area').style.display = 'flex';
  const statusEl = document.getElementById('p2p-connection-status');
  statusEl.className = 'status-indicator yellow';
  statusEl.textContent = 'Đang khởi tạo cặp khóa ECDH P-256...';

  // 1. Generate local Ephemeral ECDH P-256 keypair
  p2pKeyPair = await generateECDHKeyPair();
  p2pMyPubB64 = await exportECDHPublicKey(p2pKeyPair.publicKey);

  // 2. Broadcast local public key to ephemeral signaling buffer
  await postP2PSignal({
    type: 'KEY_EXCHANGE',
    publicKey: p2pMyPubB64
  });

  statusEl.textContent = 'Đang chờ đối tác bắt tay mật mã học...';

  // 3. Start polling for signals
  p2pPollTimer = setInterval(pollP2PSignals, 1500);
}

async function postP2PSignal(signalData) {
  try {
    await fetch('/api/lexicon/p2p-signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: p2pChannelId,
        senderId: p2pSenderId,
        signal: signalData
      })
    });
  } catch (err) {
    // Non-fatal signal error
  }
}

async function pollP2PSignals() {
  if (!p2pActive || !p2pChannelId) return;

  try {
    const url = `/api/lexicon/p2p-signal/${encodeURIComponent(p2pChannelId)}?since=${p2pLastPollTime}&senderId=${encodeURIComponent(p2pSenderId)}`;
    const res = await fetch(url);
    if (!res.ok) return;

    const data = await res.json();
    if (data.now) p2pLastPollTime = data.now;

    if (data.signals && data.signals.length) {
      for (const item of data.signals) {
        await handleIncomingSignal(item.signal);
      }
    }
  } catch (err) {
    // Ignore polling network blips
  }
}

async function handleIncomingSignal(signal) {
  const statusEl = document.getElementById('p2p-connection-status');

  if (signal.type === 'KEY_EXCHANGE' && !p2pSharedKey) {
    const peerPubB64 = signal.publicKey;
    if (peerPubB64 !== p2pMyPubB64) {
      p2pPeerPubKey = await importECDHPublicKey(peerPubB64);
      // Derive shared AES-256-GCM symmetric key via HKDF-SHA256
      p2pSharedKey = await deriveECDHSharedKey(
        p2pKeyPair.privateKey,
        p2pPeerPubKey,
        p2pChannelId,
        'p2p-in-memory-session'
      );

      statusEl.className = 'status-indicator green';
      statusEl.textContent = '✓ Kết nối an toàn (ECDH + HKDF + AES-256-GCM)';

      // Send our public key again so peer also establishes the session
      await postP2PSignal({
        type: 'KEY_EXCHANGE_ACK',
        publicKey: p2pMyPubB64
      });
    }
  } else if (signal.type === 'KEY_EXCHANGE_ACK' && !p2pSharedKey) {
    p2pPeerPubKey = await importECDHPublicKey(signal.publicKey);
    p2pSharedKey = await deriveECDHSharedKey(
      p2pKeyPair.privateKey,
      p2pPeerPubKey,
      p2pChannelId,
      'p2p-in-memory-session'
    );
    statusEl.className = 'status-indicator green';
    statusEl.textContent = '✓ Kết nối an toàn (ECDH + HKDF + AES-256-GCM)';
  } else if (signal.type === 'CHAT_MESSAGE' && p2pSharedKey) {
    const cipherPackage = base64UrlToBuffer(signal.ciphertext);
    try {
      const plaintext = await decryptPayload(cipherPackage, p2pSharedKey);
      appendChatMessage(plaintext, 'peer', signal.time);
    } catch {
      // Decryption failure
    }
  }
}

async function sendP2PMessage() {
  const msgInput = document.getElementById('p2p-message-input');
  const text = msgInput.value.trim();

  if (!text || !p2pSharedKey) return;

  const encryptedBytes = await encryptPayload(text, p2pSharedKey);
  const cipherB64 = bufferToBase64Url(encryptedBytes);

  const nowStr = new Date().toLocaleTimeString();

  await postP2PSignal({
    type: 'CHAT_MESSAGE',
    ciphertext: cipherB64,
    time: nowStr
  });

  appendChatMessage(text, 'mine', nowStr);
  msgInput.value = '';
}

function appendChatMessage(text, sender, time) {
  const historyEl = document.getElementById('p2p-message-history');
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${sender}`;
  msgDiv.innerHTML = `
    <div>${escapeHtml(text)}</div>
    <span class="meta">${escapeHtml(time)} • Encrypted in RAM</span>
  `;
  historyEl.appendChild(msgDiv);
  historyEl.scrollTop = historyEl.scrollHeight;
}

function terminateP2PSession() {
  p2pActive = false;
  if (p2pPollTimer) clearInterval(p2pPollTimer);

  // Overwrite in-memory keys
  p2pKeyPair = null;
  p2pPeerPubKey = null;
  p2pSharedKey = null;

  document.getElementById('p2p-message-history').innerHTML = '';
  document.getElementById('p2p-chat-area').style.display = 'none';
  document.getElementById('p2p-connection-status').textContent = 'Đã hủy phiên';
}
