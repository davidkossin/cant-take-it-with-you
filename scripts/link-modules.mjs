import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SourceTextModule, createContext } from 'node:vm';

async function filesUnder(dir) {
  const files = [];
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    if (entry.isDirectory()) files.push(...await filesUnder(`${dir}/${entry.name}`));
    else if (entry.name.endsWith('.js')) files.push(`${dir}/${entry.name}`);
  }
  return files;
}

// Link without executing browser bootstrap/worker code. This catches missing
// files and named exports that a per-file syntax check cannot detect.
const files = await filesUnder('js'), context = createContext({}), modules = new Map();
for (const file of files) {
  const url = pathToFileURL(`${process.cwd()}/${file}`).href;
  modules.set(url, new SourceTextModule(await readFile(file, 'utf8'), {identifier:url, context}));
}
const resolve = (specifier, parent) => {
  const url = new URL(specifier, parent.identifier).href;
  const module = modules.get(url);
  if (!module) throw new Error(`Unresolved module ${specifier} from ${fileURLToPath(parent.identifier)}`);
  return module;
};
for (const module of modules.values()) if (module.status === 'unlinked') await module.link(resolve);
console.log(`Dependency linked ${modules.size} JavaScript modules.`);
