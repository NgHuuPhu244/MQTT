/**
 * @file decoy-dictionary.js
 * @description Decoy lexical data provider and offline fallback for "Từ Điển Đa Ngôn Ngữ".
 */

export const LOCAL_LEXICON = [
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
    lang: "tech",
    phonetic: "/ˈzɪərəʊ ˈnɒlɪdʒ/",
    pos: "Thuật ngữ Kỹ thuật",
    definition: "Nguyên lý kiến trúc trong đó một bên chứng minh với bên khác rằng một mệnh đề là đúng mà không tiết lộ bất kỳ thông tin nào ngoài tính đúng đắn của mệnh đề.",
    translations: { vi: "Không tiết lộ tri thức", fr: "Preuve à divulgation nulle", ja: "ゼロ知識証明" },
    examples: ["Zero-knowledge architecture guarantees that server operators cannot access customer plaintext data."]
  },
  {
    word: "Ephemeral (Tạm thời)",
    lang: "tech",
    phonetic: "/ɪˈfem.ər.əl/",
    pos: "Tính từ",
    definition: "Đặc tính chỉ tồn tại trong thời gian ngắn ngủi, biến mất hoàn toàn và không để lại dấu vết vĩnh viễn trên bất kỳ phương tiện lưu trữ nào.",
    translations: { vi: "Tính chất tạm thời", fr: "Éphémère", ja: "一時的な / 儚い" },
    examples: ["In-memory ephemeral buffers prevent data recovery from post-mortem disk forensics."]
  },
  {
    word: "Bộ nhớ khả biến (RAM)",
    lang: "vi",
    phonetic: "/ɓo˧˨ ɲəː˧˦ xaː˧˩ ɓiən˧˦/",
    pos: "Danh từ",
    definition: "Bộ nhớ truy cập ngẫu nhiên của máy tính, mất toàn bộ dữ liệu ngay khi ngắt nguồn điện hoặc bị ghi đè (zeroed).",
    translations: { en: "RAM (Random Access Memory)", fr: "Mémoire vive", ja: "主記憶装置" },
    examples: ["Dữ liệu ciphertext chỉ được lưu trên RAM và bị thu hồi ngay lập tức sau khi đọc."]
  },
  {
    word: "Diffie-Hellman",
    lang: "tech",
    phonetic: "/ˈdɪfi ˈhɛlmən/",
    pos: "Giao thức",
    definition: "Giao thức trao đổi khóa mật mã học cho phép hai thực thể thiết lập một khóa bí mật chung qua kênh truyền thông không tin cậy.",
    translations: { vi: "Trao đổi khóa Diffie-Hellman", fr: "Échange de clés Diffie-Hellman", ja: "ディフィー・ヘルマン鍵共有" },
    examples: ["ECDH P-256 kết hợp cùng HKDF-SHA256 cung cấp khả năng bảo mật chuyển tiếp hoàn hảo (Perfect Forward Secrecy)."]
  },
  {
    word: "Steganography (Ẩn mã)",
    lang: "tech",
    phonetic: "/ˌstɛɡ.əˈnɒɡ.rə.fi/",
    pos: "Danh từ",
    definition: "Kỹ thuật che giấu một thông điệp bí mật bên trong một phương tiện truyền tin vô hại, khiến kẻ quan sát không phát hiện được sự tồn tại của thông điệp.",
    translations: { vi: "Thuật ẩn mã / Kỹ thuật ngụy trang", fr: "Stéganographie", ja: "ステガノグラフィー" },
    examples: ["Giao diện từ điển đóng vai trò là một lớp ngụy trang hoàn hảo cho hệ thống tin nhắn tự hủy."]
  },
  {
    word: "Entropie",
    lang: "fr",
    phonetic: "/ɑ̃.tʁɔ.pi/",
    pos: "Danh từ",
    definition: "Thước đo độ hỗn loạn và tính ngẫu nhiên của một hệ thống, yếu tố then chốt tạo nên khóa mật mã an toàn.",
    translations: { vi: "Entropy", en: "Entropy", ja: "エントロピー" },
    examples: ["Une entropie élevée est indispensable pour la génération de clés cryptographiques."]
  },
  {
    word: "プライバシー (Privacy)",
    lang: "ja",
    phonetic: "/pu-ra-i-ba-sī/",
    pos: "Danh từ",
    definition: "Quyền riêng tư cá nhân và quyền bảo vệ thông tin mật không bị xâm phạm.",
    translations: { vi: "Quyền riêng tư", en: "Privacy", fr: "Vie privée" },
    examples: ["個人のプライバシー保護は基本的人権の一部である。"]
  }
];

export async function fetchDictionaryEntries(query = '', lang = 'all') {
  try {
    const url = `/api/lexicon/query?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(lang)}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      return data.data || [];
    }
  } catch (err) {
    // Fallback to local lexicon if network fails
  }

  // Local filter
  let results = LOCAL_LEXICON;
  if (lang !== 'all') {
    results = results.filter(item => item.lang === lang);
  }
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(item => 
      item.word.toLowerCase().includes(q) ||
      item.definition.toLowerCase().includes(q) ||
      Object.values(item.translations).some(t => t.toLowerCase().includes(q))
    );
  }
  return results;
}

/**
 * External Search Engine Link Generators (Wikipedia, Wiktionary, Google, DuckDuckGo)
 */
export function getWikipediaUrl(word, lang = 'vi') {
  const cleanWord = word.replace(/\s*\(.*?\)\s*/g, '').trim();
  const domain = lang === 'en' ? 'en.wikipedia.org' : 'vi.wikipedia.org';
  return `https://${domain}/wiki/${encodeURIComponent(cleanWord)}`;
}

export function getWiktionaryUrl(word, lang = 'vi') {
  const cleanWord = word.replace(/\s*\(.*?\)\s*/g, '').trim();
  const domain = lang === 'en' ? 'en.wiktionary.org' : 'vi.wiktionary.org';
  return `https://${domain}/wiki/${encodeURIComponent(cleanWord)}`;
}

export function getGoogleSearchUrl(word) {
  return `https://www.google.com/search?q=${encodeURIComponent(word)}`;
}

export function getDuckDuckGoUrl(word) {
  return `https://duckduckgo.com/?q=${encodeURIComponent(word)}`;
}

/**
 * Fetches Live Wikipedia Summary via our server proxy or Wikipedia REST API
 */
export async function fetchLiveWikipedia(term, lang = 'vi') {
  if (!term || !term.trim()) return null;
  const cleanTerm = term.replace(/^[:/]+/, '').replace(/\s*\(.*?\)\s*/g, '').trim();
  if (!cleanTerm) return null;

  try {
    const res = await fetch(`/api/lexicon/wiki-summary?q=${encodeURIComponent(cleanTerm)}&lang=${encodeURIComponent(lang)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success') {
        return data;
      }
    }
  } catch {
    // Fallback to direct fetch
    try {
      const directDomain = lang === 'en' ? 'en.wikipedia.org' : 'vi.wikipedia.org';
      const directRes = await fetch(`https://${directDomain}/api/rest_v1/page/summary/${encodeURIComponent(cleanTerm)}`);
      if (directRes.ok) {
        const d = await directRes.json();
        return {
          title: d.title,
          extract: d.extract,
          description: d.description,
          thumbnail: d.thumbnail ? d.thumbnail.source : null,
          articleUrl: d.content_urls ? d.content_urls.desktop.page : `https://${directDomain}/wiki/${encodeURIComponent(cleanTerm)}`,
          lang
        };
      }
    } catch {
      // Offline fallback
    }
  }
  return null;
}


/**
 * Fetches Real-time Wikipedia OpenSearch suggestions for Omnibox dropdown
 */
export async function fetchWikipediaSuggestions(term, lang = 'vi') {
  if (!term || !term.trim()) return [];
  const cleanTerm = term.replace(/^[:/]+/, '').trim();
  if (cleanTerm.length < 2) return [];

  try {
    const res = await fetch(`/api/lexicon/opensearch?q=${encodeURIComponent(cleanTerm)}&lang=${encodeURIComponent(lang)}`);
    if (res.ok) {
      const data = await res.json();
      return data.suggestions || [];
    }
  } catch {
    // Direct OpenSearch fallback
    try {
      const domain = lang === 'en' ? 'en.wikipedia.org' : 'vi.wikipedia.org';
      const res = await fetch(`https://${domain}/w/api.php?action=opensearch&format=json&origin=*&search=${encodeURIComponent(cleanTerm)}&limit=6`);
      if (res.ok) {
        const raw = await res.json();
        const titles = raw[1] || [];
        const urls = raw[3] || [];
        return titles.map((title, i) => ({
          title,
          url: urls[i] || `https://${domain}/wiki/${encodeURIComponent(title)}`,
          lang
        }));
      }
    } catch {
      // offline
    }
  }
  return [];
}
