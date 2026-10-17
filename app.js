const STORAGE_KEY = 'type_help_notebook_v2';

const STATUS_META = {
  todo: { label: '待調查', dot: 'bg-sky-400', text: 'text-sky-300', border: 'border-sky-500/40', bg: 'bg-sky-500/15' },
  investigating: { label: '調查中', dot: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-500/40', bg: 'bg-amber-500/15' },
  solved: { label: '已解開', dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-500/40', bg: 'bg-emerald-500/15' },
  invalid: { label: '擱置', dot: 'bg-slate-500', text: 'text-slate-400', border: 'border-slate-600/40', bg: 'bg-slate-700/20' }
};

const KNOWN_SYS_CMDS = ['help', 'inbox', 'list', 'save', 'name', 'note', 'title'];

function isDigitsOnly(str) {
  return Boolean(str) && !/[^0-9]/.test(str);
}

function isSegmentBFormat(str) {
  return Boolean(str) && str.length >= 1 && str.length <= 5 && !/[^A-Za-z?]/.test(str);
}

function parseCommandStructure(rawInput) {
  let cleaned = String(rawInput || '').trim().replace(/^\(\d+\)\s*/, '').trim();
  const hasWildcard = cleaned.includes('?');
  const parts = cleaned.split('-');

  if (parts.length >= 2 && isDigitsOnly(parts[0])) {
    const seq = parts[0];
    if (parts.length >= 3 && isSegmentBFormat(parts[1])) {
      const codeB = parts[1].toUpperCase();
      const rawTokens = parts.slice(2).filter(Boolean);
      const uniqueTokens = Array.from(new Set(rawTokens));
      return {
        id: cleaned,
        category: hasWildcard ? 'wildcard' : 'doc',
        seq: seq,
        type: codeB,
        rawTokens: rawTokens,
        tokens: uniqueTokens
      };
    }
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
  return {
    commands: {},
    inboxMessages: [],
    systemCommands: [
      { id: 'help', desc: '顯示系統說明' },
      { id: 'inbox', desc: '查閱消息列表' },
      { id: 'list', desc: '查閱文件列表' },
      { id: 'save', desc: '呼叫存檔功能' }
    ],
    glossary: {},
    glossaryRelations: {},
    segmentLabels: {
      segA: '序號',
      segB: '分類代號',
      segC: '尾數代號'
    },
    ruleHypothesis: '',
    ui: {
      selectedId: '',
      mainView: 'workspace',
      matrixMode: 'doc-token',
      netMode: 'cards',
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

    const sysMap = {};
    (parsed.systemCommands || fallback.systemCommands).forEach(s => { sysMap[s.id] = s.desc || ''; });

    const inboxList = (parsed.inboxMessages || []).map(msg => ({
      id: msg.id || ('msg-' + Date.now()),
      title: msg.title || '',
      sender: msg.sender || '',
      senderCode: msg.senderCode || '',
      content: msg.content || '',
      notes: msg.notes || '',
      linkedDocs: msg.linkedDocs || []
    }));

    const cleanCommands = {};
    Object.values(parsed.commands || {}).forEach(cmd => {
      const lowerId = String(cmd.id || '').toLowerCase();
      if (KNOWN_SYS_CMDS.includes(lowerId) || cmd.type === 'SYS') {
        const combinedNote = [cmd.notes, cmd.rawOutput].filter(Boolean).join(' | ');
        if (combinedNote && (!sysMap[cmd.id] || sysMap[cmd.id].length < combinedNote.length)) {
          sysMap[cmd.id] = combinedNote;
        }
        return;
      }

      const reParsed = parseCommandStructure(cmd.id);
      cmd.category = reParsed.category;
      cmd.seq = reParsed.seq;
      cmd.type = reParsed.type;
      cmd.rawTokens = reParsed.rawTokens;
      cmd.tokens = reParsed.tokens;
      cmd.manualMentions = (cmd.manualMentions || []).concat(
        (cmd.mentionedCodes || []).map(mc => (typeof mc === 'string' ? { speaker: '', target: mc } : mc))
      );
      delete cmd.mentionedCodes;
      cmd.localTokenNotes = cmd.localTokenNotes || {};
      if (cmd.source === cmd.id) cmd.source = '';
      cmd.children = Array.from(new Set((cmd.children || []).filter(c => c !== cmd.id && !KNOWN_SYS_CMDS.includes(c.toLowerCase()))));
      cleanCommands[cmd.id] = cmd;
    });

    const finalSysCmds = Object.keys(sysMap).map(k => ({ id: k, desc: sysMap[k] }));
    const selectedId = cleanCommands[parsed.ui && parsed.ui.selectedId]
      ? parsed.ui.selectedId
      : (Object.keys(cleanCommands)[0] || '');

    return {
      commands: cleanCommands,
      inboxMessages: inboxList,
      systemCommands: finalSysCmds,
      glossary: parsed.glossary || {},
      glossaryRelations: parsed.glossaryRelations || {},
      segmentLabels: { ...fallback.segmentLabels, ...(parsed.segmentLabels || {}) },
      ruleHypothesis: parsed.ruleHypothesis !== undefined ? parsed.ruleHypothesis : '',
      ui: { ...fallback.ui, ...(parsed.ui || {}), selectedId: selectedId }
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
    ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-200'
    : (type === 'warn'
        ? 'bg-rose-950/95 border-rose-500/60 text-rose-200'
        : 'bg-slate-900/95 border-slate-700 text-slate-200');
  div.className = 'px-3.5 py-2 rounded-xl border text-xs shadow-xl transition-all duration-300 ' + colors;
  div.textContent = msg;
  box.appendChild(div);
  setTimeout(() => {
    div.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => div.remove(), 300);
  }, 2500);
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

window.switchMainView = function(viewName) {
  state.ui.mainView = viewName;
  saveState();
  renderAll();
};

// ==================== 智慧對話提及解析引擎 (精準剝離動詞前綴) ====================
function matchTermToGlossaryCode(termText) {
  if (!termText) return '';
  const cleanTerm = termText.replace(/^#/, '').trim();
  if (state.glossary[cleanTerm] !== undefined) return cleanTerm;

  const lowerTerm = cleanTerm.toLowerCase();
  const termParts = lowerTerm
    .split(/[\(\)（）\/,，、·\s]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 2);

  for (const [codeKey, meaning] of Object.entries(state.glossary)) {
    if (!meaning || codeKey.startsWith('SEQ_')) continue;
    const lowerMeaning = meaning.toLowerCase();
    if (lowerMeaning === lowerTerm) return codeKey;
    const mParts = lowerMeaning
      .split(/[\(\)（）\/,，、·\s]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 2);
    for (let i = 0; i < termParts.length; i++) {
      if (mParts.includes(termParts[i])) return codeKey;
    }
  }
  return '';
}

// 升級版：精準從句子中提取「名詞 (English)」，徹底剝除「我赶着去」「他过去常去」「大多数时间都在」等長前綴
function extractBilingualTermsFromSentence(sentence) {
  const results = [];
  const regex = /[（\(]([A-Za-z][A-Za-z0-9\s\.\-']{1,28})[）\)]/g;
  let m;
  while ((m = regex.exec(sentence)) !== null) {
    const eng = m[1].trim();
    const prefix = sentence.slice(Math.max(0, m.index - 14), m.index);
    let cnSeg = prefix.split(/[，。！？；：、“”"'\s,!\?;:\[\]（）\(\)]/).pop() || '';
    // 以最後出現的介詞、動詞、助詞或數量詞進行切分，只取最末端緊貼括號的純名詞
    const verbSplit = cnSeg.split(/(?:都在|還在|还在|也在|不在|是在|都是|不是|就是|常去|趕著去|赶着去|走進|走进|進入|进入|離開|离开|回到|來到|来到|去了|到了|來了|来了|進了|进了|問了|问了|見了|见了|看到|聽見|听见|得知|知道|介紹|介绍|關於|关于|前往|通往|一位|一名|一個|一个|這間|这间|那間|那间|[在去到是了的有和與与跟向對对給给把被讓让叫喊見见找問问連连回進进出])/);
    cnSeg = (verbSplit.pop() || '').trim();

    if (cnSeg) {
      results.push(cnSeg + ' (' + eng + ')');
    } else {
      results.push(eng);
    }
  }
  return results;
}

function getStructuredMentionsForCmd(cmd) {
  if (!cmd) return [];
  const list = [];
  const seenKey = new Set();

  function addEntry(speaker, targetText, isManual, manualIdx) {
    const sp = String(speaker || '').replace(/^#/, '').trim();
    const tg = String(targetText || '').trim();
    if (!tg) return;
    const matchedCode = matchTermToGlossaryCode(tg) || (isDigitsOnly(tg.replace(/^#/, '')) ? tg.replace(/^#/, '') : '');
    if (!sp && !isManual && matchedCode && (cmd.type === matchedCode || (cmd.tokens || []).includes(matchedCode))) {
      return;
    }
    if (sp && matchedCode === sp) return;

    const dedupeKey = sp + '>>' + (matchedCode || tg.toLowerCase());
    if (seenKey.has(dedupeKey)) return;
    seenKey.add(dedupeKey);

    list.push({
      speaker: sp,
      targetText: tg,
      matchedCode: matchedCode,
      isManual: Boolean(isManual),
      manualIdx: manualIdx
    });
  }

  (cmd.manualMentions || []).forEach((item, idx) => {
    addEntry(item.speaker, item.target, true, idx);
  });

  const lines = ((cmd.rawOutput || '') + '\n' + (cmd.notes || '')).split('\n');
  let currentSpeaker = '';

  lines.forEach(rawLine => {
    const line = rawLine.trim();
    if (!line) return;

    let contentPart = line;

    const bracketMatch = line.match(/^\[\s*(\d{1,3})(?:\s+[^\[\]]*)?\]\s*(.*)$/);
    if (bracketMatch) {
      currentSpeaker = bracketMatch[1];
      contentPart = bracketMatch[2] || '';
    } else if (/^\[\s*@/.test(line)) {
      currentSpeaker = '';
    }

    const noteSpeakerMatch = line.match(/^#(\d{1,3})\s*(?:提到|說|说|詢問|询问|介紹|介绍|對|对|向|->|：|:)\s*(.*)$/);
    if (noteSpeakerMatch) {
      currentSpeaker = noteSpeakerMatch[1];
      contentPart = noteSpeakerMatch[2] || '';
    }

    if (!contentPart) return;

    const bilingualTerms = extractBilingualTermsFromSentence(contentPart);
    bilingualTerms.forEach(term => {
      addEntry(currentSpeaker, term, false, -1);
    });

    const hashMatches = contentPart.match(/#(\d{1,3})\b/g) || [];
    hashMatches.forEach(hm => {
      const num = hm.replace('#', '');
      if (num !== currentSpeaker) {
        addEntry(currentSpeaker, '#' + num, false, -1);
      }
    });

    const lowerContent = contentPart.toLowerCase();
    Object.entries(state.glossary).forEach(([codeKey, meaning]) => {
      if (!meaning || codeKey.startsWith('SEQ_') || codeKey === currentSpeaker) return;
      const keywords = meaning
        .split(/[\(\)（）\/,，、·\s]+/)
        .map(s => s.trim().toLowerCase())
        .filter(s => s.length >= 2);
      for (let i = 0; i < keywords.length; i++) {
        if (lowerContent.includes(keywords[i])) {
          addEntry(currentSpeaker, meaning, false, -1);
          break;
        }
      }
    });
  });

  return list;
}

function getBacklinksForCode(codeKey) {
  const inStructure = [];
  const spokenByThisCode = [];
  const mentionedByOthers = [];
  const inGlossaryRels = [];

  Object.values(state.commands).forEach(cmd => {
    const isStruct = (cmd.type === codeKey) || (cmd.tokens || []).includes(codeKey) || ('SEQ_' + cmd.seq === codeKey);
    if (isStruct) {
      inStructure.push(cmd.id);
    }

    const mentions = getStructuredMentionsForCmd(cmd);
    mentions.forEach(m => {
      if (m.speaker === codeKey) {
        spokenByThisCode.push({ docId: cmd.id, targetText: m.targetText, matchedCode: m.matchedCode });
      }
      if (m.matchedCode === codeKey) {
        mentionedByOthers.push({ docId: cmd.id, speaker: m.speaker, targetText: m.targetText });
      }
    });
  });

  const targetName = (state.glossary[codeKey] || '').toLowerCase();
  const nameKeywords = targetName
    .split(/[\(\)（）\/,，、·\s]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 2);

  Object.entries(state.glossaryRelations || {}).forEach(([otherKey, relText]) => {
    if (otherKey === codeKey || !relText) return;
    const lowerRel = relText.toLowerCase();
    const hitKey = lowerRel.includes('#' + codeKey.toLowerCase()) ||
      new RegExp('\\b' + codeKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(relText);
    const hitName = nameKeywords.some(kw => lowerRel.includes(kw));
    if (hitKey || hitName) {
      inGlossaryRels.push(otherKey);
    }
  });

  return {
    inStructure: inStructure,
    spokenByThisCode: spokenByThisCode,
    mentionedByOthers: mentionedByOthers,
    inGlossaryRels: inGlossaryRels
  };
}

function extractBracketedCodesFromText(text) {
  const regex = /\[\s*(\d{1,3})\s+([^\[\]\n]{1,40}?)\s*\]/g;
  let match;
  let updatedCount = 0;
  while ((match = regex.exec(text)) !== null) {
    const num = match[1];
    const name = match[2].trim();
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
  renderTopStatsAndBadges();
  renderSourceDropdowns();
  renderFilterDrawer();
  renderCommandList();

  if (state.ui.mainView === 'workspace') {
    renderWorkspace();
  } else if (state.ui.mainView === 'inbox') {
    renderInboxView();
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
  document.getElementById('viewInbox').classList.toggle('hidden', state.ui.mainView !== 'inbox');
  document.getElementById('viewMatrix').classList.toggle('hidden', state.ui.mainView !== 'matrix');
  document.getElementById('viewNetwork').classList.toggle('hidden', state.ui.mainView !== 'network');

  document.querySelectorAll('.list-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.listMode === state.ui.listMode);
  });

  document.querySelectorAll('.matrix-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.matrixMode === state.ui.matrixMode);
  });

  document.querySelectorAll('.net-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.netMode === (state.ui.netMode || 'cards'));
  });

  const segA = (state.segmentLabels && state.segmentLabels.segA) || '序號';
  const segB = (state.segmentLabels && state.segmentLabels.segB) || '分類代號';
  const segC = (state.segmentLabels && state.segmentLabels.segC) || '尾數代號';

  document.getElementById('filterSegBTitle').textContent = '📍 ' + segB;
  document.getElementById('filterSegCTitle').textContent = '🏷️ ' + segC + '（含對話提及）';
  document.getElementById('matrixModeBtn1').textContent = '① ' + segA + ' × ' + segB;
  document.getElementById('matrixModeBtn2').textContent = '② 文檔(依' + segA + '分組) × ' + segC;
  const btn3 = document.getElementById('matrixModeBtn3');
  if (btn3) btn3.textContent = '③ ' + segA + ' × ' + segC + ' (誰在哪裡)';
  document.getElementById('gTabBtnTokens').textContent = '③ ' + segC;
  document.getElementById('gTabBtnTypes').textContent = '② ' + segB;
  document.getElementById('gTabBtnSeqs').textContent = '① ' + segA;

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

function renderTopStatsAndBadges() {
  const all = Object.values(state.commands);
  const counts = { total: all.length, todo: 0, investigating: 0, solved: 0 };
  all.forEach(c => {
    if (counts[c.status] !== undefined) counts[c.status]++;
  });

  const statsBar = document.getElementById('statsBar');
  statsBar.innerHTML = [
    '<button class="px-1.5 py-0.5 rounded hover:bg-slate-800 ' + (filters.status === 'all' ? 'text-white font-bold' : 'text-slate-400') + '" onclick="setStatusFilter(\'all\')">文檔 ' + counts.total + '</button>',
    '<span class="text-slate-700">|</span>',
    '<button class="px-1.5 py-0.5 rounded hover:bg-slate-800 text-sky-400 ' + (filters.status === 'todo' ? 'underline font-bold' : '') + '" onclick="setStatusFilter(\'todo\')">● 待查 ' + counts.todo + '</button>',
    '<button class="px-1.5 py-0.5 rounded hover:bg-slate-800 text-amber-400 ' + (filters.status === 'investigating' ? 'underline font-bold' : '') + '" onclick="setStatusFilter(\'investigating\')">● 調查中 ' + counts.investigating + '</button>',
    '<button class="px-1.5 py-0.5 rounded hover:bg-slate-800 text-emerald-400 ' + (filters.status === 'solved' ? 'underline font-bold' : '') + '" onclick="setStatusFilter(\'solved\')">● 已解 ' + counts.solved + '</button>'
  ].join('');

  const gCount = Object.keys(state.glossary).filter(k => state.glossary[k] && state.glossary[k].trim()).length;
  document.getElementById('glossaryCountBadge').textContent = gCount;
  document.getElementById('inboxCountBadge').textContent = (state.inboxMessages || []).length;
  document.getElementById('sysCmdCountBadge').textContent = (state.systemCommands || []).length;
}

window.setStatusFilter = function(status) {
  filters.status = filters.status === status ? 'all' : status;
  renderAll();
};

function getSourceOptionsHtml(excludeCmdId) {
  const inboxOpts = (state.inboxMessages || []).map(msg => {
    const val = 'inbox:' + msg.id;
    const senderInfo = msg.sender ? (' [' + msg.sender + ']') : '';
    return '<option value="' + escapeHtml(val) + '">📬 收件匣：' + escapeHtml((msg.title || '未命名') + senderInfo) + '</option>';
  }).join('');

  const sysOpts = '<option value="list">⌨️ 系統指令：list</option>';

  const docIds = Object.keys(state.commands).filter(id => id !== excludeCmdId).sort();
  const docOpts = docIds.map(id => '<option value="' + escapeHtml(id) + '">📄 文檔：' + escapeHtml(id) + '</option>').join('');

  return '<option value="">-- 無來源 / 初始文檔 --</option>' + inboxOpts + sysOpts + docOpts;
}

function formatSourceLabel(src) {
  if (!src) return '無';
  if (src.startsWith('inbox:')) {
    const msgId = src.split(':')[1];
    const msg = (state.inboxMessages || []).find(m => m.id === msgId);
    if (!msg) return '📬 inbox';
    return '📬 ' + msg.title + (msg.sender ? (' (' + msg.sender + ')') : '');
  }
  return src;
}

function renderSourceDropdowns() {
  const quickSelect = document.getElementById('quickSourceSelect');
  const currentQuick = quickSelect.value;
  quickSelect.innerHTML = getSourceOptionsHtml('');
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
    const mentions = getStructuredMentionsForCmd(c);
    const mentionedNums = mentions.map(m => m.matchedCode).filter(Boolean);
    const allCmdCodes = new Set([...(c.tokens || []), ...mentionedNums]);
    allCmdCodes.forEach(t => {
      if (!t.includes('?') && isDigitsOnly(t)) {
        tokenCounts[t] = (tokenCounts[t] || 0) + 1;
      }
    });
  });

  const cats = [
    { key: 'all', label: '全部文檔' },
    { key: 'doc', label: '一般文檔' },
    { key: 'wildcard', label: '未知待測 (?)' }
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
    const locName = state.glossary[t] ? (' ' + state.glossary[t].split('(')[0].trim()) : '';
    const cls = active
      ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
      : 'bg-slate-900 text-slate-300 border-slate-800';
    return '<button class="px-2 py-0.5 rounded border font-mono text-xs ' + cls + '" onclick="toggleSetFilter(\'types\',\'' + escapeHtml(t) + '\')">' + escapeHtml(t) + escapeHtml(locName) + ' <span class="opacity-60">(' + typeCounts[t] + ')</span></button>';
  }).join('') || '<span class="text-slate-600 text-[11px]">尚無分類資料</span>';

  const sortedTokens = Object.keys(tokenCounts).sort((a, b) => Number(a) - Number(b));
  document.getElementById('tokenFilterBar').innerHTML = sortedTokens.map(tk => {
    const active = filters.tokens.has(tk);
    const pName = state.glossary[tk] ? (' ' + state.glossary[tk].split('(')[0].trim()) : '';
    const cls = active
      ? 'bg-sky-500 text-slate-950 font-bold border-sky-400'
      : 'bg-slate-900 text-slate-300 border-slate-800';
    return '<button class="px-2 py-0.5 rounded border font-mono text-xs ' + cls + '" onclick="toggleSetFilter(\'tokens\',\'' + escapeHtml(tk) + '\')">#' + escapeHtml(tk) + escapeHtml(pName) + ' <span class="opacity-60">(' + tokenCounts[tk] + ')</span></button>';
  }).join('') || '<span class="text-slate-600 text-[11px]">尚無尾數資料</span>';

  let activeCount = 0;
  const pills = [];
  if (filters.category !== 'all') { activeCount++; pills.push('分類:' + filters.category); }
  if (filters.status !== 'all') { activeCount++; pills.push('狀態:' + (STATUS_META[filters.status] ? STATUS_META[filters.status].label : '')); }
  filters.types.forEach(t => { activeCount++; pills.push(t); });
  filters.tokens.forEach(t => { activeCount++; pills.push('#' + t); });

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
    const mentions = getStructuredMentionsForCmd(cmd);
    if (filters.tokens.size > 0) {
      const arr = Array.from(filters.tokens);
      const cmdAllCodes = new Set([...(cmd.tokens || []), ...mentions.map(m => m.matchedCode).filter(Boolean)]);
      const hasMatch = filters.tokenLogic === 'AND'
        ? arr.every(t => cmdAllCodes.has(t))
        : arr.some(t => cmdAllCodes.has(t));
      if (!hasMatch) return false;
    }
    if (q) {
      const locText = state.glossary[cmd.type] || '';
      const mentionTexts = mentions.map(m => (m.speaker ? ('#' + m.speaker + ' ') : '') + m.targetText + ' ' + (state.glossary[m.matchedCode] || '')).join(' ');
      const peopleText = (cmd.tokens || []).map(t => state.glossary[t] || '').join(' ');
      const hay = [cmd.id, cmd.notes, cmd.rawOutput, formatSourceLabel(cmd.source), locText, peopleText, mentionTexts].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const mode = state.ui.sortBy;
    if (mode === 'seq') return a.id.localeCompare(b.id, undefined, { numeric: true });
    if (mode === 'status') {
      const order = { investigating: 1, todo: 2, solved: 3, invalid: 4 };
      return (order[a.status] || 9) - (order[b.status] || 9);
    }
    if (mode === 'type') return (a.type || '').localeCompare(b.type || '') || a.id.localeCompare(b.id);
    if (mode === 'updated') return (b.updatedAt || 0) - (a.updatedAt || 0);
    return a.id.localeCompare(b.id);
  });
}

function renderCommandList() {
  const list = getFilteredCommands();
  const box = document.getElementById('cmdListContainer');
  if (list.length === 0) {
    const totalCount = Object.keys(state.commands).length;
    box.innerHTML = '<div class="text-center py-8 text-xs text-slate-500">' +
      (totalCount === 0 ? '清單目前為空，請從上方新增文檔指令' : '沒有符合篩選條件的文檔') +
      '</div>';
    return;
  }

  const isCompact = state.ui.listMode === 'compact';

  box.innerHTML = list.map(cmd => {
    const active = cmd.id === state.ui.selectedId && state.ui.mainView === 'workspace';
    const st = STATUS_META[cmd.status] || STATUS_META.todo;
    const locName = (cmd.type && cmd.type !== 'SYS' && cmd.type !== 'INFO' && state.glossary[cmd.type])
      ? state.glossary[cmd.type].split('(')[0].trim()
      : '';

    if (isCompact) {
      const rowCls = active
        ? 'bg-emerald-950/40 border-emerald-500/70'
        : 'bg-[#090d16] hover:bg-slate-900/90 border-slate-800/80';
      const summaryText = (locName ? ('[' + locName + '] ') : '') + (cmd.notes || '');

      return [
        '<div onclick="selectCommand(\'' + escapeHtml(cmd.id) + '\')" class="group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition ' + rowCls + '">',
          '<div class="flex items-center gap-2 min-w-0 flex-1">',
            '<span class="w-2 h-2 rounded-full shrink-0 ' + st.dot + '" title="' + st.label + '"></span>',
            '<span class="cmd-scalable font-mono font-bold text-white shrink-0 whitespace-nowrap">' + escapeHtml(cmd.id) + '</span>',
            '<span class="text-xs text-slate-400 truncate min-w-0 flex-1">' + escapeHtml(summaryText) + '</span>',
          '</div>',
          '<button onclick="event.stopPropagation();copyText(\'' + escapeHtml(cmd.id) + '\')" class="opacity-75 group-hover:opacity-100 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 whitespace-nowrap shrink-0">複製</button>',
        '</div>'
      ].join('');
    }

    const rawTokensHtml = (cmd.rawTokens || []).map((tk, idx) => {
      const localNote = cmd.localTokenNotes ? cmd.localTokenNotes[idx] : '';
      const globalNote = state.glossary[tk] ? state.glossary[tk].split('(')[0].trim() : '';
      const hint = localNote || globalNote;
      const hintSpan = hint ? '<span class="text-sky-200/90 ml-1">(' + escapeHtml(hint) + ')</span>' : '';
      return '<span class="badge-scalable px-1.5 py-0.5 rounded bg-sky-950/60 border border-sky-500/30 text-sky-300 font-mono">#' + escapeHtml(tk) + hintSpan + '</span>';
    }).join('');

    const mentions = getStructuredMentionsForCmd(cmd);
    const mentionsHtml = mentions.slice(0, 6).map(m => {
      const spPrefix = m.speaker ? ('#' + m.speaker + '➔') : '💬';
      const shortTarget = m.targetText.split('(')[0].trim();
      return '<span class="badge-scalable px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-500/30 text-purple-200 font-mono" title="' + escapeHtml((m.speaker ? ('#' + m.speaker + ' 提到 ') : '提及 ') + m.targetText) + '">' + escapeHtml(spPrefix + shortTarget) + '</span>';
    }).join('');

    const cardCls = active
      ? 'bg-emerald-950/30 border-emerald-500/60'
      : 'bg-[#090d16] hover:bg-slate-900/90 border-slate-800';

    const locBadge = (cmd.type && cmd.type !== 'SYS' && cmd.type !== 'INFO')
      ? '<span class="badge-scalable px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono">' + escapeHtml(cmd.type) + (locName ? (' · ' + escapeHtml(locName)) : '') + '</span>'
      : '';

    const metaRow = (locBadge || rawTokensHtml || mentionsHtml)
      ? '<div class="flex flex-wrap gap-1 pt-0.5">' + locBadge + rawTokensHtml + mentionsHtml + '</div>'
      : '';

    const noteRow = cmd.notes
      ? '<p class="content-scalable text-slate-300 line-clamp-2">' + escapeHtml(cmd.notes) + '</p>'
      : '';

    return [
      '<div onclick="selectCommand(\'' + escapeHtml(cmd.id) + '\')" class="p-3 rounded-xl border cursor-pointer transition space-y-1.5 ' + cardCls + '">',
        '<div class="flex items-center justify-between gap-2">',
          '<div class="flex items-center gap-2 min-w-0">',
            '<span class="px-2 py-0.5 rounded-full text-[11px] border ' + st.bg + ' ' + st.text + ' ' + st.border + ' whitespace-nowrap shrink-0">● ' + st.label + '</span>',
            '<span class="cmd-scalable font-mono font-bold text-white whitespace-nowrap">' + escapeHtml(cmd.id) + '</span>',
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

// ==================== 右側視圖 1：文檔筆記工作台 ====================
function renderWorkspace() {
  const emptyStateEl = document.getElementById('workspaceEmptyState');
  const header = document.getElementById('cmdStickyHeader');
  const scrollBody = document.getElementById('workspaceScrollBody');

  const cmd = state.commands[state.ui.selectedId] || Object.values(state.commands)[0];

  if (!cmd) {
    state.ui.selectedId = '';
    emptyStateEl.classList.remove('hidden');
    header.classList.add('hidden');
    scrollBody.classList.add('hidden');
    return;
  }

  emptyStateEl.classList.add('hidden');
  header.classList.remove('hidden');
  scrollBody.classList.remove('hidden');
  state.ui.selectedId = cmd.id;

  const segALabel = (state.segmentLabels && state.segmentLabels.segA) || '序號';
  const segBLabel = (state.segmentLabels && state.segmentLabels.segB) || '分類代號';

  const catBadge = cmd.type === 'INFO' ? '指引文檔' : (cmd.category === 'wildcard' ? '未知待破譯' : '調查文檔');
  const locMeaning = state.glossary[cmd.type];

  const tokenFreq = {};
  (cmd.rawTokens || []).forEach(t => { tokenFreq[t] = (tokenFreq[t] || 0) + 1; });

  const positionalBadgesHtml = (cmd.rawTokens || []).map((tk, idx) => {
    const isDup = tokenFreq[tk] > 1;
    const localNote = cmd.localTokenNotes ? cmd.localTokenNotes[idx] : '';
    const globalNote = state.glossary[tk];
    const displayNote = localNote
      ? '📌 ' + localNote
      : (globalNote ? globalNote : '點擊設定');
    const btnCls = localNote
      ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
      : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/30 text-sky-300';
    const prefixLabel = isDup ? ('位置' + (idx + 1) + ':') : '';

    return '<button onclick="openTokenEditModal(\'' + escapeHtml(cmd.id) + '\', \'' + escapeHtml(tk) + '\', ' + idx + ')" class="badge-scalable px-2.5 py-0.5 rounded-lg border font-mono transition flex items-center gap-1 ' + btnCls + '"><span>' + prefixLabel + '#' + escapeHtml(tk) + '</span><span class="text-xs opacity-90">(' + escapeHtml(displayNote) + ')</span></button>';
  }).join('');

  const statusButtonsHtml = Object.entries(STATUS_META).map(([key, meta]) => {
    const activeCls = cmd.status === key
      ? (meta.bg + ' ' + meta.text + ' ' + meta.border + ' font-bold')
      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200';
    return '<button onclick="updateCmdStatus(\'' + key + '\')" class="px-2.5 py-0.5 rounded-full text-xs border whitespace-nowrap transition ' + activeCls + '">● ' + meta.label + '</button>';
  }).join('');

  const seqNote = cmd.seq ? (state.glossary['SEQ_' + cmd.seq] || '') : '';
  const seqBadgeHtml = cmd.seq
    ? '<button onclick="openTokenEditModal(\'' + escapeHtml(cmd.id) + '\', \'SEQ_' + escapeHtml(cmd.seq) + '\', -1)" class="badge-scalable px-2.5 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-mono">' + escapeHtml(segALabel) + ': ' + escapeHtml(cmd.seq) + (seqNote ? (' (' + escapeHtml(seqNote) + ')') : '') + '</button>'
    : '';

  const locButtonHtml = (cmd.type && cmd.type !== 'SYS' && cmd.type !== 'INFO')
    ? '<button onclick="openTokenEditModal(\'' + escapeHtml(cmd.id) + '\', \'' + escapeHtml(cmd.type) + '\', -1)" class="badge-scalable px-2.5 py-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-mono">' + escapeHtml(segBLabel) + ': ' + escapeHtml(cmd.type) + ' (' + escapeHtml(locMeaning || '點擊設定') + ')</button>'
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
        '<button onclick="deleteCurrentCommand()" class="px-2.5 py-1 rounded-lg bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 border border-rose-800/50 text-xs whitespace-nowrap" title="刪除此文檔"><i class="fa-solid fa-trash"></i></button>',
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

  // 區塊 A：來源、衍生與「對話發言提及追蹤 (#誰 ➔ 提到什麼)」
  const structuredMentions = getStructuredMentionsForCmd(cmd);
  const srcText = formatSourceLabel(cmd.source);
  const childCount = (cmd.children && cmd.children.length) ? cmd.children.length : 0;
  document.getElementById('relationSummaryText').textContent =
    '(來源: ' + srcText + ' · 衍生: ' + childCount + ' · 提及線索: ' + structuredMentions.length + ')';

  const srcSelect = document.getElementById('detailSourceSelect');
  srcSelect.innerHTML = getSourceOptionsHtml(cmd.id);
  srcSelect.value = cmd.source || '';

  const childrenBox = document.getElementById('childrenPillsContainer');
  if (!cmd.children || cmd.children.length === 0) {
    childrenBox.innerHTML = '<span class="text-xs text-slate-500">尚無衍生指令，可由下方輸入、點右上角「掃描內文新指令」或在測試板點選「✓ 有效」自動關聯</span>';
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

  // 渲染「誰 ➔ 提到什麼」對話提及膠囊
  const mentionBox = document.getElementById('mentionedCodesContainer');
  if (structuredMentions.length === 0) {
    mentionBox.innerHTML = '<span class="text-xs text-slate-500">貼上含有 <code class="text-purple-300 font-mono">[7] ...客厅（Living room）...</code> 的遊戲原文、或在筆記寫下 <code class="text-purple-300 font-mono">#7提到小艾（Eddie）</code> 時，系統會自動分析並列出「誰提到了什麼」。</span>';
  } else {
    mentionBox.innerHTML = structuredMentions.map(m => {
      const spName = (m.speaker && state.glossary[m.speaker]) ? ('(' + state.glossary[m.speaker].split('(')[0].trim() + ')') : '';
      const speakerHtml = m.speaker
        ? '<button onclick="openTokenEditModal(\'' + escapeHtml(cmd.id) + '\', \'' + escapeHtml(m.speaker) + '\', -1)" class="px-2 py-1 bg-sky-950/80 text-sky-300 font-mono font-bold hover:underline border-r border-purple-500/30" title="點擊查看發言者 #' + escapeHtml(m.speaker) + '">#' + escapeHtml(m.speaker) + escapeHtml(spName) + ' <span class="text-slate-400 font-normal">提到➔</span></button>'
        : '<span class="px-2 py-1 bg-purple-950/60 text-purple-300 border-r border-purple-500/30">💬 提及</span>';

      let targetHtml = '';
      if (m.matchedCode) {
        const gMeaning = state.glossary[m.matchedCode] || '';
        const showLabel = (m.targetText.replace(/^#/, '') === m.matchedCode && gMeaning)
          ? ('#' + m.matchedCode + ' (' + gMeaning + ')')
          : (m.targetText + ' [🔗' + (isDigitsOnly(m.matchedCode) ? ('#' + m.matchedCode) : m.matchedCode) + ']');
        targetHtml = '<button onclick="openTokenEditModal(\'' + escapeHtml(cmd.id) + '\', \'' + escapeHtml(m.matchedCode) + '\', -1)" class="px-2.5 py-1 text-purple-200 font-mono hover:underline">' + escapeHtml(showLabel) + '</button>';
      } else {
        targetHtml = '<span class="px-2.5 py-1 text-amber-200 font-mono">' + escapeHtml(m.targetText) + '</span>' +
          '<button onclick="openAssignTermModal(\'' + escapeHtml(m.targetText) + '\')" class="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border-l border-purple-500/30 text-[11px] whitespace-nowrap" title="推理出此稱呼對應的代號後，點此一鍵寫入字典">📌 歸入字典</button>';
      }

      const removeBtn = m.isManual
        ? '<button onclick="removeManualMention(' + m.manualIdx + ')" class="px-1.5 py-1 text-slate-400 hover:text-rose-300 border-l border-purple-500/30">×</button>'
        : '';

      return '<div class="inline-flex items-center rounded-lg bg-purple-500/10 border border-purple-500/40 overflow-hidden text-xs">' +
        speakerHtml + targetHtml + removeBtn +
        '</div>';
    }).join('');
  }

  // 區塊 B：未知指令組合測試板（支援直接標記「✓ 有效」並自動關聯至本篇衍生指令，且留在當前頁面）
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
    const pName = state.glossary[tk] ? (' ' + state.glossary[tk].split('(')[0].trim()) : '';
    const btnCls = isSelected
      ? 'bg-amber-500 text-slate-950 font-bold border-amber-300'
      : 'bg-slate-800 hover:bg-slate-700 text-sky-300 border-slate-700';
    return '<button onclick="toggleScratchPerson(\'' + escapeHtml(prefix) + '\', \'' + escapeHtml(tk) + '\')" class="px-2 py-0.5 rounded border font-mono transition ' + btnCls + '">#' + escapeHtml(tk) + escapeHtml(pName) + '</button>';
  }).join('');

  document.getElementById('scratchQuickTokens').innerHTML =
    '<span class="text-slate-400">點選已發現代號自動排序組合：</span>' +
    (peopleButtonsHtml || '<span class="text-slate-600">尚無尾數代號資料</span>') +
    (scratchSelectedPeople.size > 0 ? '<button onclick="clearScratchPeople(\'' + escapeHtml(prefix) + '\')" class="px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 text-[11px]">清空重選</button>' : '');

  const scratchListEl = document.getElementById('scratchList');
  if (!cmd.scratchpad || cmd.scratchpad.length === 0) {
    scratchListEl.innerHTML = '<div class="text-xs text-slate-500">尚無測試紀錄</div>';
  } else {
    scratchListEl.innerHTML = cmd.scratchpad.map((item, idx) => {
      const isOk = item.status === 'ok';
      const isFail = item.status === 'fail';
      const rowBorder = isOk ? 'border-emerald-500/50 bg-emerald-950/20' : (isFail ? 'border-rose-900/40 bg-[#090d16]' : 'border-slate-800 bg-[#090d16]');
      const txtCls = isFail
        ? 'line-through text-slate-500'
        : (isOk ? 'text-emerald-300 font-bold' : 'text-slate-200');
      const failBtnCls = isFail ? 'bg-rose-600 text-white font-bold' : 'bg-slate-800 hover:bg-slate-700 text-rose-300';
      const okBtnCls = isOk ? 'bg-emerald-600 text-white font-bold' : 'bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40';
      const okLabel = isOk ? '✓ 已有效關聯' : '✓ 有效 (建立並關聯)';
      const jumpBtn = (isOk && state.commands[item.text])
        ? '<button onclick="selectCommand(\'' + escapeHtml(item.text) + '\')" class="px-2 py-0.5 rounded bg-sky-600/25 hover:bg-sky-600/40 text-sky-300 border border-sky-500/40" title="前往該文檔">前往 ➔</button>'
        : '';

      return [
        '<div class="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-xs transition ' + rowBorder + '">',
          '<div class="flex items-center gap-2 min-w-0">',
            (isOk ? '<span class="text-emerald-400 font-bold">✓</span>' : (isFail ? '<span class="text-rose-400 font-bold">✕</span>' : '<span class="text-slate-600">●</span>')),
            '<span class="font-mono ' + txtCls + ' truncate">' + escapeHtml(item.text) + '</span>',
          '</div>',
          '<div class="flex items-center gap-1 shrink-0">',
            '<button onclick="copyText(\'' + escapeHtml(item.text) + '\')" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">複製</button>',
            '<button onclick="setScratchStatus(' + idx + ', \'fail\')" class="px-2 py-0.5 rounded transition ' + failBtnCls + '">✕ 無效</button>',
            '<button onclick="markScratchValidAndLink(' + idx + ')" class="px-2.5 py-0.5 rounded transition ' + okBtnCls + '">' + okLabel + '</button>',
            jumpBtn,
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

  renderSearchHighlightBanner(cmd);
}

window.removeManualMention = function(idx) {
  const cmd = state.commands[state.ui.selectedId];
  if (!cmd || !cmd.manualMentions) return;
  cmd.manualMentions.splice(idx, 1);
  saveState();
  renderAll();
};

window.openAssignTermModal = function(termText) {
  const cmd = state.commands[state.ui.selectedId];
  document.getElementById('assignTermValueInput').value = termText;
  document.getElementById('assignTermCodeInput').value = '';

  const quickCodes = [];
  if (cmd) {
    if (cmd.type && cmd.type !== 'SYS' && cmd.type !== 'INFO') quickCodes.push(cmd.type);
    (cmd.tokens || []).forEach(tk => {
      if (!tk.includes('?')) quickCodes.push(tk);
    });
  }

  const quickBox = document.getElementById('assignTermQuickCodes');
  if (quickCodes.length === 0) {
    quickBox.innerHTML = '';
  } else {
    quickBox.innerHTML = '<span class="text-slate-400 self-center">本篇代號：</span>' +
      quickCodes.map(c => {
        const cur = state.glossary[c] ? (' (' + state.glossary[c].split('(')[0].trim() + ')') : '';
        return '<button onclick="document.getElementById(\'assignTermCodeInput\').value=\'' + escapeHtml(c) + '\'" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 font-mono">' + (isDigitsOnly(c) ? ('#' + escapeHtml(c)) : escapeHtml(c)) + escapeHtml(cur) + '</button>';
      }).join('');
  }

  document.getElementById('assignTermModal').classList.remove('hidden');
  document.getElementById('assignTermCodeInput').focus();
};

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

// ==================== 右側視圖 2：獨立收件匣 ====================
function renderInboxView() {
  const box = document.getElementById('inboxFullContainer');
  const msgs = state.inboxMessages || [];

  if (msgs.length === 0) {
    box.innerHTML = '<div class="text-center py-12 text-xs text-slate-500">目前尚無收件匣消息，請點右上角「+ 新增收件匣消息」記錄遊戲中 <code class="text-sky-300 font-mono">inbox</code> 的信件。</div>';
    return;
  }

  box.innerHTML = msgs.map((msg, idx) => {
    const linkedPills = (msg.linkedDocs || []).map(docId => {
      const target = state.commands[docId];
      const st = STATUS_META[(target && target.status) ? target.status : 'todo'];
      return [
        '<div class="inline-flex items-center rounded-lg border ' + st.border + ' ' + st.bg + ' overflow-hidden">',
          '<button onclick="selectCommand(\'' + escapeHtml(docId) + '\')" class="px-2.5 py-1 text-xs font-mono ' + st.text + ' hover:underline flex items-center gap-1.5">',
            '<span class="w-1.5 h-1.5 rounded-full ' + st.dot + '"></span>',
            '<span>' + escapeHtml(docId) + '</span>',
          '</button>',
          '<button onclick="removeInboxDocLink(\'' + escapeHtml(msg.id) + '\', \'' + escapeHtml(docId) + '\')" class="px-1.5 py-1 text-xs text-slate-400 hover:text-rose-300 border-l border-slate-700/60">×</button>',
        '</div>'
      ].join('');
    }).join('');

    const matchedSenderCode = msg.senderCode || matchTermToGlossaryCode(msg.sender || '');
    const senderCodeBadge = matchedSenderCode
      ? '<button onclick="openTokenEditModal(\'\', \'' + escapeHtml(matchedSenderCode) + '\', -1)" class="px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-xs whitespace-nowrap" title="點擊查看此寄件者關聯代號">🔗 代號 #' + escapeHtml(matchedSenderCode) + '</button>'
      : (msg.sender
          ? '<button onclick="openAssignTermModal(\'' + escapeHtml(msg.sender) + '\')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs whitespace-nowrap" title="將此寄件者名稱綁定至字典代號">📌 綁定代號</button>'
          : '');

    return [
      '<div class="bg-[#0d1422] border border-slate-800 rounded-2xl p-4 space-y-3">',
        '<div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">',
          '<div class="flex flex-wrap items-center gap-2 flex-1 min-w-0">',
            '<span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-xs font-bold shrink-0">信件 #' + (idx + 1) + '</span>',
            '<div class="flex items-center gap-1.5 flex-1 min-w-[180px]">',
              '<span class="text-xs text-slate-400 whitespace-nowrap">主題：</span>',
              '<input id="inboxTitle_' + escapeHtml(msg.id) + '" type="text" value="' + escapeHtml(msg.title || '') + '" oninput="updateInboxField(\'' + escapeHtml(msg.id) + '\', \'title\', this.value)" placeholder="信件主題 (如：简述)..." class="flex-1 min-w-0 bg-[#090d16] border border-slate-700 focus:border-sky-500 rounded-lg px-2.5 py-1 text-xs font-bold text-white outline-none" />',
            '</div>',
            '<div class="flex items-center gap-1.5 flex-1 min-w-[200px]">',
              '<span class="text-xs text-amber-300/90 whitespace-nowrap"><i class="fa-regular fa-user mr-1"></i>寄件者：</span>',
              '<input id="inboxSender_' + escapeHtml(msg.id) + '" type="text" value="' + escapeHtml(msg.sender || '') + '" oninput="updateInboxField(\'' + escapeHtml(msg.id) + '\', \'sender\', this.value)" placeholder="發自 (如：Alan Thomas)..." class="flex-1 min-w-0 bg-[#090d16] border border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1 text-xs text-amber-200 font-mono outline-none" />',
              senderCodeBadge,
            '</div>',
          '</div>',
          '<div class="flex items-center gap-1.5 shrink-0">',
            '<button onclick="scanInboxMsgForDocs(\'' + escapeHtml(msg.id) + '\')" class="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs whitespace-nowrap"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>掃描信件內文檔指令</button>',
            '<button onclick="deleteInboxMsg(\'' + escapeHtml(msg.id) + '\')" class="px-2 py-1 rounded-lg bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 text-xs"><i class="fa-solid fa-trash"></i></button>',
          '</div>',
        '</div>',
        '<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">',
          '<div class="space-y-1">',
            '<label class="text-xs text-slate-400">信件內容 / 原文（貼上含「发自:」與「主题:」的文字會自動填入上方欄位）</label>',
            '<textarea rows="5" oninput="handleInboxContentInput(\'' + escapeHtml(msg.id) + '\', this.value)" placeholder="貼上此封信件的完整原文..." class="content-scalable w-full bg-[#090d16] border border-slate-800 focus:border-sky-500 rounded-xl p-2.5 font-mono text-xs text-slate-200 outline-none">' + escapeHtml(msg.content || '') + '</textarea>',
          '</div>',
          '<div class="space-y-1">',
            '<label class="text-xs text-slate-400">信件推理筆記</label>',
            '<textarea rows="5" oninput="updateInboxField(\'' + escapeHtml(msg.id) + '\', \'notes\', this.value)" placeholder="記錄這封信提供的線索或可疑之處..." class="content-scalable w-full bg-[#090d16] border border-slate-800 focus:border-emerald-500 rounded-xl p-2.5 text-xs text-slate-200 outline-none">' + escapeHtml(msg.notes || '') + '</textarea>',
          '</div>',
        '</div>',
        '<div class="bg-[#090d16] p-3 rounded-xl border border-slate-800/90 space-y-2">',
          '<label class="text-xs text-sky-300 font-medium block">🔗 此信件關聯／提及的文檔指令（點擊可跳轉至該文檔工作台）</label>',
          '<div class="flex flex-wrap gap-1.5">' + (linkedPills || '<span class="text-xs text-slate-500">尚無關聯文檔</span>') + '</div>',
          '<div class="flex items-center gap-1.5 pt-1">',
            '<input id="inboxLinkInput_' + escapeHtml(msg.id) + '" type="text" placeholder="輸入文檔名稱按 Enter 關聯..." class="flex-1 min-w-0 bg-[#0f1623] border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-200 outline-none" onkeydown="if(event.key===\'Enter\')addInboxDocLink(\'' + escapeHtml(msg.id) + '\')" />',
            '<button onclick="addInboxDocLink(\'' + escapeHtml(msg.id) + '\')" class="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium whitespace-nowrap">+ 關聯文檔</button>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }).join('');
}

window.handleInboxContentInput = function(msgId, val) {
  const msg = (state.inboxMessages || []).find(m => m.id === msgId);
  if (!msg) return;
  msg.content = val;

  let headerUpdated = false;
  const senderMatch = val.match(/(?:发自|發自|From)\s*[:：]\s*([^\n\r]+)/i);
  if (senderMatch && !msg.sender) {
    msg.sender = senderMatch[1].trim();
    const sEl = document.getElementById('inboxSender_' + msgId);
    if (sEl) sEl.value = msg.sender;
    headerUpdated = true;
  }

  const titleMatch = val.match(/(?:主题|主題|Subject)\s*[:：]\s*([^\n\r]+)/i);
  if (titleMatch && (!msg.title || msg.title.startsWith('消息 #'))) {
    msg.title = titleMatch[1].trim();
    const tEl = document.getElementById('inboxTitle_' + msgId);
    if (tEl) tEl.value = msg.title;
    headerUpdated = true;
  }

  saveState();
  if (headerUpdated) {
    renderSourceDropdowns();
    showToast('已自動從信件內文擷取寄件者與主題！', 'success');
  }
};

window.updateInboxField = function(msgId, field, val) {
  const msg = (state.inboxMessages || []).find(m => m.id === msgId);
  if (!msg) return;
  msg[field] = val;
  saveState();
  renderSourceDropdowns();
};

window.addInboxDocLink = function(msgId) {
  const msg = (state.inboxMessages || []).find(m => m.id === msgId);
  const input = document.getElementById('inboxLinkInput_' + msgId);
  if (!msg || !input || !input.value.trim()) return;
  const docId = addCommand(input.value.trim(), 'inbox:' + msg.id, 'todo');
  if (docId) {
    msg.linkedDocs = msg.linkedDocs || [];
    if (!msg.linkedDocs.includes(docId)) msg.linkedDocs.push(docId);
    input.value = '';
    saveState();
    renderAll();
    showToast('已關聯文檔：' + docId, 'success');
  }
};

window.removeInboxDocLink = function(msgId, docId) {
  const msg = (state.inboxMessages || []).find(m => m.id === msgId);
  if (!msg) return;
  msg.linkedDocs = (msg.linkedDocs || []).filter(d => d !== docId);
  if (state.commands[docId] && state.commands[docId].source === 'inbox:' + msgId) {
    state.commands[docId].source = '';
  }
  saveState();
  renderAll();
};

window.scanInboxMsgForDocs = function(msgId) {
  const msg = (state.inboxMessages || []).find(m => m.id === msgId);
  if (!msg) return;
  const text = (msg.content || '') + '\n' + (msg.notes || '');
  const regex = /\b\d{2}-[A-Za-z\?]{2,12}(?:-[A-Za-z0-9\?]+)*\b/g;
  const matches = Array.from(new Set(text.match(regex) || []));
  if (matches.length === 0) {
    showToast('信件中未偵測到文檔格式指令');
    return;
  }
  msg.linkedDocs = msg.linkedDocs || [];
  matches.forEach(m => {
    const cid = addCommand(m, 'inbox:' + msg.id, 'todo');
    if (cid && !msg.linkedDocs.includes(cid)) msg.linkedDocs.push(cid);
  });
  saveState();
  renderAll();
  showToast('已從信件掃描並關聯 ' + matches.length + ' 份文檔！', 'success');
};

window.deleteInboxMsg = function(msgId) {
  if (!confirm('確定要刪除此封收件匣消息嗎？')) return;
  state.inboxMessages = (state.inboxMessages || []).filter(m => m.id !== msgId);
  saveState();
  renderAll();
};

// ==================== 右側視圖 3：矩陣全覽 (三種視角 + 左欄固定 + 時段分組) ====================
function renderMatrixView() {
  const container = document.getElementById('matrixFullContainer');
  const docs = Object.values(state.commands).filter(c => c.category !== 'system' && c.type !== 'INFO');
  const segALabel = (state.segmentLabels && state.segmentLabels.segA) || '序號';
  const segBLabel = (state.segmentLabels && state.segmentLabels.segB) || '分類代號';
  const segCLabel = (state.segmentLabels && state.segmentLabels.segC) || '尾數代號';

  if (docs.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-xs text-slate-500">目前尚無結構化文檔可供繪製矩陣</div>';
    return;
  }

  // 模式 ①：序號(時段) × 分類代號(場所)
  if (state.ui.matrixMode === 'seq-type') {
    const seqs = Array.from(new Set(docs.map(d => d.seq).filter(Boolean))).sort((a, b) => Number(a) - Number(b));
    const types = Array.from(new Set(docs.map(d => d.type).filter(Boolean))).sort();

    const headCells = types.map(t => {
      return '<th class="p-2.5 font-mono text-amber-300 matrix-cell-fixed"><div class="font-bold text-sm truncate">' + escapeHtml(t) + '</div><div class="text-[11px] text-slate-300 font-normal truncate" title="' + escapeHtml(state.glossary[t] || '') + '">' + escapeHtml(state.glossary[t] || '未設定') + '</div></th>';
    }).join('');

    const bodyRows = seqs.map(seq => {
      const seqNote = state.glossary['SEQ_' + seq] || '';
      const cells = types.map(t => {
        const matches = docs.filter(d => d.seq === seq && d.type === t);
        if (matches.length === 0) {
          return '<td class="p-1.5 text-center matrix-cell-fixed"><button onclick="quickCreateFromMatrix(\'' + escapeHtml(seq) + '\',\'' + escapeHtml(t) + '\')" class="w-full py-2 rounded border border-dashed border-slate-800/80 hover:border-emerald-500/50 text-slate-700 hover:text-emerald-400 transition" title="點擊建立 ' + escapeHtml(seq) + '-' + escapeHtml(t) + '-?????">+</button></td>';
        }
        const itemsHtml = matches.map(m => {
          const st = STATUS_META[m.status] || STATUS_META.todo;
          const suffix = (m.rawTokens && m.rawTokens.length > 0) ? ('#' + m.rawTokens.join(', #')) : m.id;
          const peopleNames = (m.rawTokens || []).map(tk => state.glossary[tk] ? state.glossary[tk].split('(')[0].trim() : ('#' + tk)).join(', ');
          const tooltip = [m.id, peopleNames, m.notes].filter(Boolean).join('\n');
          return [
            '<div onclick="selectCommand(\'' + escapeHtml(m.id) + '\')" title="' + escapeHtml(tooltip) + '" class="p-2 rounded-lg border ' + st.border + ' ' + st.bg + ' cursor-pointer hover:brightness-125 transition overflow-hidden">',
              '<div class="flex items-center justify-between gap-1">',
                '<span class="font-mono font-bold ' + st.text + ' text-xs flex items-center gap-1 truncate">',
                  '<span class="w-2 h-2 rounded-full shrink-0 ' + st.dot + '"></span>',
                  '<span class="truncate">' + escapeHtml(suffix) + '</span>',
                '</span>',
              '</div>',
              '<div class="text-[11px] text-sky-200/90 truncate mt-0.5">' + escapeHtml(peopleNames) + '</div>',
              (m.notes ? '<div class="text-[11px] text-slate-400 truncate mt-0.5">' + escapeHtml(m.notes) + '</div>' : ''),
            '</div>'
          ].join('');
        }).join('');
        return '<td class="p-1.5 align-top space-y-1.5 matrix-cell-fixed">' + itemsHtml + '</td>';
      }).join('');

      return '<tr class="hover:bg-slate-900/40"><th class="sticky-col p-2.5 font-mono font-bold text-xs text-slate-200 w-32 min-w-[120px] whitespace-nowrap"><div>🕒 #' + escapeHtml(seq) + '</div><div class="text-[10px] text-slate-400 font-normal truncate max-w-[105px]">' + escapeHtml(seqNote) + '</div></th>' + cells + '</tr>';
    }).join('');

    container.innerHTML = '<table class="matrix-table text-left border-t border-l border-slate-800 text-xs"><thead><tr><th class="sticky-corner p-2.5 font-mono text-slate-400 w-32 min-w-[120px] whitespace-nowrap">' + escapeHtml(segALabel) + ' \\ ' + escapeHtml(segBLabel) + '</th>' + headCells + '</tr></thead><tbody>' + bodyRows + '</tbody></table>';
    return;
  }

  // 模式 ③：時段(序號) × 尾數代號(人物) —— 一眼看穿每個時段誰在哪個場所！
  if (state.ui.matrixMode === 'seq-token') {
    const seqs = Array.from(new Set(docs.map(d => d.seq).filter(Boolean))).sort((a, b) => Number(a) - Number(b));
    const allTokens = getAllDiscoveredTokens();

    const tokenHeaders = allTokens.map(tk => {
      const gNote = state.glossary[tk] || '';
      const shortName = gNote ? gNote.split('(')[0].trim() : '';
      return '<th class="p-2 text-center font-mono text-sky-300 w-24 min-w-[92px] max-w-[105px]" title="' + escapeHtml(gNote) + '"><div class="font-bold">#' + escapeHtml(tk) + '</div><div class="text-[10px] text-slate-300 font-normal truncate">' + escapeHtml(shortName) + '</div></th>';
    }).join('');

    const seqRows = seqs.map(seq => {
      const seqDocs = docs.filter(d => d.seq === seq);
      const seqNote = state.glossary['SEQ_' + seq] || '';

      const cells = allTokens.map(tk => {
        const presentDocs = seqDocs.filter(d => (d.rawTokens || []).includes(tk));
        if (presentDocs.length > 0) {
          const badges = presentDocs.map(pd => {
            const locShort = state.glossary[pd.type] ? state.glossary[pd.type].split('(')[0].trim() : '';
            const st = STATUS_META[pd.status] || STATUS_META.todo;
            return '<button onclick="selectCommand(\'' + escapeHtml(pd.id) + '\')" title="點擊開啟 ' + escapeHtml(pd.id) + '" class="w-full px-1.5 py-1 rounded border ' + st.border + ' ' + st.bg + ' ' + st.text + ' font-mono font-bold text-[11px] hover:brightness-125 truncate block">' + escapeHtml(pd.type) + (locShort ? ('·' + escapeHtml(locShort)) : '') + '</button>';
          }).join('');
          return '<td class="p-1.5 text-center align-middle space-y-1 bg-emerald-950/15">' + badges + '</td>';
        }

        // 檢查該時段是否有文檔提及此代號
        let mentionInfo = null;
        for (let i = 0; i < seqDocs.length; i++) {
          const ms = getStructuredMentionsForCmd(seqDocs[i]);
          const hit = ms.find(m => m.matchedCode === tk);
          if (hit) {
            mentionInfo = { doc: seqDocs[i], hit: hit };
            break;
          }
        }
        if (mentionInfo) {
          const sp = mentionInfo.hit.speaker ? ('#' + mentionInfo.hit.speaker) : '內文';
          return '<td class="p-1.5 text-center align-middle"><button onclick="selectCommand(\'' + escapeHtml(mentionInfo.doc.id) + '\')" title="於 ' + escapeHtml(mentionInfo.doc.id) + ' 被 ' + escapeHtml(sp) + ' 提及" class="w-full px-1 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono text-[10px] hover:brightness-125 truncate">' + escapeHtml(mentionInfo.doc.type + ':' + sp + '提') + '</button></td>';
        }

        return '<td class="p-1.5 text-center font-mono text-slate-700">·</td>';
      }).join('');

      return '<tr class="hover:bg-slate-900/50"><th class="sticky-col p-2.5 font-mono text-left w-36 min-w-[140px] whitespace-nowrap"><div class="text-emerald-300 font-bold">🕒 時段 #' + escapeHtml(seq) + ' <span class="text-[10px] text-slate-400 font-normal">(' + seqDocs.length + '篇)</span></div><div class="text-[10px] text-slate-400 font-normal truncate max-w-[125px]">' + escapeHtml(seqNote) + '</div></th>' + cells + '</tr>';
    }).join('');

    container.innerHTML = [
      '<div class="mb-3 text-xs text-slate-300 bg-[#0f1623] p-3 rounded-xl border border-slate-800 flex flex-wrap items-center gap-4">',
        '<span>💡 <strong>時段行蹤總表</strong>：直接顯示每個時段（序號）各代號所在的分類位置（如 <code class="text-emerald-300 font-mono">KI·厨房</code>、<code class="text-emerald-300 font-mono">ST·书房</code>），點擊任意格子可直接開啟該文檔！</span>',
      '</div>',
      '<table class="matrix-table text-left border-t border-l border-slate-800 text-xs">',
        '<thead><tr><th class="sticky-corner p-2.5 font-mono text-slate-300 w-36 min-w-[140px] whitespace-nowrap">' + escapeHtml(segALabel) + ' \\ ' + escapeHtml(segCLabel) + '</th>' + tokenHeaders + '</tr></thead>',
        '<tbody>' + seqRows + '</tbody>',
      '</table>'
    ].join('');
    return;
  }

  // 模式 ②：文檔(依時段分組) × 尾數代號（左欄使用原生 th.sticky-col 確保往右滑時固定不動，並依序號時段強化分組）
  const allTokens = getAllDiscoveredTokens();
  const sortedDocs = [...docs].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  // 統計每個序號有幾篇文檔
  const seqCounts = {};
  sortedDocs.forEach(d => {
    const s = d.seq || '其他';
    seqCounts[s] = (seqCounts[s] || 0) + 1;
  });

  const tokenHeaders = allTokens.map(tk => {
    const gNote = state.glossary[tk] || '';
    const shortName = gNote ? gNote.split('(')[0].trim() : '';
    return '<th class="p-2 text-center font-mono text-sky-300 w-20 min-w-[78px] max-w-[86px]" title="' + escapeHtml(gNote) + '"><div class="font-bold">#' + escapeHtml(tk) + '</div><div class="text-[10px] text-slate-300 font-normal truncate">' + escapeHtml(shortName) + '</div></th>';
  }).join('');

  let lastSeq = null;
  let seqGroupIndex = 0;
  const docRows = [];

  sortedDocs.forEach(d => {
    const curSeq = d.seq || '其他';
    const isNewSeq = curSeq !== lastSeq;
    if (isNewSeq) {
      lastSeq = curSeq;
      seqGroupIndex++;
      // 當同一個序號（時段）有多篇文檔，或切換時段時，插入醒目的時段分組列
      const seqMeaning = state.glossary['SEQ_' + curSeq] ? (' — ' + state.glossary['SEQ_' + curSeq]) : '';
      const countBadge = seqCounts[curSeq] > 1
        ? '<span class="ml-2 px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">同時段共 ' + seqCounts[curSeq] + ' 篇文檔</span>'
        : '';
      docRows.push(
        '<tr class="bg-[#111c30]"><th class="sticky-col px-3 py-1.5 font-mono text-[11px] text-emerald-300 font-bold border-t-2 border-t-emerald-500/40 whitespace-nowrap">🕒 ' + escapeHtml(segALabel) + ' #' + escapeHtml(curSeq) + escapeHtml(seqMeaning) + countBadge + '</th>' +
        '<td colspan="' + Math.max(1, allTokens.length) + '" class="border-t-2 border-t-emerald-500/40 bg-[#111c30]/70"></td></tr>'
      );
    }

    const st = STATUS_META[d.status] || STATUS_META.todo;
    const locName = state.glossary[d.type] ? ('[' + state.glossary[d.type].split('(')[0].trim() + ']') : '';
    const mentions = getStructuredMentionsForCmd(d);
    const rowBg = (seqGroupIndex % 2 === 0) ? 'bg-[#0b111e]' : 'bg-[#090d16]';

    const cells = allTokens.map(tk => {
      const structCount = (d.rawTokens || []).filter(x => x === tk).length;
      const matchedMention = mentions.find(m => m.matchedCode === tk);
      if (structCount > 0) {
        return '<td class="p-2 text-center font-mono bg-emerald-500/20 text-emerald-300 font-bold whitespace-nowrap">' + (structCount > 1 ? ('●×' + structCount) : '●') + '</td>';
      }
      if (matchedMention) {
        const spText = matchedMention.speaker ? ('#' + matchedMention.speaker + '提及') : '💬提及';
        return '<td class="p-2 text-center font-mono bg-purple-500/20 text-purple-300 font-bold whitespace-nowrap" title="' + escapeHtml(spText + ': ' + matchedMention.targetText) + '">' + escapeHtml(spText) + '</td>';
      }
      return '<td class="p-2 text-center font-mono text-slate-700">·</td>';
    }).join('');

    // 注意：不能在 <th> 直接加 flex，必須包在內部 <div>，否則 position: sticky 會失效！
    docRows.push(
      '<tr class="' + rowBg + ' hover:bg-slate-800/60">' +
        '<th onclick="selectCommand(\'' + escapeHtml(d.id) + '\')" class="sticky-col p-2.5 font-mono cursor-pointer hover:underline w-60 min-w-[235px] max-w-[250px] whitespace-nowrap" title="' + escapeHtml(d.id + ' ' + locName) + '">' +
          '<div class="flex items-center gap-1.5 overflow-hidden">' +
            '<span class="w-2 h-2 rounded-full shrink-0 ' + st.dot + '"></span>' +
            '<span class="text-white font-bold shrink-0">' + escapeHtml(d.id) + '</span>' +
            '<span class="text-amber-300/85 text-[11px] font-normal truncate">' + escapeHtml(locName) + '</span>' +
          '</div>' +
        '</th>' +
        cells +
      '</tr>'
    );
  });

  container.innerHTML = [
    '<div class="mb-3 text-xs text-slate-300 bg-[#0f1623] p-3 rounded-xl border border-slate-800 flex flex-wrap items-center gap-4">',
      '<span>💡 <strong>交叉比對圖例</strong>：</span>',
      '<span class="text-emerald-300 font-mono">● 出現在指令結構中</span>',
      '<span class="text-purple-300 font-mono">#11提及 = 該代號在對話中被 #11 提及</span>',
      '<span class="text-slate-400">（往右滑動查看 #11 時，左側文檔欄會保持固定）</span>',
    '</div>',
    '<table class="matrix-table text-left border-t border-l border-slate-800 text-xs">',
      '<thead><tr><th class="sticky-corner p-2.5 font-mono text-slate-300 w-60 min-w-[235px] whitespace-nowrap">文檔指令 \\ ' + escapeHtml(segCLabel) + '</th>' + tokenHeaders + '</tr></thead>',
      '<tbody>' + docRows.join('') + '</tbody>',
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
      manualMentions: [],
      notes: '',
      rawOutput: '',
      scratchpad: [],
      localTokenNotes: {},
      updatedAt: Date.now()
    };
  }
  selectCommand(newId);
};

// ==================== 右側視圖 4：關聯脈絡圖 ====================
function renderNetworkView() {
  const box = document.getElementById('networkFullContainer');
  const all = Object.values(state.commands);
  const mode = state.ui.netMode || 'cards';

  if (all.length === 0) {
    box.innerHTML = '<div class="text-xs text-slate-500 py-12 text-center">目前尚無文檔資料可供顯示脈絡圖</div>';
    return;
  }

  if (mode === 'cards') {
    const groups = [];

    (state.inboxMessages || []).forEach(msg => {
      const children = all.filter(c => c.source === 'inbox:' + msg.id || (msg.linkedDocs || []).includes(c.id));
      if (children.length > 0) {
        groups.push({
          title: '📬 收件匣：' + (msg.title || '未命名') + (msg.sender ? (' (發自: ' + msg.sender + ')') : ''),
          subtitle: msg.notes || '',
          isInbox: true,
          children: children
        });
      }
    });

    all.forEach(parent => {
      const children = all.filter(c => c.source === parent.id || (parent.children || []).includes(c.id));
      if (children.length > 0) {
        groups.push({
          id: parent.id,
          title: parent.id,
          subtitle: parent.notes || '',
          status: parent.status,
          children: children
        });
      }
    });

    if (groups.length === 0) {
      box.innerHTML = '<div class="text-xs text-slate-500 py-8 text-center">尚無建立來源與衍生關聯的文檔</div>';
      return;
    }

    box.innerHTML = groups.map(g => {
      const st = STATUS_META[g.status || 'solved'];
      const childCards = g.children.map(ch => {
        const cst = STATUS_META[ch.status] || STATUS_META.todo;
        const locName = state.glossary[ch.type] ? state.glossary[ch.type].split('(')[0].trim() : '';
        return [
          '<div onclick="selectCommand(\'' + escapeHtml(ch.id) + '\')" class="p-2.5 rounded-xl border ' + cst.border + ' ' + cst.bg + ' cursor-pointer hover:brightness-125 transition space-y-1">',
            '<div class="flex items-center justify-between gap-2">',
              '<span class="font-mono font-bold text-white text-xs whitespace-nowrap flex items-center gap-1.5">',
                '<span class="w-2 h-2 rounded-full shrink-0 ' + cst.dot + '"></span>',
                '<span>' + escapeHtml(ch.id) + '</span>',
              '</span>',
              (locName ? '<span class="text-[11px] text-amber-300 font-mono truncate">' + escapeHtml(locName) + '</span>' : ''),
            '</div>',
            (ch.notes ? '<div class="text-xs text-slate-300 line-clamp-2">' + escapeHtml(ch.notes) + '</div>' : ''),
          '</div>'
        ].join('');
      }).join('');

      return [
        '<div class="bg-[#0d1422] border border-slate-800 rounded-2xl p-4 space-y-3">',
          '<div class="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">',
            '<div class="flex items-center gap-2 min-w-0">',
              (g.id
                ? '<button onclick="selectCommand(\'' + escapeHtml(g.id) + '\')" class="px-2.5 py-1 rounded-lg border ' + st.border + ' ' + st.bg + ' font-mono font-bold text-white text-xs whitespace-nowrap shrink-0 hover:underline">' + escapeHtml(g.title) + '</button>'
                : '<span class="px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-500/40 font-bold text-sky-300 text-xs whitespace-nowrap shrink-0">' + escapeHtml(g.title) + '</span>'),
              '<span class="text-xs text-slate-400 truncate">' + escapeHtml(g.subtitle) + '</span>',
            '</div>',
            '<span class="text-xs font-mono text-sky-400 shrink-0">衍生 ' + g.children.length + ' 篇</span>',
          '</div>',
          '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">' + childCards + '</div>',
        '</div>'
      ].join('');
    }).join('');
    return;
  }

  const roots = all.filter(c => !c.source || !state.commands[c.source]);
  function renderNode(cmd, depth = 0, visited = new Set()) {
    if (visited.has(cmd.id)) return '';
    visited.add(cmd.id);
    const st = STATUS_META[cmd.status] || STATUS_META.todo;
    const children = all.filter(c => c.source === cmd.id || (cmd.children || []).includes(c.id));
    const indentCls = depth > 0 ? 'ml-4 pl-3 border-l border-slate-700/80 mt-2' : 'mt-2.5';

    return [
      '<div class="' + indentCls + '">',
        '<div onclick="selectCommand(\'' + escapeHtml(cmd.id) + '\')" class="p-2.5 rounded-xl border ' + st.border + ' ' + st.bg + ' cursor-pointer hover:brightness-125 transition max-w-2xl">',
          '<div class="flex items-center gap-2">',
            '<span class="w-2 h-2 rounded-full shrink-0 ' + st.dot + '"></span>',
            '<span class="font-mono font-bold text-white text-xs whitespace-nowrap shrink-0">' + escapeHtml(cmd.id) + '</span>',
            '<span class="text-[11px] text-slate-400 font-mono truncate">（來源: ' + escapeHtml(formatSourceLabel(cmd.source)) + '）</span>',
          '</div>',
          (cmd.notes ? '<div class="text-xs text-slate-300 mt-1 line-clamp-1">' + escapeHtml(cmd.notes) + '</div>' : ''),
        '</div>',
        children.map(ch => renderNode(ch, depth + 1, new Set(visited))).join(''),
      '</div>'
    ].join('');
  }
  box.innerHTML = roots.map(r => renderNode(r)).join('');
}

// ==================== 字典與代號互相關聯 ====================
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
  document.getElementById('labelSegAInput').value = (state.segmentLabels && state.segmentLabels.segA) || '序號';
  document.getElementById('labelSegBInput').value = (state.segmentLabels && state.segmentLabels.segB) || '分類代號';
  document.getElementById('labelSegCInput').value = (state.segmentLabels && state.segmentLabels.segC) || '尾數代號';

  const tab = state.ui.glossaryTab || 'tokens';
  document.querySelectorAll('.g-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.gTab === tab);
  });

  const docs = Object.values(state.commands);
  const rows = [];

  if (tab === 'tokens') {
    getAllDiscoveredTokens().forEach(tk => {
      rows.push({ key: tk, badge: '#' + tk, badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40' });
    });
  } else if (tab === 'types') {
    const types = Array.from(new Set([
      ...docs.map(d => d.type).filter(t => t && t !== 'SYS' && t !== 'INFO'),
      ...Object.keys(state.glossary).filter(k => !isDigitsOnly(k) && !k.startsWith('SEQ_'))
    ])).sort();
    types.forEach(tp => {
      rows.push({ key: tp, badge: tp, badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40' });
    });
  } else if (tab === 'seqs') {
    const seqs = Array.from(new Set(docs.map(d => d.seq).filter(Boolean))).sort((a, b) => Number(a) - Number(b));
    seqs.forEach(sq => {
      rows.push({ key: 'SEQ_' + sq, badge: '序號 ' + sq, badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' });
    });
  } else {
    const allKeys = Array.from(new Set([...Object.keys(state.glossary), ...Object.keys(state.glossaryRelations || {})])).sort();
    allKeys.forEach(k => {
      rows.push({ key: k, badge: k, badgeClass: 'bg-slate-800 text-slate-200 border-slate-700' });
    });
  }

  const box = document.getElementById('glossaryTableContainer');
  if (rows.length === 0) {
    box.innerHTML = '<div class="text-xs text-slate-500 py-6 text-center">目前尚無對應代號項目（當你新增文檔或手動登錄代號後，會自動顯示於此）</div>';
    return;
  }

  box.innerHTML = rows.map(r => {
    const backlinks = getBacklinksForCode(r.key);
    const structText = backlinks.inStructure.length
      ? '<span class="text-emerald-400">結構出現(' + backlinks.inStructure.length + '): ' + escapeHtml(backlinks.inStructure.join(', ')) + '</span>'
      : '';
    const spokenSummary = backlinks.spokenByThisCode.length
      ? '<span class="text-sky-300">此代號曾提及: ' + escapeHtml(Array.from(new Set(backlinks.spokenByThisCode.map(s => s.targetText))).join('、')) + '</span>'
      : '';
    const mentionedSummary = backlinks.mentionedByOthers.length
      ? '<span class="text-purple-300">被提及於: ' + escapeHtml(backlinks.mentionedByOthers.map(m => m.docId + (m.speaker ? ('(由#' + m.speaker + ')') : '')).join(', ')) + '</span>'
      : '';

    return [
      '<div class="bg-[#090d16] p-3 rounded-xl border border-slate-800 space-y-2">',
        '<div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">',
          '<div class="md:col-span-2">',
            '<button onclick="openTokenEditModal(\'\', \'' + escapeHtml(r.key) + '\', -1)" class="px-2.5 py-1 rounded border font-mono font-bold text-xs inline-block hover:brightness-125 ' + r.badgeClass + '">' + escapeHtml(r.badge) + '</button>',
          '</div>',
          '<div class="md:col-span-5">',
            '<input type="text" value="' + escapeHtml(state.glossary[r.key] || '') + '" placeholder="輸入 ' + escapeHtml(r.badge) + ' 的推測定義或名稱..." oninput="updateGlossaryDirect(\'' + escapeHtml(r.key) + '\', this.value)" class="w-full bg-[#0f1623] border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-1.5 text-xs text-slate-100 outline-none" />',
          '</div>',
          '<div class="md:col-span-5">',
            '<input type="text" value="' + escapeHtml((state.glossaryRelations && state.glossaryRelations[r.key]) || '') + '" placeholder="關聯其他代號或備註..." oninput="updateGlossaryRelDirect(\'' + escapeHtml(r.key) + '\', this.value)" class="w-full bg-[#0f1623] border border-slate-700 focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none" />',
          '</div>',
        '</div>',
        ((structText || spokenSummary || mentionedSummary)
          ? '<div class="flex flex-wrap gap-3 text-[11px] font-mono pt-0.5">' + [structText, spokenSummary, mentionedSummary].filter(Boolean).join(' · ') + '</div>'
          : ''),
      '</div>'
    ].join('');
  }).join('');
}

window.updateGlossaryDirect = function(key, val) {
  if (val.trim()) state.glossary[key] = val.trim();
  else delete state.glossary[key];
  saveState();
  renderTopStatsAndBadges();
  renderCommandList();
  if (state.ui.mainView === 'workspace') renderWorkspace();
};

window.updateGlossaryRelDirect = function(key, val) {
  state.glossaryRelations = state.glossaryRelations || {};
  if (val.trim()) state.glossaryRelations[key] = val.trim();
  else delete state.glossaryRelations[key];
  saveState();
};

window.openTokenEditModal = function(cmdId, tokenKey, posIndex) {
  activeTokenEdit = { cmdId: cmdId, tokenKey: tokenKey, posIndex: posIndex };
  const cmd = state.commands[cmdId];
  document.getElementById('tokenModalTitle').textContent = '代號詳情與編輯：' + (isDigitsOnly(tokenKey) ? ('#' + tokenKey) : tokenKey);
  document.getElementById('tokenModalSubtitle').textContent = '可檢視此代號在所有文檔中的出場紀錄、說過的關鍵詞與被誰提及';

  document.getElementById('tokenGlobalInput').value = state.glossary[tokenKey] || '';
  document.getElementById('tokenRelInput').value = (state.glossaryRelations && state.glossaryRelations[tokenKey]) || '';

  const localSec = document.getElementById('tokenLocalSection');
  if (posIndex >= 0 && cmd) {
    localSec.classList.remove('hidden');
    document.getElementById('tokenLocalInput').value = (cmd.localTokenNotes && cmd.localTokenNotes[posIndex]) ? cmd.localTokenNotes[posIndex] : '';
  } else {
    localSec.classList.add('hidden');
  }

  const bl = getBacklinksForCode(tokenKey);
  const structBtns = bl.inStructure.map(id => '<button onclick="document.getElementById(\'tokenModal\').classList.add(\'hidden\');selectCommand(\'' + escapeHtml(id) + '\')" class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono hover:underline">' + escapeHtml(id) + '</button>').join(' ');

  const spokenBtns = bl.spokenByThisCode.map(item => '<button onclick="document.getElementById(\'tokenModal\').classList.add(\'hidden\');selectCommand(\'' + escapeHtml(item.docId) + '\')" class="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono hover:underline">於 ' + escapeHtml(item.docId) + ' 提到「' + escapeHtml(item.targetText) + '」</button>').join(' ');

  const mentionedBtns = bl.mentionedByOthers.map(item => '<button onclick="document.getElementById(\'tokenModal\').classList.add(\'hidden\');selectCommand(\'' + escapeHtml(item.docId) + '\')" class="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono hover:underline">' + escapeHtml(item.docId) + (item.speaker ? (' (由 #' + escapeHtml(item.speaker) + ' 提及)') : ' (內文提及)') + '</button>').join(' ');

  document.getElementById('tokenBacklinksBox').innerHTML = [
    '<div class="text-slate-300 font-bold mb-1">📊 此代號在案情中的關聯紀錄（點擊可跳轉至該文檔）：</div>',
    '<div class="flex flex-wrap gap-1 items-center"><span class="text-slate-400">結構包含：</span>' + (structBtns || '<span class="text-slate-600">無</span>') + '</div>',
    '<div class="flex flex-wrap gap-1 items-center pt-1"><span class="text-sky-300/90">此代號曾提及：</span>' + (spokenBtns || '<span class="text-slate-600">無</span>') + '</div>',
    '<div class="flex flex-wrap gap-1 items-center pt-1"><span class="text-purple-300/90">被他人提及：</span>' + (mentionedBtns || '<span class="text-slate-600">無</span>') + '</div>'
  ].join('');

  document.getElementById('tokenModal').classList.remove('hidden');
};

// ==================== 系統指令獨立面板 ====================
function renderSysCmdModal() {
  const box = document.getElementById('sysCmdListContainer');
  const list = state.systemCommands || [];
  box.innerHTML = list.map((item, idx) => [
    '<div class="flex items-center justify-between gap-2 bg-[#090d16] p-3 rounded-xl border border-slate-800 text-xs">',
      '<div class="flex items-center gap-2.5 flex-1 min-w-0">',
        '<span class="px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono font-bold shrink-0">' + escapeHtml(item.id) + '</span>',
        '<input type="text" value="' + escapeHtml(item.desc || '') + '" oninput="updateSysCmdDesc(' + idx + ', this.value)" class="flex-1 min-w-0 bg-[#0f1623] border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-1 text-slate-200 outline-none" />',
      '</div>',
      '<div class="flex items-center gap-1 shrink-0">',
        '<button onclick="copyText(\'' + escapeHtml(item.id) + '\')" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">複製</button>',
        '<button onclick="deleteSysCmd(' + idx + ')" class="px-2 py-1 text-slate-500 hover:text-rose-400">×</button>',
      '</div>',
    '</div>'
  ].join('')).join('');
}

window.updateSysCmdDesc = function(idx, val) {
  if (state.systemCommands && state.systemCommands[idx]) {
    state.systemCommands[idx].desc = val;
    saveState();
  }
};

window.deleteSysCmd = function(idx) {
  state.systemCommands.splice(idx, 1);
  saveState();
  renderSysCmdModal();
  renderTopStatsAndBadges();
};

// ==================== 文檔新增、修改、關聯與測試板操作 ====================
function addCommand(rawId, source = '', status = 'todo') {
  const parsed = parseCommandStructure(rawId);
  if (!parsed.id) return null;

  if (KNOWN_SYS_CMDS.includes(parsed.id.toLowerCase())) {
    const exists = (state.systemCommands || []).some(s => s.id.toLowerCase() === parsed.id.toLowerCase());
    if (!exists) {
      state.systemCommands.push({ id: parsed.id, desc: '' });
      saveState();
      renderTopStatsAndBadges();
    }
    showToast('「' + parsed.id + '」為系統指令，已收納於頂部「系統指令」面板');
    return null;
  }

  const cleanSource = source === parsed.id ? '' : source;
  const existing = state.commands[parsed.id];
  if (existing) {
    if (cleanSource && !existing.source) {
      existing.source = cleanSource;
    }
    if (cleanSource && state.commands[cleanSource]) {
      const parent = state.commands[cleanSource];
      parent.children = parent.children || [];
      if (!parent.children.includes(parsed.id)) parent.children.push(parsed.id);
    }
    return existing.id;
  }

  state.commands[parsed.id] = {
    ...parsed,
    status: status,
    source: cleanSource,
    children: [],
    manualMentions: [],
    notes: '',
    rawOutput: '',
    scratchpad: [],
    localTokenNotes: {},
    updatedAt: Date.now()
  };

  if (cleanSource && state.commands[cleanSource]) {
    const parent = state.commands[cleanSource];
    parent.children = parent.children || [];
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
  const newRaw = prompt('請輸入新的文檔指令名稱：', cmd.id);
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
  (state.inboxMessages || []).forEach(m => {
    m.linkedDocs = (m.linkedDocs || []).map(d => d === oldId ? parsed.id : d);
  });
  state.ui.selectedId = parsed.id;
  saveState();
  renderAll();
};

window.deleteCurrentCommand = function() {
  const cmd = state.commands[state.ui.selectedId];
  if (!cmd || !confirm('確定要刪除文檔「' + cmd.id + '」嗎？')) return;
  delete state.commands[cmd.id];
  const remainingIds = Object.keys(state.commands);
  state.ui.selectedId = remainingIds.length > 0 ? remainingIds[0] : '';
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

// 測試板點擊「✕ 無效」：切換紅底狀態並彈出提示
window.setScratchStatus = function(idx, st) {
  const cmd = state.commands[state.ui.selectedId];
  if (!cmd || !cmd.scratchpad || !cmd.scratchpad[idx]) return;
  const item = cmd.scratchpad[idx];
  item.status = item.status === st ? 'untested' : st;
  saveState();
  renderWorkspace();
  if (item.status === 'fail') {
    showToast('✕ 已標記「' + item.text + '」為無效組合', 'warn');
  } else {
    showToast('已恢復「' + item.text + '」為未測試狀態');
  }
};

// 測試板點擊「✓ 有效 (建立並關聯)」：標記為綠底有效、直接綁定為當前文檔的「衍生發現指令」，並停留在當前頁面方便繼續測試！
window.markScratchValidAndLink = function(idx) {
  const cmd = state.commands[state.ui.selectedId];
  const item = (cmd && cmd.scratchpad) ? cmd.scratchpad[idx] : null;
  if (!item) return;

  item.status = 'ok';
  // 直接以當前文檔 cmd.id 為來源建立或更新目標文檔，確保雙向關聯！
  const newId = addCommand(item.text, cmd.id, 'todo');
  if (newId && newId !== cmd.id) {
    cmd.children = cmd.children || [];
    if (!cmd.children.includes(newId)) {
      cmd.children.push(newId);
    }
    if (state.commands[newId] && !state.commands[newId].source) {
      state.commands[newId].source = cmd.id;
    }
  }
  saveState();
  renderAll();
  showToast('✓ 測試有效！已建立「' + (newId || item.text) + '」並直接關聯至本篇衍生指令', 'success');
};

window.deleteScratchItem = function(idx) {
  const cmd = state.commands[state.ui.selectedId];
  if (!cmd || !cmd.scratchpad) return;
  cmd.scratchpad.splice(idx, 1);
  saveState();
  renderWorkspace();
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

  document.querySelectorAll('.net-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ui.netMode = btn.dataset.netMode;
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
      showToast('已新增文檔：' + id, 'success');
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
    let lastAddedId = '';
    lines.forEach(line => {
      const id = addCommand(line, src, st);
      if (id) { count++; lastAddedId = id; }
    });
    if (!state.ui.selectedId && lastAddedId) state.ui.selectedId = lastAddedId;
    document.getElementById('batchCmdInput').value = '';
    document.getElementById('batchDrawer').classList.add('hidden');
    saveState();
    renderAll();
    showToast('已批次匯入 ' + count + ' 筆文檔', 'success');
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
    e.target.textContent = '邏輯: ' + filters.tokenLogic;
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
    if (!cmd || !cmd.source) return;
    if (cmd.source.startsWith('inbox:')) {
      state.ui.mainView = 'inbox';
      saveState();
      renderAll();
    } else if (state.commands[cmd.source]) {
      selectCommand(cmd.source);
    }
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

  const handleAddMentionCode = () => {
    const cmd = state.commands[state.ui.selectedId];
    const spInput = document.getElementById('addMentionSpeakerInput');
    const tgInput = document.getElementById('addMentionCodeInput');
    const speaker = spInput.value.trim().replace(/^#/, '');
    const target = tgInput.value.trim();
    if (!cmd || !target) return;
    cmd.manualMentions = cmd.manualMentions || [];
    cmd.manualMentions.push({ speaker: speaker, target: target });
    spInput.value = '';
    tgInput.value = '';
    saveState();
    renderAll();
    showToast('已新增對話提及紀錄', 'success');
  };
  document.getElementById('addMentionCodeBtn').addEventListener('click', handleAddMentionCode);
  document.getElementById('addMentionCodeInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddMentionCode();
  });

  document.getElementById('closeAssignTermBtn').addEventListener('click', () => {
    document.getElementById('assignTermModal').classList.add('hidden');
  });
  document.getElementById('cancelAssignTermBtn').addEventListener('click', () => {
    document.getElementById('assignTermModal').classList.add('hidden');
  });
  document.getElementById('confirmAssignTermBtn').addEventListener('click', () => {
    const termVal = document.getElementById('assignTermValueInput').value.trim();
    const codeKey = document.getElementById('assignTermCodeInput').value.trim().replace(/^#/, '').toUpperCase();
    if (!termVal || !codeKey) {
      showToast('請輸入要綁定的代號（如 6 或 KI）');
      return;
    }
    state.glossary[codeKey] = termVal;
    document.getElementById('assignTermModal').classList.add('hidden');
    saveState();
    renderAll();
    showToast('已將「' + termVal + '」歸入字典代號 ' + codeKey + '！', 'success');
  });

  document.getElementById('addInboxMsgBtn').addEventListener('click', () => {
    state.inboxMessages = state.inboxMessages || [];
    const nextNum = state.inboxMessages.length + 1;
    state.inboxMessages.push({
      id: 'msg-' + Date.now(),
      title: '消息 #' + nextNum,
      sender: '',
      senderCode: '',
      content: '',
      notes: '',
      linkedDocs: []
    });
    saveState();
    renderAll();
  });

  document.getElementById('openSysCmdBtn').addEventListener('click', () => {
    renderSysCmdModal();
    document.getElementById('sysCmdModal').classList.remove('hidden');
  });
  document.getElementById('closeSysCmdBtn').addEventListener('click', () => {
    document.getElementById('sysCmdModal').classList.add('hidden');
  });
  document.getElementById('addSysCmdBtn').addEventListener('click', () => {
    const k = document.getElementById('sysKeyInput').value.trim();
    const d = document.getElementById('sysDescInput').value.trim();
    if (!k) return;
    state.systemCommands = state.systemCommands || [];
    state.systemCommands.push({ id: k, desc: d });
    document.getElementById('sysKeyInput').value = '';
    document.getElementById('sysDescInput').value = '';
    saveState();
    renderSysCmdModal();
    renderTopStatsAndBadges();
  });

  document.getElementById('extractNamesBtn').addEventListener('click', () => {
    const cmd = state.commands[state.ui.selectedId];
    if (!cmd) return;
    const text = (cmd.rawOutput || '') + '\n' + (cmd.notes || '');
    const added = extractBracketedCodesFromText(text);
    if (added > 0) {
      saveState();
      renderAll();
      showToast('已自動提取並登錄 ' + added + ' 筆行首 [代號 名稱] 至字典！', 'success');
    } else {
      showToast('未發現新的行首 [代號 名稱] 格式（對話中提及的稱呼已列於下方紫色提及區）');
    }
  });

  document.getElementById('scanAllDocsNamesBtn').addEventListener('click', () => {
    let totalAdded = 0;
    Object.values(state.commands).forEach(c => {
      totalAdded += extractBracketedCodesFromText((c.rawOutput || '') + '\n' + (c.notes || ''));
    });
    saveState();
    renderGlossaryModal();
    renderAll();
    showToast('已從全部文檔提取並新增 ' + totalAdded + ' 筆代號名稱！', 'success');
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
    renderWorkspace();
  });

  document.getElementById('detailRawInput').addEventListener('input', e => {
    const cmd = state.commands[state.ui.selectedId];
    if (!cmd) return;
    cmd.rawOutput = e.target.value;
    cmd.updatedAt = Date.now();
    document.getElementById('rawCharCount').textContent = '(' + cmd.rawOutput.length + ' 字)';
    const added = extractBracketedCodesFromText(cmd.rawOutput);
    if (added > 0) {
      showToast('已自動從貼上的原文識別 ' + added + ' 筆行首 [代號 名稱]！', 'success');
    }
    saveState();
    renderCommandList();
    renderWorkspace();
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
  ['labelSegAInput', 'labelSegBInput', 'labelSegCInput'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      state.segmentLabels = {
        segA: document.getElementById('labelSegAInput').value.trim() || '序號',
        segB: document.getElementById('labelSegBInput').value.trim() || '分類代號',
        segC: document.getElementById('labelSegCInput').value.trim() || '尾數代號'
      };
      saveState();
      applyUiSettings();
      if (state.ui.mainView === 'workspace') renderWorkspace();
    });
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
    const k = document.getElementById('glossaryKeyInput').value.trim().replace(/^#/, '');
    const v = document.getElementById('glossaryValInput').value.trim();
    const rel = document.getElementById('glossaryRelInput').value.trim();
    if (!k) return;
    if (v) state.glossary[k] = v;
    state.glossaryRelations = state.glossaryRelations || {};
    if (rel) state.glossaryRelations[k] = rel;
    document.getElementById('glossaryKeyInput').value = '';
    document.getElementById('glossaryValInput').value = '';
    document.getElementById('glossaryRelInput').value = '';
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
    const rVal = document.getElementById('tokenRelInput').value.trim();
    const lVal = document.getElementById('tokenLocalInput').value.trim();

    if (gVal) state.glossary[tokenKey] = gVal;
    else delete state.glossary[tokenKey];

    state.glossaryRelations = state.glossaryRelations || {};
    if (rVal) state.glossaryRelations[tokenKey] = rVal;
    else delete state.glossaryRelations[tokenKey];

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
        localStorage.setItem(STORAGE_KEY, ev.target.result);
        state = loadState();
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
      localStorage.setItem(STORAGE_KEY, document.getElementById('ioTextarea').value);
      state = loadState();
      saveState();
      renderAll();
      document.getElementById('ioModal').classList.add('hidden');
      showToast('已從文字框還原資料！', 'success');
    } catch (err) {
      showToast('JSON 格式錯誤');
    }
  });

  document.getElementById('exportMdBtn').addEventListener('click', () => {
    const lines = ['# TYPE HELP 調查筆記報告\n', '> 命名規則假說：' + (state.ruleHypothesis || '無') + '\n', '## 代號與規則字典'];
    Object.entries(state.glossary).forEach(([k, v]) => {
      const rel = (state.glossaryRelations && state.glossaryRelations[k]) ? (' (關聯: ' + state.glossaryRelations[k] + ')') : '';
      lines.push('- **' + k + '**: ' + v + rel);
    });
    lines.push('\n## 收件匣消息 (Inbox)');
    (state.inboxMessages || []).forEach(m => {
      lines.push('\n### 📬 ' + m.title + (m.sender ? (' (發自: ' + m.sender + ')') : ''));
      if (m.notes) lines.push(m.notes);
    });
    lines.push('\n## 調查文檔清單');
    Object.values(state.commands).forEach(c => {
      const stLabel = STATUS_META[c.status] ? STATUS_META[c.status].label : '';
      lines.push('\n### ' + c.id + ' (' + stLabel + ')');
      if (c.source) lines.push('- 發現來源: `' + formatSourceLabel(c.source) + '`');
      const mentions = getStructuredMentionsForCmd(c);
      if (mentions.length > 0) {
        lines.push('- 對話提及: ' + mentions.map(m => (m.speaker ? ('#' + m.speaker + '提到') : '') + m.targetText).join('、'));
      }
      if (c.notes) lines.push('- 推理筆記:\n' + c.notes);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'type-help-report.md';
    a.click();
  });

  document.getElementById('resetDemoBtn').addEventListener('click', () => {
    if (!confirm('確定要清空所有文檔、收件匣與字典，重置為「完全空白初始狀態」嗎？（建議先匯出 JSON 備份！）')) return;
    state = getInitialState();
    saveState();
    renderAll();
    showToast('已重置為無劇透空白狀態', 'success');
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      ['glossaryModal', 'sysCmdModal', 'tokenModal', 'assignTermModal', 'focusModal', 'ioModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });
    }
  });
});