import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
export async function verifyBuild(directory) {
  const root=path.resolve(directory);
  async function inspect(folder) {
    for (const entry of await readdir(folder,{withFileTypes:true})) {
      const file=path.join(folder,entry.name);
      if(entry.isDirectory()){await inspect(file);continue;}
      if(!file.endsWith('.html'))continue;
      const html=await readFile(file,'utf8');
      if(/cdn\.tailwindcss\.com/.test(html))throw new Error(`Runtime Tailwind CDN remains in ${file}`);
      for(const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)){
        if(tag[0].startsWith('<link')&&!/rel=["']stylesheet["']/.test(tag[0]))continue;
        const ref=tag[0].match(/(?:src|href)=["']([^"']+)["']/)?.[1];
        if(!ref||/^(?:https?:|\/\/)/.test(ref))continue;
        const source=ref.split(/[?#]/)[0];
        const target=source.startsWith('/')?path.join(root,source.replace(/^\/trackccu\//,'')):path.resolve(path.dirname(file),source);
        try{await access(target);}catch{throw new Error(`Missing published asset: ${path.relative(root,file)} -> ${ref}`);}
      }
    }
  }
  await inspect(root);
}
