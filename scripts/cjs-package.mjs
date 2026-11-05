import { writeFileSync } from 'node:fs';

// Le paquet est en `type: module` : sans ce fichier, Node lirait dist/cjs comme de l'ESM.
writeFileSync(new URL('../dist/cjs/package.json', import.meta.url), '{ "type": "commonjs" }\n');
