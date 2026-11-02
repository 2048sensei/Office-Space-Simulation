// 逐个编译 assets/js 下的脚本，捕获语法错误（不启动子进程，CI 与沙箱环境都稳定）。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const dir = path.resolve('assets/js');
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.js')).sort();
let failed = 0;

for (const name of files) {
  const file = path.join(dir, name);
  const code = fs.readFileSync(file, 'utf8');
  try {
    new vm.Script(code, { filename: name });
    console.log('OK   ' + name);
  } catch (err) {
    failed += 1;
    console.error('FAIL ' + name + ': ' + err.message);
  }
}

console.log(`\n${files.length - failed}/${files.length} 个脚本通过语法检查`);
process.exit(failed === 0 ? 0 : 1);
