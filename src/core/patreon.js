const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { ARCHIVE_EXTS } = require('./installer');

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractPostId(url) {
  const m = /\/posts\/(?:[^/?#]*-)?(\d{6,})(?:[/?#]|$)/i.exec(url || '');
  return m ? m[1] : null;
}

function normalizePatreonUrl(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)patreon\.com$/i.test(u.hostname)) return url;
    const m = u.pathname.match(/^\/[^/]+\/(posts\/[^/]+-\d+)\/?$/);
    if (m) {
      u.pathname = `/${m[1]}`;
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

async function fetchPostBootstrap(postId, cookie, userAgent, fetchImpl = fetch) {
  const params = new URLSearchParams({
    'fields[post]': 'content_json_string,embed,image,post_file,post_metadata,published_at,title,url,attachments_preview_metadata',
    'fields[post_tag]': 'tag_type,value',
    'fields[media]': 'id,image_urls,display,download_url,metadata,file_name',
    'fields[attachment]': 'name,url,mimetype,size_bytes',
    include: 'attachments,attachments_media,images,audio,media,campaign,user',
    'json-api-version': '1.0',
  });
  const res = await fetchImpl(`https://www.patreon.com/api/posts/${postId}?${params}`, {
    headers: { Cookie: cookie, 'User-Agent': userAgent || DEFAULT_UA, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Patreon responded with HTTP ${res.status}. Make sure you're still logged in and can actually see this post in your browser.`);
  }
  return res.json();
}

function getMediaDownloadCandidates(attrs = {}) {
  const candidates = [
    attrs.download_url,
    attrs.metadata && attrs.metadata.download_url,
    attrs.display && attrs.display.url,
    attrs.image_urls && attrs.image_urls.original,
    attrs.image_urls && attrs.image_urls.default_large,
    attrs.image_urls && attrs.image_urls.url,
    attrs.image_urls && attrs.image_urls.default,
  ];
  const seen = new Set();
  return candidates.filter((v) => {
    if (typeof v !== 'string' || !v || seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}

function makeUniqueFilename(filename, seenFiles, id) {
  if (!seenFiles.has(filename)) {
    seenFiles.add(filename);
    return filename;
  }
  const suffix = id || Math.floor(Math.random() * 1e9);
  const dot = filename.lastIndexOf('.');
  const unique = dot > 0 ? `${filename.slice(0, dot)}-${suffix}${filename.slice(dot)}` : `${filename}-${suffix}`;
  seenFiles.add(unique);
  return unique;
}

const ATTACHMENT_TYPES = new Set(['attachment', 'attachments']);
const MEDIA_TYPES = new Set(['media']);

function extractDownloadables(bootstrap) {
  const included = (bootstrap && bootstrap.included) || [];
  const seenFiles = new Set();

  return included
    .filter((o) => MEDIA_TYPES.has(o.type) || ATTACHMENT_TYPES.has(o.type))
    .map((o) => {
      const attrs = o.attributes || {};
      let filename = null;
      let url = null;
      let fallbackUrls = [];

      if (MEDIA_TYPES.has(o.type)) {
        filename = attrs.file_name;
        const candidates = getMediaDownloadCandidates(attrs);
        url = candidates[0] || null;
        fallbackUrls = candidates.slice(1);
      } else {
        filename = attrs.name || attrs.file_name;
        url = attrs.url || attrs.download_url;
      }

      if (!filename && url) {
        try { filename = new URL(url).pathname.split('/').pop() || `${o.id}.jpg`; }
        catch { filename = `${o.id}.jpg`; }
      }
      if (!url) return null;

      filename = makeUniqueFilename(filename || `${o.id}`, seenFiles, o.id);
      return { filename, url, fallbackUrls };
    })
    .filter(Boolean);
}

function extractFileEndpointLinks(bootstrap, postId) {
  const data = (bootstrap && bootstrap.data) || {};
  const rels = data.relationships || {};
  const included = (bootstrap && bootstrap.included) || [];
  const previewMeta = (data.attributes && data.attributes.attachments_preview_metadata) || [];
  const ids = [];
  for (const name of ['attachments_media', 'attachments', 'media']) {
    const d = rels[name] && rels[name].data;
    for (const ref of Array.isArray(d) ? d : (d ? [d] : [])) {
      if (ref && ref.id && !ids.includes(String(ref.id))) ids.push(String(ref.id));
    }
  }
  for (const o of included) {
    if ((MEDIA_TYPES.has(o.type) || ATTACHMENT_TYPES.has(o.type)) && o.id && !ids.includes(String(o.id))) ids.push(String(o.id));
  }
  const postFile = data.attributes && data.attributes.post_file;
  const postFileUrl = postFile && typeof postFile.url === 'string' ? postFile.url : null;
  const seenFiles = new Set();
  return ids.map((id, i) => {
    const obj = included.find((o) => String(o.id) === id && (MEDIA_TYPES.has(o.type) || ATTACHMENT_TYPES.has(o.type)));
    const attrs = (obj && obj.attributes) || {};
    const filename = attrs.file_name || attrs.name || (previewMeta[i] && previewMeta[i].file_name) || `patreon-${id}`;
    const fallbackUrls = [`https://www.patreon.com/file?h=${postId}&i=${id}`];
    if (postFileUrl && (ids.length === 1 || (postFile.name && postFile.name === filename))) fallbackUrls.unshift(postFileUrl);
    return {
      filename: makeUniqueFilename(filename, seenFiles, id),
      url: `https://www.patreon.com/file?h=${postId}&m=${id}`,
      fallbackUrls,
    };
  });
}

function describeIncludedTypes(bootstrap) {
  const included = (bootstrap && bootstrap.included) || [];
  const includedSummary = included.length
    ? [...included.reduce((m, o) => m.set(o.type, (m.get(o.type) || 0) + 1), new Map())]
      .map(([type, n]) => `${type} (${n})`).join(', ')
    : 'nothing';

  const rels = (bootstrap && bootstrap.data && bootstrap.data.relationships) || {};
  const relSummary = Object.entries(rels)
    .map(([name, rel]) => {
      const data = rel && rel.data;
      const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
      return `${name} (${count})`;
    })
    .join(', ') || 'none listed';

  return `Patreon included: ${includedSummary} \u2014 but none of those look like a downloadable file. `
    + `This post's own relationships: ${relSummary}.`;
}

function describeSkippedCandidates(bootstrap) {
  const included = (bootstrap && bootstrap.included) || [];
  const candidates = included.filter((o) => MEDIA_TYPES.has(o.type) || ATTACHMENT_TYPES.has(o.type));
  if (!candidates.length) return null;
  const describe = (v) => {
    const s = JSON.stringify(v);
    return s && s.length > 150 ? `${s.slice(0, 150)}\u2026` : s;
  };
  return candidates
    .map((o) => {
      const attrs = o.attributes || {};
      const fields = Object.keys(attrs).map((k) => `${k}=${describe(attrs[k])}`).join(', ') || '(no attributes at all)';
      return `${o.type}#${o.id}: {${fields}}`;
    })
    .join(' | ');
}

function describePost(bootstrap) {
  const attrs = bootstrap && bootstrap.data && bootstrap.data.attributes;
  return (attrs && attrs.title) || 'this post';
}

async function downloadToFile(url, destPath, cookie, userAgent, fetchImpl = fetch, referer, useSession = false) {
  const isPatreon = /^https:\/\/([a-z0-9-]+\.)*patreon\.com\//i.test(url);
  const headers = { 'User-Agent': userAgent || DEFAULT_UA, Accept: '*/*' };
  if (isPatreon) {
    if (!useSession) headers.Cookie = cookie;
    if (referer) headers.Referer = referer;
  }
  const res = await fetchImpl(url, useSession ? { headers, credentials: 'include' } : { headers });
  if (!res.ok || !res.body) {
    const h = (res.headers && res.headers.get && ((n) => res.headers.get(n))) || (() => null);
    const extra = [h('cf-mitigated') && `cf-mitigated: ${h('cf-mitigated')}`, h('server') && `server: ${h('server')}`]
      .filter(Boolean).join(', ');
    throw new Error(`HTTP ${res.status}${extra ? ` (${extra})` : ''} from ${new URL(url).host}`);
  }
  const type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
  if (/text\/html/i.test(type)) throw new Error('Patreon returned a web page instead of the file (session expired or no access?)');
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destPath));
}

async function runPatreonDownload({
  url,
  cookie,
  outDir,
  userAgent,
  onLog = () => {},
  signal,
  fetchImpl = fetch,
  downloadFetchImpl,
  browserDownloadImpl,
}) {
  const postId = extractPostId(url);
  if (!postId) {
    throw new Error('That doesn\'t look like a link to a specific Patreon post. Paste a link like https://www.patreon.com/creator/posts/some-title-123456.');
  }

  onLog(`Looking up post #${postId}...`);
  const bootstrap = await fetchPostBootstrap(postId, cookie, userAgent, fetchImpl);
  if (signal && signal.aborted) throw new Error('Cancelled');

  if (!bootstrap || !bootstrap.data || !bootstrap.data.attributes) {
    throw new Error('Patreon didn\'t return any post data for that link. Make sure you can view this exact post in your browser while logged in.');
  }

  onLog(`Found: ${describePost(bootstrap)}`);
  let files = extractDownloadables(bootstrap);
  if (!files.length) {
    files = extractFileEndpointLinks(bootstrap, postId);
    if (files.length) onLog('Patreon hid the direct file URLs, using the post\'s file endpoint instead.');
  }
  if (!files.length) {
    const skipped = describeSkippedCandidates(bootstrap);
    onLog(
      `No downloadable files found in this post. ${describeIncludedTypes(bootstrap)}`
      + (skipped ? ` Closest candidate(s), with every attribute Patreon actually sent: ${skipped}` : ''),
    );
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  let done = 0;
  for (const file of files) {
    if (signal && signal.aborted) throw new Error('Cancelled');
    done += 1;
    onLog(`Downloading ${file.filename} (${done}/${files.length})...`);
    const dest = path.join(outDir, file.filename);
    const candidateUrls = [file.url, ...file.fallbackUrls];
    let lastErr = null;
    let ok = false;
    for (const candidateUrl of candidateUrls) {
      try {
        await downloadToFile(candidateUrl, dest, cookie, userAgent, downloadFetchImpl || fetchImpl, `https://www.patreon.com/posts/${postId}`, !!downloadFetchImpl);
        ok = true;
        break;
      } catch (e) {
        lastErr = e;
        if (browserDownloadImpl && /^https:\/\/([a-z0-9-]+\.)*patreon\.com\//i.test(candidateUrl)) {
          try {
            onLog('Direct request was blocked, retrying through a browser window...');
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            await browserDownloadImpl(candidateUrl, dest, { referer: `https://www.patreon.com/posts/${postId}`, userAgent });
            ok = true;
            break;
          } catch (e2) {
            lastErr = e2;
          }
        }
      }
    }
    if (!ok) onLog(`Failed to download ${file.filename}: ${lastErr ? lastErr.message : 'unknown error'}`);
    else onLog(`Saved ${file.filename}`);
  }
  onLog('Done.');
}

function listArchives(dir) {
  const found = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) found.push(...listArchives(p));
    else if (ARCHIVE_EXTS.has(path.extname(e.name).toLowerCase())) found.push(p);
  }
  return found;
}

const isPatreonDomain = (d) => !!d && (d === 'patreon.com' || d.endsWith('.patreon.com'));
function patreonCookies(cookies) { return cookies.filter((c) => isPatreonDomain(c.domain)); }
function buildCookieHeader(cookies) { return patreonCookies(cookies).map((c) => `${c.name}=${c.value}`).join('; '); }
function hasPatreonSession(cookies) { return patreonCookies(cookies).some((c) => c.name === 'session_id' && c.value); }

function looksLoggedIn(cookieHeader) {
  const m = /(?:^|;\s*)session_id=([^;]+)/.exec(cookieHeader || '');
  return !!(m && m[1]);
}

module.exports = {
  runPatreonDownload,
  listArchives,
  buildCookieHeader,
  hasPatreonSession,
  looksLoggedIn,
  normalizePatreonUrl,
  extractPostId,
  extractDownloadables,
  extractFileEndpointLinks,
  getMediaDownloadCandidates,
  describeIncludedTypes,
  describeSkippedCandidates,
};
