'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../assets/js/geometry.js');

const ROOM = { w: 800, d: 720 };

test('boxOf：旋转 90°/270° 时包围盒宽高互换', () => {
  const base = { x: 10, y: 20, w: 60, d: 120 };
  assert.deepEqual(G.boxOf({ ...base, rot: 0 }), { x: 10, y: 20, w: 60, d: 120, x2: 70, y2: 140 });
  assert.deepEqual(G.boxOf({ ...base, rot: 90 }), { x: 10, y: 20, w: 120, d: 60, x2: 130, y2: 80 });
  assert.deepEqual(G.boxOf({ ...base, rot: 180 }), { x: 10, y: 20, w: 60, d: 120, x2: 70, y2: 140 });
  assert.deepEqual(G.boxOf({ ...base, rot: 270 }), { x: 10, y: 20, w: 120, d: 60, x2: 130, y2: 80 });
});

test('sizeFromBox / boxSize：逻辑尺寸与屏幕尺寸可逆', () => {
  for (const rot of [0, 90, 180, 270]) {
    const screen = G.boxSize(70, 140, rot);
    const logical = G.sizeFromBox(screen, rot);
    assert.equal(logical.w, 70);
    assert.equal(logical.d, 140);
  }
});

test('overlapsBox：只贴边不算重叠，轻微交叠算重叠', () => {
  const a = G.rect(0, 0, 100, 100);
  assert.equal(G.overlapsBox(a, G.rect(100, 0, 100, 100)), false);
  assert.equal(G.overlapsBox(a, G.rect(0, 100, 100, 100)), false);
  assert.equal(G.overlapsBox(a, G.rect(99, 0, 100, 100)), true);
  assert.equal(G.overlapsBox(a, G.rect(0, 0, 100, 100)), true);
});

test('collides：越界、家具重叠、忽略自身', () => {
  const items = [{ id: 2, type: 'desk', x: 100, y: 100, w: 100, d: 50, rot: 0 }];
  assert.equal(G.collides(items, G.rect(0, 0, 50, 50), ROOM, 1), false);
  assert.equal(G.collides(items, G.rect(120, 120, 50, 50), ROOM, 1), true);
  assert.equal(G.collides(items, G.rect(100, 100, 100, 50), ROOM, 2), false);
  assert.equal(G.collides(items, G.rect(-10, 0, 50, 50), ROOM, 1), true);
  assert.equal(G.collides(items, G.rect(790, 700, 50, 50), ROOM, 1), true);
});

test('collides：门窗是构件，不参与家具碰撞', () => {
  const door = { id: 2, type: 'door', x: 0, y: 0, w: 90, d: 15, rot: 0 };
  const windowItem = { id: 3, type: 'window', x: 200, y: 0, w: 150, d: 15, rot: 0 };
  const box = G.rect(20, 0, 50, 50);
  assert.equal(G.collides([door, windowItem], box, ROOM, 1), false);
});

test('wallGaps：到四墙净距', () => {
  const gaps = G.wallGaps(G.rect(20, 30, 100, 50), ROOM);
  assert.deepEqual(gaps, { left: 20, top: 30, right: 680, bottom: 640 });
});

test('magnetize：吸附到邻家具左边缘并产生参考线', () => {
  const items = [{ id: 2, type: 'desk', x: 100, y: 100, w: 100, d: 50, rot: 0 }];
  const box = G.rect(99, 300, 100, 50);
  const m = G.magnetize(box, items, ROOM, { ignoreId: 1, threshold: 5 });
  assert.equal(m.x, 100);
  assert.ok(m.guides.some((g) => g.axis === 'x' && g.at === 100));
});

test('magnetize：超过阈值不吸附', () => {
  const items = [{ id: 2, type: 'desk', x: 100, y: 100, w: 100, d: 50, rot: 0 }];
  const box = G.rect(60, 400, 100, 50);
  const m = G.magnetize(box, items, ROOM, { ignoreId: 1, threshold: 5 });
  assert.equal(m.x, 60);
  assert.equal(m.y, 400);
  assert.equal(m.guides.length, 0);
});

test('findFreeSpot：避开已占用区域并保持在房间内', () => {
  const items = [{ id: 2, type: 'desk', x: 300, y: 300, w: 200, d: 200, rot: 0 }];
  const spot = G.findFreeSpot(items, ROOM, 100, 100);
  const box = G.rect(spot.x, spot.y, 100, 100);
  assert.equal(G.withinRoom(box, ROOM), true);
  assert.equal(G.collides(items, box, ROOM, 0), false);
});

test('findFreeSpot：房间放不下时退化为左上角', () => {
  const spot = G.findFreeSpot([], { w: 50, d: 50 }, 100, 100);
  assert.deepEqual(spot, { x: 0, y: 0 });
});

test('clampBox / clampItem：把家具收回房间', () => {
  const room = { w: 500, d: 400 };
  assert.deepEqual(G.clampBox(G.rect(600, 500, 100, 100), room), { x: 400, y: 300 });
  assert.deepEqual(G.clampBox(G.rect(-20, -20, 100, 100), room), { x: 0, y: 0 });
  const it = { x: 999, y: -5, w: 60, d: 120, rot: 90 };
  G.clampItem(it, room);
  assert.equal(it.x, 380);
  assert.equal(it.y, 0);
});

test('snapTo / normalizeRotation', () => {
  assert.equal(G.snapTo(13, 5), 15);
  assert.equal(G.snapTo(-13, 5), -15);
  assert.equal(G.snapTo(13, 0), 13);
  assert.equal(G.normalizeRotation(-90), 270);
  assert.equal(G.normalizeRotation(450), 90);
});

test('isPortal：门和窗', () => {
  assert.equal(G.isPortal({ type: 'door' }), true);
  assert.equal(G.isPortal({ type: 'window' }), true);
  assert.equal(G.isPortal({ type: 'desk' }), false);
  assert.equal(G.isPortal(null), false);
});
