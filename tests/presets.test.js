'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../assets/js/geometry.js');
const C = require('../assets/js/catalog.js');
const P = require('../assets/js/presets.js');

function toItems(preset) {
  return preset.items.map((p, index) => {
    const item = C.createItem(p.key, { x: p.x, y: p.y, rot: p.rot || 0 });
    item.id = index + 1;
    return item;
  });
}

test('presets：至少包含 3 套示例', () => {
  assert.ok(P.PRESETS.length >= 3);
  const keys = new Set(P.PRESETS.map((p) => p.key));
  assert.equal(keys.size, P.PRESETS.length, '示例 key 不重复');
});

test('presets：每套家具都在房间内', () => {
  P.PRESETS.forEach((preset) => {
    const items = toItems(preset);
    items.forEach((item) => {
      const box = G.boxOf(item);
      assert.equal(
        G.withinRoom(box, preset.room),
        true,
        `${preset.name} 中的 ${item.name} 超出房间`
      );
    });
  });
});

test('presets：非门窗家具两两不重叠', () => {
  P.PRESETS.forEach((preset) => {
    const items = toItems(preset);
    for (let i = 0; i < items.length; i++) {
      if (G.isPortal(items[i])) continue;
      for (let j = i + 1; j < items.length; j++) {
        if (G.isPortal(items[j])) continue;
        assert.equal(
          G.overlapsBox(G.boxOf(items[i]), G.boxOf(items[j])),
          false,
          `${preset.name}：${items[i].name}(${items[i].x},${items[i].y}) 与 ${items[j].name}(${items[j].x},${items[j].y}) 重叠`
        );
      }
    }
  });
});

test('presets：每套都包含办公桌与座椅', () => {
  P.PRESETS.forEach((preset) => {
    const items = toItems(preset);
    assert.ok(items.some((it) => it.type === 'desk'), preset.name + ' 缺少办公桌');
    assert.ok(items.some((it) => it.type === 'chair'), preset.name + ' 缺少座椅');
  });
});

test('catalog：所有分组引用的模板都存在', () => {
  C.GROUPS.forEach((group) => {
    group.keys.forEach((key) => {
      assert.ok(C.template(key), `分组 ${group.label} 引用了不存在的模板 ${key}`);
    });
  });
});

test('catalog：模板尺寸合法且颜色为 6 位十六进制', () => {
  Object.keys(C.TEMPLATES).forEach((key) => {
    const t = C.TEMPLATES[key];
    assert.ok(t.w >= 10 && t.w <= 500, key + ' 宽度非法');
    assert.ok(t.d >= 10 && t.d <= 500, key + ' 深度非法');
    assert.match(t.color, /^#[0-9a-fA-F]{6}$/, key + ' 颜色非法');
  });
});

test('catalog：createItem 生成完整实例', () => {
  const item = C.createItem('desk_140x70', { id: 7, x: 12, y: 34, rot: 90 });
  assert.equal(item.id, 7);
  assert.equal(item.type, 'desk');
  assert.equal(item.kind, 'desk');
  assert.equal(item.name, '职员桌 140×70');
  assert.equal(item.w, 140);
  assert.equal(item.d, 70);
  assert.equal(item.rot, 90);
  assert.equal(item.locked, true);
  assert.match(item.color, /^#[0-9a-fA-F]{6}$/);
});

test('catalog：未知模板回落到自定义家具', () => {
  const item = C.createItem('not-exist', {});
  assert.equal(item.key, 'custom');
  assert.equal(item.type, 'custom');
});
