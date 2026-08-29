/* 藏書閣寶典雲端橋接層：Supabase Auth/RLS + 伺服器端智慧服務。 */
(function () {
  'use strict';

  const config = window.SUPABASE_CONFIG || {};
  let client = null;
  let hasConfig = Boolean(config.url && config.anonKey && window.supabase?.createClient);
  if (hasConfig) {
    try {
      client = window.supabase.createClient(config.url, config.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (error) {
      hasConfig = false;
      console.warn('[cloud config]', error.message);
    }
  }
  const apiBase = String(config.apiBase || '').replace(/\/$/, '');
  let app = null;
  let session = null;
  let syncTimer = null;
  let authMode = 'signin';

  function notify(message) {
    if (typeof window.toast === 'function') window.toast(message);
    else console.info(`[藏書閣寶典] ${message}`);
  }

  function rowToTopic(row) {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    return {
      ...payload,
      id: row.id,
      title: row.title,
      targetAudience: row.target_audience,
      contentTheme: row.content_theme,
      trafficCodes: row.traffic_codes || [],
      hook: row.hook,
      hookType: row.hook_type,
      whyItWorks: row.why_it_works,
      contentStructure: row.content_structure || [],
      cta: row.cta,
      seriesIdeas: row.series_ideas || [],
      differentiation: row.differentiation,
      copyingRisk: row.copying_risk,
      viralPotential: row.viral_potential,
      status: row.status,
      sourceViralContentId: row.source_viral_content_id,
      contentCategory: row.content_category,
      angle: row.angle || payload.angle || '',
      topicScore: row.topic_score || payload.topicScore || null,
      reviewDueAt: row.review_due_at || payload.reviewDueAt || null,
      createdAt: row.created_at
    };
  }

  function rowToFormula(row) {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    return {
      ...payload,
      id: row.id,
      name: row.name,
      formula: row.formula,
      contentTheme: row.content_theme,
      trafficCodes: row.traffic_codes || [],
      hookType: row.hook_type,
      sourceViralContentId: row.source_viral_content_id,
      notes: row.notes,
      createdAt: row.created_at
    };
  }

  function rowToViral(row) {
    return {
      id: row.id,
      title: row.title,
      creatorName: row.creator_name,
      creatorHandle: row.creator_handle,
      platform: row.platform,
      niche: row.niche,
      followers: row.followers,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      durationSeconds: row.duration_seconds,
      reposts: row.reposts,
      shares: row.shares,
      velocity: row.velocity,
      freshness: row.freshness,
      repeatedFormat: row.repeated_format,
      trafficCodes: row.traffic_codes || [],
      hookType: row.hook_type,
      coverType: row.cover_type,
      format: row.format,
      summary: row.summary,
      commentsSample: row.comments_sample,
      sourceUrl: row.source_url,
      archived: row.archived,
      createdAt: row.created_at
    };
  }

  function rowToDeliverable(row) {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const allowedCtaTypes = new Set(['留言', '收藏', '私訊', '連結', '購買', '到店', '分享', '轉發', '無直接 CTA']);
    const payloadCtaTypes = Array.isArray(payload.ctaTypes) ? payload.ctaTypes : payload.ctaType ? [payload.ctaType] : [];
    const storedCtaTypes = Array.isArray(row.cta_types) && row.cta_types.length ? row.cta_types : payloadCtaTypes;
    const ctaTypes = [...new Set(storedCtaTypes
      .filter(type => allowedCtaTypes.has(type)))].slice(0, 3);
    if (ctaTypes.includes('無直接 CTA')) ctaTypes.splice(0, ctaTypes.length, '無直接 CTA');
    const { ctaType: _legacyCtaType, ...payloadWithoutLegacyCtaType } = payload;
    return { ...payloadWithoutLegacyCtaType, ctaTypes, id: row.id, topicId: row.topic_id, title: row.title, angle: row.angle, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  function rowToReview(row) {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    return { ...payload, id: row.id, topicId: row.topic_id, topicTitle: row.topic_title, publishedAt: row.published_at, reviewDueAt: row.review_due_at, reach: row.reach, watchTime: row.watch_time, saves: row.saves, shares: row.shares, dms: row.dms, variable: row.variable, diagnosis: row.diagnosis, nextTest: row.next_test, createdAt: row.created_at };
  }

  function rowToWorkflowTask(row) {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    return { ...payload, id: row.id, day: row.day, title: row.title, detail: row.detail, completed: row.completed, completedAt: row.completed_at, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  async function pullState() {
    if (!client || !session?.user) return null;
    const [profileResult, topicsResult, formulasResult, savedResult, viralsResult, deliverablesResult, reviewsResult, tasksResult] = await Promise.all([
      client.from('creator_profiles').select('*').maybeSingle(),
      client.from('topics').select('*').order('updated_at', { ascending: false }),
      client.from('formulas').select('*').order('updated_at', { ascending: false }),
      client.from('saved_viral_contents').select('viral_content_id'),
      client.from('viral_contents').select('*').eq('archived', false).order('created_at', { ascending: false }),
      client.from('content_deliverables').select('*').order('updated_at', { ascending: false }),
      client.from('content_reviews').select('*').order('created_at', { ascending: false }),
      client.from('workflow_tasks').select('*').order('day', { ascending: true })
    ]);
    const firstError = [profileResult, topicsResult, formulasResult, savedResult, viralsResult, deliverablesResult, reviewsResult, tasksResult].find(result => result.error);
    if (firstError) throw firstError.error;
    // 公開案例不代表這個帳號已經有雲端資料；新帳號應先上傳本機狀態。
    const hasRemoteUserData = Boolean(profileResult.data || topicsResult.data?.length || formulasResult.data?.length || savedResult.data?.length || deliverablesResult.data?.length || reviewsResult.data?.length || tasksResult.data?.length);
    if (!hasRemoteUserData) return null;
    const profile = profileResult.data ? {
      name: profileResult.data.display_name,
      primaryNiche: profileResult.data.primary_niche,
      audienceAge: profileResult.data.audience_age,
      audienceIdentity: profileResult.data.audience_identity,
      audienceInterests: profileResult.data.audience_interests,
      audienceProblem: profileResult.data.audience_problem,
      audienceDesiredResult: profileResult.data.audience_desired_result,
      contentGoal: profileResult.data.content_goal,
      platforms: profileResult.data.platforms || [],
      outlierThreshold: profileResult.data.outlier_threshold,
      customCategories: profileResult.data.custom_categories || [],
      positioningSentence: profileResult.data.positioning_sentence || '',
      creatorStrengths: profileResult.data.creator_strengths || [],
      experienceStories: profileResult.data.experience_stories || [],
      audienceQuestions: profileResult.data.audience_questions || [],
      contentTaboos: profileResult.data.content_taboos || [],
      contentPillars: profileResult.data.content_pillars || [],
      weeklyTime: profileResult.data.weekly_time || '',
      availableTools: profileResult.data.available_tools || []
    } : null;
    return {
      profile,
      topics: (topicsResult.data || []).map(rowToTopic),
      formulas: (formulasResult.data || []).map(rowToFormula),
      savedViralIds: (savedResult.data || []).map(row => row.viral_content_id),
      virals: (viralsResult.data || []).map(rowToViral),
      deliverables: (deliverablesResult.data || []).map(rowToDeliverable),
      reviews: (reviewsResult.data || []).map(rowToReview),
      workflowTasks: (tasksResult.data || []).map(rowToWorkflowTask)
    };
  }

  async function syncState(localState) {
    if (!client || !session?.access_token || !localState) return { skipped: true };
    const response = await fetch(`${apiBase}/api/sync-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        profile: localState.profile,
        topics: localState.topics,
        formulas: localState.formulas,
        savedViralIds: localState.savedViralIds || [],
        deliverables: localState.deliverables || [],
        reviews: localState.reviews || [],
        workflowTasks: localState.workflowTasks || []
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || '雲端同步失敗');
    return payload;
  }

  function queueSync(localState) {
    if (!client || !session?.user || !localState) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncState(localState).catch(error => console.warn('[cloud sync]', error.message)), 800);
  }

  async function authRequest(mode, email, password) {
    if (!client) throw new Error('尚未設定 Supabase 前端連線資訊');
    if (mode === 'signup') {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    }
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  function showAuthModal() {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    const configuredNote = hasConfig ? '使用 Supabase 帳號登入後，資料會在不同裝置同步。' : '目前尚未填入 Supabase URL 與公開金鑰；本機模式仍可使用。';
    root.innerHTML = `<div class="modal-wrap" data-cloud-modal><div class="modal" style="max-width:460px"><div class="modal-head"><div><h2>${authMode === 'signin' ? '登入雲端藏書閣' : '建立雲端帳號'}</h2><p class="panel-note">${configuredNote}</p></div><button type="button" class="btn icon" data-close-cloud>×</button></div><form id="cloudAuthForm"><div class="form-grid"><div class="form-field full"><label>電子郵件</label><input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div><div class="form-field full"><label>密碼（至少 6 碼）</label><input name="password" type="password" minlength="6" autocomplete="${authMode === 'signin' ? 'current-password' : 'new-password'}" required></div></div><div class="form-actions"><button type="button" class="btn" data-toggle-cloud>${authMode === 'signin' ? '改為建立帳號' : '已有帳號？登入'}</button><button class="btn primary" ${hasConfig ? '' : 'disabled'}>${authMode === 'signin' ? '登入並同步' : '建立帳號'}</button></div></form></div></div>`;
    root.querySelector('[data-close-cloud]').addEventListener('click', () => { root.innerHTML = ''; });
    root.querySelector('.modal-wrap').addEventListener('click', event => { if (event.target === event.currentTarget) root.innerHTML = ''; });
    root.querySelector('[data-toggle-cloud]').addEventListener('click', () => { authMode = authMode === 'signin' ? 'signup' : 'signin'; showAuthModal(); });
    root.querySelector('#cloudAuthForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button.primary');
      button.disabled = true;
      try {
        const form = new FormData(event.currentTarget);
        const result = await authRequest(authMode, String(form.get('email')).trim(), String(form.get('password')));
        if (authMode === 'signup' && !result.session) {
          notify('帳號已建立，請先到信箱完成驗證，再回來登入。');
          root.innerHTML = '';
        } else {
          notify('已登入雲端，正在同步資料。');
          root.innerHTML = '';
        }
      } catch (error) {
        notify(error.message || '登入失敗，請檢查帳號與密碼');
        button.disabled = false;
      }
    });
  }

  function addAuthControl() {
    const actions = document.querySelector('.top-actions');
    if (!actions || actions.querySelector('[data-cloud-auth]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn primary';
    button.dataset.cloudAuth = 'true';
    button.addEventListener('click', async () => {
      if (session?.user) {
        if (confirm('要登出雲端帳號嗎？本機資料仍會保留。')) await client.auth.signOut();
      } else showAuthModal();
    });
    actions.insertBefore(button, actions.firstChild);
    refreshAuthControl();
  }

  function refreshAuthControl() {
    const button = document.querySelector('[data-cloud-auth]');
    if (!button) return;
    button.textContent = session?.user ? `已登入：${session.user.email}` : (hasConfig ? '登入雲端' : '設定雲端');
    button.title = hasConfig ? '登入、登出與跨裝置同步' : '請先填入 supabase-config.js';
  }

  function updateModeNotice() {
    document.querySelectorAll('#appContent .notice').forEach(node => {
      if (node.textContent.includes('本機模式無法呼叫')) {
        node.textContent = hasConfig && session?.user
          ? '已登入雲端：這次會優先呼叫伺服器端智慧服務，並把通過格式驗證的選題寫入你的資料庫。'
          : '未登入或尚未設定智慧服務時，會先以同一份格式契約產生規則式草稿；登入且設定金鑰後可改用伺服器端智慧服務。';
      }
    });
  }

  async function boot() {
    addAuthControl();
    updateModeNotice();
    if (!client) return;
    const current = await client.auth.getSession();
    session = current.data.session;
    refreshAuthControl();
    updateModeNotice();
    if (session) {
      try {
        const remote = await pullState();
        if (remote && app?.mergeCloudState) app.mergeCloudState(remote);
        else if (app) await syncState(app.getState());
      } catch (error) {
        console.warn('[cloud hydrate]', error.message);
        notify('雲端資料讀取失敗，先保留本機資料。');
      }
    }
    client.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      refreshAuthControl();
      updateModeNotice();
      if (session && app) pullState().then(remote => remote ? app.mergeCloudState(remote) : syncState(app.getState())).catch(error => console.warn('[cloud auth sync]', error.message));
      window.dispatchEvent(new CustomEvent('cloud:auth', { detail: { user: session?.user || null } }));
    });
  }

  async function generateTopic(input) {
    if (!client || !session?.access_token) throw new Error('請先登入雲端，才能使用伺服器端智慧服務');
    const response = await fetch(`${apiBase}/api/generate-topic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ...input, angle: input?.angle || window.formAngle || '' })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || '智慧服務暫時無法回應');
    return payload.topic;
  }

  async function adminViral(input) {
    if (!client || !session?.access_token) throw new Error('請先登入雲端，才能管理雲端案例');
    const response = await fetch(`${apiBase}/api/admin-viral`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(input)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || '雲端案例服務暫時無法回應');
    return payload.viral;
  }

  window.cloudStore = {
    isConfigured: () => hasConfig,
    isSignedIn: () => Boolean(session?.user),
    currentUser: () => session?.user || null,
    showAuthModal,
    generateTopic,
    adminViral,
    queueSync,
    async attachApp(api) {
      app = api;
      await boot();
    }
  };
  window.addEventListener('hashchange', () => setTimeout(updateModeNotice, 0));
})();
