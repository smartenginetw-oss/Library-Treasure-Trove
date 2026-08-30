const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);
const PATH_PREFIXES = ['/p/', '/reel/', '/reels/', '/tv/'];
const MAX_NUMBER = 9_000_000_000_000_000;

export const MANUAL_IMPORT_FIELDS = [
  'id', 'source_url', 'platform', 'creator_name', 'creator_handle', 'title', 'niche',
  'duration_seconds', 'followers', 'views', 'likes', 'comments', 'reposts', 'shares',
  'summary', 'comments_sample', 'import_notes', 'instagram_media_id', 'connection_id',
  'published_at', 'last_synced_at', 'created_at', 'updated_at'
].join(',');

export function normalizeInstagramUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 2048) throw Object.assign(new Error('請貼上有效的 Instagram 貼文或 Reel 網址'), { code: 'IMPORT_URL_INVALID', status: 422 });
  let parsed;
  try { parsed = new URL(raw); } catch {
    throw Object.assign(new Error('Instagram 網址格式無效'), { code: 'IMPORT_URL_INVALID', status: 422 });
  }
  if (parsed.protocol !== 'https:' || !INSTAGRAM_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw Object.assign(new Error('只接受 https://instagram.com 的公開網址'), { code: 'IMPORT_URL_INVALID', status: 422 });
  }
  const path = parsed.pathname.replace(/\/+/g, '/');
  if (!PATH_PREFIXES.some(prefix => path.toLowerCase().startsWith(prefix))) {
    throw Object.assign(new Error('請貼上 Instagram 貼文、Reel 或影片網址（/p/、/reel/、/tv/）'), { code: 'IMPORT_URL_INVALID', status: 422 });
  }
  parsed.pathname = path.replace(/\/+$/, '');
  parsed.hash = '';
  // Tracking query parameters do not identify a different piece of content.
  parsed.search = '';
  return parsed.toString();
}

function text(value, max = 3000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function integerOrNull(value, max = MAX_NUMBER) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) throw Object.assign(new Error('數字欄位必須是非負整數'), { code: 'IMPORT_NUMBER_INVALID', status: 422 });
  return Math.round(number);
}

export function manualImportRow(input = {}, userId) {
  if (!userId) throw Object.assign(new Error('需要登入後才能匯入內容'), { code: 'AUTH_REQUIRED', status: 401 });
  const sourceUrl = normalizeInstagramUrl(input.sourceUrl ?? input.source_url);
  const creatorHandle = text(input.creatorHandle ?? input.creator_handle, 80);
  return {
    user_id: String(userId),
    source_url: sourceUrl,
    platform: 'Instagram',
    creator_name: text(input.creatorName ?? input.creator_name, 160),
    creator_handle: creatorHandle,
    title: text(input.title, 300),
    niche: text(input.niche, 120),
    duration_seconds: integerOrNull(input.durationSeconds ?? input.duration_seconds, 86400),
    followers: integerOrNull(input.followers),
    views: integerOrNull(input.views),
    likes: integerOrNull(input.likes),
    comments: integerOrNull(input.comments),
    reposts: integerOrNull(input.reposts),
    shares: integerOrNull(input.shares),
    summary: text(input.summary, 5000),
    comments_sample: text(input.commentsSample ?? input.comments_sample, 5000),
    import_notes: text(input.importNotes ?? input.import_notes, 5000)
  };
}
