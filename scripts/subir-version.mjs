// Sube la versión en manifest.json y package.json a la vez.
// Uso: npm run version            → 0.8.2 → 0.8.3
//      npm run version -- menor    → 0.8.2 → 0.9.0
//      npm run version -- 1.0.0    → exacta
import { readFileSync, writeFileSync } from 'node:fs';
const leer = (f) => JSON.parse(readFileSync(f, 'utf8'));
const m = leer('manifest.json');
const arg = process.argv[2] || 'parche';
let [a, b, c] = m.version.split('.').map(Number);
let nueva;
if (/^\d+\.\d+\.\d+$/.test(arg)) nueva = arg;
else if (arg === 'mayor') nueva = `${a + 1}.0.0`;
else if (arg === 'menor') nueva = `${a}.${b + 1}.0`;
else nueva = `${a}.${b}.${c + 1}`;
for (const f of ['manifest.json', 'package.json']) {
  const j = leer(f);
  j.version = nueva;
  writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
}
console.log(`${m.version} → ${nueva}`);
