'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../assets/js/store.js');

test('normalizeLayout：兼容旧版 {roomW, roomD, items}', () => {
  const layout = S.normalizeLayout({
    roomW: 900,
    roomD: 600,
    items: [
      { type: 'desk', name: '办公桌', w: 140, d: 70, x: 20, y: 30, rot: 90 },
      { type: 'chair', name: '办公椅', w: 50, d: 50, x: 0, y: 0, rot: 45 }
    ]
  });
  assert.equal(layout.version, S.SCHEMA_VERSION);
  assert.equal(layout.roomW, 900);
  assert.equal(layout.roomD, 600);
  assert.equal(layout.items.length, 2);
  assert.equal(layout.items[0].rot, 90);
  assert.equal(layout.items[1].rot, 0, '非法旋转会回落到 0');
});

test('normalizeLayout：尺寸与房间值会被钳制', () => {
  const layout = S.normalizeLayout({
    roomW: 10,
    roomD: 5000,
    items: [{ type: 'custom', w: 1, d: 9999, x: '12', y: null }]
  });
  assert.equal(layout.roomW, 100);
  assert.equal(layout.roomD, 2000);
  assert.equal(layout.items[0].w, 10);
  assert.equal(layout.items[0].d, 500);
  assert.equal(layout.items[0].x, 12);
  assert.equal(layout.items[0].y, 0);
});

test('normalizeLayout：缺字段时给出安全默认值', () => {
  const layout = S.normalizeLayout(null);
  assert.equal(layout.roomW, 800);
  assert.equal(layout.roomD, 720);
  assert.deepEqual(layout.items, []);
});

test('emptyLayout：生成空布局', () => {
  const layout = S.emptyLayout(1200, 900);
  assert.equal(layout.roomW, 1200);
  assert.equal(layout.roomD, 900);
  assert.deepEqual(layout.items, []);
});

test('createHistory：提交、撤销、重做', () => {
  const a = { version: 2, roomW: 800, roomD: 720, items: [] };
  const b = { version: 2, roomW: 800, roomD: 720, items: [{ id: 1, x: 10 }] };
  const history = S.createHistory(a);
  assert.equal(history.canUndo, false);

  assert.equal(history.commit(b), true);
  assert.equal(history.canUndo, true);
  assert.equal(history.current.items.length, 1);

  const back = history.undo();
  assert.equal(back.items.length, 0);
  assert.equal(history.canRedo, true);

  const forward = history.redo();
  assert.equal(forward.items.length, 1);
});

test('createHistory：相同快照不产生历史', () => {
  const a = { version: 2, roomW: 800, roomD: 720, items: [] };
  const history = S.createHistory(a);
  assert.equal(history.commit(S.clone(a)), false);
  assert.equal(history.canUndo, false);
});

test('createHistory：撤销栈有上限', () => {
  const history = S.createHistory({ n: 0 });
  for (let i = 1; i <= S.HISTORY_LIMIT + 20; i++) history.commit({ n: i });
  let count = 0;
  while (history.undo()) count++;
  assert.equal(count, S.HISTORY_LIMIT);
});

test('createHistory：reset 清空两边历史', () => {
  const history = S.createHistory({ n: 0 });
  history.commit({ n: 1 });
  history.undo();
  history.reset({ n: 9 });
  assert.equal(history.current.n, 9);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
});

test('createStorage：保存 / 读取 / 清除（内存后端）', () => {
  const memory = new Map();
  const backend = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k)
  };
  const storage = S.createStorage('demo-key', backend);
  assert.equal(storage.load(), null);
  storage.save({ roomW: 800 });
  assert.deepEqual(storage.load(), { roomW: 800 });
  storage.clear();
  assert.equal(storage.load(), null);
});

test('createStorage：后端异常时静默降级', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  };
  const storage = S.createStorage('k', broken);
  assert.equal(storage.save({ a: 1 }), false);
  assert.equal(storage.load(), null);
  storage.clear();
});

test('toText：生成可读清单', () => {
  const text = S.toText({
    roomW: 800,
    roomD: 720,
    items: [
      { name: '办公桌 140×70', w: 140, d: 70, x: 0, y: 0, rot: 0 },
      { name: '办公桌 140×70', w: 140, d: 70, x: 160, y: 0, rot: 0 }
    ]
  });
  assert.match(text, /房间 800 × 720 cm/);
  assert.match(text, /办公桌 140×70 × 2/);
  assert.match(text, /57\.60 m²/);
});
