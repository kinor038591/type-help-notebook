const STORAGE_KEY = 'type_help_notebook_v2';

const STATUS_META = {
  todo: { label: '待調查', dot: 'bg-sky-400', text: 'text-sky-300', border: 'border-sky-500/40', bg: 'bg-sky-500/15' },
  investigating: { label: '調查中', dot: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-500/40', bg: 'bg-amber-500/15' },
  solved: { label: '已解開', dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-500/40', bg: 'bg-emerald-500/15' },
  invalid: { label: '擱置', dot: 'bg-slate-500', text: 'text-slate-400', border: 'border-slate-600/40', bg: 'bg-slate-700/20' }
};

function isDigitsOnly(str) {
  return Boolean(str) && !/[^0-9]/.test(str);
}

function isLocationCodeFormat(str) {
  return Boolean(str) && str.length >= 1 && str.length <= 5 && !/[^A-Za-z?]/.test(str);
}

// 解析指令結構：區分「00-readme 這類指引檔 (INFO)」與「01-QU-1-11 場景人員文檔」
function parseCommandStructure(rawInput) {
  let cleaned = String(rawInput || '').trim().replace(/^\(\d+\)\s*/, '').trim();
  const hasWildcard = cleaned.includes('?');
  const parts = cleaned.split('-');

  if (parts.length >= 2 && isDigitsOnly(parts[0])) {
    const seq = parts[0];

    // 情況 A：標準三段式以上「序號-場所-在場人員...」(如 01-QU-1-11, 04-ST-?????)
    if (parts.length >= 3 && isLocationCodeFormat(parts[1])) {
      const locCode = parts[1].toUpperCase();
      const rawTokens = parts.slice(2).filter(Boolean);
      const uniqueTokens = Array.from(new Set(rawTokens));
      return {
        id: cleaned,
        category: hasWildcard ? 'wildcard' : 'doc',
        seq: seq,
        type: locCode,
        rawTokens: rawTokens,
        tokens: uniqueTokens
      };
    }

    // 情況 B：兩段式「00-readme / 00-references / 00-instructions」等特殊說明文檔
    return {
      id: cleaned,
      category: hasWildcard ? 'wildcard' : 'doc',
      seq: seq,
      type: 'INFO',
      rawTokens: [],
      tokens: []
    };
  }

  return {
    id: cleaned,
    category: hasWildcard ? 'wildcard' : 'system',
    seq: '',
    type: 'SYS',
    rawTokens: [],
    tokens: []
  };
}

function getInitialState() {
  const now = Date.now();
  const rawList = [
    {
      id: 'help', status: 'solved', source: '', children: ['inbox', 'list', 'save'],
      notes: '基本系統說明指令。',
      rawOutput: "欢迎, username2!\n\n如要查阅消息列表 (1), 请输入 'inbox'.\n如要查阅文件列表 (1), 请输入 'list'.\n如要调用存档功能, 请输入 'save'."
    },
    {
      id: 'inbox', status: 'solved', source: 'help',
      children: ['01-QU-1-11', '02-EN-1-6-7-10', '03-LI-1-4-5-6-7-8-9', '04-ST-?????'],
      notes: '收件匣，提供最初的 4 個檔案線索。',
      rawOutput: '01-QU-1-11\n02-EN-1-6-7-10\n03-LI-1-4-5-6-7-8-9\n04-ST-?????'
    },
    {
      id: 'list', status: 'solved', source: 'help', children: ['00-readme'],
      notes: '列出已查閱過的文件清單。',
      rawOutput: '(1) 00-readme\n(1) 01-QU-1-11'
    },
    {
      id: 'save', status: 'solved', source: 'help', children: [],
      notes: '呼叫遊戲存檔功能。', rawOutput: ''
    },
    {
      id: '00-readme', status: 'solved', source: 'list', children: [],
      notes: '從 list 發現的編號 00 說明文件。', rawOutput: ''
    },
    {
      id: '01-QU-1-11', status: 'solved', source: 'inbox', children: [],
      notes: '已查閱！在場人員為 1 與 11。', rawOutput: ''
    },
    {
      id: '02-EN-1-6-7-10', status: 'todo', source: 'inbox', children: [],
      notes: '待輸入查閱，在場人員包含 1, 6, 7, 10。', rawOutput: ''
    },
    {
      id: '03-LI-1-4-5-6-7-8-9', status: 'todo', source: 'inbox', children: [],
      notes: '待輸入查閱，在場人員 1, 4~9。', rawOutput: ''
    },
    {
      id: '04-ST-?????', status: 'investigating', source: 'inbox', children: [],
      notes: '在場人員未知，可點選上方「在場人員組合破譯測試板」的人物按鈕自動依序號由小到大組合測試！',
      rawOutput: '',
      scratchpad: []
    }
  ];

  const commands = {};
  rawList.forEach((item, idx) => {
    const parsed = parseCommandStructure(item.id);
    commands[item.id] = {
      ...parsed,
      status: item.status,
      source: item.source,
      children: item.children || [],
      notes: item.notes || '',
      rawOutput: item.rawOutput || '',
      scratchpad: item.scratchpad || [],
      localTokenNotes: {},
      updatedAt: now - idx * 1000
    };
  });

  return {
    commands: commands,
    glossary: {
      ST: '書房 (Study)',
      '1': '約翰·霍布斯 (John Hobbes)',
      '11': '索頓 (Thornton)'
    },
    ruleHypothesis: '第一段數字為文件序號（時間段）；第二段英文字母為場所代號（如 ST=書房）；後方數字為當時在場人員編號（由小到大排列）。',
    ui: {
      selectedId: '01-QU-1-11',
      mainView: 'workspace',
      matrixMode: 'seq-type',
      listMode: 'compact',
      fontScale: 'md',
      sortBy: 'seq',
      leftWidth: 350,
      sidebarCollapsed: false,
      glossaryTab: 'tokens'
    }
  };
}

let state = loadState();
let filters = {
  search: '',
  category: 'all',
  status: 'all',
  types: new Set(),
  tokens: new Set(),
  tokenLogic: 'AND'
};
let activeTokenEdit = null;
let scratchSelectedPeople = new Set();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getInitialState();
    const parsed = JSON.parse(raw);
    const fallback = getInitialState();
    Object.values(parsed.commands || {}).forEach(cmd => {
      const reParsed = parseCommandStructure(cmd.id);
      cmd.category = reParsed.category;
      cmd.seq = reParsed.seq;
      cmd.type = reParsed.type;
      cmd.rawTokens = reParsed.rawTokens;
      cmd.tokens = reParsed.tokens;
      cmd.localTokenNotes = cmd.localTokenNotes || {};
      if (cmd.source === cmd.id) cmd.source = '';
      cmd.children = Array.from(new Set((cmd.children || []).filter(c => c !== cmd.id)));
    });
    // 清理舊版誤判的 OTHER / README 空字典項
    if (parsed.glossary) {
      delete parsed.glossary.OTHER;
      delete parsed.glossary.README;
    }
    return {
      commands: parsed.commands || fallback.commands,
      glossary: parsed.glossary || fallback.glossary,
      ruleHypothesis: parsed.ruleHypothesis !== undefined ? parsed.ruleHypothesis : fallback.ruleHypothesis,
      ui: { ...fallback.ui, ...(parsed.ui || {}) }
    };
  } catch (e) {
    console.error('讀取存檔失敗，使用預設值', e);
    return getInitialState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const el = document.getElementById('saveIndicator');
  if (el) {
    const t = new Date().toTimeString().slice(0, 8);
    el.textContent = '● 已存檔 ' + t;
  }
}

function showToast(msg, type = 'info') {
  const box = document.getElementById('toastBox');
  const div = document.createElement('div');
  const colors = type === 'success'
    ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
    : 'bg-slate-900/95 border-slate-700 text-slate-200';
  div.className = 'px-3.5 py-2 rounded-xl border text-xs shadow-xl transition-all duration-300 ' + colors;
  div.textContent = msg;
  box.appendChild(div);
  setTimeout(() => {
    div.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => div.remove(), 300);
  }, 2400);
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function copyText(text, label = '已複製指令') {
  navigator.clipboard.writeText(text).then(() => {
    showToast(label + '：' + text, 'success');
  });
}

// 自動從文字中擷取 [編號 姓名] 格式（例如 [1 约翰·霍布斯 (John Hobbes)] 或 [5 Martha]）
function extractCharacterNamesFromText(text) {
  const regex = /\[\s*(\d{1,3})\s+([^\[\]\n]{1,40}?)\s*\]/g;
  let match;
  let updatedCount = 0;
  while ((match = regex.exec(text)) !== null) {
    const num = match[1];
    const name = match[2].trim();
    // 排除單純系統提示如 [@] 或太短無意義符號
    if (name && !state.glossary[num]) {
      state.glossary[num] = name;
      updatedCount++;
    }
  }
  return updatedCount;
}

// ==================== 渲染主控 ====================
function renderAll() {
  applyUiSettings();
  renderTopStatsAndGlossaryBadge();
  renderSourceDropdowns();
  renderFilterDrawer();
  renderCommandList();

  if (state.ui.mainView === 'workspace') {
    renderWorkspace();
  } else if (state.ui.mainView === 'matrix') {
    renderMatrixView();
  } else if (state.ui.mainView === 'network') {
    renderNetworkView();
  }
}

function applyUiSettings() {
  document.body.setAttribute('data-font-scale', state.ui.fontScale || 'md');
  document.querySelectorAll('.font-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.font === state.ui.fontScale);
  });

  document.querySelectorAll('.main-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mainView === state.ui.mainView);
  });

  document.getElementById('viewWorkspace').classList.toggle('hidden', state.ui.mainView !== 'workspace');
  document.getElementById('viewMatrix').classList.toggle('hidden', state.ui.mainView !== 'matrix');
  document.getElementById('viewNetwork').classList.toggle('hidden', state.ui.mainView !== 'network');

  document.querySelectorAll('.list-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.listMode === state.ui.listMode);
  });

  document.querySelectorAll('.matrix-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.matrixMode === state.ui.matrixMode);
  });

  const leftPane = document.getElementById('leftPane');
  const resizer = document.getElementById('paneResizer');
  if (state.ui.sidebarCollapsed) {
    leftPane.classList.add('hidden');
    resizer.classList.add('hidden');
  } else {
    leftPane.classList.remove('hidden');
    resizer.classList.remove('hidden');
    leftPane.style.width = (state.ui.leftWidth || 350) + 'px';
  }
}

function renderTopStatsAndGlossaryBadge() {
  const all = Object.values(state.commands);
  const counts = { total: all.length, todo: 0, investigating: 0, solved: 0 };
  all.forEach(c => {
    if (counts[c.status] !== undefined) counts[c.status]++;
  });

  const statsBar = document.getElementById('statsBar');
  statsBar.innerHTML = [
    '<button class="px-1.5 py-0.5 rounded hover:bg-slate-800 ' + (filters.status === 'all' ? 'text-white font-bold' : 'text-slate-400') + '" onclick="setStatusFilter(\'all\')">總計 ' + counts.total + '</button>',
    '<span class="text-slate-700">|</span>',
    '<button class="px-1.5 py-0.5 rounded hover:bg-slate-800 text-sky-400 ' + (filters.status === 'todo' ? 'underline font-bold' : '') + '" onclick="setStatusFilter(\'todo\')">● 待調查 ' + counts.todo + '</button>',
    '<button class="px-1.5 py-0.5 rounded hover:bg-slate-800 text-amber-400 ' + (filters.status === 'investigating' ? 'underline font-bold' : '') + '" onclick="setStatusFilter(\'investigating\')">● 調查中 ' + counts.investigating + '</button>',
    '<button class="px-1.5 py-0.5 rounded hover:bg-slate-800 text-emerald-400 ' + (filters.status === 'solved' ? 'underline font-bold' : '') + '" onclick="setStatusFilter(\'solved\')">● 已解開 ' + counts.solved + '</button>'
  ].join('');

  const gCount = Object.keys(state.glossary).filter(k => state.glossary[k] && state.glossary[k].trim()).length;
  document.getElementById('glossaryCountBadge').textContent = gCount;
}

window.setStatusFilter = function(status) {
  filters.status = filters.status === status ? 'all' : status;
  renderAll();
};

function renderSourceDropdowns() {
  const ids = Object.keys(state.commands).sort();
  const quickSelect = document.getElementById('quickSourceSelect');
  const currentQuick = quickSelect.value;
  quickSelect.innerHTML = '<option value="">預設來源：無</option>' +
    ids.map(id => '<option value="' + escapeHtml(id) + '">' + escapeHtml(id) + '</option>').join('');
  quickSelect.value = currentQuick;
}

// ==================== 篩選與左側清單 ====================
function renderFilterDrawer() {
  const all = Object.values(state.commands);
  const typeCounts = {};
  const tokenCounts = {};

  all.forEach(c => {
    if (c.type && c.type !== 'SYS' && c.type !== 'INFO') {
      typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
    }
    (c.tokens || []).forEach(t => {
      if (!t.includes('?')) tokenCounts[t] = (tokenCounts[t] || 0) + 1;
    });
  });

  const cats = [
    { key: 'all', label: '全部' },
    { key: 'doc', label: '文檔' },
    { key: 'wildcard', label: '未知?' },
    { key: 'system', label: '系統' }
  ];
  document.getElementById('catFilterBar').innerHTML = cats.map(c => {
    const cls = filters.category === c.key
      ? 'bg-emerald-600 text-white border-emerald-500'
      : 'bg-slate-900 text-slate-400 border-slate-800';
    return '<button class="px-2 py-0.5 rounded border text-xs ' + cls + '" onclick="filters.category=\'' + c.key + '\';renderAll()">' + c.label + '</button>';
  }).join('');

  const statuses = [
    { key: 'all', label: '全部狀態' },
    { key: 'todo', label: '待調查' },
    { key: 'investigating', label: '調查中' },
    { key: 'solved', label: '已解開' },
    { key: 'invalid', label: '擱置' }
  ];
  document.getElementById('statusFilterBar').innerHTML = statuses.map(s => {
    const cls = filters.status === s.key
      ? 'bg-sky-600 text-white border-sky-500'
      : 'bg-slate-900 text-slate-400 border-slate-800';
    return '<button class="px-2 py-0.5 rounded border text-xs ' + cls + '" onclick="filters.status=\'' + s.key + '\';renderAll()">' + s.label + '</button>';
  }).join('');

  document.getElementById('typeFilterBar').innerHTML = Object.keys(typeCounts).sort().map(t => {
    const active = filters.types.has(t);
    const locName = state.glossary[t] ? (' ' + state.glossary[t]) : '';
    const cls = active
      ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
      : 'bg-slate-900 text-slate-300 border-slate-800';
    return '<button class="px-2 py-0.5 rounded border font-mono text-xs ' + cls + '" onclick="toggleSetFilter(\'types\',\'' + escapeHtml(t) + '\')">' + escapeHtml(t) + escapeHtml(locName) + ' <span class="opacity-60">(' + typeCounts[t] + ')</span></button>';
  }).join('');

  const sortedTokens = Object.keys(tokenCounts).sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  document.getElementById('tokenFilterBar').innerHTML = sortedTokens.map(tk => {
    const active = filters.tokens.has(tk);
    const personName = state.glossary[tk] ? (' ' + state.glossary[tk].split(' ')[0]) : '';
    const cls = active
      ? 'bg-sky-500 text-slate-950 font-bold border-sky-400'
      : 'bg-slate-900 text-slate-300 border-slate-800';
    return '<button class="px-2 py-0.5 rounded border font-mono text-xs ' + cls + '" onclick="toggleSetFilter(\'tokens\',\'' + escapeHtml(tk) + '\')">#' + escapeHtml(tk) + escapeHtml(personName) + ' <span class="opacity-60">(' + tokenCounts[tk] + ')</span></button>';
  }).join('');

  let activeCount = 0;
  const pills = [];
  if (filters.category !== 'all') { activeCount++; pills.push('分類:' + filters.category); }
  if (filters.status !== 'all') { activeCount++; pills.push('狀態:' + (STATUS_META[filters.status] ? STATUS_META[filters.status].label : '')); }
  filters.types.forEach(t => { activeCount++; pills.push('場所:' + t); });
  filters.tokens.forEach(t => { activeCount++; pills.push('人員:#' + t); });

  const badge = document.getElementById('activeFilterCount');
  badge.textContent = activeCount;
  badge.classList.toggle('hidden', activeCount === 0);

  const pillsBox = document.getElementById('activeFilterPills');
  pillsBox.classList.toggle('hidden', pills.length === 0);
  pillsBox.innerHTML = pills.map(p => '<span class="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono text-[11px]">' + escapeHtml(p) + '</span>').join('');
}

window.toggleSetFilter = function(field, val) {
  if (filters[field].has(val)) filters[field].delete(val);
  else filters[field].add(val);
  renderAll();
};

function getFilteredCommands() {
  const q = filters.search.trim().toLowerCase();
  return Object.values(state.commands).filter(cmd => {
    if (filters.category !== 'all' && cmd.category !== filters.category) return false;
    if (filters.status !== 'all' && cmd.status !== filters.status) return false;
    if (filters.types.size > 0 && !filters.types.has(cmd.type)) return false;
    if (filters.tokens.size > 0) {
      const arr = Array.from(filters.tokens);
      const hasMatch = filters.tokenLogic === 'AND'
        ? arr.every(t => (cmd.tokens || []).includes(t))
        : arr.some(t => (cmd.tokens || []).includes(t));
      if (!hasMatch) return false;
    }
    if (q) {
      const locText = state.glossary[cmd.type] || '';
      const peopleText = (cmd.tokens || []).map(t => state.glossary[t] || '').join(' ');
      const hay = [cmd.id, cmd.notes, cmd.rawOutput, cmd.source, locText, peopleText].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const mode = state.ui.sortBy;
    if (mode === 'seq') {
      if (a.category === 'system' && b.category !== 'system') return -1;
      if (a.category !== 'system' && b.category === 'system') return 1;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    }
    if (mode === 'status') {
      const order = { investigating: 1, todo: 2, solved: 3, invalid: 4 };
      return (order[a.status] || 9) - (order[b.status] || 9);
    }
    if (mode === 'type') return (a.type || '').localeCompare(b.type || '') || a.id.localeCompare(b.id);
    if (mode === 'updated') return (b.updatedAt || 0) - (a.updatedAt || 0);
    return a.id.localeCompare(b.id);
  });
}

// 渲染左側清單：修復簡化模式下指令名稱被擠掉的問題 (指令名稱加上 shrink-0 確保 100% 完整顯示)
function renderCommandList() {
  const list = getFilteredCommands();
  const box = document.getElementById('cmdListContainer');
  if (list.length === 0) {
    box.innerHTML = '<div class="text-center py-8 text-xs text-slate-500">沒有符合篩選條件的指令</div>';
    return;
  }

  const isCompact = state.ui.listMode === 'compact';

  box.innerHTML = list.map(cmd => {
    const active = cmd.id === state.ui.selectedId;
    const st = STATUS_META[cmd.status] || STATUS_META.todo;
    const locName = (cmd.type && cmd.type !== 'SYS' && cmd.type !== 'INFO' && state.glossary[cmd.type])
      ? state.glossary[cmd.type]
      : '';

    if (isCompact) {
      const rowCls = active
        ? 'bg-emerald-950/40 border-emerald-500/70'
        : 'bg-[#090d16] hover:bg-slate-900/90 border-slate-800/80';
      const childTag = (cmd.children && cmd.children.length)
        ? '<span class="text-[11px] font-mono text-sky-400 shrink-0">+' + cmd.children.length + '</span>'
        : '';
      // 簡化模式下：指令名稱強制 shrink-0 完整顯示，右側剩餘空間顯示「[場所名] 筆記摘要」
      const summaryText = (locName ? ('[' + locName + '] ') : '') + (cmd.notes || '');

      return [
        '<div onclick="selectCommand(\'' + escapeHtml(cmd.id) + '\')" class="group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition ' + rowCls + '">',
          '<div class="flex items-center gap-2 min-w-0 flex-1">',
            '<span class="w-2 h-2 rounded-full shrink-0 ' + st.dot + '" title="' + st.label + '"></span>',
            '<span class="cmd-scalable font-mono font-bold text-white shrink-0 whitespace-nowrap">' + escapeHtml(cmd.id) + '</span>',
            '<span class="text-xs text-slate-400 truncate min-w-0 flex-1">' + escapeHtml(summaryText) + '</span>',
          '</div>',
          '<div class="flex items-center gap-1 shrink-0">',
            childTag,
            '<button onclick="event.stopPropagation();copyText(\'' + escapeHtml(cmd.id) + '\')" class="opacity-75 group-hover:opacity-100 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 whitespace-nowrap">複製</button>',
          '</div>',
        '</div>'
      ].join('');
    }

    // 詳細卡片模式
    const rawTokensHtml = (cmd.rawTokens || []).map((tk, idx) => {
      const localNote = cmd.localTokenNotes ? cmd.localTokenNotes[idx] : '';
      const globalNote = state.glossary[tk];
      const hint = localNote || globalNote;
      const hintSpan = hint ? '<span class="text-sky-200/90 ml-1">(' + escapeHtml(hint) + ')</span>' : '';
      return '<span class="badge-scalable px-1.5 py-0.5 rounded bg-sky-950/60 border border-sky-500/30 text-sky-300 font-mono">👤#' + escapeHtml(tk) + hintSpan + '</span>';
    }).join('');

    const cardCls = active
      ? 'bg-emerald-950/30 border-emerald-500/60'
      : 'bg-[#090d16] hover:bg-slate-900/90 border-slate-800';

    const locBadge = (cmd.type && cmd.type !== 'SYS' && cmd.type !== 'INFO')
      ? '<span class="badge-scalable px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono">📍' + escapeHtml(cmd.type) + (locName ? (' · ' + escapeHtml(locName)) : '') + '</span>'
      : '';

    const metaRow = (locBadge || rawTokensHtml)
      ? '<div class="flex flex-wrap gap-1 pt-0.5">' + locBadge + rawTokensHtml + '</div>'
      : '';

    const noteRow = cmd.notes
      ? '<p class="content-scalable text-slate-300 line-clamp-2">' + escapeHtml(cmd.notes) + '</p>'
      : '';

    return [
      '<div onclick="selectCommand(\'' + escapeHtml(cmd.id) + '\')" class="p-3 rounded-xl border cursor-pointer transition space-y-1.5 ' + cardCls + '">',
        '<div class="flex items-center justify-between gap-2">',
          '<div class="flex items-center gap-2 min-w-0">',
            '<span class="px-2 py-0.5 rounded-full text-[11px] border ' + st.bg + ' ' + st.text + ' ' + st.border + ' whitespace-nowrap shrink-0">● ' + st.label + '</span>',
            '<span class="cmd-scalable font-mono font-bold text-white break-all">' + escapeHtml(cmd.id) + '</span>',
          '</div>',
          '<button onclick="event.stopPropagation();copyText(\'' + escapeHtml(cmd.id) + '\')" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 whitespace-nowrap shrink-0">複製</button>',
        '</div>',
        metaRow,
        noteRow,
      '</div>'
    ].join('');
  }).join('');
}

window.selectCommand = function(id) {
  if (!state.commands[id]) return;
  if (state.ui.selectedId !== id) {
    scratchSelectedPeople.clear();
  }
  state.ui.selectedId = id;
  state.ui.mainView = 'workspace';
  saveState();
  renderAll();
};

// ==================== 右側視圖 1：筆記工作台 ====================
function renderWorkspace() {
  const cmd = state.commands[state.ui.selectedId] || Object.values(state.commands)[0];
  if (!cmd) return;
  state.ui.selectedId = cmd.id;

  const header = document.getElementById('cmdStickyHeader');
  const catBadge = cmd.category === 'system'
    ? '系統指令'
    : (cmd.type === 'INFO' ? '指引文檔' : (cmd.category === 'wildcard' ? '未知待破譯' : '調查文檔'));
  const locMeaning = state.glossary[cmd.type];

  const tokenFreq = {};
  (cmd.rawTokens || []).forEach(t => { tokenFreq[t] = (tokenFreq[t] || 0) + 1; });

  const positionalBadgesHtml = (cmd.rawTokens || []).map((tk, idx) => {
    const isDup = tokenFreq[tk] > 1;
    const localNote = cmd.localTokenNotes ? cmd.localTokenNotes[idx] : '';
    const globalNote = state.glossary[tk];
    const displayNote = localNote
      ? '📌 ' + localNote
      : (globalNote ? globalNote : '點此設定人員姓名');
    const btnCls = localNote
      ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
      : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/30 text-sky-300';
    const prefixLabel = isDup ? ('位置' + (idx + 1) + ':') : '👤';

    return '<button onclick="openTokenEditModal(\'' + escapeHtml(cmd.id) + '\', \'' + escapeHtml(tk) + '\', ' + idx + ')" class="badge-scalable px-2.5 py-0.5 rounded-lg border font-mono transition flex items-center gap-1 ' + btnCls + '" title="點擊設定此編號的人物姓名或本篇備註"><span>' + prefixLabel + '#' + escapeHtml(tk) + '</span><span class="text-xs opacity-90">(' + escapeHtml(displayNote) + ')</span></button>';
  }).join('');

  const statusButtonsHtml = Object.entries(STATUS_META).map(([key, meta]) => {
    const activeCls = cmd.status === key
      ? (meta.bg + ' ' + meta.text + ' ' + meta.border + ' font-bold')
      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200';
    return '<button onclick="updateCmdStatus(\'' + key + '\')" class="px-2.5 py-0.5 rounded-full text-xs border whitespace-nowrap transition ' + activeCls + '">● ' + meta.label + '</button>';
  }).join('');

  const seqNote = cmd.seq ? (state.glossary['SEQ_' + cmd.seq] || '') : '';
  const seqBadgeHtml = cmd.seq
    ? '<button onclick="openTokenEditModal(\'' + escapeHtml(cmd.id) + '\', \'SEQ_' + escapeHtml(cmd.seq) + '\', -1)" class="badge-scalable px-2.5 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-mono">🕒 序號: ' + escapeHtml(cmd.seq) + (seqNote ? (' (' + escapeHtml(seqNote) + ')') : '') + '</button>'
    : '';

  const locButtonHtml = (cmd.type && cmd.type !== 'SYS' && cmd.type !== 'INFO')
    ? '<button onclick="openTokenEditModal(\'' + escapeHtml(cmd.id) + '\', \'' + escapeHtml(cmd.type) + '\', -1)" class="badge-scalable px-2.5 py-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-mono">📍 場所: ' + escapeHtml(cmd.type) + ' (' + escapeHtml(locMeaning || '點此設定場所名稱') + ')</button>'
    : '';

  const docStructureRow = (seqBadgeHtml || locButtonHtml || positionalBadgesHtml)
    ? '<div class="flex items-center flex-wrap gap-1.5 pt-1">' + seqBadgeHtml + locButtonHtml + positionalBadgesHtml + '</div>'
    : '';

  header.innerHTML = [
    '<div class="flex flex-wrap items-center justify-between gap-2">',
      '<div class="flex items-center gap-2 flex-wrap min-w-0">',
        '<span class="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs whitespace-nowrap">' + catBadge + '</span>',
        '<h2 class="font-mono font-bold text-xl text-white break-all">' + escapeHtml(cmd.id) + '</h2>',
        '<button onclick="copyText(\'' + escapeHtml(cmd.id) + '\')" class="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-medium whitespace-nowrap"><i class="fa-regular fa-copy mr-1"></i>複製指令</button>',
        '<button onclick="renameCurrentCommand()" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs whitespace-nowrap"><i class="fa-solid fa-pen mr-1"></i>改名</button>',
      '</div>',
      '<div class="flex items-center gap-1.5 shrink-0">',
        '<button onclick="openFocusModal()" class="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs font-medium whitespace-nowrap"><i class="fa-solid fa-table-columns mr-1"></i>並排大視窗</button>',
        '<button onclick="deleteCurrentCommand()" class="px-2.5 py-1 rounded-lg bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 border border-rose-800/50 text-xs whitespace-nowrap" title="刪除此指令"><i class="fa-solid fa-trash"></i></button>',
      '</div>',
    '</div>',
    '<div class="flex flex-wrap items-center justify-between gap-2 pt-0.5">',
      '<div class="flex items-center gap-1.5 flex-wrap">',
        '<span class="text-xs text-slate-400 mr-1">狀態：</span>',
        statusButtonsHtml,
      '</div>',
      '<div class="flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap">',
        '<button onclick="toggleAllCards(true)" class="hover:text-white">全部展開</button>',
        '<span>·</span>',
        '<button onclick="toggleAllCards(false)" class="hover:text-white">全部收合</button>',
      '</div>',
    '</div>',
    docStructureRow
  ].join('');

  // 區塊 A：關聯追蹤
  const srcText = cmd.source || '無';
  const childCount = (cmd.children && cmd.children.length) ? cmd.children.length : 0;
  document.getElementById('relationSummaryText').textContent = '(來源: ' + srcText + ' · 衍生: ' + childCount + ')';

  const srcSelect = document.getElementById('detailSourceSelect');
  const allIds = Object.keys(state.commands).filter(id => id !== cmd.id).sort();
  srcSelect.innerHTML = '<option value="">-- 無來源 / 初始指令 --</option>' +
    allIds.map(id => '<option value="' + escapeHtml(id) + '">' + escapeHtml(id) + '</option>').join('');
  srcSelect.value = cmd.source || '';

  const childrenBox = document.getElementById('childrenPillsContainer');
  if (!cmd.children || cmd.children.length === 0) {
    childrenBox.innerHTML = '<span class="text-xs text-slate-500">尚無衍生指令，可由下方輸入或點右上角「掃描內文指令」自動抓取</span>';
  } else {
    childrenBox.innerHTML = cmd.children.map(cid => {
      const target = state.commands[cid];
      const st = STATUS_META[(target && target.status) ? target.status : 'todo'];
      const tip = (target && target.notes) ? target.notes : '點擊跳轉';
      return [
        '<div class="inline-flex items-center rounded-lg border ' + st.border + ' ' + st.bg + ' overflow-hidden">',
          '<button onclick="selectCommand(\'' + escapeHtml(cid) + '\')" class="px-2.5 py-1 text-xs font-mono ' + st.text + ' hover:underline flex items-center gap-1.5" title="' + escapeHtml(tip) + '">',
            '<span class="w-1.5 h-1.5 rounded-full ' + st.dot + '"></span>',
            '<span>' + escapeHtml(cid) + '</span>',
          '</button>',
          '<button onclick="removeChildRelation(\'' + escapeHtml(cid) + '\')" class="px-1.5 py-1 text-xs text-slate-400 hover:text-rose-300 hover:bg-rose-950/60 border-l border-slate-700/60" title="移除關聯">×</button>',
        '</div>'
      ].join('');
    }).join('');
  }

  // 區塊 B：在場人員勾選組合破譯測試板
  const scratchBody = document.getElementById('bodyScratchpad');
  const isWildcard = cmd.id.includes('?') || (cmd.scratchpad && cmd.scratchpad.length > 0);
  scratchBody.classList.toggle('hidden', !isWildcard);
  const sCount = (cmd.scratchpad && cmd.scratchpad.length) ? cmd.scratchpad.length : 0;
  document.getElementById('scratchCountBadge').textContent = sCount + ' 筆測試';

  const prefix = (cmd.seq && cmd.type && cmd.type !== 'INFO' && cmd.type !== 'SYS')
    ? (cmd.seq + '-' + cmd.type)
    : cmd.id.replace(/-\?+$/, '').replace(/\?+/g, '');

  const allPeople = getAllDiscoveredTokens();
  const peopleButtonsHtml = allPeople.map(tk => {
    const isSelected = scratchSelectedPeople.has(tk);
    const pName = state.glossary[tk] ? (' ' + state.glossary[tk].split(' ')[0]) : '';
    const btnCls = isSelected
      ? 'bg-amber-500 text-slate-950 font-bold border-amber-300'
      : 'bg-slate-800 hover:bg-slate-700 text-sky-300 border-slate-700';
    return '<button onclick="toggleScratchPerson(\'' + escapeHtml(prefix) + '\', \'' + escapeHtml(tk) + '\')" class="px-2 py-0.5 rounded border font-mono transition ' + btnCls + '">#' + escapeHtml(tk) + escapeHtml(pName) + '</button>';
  }).join('');

  document.getElementById('scratchQuickTokens').innerHTML =
    '<span class="text-slate-400">點選在場人員（自動由小到大排序）：</span>' +
    peopleButtonsHtml +
    (scratchSelectedPeople.size > 0 ? '<button onclick="clearScratchPeople(\'' + escapeHtml(prefix) + '\')" class="px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 text-[11px]">清空重選</button>' : '');

  const scratchListEl = document.getElementById('scratchList');
  if (!cmd.scratchpad || cmd.scratchpad.length === 0) {
    scratchListEl.innerHTML = '<div class="text-xs text-slate-500">尚無測試紀錄</div>';
  } else {
    scratchListEl.innerHTML = cmd.scratchpad.map((item, idx) => {
      const txtCls = item.status === 'fail'
        ? 'line-through text-slate-500'
        : (item.status === 'ok' ? 'text-emerald-400 font-bold' : 'text-slate-200');
      const failBtnCls = item.status === 'fail' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-rose-300';
      return [
        '<div class="flex items-center justify-between gap-2 bg-[#090d16] px-3 py-1.5 rounded-lg border border-slate-800 text-xs">',
          '<span class="font-mono ' + txtCls + '">' + escapeHtml(item.text) + '</span>',
          '<div class="flex items-center gap-1 shrink-0">',
            '<button onclick="copyText(\'' + escapeHtml(item.text) + '\')" class="px-2 py-0.5 rounded bg-slate-800 text-slate-300">複製</button>',
            '<button onclick="setScratchStatus(' + idx + ', \'fail\')" class="px-2 py-0.5 rounded ' + failBtnCls + '">無效</button>',
            '<button onclick="promoteScratchToCommand(' + idx + ')" class="px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">有效並轉正式指令</button>',
            '<button onclick="deleteScratchItem(' + idx + ')" class="px-1.5 py-0.5 text-slate-500 hover:text-rose-400">×</button>',
          '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  // 區塊 C & D：筆記與原文
  const noteInput = document.getElementById('detailNoteInput');
  const rawInput = document.getElementById('detailRawInput');
  if (document.activeElement !== noteInput) noteInput.value = cmd.notes || '';
  if (document.activeElement !== rawInput) rawInput.value = cmd.rawOutput || '';
  document.getElementById('noteCharCount').textContent = '(' + (cmd.notes || '').length + ' 字)';
  document.getElementById('rawCharCount').textContent = '(' + (cmd.rawOutput || '').length + ' 字)';

  renderMentionedCommands(cmd);
  renderSearchHighlightBanner(cmd);
}

// 勾選在場人員時，自動依數字由小到大排序並組合出完整指令
window.toggleScratchPerson = function(prefix, token) {
  if (scratchSelectedPeople.has(token)) scratchSelectedPeople.delete(token);
  else scratchSelectedPeople.add(token);

  const sorted = Array.from(scratchSelectedPeople).sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const input = document.getElementById('scratchInput');
  input.value = sorted.length > 0 ? (prefix + '-' + sorted.join('-')) : (prefix + '-');
  renderWorkspace();
  input.focus();
};

window.clearScratchPeople = function(prefix) {
  scratchSelectedPeople.clear();
  document.getElementById('scratchInput').value = prefix + '-';
  renderWorkspace();
};

function renderMentionedCommands(cmd) {
  const combined = (cmd.notes || '') + '\n' + (cmd.rawOutput || '');
  const found = Object.keys(state.commands).filter(id => id !== cmd.id && id.length >= 2 && combined.includes(id));
  const box = document.getElementById('noteMentionedCmds');
  if (found.length === 0) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = '<span class="text-slate-400">內文提及的已建檔指令：</span>' +
    found.map(id => '<button onclick="selectCommand(\'' + escapeHtml(id) + '\')" class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono hover:underline">🔗 ' + escapeHtml(id) + '</button>').join('');
}

function renderSearchHighlightBanner(cmd) {
  const q = filters.search.trim();
  const banner = document.getElementById('rawHighlightBanner');
  if (!q || !(cmd.rawOutput || '').toLowerCase().includes(q.toLowerCase())) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('(' + escapedQ + ')', 'gi');
  const highlighted = escapeHtml(cmd.rawOutput).replace(regex, function(match) {
    return '<mark class="bg-amber-400 text-slate-950 px-0.5 rounded font-bold">' + match + '</mark>';
  });
  banner.innerHTML = '<div class="text-amber-300 font-bold mb-1">🔍 搜尋關鍵字「' + escapeHtml(q) + '」高亮預覽：</div><div class="font-mono whitespace-pre-wrap text-slate-200 max-h-40 overflow-y-auto">' + highlighted + '</div>';
}

// ==================== 右側視圖 2：全寬矩陣全覽 (雙模式) ====================
function renderMatrixView() {
  const container = document.getElementById('matrixFullContainer');
  const docs = Object.values(state.commands).filter(c => c.category !== 'system' && c.type !== 'INFO');

  if (state.ui.matrixMode === 'seq-type') {
    const seqs = Array.from(new Set(docs.map(d => d.seq).filter(Boolean))).sort((a, b) => Number(a) - Number(b));
    const types = Array.from(new Set(docs.map(d => d.type).filter(Boolean))).sort();

    const headCells = types.map(t => {
      return '<th class="p-3 font-mono text-amber-300 min-w-[150px]"><div class="font-bold text-sm">📍 ' + escapeHtml(t) + '</div><div class="text-[11px] text-slate-300 font-normal truncate">' + escapeHtml(state.glossary[t] || '未設定場所名') + '</div></th>';
    }).join('');

    const bodyRows = seqs.map(seq => {
      const seqNote = state.glossary['SEQ_' + seq] || '';
      const cells = types.map(t => {
        const matches = docs.filter(d => d.seq === seq && d.type === t);
        if (matches.length === 0) {
          return '<td class="p-2 text-center"><button onclick="quickCreateFromMatrix(\'' + escapeHtml(seq) + '\',\'' + escapeHtml(t) + '\')" class="w-full py-2 rounded border border-dashed border-slate-800 hover:border-emerald-500/50 text-slate-600 hover:text-emerald-400 transition" title="點擊快速建立 ' + escapeHtml(seq) + '-' + escapeHtml(t) + '-?????">+</button></td>';
        }
        const itemsHtml = matches.map(m => {
          const st = STATUS_META[m.status] || STATUS_META.todo;
          const suffix = (m.rawTokens && m.rawTokens.length > 0) ? ('👥 ' + m.rawTokens.join('-')) : m.id;
          const peopleNames = (m.rawTokens || []).map(tk => state.glossary[tk] ? state.glossary[tk].split(' ')[0] : ('#' + tk)).join(', ');
          return [
            '<div onclick="selectCommand(\'' + escapeHtml(m.id) + '\')" class="p-2 rounded-lg border ' + st.border + ' ' + st.bg + ' cursor-pointer hover:brightness-125 transition">',
              '<div class="flex items-center justify-between gap-1">',
                '<span class="font-mono font-bold ' + st.text + ' text-xs flex items-center gap-1.5">',
                  '<span class="w-2 h-2 rounded-full ' + st.dot + '"></span>',
                  '<span>' + escapeHtml(suffix) + '</span>',
                '</span>',
                '<span class="text-[10px] text-slate-400 font-mono">' + escapeHtml(m.id) + '</span>',
              '</div>',
              '<div class="text-[11px] text-sky-200/80 truncate mt-1">' + escapeHtml(peopleNames) + '</div>',
              (m.notes ? '<div class="text-[11px] text-slate-400 truncate mt-0.5">' + escapeHtml(m.notes) + '</div>' : ''),
            '</div>'
          ].join('');
        }).join('');
        return '<td class="p-2 align-top space-y-1.5">' + itemsHtml + '</td>';
      }).join('');

      return '<tr class="hover:bg-slate-900/40"><th class="p-3 font-mono font-bold text-sm text-slate-200"><div>🕒 #' + escapeHtml(seq) + '</div><div class="text-[11px] text-slate-400 font-normal">' + escapeHtml(seqNote) + '</div></th>' + cells + '</tr>';
    }).join('');

    container.innerHTML = '<table class="matrix-table w-full text-left border-t border-l border-slate-800 rounded-xl overflow-hidden text-xs"><thead><tr><th class="p-3 font-mono text-slate-400 w-28">序號 \\ 場所</th>' + headCells + '</tr></thead><tbody>' + bodyRows + '</tbody></table>';
    return;
  }

  // 子模式 ②：文檔 × 在場人員行蹤交叉比對表
  const allTokens = getAllDiscoveredTokens();
  const sortedDocs = [...docs].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const tokenHeaders = allTokens.map(tk => {
    const gNote = state.glossary[tk] || '';
    const shortName = gNote ? gNote.split('(')[0].trim() : '';
    return '<th class="p-2 text-center font-mono text-sky-300 min-w-[68px]" title="' + escapeHtml(gNote) + '"><div class="font-bold">#' + escapeHtml(tk) + '</div><div class="text-[11px] text-slate-300 font-normal truncate max-w-[76px]">' + escapeHtml(shortName) + '</div></th>';
  }).join('');

  const docRows = sortedDocs.map(d => {
    const st = STATUS_META[d.status] || STATUS_META.todo;
    const locName = state.glossary[d.type] ? (' [' + state.glossary[d.type].split('(')[0].trim() + ']') : '';
    const cells = allTokens.map(tk => {
      const count = (d.rawTokens || []).filter(x => x === tk).length;
      const cellCls = count > 0 ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-700';
      const symbol = count > 1 ? ('在場×' + count) : (count === 1 ? '● 在場' : '·');
      return '<td class="p-2 text-center font-mono ' + cellCls + '">' + symbol + '</td>';
    }).join('');

    return '<tr class="hover:bg-slate-900/50"><th onclick="selectCommand(\'' + escapeHtml(d.id) + '\')" class="p-2.5 font-mono cursor-pointer hover:underline flex items-center gap-2"><span class="w-2 h-2 rounded-full shrink-0 ' + st.dot + '"></span><span class="text-white font-bold whitespace-nowrap">' + escapeHtml(d.id) + '</span><span class="text-amber-300/80 text-[11px] font-normal truncate">' + escapeHtml(locName) + '</span></th>' + cells + '</tr>';
  }).join('');

  container.innerHTML = [
    '<div class="mb-3 text-xs text-slate-300 bg-[#0f1623] p-3 rounded-xl border border-slate-800">',
      '💡 <strong>在場人員行蹤交叉表</strong>：橫軸列出所有已登場的人物編號（由小到大排序），可清楚追蹤每個角色在各個時間點（序號）與場所的出席紀錄，快速找出不在場證明或還沒登場的缺漏角色編號！',
    '</div>',
    '<table class="matrix-table w-full text-left border-t border-l border-slate-800 rounded-xl overflow-hidden text-xs">',
      '<thead><tr><th class="p-2.5 font-mono text-slate-300 min-w-[210px]">場景文檔 \\ 在場人員</th>' + tokenHeaders + '</tr></thead>',
      '<tbody>' + docRows + '</tbody>',
    '</table>'
  ].join('');
}

window.quickCreateFromMatrix = function(seq, type) {
  const newId = seq + '-' + type + '-?????';
  if (!state.commands[newId]) {
    const parsed = parseCommandStructure(newId);
    state.commands[newId] = {
      ...parsed,
      status: 'todo',
      source: '',
      children: [],
      notes: '由場所矩陣建立的待推測指令。',
      rawOutput: '',
      scratchpad: [],
      localTokenNotes: {},
      updatedAt: Date.now()
    };
  }
  selectCommand(newId);
};

// ==================== 右側視圖 3：關聯脈絡圖 ====================
function renderNetworkView() {
  const box = document.getElementById('networkFullContainer');
  const all = Object.values(state.commands);
  const roots = all.filter(c => !c.source || !state.commands[c.source]);

  function renderNode(cmd, depth = 0, visited = new Set()) {
    if (visited.has(cmd.id)) return '';
    visited.add(cmd.id);
    const st = STATUS_META[cmd.status] || STATUS_META.todo;
    const children = all.filter(c => c.source === cmd.id || (cmd.children || []).includes(c.id));
    const wrapCls = depth > 0 ? 'ml-6 pl-4 border-l border-slate-700/80 mt-2' : 'mt-3';

    return [
      '<div class="' + wrapCls + '">',
        '<div onclick="selectCommand(\'' + escapeHtml(cmd.id) + '\')" class="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border ' + st.border + ' ' + st.bg + ' cursor-pointer hover:brightness-125 transition">',
          '<span class="w-2.5 h-2.5 rounded-full ' + st.dot + '"></span>',
          '<span class="font-mono font-bold text-white text-sm">' + escapeHtml(cmd.id) + '</span>',
          '<span class="text-xs text-slate-300 max-w-md truncate">' + escapeHtml(cmd.notes || '') + '</span>',
        '</div>',
        children.map(ch => renderNode(ch, depth + 1, new Set(visited))).join(''),
      '</div>'
    ].join('');
  }

  box.innerHTML = roots.map(r => renderNode(r)).join('');
}

// ==================== 場所與人員名冊 (Glossary) ====================
function getAllDiscoveredTokens() {
  const s = new Set();
  Object.values(state.commands).forEach(c => {
    (c.tokens || []).forEach(t => { if (!t.includes('?')) s.add(t); });
  });
  Object.keys(state.glossary).forEach(k => {
    if (isDigitsOnly(k)) s.add(k);
  });
  return Array.from(s).sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

function renderGlossaryModal() {
  document.getElementById('ruleHypothesisInput').value = state.ruleHypothesis || '';
  const tab = state.ui.glossaryTab || 'tokens';
  document.querySelectorAll('.g-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.gTab === tab);
  });

  const docs = Object.values(state.commands);
  const rows = [];

  if (tab === 'tokens') {
    const tokens = getAllDiscoveredTokens();
    tokens.forEach(tk => {
      const usedIn = docs.filter(d => (d.tokens || []).includes(tk)).map(d => d.id);
      rows.push({ key: tk, badge: '👤 #' + tk, badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40', usedIn: usedIn });
    });
  } else if (tab === 'types') {
    const types = Array.from(new Set(docs.map(d => d.type).filter(t => t && t !== 'SYS' && t !== 'INFO'))).sort();
    types.forEach(tp => {
      const usedIn = docs.filter(d => d.type === tp).map(d => d.id);
      rows.push({ key: tp, badge: '📍 ' + tp, badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40', usedIn: usedIn });
    });
  } else if (tab === 'seqs') {
    const seqs = Array.from(new Set(docs.map(d => d.seq).filter(Boolean))).sort((a, b) => Number(a) - Number(b));
    seqs.forEach(sq => {
      const usedIn = docs.filter(d => d.seq === sq).map(d => d.id);
      rows.push({ key: 'SEQ_' + sq, badge: '🕒 序號 ' + sq, badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', usedIn: usedIn });
    });
  } else {
    Object.keys(state.glossary).sort().forEach(k => {
      rows.push({ key: k, badge: k, badgeClass: 'bg-slate-800 text-slate-200 border-slate-700', usedIn: [] });
    });
  }

  const box = document.getElementById('glossaryTableContainer');
  if (rows.length === 0) {
    box.innerHTML = '<div class="text-xs text-slate-500 py-4 text-center">尚無對應代號項目</div>';
    return;
  }

  box.innerHTML = rows.map(r => {
    const usedText = r.usedIn.length
      ? '<div class="text-[11px] text-slate-400 font-mono truncate" title="' + escapeHtml(r.usedIn.join(', ')) + '">出場於 (' + r.usedIn.length + '): ' + escapeHtml(r.usedIn.join(', ')) + '</div>'
      : '';
    return [
      '<div class="flex flex-col sm:flex-row sm:items-center gap-2 bg-[#090d16] p-3 rounded-xl border border-slate-800">',
        '<div class="sm:w-52 shrink-0 space-y-1">',
          '<span class="px-2.5 py-0.5 rounded border font-mono font-bold text-xs inline-block ' + r.badgeClass + '">' + escapeHtml(r.badge) + '</span>',
          usedText,
        '</div>',
        '<input type="text" value="' + escapeHtml(state.glossary[r.key] || '') + '" placeholder="輸入 ' + escapeHtml(r.badge) + ' 的姓名或場所名稱（自動儲存）..." oninput="updateGlossaryDirect(\'' + escapeHtml(r.key) + '\', this.value)" class="flex-1 min-w-0 bg-[#0f1623] border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-1.5 text-xs text-slate-100 outline-none" />',
      '</div>'
    ].join('');
  }).join('');
}

window.updateGlossaryDirect = function(key, val) {
  if (val.trim()) state.glossary[key] = val.trim();
  else delete state.glossary[key];
  saveState();
  renderTopStatsAndGlossaryBadge();
  renderCommandList();
  if (state.ui.mainView === 'workspace') renderWorkspace();
};

window.openTokenEditModal = function(cmdId, tokenKey, posIndex) {
  activeTokenEdit = { cmdId: cmdId, tokenKey: tokenKey, posIndex: posIndex };
  const cmd = state.commands[cmdId];
  document.getElementById('tokenModalTitle').textContent =
    posIndex >= 0 ? ('編輯在場人員 #' + tokenKey) : ('編輯代號 ' + tokenKey);
  document.getElementById('tokenModalSubtitle').textContent =
    posIndex >= 0 ? '設定人物姓名後，所有該人物出場的文檔與矩陣皆會自動顯示' : '設定後所有同場所／同序號文檔皆會顯示此名稱';

  document.getElementById('tokenGlobalInput').value = state.glossary[tokenKey] || '';
  const localSec = document.getElementById('tokenLocalSection');
  if (posIndex >= 0) {
    localSec.classList.remove('hidden');
    document.getElementById('tokenLocalInput').value = (cmd && cmd.localTokenNotes && cmd.localTokenNotes[posIndex]) ? cmd.localTokenNotes[posIndex] : '';
  } else {
    localSec.classList.add('hidden');
  }
  document.getElementById('tokenModal').classList.remove('hidden');
};

// ==================== 指令新增、修改、關聯與測試板操作 ====================
function addCommand(rawId, source = '', status = 'todo') {
  const parsed = parseCommandStructure(rawId);
  if (!parsed.id) return null;

  const existing = state.commands[parsed.id];
  if (existing) {
    if (source && source !== parsed.id && !existing.source) existing.source = source;
    return existing.id;
  }

  const cleanSource = source === parsed.id ? '' : source;
  state.commands[parsed.id] = {
    ...parsed,
    status: status,
    source: cleanSource,
    children: [],
    notes: '',
    rawOutput: '',
    scratchpad: [],
    localTokenNotes: {},
    updatedAt: Date.now()
  };

  if (cleanSource && state.commands[cleanSource]) {
    const parent = state.commands[cleanSource];
    if (!parent.children.includes(parsed.id)) parent.children.push(parsed.id);
  }
  return parsed.id;
}

window.updateCmdStatus = function(st) {
  const cmd = state.commands[state.ui.selectedId];
  if (!cmd) return;
  cmd.status = st;
  cmd.updatedAt = Date.now();
  saveState();
  renderAll();
};

window.renameCurrentCommand = function() {
  const cmd = state.commands[state.ui.selectedId];
  if (!cmd) return;
  const newRaw = prompt('請輸入新的指令名稱：', cmd.id);
  if (!newRaw || newRaw.trim() === cmd.id) return;
  const parsed = parseCommandStructure(newRaw);
  if (state.commands[parsed.id]) {
    showToast('該指令名稱已存在！');
    return;
  }
  const oldId = cmd.id;
  delete state.commands[oldId];
  state.commands[parsed.id] = {
    ...cmd,
    ...parsed,
    updatedAt: Date.now()
  };
  Object.values(state.commands).forEach(c => {
    if (c.source === oldId) c.source = parsed.id;
    c.children = (c.children || []).map(ch => ch === oldId ? parsed.id : ch);
  });
  state.ui.selectedId = parsed.id;
  saveState();
  renderAll();
};

window.deleteCurrentCommand = function() {
  const cmd = state.commands[state.ui.selectedId];
  if (!cmd || !confirm('確定要刪除指令「' + cmd.id + '」嗎？')) return;
  delete state.commands[cmd.id];
  state.ui.selectedId = Object.keys(state.commands)[0] || '';
  saveState();
  renderAll();
};

window.removeChildRelation = function(childId) {
  const cmd = state.commands[state.ui.selectedId];
  if (!cmd) return;
  cmd.children = (cmd.children || []).filter(c => c !== childId);
  if (state.commands[childId] && state.commands[childId].source === cmd.id) {
    state.commands[childId].source = '';
  }
  saveState();
  renderAll();
};

window.setScratchStatus = function(idx, st) {
  const cmd = state.commands[state.ui.selectedId];
  if (!cmd || !cmd.scratchpad || !cmd.scratchpad[idx]) return;
  cmd.scratchpad[idx].status = cmd.scratchpad[idx].status === st ? 'untested' : st;
  saveState();
  renderWorkspace();
};

window.deleteScratchItem = function(idx) {
  const cmd = state.commands[state.ui.selectedId];
  if (!cmd || !cmd.scratchpad) return;
  cmd.scratchpad.splice(idx, 1);
  saveState();
  renderWorkspace();
};

window.promoteScratchToCommand = function(idx) {
  const cmd = state.commands[state.ui.selectedId];
  const item = (cmd && cmd.scratchpad) ? cmd.scratchpad[idx] : null;
  if (!item) return;
  const newId = addCommand(item.text, cmd.source || cmd.id, 'solved');
  if (newId) {
    selectCommand(newId);
    showToast('已建立正式指令：' + newId, 'success');
  }
};

window.toggleAllCards = function(expand) {
  ['bodyRelations', 'bodyScratchpad', 'bodyNotes', 'bodyRaw'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !expand);
  });
};

window.openFocusModal = function() {
  const cmd = state.commands[state.ui.selectedId];
  if (!cmd) return;
  document.getElementById('focusCmdTitle').textContent = cmd.id;
  document.getElementById('focusRawInput').value = cmd.rawOutput || '';
  document.getElementById('focusNoteInput').value = cmd.notes || '';
  document.getElementById('focusModal').classList.remove('hidden');
};

// ==================== 事件綁定 ====================
document.addEventListener('DOMContentLoaded', () => {
  renderAll();

  document.getElementById('toggleSidebarBtn').addEventListener('click', () => {
    state.ui.sidebarCollapsed = !state.ui.sidebarCollapsed;
    saveState();
    applyUiSettings();
  });

  const resizer = document.getElementById('paneResizer');
  let isResizing = false;
  resizer.addEventListener('mousedown', () => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
  });
  window.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const w = Math.min(620, Math.max(250, e.clientX));
    state.ui.leftWidth = w;
    document.getElementById('leftPane').style.width = w + 'px';
  });
  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      saveState();
    }
  });

  document.querySelectorAll('.main-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ui.mainView = btn.dataset.mainView;
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll('.matrix-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ui.matrixMode = btn.dataset.matrixMode;
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll('.font-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ui.fontScale = btn.dataset.font;
      saveState();
      applyUiSettings();
    });
  });

  document.querySelectorAll('.list-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ui.listMode = btn.dataset.listMode;
      saveState();
      renderAll();
    });
  });
  document.getElementById('sortSelect').addEventListener('change', e => {
    state.ui.sortBy = e.target.value;
    saveState();
    renderCommandList();
  });

  const handleQuickAdd = () => {
    const input = document.getElementById('quickCmdInput');
    const id = addCommand(input.value, document.getElementById('quickSourceSelect').value, document.getElementById('quickStatusSelect').value);
    if (id) {
      input.value = '';
      selectCommand(id);
      showToast('已新增指令：' + id, 'success');
    }
  };
  document.getElementById('quickAddBtn').addEventListener('click', handleQuickAdd);
  document.getElementById('quickCmdInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleQuickAdd();
  });
  document.getElementById('toggleBatchBtn').addEventListener('click', () => {
    document.getElementById('batchDrawer').classList.toggle('hidden');
  });
  document.getElementById('batchAddSubmitBtn').addEventListener('click', () => {
    const lines = document.getElementById('batchCmdInput').value.split('\n').map(s => s.trim()).filter(Boolean);
    const src = document.getElementById('quickSourceSelect').value;
    const st = document.getElementById('quickStatusSelect').value;
    let count = 0;
    lines.forEach(line => { if (addCommand(line, src, st)) count++; });
    document.getElementById('batchCmdInput').value = '';
    document.getElementById('batchDrawer').classList.add('hidden');
    saveState();
    renderAll();
    showToast('已批次匯入 ' + count + ' 筆指令', 'success');
  });

  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  searchInput.addEventListener('input', () => {
    filters.search = searchInput.value;
    clearSearchBtn.classList.toggle('hidden', !filters.search);
    renderCommandList();
    if (state.ui.mainView === 'workspace') renderWorkspace();
  });
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    filters.search = '';
    clearSearchBtn.classList.add('hidden');
    renderAll();
  });
  document.getElementById('toggleFilterBtn').addEventListener('click', () => {
    document.getElementById('filterDrawer').classList.toggle('hidden');
  });
  document.getElementById('resetFilterBtn').addEventListener('click', () => {
    filters = { search: filters.search, category: 'all', status: 'all', types: new Set(), tokens: new Set(), tokenLogic: 'AND' };
    renderAll();
  });
  document.getElementById('tokenLogicBtn').addEventListener('click', e => {
    filters.tokenLogic = filters.tokenLogic === 'AND' ? 'OR' : 'AND';
    e.target.textContent = '邏輯: ' + filters.tokenLogic + (filters.tokenLogic === 'AND' ? ' (同時在場)' : ' (任一在場)');
    renderAll();
  });

  document.querySelectorAll('[data-collapse-target]').forEach(header => {
    header.addEventListener('click', () => {
      const target = document.getElementById(header.dataset.collapseTarget);
      if (target) target.classList.toggle('hidden');
    });
  });

  document.getElementById('detailSourceSelect').addEventListener('change', e => {
    const cmd = state.commands[state.ui.selectedId];
    if (!cmd) return;
    cmd.source = e.target.value;
    saveState();
    renderAll();
  });
  document.getElementById('jumpToSourceBtn').addEventListener('click', () => {
    const cmd = state.commands[state.ui.selectedId];
    if (cmd && cmd.source && state.commands[cmd.source]) selectCommand(cmd.source);
  });

  const handleAddChild = () => {
    const cmd = state.commands[state.ui.selectedId];
    const input = document.getElementById('addChildInput');
    const raw = input.value.trim();
    if (!cmd || !raw) return;
    const childId = addCommand(raw, cmd.id, 'todo');
    if (childId && childId !== cmd.id) {
      if (!cmd.children.includes(childId)) cmd.children.push(childId);
      input.value = '';
      saveState();
      renderAll();
      showToast('已關聯衍生指令：' + childId, 'success');
    }
  };
  document.getElementById('addChildBtn').addEventListener('click', handleAddChild);
  document.getElementById('addChildInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddChild();
  });

  // 從當前文檔提取 [編號 姓名]
  document.getElementById('extractNamesBtn').addEventListener('click', () => {
    const cmd = state.commands[state.ui.selectedId];
    if (!cmd) return;
    const text = (cmd.rawOutput || '') + '\n' + (cmd.notes || '');
    const added = extractCharacterNamesFromText(text);
    if (added > 0) {
      saveState();
      renderAll();
      showToast('已自動提取並登錄 ' + added + ' 位新人員至名冊！', 'success');
    } else {
      showToast('未發現新的未登錄 [編號 姓名] 格式');
    }
  });

  // 從所有文檔一鍵提取 [編號 姓名]
  document.getElementById('scanAllDocsNamesBtn').addEventListener('click', () => {
    let totalAdded = 0;
    Object.values(state.commands).forEach(c => {
      totalAdded += extractCharacterNamesFromText((c.rawOutput || '') + '\n' + (c.notes || ''));
    });
    saveState();
    renderGlossaryModal();
    renderAll();
    showToast('已從全部文檔提取並新增 ' + totalAdded + ' 位人員姓名！', 'success');
  });

  document.getElementById('scanTextForCmdsBtn').addEventListener('click', () => {
    const cmd = state.commands[state.ui.selectedId];
    if (!cmd) return;
    const text = (cmd.rawOutput || '') + '\n' + (cmd.notes || '');
    const regex = /\b\d{2}-[A-Za-z\?]{2,12}(?:-[A-Za-z0-9\?]+)*\b/g;
    const matches = Array.from(new Set(text.match(regex) || [])).filter(m => m !== cmd.id);
    if (matches.length === 0) {
      showToast('內文中未偵測到新的文檔格式指令');
      return;
    }
    matches.forEach(m => {
      const cid = addCommand(m, cmd.id, 'todo');
      if (cid && !cmd.children.includes(cid)) cmd.children.push(cid);
    });
    saveState();
    renderAll();
    showToast('自動掃描並關聯了 ' + matches.length + ' 個指令！', 'success');
  });

  const handleAddScratch = () => {
    const cmd = state.commands[state.ui.selectedId];
    const input = document.getElementById('scratchInput');
    const val = input.value.trim();
    if (!cmd || !val) return;
    cmd.scratchpad = cmd.scratchpad || [];
    cmd.scratchpad.unshift({ text: val, status: 'untested' });
    input.value = '';
    scratchSelectedPeople.clear();
    copyText(val, '已加入測試並複製');
    saveState();
    renderWorkspace();
  };
  document.getElementById('addScratchBtn').addEventListener('click', handleAddScratch);
  document.getElementById('scratchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddScratch();
  });

  document.getElementById('detailNoteInput').addEventListener('input', e => {
    const cmd = state.commands[state.ui.selectedId];
    if (!cmd) return;
    cmd.notes = e.target.value;
    cmd.updatedAt = Date.now();
    document.getElementById('noteCharCount').textContent = '(' + cmd.notes.length + ' 字)';
    saveState();
    renderCommandList();
    renderMentionedCommands(cmd);
  });

  document.getElementById('detailRawInput').addEventListener('input', e => {
    const cmd = state.commands[state.ui.selectedId];
    if (!cmd) return;
    cmd.rawOutput = e.target.value;
    cmd.updatedAt = Date.now();
    document.getElementById('rawCharCount').textContent = '(' + cmd.rawOutput.length + ' 字)';
    // 貼上原文時自動順手提取新的 [編號 姓名]
    const added = extractCharacterNamesFromText(cmd.rawOutput);
    if (added > 0) {
      showToast('已自動從貼上的原文識別 ' + added + ' 位人員姓名！', 'success');
      renderWorkspace();
    }
    saveState();
    renderMentionedCommands(cmd);
    renderSearchHighlightBanner(cmd);
  });

  document.querySelectorAll('.height-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById(btn.dataset.target);
      if (el) el.style.height = btn.dataset.h + 'px';
    });
  });

  document.querySelectorAll('.auto-fit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById(btn.dataset.target);
      if (el) {
        el.style.height = 'auto';
        el.style.height = Math.max(160, el.scrollHeight + 12) + 'px';
      }
    });
  });

  document.querySelectorAll('.open-focus-btn').forEach(btn => {
    btn.addEventListener('click', openFocusModal);
  });
  document.getElementById('closeFocusModalBtn').addEventListener('click', () => {
    document.getElementById('focusModal').classList.add('hidden');
  });
  document.getElementById('focusRawInput').addEventListener('input', e => {
    const cmd = state.commands[state.ui.selectedId];
    if (!cmd) return;
    cmd.rawOutput = e.target.value;
    saveState();
    renderWorkspace();
  });
  document.getElementById('focusNoteInput').addEventListener('input', e => {
    const cmd = state.commands[state.ui.selectedId];
    if (!cmd) return;
    cmd.notes = e.target.value;
    saveState();
    renderWorkspace();
    renderCommandList();
  });
  document.querySelectorAll('.focus-layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.focus-layout-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.focusLayout;
      const grid = document.getElementById('focusBodyGrid');
      const rawP = document.getElementById('focusRawPane');
      const noteP = document.getElementById('focusNotePane');
      grid.className = mode === 'split' ? 'flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 overflow-hidden' : 'flex-1 grid grid-cols-1 gap-4 p-4 overflow-hidden';
      rawP.classList.toggle('hidden', mode === 'notes');
      noteP.classList.toggle('hidden', mode === 'raw');
    });
  });

  document.getElementById('openGlossaryBtn').addEventListener('click', () => {
    renderGlossaryModal();
    document.getElementById('glossaryModal').classList.remove('hidden');
  });
  document.getElementById('closeGlossaryBtn').addEventListener('click', () => {
    document.getElementById('glossaryModal').classList.add('hidden');
  });
  document.getElementById('ruleHypothesisInput').addEventListener('input', e => {
    state.ruleHypothesis = e.target.value;
    saveState();
  });
  document.querySelectorAll('.g-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ui.glossaryTab = btn.dataset.gTab;
      renderGlossaryModal();
    });
  });
  document.getElementById('saveGlossaryBtn').addEventListener('click', () => {
    const k = document.getElementById('glossaryKeyInput').value.trim();
    const v = document.getElementById('glossaryValInput').value.trim();
    if (!k) return;
    state.glossary[k] = v;
    document.getElementById('glossaryKeyInput').value = '';
    document.getElementById('glossaryValInput').value = '';
    saveState();
    renderGlossaryModal();
    renderAll();
  });

  document.getElementById('closeTokenModalBtn').addEventListener('click', () => {
    document.getElementById('tokenModal').classList.add('hidden');
  });
  document.getElementById('cancelTokenModalBtn').addEventListener('click', () => {
    document.getElementById('tokenModal').classList.add('hidden');
  });
  document.getElementById('saveTokenModalBtn').addEventListener('click', () => {
    if (!activeTokenEdit) return;
    const cmdId = activeTokenEdit.cmdId;
    const tokenKey = activeTokenEdit.tokenKey;
    const posIndex = activeTokenEdit.posIndex;
    const gVal = document.getElementById('tokenGlobalInput').value.trim();
    const lVal = document.getElementById('tokenLocalInput').value.trim();

    if (gVal) state.glossary[tokenKey] = gVal;
    else delete state.glossary[tokenKey];

    if (posIndex >= 0 && state.commands[cmdId]) {
      state.commands[cmdId].localTokenNotes = state.commands[cmdId].localTokenNotes || {};
      if (lVal) state.commands[cmdId].localTokenNotes[posIndex] = lVal;
      else delete state.commands[cmdId].localTokenNotes[posIndex];
    }
    document.getElementById('tokenModal').classList.add('hidden');
    saveState();
    renderAll();
  });

  document.getElementById('openIoBtn').addEventListener('click', () => {
    document.getElementById('ioTextarea').value = JSON.stringify(state, null, 2);
    document.getElementById('ioModal').classList.remove('hidden');
  });
  document.getElementById('closeIoModalBtn').addEventListener('click', () => {
    document.getElementById('ioModal').classList.add('hidden');
  });
  document.getElementById('downloadJsonBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'type-help-notes-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
  });
  document.getElementById('uploadJsonInput').addEventListener('change', e => {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        state = JSON.parse(ev.target.result);
        saveState();
        renderAll();
        document.getElementById('ioModal').classList.add('hidden');
        showToast('成功從備份檔還原資料！', 'success');
      } catch (err) {
        showToast('JSON 格式錯誤');
      }
    };
    reader.readAsText(file);
  });
  document.getElementById('applyJsonTextBtn').addEventListener('click', () => {
    try {
      state = JSON.parse(document.getElementById('ioTextarea').value);
      saveState();
      renderAll();
      document.getElementById('ioModal').classList.add('hidden');
      showToast('已從文字框還原資料！', 'success');
    } catch (err) {
      showToast('JSON 格式錯誤');
    }
  });

  document.getElementById('exportMdBtn').addEventListener('click', () => {
    const lines = ['# TYPE HELP 調查筆記報告\n', '> 命名規則假說：' + (state.ruleHypothesis || '無') + '\n', '## 場所與人員名冊'];
    Object.entries(state.glossary).forEach(([k, v]) => lines.push('- **' + k + '**: ' + v));
    lines.push('\n## 指令與文檔清單');
    Object.values(state.commands).forEach(c => {
      const stLabel = STATUS_META[c.status] ? STATUS_META[c.status].label : '';
      lines.push('\n### ' + c.id + ' (' + stLabel + ')');
      if (c.source) lines.push('- 發現來源: `' + c.source + '`');
      if (c.notes) lines.push('- 推理筆記:\n' + c.notes);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'type-help-report.md';
    a.click();
  });

  document.getElementById('resetDemoBtn').addEventListener('click', () => {
    if (!confirm('確定要重置為初始範例資料嗎？（建議先匯出備份）')) return;
    state = getInitialState();
    saveState();
    renderAll();
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      ['glossaryModal', 'tokenModal', 'focusModal', 'ioModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });
    }
  });
});