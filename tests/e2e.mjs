// 无依赖的端到端冒烟测试：启动本机 Chrome/Edge，通过 DevTools 协议驱动页面。
// 用法：node tests/e2e.mjs        （找不到浏览器时自动跳过，退出码 0）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageUrl = pathToFileURL(path.join(root, 'index.html')).href;

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const browser = CANDIDATES.find((p) => fs.existsSync(p));
if (!browser) {
  console.log('未找到 Chrome / Edge，已跳过端到端测试。');
  process.exit(0);
}

const port = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-e2e-'));
const failures = [];
let ws = null;
let proc = null;

function check(name, ok, detail) {
  if (ok) console.log('  ✔ ' + name);
  else {
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log('  ✘ ' + name + (detail ? ' — ' + detail : ''));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (_) { /* 浏览器还没起来 */ }
    await sleep(100);
  }
  throw new Error('DevTools 端口未就绪');
}

function createClient(socket) {
  let seq = 0;
  const pending = new Map();
  const errors = [];

  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error.message));
      else entry.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails || {};
      errors.push((d.exception && d.exception.description) || d.text || '未知异常');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push(msg.params.entry.text);
    }
  });

  return {
    errors,
    send(method, params) {
      const id = ++seq;
      socket.send(JSON.stringify({ id, method, params: params || {} }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    }
  };
}

async function main() {
  console.log('浏览器：' + browser);
  proc = spawn(browser, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--window-size=1440,1280',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    pageUrl
  ], { stdio: 'ignore' });

  const target = await waitForTarget();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const client = createClient(ws);
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Page.enable');

  const evaluate = async (expression, awaitPromise) => {
    const res = await client.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: !!awaitPromise
    });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error((d.exception && d.exception.description) || d.text);
    }
    return res.result.value;
  };

  // 等页面初始化
  let ready = false;
  for (let i = 0; i < 80; i++) {
    ready = await evaluate('document.documentElement.dataset.ready === "1"').catch(() => false);
    if (ready) break;
    await sleep(100);
  }
  check('页面初始化完成', ready === true);

  const count = await evaluate('document.querySelectorAll(".furn").length');
  check('默认示例渲染 36 件家具', count === 36, '实际 ' + count);

  const theme = await evaluate('document.documentElement.dataset.theme');
  check('主题已应用', theme === 'dark' || theme === 'light', String(theme));

  // 可选：生成 README 截图（SHOTS=1 node tests/e2e.mjs）
  if (process.env.SHOTS) {
    const docs = path.join(root, 'docs');
    fs.mkdirSync(docs, { recursive: true });
    const capture = async (name) => {
      const metrics = await client.send('Page.getLayoutMetrics');
      const size = metrics.cssContentSize || metrics.contentSize;
      const shot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: {
          x: 0, y: 0,
          width: Math.ceil(size.width),
          height: Math.ceil(size.height),
          scale: 1
        }
      });
      fs.writeFileSync(path.join(docs, name), Buffer.from(shot.data, 'base64'));
      console.log('  · 已保存 docs/' + name);
    };
    await evaluate('officeApp.select(officeApp.layout.items.find(i => i.type === "desk").id)');
    await sleep(250);
    await capture('screenshot-dark.png');
    await evaluate('document.documentElement.dataset.theme = "light"');
    await sleep(250);
    await capture('screenshot-light.png');
    await evaluate('document.documentElement.dataset.theme = "dark"');

    const dataUrl = await evaluate('officeApp.buildExportCanvas().toDataURL("image/png")');
    fs.writeFileSync(path.join(docs, 'export-sample.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('  · 已保存 docs/export-sample.png');

    await evaluate('officeApp.select(null)');
    await sleep(150);
  }

  // 添加 → 撤销 → 重做
  const added = await evaluate('officeApp.add(); document.querySelectorAll(".furn").length');
  check('添加家具后数量 +1', added === 37, '实际 ' + added);
  await evaluate('officeApp.undo()');
  const afterUndo = await evaluate('document.querySelectorAll(".furn").length');
  check('撤销后恢复 36 件', afterUndo === 36, '实际 ' + afterUndo);
  await evaluate('officeApp.redo()');
  const afterRedo = await evaluate('document.querySelectorAll(".furn").length');
  check('重做后回到 37 件', afterRedo === 37, '实际 ' + afterRedo);
  await evaluate('officeApp.undo()');

  // 拖动第一张桌子
  const dragInfo = await evaluate(`(() => {
    const el = document.querySelector('.furn.kind-desk');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { id: Number(el.dataset.id), x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (dragInfo) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: dragInfo.x, y: dragInfo.y, button: 'left', buttons: 1, clickCount: 1
    });
    for (let i = 1; i <= 4; i++) {
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: dragInfo.x + i * 18, y: dragInfo.y + i * 9, button: 'left', buttons: 1
      });
    }
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: dragInfo.x + 72, y: dragInfo.y + 36, button: 'left', buttons: 0, clickCount: 1
    });
    await sleep(120);
    const moved = await evaluate(`(() => {
      const it = officeApp.layout.items.find(i => i.id === ${dragInfo.id});
      return it ? { x: it.x, y: it.y } : null;
    })()`);
    check('拖动后家具坐标变化', !!moved && (Math.abs(moved.x) > 1), JSON.stringify(moved));
  } else {
    check('拖动后家具坐标变化', false, '未找到桌子');
  }

  // 画布导出
  const exported = await evaluate(`(() => {
    const canvas = officeApp.buildExportCanvas();
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let i = 0; i < data.length; i += 4000) {
      if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) colored++;
    }
    return { width: canvas.width, height: canvas.height, colored };
  })()`);
  check('图片导出画布尺寸正常', exported.width > 800 && exported.height > 600, JSON.stringify(exported));
  check('图片导出包含绘制内容', exported.colored > 30, '有色采样 ' + exported.colored);

  // 导入
  const imported = await evaluate(`(() => {
    officeApp.importData(JSON.stringify({
      roomW: 600, roomD: 500,
      items: [{ type: 'desk', name: '测试桌', w: 140, d: 70, x: 10, y: 10, rot: 0 }]
    }));
    return { count: document.querySelectorAll('.furn').length, w: officeApp.layout.roomW };
  })()`);
  check('导入 JSON 生效', imported.count === 1 && imported.w === 600, JSON.stringify(imported));

  check('页面无 JS 异常 / console.error', client.errors.length === 0, client.errors.slice(0, 3).join(' | '));
}

try {
  await main();
} catch (err) {
  failures.push(err.message);
  console.error('端到端测试中断：' + err.message);
} finally {
  if (ws) {
    try { ws.close(); } catch (_) { /* 忽略 */ }
  }
  if (proc) {
    try { proc.kill(); } catch (_) { /* 忽略 */ }
  }
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
}

if (failures.length) {
  console.error('\n' + failures.length + ' 项失败：\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('\n端到端测试全部通过。');
