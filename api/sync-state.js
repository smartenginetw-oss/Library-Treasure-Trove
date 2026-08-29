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
    custom_categories: stringArray(profile?.customCategories, 50, 100),
    positioning_sentence: stringValue(profile?.positioningSentence, 1200),
    creator_strengths: stringArray(profile?.creatorStrengths, 30, 500),
    experience_stories: stringArray(profile?.experienceStories, 30, 1200),
    audience_questions: stringArray(profile?.audienceQuestions, 50, 500),
    content_taboos: stringArray(profile?.contentTaboos, 30, 500),
    content_pillars: Array.isArray(profile?.contentPillars) ? profile.contentPillars.slice(0, 3).map(pillar => ({
      name: stringValue(pillar?.name, 200),
      responsibility: stringValue(pillar?.responsibility, 500),
      evidence: stringValue(pillar?.evidence, 800)
    })) : [],
    weekly_time: stringValue(profile?.weeklyTime, 120),
    available_tools: stringArray(profile?.availableTools, 20, 200)
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
    angle: stringValue(topic?.angle || topic?.contentAngle, 100),
    topic_score: topic?.topicScore && typeof topic.topicScore === 'object' ? topic.topicScore : {},
    review_due_at: topic?.reviewDueAt || null,
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

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function deliverableRow(deliverable, userId) {
  return {
    id: stringValue(deliverable?.id, 120) || `local_${crypto.randomUUID()}`,
    user_id: userId,
    topic_id: stringValue(deliverable?.topicId, 120),
    title: stringValue(deliverable?.title, 300),
    angle: stringValue(deliverable?.angle, 100),
    status: ['DRAFT', 'READY', 'ARCHIVED'].includes(deliverable?.status) ? deliverable.status : 'DRAFT',
    payload: objectValue(deliverable)
  };
}

function reviewRow(review, userId) {
  const numberOrNull = value => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : null;
  return {
    id: stringValue(review?.id, 120) || `local_${crypto.randomUUID()}`,
    user_id: userId,
    topic_id: stringValue(review?.topicId, 120),
    topic_title: stringValue(review?.topicTitle, 300),
    published_at: review?.publishedAt || null,
    review_due_at: review?.reviewDueAt || null,
    reach: numberOrNull(review?.reach),
    watch_time: stringValue(review?.watchTime, 160),
    saves: numberOrNull(review?.saves),
    shares: numberOrNull(review?.shares),
    dms: numberOrNull(review?.dms),
    variable: stringValue(review?.variable, 500),
    diagnosis: stringValue(review?.diagnosis, 1600),
    next_test: stringValue(review?.nextTest, 1200),
    payload: objectValue(review)
  };
}

function workflowTaskRow(task, userId) {
  const day = Math.max(1, Math.min(7, Math.round(Number(task?.day) || 1)));
  return {
    id: stringValue(task?.id, 120) || `day-${day}`,
    user_id: userId,
    day,
    title: stringValue(task?.title, 300),
    detail: stringValue(task?.detail, 500),
    completed: Boolean(task?.completed),
    completed_at: task?.completedAt || null,
    payload: objectValue(task)
  };
}

async function removeMissingRows(client, table, rows, userId) {
  const existing = await client.from(table).select('id').eq('user_id', userId);
  if (existing.error) return existing;
  const desiredIds = new Set(rows.map(row => row.id));
  const staleIds = (existing.data || []).map(row => row.id).filter(id => !desiredIds.has(id));
  if (!staleIds.length) return { error: null };
  return client.from(table).delete().eq('user_id', userId).in('id', staleIds);
}

async function removeMissingBookmarks(client, desiredIds, userId) {
  const existing = await client.from('saved_viral_contents').select('viral_content_id').eq('user_id', userId);
  if (existing.error) return existing;
  const desired = new Set(desiredIds);
  const staleIds = (existing.data || []).map(row => row.viral_content_id).filter(id => !desired.has(id));
  if (!staleIds.length) return { error: null };
  return client.from('saved_viral_contents').delete().eq('user_id', userId).in('viral_content_id', staleIds);
}

export default async function handler(req, res) {
  setJsonHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return methodNotAllowed(res);
  try {
    const { client, user } = await authenticateRequest(req);
    const body = readJson(req);
    const hasTopics = Array.isArray(body.topics);
    const hasFormulas = Array.isArray(body.formulas);
    const hasSavedViralIds = Array.isArray(body.savedViralIds);
    const topics = hasTopics ? body.topics.slice(0, maxPayload) : [];
    const formulas = hasFormulas ? body.formulas.slice(0, maxPayload) : [];
    const hasDeliverables = Array.isArray(body.deliverables);
    const hasReviews = Array.isArray(body.reviews);
    const hasWorkflowTasks = Array.isArray(body.workflowTasks);
    const deliverables = hasDeliverables ? body.deliverables.slice(0, maxPayload) : [];
    const reviews = hasReviews ? body.reviews.slice(0, maxPayload) : [];
    const workflowTasks = hasWorkflowTasks ? body.workflowTasks.slice(0, 20) : [];
    const deliverableRows = deliverables.map(item => deliverableRow(item, user.id));
    const reviewRows = reviews.map(item => reviewRow(item, user.id));
    const workflowTaskRows = workflowTasks.map(item => workflowTaskRow(item, user.id));
    const savedViralIds = stringArray(body.savedViralIds, maxPayload, 120);
    const profile = profileRow(body.profile || {}, user.id);
    const profileResult = await client.from('creator_profiles').upsert(profile);
    if (profileResult.error) throw Object.assign(new Error('創作者設定同步失敗'), { code: 'PROFILE_SYNC_ERROR', status: 502 });
    if (topics.length) {
      const result = await client.from('topics').upsert(topics.map(topic => topicRow(topic, user.id)));
      if (result.error) throw Object.assign(new Error('選題同步失敗'), { code: 'TOPIC_SYNC_ERROR', status: 502 });
    }
    if (hasTopics && body.topics.length <= maxPayload) {
      const result = await removeMissingRows(client, 'topics', topics.map(topic => topicRow(topic, user.id)), user.id);
      if (result.error) throw Object.assign(new Error('已刪除的選題同步失敗'), { code: 'TOPIC_DELETE_SYNC_ERROR', status: 502 });
    }
    if (formulas.length) {
      const result = await client.from('formulas').upsert(formulas.map(formula => formulaRow(formula, user.id)));
      if (result.error) throw Object.assign(new Error('公式同步失敗'), { code: 'FORMULA_SYNC_ERROR', status: 502 });
    }
    if (hasFormulas && body.formulas.length <= maxPayload) {
      const result = await removeMissingRows(client, 'formulas', formulas.map(formula => formulaRow(formula, user.id)), user.id);
      if (result.error) throw Object.assign(new Error('已刪除的公式同步失敗'), { code: 'FORMULA_DELETE_SYNC_ERROR', status: 502 });
    }
    if (deliverables.length) {
      const result = await client.from('content_deliverables').upsert(deliverableRows);
      if (result.error) throw Object.assign(new Error('內容交付包同步失敗'), { code: 'DELIVERABLE_SYNC_ERROR', status: 502 });
    }
    if (hasDeliverables && deliverables.length <= maxPayload) {
      const result = await removeMissingRows(client, 'content_deliverables', deliverableRows, user.id);
      if (result.error) throw Object.assign(new Error('已刪除的內容交付包同步失敗'), { code: 'DELIVERABLE_DELETE_SYNC_ERROR', status: 502 });
    }
    if (reviews.length) {
      const result = await client.from('content_reviews').upsert(reviewRows);
      if (result.error) throw Object.assign(new Error('復盤同步失敗'), { code: 'REVIEW_SYNC_ERROR', status: 502 });
    }
    if (hasReviews && reviews.length <= maxPayload) {
      const result = await removeMissingRows(client, 'content_reviews', reviewRows, user.id);
      if (result.error) throw Object.assign(new Error('已刪除的復盤同步失敗'), { code: 'REVIEW_DELETE_SYNC_ERROR', status: 502 });
    }
    if (workflowTasks.length) {
      const result = await client.from('workflow_tasks').upsert(workflowTaskRows);
      if (result.error) throw Object.assign(new Error('七天工作流同步失敗'), { code: 'WORKFLOW_SYNC_ERROR', status: 502 });
    }
    if (hasWorkflowTasks && workflowTasks.length <= 20) {
      const result = await removeMissingRows(client, 'workflow_tasks', workflowTaskRows, user.id);
      if (result.error) throw Object.assign(new Error('已刪除的工作流任務同步失敗'), { code: 'WORKFLOW_DELETE_SYNC_ERROR', status: 502 });
    }
    const desired = savedViralIds.map(viralContentId => ({ user_id: user.id, viral_content_id: viralContentId }));
    if (desired.length) {
      const result = await client.from('saved_viral_contents').upsert(desired, { onConflict: 'user_id,viral_content_id' });
      if (result.error) throw Object.assign(new Error('收藏案例同步失敗'), { code: 'BOOKMARK_SYNC_ERROR', status: 502 });
    }
    if (hasSavedViralIds && body.savedViralIds.length <= maxPayload) {
      const result = await removeMissingBookmarks(client, savedViralIds, user.id);
      if (result.error) throw Object.assign(new Error('已取消收藏的案例同步失敗'), { code: 'BOOKMARK_DELETE_SYNC_ERROR', status: 502 });
    }
    return json(res, 200, { ok: true, synced: { profile: true, topics: topics.length, formulas: formulas.length, deliverables: deliverables.length, reviews: reviews.length, workflowTasks: workflowTasks.length, savedViralIds: desired.length } });
  } catch (error) {
    return json(res, error.status || 500, { error: error.code || 'SERVER_ERROR', message: error.message || '同步失敗' });
  }
}
