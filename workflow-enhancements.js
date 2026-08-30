/*
 * 藏書閣寶典｜自媒體工作流增強模組
 *
 * 這裡把兩份工作手冊中可以直接執行的步驟，接到既有的單檔本機／雲端狀態：
 * 1. 定位資料卡：定位句、三個內容支柱、經驗與禁區。
 * 2. 題目切角與評分：錯誤／步驟／案例／觀點／清單，以及五項 1–5 分評估。
 * 3. 內容交付包：五段式母內容、七頁輪播、四平台改寫、拍攝分鏡。
 * 4. 七天工作流與 48–72 小時復盤。
 *
 * 所有資料仍沿用 state + localStorage；登入後由 cloud-bridge 的同步 API 傳到
 * Supabase。登入且部署端有智慧服務金鑰時，交付包會交由伺服器端 OpenAI 產生；
 * 服務不可用時才降級為明確標示的規則式草稿。
 */
(function () {
  'use strict';

  const WORKFLOW_ANGLES = ['錯誤', '步驟', '案例', '觀點', '清單'];
  const CTA_TYPE_OPTIONS = [
    { value: '留言', label: '留言', hint: '請觀眾留言關鍵字或問題。', fallback: '留言「關鍵字」拿檢核表。' },
    { value: '收藏', label: '收藏', hint: '讓觀眾保存，之後回來使用。', fallback: '收藏這支，下次需要時再打開。' },
    { value: '私訊', label: '私訊', hint: '引導觀眾發送關鍵字或需求。', fallback: '私訊我「關鍵字」，我把資料發給你。' },
    { value: '連結', label: '點擊連結', hint: '把觀眾帶到個人檔案或指定頁面。', fallback: '點擊個人檔案連結，查看完整資料。' },
    { value: '購買', label: '購買', hint: '引導觀眾購買產品或服務。', fallback: '想進一步使用，點擊連結了解方案。' },
    { value: '到店', label: '到店／到場', hint: '引導觀眾前往實體地點。', fallback: '有機會到現場的話，可以把這個行程排進去。' },
    { value: '分享', label: '分享', hint: '分享給可能需要這份資訊的人。', fallback: '分享給可能需要這份資訊的朋友。' },
    { value: '轉發', label: '轉發', hint: '轉發到限時動態或其他社群。', fallback: '轉發給一起創作或旅行的夥伴。' },
    { value: '無直接 CTA', label: '無直接 CTA', hint: '用觀點或情緒收尾，不要求下一步。', fallback: '' }
  ];
  // 這份清單只供前端顯示；真正可用的模型仍由 API 端白名單再次驗證。
  const OPENAI_MODEL_OPTIONS = [
    { value: '', label: '部署預設模型', detail: '使用部署端 OPENAI_MODEL（目前預設 GPT-4o Mini）' },
    { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', detail: '品質優先，適合複雜內容整理' },
    { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', detail: '品質與成本平衡' },
    { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', detail: '大量產出與成本優先' },
    { value: 'gpt-5.5', label: 'GPT-5.5', detail: '專業內容產出' },
    { value: 'gpt-5.4', label: 'GPT-5.4', detail: '穩定推理與內容改寫' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', detail: '速度與成本優先' },
    { value: 'gpt-4o', label: 'GPT-4o', detail: '成熟的多模態模型' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', detail: '快速、經濟' }
  ];
  const WORKFLOW_KEYS = ['demand', 'saveValue', 'evidence', 'conversion', 'effort'];
  const WORKFLOW_LABELS = {
    demand: '需求強度',
    saveValue: '收藏價值',
    evidence: '個人證據',
    conversion: '轉換連結',
    effort: '製作可行'
  };
  const WORKFLOW_TASKS = [
    { day: 1, title: '完成定位資料卡', detail: '一句定位＋三個內容支柱＋內容禁區' },
    { day: 2, title: '建立 30 題題庫', detail: '每個內容支柱先寫 10 個受眾問題' },
    { day: 3, title: '延伸五種內容切角', detail: '錯誤、步驟、案例、觀點、清單' },
    { day: 4, title: '評分並挑出優先題目', detail: '五項條件各 1–5 分，先做高分題' },
    { day: 5, title: '完成一份內容交付包', detail: '母內容、七頁輪播與拍攝分鏡' },
    { day: 6, title: '改寫成四平台版本', detail: 'Reels、IG 輪播、Threads、Email' },
    { day: 7, title: '發布並排 48–72 小時復盤', detail: '只測一個變因，記錄下一步行動' }
  ];
  const PLATFORM_RULES = {
    'Reels': '前 3 秒點出處境；口語短句；每 3–5 秒切畫面；結尾保留一個明確 CTA。',
    'IG 輪播': '封面先講處境或結果；一頁一個重點；步驟可截圖；結尾以主要 CTA 為主，必要時承接次要 CTA。',
    'Threads': '第一句放觀點；每段短句；保留一個真實經驗；最後承接指定 CTA。',
    'Email': '補上背景、案例與限制；主旨直接說讀者利益；結尾放一個連結或回信 CTA。'
  };
  const CAROUSEL_TEMPLATE = [
    { key: 'cover', title: '封面｜讓陌生人停下來', hint: '受眾處境＋明確結果，不要塞完整解法。' },
    { key: 'resonance', title: '共鳴｜說出他現在卡在哪', hint: '把抽象痛點換成今天會發生的情境。' },
    { key: 'framework', title: '框架｜給一張可理解的地圖', hint: '先講原則或判斷方式，讓讀者知道接下來怎麼走。' },
    { key: 'method', title: '方法｜第一個今天能做的動作', hint: '步驟、判斷標準或完成線，避免只有鼓勵。' },
    { key: 'case', title: '案例｜用前後差異建立可信度', hint: '放自己的經驗、對話、數字或限制條件。' },
    { key: 'check', title: '檢查｜讓內容值得回來看', hint: '清單、錯誤提醒或完成檢核。' },
    { key: 'cta', title: 'CTA｜安排主要與次要下一步', hint: '主要 CTA 要清楚；次要 CTA 只在文字自然時承接，分享與轉發分開記錄。' }
  ];

  window.CONTENT_CTA_TYPES = CTA_TYPE_OPTIONS.map(({ value, label }) => ({ value, label }));

  function safeArray(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function canonicalPlatform(value) {
    const raw = String(value || '').trim();
    if (raw.startsWith('Instagram')) return 'Instagram';
    if (raw.startsWith('TikTok')) return 'TikTok';
    if (raw.startsWith('YouTube')) return 'YouTube Shorts';
    if (raw.startsWith('Threads')) return 'Threads';
    return raw;
  }

  function normalizePlatforms(value) {
    const allowed = new Set(['Instagram', 'TikTok', 'YouTube Shorts', 'Threads']);
    return [...new Set(safeArray(value).map(canonicalPlatform).filter(platform => allowed.has(platform)))];
  }

  function lines(value) {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    return String(value || '')
      .split(/\r?\n|、/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function joinLines(value) {
    return safeArray(value).join('\n');
  }

  function normalizeCtaTypes(value, fallback = []) {
    const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    const normalized = [];
    for (const item of values) {
      const raw = String(item || '').trim();
      if (!CTA_TYPE_OPTIONS.some(option => option.value === raw) || normalized.includes(raw)) continue;
      if (raw === '無直接 CTA') return ['無直接 CTA'];
      normalized.push(raw);
      if (normalized.length >= 3) break;
    }
    if (normalized.length) return normalized;
    const fallbackValues = Array.isArray(fallback) ? fallback : fallback === undefined || fallback === null ? [] : [fallback];
    if (fallbackValues.length && fallbackValues !== values) return normalizeCtaTypes(fallbackValues);
    return [];
  }

  function inferCtaTypes(value) {
    const raw = String(value || '').trim();
    if (!raw) return [];
    const keywords = [
      ['轉發', '轉發'], ['分享', '分享'], ['私訊', '私訊'], ['留言', '留言'],
      ['購買', '購買'], ['下單', '購買'], ['到店', '到店'], ['到場', '到店'],
      ['現場', '到店'], ['連結', '連結'], ['網址', '連結'],
      ['不需要', '無直接 CTA'], ['不用 CTA', '無直接 CTA']
    ];
    return normalizeCtaTypes(keywords
      .map(([keyword, type]) => ({ keyword, type, index: raw.indexOf(keyword) }))
      .filter(item => item.index >= 0)
      .sort((a, b) => a.index - b.index || a.keyword.length - b.keyword.length)
      .map(item => item.type));
  }

  function ensureCtaTypes(value, fallbackText = '') {
    const normalized = normalizeCtaTypes(value);
    if (normalized.length) return normalized;
    return normalizeCtaTypes(inferCtaTypes(fallbackText), ['收藏']);
  }

  function primaryCtaType(value, fallbackText = '') {
    return ensureCtaTypes(value, fallbackText)[0] || '收藏';
  }

  function ctaFallback(value) {
    return CTA_TYPE_OPTIONS.find(option => option.value === primaryCtaType(value))?.fallback || '';
  }

  function ctaHint(value) {
    return ensureCtaTypes(value).map(type => CTA_TYPE_OPTIONS.find(option => option.value === type)?.hint).filter(Boolean).join(' ');
  }

  function ctaTypesOptions(selected) {
    const values = ensureCtaTypes(selected);
    const options = [...CTA_TYPE_OPTIONS].sort((a, b) => {
      const aIndex = values.indexOf(a.value);
      const bIndex = values.indexOf(b.value);
      if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
      if (aIndex >= 0) return -1;
      if (bIndex >= 0) return 1;
      return 0;
    });
    return `<div class="cta-type-options" role="group" aria-label="CTA 類型">${options.map(option => `<label><input type="checkbox" name="ctaTypes" value="${escapeHtml(option.value)}" ${values.includes(option.value) ? 'checked' : ''} onchange="toggleCtaTypeCheckbox(this)"><span>${escapeHtml(option.label)}</span></label>`).join('')}</div>`;
  }

  function modelLabel(value) {
    return OPENAI_MODEL_OPTIONS.find(option => option.value === value)?.label || String(value || '部署預設模型');
  }

  function modelSelect(selected = '') {
    const value = String(selected || '');
    return `<div class="form-field full"><label for="workflowModel">產出模型</label><select id="workflowModel" name="model">${OPENAI_MODEL_OPTIONS.map(option => `<option value="${escapeHtml(option.value)}" ${option.value === value ? 'selected' : ''}>${escapeHtml(option.label)}${option.detail ? `｜${escapeHtml(option.detail)}` : ''}</option>`).join('')}</select><div class="category-helper">模型會影響母內容、逐字稿、貼文文案、潤稿說明、七頁輪播、四平台版本與五鏡頭分鏡；實際使用的模型會記錄在交付包。</div></div>`;
  }

  function ctaShotAction(value) {
    const actions = {
      留言: '指向留言區並示範關鍵字',
      收藏: '示範收藏按鈕或保存畫面',
      私訊: '指向私訊按鈕並示範關鍵字',
      連結: '指向個人檔案連結',
      購買: '展示產品與購買入口',
      到店: '展示地點、路線或現場畫面',
      分享: '示範分享給朋友的操作',
      轉發: '示範轉發到限時動態或社群',
      '無直接 CTA': '保留最後反應或觀點畫面'
    };
    return ensureCtaTypes(value).map(type => actions[type]).filter(Boolean).join('；');
  }

  function toggleCtaTypeCheckbox(input) {
    const group = input.closest('.cta-type-options');
    if (!group) return;
    const none = group.querySelector('input[value="無直接 CTA"]');
    if (input.value === '無直接 CTA' && input.checked) {
      group.querySelectorAll('input[name="ctaTypes"]').forEach(item => { if (item !== input) item.checked = false; });
      return;
    }
    if (input.checked && none) none.checked = false;
    const checked = [...group.querySelectorAll('input[name="ctaTypes"]:checked')];
    if (checked.length > 3) {
      input.checked = false;
      return;
    }
    // The DOM order is also the FormData order, so moving a newly selected
    // option to the end preserves primary -> secondary CTA intent.
    if (input.checked) group.appendChild(input.closest('label'));
  }

  function formatDateTime(value) {
    if (!value) return '尚未排程';
    const dateValue = new Date(value);
    if (Number.isNaN(dateValue.getTime())) return '尚未排程';
    return new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(dateValue);
  }

  function isoAfterHours(hours) {
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }

  function scoreTotal(score) {
    if (!score || typeof score !== 'object') return null;
    const values = WORKFLOW_KEYS.map(key => Number(score[key])).filter(value => Number.isFinite(value));
    return values.length === WORKFLOW_KEYS.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }

  function scoreStatus(total) {
    if (!Number.isFinite(total)) return { label: '尚未評分', className: 'blue' };
    if (total >= 20) return { label: '優先製作', className: 'sage' };
    if (total >= 16) return { label: '先修正再做', className: 'pink' };
    return { label: '題庫待定', className: 'dark' };
  }

  function workflowProfileComplete(profile = state.profile) {
    const pillars = safeArray(profile.contentPillars).filter(item => item && (item.name || item.responsibility || item.evidence));
    const checks = [
      Boolean(String(profile.positioningSentence || '').trim()),
      pillars.length >= 3,
      Boolean(String(profile.audienceIdentity || '').trim()),
      Boolean(String(profile.audienceProblem || '').trim()),
      Boolean(String(profile.audienceDesiredResult || '').trim()),
      Boolean(safeArray(profile.contentTaboos).length)
    ];
    return { done: checks.filter(Boolean).length, total: checks.length, complete: checks.every(Boolean) };
  }

  function ensureWorkflowState() {
    state.profile ||= {};
    state.profile.positioningSentence ??= '';
    state.profile.creatorStrengths = lines(state.profile.creatorStrengths);
    state.profile.experienceStories = lines(state.profile.experienceStories);
    state.profile.audienceQuestions = lines(state.profile.audienceQuestions);
    state.profile.contentTaboos = lines(state.profile.contentTaboos);
    state.profile.availableTools = lines(state.profile.availableTools);
    state.profile.weeklyTime ??= '';
    state.profile.platforms = normalizePlatforms(state.profile.platforms);
    state.profile.contentPillars = Array.from({ length: 3 }, (_, index) => {
      const current = state.profile.contentPillars?.[index] || {};
      return { name: current.name || '', responsibility: current.responsibility || '', evidence: current.evidence || '' };
    });
    state.topics = (state.topics || []).map((topic, index) => ({
      ...topic,
      angle: topic.angle || topic.contentAngle || WORKFLOW_ANGLES[index % WORKFLOW_ANGLES.length],
      topicScore: topic.topicScore || null,
      reviewDueAt: topic.reviewDueAt || null
    }));
    state.deliverables = (state.deliverables || []).filter(Boolean).map(deliverable => {
      const ctaTypes = ensureCtaTypes(deliverable?.ctaTypes ?? deliverable?.ctaType, deliverable?.segments?.find(segment => segment?.key === 'cta')?.text || deliverable?.cta);
      const { ctaType: _legacyCtaType, ...withoutLegacyCtaType } = deliverable;
      const reels = withoutLegacyCtaType.platformVersions?.Reels || withoutLegacyCtaType.segments?.map(segment => segment?.text).filter(Boolean).join('\n\n') || '';
      return {
        ...withoutLegacyCtaType,
        ctaTypes,
        transcript: withoutLegacyCtaType.transcript || reels,
        caption: withoutLegacyCtaType.caption || withoutLegacyCtaType.title || '',
        polishNotes: Array.isArray(withoutLegacyCtaType.polishNotes) ? withoutLegacyCtaType.polishNotes : [],
        generationSource: withoutLegacyCtaType.generationSource || 'rule',
        modelUsed: String(withoutLegacyCtaType.modelUsed || '')
      };
    });
    state.reviews ||= [];
    state.workflowTasks ||= WORKFLOW_TASKS.map((task, index) => ({ id: `day-${index + 1}`, ...task, completed: false }));
    if (!Array.isArray(state.workflowTasks) || state.workflowTasks.length !== WORKFLOW_TASKS.length) {
      const oldTasks = new Map((state.workflowTasks || []).map(task => [task.id || `day-${task.day}`, task]));
      state.workflowTasks = WORKFLOW_TASKS.map((task, index) => ({ id: `day-${index + 1}`, ...task, completed: Boolean(oldTasks.get(`day-${index + 1}`)?.completed) }));
    }
  }

  ensureWorkflowState();

  function addWorkflowNavigation() {
    const sideNav = document.getElementById('sideNav');
    if (sideNav && !sideNav.querySelector('[data-route="positioning"]')) {
      const links = [
        ['positioning', '◎', '定位資料卡'],
        ['workflow', '▦', '內容工作流'],
        ['topic-scoring', '◇', '題目評分'],
        ['reviews', '↻', '復盤實驗']
      ];
      const settingsLink = sideNav.querySelector('[data-route="settings"]');
      links.forEach(([routeName, icon, label]) => {
        const link = document.createElement('a');
        link.className = 'nav-link';
        link.href = `#/${routeName}`;
        link.dataset.route = routeName;
        link.innerHTML = `<span class="nav-icon">${icon}</span>${label}`;
        sideNav.insertBefore(link, settingsLink || null);
      });
    }
    const mobileNav = document.getElementById('mobileNav');
    if (mobileNav && !mobileNav.querySelector('[data-route="positioning"]')) {
      const links = [
        ['positioning', '◎', '定位'],
        ['workflow', '▦', '工作流'],
        ['topic-scoring', '◇', '評分'],
        ['reviews', '↻', '復盤']
      ];
      links.forEach(([routeName, icon, label]) => {
        const link = document.createElement('a');
        link.href = `#/${routeName}`;
        link.dataset.route = routeName;
        link.innerHTML = `<span>${icon}</span>${label}`;
        mobileNav.appendChild(link);
      });
    }
  }

  function field(label, name, value, options = {}) {
    const tag = options.tag || 'input';
    const attrs = options.attrs || '';
    const placeholder = options.placeholder ? ` placeholder="${escapeHtml(options.placeholder)}"` : '';
    const valueAttr = tag !== 'textarea' && tag !== 'select' && value !== undefined && value !== null ? ` value="${escapeHtml(value)}"` : '';
    const content = tag === 'textarea'
      ? escapeHtml(value || '')
      : '';
    return `<div class="form-field ${options.full ? 'full' : ''}"><label>${label}</label><${tag} name="${name}" ${attrs}${valueAttr}${placeholder}>${content}</${tag}></div>`;
  }

  function localDateTimeValue(value = new Date()) {
    const dateValue = value instanceof Date ? value : new Date(value);
    const dateToUse = Number.isNaN(dateValue.getTime()) ? new Date() : dateValue;
    const pad = number => String(number).padStart(2, '0');
    return `${dateToUse.getFullYear()}-${pad(dateToUse.getMonth() + 1)}-${pad(dateToUse.getDate())}T${pad(dateToUse.getHours())}:${pad(dateToUse.getMinutes())}`;
  }

  function parseLocalDateTime(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (match && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
      const localDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
      if (!Number.isNaN(localDate.getTime())) return localDate;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  function localDateKey(value) {
    const dateValue = value instanceof Date ? value : parseLocalDateTime(value);
    const pad = number => String(number).padStart(2, '0');
    return `${dateValue.getFullYear()}-${pad(dateValue.getMonth() + 1)}-${pad(dateValue.getDate())}`;
  }

  function localDateTimeLabel(value) {
    const dateValue = parseLocalDateTime(value);
    const pad = number => String(number).padStart(2, '0');
    const hour = dateValue.getHours();
    const period = hour >= 12 ? '下午' : '上午';
    const twelveHour = hour % 12 || 12;
    return `${dateValue.getFullYear()}/${pad(dateValue.getMonth() + 1)}/${pad(dateValue.getDate())} ${period} ${pad(twelveHour)}:${pad(dateValue.getMinutes())}`;
  }

  function dateTimePickerField(label, name, value, options = {}) {
    const initialValue = value || localDateTimeValue();
    return `<div class="form-field ${options.full ? 'full' : ''}"><label>${label}</label><div class="date-time-picker" data-date-time-picker><input type="hidden" name="${name}" value="${escapeHtml(initialValue)}"><button type="button" class="date-time-trigger" aria-haspopup="dialog" aria-expanded="false"><span class="date-time-trigger-label"></span><span class="date-time-trigger-chevron" aria-hidden="true">⌄</span></button><div class="date-time-popover" role="dialog" aria-label="選擇${label}" hidden><div class="date-time-calendar"><div class="date-time-calendar-head"><button type="button" class="date-time-nav" data-date-prev aria-label="上一個月">‹</button><strong data-date-title></strong><button type="button" class="date-time-nav" data-date-next aria-label="下一個月">›</button></div><div class="date-time-weekdays" aria-hidden="true"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div class="date-time-days" data-date-days role="grid"></div><button type="button" class="date-time-today" data-date-today>回到今天</button></div><div class="date-time-time"><div class="date-time-time-head"><strong>時間</strong><span data-date-time-summary></span></div><div class="date-time-time-controls"><label>小時<input type="number" data-date-hour min="1" max="12" inputmode="numeric" aria-label="小時"></label><span class="date-time-colon">：</span><label>分鐘<input type="number" data-date-minute min="0" max="59" inputmode="numeric" aria-label="分鐘"></label><button type="button" class="date-time-period" data-date-period aria-label="切換上午或下午"></button></div><p>以台北時間顯示，套用後會轉成標準時間保存。</p></div><div class="date-time-popover-actions"><button type="button" class="btn tiny" data-date-cancel>取消</button><button type="button" class="btn primary tiny" data-date-confirm>套用時間</button></div></div></div></div>`;
  }

  function enhanceDateTimePickers() {
    document.querySelectorAll('[data-date-time-picker]:not([data-enhanced])').forEach(picker => {
      picker.dataset.enhanced = 'true';
      const hidden = picker.querySelector('input[type="hidden"]');
      const trigger = picker.querySelector('.date-time-trigger');
      const triggerLabel = picker.querySelector('.date-time-trigger-label');
      const popover = picker.querySelector('.date-time-popover');
      const title = picker.querySelector('[data-date-title]');
      const days = picker.querySelector('[data-date-days]');
      const hourInput = picker.querySelector('[data-date-hour]');
      const minuteInput = picker.querySelector('[data-date-minute]');
      const periodButton = picker.querySelector('[data-date-period]');
      const timeSummary = picker.querySelector('[data-date-time-summary]');
      if (!hidden || !trigger || !popover || !days) return;
      // 舊版或瀏覽器回填可能留下空的 hidden value；顯示的預設時間也必須真正送進表單。
      if (!hidden.value) hidden.value = localDateTimeValue();

      const selectedDate = () => parseLocalDateTime(hidden.value || localDateTimeValue());
      const model = { draft: selectedDate(), viewMonth: new Date(selectedDate().getFullYear(), selectedDate().getMonth(), 1) };
      const close = () => {
        popover.hidden = true;
        popover.classList.remove('above');
        trigger.setAttribute('aria-expanded', 'false');
      };
      const position = () => {
        if (popover.hidden) return;
        popover.classList.remove('above');
        const rect = trigger.getBoundingClientRect();
        const availableBelow = window.innerHeight - rect.bottom - 12;
        if (availableBelow < popover.offsetHeight && rect.top > popover.offsetHeight + 12) popover.classList.add('above');
      };
      const syncTrigger = () => {
        triggerLabel.textContent = localDateTimeLabel(hidden.value || localDateTimeValue());
      };
      const syncTime = () => {
        const hours = model.draft.getHours();
        hourInput.value = String(hours % 12 || 12).padStart(2, '0');
        minuteInput.value = String(model.draft.getMinutes()).padStart(2, '0');
        periodButton.textContent = hours >= 12 ? '下午' : '上午';
        timeSummary.textContent = `${periodButton.textContent} ${hourInput.value}:${minuteInput.value}`;
      };
      const renderDays = () => {
        const year = model.viewMonth.getFullYear();
        const month = model.viewMonth.getMonth();
        title.textContent = `${year} 年 ${month + 1} 月`;
        const firstDay = new Date(year, month, 1).getDay();
        const todayKey = localDateKey(new Date());
        const selectedKey = localDateKey(model.draft);
        const cells = [];
        for (let index = 0; index < 42; index += 1) {
          const dayDate = new Date(year, month, index - firstDay + 1);
          const dayKey = localDateKey(dayDate);
          const outside = dayDate.getMonth() !== month;
          const selected = dayKey === selectedKey;
          const today = dayKey === todayKey;
          cells.push(`<button type="button" class="date-time-day${outside ? ' outside' : ''}${selected ? ' selected' : ''}${today ? ' today' : ''}" data-date-day="${dayKey}" role="gridcell" aria-selected="${selected}">${dayDate.getDate()}</button>`);
        }
        days.innerHTML = cells.join('');
        syncTime();
      };
      const setDraftDate = dateValue => {
        model.draft.setFullYear(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
        model.viewMonth = new Date(dateValue.getFullYear(), dateValue.getMonth(), 1);
        renderDays();
      };
      const setDraftTime = () => {
        let hours = Math.max(1, Math.min(12, Number(hourInput.value) || 12));
        const minutes = Math.max(0, Math.min(59, Number(minuteInput.value) || 0));
        const period = periodButton.textContent === '下午' ? 12 : 0;
        hours = (hours % 12) + period;
        model.draft.setHours(hours, minutes, 0, 0);
        syncTime();
      };
      const open = () => {
        model.draft = selectedDate();
        model.viewMonth = new Date(model.draft.getFullYear(), model.draft.getMonth(), 1);
        renderDays();
        popover.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(position);
      };

      syncTrigger();
      trigger.addEventListener('click', () => (popover.hidden ? open() : close()));
      picker.querySelector('[data-date-prev]').addEventListener('click', () => { model.viewMonth.setMonth(model.viewMonth.getMonth() - 1); renderDays(); });
      picker.querySelector('[data-date-next]').addEventListener('click', () => { model.viewMonth.setMonth(model.viewMonth.getMonth() + 1); renderDays(); });
      picker.querySelector('[data-date-today]').addEventListener('click', () => { model.draft = new Date(); model.viewMonth = new Date(model.draft.getFullYear(), model.draft.getMonth(), 1); renderDays(); });
      days.addEventListener('click', event => {
        const button = event.target.closest('[data-date-day]');
        if (!button) return;
        const [year, month, day] = button.dataset.dateDay.split('-').map(Number);
        setDraftDate(new Date(year, month - 1, day));
      });
      hourInput.addEventListener('change', setDraftTime);
      minuteInput.addEventListener('change', setDraftTime);
      periodButton.addEventListener('click', () => { periodButton.textContent = periodButton.textContent === '下午' ? '上午' : '下午'; setDraftTime(); });
      picker.querySelector('[data-date-cancel]').addEventListener('click', close);
      picker.querySelector('[data-date-confirm]').addEventListener('click', () => {
        hidden.value = localDateTimeValue(model.draft);
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
        syncTrigger();
        close();
        trigger.focus();
      });
      document.addEventListener('mousedown', event => { if (!picker.contains(event.target)) close(); });
      document.addEventListener('keydown', event => { if (event.key === 'Escape' && !popover.hidden) { close(); trigger.focus(); } });
      window.addEventListener('resize', position);
      window.addEventListener('scroll', position, true);
    });
  }

  function positioning() {
    const profile = state.profile;
    const completion = workflowProfileComplete(profile);
    const pillars = profile.contentPillars || [];
    const pillarFields = Array.from({ length: 3 }, (_, index) => {
      const pillar = pillars[index] || {};
      return `<article class="pillar-card"><div class="pillar-number">內容支柱 ${index + 1}</div>${field('支柱名稱', `pillar${index + 1}Name`, pillar.name, { placeholder: '例如：選題與內容系統' })}${field('它要回答的問題', `pillar${index + 1}Responsibility`, pillar.responsibility, { tag: 'textarea', placeholder: '這個支柱固定幫受眾解決什麼？' })}${field('可分享的證據', `pillar${index + 1}Evidence`, pillar.evidence, { tag: 'textarea', placeholder: '經驗、案例、數字或方法' })}</article>`;
    }).join('');
    layout('定位資料卡', '定位資料卡 ／ 先把真實資料餵給智慧服務', '手冊提醒：AI 可以整理與提案，但定位、經驗、禁區與最後判斷要由你提供。完成這張卡後，題庫與內容交付才會更像你的工作方式。', `<div class="workflow-progress"><div><strong>資料完整度 ${completion.done}/${completion.total}</strong><span>${completion.complete ? '可以進入題庫與創作' : '先補齊缺口，避免智慧服務自行猜測'}</span></div><div class="progress-track"><i style="width:${Math.round((completion.done / completion.total) * 100)}%"></i></div></div><form id="positioningForm" class="positioning-form" onsubmit="savePositioning(event)"><section class="panel"><div class="section-head"><div><h2>一句定位</h2><p>我幫【受眾】處理【具體問題】，透過【方法或內容】，讓他得到【結果】。</p></div></div><div class="form-grid">${field('顯示名稱', 'name', profile.name || '內容創作者', { attrs: 'required' })}${field('主要賽道', 'primaryNiche', profile.primaryNiche || NICHES[0], { tag: 'select' })}${field('一句定位', 'positioningSentence', profile.positioningSentence, { full: true, placeholder: '例如：我幫跨賽道創作者處理每天不知道做什麼，透過可驗證的選題流程，穩定產出內容。' })}${field('目標受眾', 'audienceIdentity', profile.audienceIdentity, { full: true, attrs: 'required' })}${field('受眾目前階段', 'audienceAge', profile.audienceAge, { placeholder: '例如：剛開始經營 3 個月內' })}${field('內容目標', 'contentGoal', profile.contentGoal || GOALS[0], { tag: 'select' })}${field('他最常卡住的問題', 'audienceProblem', profile.audienceProblem, { tag: 'textarea', full: true, placeholder: '寫成可觀察的具體情境' })}${field('希望他得到的結果', 'audienceDesiredResult', profile.audienceDesiredResult, { tag: 'textarea', full: true })}</div></section><section class="panel"><div class="section-head"><div><h2>三個內容支柱</h2><p>每個支柱都要有可持續分享的經驗或方法。</p></div></div><div class="pillar-grid">${pillarFields}</div></section><section class="panel"><div class="section-head"><div><h2>你的素材邊界</h2><p>資料不足時，智慧服務應該提問，不應該替你編造。</p></div></div><div class="form-grid">${field('我擅長的事（每行一項）', 'creatorStrengths', joinLines(profile.creatorStrengths), { tag: 'textarea', full: true, placeholder: '例如：把複雜流程拆成今天能做的步驟' })}${field('我經歷過的故事（每行一段）', 'experienceStories', joinLines(profile.experienceStories), { tag: 'textarea', full: true, placeholder: '例如：曾經連續一週只收藏不發布，後來改用題目評分' })}${field('受眾常問的問題（每行一題）', 'audienceQuestions', joinLines(profile.audienceQuestions), { tag: 'textarea', full: true, placeholder: '留言、私訊、諮詢或搜尋框出現的原話' })}${field('我不會談的內容（每行一項）', 'contentTaboos', joinLines(profile.contentTaboos), { tag: 'textarea', full: true, placeholder: '個資、未公開合約、不能證實的數字…' })}${field('每週可投入時間', 'weeklyTime', profile.weeklyTime, { placeholder: '例如：每週 3 小時' })}${field('可用工具（每行一項）', 'availableTools', joinLines(profile.availableTools), { tag: 'textarea', placeholder: '例如：手機、Canva、剪輯工具' })}</div></section><div class="form-actions"><button class="btn primary">儲存定位資料卡</button><button type="button" class="btn" onclick="navigate('topic-scoring')">去評分題目</button></div></form>`);
    const primaryNiche = document.querySelector('#positioningForm [name="primaryNiche"]');
    if (primaryNiche) primaryNiche.innerHTML = opt(NICHES, profile.primaryNiche || NICHES[0]);
    const contentGoal = document.querySelector('#positioningForm [name="contentGoal"]');
    if (contentGoal) contentGoal.innerHTML = opt(GOALS, profile.contentGoal || GOALS[0]);
  }

  function savePositioning(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    state.profile = {
      ...state.profile,
      name: String(values.name || '').trim() || '內容創作者',
      primaryNiche: values.primaryNiche || state.profile.primaryNiche,
      positioningSentence: String(values.positioningSentence || '').trim(),
      audienceIdentity: String(values.audienceIdentity || '').trim(),
      audienceAge: String(values.audienceAge || '').trim(),
      audienceProblem: String(values.audienceProblem || '').trim(),
      audienceDesiredResult: String(values.audienceDesiredResult || '').trim(),
      contentGoal: values.contentGoal || state.profile.contentGoal,
      creatorStrengths: lines(values.creatorStrengths),
      experienceStories: lines(values.experienceStories),
      audienceQuestions: lines(values.audienceQuestions),
      contentTaboos: lines(values.contentTaboos),
      availableTools: lines(values.availableTools),
      weeklyTime: String(values.weeklyTime || '').trim(),
      contentPillars: [1, 2, 3].map(index => ({
        name: String(values[`pillar${index}Name`] || '').trim(),
        responsibility: String(values[`pillar${index}Responsibility`] || '').trim(),
        evidence: String(values[`pillar${index}Evidence`] || '').trim()
      }))
    };
    save();
    toast('定位資料卡已儲存，後續題目會沿用這些條件');
    positioning();
  }

  function topicLabel(topic) {
    const total = scoreTotal(topic.topicScore);
    const status = scoreStatus(total);
    return `${topic.angle || WORKFLOW_ANGLES[0]} · ${status.label}${total === null ? '' : ` ${total}/25`}`;
  }

  function scoreInputs(topic) {
    return WORKFLOW_KEYS.map(key => `<div class="score-input"><label>${WORKFLOW_LABELS[key]}<span>1–5</span></label><input name="${key}" type="number" min="1" max="5" step="1" value="${Number(topic.topicScore?.[key]) || 3}" required><small>${key === 'demand' ? '受眾現在是否真的遇到？' : key === 'saveValue' ? '是否值得之後回來看？' : key === 'evidence' ? '是否有你的經驗或明確判斷？' : key === 'conversion' ? '能否自然承接下一步？' : '兩小時內或現有素材可完成？'}</small></div>`).join('');
  }

  function topicScoring() {
    const topics = (state.topics || []).filter(topic => topic.status !== 'ARCHIVED');
    const selectedId = window.workflowScoreTopicId && topics.some(topic => topic.id === window.workflowScoreTopicId) ? window.workflowScoreTopicId : topics[0]?.id;
    window.workflowScoreTopicId = selectedId;
    const selected = topics.find(topic => topic.id === selectedId);
    const list = topics.map(topic => {
      const total = scoreTotal(topic.topicScore);
      const status = scoreStatus(total);
      return `<button type="button" class="score-topic-row ${topic.id === selectedId ? 'active' : ''}" onclick="window.workflowScoreTopicId='${topic.id}';topicScoring()"><span><strong>${escapeHtml(topic.title)}</strong><small>${escapeHtml(topic.targetAudience || '尚未填寫受眾')} · ${escapeHtml(topic.angle || '未選切角')}</small></span><em class="tag ${status.className}">${status.label}${total === null ? '' : ` ${total}/25`}</em></button>`;
    }).join('');
    const editor = selected ? `<form class="panel score-editor" onsubmit="saveTopicScore(event,'${selected.id}')"><div class="section-head"><div><h2>評估：${escapeHtml(selected.title)}</h2><p>先用條件決定順序，不要只看爆款分數。</p></div><span class="tag blue">${escapeHtml(selected.angle || '未選切角')}</span></div><div class="score-grid">${scoreInputs(selected)}</div><div class="form-field"><label>評分理由與下一個修正</label><textarea name="notes" placeholder="哪個條件最弱？下一版要改哪一個變因？">${escapeHtml(selected.topicScore?.notes || '')}</textarea></div><div class="score-summary"><span>目前總分</span><strong id="liveTopicScore">—</strong><span>20 分以上優先製作／16–19 分先修正／15 分以下先留在題庫</span></div><div class="form-actions"><button class="btn primary">儲存評分</button><button type="button" class="btn" onclick="openTopic('${selected.id}')">編輯題目</button></div></form>` : '<div class="empty"><strong>還沒有可評分的題目</strong>先到智慧選題或七十七式建立一筆題目。</div>';
    layout('題目評分', '題目評分 ／ 先做對順序，再開始製作', '依手冊的需求、收藏、證據、轉換與製作可行五個條件評分；每次只先修正一個最弱條件。', `<div class="scoring-layout"><section class="panel"><div class="section-head"><div><h2>題目清單</h2><p>${topics.length} 筆內容資產</p></div></div><div class="score-topic-list">${list || '<div class="empty"><strong>題庫是空的</strong>先產生第一個題目。</div>'}</div></section>${editor}</div><div class="notice">這是工作排序工具，不是平台官方預測。分數會跟著題目同步保存，之後可以在內容工作流直接建立交付包。</div>`);
    const form = document.querySelector('.score-editor');
    if (form) {
      const update = () => {
        const value = WORKFLOW_KEYS.reduce((sum, key) => sum + (Number(form.elements[key]?.value) || 0), 0);
        const output = form.querySelector('#liveTopicScore');
        if (output) output.textContent = `${value}/25`;
      };
      form.querySelectorAll('input[type="number"]').forEach(input => input.addEventListener('input', update));
      update();
    }
  }

  function saveTopicScore(event, id) {
    event.preventDefault();
    const topic = state.topics.find(item => item.id === id);
    if (!topic) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    topic.topicScore = {
      ...Object.fromEntries(WORKFLOW_KEYS.map(key => [key, Math.max(1, Math.min(5, Number(values[key]) || 1))])),
      notes: String(values.notes || '').trim(),
      updatedAt: new Date().toISOString()
    };
    topic.topicScore.total = scoreTotal(topic.topicScore);
    save();
    toast(`已儲存評分：${topic.topicScore.total}/25`);
    topicScoring();
  }

  function sourceTopicOptions(selectedId) {
    return (state.topics || []).filter(topic => topic.status !== 'ARCHIVED').map(topic => `<option value="${escapeHtml(topic.id)}" ${topic.id === selectedId ? 'selected' : ''}>${escapeHtml(topic.title)}</option>`).join('');
  }

  function selectedTopic(id) {
    return state.topics.find(topic => topic.id === id) || state.topics.find(topic => topic.status !== 'ARCHIVED') || state.topics[0];
  }

  function createDeliverable(topic, input = {}) {
    const profile = state.profile;
    const core = String(input.coreMessage || topic.differentiation || topic.hook || topic.title).trim();
    const caseText = String(input.caseText || profile.experienceStories?.[0] || '補上你的真實案例、對話或前後差異。').trim();
    const ctaTypes = ensureCtaTypes(input.ctaTypes?.length ? input.ctaTypes : input.ctaType || topic.ctaTypes || topic.ctaType, input.cta || topic.cta);
    const primaryCta = primaryCtaType(ctaTypes, input.cta || topic.cta);
    const cta = String(input.cta || topic.cta || ctaFallback(ctaTypes)).trim();
    const audience = topic.targetAudience || profile.audienceIdentity || '目標受眾';
    const structure = safeArray(topic.contentStructure);
    const segments = [
      { key: 'hook', label: '鉤子', text: topic.hook || `如果你是${audience}，先看這個常被忽略的問題。` },
      { key: 'pain', label: '痛點', text: `很多${audience}會卡在：${profile.audienceProblem || '知道要做，卻不知道先做哪一步。'}` },
      { key: 'method', label: '方法', text: structure[2] || `先把「${core}」拆成一個今天能完成的動作，再設定完成標準。` },
      { key: 'case', label: '案例', text: caseText },
      { key: 'cta', label: 'CTA', text: cta }
    ];
    const carouselPages = CAROUSEL_TEMPLATE.map((page, index) => {
      const fallback = [
        topic.title,
        `如果你是${audience}，這個卡點可能每天都在發生。`,
        `先用一個判斷框架處理「${core}」。`,
        segments[2].text,
        caseText,
        `發布前檢查：有處境、有方法、有證據，而且主要 CTA 清楚、次要 CTA 不搶焦。`,
        cta
      ][index];
      return { ...page, text: fallback };
    });
    const platformVersions = {
      'Reels': `${segments[0].text}\n\n${segments[1].text}\n\n做法：${segments[2].text}\n\n${segments[3].text}\n\n${segments[4].text}`,
      'IG 輪播': carouselPages.map((page, index) => `P${String(index + 1).padStart(2, '0')}｜${page.title}\n${page.text}`).join('\n\n'),
      'Threads': `${core}\n\n${segments[1].text}\n\n我的做法是：${segments[2].text}\n\n${segments[3].text}\n\n${segments[4].text}`,
      'Email': `主旨：${topic.title}\n\n${segments[1].text}\n\n${segments[2].text}\n\n案例：${segments[3].text}\n\n下一步：${segments[4].text}`
    };
    const shots = [
      { shot: '01', label: '鉤子', scene: '正面近景', action: '看鏡頭指出處境', check: '收音清楚' },
      { shot: '02', label: '痛點', scene: '桌前中景', action: '展示卡住的工具或畫面', check: '字幕空間足夠' },
      { shot: '03', label: '方法', scene: '俯拍桌面', action: '手寫步驟或操作工具', check: '畫面清楚' },
      { shot: '04', label: '案例', scene: '側面近景', action: '放前後差異、舊照片或成果', check: '有證據' },
      { shot: '05', label: 'CTA', scene: '正面中景', action: ctaShotAction(ctaTypes), check: primaryCta === '無直接 CTA' ? '情緒收尾完整' : 'CTA 動作與文字一致' }
    ];
    return {
      id: uid('d'),
      topicId: topic.id,
      title: topic.title,
      angle: topic.angle || WORKFLOW_ANGLES[0],
      coreMessage: core,
      audience,
      ctaTypes,
      transcript: platformVersions.Reels,
      caption: `${topic.title}\n\n${segments[1].text}\n\n${segments[2].text}\n\n${cta}`,
      polishNotes: ['本機規則式草稿：請把方法與案例換成自己的真實資料。', '已依指定行動邀請類型安排主要與次要 CTA。'],
      generationSource: 'rule',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      segments,
      carouselPages,
      platformVersions,
      shots,
      status: 'DRAFT',
      modelUsed: ''
    };
  }

  async function generateDeliverableFrom77(button) {
    const topic = window.pending77 || window.generatedTopic;
    if (!topic) {
      toast('請先用七十七式產生題目');
      return;
    }
    if (window.pending77Generation) return;
    window.pending77Generation = true;
    const values = window.pending77Input || {};
    const source = state.virals.find(item => item.id === topic.sourceViralContentId);
    const input = {
      topic,
      profile: state.profile,
      sourceViralContent: source || {},
      coreMessage: topic.differentiation || topic.hook || topic.title,
      caseText: state.profile.experienceStories?.[0] || '',
      ctaTypes: ensureCtaTypes(values.ctaTypes || topic.ctaTypes || topic.ctaType, values.cta || topic.cta),
      cta: values.cta || topic.cta,
      angle: topic.angle || values.angle || '步驟',
      model: values.model || window.workflowModel || ''
    };
    if (button) {
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = '正在產出文案…';
    }
    let deliverable;
    try {
      if (window.cloudStore?.isSignedIn?.() && typeof window.cloudStore.generateDeliverable === 'function') {
        deliverable = await window.cloudStore.generateDeliverable(input);
        if (!deliverable?.id) throw new Error('智慧服務沒有回傳有效的內容交付包');
        deliverable.generationSource = 'openai';
        toast('OpenAI 已產出完整文案與拍攝交付包');
      } else {
        deliverable = createDeliverable(topic, input);
        toast('尚未登入雲端，已建立本機規則式文案草稿');
      }
    } catch (error) {
      deliverable = createDeliverable(topic, input);
      toast(`智慧文案服務未完成，已建立本機規則式草稿：${error.message}`);
    } finally {
      window.pending77Generation = false;
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.originalText || '產出完整文案';
      }
    }
    if (!deliverable?.id) {
      toast('文案產出失敗，請稍後再試');
      return;
    }
    if (!state.topics.some(item => item.id === topic.id)) {
      state.topics.unshift({ ...topic, status: 'PLANNED' });
    }
    state.deliverables.unshift({ ...deliverable, topicId: deliverable.topicId || topic.id });
    window.workflowTopicId = topic.id;
    window.workflowDeliverableId = deliverable.id;
    save();
    navigate('workflow');
  }

  function deliverableEditor(deliverable) {
    const ctaTypes = ensureCtaTypes(deliverable.ctaTypes ?? deliverable.ctaType, deliverable.segments?.find(segment => segment.key === 'cta')?.text || deliverable.cta);
    const segmentFields = deliverable.segments.map(segment => `<div class="delivery-field"><label>${segment.label}</label><textarea name="segment_${segment.key}">${escapeHtml(segment.text)}</textarea></div>`).join('');
    const pageFields = deliverable.carouselPages.map((page, index) => `<div class="carousel-page"><div class="carousel-page-head"><span>P${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(page.title)}</strong><small>${escapeHtml(page.hint)}</small></div><textarea name="carousel_${index}">${escapeHtml(page.text)}</textarea></div>`).join('');
    const platformFields = Object.entries(deliverable.platformVersions).map(([platform, text]) => `<div class="platform-version"><div class="platform-version-head"><strong>${platform}</strong><button type="button" class="btn tiny" onclick="copyText(this.previousElementSibling.parentElement.nextElementSibling.value)">複製</button></div><small>${PLATFORM_RULES[platform]}</small><textarea name="platform_${platform}">${escapeHtml(text)}</textarea></div>`).join('');
    const shotFields = deliverable.shots.map((shot, index) => `<div class="shot-row"><span>${shot.shot}</span><input name="shot_${index}_label" value="${escapeHtml(shot.label)}"><input name="shot_${index}_scene" value="${escapeHtml(shot.scene)}"><input name="shot_${index}_action" value="${escapeHtml(shot.action)}"><input name="shot_${index}_check" value="${escapeHtml(shot.check)}"></div>`).join('');
    const ctaField = `<div class="form-field full"><label>CTA 類型</label>${ctaTypesOptions(ctaTypes)}<div class="category-helper">${escapeHtml(ctaHint(ctaTypes))} 內容文字仍可在下方 CTA 段落自行調整。</div></div>`;
    const sourceLabel = deliverable.generationSource === 'openai' ? `OpenAI 智慧文案 · ${modelLabel(deliverable.modelUsed)}` : '本機規則式草稿';
    const polishNotes = Array.isArray(deliverable.polishNotes) ? deliverable.polishNotes.join('\n') : '';
    return `<form class="delivery-editor" onsubmit="saveDeliverable(event,'${deliverable.id}')"><section class="panel"><div class="section-head"><div><h2>母內容五段式</h2><p>每一段只完成一個任務：讓人停下、感到被理解、學會方法、相信經驗、採取下一步。</p></div><div><span class="tag blue">${escapeHtml(deliverable.angle)}</span><span class="tag ${deliverable.generationSource === 'openai' ? 'sage' : ''}">${escapeHtml(sourceLabel)}</span></div></div>${ctaField}<div class="delivery-copy-fields"><div class="delivery-copy-field"><label>逐字稿</label><textarea name="transcript" placeholder="可直接照著念的短影音逐字稿">${escapeHtml(deliverable.transcript || '')}</textarea></div><div class="delivery-copy-field"><label>貼文文案</label><textarea name="caption" placeholder="社群貼文說明與主要行動邀請">${escapeHtml(deliverable.caption || '')}</textarea></div><div class="delivery-copy-field full"><label>潤稿說明</label><textarea name="polishNotes" placeholder="每行一項：語氣、節奏、證據與原創邊界的修改說明">${escapeHtml(polishNotes)}</textarea></div></div><div class="delivery-fields">${segmentFields}</div></section><section class="panel"><div class="section-head"><div><h2>七頁輪播</h2><p>封面不解釋全部；每頁一個重點；最後只保留一個 CTA。</p></div></div><div class="carousel-pages">${pageFields}</div></section><section class="panel"><div class="section-head"><div><h2>四平台改寫</h2><p>核心觀點與案例保持一致，只調整閱讀節奏與 CTA。</p></div></div><div class="platform-versions">${platformFields}</div></section><section class="panel"><div class="section-head"><div><h2>拍攝分鏡表</h2><p>依場景分組，一個場景一次拍完，減少來回換裝與找道具。</p></div></div><div class="shot-table"><div class="shot-row shot-head"><span>SHOT</span><span>段落</span><span>場景與鏡位</span><span>動作／B-roll</span><span>檢查</span></div>${shotFields}</div></section><div class="form-actions"><button class="btn primary">儲存內容交付包</button><button type="button" class="btn danger" onclick="deleteDeliverable('${deliverable.id}')">刪除交付包</button></div></form>`;
  }

  function workflow() {
    const topics = (state.topics || []).filter(topic => topic.status !== 'ARCHIVED');
    const selectedId = window.workflowTopicId && topics.some(topic => topic.id === window.workflowTopicId) ? window.workflowTopicId : topics[0]?.id;
    window.workflowTopicId = selectedId;
    const current = state.deliverables.find(item => item.id === window.workflowDeliverableId) || state.deliverables[0];
    const taskDone = state.workflowTasks.filter(task => task.completed).length;
    const taskMarkup = state.workflowTasks.map(task => `<button type="button" class="workflow-task ${task.completed ? 'completed' : ''}" onclick="toggleWorkflowTask('${task.id}')"><span class="task-check">${task.completed ? '✓' : task.day}</span><span><strong>第 ${task.day} 天｜${task.title}</strong><small>${task.detail}</small></span></button>`).join('');
    const createPanel = topics.length ? `<section class="panel"><div class="section-head"><div><h2>建立內容交付包</h2><p>先選一個題目，再把真實案例與 CTA 補進去。</p></div></div><form onsubmit="createDeliverableFromForm(event)"><div class="form-grid"><div class="form-field full"><label>來源題目</label><select name="topicId" onchange="window.workflowTopicId=this.value">${sourceTopicOptions(selectedId)}</select></div>${modelSelect(window.workflowModel || '')}${field('核心觀點', 'coreMessage', selectedTopic(selectedId)?.differentiation || '', { tag: 'textarea', full: true, placeholder: '這一支內容最後希望讀者記住哪一句？' })}${field('真實案例或前後差異', 'caseText', state.profile.experienceStories?.[0] || '', { tag: 'textarea', full: true, placeholder: '不要讓智慧服務替你編造；沒有資料就先補上。' })}<div class="form-field full"><label>CTA 類型</label>${ctaTypesOptions(selectedTopic(selectedId)?.ctaTypes || selectedTopic(selectedId)?.ctaType || inferCtaTypes(selectedTopic(selectedId)?.cta))}<div class="category-helper">可選 1–3 個；勾選順序即主要 CTA 到次要 CTA，分享與轉發分開記錄。</div></div>${field('CTA 文字', 'cta', selectedTopic(selectedId)?.cta || '', { full: true, placeholder: '例如：分享給可能需要的朋友；留言「關鍵字」取得清單' })}</div><div class="notice">已登入且部署端設定智慧服務金鑰時，按下後會送到 OpenAI 產出文案、逐字稿與分鏡；服務不可用時會明確標示為本機規則式草稿。模型權限仍以部署端 OpenAI 專案可用性為準。</div><div class="form-actions"><button class="btn primary">送出並產生內容交付包</button></div></form></section>` : '<div class="empty"><strong>先建立一個題目</strong>有了題目後，才能產出母內容與四平台版本。</div>';
    const deliverables = state.deliverables.map(item => `<button type="button" class="delivery-list-row ${current?.id === item.id ? 'active' : ''}" onclick="window.workflowDeliverableId='${item.id}';workflow()"><span><strong>${escapeHtml(item.title)}</strong><small>${formatDateTime(item.updatedAt)} · ${escapeHtml(item.angle || '未選切角')} · ${item.modelUsed ? `模型：${escapeHtml(modelLabel(item.modelUsed))} · ` : ''}CTA：${escapeHtml(ensureCtaTypes(item.ctaTypes || item.ctaType).join('、') || '未設定')}</small></span><em>${item.status === 'READY' ? '已完成' : '草稿'}</em></button>`).join('');
    layout('內容工作流', '內容工作流 ／ 從一題走到可拍、可發、可復盤', '把手冊中的「母內容→輪播→短影音→四平台→分鏡」放進同一份交付包；每段都能直接編輯與複製。', `<div class="workflow-layout"><div>${createPanel}${current ? deliverableEditor(current) : '<section class="panel"><div class="empty"><strong>還沒有交付包</strong>建立後會在這裡出現可編輯版本。</div></section>'}</div><aside><section class="panel workflow-week"><div class="section-head"><div><h2>七天啟動計畫</h2><p>已完成 ${taskDone}/7 個交付物</p></div><span class="tag ${taskDone === 7 ? 'sage' : 'blue'}">${Math.round((taskDone / 7) * 100)}%</span></div><div class="workflow-task-list">${taskMarkup}</div></section><section class="panel"><div class="section-head"><div><h2>我的交付包</h2><p>保留每一輪的修改脈絡。</p></div></div><div class="delivery-list">${deliverables || '<div class="muted">尚未建立</div>'}</div></section></aside></div>`);
  }

  async function createDeliverableFromForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const values = Object.fromEntries(formData);
    values.ctaTypes = formData.getAll('ctaTypes');
    window.workflowModel = String(values.model || '');
    const topic = selectedTopic(values.topicId);
    if (!topic) return;
    const submit = form.querySelector('button[type="submit"], button:not([type])');
    const source = state.virals.find(item => item.id === topic.sourceViralContentId);
    let deliverable;
    if (window.cloudStore?.isSignedIn?.() && typeof window.cloudStore.generateDeliverable === 'function') {
      if (submit) {
        submit.disabled = true;
        submit.dataset.originalText = submit.textContent;
        submit.textContent = '正在請智慧服務產生…';
      }
      try {
        deliverable = await window.cloudStore.generateDeliverable({
          topic,
          profile: state.profile,
          sourceViralContent: source || {},
          coreMessage: values.coreMessage,
          caseText: values.caseText,
          ctaTypes: values.ctaTypes,
          cta: values.cta,
          angle: topic.angle,
          model: values.model
        });
        if (!deliverable?.id) throw new Error('智慧服務沒有回傳有效的內容交付包');
        deliverable.generationSource = 'openai';
        toast('OpenAI 已產出文案、逐字稿、平台版本與分鏡');
      } catch (error) {
        deliverable = createDeliverable(topic, values);
        toast(`智慧文案服務未完成，已建立本機規則式草稿：${error.message}`);
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = submit.dataset.originalText || '送出並產生內容交付包';
        }
      }
    } else {
      deliverable = createDeliverable(topic, values);
      toast('尚未登入雲端，已建立本機規則式草稿');
    }
    state.deliverables.unshift(deliverable);
    window.workflowDeliverableId = deliverable.id;
    save();
    workflow();
  }

  function saveDeliverable(event, id) {
    event.preventDefault();
    const deliverable = state.deliverables.find(item => item.id === id);
    if (!deliverable) return;
    const formData = new FormData(event.currentTarget);
    const values = Object.fromEntries(formData);
    values.ctaTypes = formData.getAll('ctaTypes');
    deliverable.ctaTypes = ensureCtaTypes(values.ctaTypes, deliverable.segments?.find(segment => segment.key === 'cta')?.text || deliverable.cta);
    delete deliverable.ctaType;
    deliverable.transcript = String(values.transcript || '').trim();
    deliverable.caption = String(values.caption || '').trim();
    deliverable.polishNotes = String(values.polishNotes || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    deliverable.segments = deliverable.segments.map(segment => ({ ...segment, text: String(values[`segment_${segment.key}`] || '').trim() }));
    deliverable.carouselPages = deliverable.carouselPages.map((page, index) => ({ ...page, text: String(values[`carousel_${index}`] || '').trim() }));
    deliverable.platformVersions = Object.fromEntries(Object.keys(deliverable.platformVersions).map(platform => [platform, String(values[`platform_${platform}`] || '').trim()]));
    deliverable.shots = deliverable.shots.map((shot, index) => ({
      ...shot,
      label: String(values[`shot_${index}_label`] || '').trim(),
      scene: String(values[`shot_${index}_scene`] || '').trim(),
      action: String(values[`shot_${index}_action`] || '').trim(),
      check: String(values[`shot_${index}_check`] || '').trim()
    }));
    deliverable.updatedAt = new Date().toISOString();
    deliverable.status = 'READY';
    save();
    toast('內容交付包已儲存');
    workflow();
  }

  function deleteDeliverable(id) {
    if (!confirm('確定刪除這份內容交付包？')) return;
    state.deliverables = state.deliverables.filter(item => item.id !== id);
    window.workflowDeliverableId = null;
    save();
    toast('交付包已刪除');
    workflow();
  }

  function toggleWorkflowTask(id) {
    const task = state.workflowTasks.find(item => item.id === id);
    if (!task) return;
    task.completed = !task.completed;
    task.completedAt = task.completed ? new Date().toISOString() : null;
    save();
    workflow();
  }

  function copyText(value) {
    const textValue = String(value || '');
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(textValue).then(() => toast('內容已複製')).catch(() => toast('瀏覽器拒絕剪貼簿，請手動選取')); 
    else toast('請手動選取內容複製');
  }

  function localizeVisibleText() {
    const map = {
      'CONTENT STRATEGY SYSTEM': '內容策略系統',
      'AI 選題': '智慧選題',
      'Problem / Setup': '問題／設定',
      'Process': '過程',
      'Result': '結果',
      'Ending / CTA': '結尾／行動邀請',
      'Vlog 實測': '實測紀錄',
      'DASHBOARD': '儀表板',
      'ONBOARDING': '開始設定',
      'OUTLIER': '跨圈層',
      'Viral Score': '爆款評估分數',
      'Views / Followers': '觀看／粉絲',
      'Views/Followers': '觀看／粉絲',
      'Like/View': '按讚／觀看',
      'Comment/View': '留言／觀看',
      'Repeated Format Success': '重複格式成功度',
      'Niche Match': '賽道吻合度',
      'Velocity': '速度',
      'Freshness': '新鮮度',
      'Followers': '粉絲數',
      'Likes': '按讚數',
      'Comments': '留言數',
      'Food': '美食',
      'Travel': '旅遊',
      'Lifestyle': '生活風格',
      'Fashion': '時尚',
      'Beauty': '美容保養',
      'Fitness/Wellness': '健身／身心健康',
      'Money': '理財',
      'Tech/AI': '科技／人工智慧',
      'Creator': '創作者',
      'Comedy': '喜劇',
      'Education': '教育',
      'Pets': '寵物',
      'Instagram': 'Instagram 社群',
      'YouTube Shorts': 'YouTube 短影音',
      'TikTok': 'TikTok 短影音',
      'Threads': 'Threads 貼文',
      'Hook': '開場鉤子',
      'AI Analyze': '智慧分析',
      'AI API': '智慧服務介面',
      'JSON Schema': '固定格式規範',
      'JSON': '結構化格式',
      'Authentication': '登入驗證',
      'RLS': '資料庫權限規則',
      'CTA': '行動邀請',
      'V/F': '觀看／粉絲',
      'views': '觀看',
      'IDEA': '靈感中',
      'SAVED': '已收藏',
      'PLANNED': '準備拍攝',
      'FILMED': '已拍攝',
      'PUBLISHED': '已發布',
      'ARCHIVED': '已封存'
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (/^(SCRIPT|STYLE|PRE|TEXTAREA|INPUT|OPTION)$/.test(node.parentElement?.tagName)) return;
      let value = node.nodeValue;
      Object.keys(map).sort((a, b) => b.length - a.length).forEach(key => { value = value.split(key).join(map[key]); });
      value = value
        .replace(/Instagram 社群(?:\s+社群)+/g, 'Instagram 社群')
        .replace(/TikTok 短影音(?:\s+短影音)+/g, 'TikTok 短影音')
        .replace(/YouTube 短影音(?:\s+短影音)+/g, 'YouTube 短影音')
        .replace(/Threads 貼文(?:\s+貼文)+/g, 'Threads 貼文');
      node.nodeValue = value;
    });
  }

  // 舊版曾直接掃描 SCRIPT 文字，會把已執行的原始碼也改寫；覆蓋成只處理可見文字的版本。
  window.localizeUi = localizeVisibleText;
  window.localizeUiExtra = localizeVisibleText;

  function reviewDue(review) {
    return review.reviewDueAt && new Date(review.reviewDueAt).getTime() <= Date.now();
  }

  function reviews() {
    const topics = (state.topics || []).filter(topic => topic.status !== 'ARCHIVED');
    const due = state.reviews.filter(reviewDue);
    const rows = state.reviews.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(review => {
      const topic = selectedTopic(review.topicId);
      return `<article class="review-card"><div class="review-card-head"><div><strong>${escapeHtml(topic?.title || review.topicTitle || '已移除題目')}</strong><small>${review.publishedAt ? formatDateTime(review.publishedAt) : '未填發布時間'} · ${reviewDue(review) ? '可以復盤' : `預計 ${formatDateTime(review.reviewDueAt)}`}</small></div><span class="tag ${reviewDue(review) ? 'pink' : 'blue'}">${reviewDue(review) ? '待處理' : '觀察中'}</span></div><div class="review-metrics"><span>觸及 <b>${review.reach ?? '—'}</b></span><span>觀看／停留 <b>${review.watchTime ?? '—'}</b></span><span>收藏 <b>${review.saves ?? '—'}</b></span><span>分享 <b>${review.shares ?? '—'}</b></span><span>留言／私訊 <b>${review.dms ?? '—'}</b></span></div><p><strong>判斷：</strong>${escapeHtml(review.diagnosis || '尚未補上診斷')}</p><p><strong>下一個測試：</strong>${escapeHtml(review.nextTest || '尚未補上')}</p></article>`;
    }).join('');
    const topicSelect = topics.map(topic => `<option value="${escapeHtml(topic.id)}">${escapeHtml(topic.title)}</option>`).join('');
    layout('復盤實驗', '復盤實驗 ／ 發布後 48–72 小時只測一個變因', '復盤不是判斷好或壞，而是把觸及、停留、收藏、分享、留言／私訊轉成下一個具體改動。沒有實際數據時，先留白，不讓系統替你猜。', `<div class="grid-2"><section class="panel"><div class="section-head"><div><h2>新增一筆復盤</h2><p>發布時間會預設在今天；可直接改成實際時間。</p></div></div><form onsubmit="saveReview(event)"><div class="form-grid"><div class="form-field full"><label>對應題目</label><select name="topicId">${topicSelect || '<option value="">尚未有題目</option>'}</select></div>${dateTimePickerField('發布時間', 'publishedAt', localDateTimeValue())}${field('觸及／曝光', 'reach', '', { attrs: 'type="number" min="0" placeholder="實際數字"' })}${field('觀看或平均停留', 'watchTime', '', { placeholder: '例如：平均 8 秒' })}${field('收藏', 'saves', '', { attrs: 'type="number" min="0"' })}${field('分享', 'shares', '', { attrs: 'type="number" min="0"' })}${field('留言／私訊', 'dms', '', { attrs: 'type="number" min="0"' })}${field('本次只測的變因', 'variable', '', { full: true, placeholder: '例如：只改封面第一句，其他保持一致' })}${field('數據判斷', 'diagnosis', '', { tag: 'textarea', full: true, placeholder: '觸及低、開頭滑走、收藏少或 CTA 斷掉？寫出證據。' })}${field('下一個具體測試', 'nextTest', '', { tag: 'textarea', full: true, placeholder: '下一篇只改哪一件事？' })}</div><div class="form-actions"><button class="btn primary" ${topics.length ? '' : 'disabled'}>儲存復盤並排程</button></div></form><div class="notice">系統會以發布時間＋48 小時建立復盤時間；建議在 48–72 小時之間實際查看平台洞察。</div></section><section class="panel"><div class="section-head"><div><h2>待處理復盤</h2><p>${due.length} 筆已到時間</p></div><button type="button" class="btn tiny" onclick="copyText('48–72 小時復盤提醒：回到藏書閣記錄觸及、停留、收藏、分享、留言／私訊，並只決定下一個測試變因。')">複製提醒</button></div><div class="review-list">${rows || '<div class="empty"><strong>還沒有復盤紀錄</strong>發布第一支內容後回來填寫。</div>'}</div></section></div>`);
    enhanceDateTimePickers();
  }

  function saveReview(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const topic = selectedTopic(values.topicId);
    const publishedDate = parseLocalDateTime(values.publishedAt);
    const publishedAt = publishedDate.toISOString();
    const metric = value => value === '' || value === undefined ? null : Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : null;
    const review = {
      id: uid('r'),
      topicId: topic?.id || values.topicId || '',
      topicTitle: topic?.title || '',
      publishedAt,
      reviewDueAt: new Date(new Date(publishedAt).getTime() + 48 * 60 * 60 * 1000).toISOString(),
      reach: metric(values.reach),
      watchTime: String(values.watchTime || '').trim(),
      saves: metric(values.saves),
      shares: metric(values.shares),
      dms: metric(values.dms),
      variable: String(values.variable || '').trim(),
      diagnosis: String(values.diagnosis || '').trim(),
      nextTest: String(values.nextTest || '').trim(),
      createdAt: new Date().toISOString()
    };
    state.reviews.unshift(review);
    if (topic) {
      topic.reviewDueAt = review.reviewDueAt;
      if (topic.status !== 'PUBLISHED') topic.status = 'PUBLISHED';
    }
    save();
    toast('復盤已儲存，48 小時後回來補齊判斷');
    reviews();
  }

  function appendAngleField(form, beforeElement) {
    if (!form || form.querySelector('[name="angle"]')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'form-field';
    const current = window.formAngle || WORKFLOW_ANGLES[0];
    wrapper.innerHTML = `<label>內容切角</label><select name="angle">${WORKFLOW_ANGLES.map(angle => `<option ${angle === current ? 'selected' : ''}>${angle}</option>`).join('')}</select>`;
    wrapper.querySelector('select').addEventListener('change', event => { window.formAngle = event.currentTarget.value; });
    form.insertBefore(wrapper, beforeElement || form.firstElementChild);
  }

  function addAngleToForms() {
    if (route() !== '77-forms') return;
    const form = document.querySelector('.matrix-layout form');
    if (!form) return;
    appendAngleField(form, form.querySelector('[name="subject"]')?.closest('.form-field'));
    form.onsubmit = render77DraftWithDeliverable;
  }

  function addModelToForms() {
    if (route() !== '77-forms') return;
    const form = document.querySelector('.matrix-layout form');
    if (!form || form.querySelector('[name="model"]')) return;
    const subject = form.querySelector('[name="subject"]')?.closest('.form-field');
    if (!subject) return;
    const holder = document.createElement('div');
    holder.innerHTML = modelSelect(window.workflowModel || '');
    const field = holder.firstElementChild;
    if (!field) return;
    form.insertBefore(field, subject);
    field.querySelector('[name="model"]')?.addEventListener('change', event => {
      window.workflowModel = event.currentTarget.value;
    });
  }

  function addCtaToForms() {
    if (route() !== '77-forms') return;
    const form = document.querySelector('.matrix-layout form');
    if (!form || form.querySelector('.cta-type-options')) return;
    const subject = form.querySelector('[name="subject"]')?.closest('.form-field');
    if (!subject) return;
    const typeField = document.createElement('div');
    typeField.className = 'form-field full';
    typeField.innerHTML = `<label>行動邀請類型</label>${ctaTypesOptions(window.formCtaTypes || ['收藏'])}<div class="category-helper">最多選 3 個；順序會套用到主要與次要行動邀請，分享與轉發分開記錄。</div>`;
    const textField = document.createElement('div');
    textField.className = 'form-field full';
    textField.innerHTML = '<label>行動邀請文字</label><input name="cta" placeholder="例如：收藏這支，下次需要時再打開。" />';
    form.insertBefore(typeField, subject);
    form.insertBefore(textField, subject);
    const sync = () => {
      window.formCtaTypes = [...form.querySelectorAll('input[name="ctaTypes"]:checked')].map(input => input.value);
    };
    form.querySelectorAll('input[name="ctaTypes"]').forEach(input => input.addEventListener('change', sync));
    sync();
  }

  function render77DraftWithDeliverable(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const values = Object.fromEntries(formData);
    values.ctaTypes = formData.getAll('ctaTypes');
    const topic = topicDraft(values);
    topic.ctaTypes = ensureCtaTypes(values.ctaTypes, values.cta || topic.cta);
    topic.cta = String(values.cta || topic.cta || '').trim();
    window.pending77 = topic;
    window.pending77Input = values;
    window.generatedTopic = topic;
    const box = document.getElementById('formResult');
    if (!box) return;
    box.innerHTML = `<article class="result-card"><span class="tag">${escapeHtml(topic.contentTheme)} × ${escapeHtml(topic.trafficCodes[0])}</span><h3>${escapeHtml(topic.title)}</h3><p>${escapeHtml(topic.hook)}</p><div class="category-helper">依此組合產出母內容五段式、逐字稿、貼文文案、潤稿說明、七頁輪播、四平台版本與五鏡頭分鏡。</div><div class="form-actions"><button type="button" class="btn primary" onclick="generateDeliverableFrom77(this)">產出完整文案</button><button type="button" class="btn" onclick="startGenerate()">到智慧選題調整</button><button type="button" class="btn terracotta" onclick="saveGeneratedTopic()">收藏題目</button></div></article>`;
  }

  function addAngleToGenerate() {
    if (route() !== 'generate') return;
    const form = document.getElementById('generateForm');
    if (!form) return;
    appendAngleField(form.querySelector('.form-grid'), form.querySelector('[name="subject"]')?.closest('.form-field'));
  }

  function enhanceTopicDraft() {
    const previousDraft = topicDraft;
    topicDraft = function (input) {
      const draft = previousDraft(input || {});
      draft.angle = input?.angle || input?.contentAngle || window.formAngle || draft.angle || WORKFLOW_ANGLES[0];
      draft.topicScore ||= null;
      draft.reviewDueAt ||= null;
      return draft;
    };
  }

  const PLATFORM_LABELS = {
    Instagram: 'Instagram 社群',
    TikTok: 'TikTok 短影音',
    'YouTube Shorts': 'YouTube 短影音',
    Threads: 'Threads 貼文'
  };

  function platformLabel(value) {
    return PLATFORM_LABELS[value] || value;
  }

  function enhancePlatformPickers() {
    document.querySelectorAll('select[multiple][name="platforms"]:not([data-platform-enhanced])').forEach(select => {
      select.dataset.platformEnhanced = 'true';
      const wrap = document.createElement('div');
      wrap.className = 'multi-select-picker';
      select.parentNode.insertBefore(wrap, select);
      wrap.appendChild(select);

      const helper = document.createElement('div');
      helper.className = 'multi-select-helper';
      helper.textContent = '可複選，選中的平台會套用到內容工作流。';
      const summary = document.createElement('div');
      summary.className = 'multi-select-summary';
      const options = document.createElement('div');
      options.className = 'multi-select-options';
      options.setAttribute('role', 'group');
      options.setAttribute('aria-label', '主要平台');
      const choices = [...select.options].map(option => {
        const value = option.value;
        option.setAttribute('value', value);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'multi-select-option';
        button.dataset.value = value;
        button.textContent = platformLabel(value);
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
          option.selected = !option.selected;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          sync();
        });
        options.appendChild(button);
        return { option, button, value };
      });
      const sync = () => {
        const selected = choices.filter(choice => choice.option.selected);
        choices.forEach(({ option, button }) => {
          const active = option.selected;
          button.classList.toggle('selected', active);
          button.setAttribute('aria-pressed', String(active));
        });
        summary.replaceChildren();
        const count = document.createElement('span');
        count.className = selected.length ? 'multi-select-summary-count' : 'multi-select-empty';
        count.textContent = selected.length ? `已選 ${selected.length} 個平台` : '尚未選擇平台';
        summary.appendChild(count);
      };
      select.addEventListener('change', sync);
      wrap.append(helper, summary, options);
      sync();
    });
  }

  const legacySettings = settings;
  const legacyForms = forms;
  const legacyGenerate = generate;
  const legacyDashboard = dashboard;
  const legacyRender = render;
  // 保留原本的創作者設定（平台、門檻等進階欄位）；新的定位資料卡獨立成工作流入口。
  settings = function () { legacySettings(); enhancePlatformPickers(); };
  forms = function () { legacyForms(); addAngleToForms(); };
  generate = function () { legacyGenerate(); addAngleToGenerate(); };
  dashboard = function () {
    legacyDashboard();
    const completion = workflowProfileComplete(state.profile);
    const dueCount = state.reviews.filter(reviewDue).length;
    const content = document.getElementById('appContent');
    if (!content || content.querySelector('[data-workflow-summary]')) return;
    content.insertAdjacentHTML('beforeend', `<section class="panel workflow-summary" data-workflow-summary><div class="section-head"><div><h2>手冊工作流進度</h2><p>把定位、題庫、交付與復盤串成下一個可執行動作。</p></div><span class="tag ${completion.complete ? 'sage' : 'pink'}">定位 ${completion.done}/${completion.total}</span></div><div class="workflow-summary-grid"><button type="button" onclick="navigate('positioning')"><strong>定位資料卡</strong><small>補齊三支柱與素材邊界</small></button><button type="button" onclick="navigate('topic-scoring')"><strong>題目評分</strong><small>五項條件排出製作順序</small></button><button type="button" onclick="navigate('workflow')"><strong>內容交付包</strong><small>母內容、輪播、四平台、分鏡</small></button><button type="button" onclick="navigate('reviews')"><strong>復盤實驗</strong><small>${dueCount ? `有 ${dueCount} 筆待處理` : '發布後 48–72 小時回來記錄'}</small></button></div></section>`);
  };
  enhanceTopicDraft();

  function enhancedRender() {
    addWorkflowNavigation();
    ensureWorkflowState();
    const currentRoute = route();
    if (currentRoute === 'positioning') positioning();
    else if (currentRoute === 'workflow') workflow();
    else if (currentRoute === 'topic-scoring') topicScoring();
    else if (currentRoute === 'reviews') reviews();
    else legacyRender();
    addWorkflowNavigation();
    setActive();
    setTimeout(() => {
      addAngleToForms();
      addModelToForms();
      addCtaToForms();
      addAngleToGenerate();
      if (typeof enhanceSelects === 'function') enhanceSelects();
      if (typeof enhanceCategoryPicker === 'function') enhanceCategoryPicker();
      if (typeof enhancePlatformPickers === 'function') enhancePlatformPickers();
      enhanceRadarSearch();
      localizeVisibleText();
      localizeRadarNotice();
    }, 0);
  }

  window.addEventListener('hashchange', enhancedRender);
  window.removeEventListener('hashchange', legacyRender);
  window.render = enhancedRender;
  window.positioning = positioning;
  window.topicScoring = topicScoring;
  window.workflow = workflow;
  window.reviews = reviews;
  window.savePositioning = savePositioning;
  window.saveTopicScore = saveTopicScore;
  window.createDeliverableFromForm = createDeliverableFromForm;
  window.generateDeliverableFrom77 = generateDeliverableFrom77;
  window.generateFrom77 = render77DraftWithDeliverable;
  window.saveDeliverable = saveDeliverable;
  window.toggleCtaTypeCheckbox = toggleCtaTypeCheckbox;
  window.deleteDeliverable = deleteDeliverable;
  window.toggleWorkflowTask = toggleWorkflowTask;
  window.copyText = copyText;
  window.saveReview = saveReview;

  function enhanceRadarSearch() {
    if (route() !== 'radar') return;
    const filters = document.querySelector('.filters');
    const input = document.getElementById('radarQ');
    if (!filters || !input || filters.querySelector('[data-radar-search]')) return;
    const control = document.createElement('div');
    control.className = 'radar-search-control';
    control.dataset.radarSearch = 'true';
    input.parentNode.insertBefore(control, input);
    control.appendChild(input);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn radar-search-btn';
    button.setAttribute('aria-label', '搜尋爆款案例');
    button.innerHTML = '<span class="radar-search-icon" aria-hidden="true"></span><span>搜尋</span>';
    button.addEventListener('click', () => {
      renderRadarRows();
      input.focus();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        button.click();
      }
    });
    control.appendChild(button);
  }

  // 雷達頁的評估模型說明是在舊版模板中以整段字串產生，
  // 可能在一般可見文字掃描後才插入；這裡在每次渲染完成後補上中文版本。
  function localizeRadarNotice() {
    if (route() !== 'radar') return;
    const notice = '內部評估模型：觀看／粉絲 25％、速度 20％、按讚／觀看 15％、留言／觀看 10％、新鮮度 10％、重複格式成功度 10％、賽道吻合度 10％。跨圈層案例依觀看／粉絲與設定門檻判斷，非只依總觀看。';
    document.querySelectorAll('#appContent .notice').forEach(node => {
      if (node.textContent.includes('內部評估模型')) node.textContent = notice;
    });
  }

  if (window.__bookVault?.mergeCloudState) {
    const legacyMergeCloudState = window.__bookVault.mergeCloudState;
    window.__bookVault.mergeCloudState = remote => {
      legacyMergeCloudState(remote);
      // 遠端空陣列也是有效狀態；不能只在有資料時合併，否則刪除會在換裝置後復活。
      if (Array.isArray(remote?.deliverables)) state.deliverables = remote.deliverables;
      if (Array.isArray(remote?.reviews)) state.reviews = remote.reviews;
      if (Array.isArray(remote?.workflowTasks)) state.workflowTasks = remote.workflowTasks;
      ensureWorkflowState();
      save();
      enhancedRender();
    };
  }

  document.head.insertAdjacentHTML('beforeend', `<style id="workflow-enhancements-style">
    .workflow-progress{display:grid;gap:9px;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:0 0 18px}.workflow-progress>div:first-child{display:flex;align-items:center;justify-content:space-between;gap:12px}.workflow-progress strong{font-size:13px}.workflow-progress span{font-size:11px;color:var(--gray)}.progress-track{height:7px;border-radius:99px;background:#eee9e1;overflow:hidden}.progress-track i{display:block;height:100%;border-radius:inherit;background:var(--pink);transition:width .2s}.positioning-form{display:grid;gap:17px}.pillar-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.pillar-card{border:1px solid var(--line);border-radius:14px;padding:14px;background:#fffdfa}.pillar-number{font-size:11px;color:var(--pink);font-weight:800;margin-bottom:10px}.pillar-card .form-field{margin-bottom:10px}.pillar-card .form-field:last-child{margin-bottom:0}.pillar-card textarea{min-height:76px}.scoring-layout{display:grid;grid-template-columns:minmax(270px,.75fr) minmax(0,1.25fr);gap:17px}.score-topic-list{display:grid;gap:7px}.score-topic-row,.delivery-list-row{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid transparent;background:transparent;border-radius:999px;padding:11px 12px;text-align:left;color:var(--dark);transition:.15s}.score-topic-row:hover,.score-topic-row.active,.delivery-list-row:hover,.delivery-list-row.active{border-color:var(--soft-pink);background:var(--light-pink)}.score-topic-row span,.delivery-list-row span{min-width:0;display:grid;gap:3px}.score-topic-row strong,.delivery-list-row strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.score-topic-row small,.delivery-list-row small{font-size:10px;color:var(--gray);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.score-topic-row em,.delivery-list-row em{font-size:10px;font-style:normal;white-space:nowrap;color:var(--medium)}.score-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:14px 0}.score-input{border:1px solid var(--line);border-radius:14px;padding:10px;background:#fffdfa}.score-input label{display:flex;justify-content:space-between;gap:4px;font-size:11px;font-weight:800}.score-input label span{font-weight:500;color:var(--gray)}.score-input input{margin-top:8px;width:100%;text-align:center;border:1px solid var(--line);border-radius:999px;padding:8px;background:white}.score-input small{display:block;color:var(--gray);font-size:10px;line-height:1.45;margin-top:7px}.score-summary{display:flex;align-items:center;gap:9px;flex-wrap:wrap;background:var(--cream);border-radius:13px;padding:11px 13px;color:var(--medium);font-size:11px}.score-summary strong{font-size:19px;color:var(--dark)}.score-summary span:last-child{color:var(--gray)}.workflow-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(285px,.65fr);gap:18px}.workflow-layout>aside{display:grid;gap:17px;align-content:start}.workflow-task-list,.delivery-list{display:grid;gap:6px}.workflow-task{width:100%;display:grid;grid-template-columns:30px 1fr;gap:10px;text-align:left;border:1px solid transparent;background:transparent;border-radius:999px;padding:9px;color:var(--dark)}.workflow-task:hover{background:#faf5ef;border-color:var(--line)}.workflow-task.completed{background:var(--light-sage)}.task-check{width:25px;height:25px;display:grid;place-items:center;border-radius:50%;background:#eee9e1;color:var(--medium);font-weight:800;font-size:11px}.workflow-task.completed .task-check{background:var(--sage);color:white}.workflow-task span:last-child{display:grid;gap:2px}.workflow-task strong{font-size:11px}.workflow-task small{font-size:10px;color:var(--gray)}.delivery-editor{display:grid;gap:17px;margin-top:17px}.delivery-copy-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin:14px 0}.delivery-copy-field{display:grid;gap:6px;min-width:0}.delivery-copy-field.full{grid-column:1/-1}.delivery-copy-field label{font-size:11px;color:var(--medium);font-weight:800}.delivery-copy-field textarea{width:100%;min-height:150px;border:1px solid var(--line);border-radius:14px;padding:10px;background:#fff;resize:vertical;color:var(--dark);font-size:12px}.delivery-fields{display:grid;grid-template-columns:repeat(5,1fr);gap:9px}.delivery-field{display:grid;gap:6px}.delivery-field label{font-size:11px;color:var(--medium);font-weight:800}.delivery-field textarea,.carousel-page textarea,.platform-version textarea{width:100%;min-height:128px;border:1px solid var(--line);border-radius:14px;padding:10px;background:#fff;resize:vertical;color:var(--dark);font-size:12px}.carousel-pages{display:grid;gap:8px}.carousel-page{border:1px solid var(--line);border-radius:14px;padding:11px;background:#fffdfa}.carousel-page-head{display:grid;grid-template-columns:40px auto 1fr;align-items:baseline;gap:7px;margin-bottom:7px}.carousel-page-head>span{color:var(--pink);font-size:11px;font-weight:800}.carousel-page-head strong{font-size:12px}.carousel-page-head small{color:var(--gray);font-size:10px}.carousel-page textarea{min-height:74px}.platform-versions{display:grid;grid-template-columns:repeat(2,1fr);gap:11px}.platform-version{display:grid;gap:6px;border:1px solid var(--line);border-radius:14px;padding:12px;background:#fffdfa}.platform-version-head{display:flex;align-items:center;justify-content:space-between}.platform-version-head strong{font-size:13px}.platform-version>small{color:var(--gray);font-size:10px}.platform-version textarea{min-height:180px}.shot-table{display:grid;gap:4px;overflow:auto}.shot-row{display:grid;grid-template-columns:42px repeat(4,minmax(120px,1fr));gap:5px;align-items:center}.shot-row span{font-size:11px;color:var(--pink);font-weight:800;text-align:center}.shot-row input{width:100%;border:1px solid var(--line);border-radius:999px;padding:8px 9px;color:var(--dark);font-size:11px;background:#fff}.shot-head{padding:0 0 5px;border-bottom:1px solid var(--line)}.shot-head span{color:var(--gray);font-size:10px}.review-list{display:grid;gap:9px;max-height:640px;overflow:auto}.review-card{border:1px solid var(--line);border-radius:14px;padding:13px;background:#fffdfa}.review-card-head{display:flex;align-items:start;justify-content:space-between;gap:10px}.review-card-head>div{display:grid;gap:3px;min-width:0}.review-card-head strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.review-card-head small{font-size:10px;color:var(--gray)}.review-metrics{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}.review-metrics span{background:var(--cream);border-radius:999px;padding:5px 8px;font-size:10px;color:var(--gray)}.review-metrics b{color:var(--dark);margin-left:3px}.review-card p{font-size:11px;color:var(--medium);margin:5px 0}.review-card p strong{color:var(--dark)}
    .cta-type-options{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px;margin-top:8px}.cta-type-options label{display:inline-flex;flex:0 0 auto;width:auto;min-width:78px;min-height:42px;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line);border-radius:999px;padding:8px 12px;background:#fffdfa;color:var(--medium);font-size:11px;cursor:pointer;white-space:nowrap;word-break:keep-all;writing-mode:horizontal-tb}.cta-type-options label span{white-space:nowrap;word-break:keep-all;writing-mode:horizontal-tb}.cta-type-options label:has(input:checked){border-color:var(--pink);background:var(--light-pink);color:var(--dark)}.cta-type-options input[type="checkbox"]{width:16px!important;min-width:16px;height:16px;min-height:16px;margin:0;padding:0;border:0;border-radius:3px;flex:0 0 16px;accent-color:var(--pink)}
    .mobile-nav{overflow-x:auto;justify-content:flex-start;gap:4px;padding:0 7px}.mobile-nav a{flex:0 0 58px}.mobile-nav a span{font-size:16px}
    @media(max-width:1120px){.pillar-grid,.delivery-fields{grid-template-columns:1fr 1fr}.workflow-layout,.scoring-layout{grid-template-columns:1fr}.score-grid{grid-template-columns:repeat(3,1fr)}}
    @media(max-width:760px){.pillar-grid,.delivery-fields,.platform-versions,.delivery-copy-fields{grid-template-columns:1fr}.delivery-copy-field.full{grid-column:auto}.score-grid{grid-template-columns:repeat(2,1fr)}.workflow-layout{display:block}.workflow-layout>aside{margin-top:17px}.carousel-page-head{grid-template-columns:38px 1fr}.carousel-page-head small{grid-column:2}.shot-row{grid-template-columns:30px repeat(4,minmax(130px,1fr));min-width:680px}.shot-table{overflow-x:auto}.workflow-progress>div:first-child{align-items:start;flex-direction:column;gap:3px}}
  </style>`);
  document.head.insertAdjacentHTML('beforeend', `<style id="workflow-summary-style">.tag.sage{background:var(--light-sage);color:#557057}.workflow-summary{margin-top:18px}.workflow-summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.workflow-summary-grid button{display:grid;gap:4px;text-align:left;border:1px solid var(--line);background:#fffdfa;border-radius:14px;padding:12px;color:var(--dark)}.workflow-summary-grid button:hover{border-color:var(--soft-pink);background:var(--light-pink)}.workflow-summary-grid strong{font-size:12px}.workflow-summary-grid small{font-size:10px;color:var(--gray)}@media(max-width:760px){.workflow-summary-grid{grid-template-columns:1fr 1fr}}</style>`);

  document.head.insertAdjacentHTML('beforeend', `<style id="date-time-picker-style">
    .date-time-picker{position:relative;width:100%}.date-time-trigger{width:100%;min-height:42px;padding:9px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--dark);font-weight:500;text-align:left;transition:border-color .16s,box-shadow .16s}.date-time-trigger:hover,.date-time-trigger[aria-expanded="true"]{border-color:var(--pink);box-shadow:0 0 0 3px rgba(201,147,138,.12)}.date-time-trigger-chevron{color:var(--gray);font-size:1.1rem;line-height:1;transition:transform .16s}.date-time-trigger[aria-expanded="true"] .date-time-trigger-chevron{transform:rotate(180deg)}.date-time-popover{position:absolute;left:0;top:calc(100% + 9px);z-index:100;width:min(460px,calc(100vw - 32px));display:grid;grid-template-columns:minmax(0,1.1fr) minmax(170px,.9fr);gap:0;padding:14px;background:var(--paper);border:1px solid var(--line);border-radius:22px;box-shadow:0 18px 42px rgba(48,38,31,.18);color:var(--dark)}.date-time-popover[hidden]{display:none!important}.date-time-popover.above{top:auto;bottom:calc(100% + 9px)}.date-time-calendar{min-width:0;padding-right:14px}.date-time-calendar-head{display:grid;grid-template-columns:34px 1fr 34px;align-items:center;gap:7px;margin-bottom:12px}.date-time-calendar-head strong{text-align:center;font-size:13px}.date-time-nav,.date-time-today,.date-time-period{border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--medium);font-weight:700}.date-time-nav{width:32px;height:32px;padding:0;font-size:20px;line-height:1}.date-time-nav:hover,.date-time-today:hover,.date-time-period:hover{border-color:var(--pink);color:var(--pink);background:var(--cream)}.date-time-weekdays,.date-time-days{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center}.date-time-weekdays{margin-bottom:5px;color:var(--gray);font-size:10px;font-weight:700}.date-time-day{width:100%;max-width:32px;height:32px;justify-self:center;padding:0;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--dark);font-size:11px}.date-time-day:hover,.date-time-day:focus-visible{border-color:var(--soft-pink);background:var(--light-pink);outline:none}.date-time-day.outside{color:#c4beb5}.date-time-day.today{border-color:var(--soft-blue);color:var(--blue);font-weight:800}.date-time-day.selected{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:800;box-shadow:0 3px 7px rgba(122,155,173,.24)}.date-time-today{display:block;margin:10px auto 0;padding:6px 12px;font-size:10px}.date-time-time{display:grid;align-content:start;gap:12px;padding-left:14px;border-left:1px solid var(--line)}.date-time-time-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.date-time-time-head strong{font-size:13px}.date-time-time-head span{color:var(--gray);font-size:10px}.date-time-time-controls{display:grid;grid-template-columns:minmax(54px,1fr) auto minmax(54px,1fr);align-items:end;gap:5px}.date-time-time-controls label{display:grid;gap:5px;color:var(--gray);font-size:10px;font-weight:700}.date-time-time-controls input{width:100%;min-width:0;border:1px solid var(--line);border-radius:999px;padding:8px 6px;background:#fff;color:var(--dark);text-align:center;font-size:13px}.date-time-time-controls input:focus{border-color:var(--pink);outline:0;box-shadow:0 0 0 3px rgba(201,147,138,.12)}.date-time-colon{align-self:end;padding-bottom:8px;color:var(--gray);font-weight:800}.date-time-period{min-height:36px;padding:7px 10px;grid-column:1/-1;background:var(--light-blue);border-color:var(--soft-blue);color:#537184}.date-time-time p{margin:0;color:var(--gray);font-size:10px;line-height:1.55}.date-time-popover-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:7px;padding-top:12px;margin-top:2px;border-top:1px solid var(--line)}
    @media(max-width:760px){.date-time-popover{position:fixed;left:16px;right:16px;top:12px!important;bottom:12px!important;grid-template-columns:1fr;width:auto;max-height:none;overflow:auto}.date-time-calendar{padding:0 0 14px}.date-time-time{padding:14px 0 0;border-left:0;border-top:1px solid var(--line)}}
  </style>`);

  document.head.insertAdjacentHTML('beforeend', `<style id="multi-select-picker-style">
    .multi-select-picker{position:relative;display:grid;gap:9px}.multi-select-picker select{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}.multi-select-helper{font-size:10px;color:var(--gray)}.multi-select-summary{display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-height:30px}.multi-select-summary-count{font-size:10px;color:var(--gray);font-weight:700}.multi-select-selected,.multi-select-empty{display:inline-flex;align-items:center;min-height:27px;padding:5px 10px;border-radius:999px;font-size:10px;font-weight:700}.multi-select-selected{background:var(--light-blue);color:#537184}.multi-select-empty{border:1px dashed #d6d0c5;color:var(--gray)}.multi-select-options{display:flex;flex-wrap:wrap;gap:7px}.multi-select-option{border:1px solid var(--line);background:#fffefa;color:var(--medium);padding:8px 12px;border-radius:999px;font-size:11px;font-weight:700;transition:background .16s,border-color .16s,color .16s,transform .16s}.multi-select-option:hover,.multi-select-option:focus-visible{border-color:var(--pink);color:var(--pink);background:var(--cream);outline:none}.multi-select-option.selected{border-color:var(--soft-blue);background:var(--light-blue);color:#537184;box-shadow:0 0 0 2px rgba(184,207,218,.2)}
  </style>`);

  // 內容工作流的編輯器使用全寬；側欄移到編輯器下方，避免側欄結束後右側留下大片空白。
  document.head.insertAdjacentHTML('beforeend', `<style id="workflow-full-width-style">
    .workflow-layout{grid-template-columns:minmax(0,1fr)}
  </style>`);

  document.head.insertAdjacentHTML('beforeend', `<style id="radar-search-style">
    .radar-search-control{display:flex;align-items:center;gap:9px;flex:1;min-width:min(100%,360px)}.radar-search-control input{flex:1;min-width:0}.radar-search-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:9px 16px;border:0;background:#f1f3f3;color:var(--dark);font-weight:500}.radar-search-btn:hover,.radar-search-btn:focus-visible{background:#e7eae9;outline:2px solid var(--soft-blue);outline-offset:2px}.radar-search-icon{position:relative;width:15px;height:15px;border:2px solid currentColor;border-radius:50%;display:inline-block;flex:0 0 15px}.radar-search-icon::after{content:"";position:absolute;width:7px;height:2px;right:-5px;bottom:-2px;background:currentColor;border-radius:2px;transform:rotate(45deg);transform-origin:left center}@media(max-width:760px){.radar-search-control{width:100%;min-width:0}}
  </style>`);

  // 初始頁面已由舊版 render 產生；這裡立即以增強版重新繪製並接管後續路由。
  setTimeout(enhanceRadarSearch, 0);
  enhancedRender();
})();
