import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(process.argv[2] ?? path.join(root, 'offline-site'));
const offline = path.join(target, 'offline');
await fs.mkdir(path.join(offline, 'assets'), {recursive:true});
const relativePaths = s => s.replace(/(["'`])\/(motion|videos|figures|paper\.pdf)(?=[/"'`?])/g, '$1./$2');
const patch = (s, from, to) => { if (!s.includes(from)) throw new Error('Source changed: '+from.slice(0,70)); return s.replace(from,to); };
const workerResult = await build({entryPoints:[path.join(root,'app/robot-model.worker.ts')],bundle:true,write:false,format:'iife',minify:true,target:'es2022',plugins:[{name:'offline-worker',setup(b){b.onLoad({filter:/robot-model\.worker\.ts$/},async args=>({contents:(await fs.readFile(args.path,'utf8')).replace('const response = await fetch(url);','const response = new Response(url);'),loader:'ts'}));}}]});
const worker = workerResult.outputFiles[0].text;
const plugin = { name:'offline-page',setup(b) {
  b.onResolve({filter:/\.\/robot-model\.worker\?worker$/},()=>({path:'inline-robot-worker',namespace:'offline'}));
  b.onLoad({filter:/.*/,namespace:'offline'},()=>({contents:`export default class extends Worker { constructor() { const url=URL.createObjectURL(new Blob([${JSON.stringify(worker)}],{type:'text/javascript'}));super(url);this.offlineURL=url; } terminate(){super.terminate();URL.revokeObjectURL(this.offlineURL);} }`,loader:'js'}));
  b.onResolve({filter:/^offline-runtime$/},()=>({path:path.join(root,'scripts/offline-runtime.ts')}));
  b.onResolve({filter:/^offline-humanverse-svg$/},()=>({path:path.join(target,'figures/humanverse-animated.svg'),namespace:'inline-svg'}));
  b.onLoad({filter:/.*/,namespace:'inline-svg'},async args=>({contents:`export default ${JSON.stringify(relativePaths(await fs.readFile(args.path,'utf8')))}`,loader:'js'}));
  b.onLoad({filter:/\/app\/.*\.(tsx?|json)$/},async args=> {
    let s = await fs.readFile(args.path,'utf8');
    const name=path.basename(args.path);
    if (name==='motion-preload.ts') s='import { offlineFetch as fetch } from "offline-runtime";\n'+s;
    if (name==='robot-model.ts') {
      s='import { loadOfflineBlob } from "offline-runtime";\n'+s;
      s=patch(s,'worker.postMessage("/motion/g1-revo2.model.json.gz");',`loadOfflineBlob("/motion/g1-revo2.model.json.gz").then(blob => blob.arrayBuffer()).then(bytes => worker.postMessage(bytes, [bytes])).catch(error => { worker.terminate(); reject(error); });`);
    }
    if (name==='HeroMotion.tsx') {
      s='import { loadOfflineBlob } from "offline-runtime";\n'+s;
      s=patch(s,'let cancelNeighbor = () => {};','let cancelNeighbor = () => {};\n    let movieURL: string | undefined;\n    const offlineMovie = loadOfflineBlob(`/motion/${clip.id}.mp4`).then(blob => { if (disposed) return; movieURL = URL.createObjectURL(blob); movie.src = movieURL; movie.preload = "auto"; movie.load(); });');
      s=patch(s,'try {\n        const [module','try {\n        await offlineMovie;\n        if (disposed) return;\n        const [module');
      s=patch(s,'disposed = true; cancelNeighbor(); movie.pause();','disposed = true; cancelNeighbor(); movie.pause(); movie.removeAttribute("src"); movie.load(); if (movieURL) URL.revokeObjectURL(movieURL);');
      s=patch(s,'src={`/motion/${clip.id}.mp4`} poster=', 'poster=');
      s=patch(s,'movie.preload = "auto"; movie.load(); } };','movie.preload = "auto"; if (movieURL) movie.load(); } };');
    }
    if (name==='HumanVerseAnimation.tsx') {
      s='import inlineSVG from "offline-humanverse-svg";\n'+s;
      s=patch(s,'useRef<HTMLObjectElement>(null)','useRef<HTMLDivElement>(null)');
      s=patch(s,'object.current?.contentDocument?.querySelector("svg")','object.current?.querySelector("svg")');
      s=patch(s,'  function replay() {','  useEffect(() => { if (load && object.current) { const xml = new DOMParser().parseFromString(inlineSVG, "image/svg+xml"); object.current.replaceChildren(document.importNode(xml.documentElement, true)); loaded(); } }, [load]);\n\n  function replay() {');
      s=patch(s,'<object ref={object} type="image/svg+xml" data="/figures/humanverse-animated.svg" aria-label="Animated HumanVerse-500 dataset figure" onLoad={loaded} tabIndex={-1} />','<div ref={object} className="offline-humanverse-svg" aria-label="Animated HumanVerse-500 dataset figure" />');
    }
    return {contents:relativePaths(s),loader:name.endsWith('.tsx')?'tsx':name.endsWith('.json')?'json':'ts'};
  });
  b.onLoad({filter:/\/public\/motion\/(gallery|clips)\.json$/},async args=>({contents:relativePaths(await fs.readFile(path.join(target,'motion',path.basename(args.path)),'utf8').catch(()=>fs.readFile(args.path,'utf8'))),loader:'json'}));
}};
await build({stdin:{contents:'import React from "react"; import {createRoot} from "react-dom/client"; import Home from "./app/page"; createRoot(document.getElementById("offline-root")).render(<Home/>);',resolveDir:root,loader:'tsx'},bundle:true,format:'iife',minify:true,target:'es2022',jsx:'automatic',outfile:path.join(offline,'page.js'),define:{'process.env.NODE_ENV':'"production"'},plugins:[plugin]});
// Rebuild presentation while retaining the existing losslessly packed assets.
const bundleOnly = process.argv.includes('--bundle-only');
const cssDirectory = path.join(root, 'dist/client/_next/static/css');
const cssName = (await fs.readdir(cssDirectory)).find(name => name.endsWith('.css'));
const css = await fs.readFile(path.join(cssDirectory, cssName), 'utf8');
await fs.writeFile(path.join(offline, 'page.css'), css);
let assetBytes=0,assetCount=0;
if (!bundleOnly) {
const selected = [...JSON.parse(await fs.readFile(path.join(target,'motion/gallery.json'),'utf8')), ...JSON.parse(await fs.readFile(path.join(target,'motion/clips.json'),'utf8'))];
const required = new Set(['g1-revo2.model.json.gz']);
for (const clip of selected) {
  required.add(clip.id+'.json'); required.add(clip.id+'.mp4');
  const data=JSON.parse(await fs.readFile(path.join(target,'motion',clip.id+'.json'),'utf8'));
  required.add(path.basename(data.vertices));
  try { await fs.access(path.join(target,'motion',clip.id+'.robot.json.gz')); required.add(clip.id+'.robot.json.gz'); } catch { /* Human-only clips have no robot replay. */ }
}
for(const name of required) {
 const key='motion/'+name,bytes=await fs.readFile(path.join(target,key));
 const mime=name.endsWith('.mp4')?'video/mp4':name.endsWith('.json')?'application/json':'application/octet-stream';
 const script=`globalThis.__offlineAsset(${JSON.stringify(key)},${JSON.stringify(mime)},${JSON.stringify(bytes.toString('base64'))});`;
 await fs.writeFile(path.join(offline,'assets',key.replaceAll('/','--')+'.js'),script);assetBytes+=Buffer.byteLength(script);assetCount++;
}
}
const entry=path.join(target,'index.html');
await fs.copyFile(path.join(root, 'public/favicon.svg'), path.join(target, 'favicon.svg'));
await fs.copyFile(path.join(root, 'public/paper.pdf'), path.join(target, 'paper.pdf'));
const { default: server } = await import(pathToFileURL(path.join(root, 'dist/server/index.js')).href);
const response = await server.fetch(
  new Request('http://localhost/', { headers: { accept: 'text/html' } }),
  { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);
if (response.status !== 200) throw new Error('Unable to render offline fallback');
const main = (await response.text()).match(/<main\b[\s\S]*?<\/main>/)?.[0];
if (!main) throw new Error('Missing fallback HTML');
const fallback = relativePaths(main);
const scripts = [];
for (const name of ['packed-codec.js', 'shared.js', 'page.js']) {
  try { await fs.access(path.join(offline, name)); scripts.push(`<script defer src="./offline/${name}"></script>`); } catch { /* Raw asset builds do not need packing helpers. */ }
}
await fs.writeFile(entry, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Lambda-zero learns humanoid loco-manipulation from diverse human experience and robot demonstrations."><title>Scaling Egocentric Human Data for General Humanoid Control</title><link rel="icon" href="./favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="./offline/page.css"></head><body><div id="offline-root">${fallback}</div>${scripts.join('')}</body></html>\n`);
console.log(JSON.stringify({ target, bundleOnly, assetCount, assetMB: Math.round(assetBytes / 1024 / 1024) }));
