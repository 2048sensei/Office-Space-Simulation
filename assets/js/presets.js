/*!
 * presets.js — 内置示例布局
 * ------------------------------------------------------------------
 * 每个示例只保存“房间 + 家具模板 + 坐标 + 旋转”，
 * 加载时会通过 PlanCatalog.createItem 补全名称与颜色。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlanPresets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** @type {Array<{key:string,name:string,desc:string,room:{w:number,d:number},items:Array}>} */
  const PRESETS = [
    {
      key: 'open-office',
      name: '开放办公区 · 9 工位',
      desc: '两排工位 + 独立会议区，适合 8~10 人的团队',
      room: { w: 960, d: 720 },
      items: [
        // 上排 5 个工位（靠上墙，桌间留 40cm 走道）
        { key: 'desk_140x70', x: 20, y: 20 },
        { key: 'desk_140x70', x: 200, y: 20 },
        { key: 'desk_140x70', x: 380, y: 20 },
        { key: 'desk_140x70', x: 560, y: 20 },
        { key: 'desk_140x70', x: 740, y: 20 },
        { key: 'chair', x: 65, y: 100 },
        { key: 'chair', x: 245, y: 100 },
        { key: 'chair', x: 425, y: 100 },
        { key: 'chair', x: 605, y: 100 },
        { key: 'chair', x: 785, y: 100 },
        // 右上角收纳与设备
        { key: 'cabinet', x: 880, y: 20 },
        { key: 'shelf', x: 860, y: 100 },
        { key: 'printer', x: 770, y: 150 },
        // 下排 4 个工位（面朝上）
        { key: 'desk_140x70', x: 20, y: 430, rot: 180 },
        { key: 'desk_140x70', x: 200, y: 430, rot: 180 },
        { key: 'desk_140x70', x: 380, y: 430, rot: 180 },
        { key: 'desk_140x70', x: 560, y: 430, rot: 180 },
        { key: 'chair', x: 65, y: 370 },
        { key: 'chair', x: 245, y: 370 },
        { key: 'chair', x: 425, y: 370 },
        { key: 'chair', x: 605, y: 370 },
        // 会议区
        { key: 'table', x: 700, y: 430 },
        { key: 'chair', x: 730, y: 375 },
        { key: 'chair', x: 810, y: 375 },
        { key: 'chair', x: 890, y: 375 },
        { key: 'chair', x: 730, y: 558 },
        { key: 'chair', x: 810, y: 558 },
        { key: 'chair', x: 890, y: 558 },
        // 角落与绿植
        { key: 'plant', x: 900, y: 640 },
        { key: 'plant', x: 20, y: 600 },
        // 建筑构件
        { key: 'door', x: 380, y: 705 },
        { key: 'window', x: 120, y: 0 },
        { key: 'window', x: 420, y: 0 },
        { key: 'window', x: 720, y: 0 },
        { key: 'window', x: 945, y: 200, rot: 90 },
        { key: 'window', x: 945, y: 430, rot: 90 }
      ]
    },
    {
      key: 'small-team',
      name: '六人小组 · 独立会议角',
      desc: '6 个工位 + 圆桌讨论区，适合 6 人左右的创业团队',
      room: { w: 800, d: 600 },
      items: [
        { key: 'desk_140x70', x: 40, y: 40 },
        { key: 'desk_140x70', x: 220, y: 40 },
        { key: 'desk_140x70', x: 400, y: 40 },
        { key: 'chair', x: 85, y: 120 },
        { key: 'chair', x: 265, y: 120 },
        { key: 'chair', x: 445, y: 120 },

        { key: 'desk_140x70', x: 40, y: 400, rot: 180 },
        { key: 'desk_140x70', x: 220, y: 400, rot: 180 },
        { key: 'desk_140x70', x: 400, y: 400, rot: 180 },
        { key: 'chair', x: 85, y: 340 },
        { key: 'chair', x: 265, y: 340 },
        { key: 'chair', x: 445, y: 340 },

        { key: 'table_round', x: 620, y: 60 },
        { key: 'chair', x: 665, y: 0 },
        { key: 'chair', x: 665, y: 190 },
        { key: 'chair', x: 560, y: 95 },
        { key: 'chair', x: 750, y: 95 },

        { key: 'cabinet', x: 60, y: 520 },
        { key: 'shelf', x: 140, y: 530 },
        { key: 'plant', x: 740, y: 540 },

        { key: 'door', x: 340, y: 585 },
        { key: 'window', x: 80, y: 0 },
        { key: 'window', x: 300, y: 0 },
        { key: 'window', x: 560, y: 0 }
      ]
    },
    {
      key: 'manager',
      name: '独立办公室 · 1 人',
      desc: '一张大班台加会客沙发，适合主管或独立办公室',
      room: { w: 420, d: 460 },
      items: [
        { key: 'desk_120x160', x: 40, y: 40 },
        { key: 'chair', x: 75, y: 210 },
        { key: 'sofa', x: 210, y: 60, rot: 90 },
        { key: 'chair_visitor', x: 190, y: 300 },
        { key: 'chair_visitor', x: 262, y: 300 },
        { key: 'cabinet', x: 340, y: 400 },
        { key: 'plant', x: 40, y: 400 },
        { key: 'door', x: 150, y: 445 },
        { key: 'window', x: 100, y: 0 }
      ]
    }
  ];

  function get(key) {
    for (let i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].key === key) return PRESETS[i];
    }
    return null;
  }

  return { PRESETS: PRESETS, get: get };
});
