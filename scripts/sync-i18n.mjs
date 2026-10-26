// 依 zh-TW.ts 的 key 重新產生 en.ts：保留已翻譯的值，新增的 key 填空字串。
// 用法：npm run i18n:sync
import { readFileSync, writeFileSync } from 'node:fs';

const zhPath = new URL('../src/i18n/zh-TW.ts', import.meta.url);
const enPath = new URL('../src/i18n/en.ts', import.meta.url);
const keyRe = /^\s+'([^']+)':\s*'((?:[^'\\]|\\.)*)'/gm;

const zhKeys = [...readFileSync(zhPath, 'utf8').matchAll(keyRe)].map((m) => m[1]);
let existing = new Map();
try {
  existing = new Map([...readFileSync(enPath, 'utf8').matchAll(keyRe)].map((m) => [m[1], m[2]]));
} catch {
  // en.ts 不存在時從空白開始
}

let out =
  '// English dictionary. Keys are kept in sync with zh-TW.ts (npm run i18n:sync); empty values fall back to Chinese.\n' +
  "// TODO: fill in translations.\n\nimport type { I18nKey } from './zh-TW';\n\nexport const en: Record<I18nKey, string> = {\n";
for (const key of zhKeys) out += `  '${key}': '${existing.get(key) ?? ''}',\n`;
out += '};\n';
writeFileSync(enPath, out);
console.log(`en.ts: ${zhKeys.length} keys`);
