import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function walk(dir) {
  const files=[];
  for (const e of await readdir(dir,{withFileTypes:true})) {
    if (e.isDirectory()) files.push(...await walk(dir+'/'+e.name));
    else if (e.name.endsWith('.js')) files.push(dir+'/'+e.name);
  }
  return files;
}
const files=await walk('js');
for (const file of files) {
  const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if (r.status!==0) { process.stderr.write(r.stderr); process.exit(1); }
}
console.log('Syntax checked '+files.length+' JavaScript modules.');
