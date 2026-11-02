/*!
 * store.js — 状态容器：撤销栈、本地持久化、导入导出
 * ------------------------------------------------------------------
 * 设计要点
 *  - 整个布局是不可变快照 { version, roomW, roomD, items[] }
 *  - commit() 推入撤销栈；undo()/redo() 在快照间切换
 *  - 使用结构化克隆，避免后续原地修改污染历史
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlanStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 2;
  const DEFAULT_STORAGE_KEY = 'office-layout-v2';
  const HISTORY_LIMIT = 80;

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function emptyLayout(roomW, roomD) {
    return {
      version: SCHEMA_VERSION,
      roomW: roomW || 800,
      roomD: roomD || 720,
      items: []
    };
  }

  /** 把任意（旧版本）数据规范化成当前 schema */
  function normalizeLayout(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const roomW = clampRoom(src.roomW || src.width || 800);
    const roomD = clampRoom(src.roomD || src.height || 720);
    const list = Array.isArray(src.items) ? src.items : [];
    const items = list.map(function (it, index) {
      return {
        id: 0, // 由调用方重新分配
        key: typeof it.key === 'string' ? it.key : 'custom',
        type: it.type || 'custom',
        kind: it.kind || it.type || 'custom',
        name: it.name || '物体',
        w: clampSize(it.w),
        d: clampSize(it.d),
        x: num(it.x),
        y: num(it.y),
        rot: [0, 90, 180, 270].indexOf(Number(it.rot)) !== -1 ? Number(it.rot) : 0,
        color: it.color || null,
        locked: !!it.locked,
        _index: index
      };
    });
    return { version: SCHEMA_VERSION, roomW, roomD, items };
  }

  function clampRoom(v) {
    const n = num(v, 800);
    return Math.min(2000, Math.max(100, n));
  }

  function clampSize(v) {
    const n = num(v, 50);
    return Math.min(500, Math.max(10, n));
  }

  function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  /**
   * 创建历史记录器。
   * @param {object} initial 初始快照
   */
  function createHistory(initial) {
    let past = [];
    let future = [];
    let current = clone(initial);

    return {
      get current() { return current; },
      get canUndo() { return past.length > 0; },
      get canRedo() { return future.length > 0; },

      /** 提交新快照（与当前一致时忽略，避免无效历史） */
      commit(next, force) {
        const snapshot = clone(next);
        if (!force && JSON.stringify(snapshot) === JSON.stringify(current)) {
          return false;
        }
        past.push(current);
        if (past.length > HISTORY_LIMIT) past.shift();
        current = snapshot;
        future = [];
        return true;
      },

      /** 用新快照替换当前但不入栈（例如初始化、导入） */
      reset(next) {
        current = clone(next);
        past = [];
        future = [];
      },

      undo() {
        if (!past.length) return null;
        future.push(current);
        current = past.pop();
        return current;
      },

      redo() {
        if (!future.length) return null;
        past.push(current);
        current = future.pop();
        return current;
      }
    };
  }

  /** 本地存储封装：隐私模式 / 禁用存储时静默降级 */
  function createStorage(key, backend) {
    const store = backend || (typeof localStorage !== 'undefined' ? localStorage : null);
    const storageKey = key || DEFAULT_STORAGE_KEY;

    return {
      key: storageKey,
      save(layout) {
        if (!store) return false;
        try {
          store.setItem(storageKey, JSON.stringify(layout));
          return true;
        } catch (_) {
          return false;
        }
      },
      load() {
        if (!store) return null;
        try {
          const raw = store.getItem(storageKey);
          if (!raw) return null;
          return JSON.parse(raw);
        } catch (_) {
          return null;
        }
      },
      clear() {
        if (!store) return;
        try { store.removeItem(storageKey); } catch (_) { /* 忽略 */ }
      }
    };
  }

  /** 导出为可读 JSON 文本 */
  function toJSON(layout) {
    return JSON.stringify(layout, null, 2);
  }

  /** 生成人可读的家具清单（可粘贴到聊天/文档） */
  function toText(layout) {
    const lines = [];
    lines.push(`房间 ${layout.roomW} × ${layout.roomD} cm（${(layout.roomW * layout.roomD / 10000).toFixed(2)} m²）`);
    const groups = new Map();
    (layout.items || []).forEach(function (it) {
      const k = `${it.name} ${it.w}×${it.d}`;
      if (!groups.has(k)) groups.set(k, { name: it.name, w: it.w, d: it.d, count: 0, items: [] });
      const g = groups.get(k);
      g.count += 1;
      g.items.push(`(${it.x},${it.y})${it.rot ? ' r' + it.rot : ''}`);
    });
    groups.forEach(function (g) {
      lines.push(`- ${g.name} × ${g.count}　${g.w}×${g.d}cm　位置: ${g.items.join(' ')}`);
    });
    return lines.join('\n');
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    DEFAULT_STORAGE_KEY: DEFAULT_STORAGE_KEY,
    HISTORY_LIMIT: HISTORY_LIMIT,
    clone: clone,
    emptyLayout: emptyLayout,
    normalizeLayout: normalizeLayout,
    createHistory: createHistory,
    createStorage: createStorage,
    toJSON: toJSON,
    toText: toText
  };
});
