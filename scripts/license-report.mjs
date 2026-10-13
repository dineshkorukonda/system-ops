import fs from 'node:fs';
import path from 'node:path';
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const rows = Object.entries(lock.packages).filter(([name]) => name.startsWith('node_modules/')).map(([location, pkg]) => {
  const filename = path.join(location, 'package.json');
  const installed = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : pkg;
  return {name:installed.name || location.split('node_modules/').at(-1),version:pkg.version,license:installed.license || pkg.license || 'UNKNOWN',development:!!pkg.dev,installed:fs.existsSync(filename)};
});
fs.mkdirSync('artifacts', {recursive:true});
fs.writeFileSync('artifacts/dependency-licenses.json', JSON.stringify({generatedAt:new Date().toISOString(),packages:rows}, null, 2));
console.log(`Recorded ${rows.length} locked dependency licenses in artifacts/dependency-licenses.json.`);
const copyleft = rows.filter(row => /AGPL|GPL/.test(row.license));
if (copyleft.length) console.log('Review copyleft dependencies:', JSON.stringify(copyleft));
