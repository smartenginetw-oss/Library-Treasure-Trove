import { authenticateRequest } from './_lib/supabase.js';
import { json, methodNotAllowed, readJson, setJsonHeaders, stringArray, stringValue } from './_lib/http.js';

const maxPayload = 200;

function profileRow(profile, userId) {
  return {
    user_id: userId,
    display_name: stringValue(profile?.name, 120) || '內容創作者',
    primary_niche: stringValue(profile?.primaryNiche, 120),
    audience_age: stringValue(profile?.audienceAge, 80),
    audience_identity: stringValue(profile?.audienceIdentity, 500),
    audience_interests: stringValue(profile?.audienceInterests, 1000),
    audience_problem: stringValue(profile?.audienceProblem, 1600),
    audience_desired_result: stringValue(profile?.audienceDesiredResult, 1600),
    content_goal: stringValue(profile?.contentGoal, 120),
    platforms: stringArray(profile?.platforms, 10, 80),
    outlier_threshold: Number.isFinite(Number(profile?.outlierThreshold)) ? Math.max(1, Math.min(100, Number(profile.outlierThreshold))) : 4,
    custom_categories: stringArray(profile?.customCategories, 50, 100)
  };
}

function topicRow(topic, userId) {
  return {
    id: stringValue(topic?.id, 120) || `local_${crypto.randomUUID()}`,
    user_id: userId,
    title: stringValue(topic?.title, 300),
    target_audience: stringValue(topic?.targetAudience, 500),
    content_theme: stringValue(topic?.contentTheme, 100),
    traffic_codes: stringArray(topic?.trafficCodes, 5, 100),
    hook: stringValue(topic?.hook, 1200),
    hook_type: stringValue(topic?.hookType, 100),
    why_it_works: stringValue(topic?.whyItWorks, 1600),
    content_structure: stringArray(topic?.contentStructure, 10, 500),
    cta: stringValue(topic?.cta, 500),
    series_ideas: stringArray(topic?.seriesIdeas, 8, 300),
    differentiation: stringValue(topic?.differentiation, 1200),
    copying_risk: stringValue(topic?.copyingRisk || topic?.riskOfCopying, 800),
    viral_potential: Math.max(0, Math.min(100, Math.round(Number(topic?.viralPotential) || 0))),
    status: stringValue(topic?.status, 40) || 'IDEA',
    source_viral_content_id: stringValue(topic?.sourceViralContentId, 120) || null,
    content_category: stringValue(topic?.contentCategory, 100),
    payload: topic
  };
}

function formulaRow(formula, userId) {
  return {
    id: stringValue(formula?.id, 120) || `local_${crypto.randomUUID()}`,
    user_id: userId,
    name: stringValue(formula?.name, 300),
    formula: stringValue(formula?.formula, 1200),
    content_theme: stringValue(formula?.contentTheme, 100),
    traffic_codes: stringArray(formula?.trafficCodes, 5, 100),
    hook_type: stringValue(formula?.hookType, 100),
    source_viral_content_id: stringValue(formula?.sourceViralContentId, 120) || null,
    notes: stringValue(formula?.notes, 1200),
    payload: formula
  };
}

export default async function handler(req, res) {
  setJsonHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return methodNotAllowed(res);
  try {
    const { client, user } = await authenticateRequest(req);
    const body = readJson(req);
    const topics = Array.isArray(body.topics) ? body.topics.slice(0, maxPayload) : [];
    const formulas = Array.isArray(body.formulas) ? body.formulas.slice(0, maxPayload) : [];
    const savedViralIds = stringArray(body.savedViralIds, maxPayload, 120);
    const profile = profileRow(body.profile || {}, user.id);
    const profileResult = await client.from('creator_profiles').upsert(profile);
    if (profileResult.error) throw Object.assign(new Error('創作者設定同步失敗'), { code: 'PROFILE_SYNC_ERROR', status: 502 });
    if (topics.length) {
      const result = await client.from('topics').upsert(topics.map(topic => topicRow(topic, user.id)));
      if (result.error) throw Object.assign(new Error('選題同步失敗'), { code: 'TOPIC_SYNC_ERROR', status: 502 });
    }
    if (formulas.length) {
      const result = await client.from('formulas').upsert(formulas.map(formula => formulaRow(formula, user.id)));
      if (result.error) throw Object.assign(new Error('公式同步失敗'), { code: 'FORMULA_SYNC_ERROR', status: 502 });
    }
    const desired = savedViralIds.map(viralContentId => ({ user_id: user.id, viral_content_id: viralContentId }));
    if (desired.length) {
      const result = await client.from('saved_viral_contents').upsert(desired, { onConflict: 'user_id,viral_content_id' });
      if (result.error) throw Object.assign(new Error('收藏案例同步失敗'), { code: 'BOOKMARK_SYNC_ERROR', status: 502 });
    }
    return json(res, 200, { ok: true, synced: { profile: true, topics: topics.length, formulas: formulas.length, savedViralIds: desired.length } });
  } catch (error) {
    return json(res, error.status || 500, { error: error.code || 'SERVER_ERROR', message: error.message || '同步失敗' });
  }
}
