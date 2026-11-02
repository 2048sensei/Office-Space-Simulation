/*!
 * app.js — 主控制器
 * ------------------------------------------------------------------
 * 负责：状态、DOM 渲染、指针/键盘交互、工具栏、导入导出、持久化。
 * 依赖（按 index.html 中的加载顺序）：
 *   PlanGeometry → PlanCatalog → PlanPresets → PlanStore → PlanRenderer
 */
(function () {
  'use strict';

  const G = window.PlanGeometry;
  const C = window.PlanCatalog;
  const P = window.PlanPresets;
  const S = window.PlanStore;
  const R = window.PlanRenderer;

  const STORAGE_KEY = 'office-layout-v2';
  const PREFS_KEY = 'office-layout-prefs-v2';
  const THEME_KEY = 'office-layout-theme';

  const MIN_SIZE = G.MIN_SIZE;

  // ------------------------------------------------------------ 元素引用
  const $ = function (id) { return document.getElementById(id); };
  const els = {
    stageScroll: $('stageScroll'), stage: $('stage'), gridLayer: $('gridLayer'),
    furnLayer: $('furnLayer'), guides: $('guides'), dims: $('dims'),
    roomDimW: $('roomDimW'), roomDimD: $('roomDimD'), emptyHint: $('emptyHint'),
    roomW: $('roomW'), roomD: $('roomD'), applyRoom: $('applyRoom'), presetSelect: $('presetSelect'),
    fType: $('fType'), fW: $('fW'), fD: $('fD'), addFurn: $('addFurn'),
    btnUndo: $('btnUndo'), btnRedo: $('btnRedo'), btnTheme: $('btnTheme'), btnHelp: $('btnHelp'),
    btnMeasure: $('btnMeasure'), btnCopy: $('btnCopy'), btnRotate: $('btnRotate'),
    btnDel: $('btnDel'), btnClear: $('btnClear'),
    showGrid: $('showGrid'), snapStep: $('snapStep'), showDims: $('showDims'),
    zoomOut: $('zoomOut'), zoomReset: $('zoomReset'), zoomIn: $('zoomIn'), zoomLabel: $('zoomLabel'),
    exportPng: $('exportPng'), exportJson: $('exportJson'), importJson: $('importJson'),
    importFile: $('importFile'), copyText: $('copyText'), printBtn: $('printBtn'),
    coordReadout: $('coordReadout'), selectionInfo: $('selectionInfo'),
    measureInfo: $('measureInfo'), saveState: $('saveState'),
    propEmpty: $('propEmpty'), propForm: $('propForm'), propDot: $('propDot'),
    propName: $('propName'), propX: $('propX'), propY: $('propY'), propW: $('propW'),
    propD: $('propD'), propDeskRow: $('propDeskRow'), propDesk: $('propDesk'),
    propRot: $('propRot'), propColor: $('propColor'), propGaps: $('propGaps'),
    propApply: $('propApply'), propRotate: $('propRotate'), propCopy: $('propCopy'),
    propColorAll: $('propColorAll'),
    itemCount: $('itemCount'), itemList: $('itemList'), stats: $('stats'), btnTidy: $('btnTidy'),
    helpDialog: $('helpDialog'), toast: $('toast')
  };

  // ------------------------------------------------------------ 状态
  const state = {
    layout: { version: 2, roomW: 800, roomD: 720, items: [] },
    selectedId: null,
    nextId: 1,
    view: { scale: 1, zoom: 1, showGrid: true, snapStep: 5, showDims: true },
    drag: null,
    measure: { active: false, points: [], result: null },
    pointer: null,
    closedGroups: new Set(),
    toastTimer: 0,
    saveTimer: 0,
    resizeTimer: 0
  };

  const history = S.createHistory(S.emptyLayout());
  const storage = S.createStorage(STORAGE_KEY);
  const itemEls = new Map();

  // ------------------------------------------------------------ 小工具
  function room() { return { w: state.layout.roomW, d: state.layout.roomD }; }
  function items() { return state.layout.items; }
  function getItem(id) {
    const list = items();
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function clampNum(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }
  function clampSize(v) { return clampNum(v, MIN_SIZE, 500, 50); }
  function clampRoom(v, fallback) { return clampNum(v, 100, 2000, fallback); }
  function round1(v) { return Math.round(v * 10) / 10; }
  function fmt(v) { return String(round1(v)); }
  function nowLabel() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function normalizeHex(color) {
    return /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#5a6a7a';
  }

  function toast(message, type) {
    const t = els.toast;
    t.textContent = message;
    t.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { t.className = 'toast'; }, 2600);
  }

  // ------------------------------------------------------------ 主题 / 偏好
  function initialTheme() {
    const q = new URLSearchParams(location.search).get('theme');
    if (q === 'light' || q === 'dark') return q;
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (_) { /* 忽略 */ }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    els.btnTheme.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    els.btnTheme.title = theme === 'light' ? '切换到深色主题' : '切换到浅色主题';
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* 忽略 */ }
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (typeof p.showGrid === 'boolean') state.view.showGrid = p.showGrid;
      if ([1, 5, 10].indexOf(Number(p.snapStep)) !== -1) state.view.snapStep = Number(p.snapStep);
      if (typeof p.showDims === 'boolean') state.view.showDims = p.showDims;
    } catch (_) { /* 忽略 */ }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        showGrid: state.view.showGrid,
        snapStep: state.view.snapStep,
        showDims: state.view.showDims
      }));
    } catch (_) { /* 忽略 */ }
  }

  // ------------------------------------------------------------ 持久化
  function scheduleSave() {
    els.saveState.textContent = '保存中…';
    els.saveState.classList.add('saving');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveNow, 320);
  }

  function saveNow() {
    const ok = storage.save(state.layout);
    els.saveState.classList.remove('saving');
    els.saveState.textContent = ok ? '已保存 ' + nowLabel() : '本地保存不可用';
    els.saveState.classList.toggle('saving', !ok);
  }

  function commit(force) {
    if (history.commit(state.layout, force)) {
      updateHistoryUI();
      scheduleSave();
    }
  }

  function applySnapshot(snap) {
    state.layout = S.clone(snap);
    if (!getItem(state.selectedId)) state.selectedId = null;
    els.roomW.value = state.layout.roomW;
    els.roomD.value = state.layout.roomD;
    layoutStage();
    render();
    scheduleSave();
  }

  function undo() {
    const snap = history.undo();
    if (!snap) { toast('没有可撤销的操作', 'warn'); return; }
    applySnapshot(snap);
    updateHistoryUI();
    toast('已撤销');
  }

  function redo() {
    const snap = history.redo();
    if (!snap) { toast('没有可重做的操作', 'warn'); return; }
    applySnapshot(snap);
    updateHistoryUI();
    toast('已重做');
  }

  function updateHistoryUI() {
    els.btnUndo.disabled = !history.canUndo;
    els.btnRedo.disabled = !history.canRedo;
  }

  // ------------------------------------------------------------ 布局装载
  function adoptLayout(layout) {
    state.layout = layout;
    state.selectedId = null;
    state.nextId = 1;
    layout.items.forEach(function (it) {
      it.id = state.nextId++;
      G.clampItem(it, room());
    });
  }

  function buildPresetLayout(key) {
    if (key === 'empty') return S.emptyLayout(960, 720);
    const preset = P.get(key);
    if (!preset) return S.emptyLayout(960, 720);
    const layout = { version: 2, roomW: preset.room.w, roomD: preset.room.d, items: [] };
    preset.items.forEach(function (p) {
      const it = C.createItem(p.key, { x: p.x, y: p.y, rot: p.rot || 0 });
      layout.items.push(it);
    });
    return layout;
  }

  function applyPreset(key, opts) {
    const o = opts || {};
    if (!o.silent && items().length && !confirm('载入示例会替换当前布局，继续吗？')) {
      els.presetSelect.value = '';
      return;
    }
    adoptLayout(buildPresetLayout(key));
    els.roomW.value = state.layout.roomW;
    els.roomD.value = state.layout.roomD;
    if (o.silent) {
      history.reset(state.layout);
    } else {
      commit(true);
      toast('已载入示例布局');
    }
    layoutStage();
    render();
    updateHistoryUI();
    if (!o.silent) scheduleSave();
    els.presetSelect.value = '';
  }

  function loadInitial() {
    const saved = storage.load();
    if (saved) {
      try {
        const norm = S.normalizeLayout(saved);
        adoptLayout(norm);
        els.roomW.value = norm.roomW;
        els.roomD.value = norm.roomD;
        history.reset(state.layout);
        return;
      } catch (_) { /* 损坏的数据回退到示例 */ }
    }
    applyPreset('open-office', { silent: true });
  }

  // ------------------------------------------------------------ 舞台与网格
  function layoutStage() {
    const r = room();
    const availW = Math.max(260, els.stageScroll.clientWidth - 92);
    const availH = Math.max(240, els.stageScroll.clientHeight - 88);
    const fit = Math.min(availW / r.w, availH / r.d);
    const base = Math.max(0.08, Math.min(fit, 1.55));
    const scale = base * state.view.zoom;
    state.view.scale = scale;

    els.stage.style.width = (r.w * scale) + 'px';
    els.stage.style.height = (r.d * scale) + 'px';
    [els.guides, els.dims].forEach(function (svg) {
      svg.setAttribute('width', String(r.w * scale));
      svg.setAttribute('height', String(r.d * scale));
      svg.style.width = (r.w * scale) + 'px';
      svg.style.height = (r.d * scale) + 'px';
    });
    els.roomDimW.textContent = r.w + ' cm';
    els.roomDimD.textContent = r.d + ' cm';
    els.zoomLabel.textContent = Math.round(state.view.zoom * 100) + '%';
    updateGrid();
  }

  function updateGrid() {
    const s = state.view.scale;
    const show = state.view.showGrid && s > 0;
    if (!show || 50 * s < 9) {
      els.gridLayer.style.backgroundImage = 'none';
      return;
    }
    const minor = 50 * s;
    const major = 100 * s;
    els.gridLayer.style.backgroundImage =
      'linear-gradient(to right, var(--grid-minor) 1px, transparent 1px),' +
      'linear-gradient(to bottom, var(--grid-minor) 1px, transparent 1px),' +
      'linear-gradient(to right, var(--grid-major) 1px, transparent 1px),' +
      'linear-gradient(to bottom, var(--grid-major) 1px, transparent 1px)';
    els.gridLayer.style.backgroundSize =
      minor + 'px ' + minor + 'px,' + minor + 'px ' + minor + 'px,' +
      major + 'px ' + major + 'px,' + major + 'px ' + major + 'px';
  }

  // ------------------------------------------------------------ 渲染
  function render() {
    renderItems();
    renderOverlays();
    renderList();
    renderStats();
    syncProps();
    updateStatus();
    updateHistoryUI();
    els.emptyHint.hidden = items().length > 0;
    els.itemCount.textContent = String(items().length);
    els.roomW.value = state.layout.roomW;
    els.roomD.value = state.layout.roomD;
  }

  function renderCanvas() {
    renderItems();
    renderOverlays();
    syncProps();
    updateStatus();
  }

  function buildItemEl(it) {
    const el = document.createElement('div');
    el.className = 'furn kind-' + (it.kind || it.type);
    if (G.isPortal(it)) el.classList.add('portal');
    el.dataset.id = String(it.id);
    el.dataset.kind = it.kind || it.type;

    const label = document.createElement('span');
    label.className = 'furn-label';
    el.appendChild(label);

    ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(function (k) {
      const h = document.createElement('span');
      h.className = 'hdl hdl-' + k;
      h.dataset.handle = k;
      el.appendChild(h);
    });

    const rot = document.createElement('span');
    rot.className = 'rot-handle';
    rot.dataset.rotHandle = '1';
    el.appendChild(rot);

    return el;
  }

  function updateItemEl(el, it) {
    const s = state.view.scale;
    const b = G.boxOf(it);
    el.style.left = (b.x * s) + 'px';
    el.style.top = (b.y * s) + 'px';
    el.style.width = (b.w * s) + 'px';
    el.style.height = (b.d * s) + 'px';
    el.style.backgroundColor = C.colorOf(it);
    el.dataset.rot = String(it.rot);
    el.classList.toggle('selected', it.id === state.selectedId);

    const label = el.firstChild;
    const hideLabel = it.kind === 'chair' || it.kind === 'plant' ||
      it.kind === 'column' || it.kind === 'window';
    const show = !hideLabel && b.w * s >= 44 && b.d * s >= 17;
    label.style.display = show ? '' : 'none';
    if (show) label.textContent = it.name;
  }

  function renderItems() {
    const seen = new Set();
    items().forEach(function (it) {
      seen.add(it.id);
      let el = itemEls.get(it.id);
      if (!el || el.dataset.kind !== (it.kind || it.type)) {
        if (el) el.remove();
        el = buildItemEl(it);
        itemEls.set(it.id, el);
        els.furnLayer.appendChild(el);
      }
      updateItemEl(el, it);
    });
    itemEls.forEach(function (el, id) {
      if (!seen.has(id)) {
        el.remove();
        itemEls.delete(id);
      }
    });
  }

  // ------------------------------------------------------------ 标注
  function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function drawDim(svg, x1, y1, x2, y2, text, color, opts) {
    const o = opts || {};
    const g = svgEl('g');
    g.appendChild(svgEl('line', {
      x1: x1, y1: y1, x2: x2, y2: y2,
      stroke: color, 'stroke-width': 1.1, 'stroke-linecap': 'round', opacity: o.opacity == null ? 1 : o.opacity
    }));

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    [[x1, y1], [x2, y2]].forEach(function (p) {
      g.appendChild(svgEl('line', {
        x1: p[0] - nx * 4, y1: p[1] - ny * 4,
        x2: p[0] + nx * 4, y2: p[1] + ny * 4,
        stroke: color, 'stroke-width': 1.1, 'stroke-linecap': 'round', opacity: o.opacity == null ? 1 : o.opacity
      }));
    });

    // 文字放在线段外侧，避免压住家具与其它标注
    const vertical = Math.abs(dy) > Math.abs(dx);
    let cx = (x1 + x2) / 2;
    let cy = (y1 + y2) / 2;
    if (vertical) cx += o.side === 'right' ? 15 : -15;
    else cy += o.side === 'below' ? 15 : -15;

    const w = Math.max(34, text.length * 6.4 + 10);
    const bg = svgEl('rect', {
      x: cx - w / 2, y: cy - 8.5, width: w, height: 17, rx: 3,
      fill: 'rgba(17,20,26,.86)', stroke: color, 'stroke-width': 1,
      opacity: o.opacity == null ? 1 : o.opacity
    });
    const t = svgEl('text', {
      x: cx, y: cy + 3.6, 'text-anchor': 'middle',
      'font-size': '10.5', 'font-family': 'system-ui,-apple-system,"Microsoft YaHei",sans-serif',
      fill: color, opacity: o.opacity == null ? 1 : o.opacity
    });
    t.textContent = text;
    g.appendChild(bg);
    g.appendChild(t);
    svg.appendChild(g);
  }

  function drawSizeBadge(svg, cx, cy, text, color) {
    const w = Math.max(52, text.length * 6.6 + 16);
    const g = svgEl('g');
    const bg = svgEl('rect', {
      x: cx - w / 2, y: cy - 9, width: w, height: 18, rx: 4,
      fill: 'rgba(17,20,26,.9)', stroke: color, 'stroke-width': 1
    });
    const t = svgEl('text', {
      x: cx, y: cy + 3.8, 'text-anchor': 'middle',
      'font-size': '10.5', 'font-weight': '600',
      'font-family': 'system-ui,-apple-system,"Microsoft YaHei",sans-serif',
      fill: color
    });
    t.textContent = text;
    g.appendChild(bg);
    g.appendChild(t);
    svg.appendChild(g);
  }

  function renderOverlays() {
    els.guides.innerHTML = '';
    els.dims.innerHTML = '';
    const s = state.view.scale;

    // 拖动时的对齐参考线
    if (state.drag && state.drag.guides && state.drag.guides.length) {
      state.drag.guides.forEach(function (g) {
        const at = g.at * s;
        const line = g.axis === 'x'
          ? { x1: at, y1: 0, x2: at, y2: state.layout.roomD * s }
          : { x1: 0, y1: at, x2: state.layout.roomW * s, y2: at };
        els.guides.appendChild(svgEl('line', Object.assign({
          stroke: '#2f9e6e', 'stroke-width': 1, 'stroke-dasharray': '5 4', opacity: .9
        }, line)));
      });
    }

    const it = getItem(state.selectedId);
    if (it) {
      const b = G.boxOf(it);
      if (state.view.showDims) {
        // 自己的宽深用一个徽标，避免两条标注互相压字
        drawSizeBadge(els.dims, (b.x + b.w / 2) * s, b.y * s - 16, fmt(it.w) + ' × ' + fmt(it.d) + ' cm', '#3d84ff');

        const gaps = G.wallGaps(b, room());
        const midX = (b.x + b.w / 2) * s;
        const midY = (b.y + b.d / 2) * s;
        // 只画近墙净距，远的距离在右侧属性栏里看，避免标注穿墙压字
        const near = 160;
        const minGap = 35;
        if (gaps.left >= minGap && gaps.left <= near) {
          drawDim(els.dims, 0, midY, b.x * s, midY, fmt(gaps.left) + ' cm', '#2f9e6e', { opacity: .9 });
        }
        if (gaps.right >= minGap && gaps.right <= near) {
          drawDim(els.dims, b.x2 * s, midY, state.layout.roomW * s, midY, fmt(gaps.right) + ' cm', '#2f9e6e', { opacity: .9 });
        }
        if (gaps.top >= minGap && gaps.top <= near) {
          drawDim(els.dims, midX, 0, midX, b.y * s, fmt(gaps.top) + ' cm', '#2f9e6e', { side: 'left', opacity: .9 });
        }
        if (gaps.bottom >= minGap && gaps.bottom <= near) {
          drawDim(els.dims, midX, b.y2 * s, midX, state.layout.roomD * s, fmt(gaps.bottom) + ' cm', '#2f9e6e', { side: 'left', opacity: .9 });
        }
      }
    }

    // 测距
    if (state.measure.result) {
      const m = state.measure.result;
      drawDim(els.dims, m.x1 * s, m.y1 * s, m.x2 * s, m.y2 * s, fmt(m.dist) + ' cm', '#e0574f');
    } else if (state.measure.active && state.measure.points.length === 1 && state.pointer) {
      const p = state.measure.points[0];
      const q = state.pointer;
      els.guides.appendChild(svgEl('line', {
        x1: p.x * s, y1: p.y * s, x2: q.x * s, y2: q.y * s,
        stroke: '#e0574f', 'stroke-width': 1.2, 'stroke-dasharray': '5 4'
      }));
      els.guides.appendChild(svgEl('circle', {
        cx: p.x * s, cy: p.y * s, r: 3.5, fill: '#e0574f'
      }));
    }
  }

  // ------------------------------------------------------------ 侧栏
  function groupKey(it) {
    return [it.type, it.name, it.w + 'x' + it.d].join('|');
  }

  function renderList() {
    const groups = new Map();
    items().forEach(function (it) {
      const k = groupKey(it);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    });

    els.itemList.innerHTML = '';
    if (!groups.size) {
      const empty = document.createElement('p');
      empty.className = 'card-empty';
      empty.textContent = '还没有家具';
      els.itemList.appendChild(empty);
      return;
    }

    groups.forEach(function (list, key) {
      const head = list[0];
      const isClosed = state.closedGroups.has(key);
      const group = document.createElement('div');
      group.className = 'item-group' + (isClosed ? '' : ' open');

      const headEl = document.createElement('div');
      headEl.className = 'item-group-head';
      headEl.innerHTML =
        '<span class="caret">▶</span>' +
        '<span class="dot" style="background:' + normalizeHex(C.colorOf(head)) + '"></span>' +
        '<span class="name"></span>' +
        '<span class="cnt">' + list.length + '</span>';
      headEl.querySelector('.name').textContent = head.name;

      const body = document.createElement('div');
      body.className = 'item-group-body';
      list.forEach(function (it, index) {
        const row = document.createElement('div');
        row.className = 'item-row' + (it.id === state.selectedId ? ' selected' : '');
        row.innerHTML =
          '<span class="idx">#' + (index + 1) + '</span>' +
          '<span class="pos"></span>' +
          '<span class="dim">' + it.w + '×' + it.d + '</span>';
        row.querySelector('.pos').textContent =
          '(' + fmt(it.x) + ', ' + fmt(it.y) + ')' + (it.rot ? ' · ' + it.rot + '°' : '');
        row.addEventListener('click', function () { selectItem(it.id); });
        body.appendChild(row);
      });

      headEl.addEventListener('click', function () {
        if (state.closedGroups.has(key)) state.closedGroups.delete(key);
        else state.closedGroups.add(key);
        renderList();
      });

      group.appendChild(headEl);
      group.appendChild(body);
      els.itemList.appendChild(group);
    });
  }

  function renderStats() {
    const r = room();
    const area = (r.w * r.d) / 10000;
    let used = 0;
    let desks = 0;
    items().forEach(function (it) {
      if (G.isPortal(it)) return;
      const b = G.boxOf(it);
      used += b.w * b.d;
      if (it.type === 'desk') desks++;
    });
    const usedM2 = used / 10000;
    const util = area > 0 ? (usedM2 / area) * 100 : 0;
    const perSeat = desks ? area / desks : 0;

    els.stats.innerHTML =
      '<div class="stat"><span>房间面积</span><b>' + area.toFixed(2) + ' <small>m²</small></b></div>' +
      '<div class="stat"><span>家具占地</span><b>' + usedM2.toFixed(2) + ' <small>m²</small></b></div>' +
      '<div class="stat"><span>空间利用率</span><b>' + util.toFixed(1) + '<small>%</small></b></div>' +
      '<div class="bar"><i style="width:' + Math.min(100, util).toFixed(1) + '%"></i></div>' +
      '<div class="stat"><span>工位 / 家具</span><b>' + desks + ' / ' + items().length + '</b></div>' +
      (desks ? '<div class="stat"><span>人均面积</span><b>' + perSeat.toFixed(2) + ' <small>m² / 人</small></b></div>' : '');

    els.btnTidy.hidden = countOverlaps() === 0;
  }

  function syncProps() {
    const it = getItem(state.selectedId);
    els.propEmpty.hidden = !!it;
    els.propForm.hidden = !it;
    if (!it) return;

    const active = document.activeElement;
    if (active !== els.propName) els.propName.value = it.name;
    if (active !== els.propX) els.propX.value = fmt(it.x);
    if (active !== els.propY) els.propY.value = fmt(it.y);
    if (active !== els.propW) els.propW.value = it.w;
    if (active !== els.propD) els.propD.value = it.d;
    if (active !== els.propRot) els.propRot.value = String(it.rot);

    els.propDot.style.background = C.colorOf(it);
    if (active !== els.propColor) els.propColor.value = normalizeHex(C.colorOf(it));
    els.propW.disabled = !!it.locked;
    els.propD.disabled = !!it.locked;
    els.propDeskRow.hidden = !it.locked;
    if (it.locked) {
      const key = it.w + 'x' + it.d;
      const match = C.DESK_SIZES.some(function (s) { return s.w + 'x' + s.d === key; });
      els.propDesk.value = match ? key : 'custom';
    }

    const b = G.boxOf(it);
    const gaps = G.wallGaps(b, room());
    els.propGaps.innerHTML =
      '距墙 <b>左 ' + fmt(gaps.left) + '</b> · <b>上 ' + fmt(gaps.top) + '</b> · ' +
      '<b>右 ' + fmt(gaps.right) + '</b> · <b>下 ' + fmt(gaps.bottom) + '</b> cm';
  }

  function updateStatus() {
    if (state.pointer) {
      els.coordReadout.textContent = 'x ' + Math.round(state.pointer.x) + ' · y ' + Math.round(state.pointer.y) + ' cm';
    }
    const it = getItem(state.selectedId);
    if (it) {
      els.selectionInfo.textContent =
        it.name + ' · ' + it.w + '×' + it.d + ' cm · 旋转 ' + it.rot + '° · (' + fmt(it.x) + ', ' + fmt(it.y) + ')';
    } else {
      els.selectionInfo.textContent = '未选中家具';
    }
    const m = state.measure;
    els.measureInfo.hidden = !(m.active || m.result);
    if (m.result) els.measureInfo.textContent = '测距 ' + fmt(m.result.dist) + ' cm';
    else if (m.active) els.measureInfo.textContent = m.points.length ? '测距：点击终点' : '测距：点击起点';
  }

  // ------------------------------------------------------------ 选中与命令
  function selectItem(id) {
    state.selectedId = id;
    renderCanvas();
    renderList();
    els.itemCount.textContent = String(items().length);
  }

  function setZoom(zoom) {
    state.view.zoom = Math.min(2.5, Math.max(0.5, zoom));
    layoutStage();
    renderCanvas();
  }

  function addItemFromToolbar() {
    const key = els.fType.value;
    const t = C.template(key) || C.template('custom');
    let w = t.w;
    let d = t.d;
    if (!t.locked) {
      w = clampSize(+els.fW.value || w);
      d = clampSize(+els.fD.value || d);
    }
    const box = G.boxSize(w, d, 0);
    const spot = G.findFreeSpot(items(), room(), box.w, box.d);
    const it = C.createItem(key, { id: state.nextId++, x: spot.x, y: spot.y });
    it.w = w;
    it.d = d;
    items().push(it);
    state.selectedId = it.id;
    commit(true);
    render();
    toast('已添加：' + it.name);
  }

  function duplicateItem(source, opts) {
    const o = opts || {};
    const b = G.boxOf(source);
    const spot = o.x == null ? G.findFreeSpot(items(), room(), b.w, b.d) : { x: o.x, y: o.y };
    const clone = S.clone(source);
    clone.id = state.nextId++;
    clone.x = spot.x;
    clone.y = spot.y;
    items().push(clone);
    return clone;
  }

  function copySelected() {
    const it = getItem(state.selectedId);
    if (!it) { toast('请先选中一件家具', 'warn'); return; }
    const clone = duplicateItem(it);
    state.selectedId = clone.id;
    commit(true);
    render();
    toast('已复制：' + clone.name);
  }

  function deleteSelected() {
    if (!state.selectedId) return;
    const it = getItem(state.selectedId);
    state.layout.items = items().filter(function (o) { return o.id !== state.selectedId; });
    state.selectedId = null;
    commit(true);
    render();
    toast('已删除' + (it ? '：' + it.name : ''));
  }

  function clearAll() {
    if (!items().length) { toast('已经是空布局', 'warn'); return; }
    if (!confirm('确定清空全部家具吗？此操作可以撤销。')) return;
    state.layout.items = [];
    state.selectedId = null;
    commit(true);
    render();
    toast('已清空');
  }

  function setRotation(it, deg) {
    const b = G.boxOf(it);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.d / 2;
    const old = { x: it.x, y: it.y, w: it.w, d: it.d, rot: it.rot };
    it.rot = G.normalizeRotation(deg);
    const nb = G.boxSize(it.w, it.d, it.rot);
    it.x = cx - nb.w / 2;
    it.y = cy - nb.d / 2;
    G.clampItem(it, room());
    if (G.collides(items(), G.boxOf(it), room(), it.id)) {
      Object.assign(it, old);
      toast('旋转后会与其它家具重叠', 'warn');
      return false;
    }
    commit(true);
    render();
    return true;
  }

  function rotateSelected() {
    const it = getItem(state.selectedId);
    if (!it) { toast('请先选中一件家具', 'warn'); return; }
    setRotation(it, (it.rot + 90) % 360);
  }

  function nudgeSelected(dx, dy) {
    const it = getItem(state.selectedId);
    if (!it) return;
    const cand = S.clone(it);
    cand.x += dx;
    cand.y += dy;
    G.clampItem(cand, room());
    if (G.collides(items(), G.boxOf(cand), room(), it.id)) return;
    it.x = cand.x;
    it.y = cand.y;
    commit();
    renderCanvas();
    renderList();
  }

  function applyRoom() {
    const w = clampRoom(+els.roomW.value, 800);
    const d = clampRoom(+els.roomD.value, 720);
    state.layout.roomW = w;
    state.layout.roomD = d;
    items().forEach(function (it) {
      G.clampItem(it, room());
      if (G.collides(items(), G.boxOf(it), room(), it.id)) {
        const b = G.boxOf(it);
        const spot = G.findFreeSpot(items(), room(), b.w, b.d, { ignoreId: it.id });
        it.x = spot.x;
        it.y = spot.y;
      }
    });
    els.roomW.value = w;
    els.roomD.value = d;
    commit(true);
    layoutStage();
    render();
    toast('房间已调整为 ' + w + ' × ' + d + ' cm');
  }

  // ------------------------------------------------------------ 属性面板
  function applyProps() {
    const it = getItem(state.selectedId);
    if (!it) return;
    const name = (els.propName.value || '').trim().slice(0, 20) || it.name;
    let w = clampSize(+els.propW.value || it.w);
    let d = clampSize(+els.propD.value || it.d);
    if (it.locked) {
      const parts = String(els.propDesk.value).split('x');
      if (parts.length === 2) {
        w = clampSize(parts[0]);
        d = clampSize(parts[1]);
      }
    }
    const cand = {
      id: it.id, w: w, d: d, rot: it.rot,
      x: G.snapTo(+els.propX.value || 0, 1),
      y: G.snapTo(+els.propY.value || 0, 1)
    };
    G.clampItem(cand, room());
    let box = G.boxOf(cand);
    if (G.collides(items(), box, room(), it.id)) {
      const spot = G.findFreeSpot(items(), room(), box.w, box.d, { ignoreId: it.id });
      cand.x = spot.x;
      cand.y = spot.y;
      box = G.boxOf(cand);
      if (G.collides(items(), box, room(), it.id)) {
        toast('空间不足，无法应用该尺寸', 'error');
        return;
      }
    }
    it.name = name;
    it.w = w;
    it.d = d;
    it.x = cand.x;
    it.y = cand.y;
    commit(true);
    render();
    toast('已更新');
  }

  function applySameColor() {
    const it = getItem(state.selectedId);
    if (!it) return;
    const color = els.propColor.value;
    let n = 0;
    items().forEach(function (o) {
      if (o.type === it.type && o.name === it.name && o.w === it.w && o.d === it.d) {
        o.color = color;
        n++;
      }
    });
    commit(true);
    render();
    toast('已修改 ' + n + ' 件同款的颜色');
  }

  // ------------------------------------------------------------ 测距
  function toggleMeasure() {
    state.measure.active = !state.measure.active;
    state.measure.points = [];
    state.measure.result = null;
    els.btnMeasure.classList.toggle('active', state.measure.active);
    els.btnMeasure.textContent = state.measure.active ? '结束测距' : '测距';
    updateStatus();
    renderOverlays();
    if (state.measure.active) toast('点击画布上的两个点开始测距');
  }

  function measureClick(cm) {
    const m = state.measure;
    if (!m.points.length) {
      m.points = [{ x: cm.x, y: cm.y }];
      m.result = null;
    } else {
      const a = m.points[0];
      m.result = {
        x1: a.x, y1: a.y, x2: cm.x, y2: cm.y,
        dist: Math.hypot(cm.x - a.x, cm.y - a.y)
      };
      m.points = [];
    }
    updateStatus();
    renderOverlays();
  }

  // ------------------------------------------------------------ 指针交互
  function toCm(e) {
    const rect = els.stage.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / state.view.scale,
      y: (e.clientY - rect.top) / state.view.scale
    };
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.empty-hint')) return;
    const cm = toCm(e);
    state.pointer = cm;

    if (state.measure.active) {
      measureClick(cm);
      e.preventDefault();
      return;
    }

    const handleEl = e.target.closest('[data-handle]');
    const rotEl = e.target.closest('[data-rot-handle]');
    const furnEl = e.target.closest('.furn');

    if (furnEl) {
      const id = Number(furnEl.dataset.id);
      const it = getItem(id);
      if (!it) return;
      state.selectedId = id;

      if (handleEl) {
        state.drag = {
          mode: 'resize', id: id, handle: handleEl.dataset.handle,
          box0: G.boxOf(it), ax: cm.x, ay: cm.y, guides: []
        };
        renderCanvas();
        renderList();
        els.stage.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      if (rotEl) {
        setRotation(it, (it.rot + 90) % 360);
        e.preventDefault();
        return;
      }

      let target = it;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        target = duplicateItem(it);
        state.selectedId = target.id;
      }
      state.drag = {
        mode: 'move', id: target.id,
        grabX: cm.x - target.x, grabY: cm.y - target.y,
        last: { x: target.x, y: target.y }, guides: []
      };
      renderCanvas();
      renderList();
      els.stage.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    state.selectedId = null;
    renderCanvas();
    renderList();
  }

  function onPointerMove(e) {
    const cm = toCm(e);
    state.pointer = cm;
    els.coordReadout.textContent = 'x ' + Math.round(cm.x) + ' · y ' + Math.round(cm.y) + ' cm';

    if (!state.drag) {
      if (state.measure.active && state.measure.points.length === 1) renderOverlays();
      return;
    }

    const it = getItem(state.drag.id);
    if (!it) return;

    if (state.drag.mode === 'move') updateMove(it, cm);
    else updateResize(it, cm);
    renderCanvas();
  }

  function updateMove(it, cm) {
    const drag = state.drag;
    const step = state.view.snapStep;
    let x = cm.x - drag.grabX;
    let y = cm.y - drag.grabY;
    if (step) {
      x = G.snapTo(x, step);
      y = G.snapTo(y, step);
    }
    const b = G.boxSize(it.w, it.d, it.rot);
    let box = G.rect(x, y, b.w, b.d);
    let pos = G.clampBox(box, room());
    box.x = pos.x;
    box.y = pos.y;
    box.x2 = box.x + box.w;
    box.y2 = box.y + box.d;

    let guides = [];
    const magnet = G.magnetize(box, items(), room(), { ignoreId: it.id, threshold: 10 });
    box.x = magnet.x;
    box.y = magnet.y;
    box.x2 = box.x + box.w;
    box.y2 = box.y + box.d;
    pos = G.clampBox(box, room());
    box.x = pos.x;
    box.y = pos.y;
    box.x2 = box.x + box.w;
    box.y2 = box.y + box.d;
    guides = magnet.guides.filter(function (g) {
      if (g.axis === 'x') {
        return Math.abs(box.x - g.at) < 0.01 ||
          Math.abs(box.x + box.w - g.at) < 0.01 ||
          Math.abs(box.x + box.w / 2 - g.at) < 0.01;
      }
      return Math.abs(box.y - g.at) < 0.01 ||
        Math.abs(box.y + box.d - g.at) < 0.01 ||
        Math.abs(box.y + box.d / 2 - g.at) < 0.01;
    });

    let nx = box.x;
    let ny = box.y;
    if (G.collides(items(), box, room(), it.id)) {
      const prev = drag.last;
      const tryX = G.rect(box.x, prev.y, box.w, box.d);
      const tryY = G.rect(prev.x, box.y, box.w, box.d);
      if (!G.collides(items(), tryX, room(), it.id)) {
        nx = box.x;
        ny = prev.y;
      } else if (!G.collides(items(), tryY, room(), it.id)) {
        nx = prev.x;
        ny = box.y;
      } else {
        nx = prev.x;
        ny = prev.y;
      }
      guides = [];
    }
    it.x = nx;
    it.y = ny;
    drag.last = { x: nx, y: ny };
    drag.guides = guides;
  }

  function updateResize(it, cm) {
    const drag = state.drag;
    const h = drag.handle;
    const b0 = drag.box0;
    const step = state.view.snapStep || 1;
    const dx = cm.x - drag.ax;
    const dy = cm.y - drag.ay;
    let x = b0.x;
    let y = b0.y;
    let w = b0.w;
    let d = b0.d;

    if (h.indexOf('e') >= 0) w = b0.w + dx;
    if (h.indexOf('w') >= 0) w = b0.w - dx;
    if (h.indexOf('s') >= 0) d = b0.d + dy;
    if (h.indexOf('n') >= 0) d = b0.d - dy;
    w = Math.max(MIN_SIZE, G.snapTo(w, step));
    d = Math.max(MIN_SIZE, G.snapTo(d, step));
    if (h.indexOf('w') >= 0) x = b0.x + b0.w - w;
    if (h.indexOf('n') >= 0) y = b0.y + b0.d - d;

    // 锁定尺寸的桌子：吸附到标准规格
    if (it.locked) {
      const logical = G.sizeFromBox({ w: w, d: d }, it.rot);
      let best = C.DESK_SIZES[0];
      let bestScore = Infinity;
      C.DESK_SIZES.forEach(function (s) {
        const score = Math.abs(s.w - logical.w) + Math.abs(s.d - logical.d);
        if (score < bestScore) { bestScore = score; best = s; }
      });
      const bs = G.boxSize(best.w, best.d, it.rot);
      w = bs.w;
      d = bs.d;
      if (h.indexOf('w') >= 0) x = b0.x + b0.w - w;
      if (h.indexOf('n') >= 0) y = b0.y + b0.d - d;
      it.name = best.name;
    }

    // 收进房间
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { d += y; y = 0; }
    if (x + w > state.layout.roomW) w = state.layout.roomW - x;
    if (y + d > state.layout.roomD) d = state.layout.roomD - y;
    w = Math.max(MIN_SIZE, w);
    d = Math.max(MIN_SIZE, d);
    if (w <= MIN_SIZE || d <= MIN_SIZE) return;

    const box = G.rect(x, y, w, d);
    if (G.collides(items(), box, room(), it.id)) return;

    const logical = G.sizeFromBox(box, it.rot);
    it.x = x;
    it.y = y;
    it.w = logical.w;
    it.d = logical.d;
  }

  function onPointerUp(e) {
    if (!state.drag) return;
    state.drag = null;
    if (els.stage.hasPointerCapture && els.stage.hasPointerCapture(e.pointerId)) {
      els.stage.releasePointerCapture(e.pointerId);
    }
    commit();
    render();
  }

  // ------------------------------------------------------------ 文件
  function exportLayout() {
    return {
      app: 'office-layout-studio',
      version: 2,
      exportedAt: new Date().toISOString(),
      roomW: state.layout.roomW,
      roomD: state.layout.roomD,
      items: items().map(function (it) {
        return {
          key: it.key, type: it.type, kind: it.kind, name: it.name,
          w: it.w, d: it.d, x: it.x, y: it.y, rot: it.rot,
          color: it.color || null, locked: !!it.locked
        };
      })
    };
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function stamp() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(exportLayout(), null, 2)], { type: 'application/json' });
    download(blob, 'office-layout-' + stamp() + '.json');
    saveNow();
    toast('已导出 JSON');
  }

  function buildExportCanvas() {
    const scale = Math.max(1.2, Math.min(3, 2000 / state.layout.roomW));
    const plan = R.renderToCanvas(state.layout, {
      scale: scale,
      padding: 52,
      showGrid: state.view.showGrid,
      showLabels: true
    });
    const headerH = 58;
    const footerH = 46;
    const out = document.createElement('canvas');
    out.width = plan.width;
    out.height = plan.height + headerH + footerH;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);

    ctx.fillStyle = '#1f2937';
    ctx.font = '600 22px system-ui,-apple-system,"Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('办公室平面布局', 52, headerH / 2 + 3);

    const date = new Date().toLocaleDateString('zh-CN');
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px system-ui,-apple-system,"Microsoft YaHei",sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(date + ' · ' + state.layout.roomW + ' × ' + state.layout.roomD + ' cm', out.width - 52, headerH / 2 + 3);

    ctx.drawImage(plan, 0, headerH);

    const r = room();
    let used = 0;
    let desks = 0;
    items().forEach(function (it) {
      if (G.isPortal(it)) return;
      const b = G.boxOf(it);
      used += b.w * b.d;
      if (it.type === 'desk') desks++;
    });
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px system-ui,-apple-system,"Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      '面积 ' + ((r.w * r.d) / 10000).toFixed(2) + ' m² · 工位 ' + desks +
      ' · 家具 ' + items().length + ' 件 · 占地 ' + ((used / (r.w * r.d)) * 100).toFixed(1) + '%',
      52, headerH + plan.height + footerH / 2
    );
    ctx.textAlign = 'right';
    ctx.fillText('办公室布局 · Office Layout Studio', out.width - 52, headerH + plan.height + footerH / 2);
    return out;
  }

  function exportPNG() {
    try {
      const canvas = buildExportCanvas();
      canvas.toBlob(function (blob) {
        if (!blob) { toast('图片导出失败', 'error'); return; }
        download(blob, 'office-layout-' + stamp() + '.png');
        toast('已导出图片');
      }, 'image/png');
    } catch (err) {
      toast('图片导出失败：' + err.message, 'error');
    }
  }

  function printPlan() {
    try {
      const canvas = buildExportCanvas();
      const url = canvas.toDataURL('image/png');
      const win = window.open('', '_blank');
      if (!win) { toast('打印窗口被拦截，请允许弹窗', 'error'); return; }
      win.document.write(
        '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>打印布局</title>' +
        '<style>html,body{margin:0;padding:0;background:#fff}' +
        'img{display:block;width:100%;height:auto}' +
        '@page{size:A4 landscape;margin:8mm}@media print{img{width:100%}}</style></head>' +
        '<body><img alt="办公室平面布局" src="' + url + '" onload="window.focus();window.print();">' +
        '</body></html>'
      );
      win.document.close();
    } catch (err) {
      toast('打印失败：' + err.message, 'error');
    }
  }

  function copyText() {
    const text = S.toText(state.layout);
    const done = function () { toast('清单已复制到剪贴板'); };
    const fallback = function () {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove();
      if (ok) done();
      else prompt('复制下面的清单：', text);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function importText(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      toast('导入失败：不是有效的 JSON 文件', 'error');
      return;
    }
    if (!data || !Array.isArray(data.items)) {
      toast('导入失败：缺少 items 字段', 'error');
      return;
    }
    adoptLayout(S.normalizeLayout(data));
    els.roomW.value = state.layout.roomW;
    els.roomD.value = state.layout.roomD;
    commit(true);
    layoutStage();
    render();
    saveNow();
    const overlaps = countOverlaps();
    toast(overlaps
      ? '已导入 ' + items().length + ' 件家具，发现 ' + overlaps + ' 处重叠'
      : '已导入 ' + items().length + ' 件家具', overlaps ? 'warn' : undefined);
  }

  function readImportFile(file) {
    if (!file) return;
    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
      toast('请选择 .json 文件', 'warn');
      return;
    }
    const reader = new FileReader();
    reader.onload = function () { importText(String(reader.result || '')); };
    reader.onerror = function () { toast('读取文件失败', 'error'); };
    reader.readAsText(file, 'utf-8');
  }

  // ------------------------------------------------------------ 重叠处理
  function countOverlaps() {
    let count = 0;
    const list = items();
    for (let i = 0; i < list.length; i++) {
      if (G.isPortal(list[i])) continue;
      for (let j = i + 1; j < list.length; j++) {
        if (G.isPortal(list[j])) continue;
        if (G.overlapsBox(G.boxOf(list[i]), G.boxOf(list[j]))) count++;
      }
    }
    return count;
  }

  function tidyOverlaps() {
    const list = items();
    const moved = [];
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (G.isPortal(it)) continue;
      const others = list.filter(function (o) { return o.id !== it.id; });
      if (!G.collides(others, G.boxOf(it), room(), it.id)) continue;
      const b = G.boxOf(it);
      const spot = G.findFreeSpot(others, room(), b.w, b.d, { ignoreId: it.id });
      it.x = spot.x;
      it.y = spot.y;
      moved.push(it);
    }
    commit(true);
    render();
    toast(moved.length ? '已整理 ' + moved.length + ' 件家具的位置' : '没有发现重叠');
  }

  // ------------------------------------------------------------ 绑定
  function buildSelects() {
    const groups = {};
    C.GROUPS.forEach(function (g) { groups[g.label] = []; });
    C.GROUPS.forEach(function (g) {
      g.keys.forEach(function (key) {
        const t = C.template(key);
        if (!t) return;
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = t.name;
        groups[g.label].push(opt);
      });
    });
    Object.keys(groups).forEach(function (label) {
      const og = document.createElement('optgroup');
      og.label = label;
      groups[label].forEach(function (o) { og.appendChild(o); });
      els.fType.appendChild(og);
    });

    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '选择示例…';
    els.presetSelect.appendChild(emptyOpt);
    P.PRESETS.forEach(function (p) {
      const opt = document.createElement('option');
      opt.value = p.key;
      opt.textContent = p.name;
      els.presetSelect.appendChild(opt);
    });
    const emptyLayoutOpt = document.createElement('option');
    emptyLayoutOpt.value = 'empty';
    emptyLayoutOpt.textContent = '空白房间 960×720';
    els.presetSelect.appendChild(emptyLayoutOpt);

    C.DESK_SIZES.forEach(function (s) {
      const opt = document.createElement('option');
      opt.value = s.w + 'x' + s.d;
      opt.textContent = s.w + ' × ' + s.d + ' cm';
      els.propDesk.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = '当前尺寸';
    els.propDesk.appendChild(customOpt);
  }

  function syncToolbar() {
    els.showGrid.checked = state.view.showGrid;
    els.snapStep.value = String(state.view.snapStep);
    els.showDims.checked = state.view.showDims;
  }

  function syncTypeFields() {
    const t = C.template(els.fType.value) || C.template('custom');
    if (!t) return;
    els.fW.value = t.w;
    els.fD.value = t.d;
    els.fW.disabled = !!t.locked;
    els.fD.disabled = !!t.locked;
  }

  function bindEvents() {
    // 顶栏
    els.btnUndo.addEventListener('click', undo);
    els.btnRedo.addEventListener('click', redo);
    els.btnTheme.addEventListener('click', function () {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      applyTheme(next);
    });
    els.btnHelp.addEventListener('click', function () {
      if (typeof els.helpDialog.showModal === 'function') els.helpDialog.showModal();
      else els.helpDialog.setAttribute('open', '');
    });
    els.helpDialog.addEventListener('click', function (e) {
      if (e.target === els.helpDialog) els.helpDialog.close();
    });

    // 房间 / 示例
    els.applyRoom.addEventListener('click', applyRoom);
    els.roomW.addEventListener('keydown', function (e) { if (e.key === 'Enter') applyRoom(); });
    els.roomD.addEventListener('keydown', function (e) { if (e.key === 'Enter') applyRoom(); });
    els.presetSelect.addEventListener('change', function () {
      const key = els.presetSelect.value;
      if (key) applyPreset(key);
    });

    // 添加
    els.fType.addEventListener('change', syncTypeFields);
    els.addFurn.addEventListener('click', addItemFromToolbar);

    // 编辑
    els.btnCopy.addEventListener('click', copySelected);
    els.btnRotate.addEventListener('click', rotateSelected);
    els.btnDel.addEventListener('click', deleteSelected);
    els.btnClear.addEventListener('click', clearAll);
    els.btnMeasure.addEventListener('click', toggleMeasure);

    // 视图
    els.showGrid.addEventListener('change', function () {
      state.view.showGrid = els.showGrid.checked;
      updateGrid();
      savePrefs();
    });
    els.snapStep.addEventListener('change', function () {
      state.view.snapStep = Number(els.snapStep.value) || 5;
      savePrefs();
    });
    els.showDims.addEventListener('change', function () {
      state.view.showDims = els.showDims.checked;
      renderOverlays();
      savePrefs();
    });
    els.zoomIn.addEventListener('click', function () { setZoom(state.view.zoom * 1.15); });
    els.zoomOut.addEventListener('click', function () { setZoom(state.view.zoom / 1.15); });
    els.zoomReset.addEventListener('click', function () { setZoom(1); });

    // 文件
    els.exportJson.addEventListener('click', exportJSON);
    els.exportPng.addEventListener('click', exportPNG);
    els.printBtn.addEventListener('click', printPlan);
    els.copyText.addEventListener('click', copyText);
    els.importJson.addEventListener('click', function () { els.importFile.click(); });
    els.importFile.addEventListener('change', function (e) {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      readImportFile(file);
    });

    // 属性面板
    els.propApply.addEventListener('click', applyProps);
    els.propRotate.addEventListener('click', function () {
      const it = getItem(state.selectedId);
      if (it) setRotation(it, (it.rot + 90) % 360);
    });
    els.propCopy.addEventListener('click', copySelected);
    els.propColorAll.addEventListener('click', applySameColor);
    els.propColor.addEventListener('input', function () {
      const it = getItem(state.selectedId);
      if (!it) return;
      it.color = els.propColor.value;
      renderItems();
      els.propDot.style.background = it.color;
    });
    els.propColor.addEventListener('change', function () { commit(true); });
    els.propRot.addEventListener('change', function () {
      const it = getItem(state.selectedId);
      if (it) setRotation(it, Number(els.propRot.value) || 0);
    });
    els.propDesk.addEventListener('change', function () {
      const it = getItem(state.selectedId);
      if (!it) return;
      const parts = String(els.propDesk.value).split('x');
      if (parts.length !== 2) return;
      els.propW.value = parts[0];
      els.propD.value = parts[1];
      applyProps();
    });
    [els.propName, els.propX, els.propY, els.propW, els.propD].forEach(function (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); applyProps(); }
      });
    });

    els.btnTidy.addEventListener('click', tidyOverlaps);

    // 画布
    els.stage.addEventListener('pointerdown', onPointerDown);
    els.stage.addEventListener('pointermove', onPointerMove);
    els.stage.addEventListener('pointerup', onPointerUp);
    els.stage.addEventListener('pointercancel', onPointerUp);
    els.stage.addEventListener('pointerleave', function () {
      if (!state.drag) {
        state.pointer = null;
        els.coordReadout.textContent = 'x — · y —';
        updateStatus();
      }
    });

    // 拖放导入
    document.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1) {
        e.preventDefault();
      }
    });
    document.addEventListener('drop', function (e) {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      e.preventDefault();
      readImportFile(files[0]);
    });

    // 键盘
    document.addEventListener('keydown', onKeyDown);

    // 窗口尺寸
    window.addEventListener('resize', function () {
      clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(function () { layoutStage(); renderCanvas(); }, 120);
    });

    window.addEventListener('beforeunload', function () {
      storage.save(state.layout);
    });
  }

  function onKeyDown(e) {
    const tag = (e.target && e.target.tagName) || '';
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(tag) || (e.target && e.target.isContentEditable);
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape') {
      if (state.measure.active) { toggleMeasure(); return; }
      if (state.selectedId) { selectItem(null); return; }
      if (state.drag) { state.drag = null; render(); return; }
      return;
    }
    if (typing) return;

    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); copySelected(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); exportJSON(); return; }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelected();
      return;
    }
    if (e.key.toLowerCase() === 'r') { rotateSelected(); return; }
    if (e.key.toLowerCase() === 'm') { toggleMeasure(); return; }
    if (e.key === 'G' || e.key === 'g') {
      els.showGrid.checked = !els.showGrid.checked;
      els.showGrid.dispatchEvent(new Event('change'));
      return;
    }
    if (e.key === '+' || e.key === '=') { setZoom(state.view.zoom * 1.15); return; }
    if (e.key === '-' || e.key === '_') { setZoom(state.view.zoom / 1.15); return; }
    if (e.key === '0') { setZoom(1); return; }

    const step = e.shiftKey ? 1 : Math.max(1, state.view.snapStep);
    if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeSelected(-step, 0); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSelected(step, 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); nudgeSelected(0, -step); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); nudgeSelected(0, step); }
  }

  // ------------------------------------------------------------ 启动
  function init() {
    applyTheme(initialTheme());
    loadPrefs();
    syncToolbar();
    buildSelects();
    syncTypeFields();
    bindEvents();
    loadInitial();
    layoutStage();
    render();
    updateHistoryUI();
    saveNow();
    document.documentElement.dataset.ready = '1';
  }

  // 暴露给测试/控制台使用（只读为主）
  window.officeApp = {
    get layout() { return state.layout; },
    get selectedId() { return state.selectedId; },
    select: selectItem,
    add: addItemFromToolbar,
    undo: undo,
    redo: redo,
    exportData: exportLayout,
    importData: importText,
    buildExportCanvas: buildExportCanvas,
    state: state
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
