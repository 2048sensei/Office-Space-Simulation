/*!
 * geometry.js — 平面布局的纯几何计算
 * ------------------------------------------------------------------
 * 坐标系：原点在房间左上角，x 向右、y 向下，单位统一为厘米（cm）。
 * 每件家具用 { x, y, w, d, rot } 描述：
 *   - w / d 是“逻辑尺寸”（未旋转时沿 x / y 方向的长度）
 *   - rot 为 0 / 90 / 180 / 270；旋转 90° 或 270° 时屏幕上的宽高互换
 * 本文件不依赖 DOM，可同时用于浏览器与 Node 单元测试。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlanGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPS = 0.8;            // 判定重叠时的容差（cm）
  const MIN_SIZE = 10;        // 家具最小边长（cm）
  const DEFAULT_SNAP = 5;     // 默认吸附步长（cm）
  const DEFAULT_MAGNET = 10;  // 默认对齐磁吸阈值（cm）

  /** 不参与碰撞的构件：门窗贴在墙上，允许家具从旁边经过 */
  const PORTAL_TYPES = ['door', 'window'];

  // ---------------------------------------------------------------- 基础

  function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function r2(v) { return Math.round(v * 100) / 100; }

  function isPortal(it) {
    return !!it && PORTAL_TYPES.indexOf(it.type) !== -1;
  }

  function isOddRotation(rot) {
    const r = ((Math.round(num(rot, 0)) % 360) + 360) % 360;
    return r === 90 || r === 270;
  }

  function normalizeRotation(rot) {
    const r = Math.round(num(rot, 0)) % 360;
    return ((r % 360) + 360) % 360;
  }

  function rect(x, y, w, d) {
    return { x, y, w, d, x2: x + w, y2: y + d };
  }

  /** 家具在屏幕坐标中的包围盒（旋转 90°/270° 时宽高互换） */
  function boxOf(it) {
    const odd = isOddRotation(it.rot);
    const w = odd ? it.d : it.w;
    const d = odd ? it.w : it.d;
    return rect(it.x, it.y, w, d);
  }

  /** 由屏幕包围盒反推逻辑尺寸 */
  function sizeFromBox(box, rot) {
    return isOddRotation(rot) ? { w: box.d, d: box.w } : { w: box.w, d: box.d };
  }

  /** 由逻辑尺寸推屏幕包围盒尺寸 */
  function boxSize(w, d, rot) {
    return isOddRotation(rot) ? { w: d, d: w } : { w: w, d: d };
  }

  function snapTo(value, step) {
    const v = num(value, 0);
    if (!step || step <= 0) return v;
    return Math.round(v / step) * step;
  }

  // ---------------------------------------------------------------- 碰撞

  /** 两个包围盒是否重叠（仅“贴边”不算重叠） */
  function overlapsBox(a, b, eps) {
    const e = eps == null ? EPS : eps;
    return a.x < b.x + b.w - e && a.x + a.w > b.x + e &&
           a.y < b.y + b.d - e && a.y + a.d > b.y + e;
  }

  function withinRoom(box, room, eps) {
    const e = eps == null ? EPS : eps;
    return box.x >= -e && box.y >= -e &&
           box.x + box.w <= room.w + e && box.y + box.d <= room.d + e;
  }

  /**
   * 目标包围盒是否与房间边界/其它家具冲突。
   * @param {Array} items 现有家具
   * @param {object} box  待检测包围盒
   * @param {object} room { w, d }
   * @param {number} [ignoreId] 忽略的家具 id（通常是正在拖动的那件）
   */
  function collides(items, box, room, ignoreId) {
    if (!withinRoom(box, room)) return true;
    for (let i = 0; i < items.length; i++) {
      const o = items[i];
      if (o.id === ignoreId) continue;
      if (isPortal(o)) continue;
      if (overlapsBox(box, boxOf(o))) return true;
    }
    return false;
  }

  /** 把位置收进房间内（只移动，不缩放） */
  function clampBox(box, room) {
    const maxX = Math.max(0, room.w - box.w);
    const maxY = Math.max(0, room.d - box.d);
    return {
      x: Math.min(Math.max(0, box.x), maxX),
      y: Math.min(Math.max(0, box.y), maxY)
    };
  }

  // ---------------------------------------------------------------- 吸附

  /** 收集某一轴上“可对齐的特征坐标”：墙边、房间中线、其它家具的两侧 */
  function axisFeatures(axis, items, room, ignoreId) {
    const limit = axis === 'x' ? room.w : room.d;
    const list = [0, limit, limit / 2];
    for (let i = 0; i < items.length; i++) {
      const o = items[i];
      if (o.id === ignoreId || isPortal(o)) continue;
      const b = boxOf(o);
      if (axis === 'x') list.push(b.x, b.x2);
      else list.push(b.y, b.y2);
    }
    return list;
  }

  /**
   * 对齐磁吸：把家具的左/中/右（上/中/下）边缘吸附到墙面或其它家具边缘。
   * @returns {{x:number, y:number, guides:Array<{axis:string, at:number}>}}
   */
  function magnetize(box, items, room, opts) {
    const options = opts || {};
    const threshold = options.threshold == null ? DEFAULT_MAGNET : options.threshold;
    const ignoreId = options.ignoreId;
    const own = { x: box.x, y: box.y };
    const size = { x: box.w, y: box.d };
    const result = { x: box.x, y: box.y, guides: [] };

    ['x', 'y'].forEach(function (axis) {
      const features = axisFeatures(axis, items, room, ignoreId);
      const offsets = [0, size[axis] / 2, size[axis]];
      let best = null;
      for (let i = 0; i < features.length; i++) {
        const f = features[i];
        for (let j = 0; j < offsets.length; j++) {
          const at = own[axis] + offsets[j];
          const dist = Math.abs(at - f);
          if (dist > threshold) continue;
          if (!best || dist < best.dist - 1e-6) {
            best = { dist: dist, value: f - offsets[j], guide: f };
          }
        }
      }
      if (best) {
        result[axis] = best.value;
        result.guides.push({ axis: axis, at: best.guide });
      }
    });
    return result;
  }

  // ---------------------------------------------------------------- 摆放

  /**
   * 在房间里找一个离中心最近、且不与任何家具重叠的空位。
   * @returns {{x:number, y:number}}
   */
  function findFreeSpot(items, room, w, d, opts) {
    const options = opts || {};
    const step = options.step || 10;
    const maxW = Math.max(0, room.w - w);
    const maxD = Math.max(0, room.d - d);
    const cx = maxW / 2;
    const cy = maxD / 2;
    let best = null;
    let bestDist = Infinity;

    for (let y = 0; y <= maxD + 0.001; y += step) {
      for (let x = 0; x <= maxW + 0.001; x += step) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist >= bestDist) continue;
        const box = rect(x, y, w, d);
        if (!collides(items, box, room, options.ignoreId)) {
          best = { x: r2(x), y: r2(y) };
          bestDist = dist;
        }
      }
    }
    if (best) return best;
    // 房间实在放不下时退化为左上角
    return { x: 0, y: 0 };
  }

  /** 到四面墙的净距 */
  function wallGaps(box, room) {
    return {
      left: r2(box.x),
      top: r2(box.y),
      right: r2(room.w - box.x - box.w),
      bottom: r2(room.d - box.y - box.d)
    };
  }

  /** 把一件家具整体收进房间 */
  function clampItem(it, room) {
    const b = boxOf(it);
    const pos = clampBox(b, room);
    it.x = pos.x;
    it.y = pos.y;
    return it;
  }

  return {
    EPS: EPS,
    MIN_SIZE: MIN_SIZE,
    DEFAULT_SNAP: DEFAULT_SNAP,
    DEFAULT_MAGNET: DEFAULT_MAGNET,
    PORTAL_TYPES: PORTAL_TYPES,
    num: num,
    r2: r2,
    rect: rect,
    isPortal: isPortal,
    isOddRotation: isOddRotation,
    normalizeRotation: normalizeRotation,
    boxOf: boxOf,
    boxSize: boxSize,
    sizeFromBox: sizeFromBox,
    snapTo: snapTo,
    overlapsBox: overlapsBox,
    withinRoom: withinRoom,
    collides: collides,
    clampBox: clampBox,
    magnetize: magnetize,
    findFreeSpot: findFreeSpot,
    wallGaps: wallGaps,
    clampItem: clampItem
  };
});
