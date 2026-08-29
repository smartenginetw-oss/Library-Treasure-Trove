import { ensureCtaTypes } from './cta.js';
import { stringValue } from './http.js';

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

export function deliverableRow(deliverable, userId) {
  const ctaTypes = ensureCtaTypes(
    deliverable?.ctaTypes ?? deliverable?.ctaType,
    deliverable?.segments?.find(segment => segment?.key === 'cta')?.text || deliverable?.cta
  );
  const payload = objectValue(deliverable);
  payload.ctaTypes = ctaTypes;
  delete payload.ctaType;
  return {
    id: stringValue(deliverable?.id, 120) || `local_${crypto.randomUUID()}`,
    user_id: userId,
    topic_id: stringValue(deliverable?.topicId, 120),
    title: stringValue(deliverable?.title, 300),
    angle: stringValue(deliverable?.angle, 100),
    status: ['DRAFT', 'READY', 'ARCHIVED'].includes(deliverable?.status) ? deliverable.status : 'DRAFT',
    cta_types: ctaTypes,
    payload
  };
}
