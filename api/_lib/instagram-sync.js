import { createServiceClient } from './supabase.js';

const GRAPH_HOST = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v25.0';
const DEFAULT_MEDIA_PAGE_SIZE = 50;
const DEFAULT_MAX_MEDIA_PAGES = 20;

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
}

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
    graphHost: String(process.env.INSTAGRAM_GRAPH_HOST || GRAPH_HOST).replace(/\/$/, ''),
    mediaPageSize: boundedNumber(process.env.INSTAGRAM_MEDIA_PAGE_SIZE, DEFAULT_MEDIA_PAGE_SIZE, 1, 100),
    maxMediaPages: boundedNumber(process.env.INSTAGRAM_MEDIA_MAX_PAGES, DEFAULT_MAX_MEDIA_PAGES, 1, 100)
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
      const apiError = payload.error || {};
      const message = apiError.message || `Instagram API 回應 ${response.status}`;
      throw Object.assign(new Error(message), {
        code: 'INSTAGRAM_API_ERROR',
        status: 502,
        metaCode: apiError.code,
        metaSubcode: apiError.error_subcode,
        metaType: apiError.type
      });
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

// Business Discovery 在不同 Graph API 版本／權限組合下，支援的媒體欄位可能不同。
// 由完整欄位逐級降級，避免一個非必要欄位讓整個來源都無法同步；權杖或帳號權限錯誤不會被隱藏。
const MEDIA_FIELD_SETS = [
  ['id', 'caption', 'media_type', 'media_product_type', 'permalink', 'timestamp', 'like_count', 'comments_count', 'view_count', 'thumbnail_url'],
  ['id', 'caption', 'media_type', 'media_product_type', 'permalink', 'timestamp', 'like_count', 'comments_count'],
  ['id', 'caption', 'media_type', 'permalink', 'timestamp', 'like_count', 'comments_count']
];

function isFieldCompatibilityError(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.metaCode === 100 || /field|unsupported|does not exist|invalid.*field|非必要欄位|欄位/.test(message);
}

function creatorFields(handle, mediaFields, pageSize) {
  return `business_discovery.username(${handle}){id,username,name,followers_count,media.limit(${pageSize}){${mediaFields.join(',')}}}`;
}

export function instagramSyncErrorMessage(error) {
  const raw = String(error?.message || '未知錯誤');
  const code = Number(error?.metaCode);
  if (code === 190 || /access token|session has expired|oauthexception/i.test(raw)) {
    return 'Instagram 存取權杖已過期或無效（Meta 錯誤 190）。請重新產生可查詢 Instagram 專業帳號的長效權杖，更新 Vercel Production 的 INSTAGRAM_ACCESS_TOKEN，並重新部署。';
  }
  if (code === 10 || /permission|permissions|許可/i.test(raw)) {
    return 'Meta 權限不足。請確認 App 已取得 instagram_basic、pages_show_list、pages_read_engagement，且權杖所屬專業帳號已連結 Facebook 粉絲專頁。';
  }
  if (code === 100 || /unsupported|does not exist|invalid.*field/i.test(raw)) {
    return `Meta 無法使用目前的帳號或欄位（錯誤 100）；系統已自動嘗試相容欄位。請確認 INSTAGRAM_BUSINESS_ACCOUNT_ID 是 Instagram 專業帳號 ID。`;
  }
  return raw;
}

function nextPageUrl(value, accessToken) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (accessToken && !url.searchParams.has('access_token')) url.searchParams.set('access_token', accessToken);
    return url.toString();
  } catch {
    return '';
  }
}

export function instagramMediaIsReel(media) {
  const productType = String(media?.media_product_type || '').toUpperCase();
  if (productType === 'REELS' || productType === 'REEL') return true;
  return String(media?.media_type || '').toUpperCase() === 'VIDEO' && /\/reel\//i.test(String(media?.permalink || ''));
}

export async function collectMediaPages(firstPage, { fetchPage = fetchJson, accessToken = '', maxPages = DEFAULT_MAX_MEDIA_PAGES } = {}) {
  const media = [];
  const seenIds = new Set();
  let page = firstPage || {};
  let pages = 0;
  let truncated = false;
  const pageLimit = boundedNumber(maxPages, DEFAULT_MAX_MEDIA_PAGES, 1, 100);
  while (page && pages < pageLimit) {
    pages += 1;
    for (const item of Array.isArray(page.data) ? page.data : []) {
      const id = String(item?.id || '');
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      media.push(item);
    }
    const next = nextPageUrl(page.paging?.next, accessToken);
    if (!next) break;
    if (pages >= pageLimit) {
      truncated = true;
      break;
    }
    page = await fetchPage(next);
  }
  return { media, pages, truncated };
}

export async function fetchCreator(source, options) {
  const handle = username(source.username);
  if (!handle) throw Object.assign(new Error(`監測帳號格式無效：${source.username || '空白'}`), { code: 'INSTAGRAM_USERNAME_INVALID', status: 422 });
  let payload;
  let fieldSetIndex = 0;
  for (const [index, mediaFields] of MEDIA_FIELD_SETS.entries()) {
    const fields = creatorFields(handle, mediaFields, options.mediaPageSize);
    const params = new URLSearchParams({ fields, access_token: options.accessToken });
    const endpoint = `${options.graphHost}/${options.apiVersion}/${encodeURIComponent(options.businessAccountId)}?${params}`;
    try {
      payload = await fetchJson(endpoint);
      fieldSetIndex = index;
      break;
    } catch (error) {
      if (index === MEDIA_FIELD_SETS.length - 1 || !isFieldCompatibilityError(error)) throw error;
    }
  }
  const account = payload?.business_discovery;
  if (!account) throw Object.assign(new Error(`找不到 Instagram 專業帳號：@${handle}`), { code: 'INSTAGRAM_CREATOR_NOT_FOUND', status: 404 });
  const pages = await collectMediaPages(account.media, { accessToken: options.accessToken, maxPages: options.maxMediaPages });
  return { handle, account, media: pages.media, mediaPages: pages.pages, mediaTruncated: pages.truncated, fieldSetIndex };
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
  if (!sources.length) return { ok: true, trigger, sources: 0, imported: 0, errors: [], truncatedSources: [] };

  const existingResult = await client.from('viral_contents').select('*').eq('platform', 'Instagram');
  if (existingResult.error) throw Object.assign(new Error('既有 Instagram 案例讀取失敗'), { code: 'INSTAGRAM_CASE_READ_ERROR', status: 502 });
  const existingByMedia = new Map((existingResult.data || []).filter(row => row.instagram_media_id).map(row => [row.instagram_media_id, row]));
  const existingByUrl = new Map((existingResult.data || []).filter(row => row.source_url).map(row => [row.source_url, row]));
  const syncedAt = new Date().toISOString();
  const errors = [];
  const truncatedSources = [];
  let imported = 0;

  for (const source of sources) {
    try {
      const creator = await fetchCreator(source, options);
      const rows = creator.media.filter(instagramMediaIsReel).map(media => {
        const permalink = String(media.permalink || '').trim();
        const existing = existingByMedia.get(String(media.id || '')) || existingByUrl.get(permalink);
        return buildRow(source, creator, media, existing, syncedAt);
      }).filter(row => row.instagram_media_id);
      if (rows.length) {
        const result = await client.from('viral_contents').upsert(rows);
        if (result.error) throw Object.assign(new Error('Instagram 案例寫入失敗'), { code: 'INSTAGRAM_CASE_WRITE_ERROR', status: 502 });
        imported += rows.length;
      }
      const syncNote = creator.mediaTruncated ? `已同步前 ${options.maxMediaPages * options.mediaPageSize} 筆媒體；達到本次同步上限，請提高 INSTAGRAM_MEDIA_MAX_PAGES。` : '';
      await updateSource(client, source, { remote_user_id: String(creator.account.id || ''), last_synced_at: syncedAt, last_sync_status: 'SUCCESS', last_sync_error: syncNote });
      if (creator.mediaTruncated) truncatedSources.push(source.username);
    } catch (error) {
      const rawMessage = String(error.message || '未知錯誤');
      const message = instagramSyncErrorMessage(error).slice(0, 500);
      console.error('Instagram creator sync failed', JSON.stringify({ username: source.username, code: error.code || 'INSTAGRAM_SYNC_ERROR', metaCode: error.metaCode || null, metaSubcode: error.metaSubcode || null, message, rawMessage }));
      errors.push({ username: source.username, code: error.code || 'INSTAGRAM_SYNC_ERROR', message });
      await updateSource(client, source, { last_synced_at: syncedAt, last_sync_status: 'ERROR', last_sync_error: message });
    }
  }
  return { ok: errors.length === 0, trigger, sources: sources.length, imported, errors, truncatedSources, syncedAt };
}
