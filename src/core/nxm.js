function parseNxm(link) {
  let u;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  if (u.protocol !== 'nxm:') return null;
  const m = u.pathname.match(/^\/mods\/(\d+)\/files\/(\d+)\/?$/);
  if (!m) return null;
  const num = (v) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  return {
    game: u.hostname.toLowerCase(),
    modId: Number(m[1]),
    fileId: Number(m[2]),
    key: u.searchParams.get('key') || undefined,
    expires: num(u.searchParams.get('expires')),
    userId: num(u.searchParams.get('user_id')),
  };
}

module.exports = { parseNxm };
