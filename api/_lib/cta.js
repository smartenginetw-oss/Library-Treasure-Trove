export const CTA_TYPES = Object.freeze([
  '留言',
  '收藏',
  '私訊',
  '連結',
  '購買',
  '到店',
  '分享',
  '轉發',
  '無直接 CTA'
]);

const CTA_KEYWORDS = [
  ['轉發', '轉發'],
  ['分享', '分享'],
  ['私訊', '私訊'],
  ['留言', '留言'],
  ['購買', '購買'],
  ['下單', '購買'],
  ['到店', '到店'],
  ['到場', '到店'],
  ['現場', '到店'],
  ['連結', '連結'],
  ['網址', '連結'],
  ['不需要', '無直接 CTA'],
  ['不用 CTA', '無直接 CTA']
];

export function normalizeCtaTypes(value, fallback = []) {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const normalized = [];
  for (const item of values) {
    const raw = typeof item === 'string' ? item.trim() : '';
    if (!CTA_TYPES.includes(raw) || normalized.includes(raw)) continue;
    if (raw === '無直接 CTA') return ['無直接 CTA'];
    normalized.push(raw);
    if (normalized.length >= 3) break;
  }
  if (normalized.length) return normalized;
  const fallbackValues = Array.isArray(fallback) ? fallback : fallback === undefined || fallback === null ? [] : [fallback];
  if (fallbackValues.length && fallbackValues !== values) return normalizeCtaTypes(fallbackValues);
  return [];
}

export function inferCtaTypes(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const matches = CTA_KEYWORDS
    .map(([keyword, type]) => ({ keyword, type, index: raw.indexOf(keyword) }))
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index || a.keyword.length - b.keyword.length);
  return normalizeCtaTypes(matches.map(item => item.type));
}

export function ensureCtaTypes(value, fallbackText = '') {
  const normalized = normalizeCtaTypes(value);
  if (normalized.length) return normalized;
  return normalizeCtaTypes(inferCtaTypes(fallbackText), ['收藏']);
}
