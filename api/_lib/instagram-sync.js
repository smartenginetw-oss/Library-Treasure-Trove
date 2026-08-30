import { createServiceClient } from './supabase.js';

const GRAPH_HOST = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v25.0';
const MEDIA_LIMIT = 10;

function config() {
  const accessToken = String(process.env.INSTAGRAM_ACCESS_TOKEN || '').trim();
  const businessAccountId = String(process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '').trim();
  if (!accessToken || !businessAccountId) {
    throw Object.assign(new Error('尚未設定 Instagram API 憑證（INSTAGRAM_ACCESS_TOKEN、INSTAGRAM_BUSINESS_ACCOUNT_ID）'), { code: 'INSTAGRAM_NOT_CONFIGURED', status: 503 });
  }
  return {
    accessToken,
    businessAccountId,
    apiVersion: String(process.env.INSTAGRAM_API_VERSION || DEFAULT_API_VERSION).trim(),
    graphHost: String(process.env.INSTAGRAM_GRAPH_HOST || GRAPH_HOST).replace(/\/$/, '')
  };
}

function username(value) {
  const normalized = String(value || '').trim().replace(/^@/, '');
  return /^[a-zA-Z0-9._]{1,30}$/.test(normalized) ? normalized : '';
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : null;
}

function freshness(timestamp) {
  const time = new Date(timestamp || 0).getTime();
  if (!Number.isFinite(time) || !time) return 50;
  const days = Math.max(0, (Date.now() - time) / 86400000);
  return Math.max(0, Math.min(100, Math.round(100 - days * 4)));
}

function titleFrom(media, displayName, handle) {
  const firstLine = String(media.caption || '').split(/\r?\n/).map(line => line.trim()).find(Boolean);
  return (firstLine || `${displayName || handle}｜Instagram ${media.media_type === 'VIDEO' ? '短影音' : '貼文'}`).slice(0, 300);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      const message = payload.error?.message || `Instagram API 回應 ${response.status}`;
      throw Object.assign(new Error(message), { code: 'INSTAGRAM_API_ERROR', status: 502 });
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCreator(source, options) {
  const handle = username(source.username);
  if (!handle) throw Object.assign(new Error(`監測帳號格式無效：${source.username || '空白'}`), { code: 'INSTAGRAM_USERNAME_INVALID', status: 422 });
  const fields = `business_discovery.username(${handle}){username,name,followers_count,media.limit(${MEDIA_LIMIT}){id,caption,media_type,permalink,timestamp,like_count,comments_count,view_count,thumbnail_url}}`;
  const params = new URLSearchParams({ fields, access_token: options.accessToken });
  const endpoint = `${options.graphHost}/${options.apiVersion}/${encodeURIComponent(options.businessAccountId)}?${params}`;
  const payload = await fetchJson(endpoint);
  const account = payload.business_discovery;
  if (!account) throw Object.assign(new Error(`找不到 Instagram 專業帳號：@${handle}`), { code: 'INSTAGRAM_CREATOR_NOT_FOUND', status: 404 });
  return { handle, account, media: Array.isArray(account.media?.data) ? account.media.data : [] };
}

function buildRow(source, creator, media, existing, syncedAt) {
  const permalink = String(media.permalink || '').trim() || existing?.source_url || `https://www.instagram.com/p/${media.id}/`;
  const mediaId = String(media.id || '').trim();
  const views = numberOrNull(media.view_count) ?? existing?.views ?? null;
  const likes = numberOrNull(media.like_count) ?? existing?.likes ?? null;
  const comments = numberOrNull(media.comments_count) ?? existing?.comments ?? null;
  return {
    id: existing?.id || `ig_${mediaId}`,
    title: titleFrom(media, creator.account.name, creator.handle),
    creator_name: String(creator.account.name || source.display_name || creator.handle).slice(0, 160),
    creator_handle: `@${creator.handle}`,
    platform: 'Instagram',
    niche: String(source.niche || existing?.niche || 'Creator').slice(0, 120),
    followers: numberOrNull(creator.account.followers_count) ?? existing?.followers ?? null,
    views,
    likes,
    comments,
    duration_seconds: existing?.duration_seconds ?? null,
    reposts: existing?.reposts ?? null,
    shares: existing?.shares ?? null,
    velocity: existing?.velocity ?? 60,
    freshness: freshness(media.timestamp),
    repeated_format: existing?.repeated_format ?? 60,
    traffic_codes: existing?.traffic_codes || [],
    hook_type: existing?.hook_type || '',
    cover_type: existing?.cover_type || '',
    format: media.media_type === 'VIDEO' ? 'Reels' : 'Instagram 貼文',
    summary: String(media.caption || existing?.summary || '').slice(0, 3000),
    comments_sample: existing?.comments_sample || '',
    source_url: permalink,
    archived: existing?.archived ?? false,
    created_by: existing?.created_by ?? null,
    instagram_media_id: mediaId || existing?.instagram_media_id || null,
    instagram_source_id: source.id,
    published_at: media.timestamp || existing?.published_at || null,
    last_synced_at: syncedAt,
    sync_source: 'instagram_api'
  };
}

async function updateSource(client, source, values) {
  const result = await client.from('instagram_monitored_creators').update(values).eq('id', source.id);
  if (result.error) console.error('Instagram source status update failed', source.username, result.error.message);
}

export async function syncInstagramCreators({ trigger = 'cron' } = {}) {
  const options = config();
  const client = createServiceClient();
  const sourceResult = await client.from('instagram_monitored_creators').select('*').eq('enabled', true).order('created_at', { ascending: true });
  if (sourceResult.error) throw Object.assign(new Error('Instagram 監測來源讀取失敗'), { code: 'INSTAGRAM_SOURCE_READ_ERROR', status: 502 });
  const sources = sourceResult.data || [];
  if (!sources.length) return { ok: true, trigger, sources: 0, imported: 0, errors: [] };

  const existingResult = await client.from('viral_contents').select('*').eq('platform', 'Instagram');
  if (existingResult.error) throw Object.assign(new Error('既有 Instagram 案例讀取失敗'), { code: 'INSTAGRAM_CASE_READ_ERROR', status: 502 });
  const existingByMedia = new Map((existingResult.data || []).filter(row => row.instagram_media_id).map(row => [row.instagram_media_id, row]));
  const existingByUrl = new Map((existingResult.data || []).filter(row => row.source_url).map(row => [row.source_url, row]));
  const syncedAt = new Date().toISOString();
  const errors = [];
  let imported = 0;

  for (const source of sources) {
    try {
      const creator = await fetchCreator(source, options);
      const rows = creator.media.map(media => {
        const permalink = String(media.permalink || '').trim();
        const existing = existingByMedia.get(String(media.id || '')) || existingByUrl.get(permalink);
        return buildRow(source, creator, media, existing, syncedAt);
      }).filter(row => row.instagram_media_id);
      if (rows.length) {
        const result = await client.from('viral_contents').upsert(rows);
        if (result.error) throw Object.assign(new Error('Instagram 案例寫入失敗'), { code: 'INSTAGRAM_CASE_WRITE_ERROR', status: 502 });
        imported += rows.length;
      }
      await updateSource(client, source, { remote_user_id: String(creator.account.id || ''), last_synced_at: syncedAt, last_sync_status: 'SUCCESS', last_sync_error: '' });
    } catch (error) {
      const message = String(error.message || '未知錯誤').slice(0, 500);
      errors.push({ username: source.username, code: error.code || 'INSTAGRAM_SYNC_ERROR', message });
      await updateSource(client, source, { last_synced_at: syncedAt, last_sync_status: 'ERROR', last_sync_error: message });
    }
  }
  return { ok: errors.length === 0, trigger, sources: sources.length, imported, errors, syncedAt };
}
