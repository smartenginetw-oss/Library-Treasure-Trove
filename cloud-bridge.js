/* 藏書閣寶典雲端橋接層：Supabase Auth/RLS + 伺服器端智慧服務。 */
(function () {
  'use strict';

  const config = window.SUPABASE_CONFIG || {};
  let client = null;
  let hasConfig = Boolean(config.url && config.anonKey && window.supabase?.createClient);
  // Keep the same key Supabase uses by default, but make the browser storage
  // explicit so session persistence does not depend on an environment default.
  const authStorageKey = (() => {
    try {
      return `sb-${new URL(config.url).hostname.split('.')[0]}-auth-token`;
    } catch {
      return 'library-treasure-trove-auth-token';
    }
  })();
  function authStorage() {
    try {
      const storage = window.localStorage;
      const probe = '__library_treasure_trove_storage_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch {
      // Some privacy modes and file:// pages deny localStorage. Keep auth
      // operations functional in that case; normal HTTPS/HTTP deployments use
      // localStorage and survive refreshes and tab changes.
      const memory = new Map();
      return {
        getItem: key => memory.has(key) ? memory.get(key) : null,
        setItem: (key, value) => memory.set(key, String(value)),
        removeItem: key => memory.delete(key)
      };
    }
  }
  if (hasConfig) {
    try {
      client = window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: authStorageKey,
          storage: authStorage()
        }
      });
    } catch (error) {
      hasConfig = false;
      console.warn('[cloud config]', error.message);
    }
  }
  const apiBase = String(config.apiBase || '').replace(/\/$/, '');
  let app = null;
  let session = null;
  let authReady = !client;
  let syncTimer = null;
  let authMode = 'signin';

  function notify(message) {
    if (typeof window.toast === 'function') window.toast(message);
    else console.info(`[藏書閣寶典] ${message}`);
  }

  function authRedirectUrl() {
    const url = new URL(window.location.href);
    // Auth emails should return to the app root, not carry a stale route or
    // an auth error fragment into the next session.
    url.hash = '';
    return url.toString();
  }

  function clearAuthErrorFromUrl() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code = params.get('error_code');
    if (!code) return false;
    const description = params.get('error_description') || '';
    const message = code === 'otp_expired'
      ? '驗證連結已過期或已使用，請重新寄送驗證信，再點擊最新一封。'
      : `驗證失敗：${description || code}`;
    notify(message);
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
    return true;
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
      instagramMediaId: row.instagram_media_id,
      instagramSourceId: row.instagram_source_id,
      publishedAt: row.published_at,
      lastSyncedAt: row.last_synced_at,
      syncSource: row.sync_source,
      archived: row.archived,
      // The cloud schema stores created_at rather than the local-only
      // publishDate field. Keep the radar table renderable after hydration.
      publishDate: row.publish_date || row.published_at || row.created_at,
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
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: authRedirectUrl() }
      });
      if (error) throw error;
      return data;
    }
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function resendSignupConfirmation(email) {
    if (!client) throw new Error('尚未設定 Supabase 前端連線資訊');
    const { error } = await client.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authRedirectUrl() }
    });
    if (error) throw error;
  }

  function showVerificationPending(root, email) {
    root.innerHTML = `<div class="modal-wrap" data-cloud-modal><div class="modal" style="max-width:460px"><div class="modal-head"><div><h2>請確認電子郵件</h2><p class="panel-note">驗證信已寄到 ${escapeHtml(email)}。請只點擊最新一封信中的連結一次。</p></div><button type="button" class="btn icon" data-close-cloud>×</button></div><div class="notice">如果看到「Email link is invalid or has expired」，代表連結已過期或被信箱安全掃描器先使用。</div><div class="form-actions"><button type="button" class="btn" data-resend-signup>重新寄送驗證信</button><button type="button" class="btn primary" data-back-to-signin>返回登入</button></div></div></div>`;
    root.querySelector('[data-close-cloud]').addEventListener('click', () => { root.innerHTML = ''; });
    root.querySelector('.modal-wrap').addEventListener('click', event => { if (event.target === event.currentTarget) root.innerHTML = ''; });
    root.querySelector('[data-back-to-signin]').addEventListener('click', () => { authMode = 'signin'; showAuthModal(); });
    root.querySelector('[data-resend-signup]').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await resendSignupConfirmation(email);
        notify('新的驗證信已寄出，請使用最新一封。');
      } catch (error) {
        notify(error.message || '驗證信重新寄送失敗，請稍後再試');
        button.disabled = false;
      }
    });
  }

  function showAuthModal() {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    const configuredNote = hasConfig ? '使用 Supabase 帳號登入後，資料會在不同裝置同步。' : '目前尚未填入 Supabase URL 與公開金鑰；本機模式仍可使用。';
    root.innerHTML = `<div class="modal-wrap" data-cloud-modal><div class="modal" style="max-width:460px"><div class="modal-head"><div><h2>${authMode === 'signin' ? '登入雲端藏書閣' : '建立雲端帳號'}</h2><p class="panel-note">${configuredNote}</p></div><button type="button" class="btn icon" data-close-cloud>×</button></div><form id="cloudAuthForm"><div class="form-grid"><div class="form-field full"><label>電子郵件</label><input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div><div class="form-field full"><label>密碼（至少 6 碼）</label><input name="password" type="password" minlength="6" autocomplete="${authMode === 'signin' ? 'current-password' : 'new-password'}" required></div></div><div class="form-actions"><button type="button" class="btn" data-toggle-cloud>${authMode === 'signin' ? '改為建立帳號' : '已有帳號？登入'}</button>${authMode === 'signin' ? '<button type="button" class="btn" data-resend-from-signin>重新寄送註冊驗證信</button>' : ''}<button class="btn primary" ${hasConfig ? '' : 'disabled'}>${authMode === 'signin' ? '登入並同步' : '建立帳號'}</button></div></form></div></div>`;
    root.querySelector('[data-close-cloud]').addEventListener('click', () => { root.innerHTML = ''; });
    root.querySelector('.modal-wrap').addEventListener('click', event => { if (event.target === event.currentTarget) root.innerHTML = ''; });
    root.querySelector('[data-toggle-cloud]').addEventListener('click', () => { authMode = authMode === 'signin' ? 'signup' : 'signin'; showAuthModal(); });
    root.querySelector('[data-resend-from-signin]')?.addEventListener('click', async event => {
      const emailInput = root.querySelector('input[name="email"]');
      const email = String(emailInput?.value || '').trim();
      if (!emailInput?.checkValidity()) {
        emailInput?.reportValidity();
        return;
      }
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await resendSignupConfirmation(email);
        notify('新的註冊驗證信已寄出，請使用最新一封。');
      } catch (error) {
        notify(error.message || '驗證信重新寄送失敗，請確認這個 Email 曾經註冊過');
        button.disabled = false;
      }
    });
    root.querySelector('#cloudAuthForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button.primary');
      button.disabled = true;
      try {
        const form = new FormData(event.currentTarget);
        const email = String(form.get('email')).trim();
        const result = await authRequest(authMode, email, String(form.get('password')));
        if (authMode === 'signup' && !result.session) {
          showVerificationPending(root, email);
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
    const restoring = Boolean(client && !authReady);
    button.disabled = restoring;
    button.textContent = restoring
      ? '正在恢復登入…'
      : (session?.user ? `已登入：${session.user.email}` : (hasConfig ? '登入雲端' : '設定雲端'));
    button.title = restoring
      ? '正在讀取已儲存的登入狀態'
      : (hasConfig ? '登入、登出與跨裝置同步' : '請先填入 supabase-config.js');
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
    if (!client) {
      authReady = true;
      refreshAuthControl();
      return;
    }
    authReady = false;
    refreshAuthControl();
    try {
      clearAuthErrorFromUrl();
      const current = await client.auth.getSession();
      if (current.error) throw current.error;
      session = current.data.session;
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
    } catch (error) {
      session = null;
      console.warn('[cloud auth restore]', error.message);
      notify('登入狀態讀取失敗，請確認瀏覽器允許此網站保存資料。');
    } finally {
      authReady = true;
      refreshAuthControl();
      updateModeNotice();
    }
    client.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      authReady = true;
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

  async function generateDeliverable(input) {
    if (!client || !session?.access_token) throw new Error('請先登入雲端，才能使用伺服器端智慧文案服務');
    const response = await fetch(`${apiBase}/api/generate-deliverable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(input)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || '智慧文案服務暫時無法回應');
    return payload.deliverable;
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

  async function listInstagramSources() {
    if (!client || !session?.access_token) throw new Error('請先登入雲端，才能管理 Instagram 監測來源');
    const response = await fetch(`${apiBase}/api/instagram-sources`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Instagram 監測來源讀取失敗');
    return payload.sources || [];
  }

  async function saveInstagramSource(input) {
    if (!client || !session?.access_token) throw new Error('請先登入雲端，才能管理 Instagram 監測來源');
    const response = await fetch(`${apiBase}/api/instagram-sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(input)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Instagram 監測來源儲存失敗');
    return payload.source;
  }

  async function instagramSync() {
    if (!client || !session?.access_token) throw new Error('請先登入雲端，才能執行 Instagram 同步');
    const response = await fetch(`${apiBase}/api/instagram-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 207) throw new Error(payload.message || 'Instagram 同步失敗');
    return payload;
  }

  async function refreshCloudState() {
    if (!client || !session?.access_token || !app) return null;
    const remote = await pullState();
    if (remote) app.mergeCloudState(remote);
    return remote;
  }

  window.cloudStore = {
    isConfigured: () => hasConfig,
    isSignedIn: () => Boolean(session?.user),
    currentUser: () => session?.user || null,
    showAuthModal,
    generateTopic,
    generateDeliverable,
    adminViral,
    listInstagramSources,
    saveInstagramSource,
    instagramSync,
    refreshCloudState,
    queueSync,
    async attachApp(api) {
      app = api;
      await boot();
    }
  };
  window.addEventListener('hashchange', () => setTimeout(() => {
    clearAuthErrorFromUrl();
    updateModeNotice();
  }, 0));
})();
