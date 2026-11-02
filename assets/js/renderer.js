/*!
 * renderer.js — 画布绘制与导出
 * ------------------------------------------------------------------
 * - renderStage()      把布局渲染成 DOM 家具块（交互用）
 * - renderToCanvas()   把布局绘制到 Canvas（PNG 导出 / 打印）
 * 两者共用同一套样式常量，保证“所见即所得”。
 */
(function (root, factory) {
  const G = root.PlanGeometry || (typeof require === 'function' ? require('./geometry.js') : null);
  const C = root.PlanCatalog || (typeof require === 'function' ? require('./catalog.js') : null);
  const api = factory(G, C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlanRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Geometry, Catalog) {
  'use strict';

  const THEME = {
    floor: '#f7f4ee',
    floorAlt: '#f1ece2',
    wall: '#3b4652',
    wallThick: 3,
    gridMinor: 'rgba(120,130,145,.14)',
    gridMajor: 'rgba(120,130,145,.28)',
    text: '#2b333d',
    textMuted: '#7c8794',
    select: '#2f6fed',
    measure: '#e0574f',
    guide: '#2f9e6e'
  };

  const FURNITURE_ALPHA = 0.95;

  function px(v) { return Math.round(v * 100) / 100; }

  // ------------------------------------------------------------ DOM 渲染

  /** 计算画布缩放：把房间装进可视区域 */
  function fitScale(room, viewport, opts) {
    const o = opts || {};
    const padding = o.padding == null ? 56 : o.padding;
    const maxH = o.maxHeight == null ? 560 : o.maxHeight;
    const availW = Math.max(240, (viewport && viewport.width) || 720) - padding;
    const availH = Math.max(240, Math.min(viewport && viewport.height || maxH, maxH)) - padding;
    return Math.max(0.08, Math.min(availW / room.w, availH / room.d, o.maxScale || 1.4));
  }

  // ------------------------------------------------------------ Canvas

  /**
   * 绘制静态平面图到 canvas 2D 上下文。
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} layout { roomW, roomD, items[] }
   * @param {object} opts { scale, padding, showGrid, showLabels, selectedId, background }
   */
  function paintLayout(ctx, layout, opts) {
    const o = opts || {};
    const scale = o.scale || 1;
    const padding = o.padding == null ? 40 : o.padding;
    const roomW = layout.roomW;
    const roomD = layout.roomD;
    const showGrid = o.showGrid !== false;
    const showLabels = o.showLabels !== false;

    // 底板
    ctx.fillStyle = o.background || '#ffffff';
    ctx.fillRect(0, 0, roomW * scale + padding * 2, roomD * scale + padding * 2);

    ctx.save();
    ctx.translate(padding, padding);

    // 地板
    ctx.fillStyle = THEME.floor;
    ctx.fillRect(0, 0, roomW * scale, roomD * scale);

    // 网格（每 50cm 一根细线，每 100cm 一根粗线）
    if (showGrid) {
      ctx.lineWidth = 1;
      for (let x = 50; x < roomW; x += 50) {
        ctx.strokeStyle = x % 100 === 0 ? THEME.gridMajor : THEME.gridMinor;
        ctx.beginPath();
        ctx.moveTo(px(x * scale) + 0.5, 0);
        ctx.lineTo(px(x * scale) + 0.5, px(roomD * scale));
        ctx.stroke();
      }
      for (let y = 50; y < roomD; y += 50) {
        ctx.strokeStyle = y % 100 === 0 ? THEME.gridMajor : THEME.gridMinor;
        ctx.beginPath();
        ctx.moveTo(0, px(y * scale) + 0.5);
        ctx.lineTo(px(roomW * scale), px(y * scale) + 0.5);
        ctx.stroke();
      }
    }

    // 家具
    (layout.items || []).forEach(function (it) {
      drawFurniture(ctx, it, scale, showLabels, o.selectedId);
    });

    // 墙体
    ctx.strokeStyle = THEME.wall;
    ctx.lineWidth = THEME.wallThick;
    ctx.strokeRect(0, 0, roomW * scale, roomD * scale);

    // 尺寸标注
    ctx.fillStyle = THEME.textMuted;
    ctx.font = '12px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(roomW + ' cm', (roomW * scale) / 2, -padding / 2 + 6);
    ctx.save();
    ctx.translate(-padding / 2 + 6, (roomD * scale) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(roomD + ' cm', 0, 0);
    ctx.restore();

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function shade(hex, amount) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return hex || '#888888';
    const parse = function (h) { return parseInt(h, 16); };
    const clamp = function (v) { return Math.max(0, Math.min(255, Math.round(v))); };
    const r = clamp(parse(m[1]) + amount);
    const g = clamp(parse(m[2]) + amount);
    const b = clamp(parse(m[3]) + amount);
    return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }

  /** 在 (x,y,w,h) 内绘制一件家具 */
  function drawFurniture(ctx, it, scale, showLabels, selectedId) {
    const b = Geometry.boxOf(it);
    const x = b.x * scale;
    const y = b.y * scale;
    const w = b.w * scale;
    const h = b.d * scale;
    if (w < 1 || h < 1) return;

    const color = (Catalog && Catalog.colorOf) ? Catalog.colorOf(it) : (it.color || '#888888');
    const kind = it.kind || it.type || 'custom';

    ctx.save();
    ctx.globalAlpha = FURNITURE_ALPHA;

    if (kind === 'door') {
      drawDoor(ctx, x, y, w, h, it, color, scale);
    } else if (kind === 'window') {
      drawWindow(ctx, x, y, w, h, color);
    } else if (kind === 'column') {
      drawColumn(ctx, x, y, w, h, color);
    } else if (kind === 'chair') {
      drawChair(ctx, x, y, w, h, color, it, scale);
    } else if (kind === 'sofa') {
      drawSofa(ctx, x, y, w, h, color, it, scale);
    } else if (kind === 'partition') {
      ctx.fillStyle = shade(color, -10);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = shade(color, -40);
      ctx.lineWidth = 1;
      ctx.strokeRect(px(x) + 0.5, px(y) + 0.5, px(w) - 1, px(h) - 1);
    } else if (kind === 'plant') {
      drawPlant(ctx, x, y, w, h, color);
    } else {
      // 桌 / 柜 / 架 / 设备 / 自定义：统一的块 + 纹理细节
      roundRect(ctx, x, y, w, h, Math.min(3, Math.min(w, h) * 0.08));
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = shade(color, -45);
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (kind === 'desk') drawDeskDetail(ctx, x, y, w, h, it, color);
      else if (kind === 'cabinet') drawCabinetDetail(ctx, x, y, w, h, it, scale);
      else if (kind === 'shelf') drawShelfDetail(ctx, x, y, w, h, it, scale);
      else if (kind === 'table') drawTableDetail(ctx, x, y, w, h, color);
      else if (kind === 'printer') drawPrinterDetail(ctx, x, y, w, h);
    }

    if (it.id != null && it.id === selectedId) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = THEME.select;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }

    // 标签
    if (showLabels && w > 42 && h > 20) {
      const label = it.name || '';
      const fontSize = Math.max(9, Math.min(12, Math.min(w, h) / 3.2));
      ctx.globalAlpha = 1;
      ctx.font = `600 ${fontSize}px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textW = ctx.measureText(label).width;
      const boxW = Math.min(w - 4, textW + 8);
      const boxH = fontSize + 5;
      ctx.fillStyle = 'rgba(15,20,26,.55)';
      roundRect(ctx, x + w / 2 - boxW / 2, y + h / 2 - boxH / 2, boxW, boxH, 3);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + w / 2, y + h / 2 + 0.5, w - 6);
    }

    ctx.restore();
  }

  function drawDeskDetail(ctx, x, y, w, h, it, color) {
    // 屏幕主方向：桌子“正面”朝向由旋转决定，这里画一条桌面边缘线
    const odd = Geometry.isOddRotation(it.rot);
    ctx.strokeStyle = shade(color, -30);
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (odd) {
      // 面向左/右：竖直分隔出抽屉
      const colW = Math.min(w * 0.22, 18 * (w / h));
      ctx.moveTo(x + w - colW, y + 2);
      ctx.lineTo(x + w - colW, y + h - 2);
      ctx.stroke();
      ctx.strokeRect(x + w - colW + 2, y + 4, Math.max(1, colW - 4), Math.max(1, h - 8));
    } else {
      const rowH = Math.min(h * 0.22, 18);
      ctx.moveTo(x + 2, y + h - rowH);
      ctx.lineTo(x + w - 2, y + h - rowH);
      ctx.stroke();
      ctx.strokeRect(x + 4, y + h - rowH + 2, Math.max(1, w - 8), Math.max(1, rowH - 4));
    }
  }

  function drawCabinetDetail(ctx, x, y, w, h, it, scale) {
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    ctx.lineWidth = 1;
    const odd = Geometry.isOddRotation(it.rot);
    const n = Math.max(2, Math.round((odd ? h : w) / Math.max(12, 22 * scale)));
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (odd) {
        ctx.moveTo(x + 1, y + h * t);
        ctx.lineTo(x + w - 1, y + h * t);
      } else {
        ctx.moveTo(x + w * t, y + 1);
        ctx.lineTo(x + w * t, y + h - 1);
      }
    }
    ctx.stroke();
  }

  function drawShelfDetail(ctx, x, y, w, h, it, scale) {
    const odd = Geometry.isOddRotation(it.rot);
    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + h / 2);
    ctx.lineTo(x + w - 1, y + h / 2);
    ctx.stroke();
    const step = Math.max(14, 20 * scale);
    ctx.beginPath();
    if (odd) {
      for (let yy = y + step; yy < y + h - 2; yy += step) {
        ctx.moveTo(x + 1, yy);
        ctx.lineTo(x + w - 1, yy);
      }
    } else {
      for (let xx = x + step; xx < x + w - 2; xx += step) {
        ctx.moveTo(xx, y + 1);
        ctx.lineTo(xx, y + h - 1);
      }
    }
    ctx.stroke();
  }

  function drawTableDetail(ctx, x, y, w, h, color) {
    ctx.strokeStyle = shade(color, 30);
    ctx.lineWidth = 1;
    const inset = Math.min(w, h) * 0.08;
    ctx.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  }

  function drawPrinterDetail(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillRect(x + w * 0.18, y + h * 0.16, w * 0.64, h * 0.22);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(x + w * 0.18, y + h * 0.55, w * 0.64, h * 0.22);
  }

  function drawChair(ctx, x, y, w, h, color, it, scale) {
    const r = Math.min(w, h) / 2;
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
    ctx.fillStyle = shade(color, 12);
    ctx.fill();
    ctx.strokeStyle = shade(color, -40);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 靠背朝向
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = shade(color, -25);
    const backH = r * 0.62;
    if (it.rot === 0) ctx.fillRect(x, y, w, backH);
    else if (it.rot === 90) ctx.fillRect(x, y, backH, h);
    else if (it.rot === 180) ctx.fillRect(x, y + h - backH, w, backH);
    else ctx.fillRect(x + w - backH, y, backH, h);
    ctx.restore();
  }

  function drawSofa(ctx, x, y, w, h, color, it, scale) {
    roundRect(ctx, x, y, w, h, Math.min(6, Math.min(w, h) * 0.18));
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = shade(color, -45);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const pad = Math.min(w, h) * 0.14;
    ctx.strokeStyle = shade(color, 28);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
  }

  function drawPlant(ctx, x, y, w, h, color) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) / 2, 0, Math.PI * 2);
    ctx.fillStyle = shade(color, 18);
    ctx.fill();
    ctx.strokeStyle = shade(color, -35);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) / 4, 0, Math.PI * 2);
    ctx.fillStyle = shade(color, -18);
    ctx.fill();
  }

  function drawDoor(ctx, x, y, w, h, it, color, scale) {
    // 门扇 + 开启弧线
    const horizontal = w >= h;
    ctx.fillStyle = shade(color, 6);
    ctx.strokeStyle = shade(color, -60);
    ctx.lineWidth = 1;
    if (horizontal) {
      ctx.fillRect(x, y + h / 2 - 2, w, 4);
      ctx.strokeRect(x, y + h / 2 - 2, w, 4);
      const r = Math.min(w, h * 5);
      ctx.beginPath();
      ctx.arc(x, y + h, r, -Math.PI / 2, 0);
      ctx.strokeStyle = shade(color, -30);
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillRect(x + w / 2 - 2, y, 4, h);
      ctx.strokeRect(x + w / 2 - 2, y, 4, h);
      const r = Math.min(h, w * 5);
      ctx.beginPath();
      ctx.arc(x + w, y, r, Math.PI / 2, Math.PI);
      ctx.strokeStyle = shade(color, -30);
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawWindow(ctx, x, y, w, h, color) {
    const horizontal = w >= h;
    ctx.fillStyle = '#eaf2fb';
    ctx.strokeStyle = shade(color, -20);
    ctx.lineWidth = 1.4;
    if (horizontal) {
      const cy = y + h / 2;
      ctx.fillRect(x, cy - 2.5, w, 5);
      ctx.strokeRect(x, cy - 2.5, w, 5);
      ctx.beginPath();
      ctx.moveTo(x, cy);
      ctx.lineTo(x + w, cy);
      ctx.strokeStyle = shade(color, 30);
      ctx.stroke();
    } else {
      const cx = x + w / 2;
      ctx.fillRect(cx - 2.5, y, 5, h);
      ctx.strokeRect(cx - 2.5, y, 5, h);
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx, y + h);
      ctx.stroke();
    }
  }

  function drawColumn(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = shade(color, -50);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.globalAlpha = 0.35;
    ctx.stroke();
  }

  /**
   * 渲染整张布局到离屏 canvas，返回 canvas。
   * @returns {HTMLCanvasElement}
   */
  function renderToCanvas(layout, opts) {
    const o = opts || {};
    const scale = o.scale || 2;
    const padding = o.padding == null ? 48 : o.padding;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(layout.roomW * scale + padding * 2);
    canvas.height = Math.round(layout.roomD * scale + padding * 2);
    const ctx = canvas.getContext('2d');
    paintLayout(ctx, layout, {
      scale: scale,
      padding: padding,
      showGrid: o.showGrid !== false,
      showLabels: o.showLabels !== false,
      background: o.background || '#ffffff'
    });
    return canvas;
  }

  return {
    THEME: THEME,
    FURNITURE_ALPHA: FURNITURE_ALPHA,
    shade: shade,
    fitScale: fitScale,
    drawFurniture: drawFurniture,
    paintLayout: paintLayout,
    renderToCanvas: renderToCanvas
  };
});
