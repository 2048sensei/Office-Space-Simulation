/*!
 * catalog.js — 家具目录与预设
 * ------------------------------------------------------------------
 * 每一项都是“模板”，添加时克隆成实例（附带 id / 坐标 / 旋转）。
 * locked 为 true 的模板只能按预设尺寸缩放（例如标准办公桌）。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlanCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 颜色主题：按家具类型区分，导出 PNG 时复用 */
  const COLORS = {
    desk: '#3f7cbf',
    deskL: '#5a94cf',
    table: '#2f6a9b',
    chair: '#6f9c76',
    sofa: '#5f8a66',
    shelf: '#a9855a',
    cabinet: '#8f7148',
    door: '#a06363',
    window: '#7f74a3',
    plant: '#4f8a5f',
    printer: '#7b8794',
    custom: '#64748b'
  };

  /**
   * 模板表。
   * group  用于工具条分组
   * kind   决定渲染时的细节样式（desk / chair / door …），缺省用 type
   */
  const TEMPLATES = {
    desk_60x120: { group: '办公', type: 'desk', kind: 'desk', name: '办公桌 60×120', w: 60, d: 120, color: COLORS.desk, locked: true },
    desk_70x140: { group: '办公', type: 'desk', kind: 'desk', name: '办公桌 70×140', w: 70, d: 140, color: COLORS.desk, locked: true },
    desk_120x160: { group: '办公', type: 'desk', kind: 'desk', name: '办公桌 120×160', w: 120, d: 160, color: COLORS.desk, locked: true },
    desk_140x70: { group: '办公', type: 'desk', kind: 'desk', name: '职员桌 140×70', w: 140, d: 70, color: COLORS.deskL, locked: true },

    chair: { group: '办公', type: 'chair', kind: 'chair', name: '办公椅', w: 50, d: 50, color: COLORS.chair },
    chair_visitor: { group: '办公', type: 'chair', kind: 'chair', name: '访客椅', w: 55, d: 55, color: COLORS.chair },

    cabinet: { group: '收纳', type: 'cabinet', kind: 'cabinet', name: '文件柜', w: 60, d: 40, color: COLORS.cabinet },
    shelf: { group: '收纳', type: 'shelf', kind: 'shelf', name: '杂物架', w: 100, d: 35, color: COLORS.shelf },
    locker: { group: '收纳', type: 'locker', kind: 'cabinet', name: '更衣柜', w: 90, d: 45, color: COLORS.cabinet },

    table: { group: '会议', type: 'table', kind: 'table', name: '会议桌', w: 240, d: 120, color: COLORS.table },
    table_round: { group: '会议', type: 'table', kind: 'table', name: '圆桌', w: 120, d: 120, color: COLORS.table },
    sofa: { group: '会议', type: 'sofa', kind: 'sofa', name: '沙发', w: 180, d: 70, color: COLORS.sofa },

    door: { group: '构件', type: 'door', kind: 'door', name: '门', w: 90, d: 15, color: COLORS.door },
    window: { group: '构件', type: 'window', kind: 'window', name: '窗', w: 150, d: 15, color: COLORS.window },
    partition: { group: '构件', type: 'partition', kind: 'partition', name: '隔断', w: 150, d: 10, color: COLORS.custom },
    column: { group: '构件', type: 'column', kind: 'column', name: '柱子', w: 40, d: 40, color: '#6b7280' },

    plant: { group: '其它', type: 'plant', kind: 'plant', name: '绿植', w: 40, d: 40, color: COLORS.plant },
    printer: { group: '其它', type: 'printer', kind: 'printer', name: '打印机', w: 60, d: 50, color: COLORS.printer },
    custom: { group: '其它', type: 'custom', kind: 'custom', name: '自定义', w: 80, d: 60, color: COLORS.custom }
  };

  /** 按类型归类，便于“同款”批量操作 */
  const TYPE_LABEL = {
    desk: '办公桌', chair: '座椅', cabinet: '柜子', shelf: '架子',
    locker: '柜子', table: '桌子', sofa: '沙发', door: '门', window: '窗',
    partition: '隔断', column: '柱子', plant: '绿植', printer: '设备', custom: '自定义'
  };

  /** 工具条下拉框顺序 */
  const GROUPS = [
    { label: '办公', keys: ['desk_60x120', 'desk_70x140', 'desk_120x160', 'desk_140x70', 'chair', 'chair_visitor'] },
    { label: '收纳', keys: ['cabinet', 'shelf', 'locker'] },
    { label: '会议', keys: ['table', 'table_round', 'sofa'] },
    { label: '构件', keys: ['door', 'window', 'partition', 'column'] },
    { label: '其它', keys: ['plant', 'printer', 'custom'] }
  ];

  /** 桌面规格（锁定尺寸时按此匹配） */
  const DESK_SIZES = [
    { w: 60, d: 120, name: '办公桌 60×120' },
    { w: 70, d: 140, name: '办公桌 70×140' },
    { w: 120, d: 160, name: '办公桌 120×160' },
    { w: 140, d: 70, name: '职员桌 140×70' }
  ];

  function template(key) {
    return Object.prototype.hasOwnProperty.call(TEMPLATES, key) ? TEMPLATES[key] : null;
  }

  /** 生成一个家具实例（不含坐标，由调用方摆放） */
  function createItem(key, coords) {
    const t = template(key) || TEMPLATES.custom;
    const c = coords || {};
    return {
      id: c.id == null ? 0 : c.id,
      key: key in TEMPLATES ? key : 'custom',
      type: t.type,
      kind: t.kind || t.type,
      name: t.name,
      w: t.w,
      d: t.d,
      x: c.x || 0,
      y: c.y || 0,
      rot: c.rot || 0,
      color: c.color || t.color || COLORS.custom,
      locked: !!t.locked || !!c.locked
    };
  }

  function colorOf(it) {
    return it.color || COLORS[it.type] || COLORS.custom;
  }

  function typeLabel(it) {
    return TYPE_LABEL[it.type] || '其它';
  }

  return {
    COLORS: COLORS,
    TEMPLATES: TEMPLATES,
    GROUPS: GROUPS,
    DESK_SIZES: DESK_SIZES,
    TYPE_LABEL: TYPE_LABEL,
    template: template,
    createItem: createItem,
    colorOf: colorOf,
    typeLabel: typeLabel
  };
});
