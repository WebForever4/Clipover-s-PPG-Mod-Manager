
const BASE = 'https://top-mods.com';

class TopModsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TopModsError';
  }
}

const LISTS = {
  newest: (category) => `/mods/${category}`,
  downloaded: (category) => `/mods-downloaded/${category}`,
  rated: (category) => `/mods-rated/${category}`,
  commented: (category) => `/mods-comments/${category}`,
};

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const MOD_HREF = '[^"]*\\/mods?\\/[^"]+\\.html';

function parseModCards(html, baseUrl) {
  const byUrl = new Map();
  const toAbsolute = (href) => (href.startsWith('http') ? href : baseUrl + (href.startsWith('/') ? href : `/${href}`));
  const addCard = (hrefRaw, titleRaw, thumbRaw) => {
    const title = decodeEntities((titleRaw || '').trim());
    if (!title || !hrefRaw) return;
    const url = toAbsolute(hrefRaw);
    const existing = byUrl.get(url);
    if (!existing) {
      byUrl.set(url, { url, title, thumbnail: thumbRaw || null });
    } else {
      if (!existing.thumbnail && thumbRaw) existing.thumbnail = thumbRaw;
      if (title.length > existing.title.length) existing.title = title;
    }
  };

  const withTitleAttr = new RegExp(`<a\\s+[^>]*href="(${MOD_HREF})"[^>]*title="([^"]*)"[^>]*>(\\s*<img[^>]*src="([^"]+)")?`, 'gi');
  let m;
  while ((m = withTitleAttr.exec(html))) addCard(m[1], m[2], m[4]);
  if (byUrl.size) return [...byUrl.values()];

  const titleBeforeHref = new RegExp(`<a\\s+[^>]*title="([^"]*)"[^>]*href="(${MOD_HREF})"[^>]*>(\\s*<img[^>]*src="([^"]+)")?`, 'gi');
  while ((m = titleBeforeHref.exec(html))) addCard(m[2], m[1], m[4]);
  if (byUrl.size) return [...byUrl.values()];

  const block = new RegExp(`<a\\s+[^>]*href="(${MOD_HREF})"[^>]*>([\\s\\S]*?)<\\/a>`, 'gi');
  while ((m = block.exec(html))) {
    const [, hrefRaw, inner] = m;
    const imgSrcAlt = /<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"/i.exec(inner);
    const imgAltSrc = /<img[^>]*alt="([^"]*)"[^>]*src="([^"]+)"/i.exec(inner);
    const thumb = (imgSrcAlt && imgSrcAlt[1]) || (imgAltSrc && imgAltSrc[2]) || null;
    const altTitle = (imgSrcAlt && imgSrcAlt[2]) || (imgAltSrc && imgAltSrc[1]) || '';
    const heading = /<(?:h[1-6]|span|div|p)[^>]*>\s*([^<]+?)\s*<\/(?:h[1-6]|span|div|p)>/i.exec(inner);
    const textOnly = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const title = (heading && heading[1]) || altTitle || textOnly;
    addCard(hrefRaw, title, thumb);
  }
  return [...byUrl.values()];
}

class TopModsClient {
  constructor({ fetchImpl, baseUrl = BASE } = {}) {
    this.fetch = fetchImpl || globalThis.fetch;
    this.baseUrl = baseUrl;
  }

  async list(kind, { category = 'people-playground' } = {}) {
    const makePath = LISTS[kind];
    if (!makePath) throw new TopModsError(`Unknown top-mods.com list "${kind}".`);
    const url = this.baseUrl + makePath(category);
    let res;
    try {
      res = await this.fetch(url);
    } catch (e) {
      throw new TopModsError(`Could not reach top-mods.com: ${e.message}`);
    }
    if (!res.ok) throw new TopModsError(`top-mods.com returned HTTP ${res.status}`);
    const html = await res.text();
    const mods = parseModCards(html, this.baseUrl);
    if (!mods.length) {
      throw new TopModsError(
        `Found the page at ${url} but no mod links on it \u2014 top-mods.com has likely changed its `
        + 'markup again since this parser was last updated against a real page.',
      );
    }
    return mods;
  }
}

module.exports = { TopModsClient, TopModsError, LISTS, parseModCards };
