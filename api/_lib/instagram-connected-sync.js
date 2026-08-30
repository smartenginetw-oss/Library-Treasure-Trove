import { decryptAccessToken, oauthSecret } from './instagram-oauth.js';
import { createServiceClient } from './supabase.js';

const DEFAULT_GRAPH_HOST = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v25.0';
const MEDIA_FIELDS = 'id,caption,media_type,permalink,timestamp,like_count,comments_count,view_count,thumbnail_url';
const IMPORT_FIELDS = 'id,user_id,source_url,platform,creator_name,creator_handle,title,niche,duration_seconds,followers,views,likes,comments,reposts,shares,summary,comments_sample,import_notes,instagram_media_id,connection_id,published_at,last_synced_at';

function config() {
  const version = String(process.env.INSTAGRAM_API_VERSION || DEFAULT_API_VERSION).trim();
  return {
    version: version.startsWith('v') ? version : `v${version}`,
    host: String(process.env.INSTAGRAM_GRAPH_HOST || DEFAULT_GRAPH_HOST).replace(/\/$/, '')
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function titleFrom(media, connection) {
  const firstLine = String(media.caption || '').split(/\r?\n/).map(line => line.trim()).find(Boolean);
  return (firstLine || `${connection.display_name || `@${connection.username}`}｜Instagram ${media.media_type === 'VIDEO' ? '短影音' : '貼文'}`).slice(0, 300);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) throw Object.assign(new Error(payload.error?.message || `Instagram API 回應 ${response.status}`), { code: 'INSTAGRAM_API_ERROR', status: 502 });
    return payload;
  } finally { clearTimeout(timer); }
}

async function markConnection(client, connection, values) {
  const result = await client.from('instagram_creator_connections').update(values).eq('id', connection.id).eq('user_id', connection.user_id);
  if (result.error) console.error('Instagram creator connection update failed', connection.id, result.error.message);
}

export async function syncInstagramConnections({ userId = null, trigger = 'manual' } = {}) {
  const client = createServiceClient();
  let query = client.from('instagram_creator_connections').select('id,user_id,instagram_user_id,username,display_name,access_token_ciphertext,status').eq('status', 'CONNECTED').order('updated_at', { ascending: true });
  if (userId) query = query.eq('user_id', userId);
  const result = await query;
  if (result.error) throw Object.assign(new Error('Instagram 授權連線讀取失敗'), { code: 'INSTAGRAM_CONNECTION_READ_ERROR', status: 502 });
  const connections = result.data || [];
  if (!connections.length) return { ok: true, trigger, connections: 0, imported: 0, errors: [] };
  const options = config();
  const errors = [];
  let imported = 0;
  for (const connection of connections) {
    const syncedAt = new Date().toISOString();
    try {
      const token = decryptAccessToken(connection.access_token_ciphertext, oauthSecret('INSTAGRAM_OAUTH_ENCRYPTION_KEY'));
      const mediaUrl = new URL(`${options.host}/${options.version}/${encodeURIComponent(connection.instagram_user_id)}/media`);
      mediaUrl.searchParams.set('fields', MEDIA_FIELDS);
      mediaUrl.searchParams.set('limit', '10');
      mediaUrl.searchParams.set('access_token', token);
      const payload = await fetchJson(mediaUrl.toString());
      const media = Array.isArray(payload.data) ? payload.data : [];
      const existing = await client.from('manual_content_imports').select(IMPORT_FIELDS).eq('user_id', connection.user_id).eq('connection_id', connection.id);
      if (existing.error) throw Object.assign(new Error('既有授權匯入讀取失敗'), { code: 'MANUAL_IMPORT_READ_ERROR', status: 502 });
      const byMedia = new Map((existing.data || []).filter(row => row.instagram_media_id).map(row => [row.instagram_media_id, row]));
      const byUrl = new Map((existing.data || []).filter(row => row.source_url).map(row => [row.source_url, row]));
      for (const item of media) {
        const mediaId = String(item.id || '').trim();
        if (!mediaId) continue;
        const sourceUrl = String(item.permalink || '').trim() || `https://www.instagram.com/p/${mediaId}/`;
        const old = byMedia.get(mediaId) || byUrl.get(sourceUrl);
        const row = {
          user_id: connection.user_id,
          source_url: sourceUrl,
          platform: 'Instagram',
          creator_name: String(connection.display_name || '').slice(0, 160),
          creator_handle: `@${connection.username}`,
          title: titleFrom(item, connection),
          niche: '',
          duration_seconds: null,
          followers: null,
          views: numberOrNull(item.view_count),
          likes: numberOrNull(item.like_count),
          comments: numberOrNull(item.comments_count),
          reposts: null,
          shares: null,
          summary: String(item.caption || '').slice(0, 5000),
          comments_sample: old?.comments_sample || '',
          import_notes: old?.import_notes || '由創作者授權連線同步',
          instagram_media_id: mediaId,
          connection_id: connection.id,
          published_at: item.timestamp || null,
          last_synced_at: syncedAt
        };
        const write = old?.id
          ? await client.from('manual_content_imports').update(row).eq('id', old.id).eq('user_id', connection.user_id).select('id').single()
          : await client.from('manual_content_imports').insert(row).select('id').single();
        if (write.error) throw Object.assign(new Error('授權內容寫入失敗'), { code: 'MANUAL_IMPORT_WRITE_ERROR', status: 502 });
        imported += 1;
      }
      await markConnection(client, connection, { last_synced_at: syncedAt, status: 'CONNECTED', last_error: '' });
    } catch (error) {
      const message = String(error.message || '未知錯誤').slice(0, 500);
      errors.push({ username: connection.username, code: error.code || 'INSTAGRAM_SYNC_ERROR', message });
      await markConnection(client, connection, { last_synced_at: syncedAt, status: 'ERROR', last_error: message });
    }
  }
  return { ok: errors.length === 0, trigger, connections: connections.length, imported, errors, syncedAt: new Date().toISOString() };
}

