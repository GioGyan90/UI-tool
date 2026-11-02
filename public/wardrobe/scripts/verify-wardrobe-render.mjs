/** Optional pixel QA: npm install --no-save @napi-rs/canvas, then run with an output folder. */
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {createCanvas,Image}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'@napi-rs/canvas') : '@napi-rs/canvas');
globalThis.document={createElement:()=>{const c=createCanvas(1,1);c.toBlob=callback=>callback(new Blob([c.toBuffer('image/png')],{type:'image/png'}));return c;}};
class LocalImage extends Image{
  constructor(){super();this.ready=new Promise((resolve,reject)=>{this.onload=resolve;this.onerror=reject;});}
  set src(value){super.src=readFileSync(fileURLToPath(value));}async decode(){await this.ready;}
}
globalThis.Image=LocalImage;
const sdk=await import('../avatar-sdk.js');
const {makeZip}=await import('../zip.js');
const manifest=JSON.parse(await fs.readFile(new URL('../manifest.json',import.meta.url),'utf8'));
const output=path.resolve(process.argv[2] || 'wardrobe-render-qa');await fs.mkdir(output,{recursive:true});
const pixels=canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
function difference(a,b){
  let alpha=0,rgb=0;
  for(let i=0;i<a.length;i+=4){alpha=Math.max(alpha,Math.abs(a[i+3]-b[i+3]));for(let c=0;c<3;c++)rgb=Math.max(rgb,Math.abs(a[i+c]*a[i+3]/255-b[i+c]*b[i+3]/255));}
  return{alpha,rgb};
}
for(const preset of manifest.presets){
  const state=sdk.createState(manifest,preset.id),canvas=await sdk.renderAvatar(null,state,manifest),data=pixels(canvas);
  assert.equal(data[3],0);assert(data.some((v,i)=>i%4===3&&v>250));
  await fs.writeFile(path.join(output,preset.id+'.png'),canvas.toBuffer('image/png'));
  if(preset.id==='formal'){
    const stack=await sdk.renderCompositeLayers(state,manifest);
    assert.equal(stack.length,10);
    const recomposed=sdk.makeCanvas(manifest);
    for(const part of stack)recomposed.getContext('2d').drawImage(part.canvas,0,0);
    assert.deepEqual(pixels(recomposed),data,'Export stack must reproduce the complete avatar.');
    const files=await Promise.all(stack.map(async({kind,canvas},index)=>({name:`layers/${String(index).padStart(2,'0')}-${kind}.png`,data:await sdk.canvasBlob(canvas)})));
    files.push({name:'character.png',data:await sdk.canvasBlob(canvas)});
    const zip=await makeZip(files);await fs.writeFile(path.join(output,'formal-layered.zip'),Buffer.from(await zip.arrayBuffer()));
    for(const kind of ['top','outer']){
      const joined=sdk.makeCanvas(manifest),jc=joined.getContext('2d');
      jc.drawImage(stack.find(p=>p.kind===kind+'-back').canvas,0,0);jc.drawImage(stack.find(p=>p.kind===kind).canvas,0,0);
      const delta=difference(pixels(joined),pixels(await sdk.renderLayer(kind,state,manifest)));
      assert(delta.alpha<=1&&delta.rgb<=2,`${kind} collar split changed source artwork: ${JSON.stringify(delta)}`);
    }
  }
}
const state=sdk.createState(manifest,'field'),neck=await sdk.renderLayer('neck',state,manifest),head=await sdk.renderLayer('head',state,manifest);
const moved=structuredClone(state);moved.layers.neck.y=10;
assert.deepEqual(pixels(head),pixels(await sdk.renderLayer('head',moved,manifest)));
function centerY(canvas){const data=pixels(canvas);let sum=0,weight=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const a=data[(y*canvas.width+x)*4+3];sum+=a*y;weight+=a;}return sum/weight;}
assert(Math.abs(centerY(await sdk.renderLayer('neck',moved,manifest))-centerY(neck)-10)<1e-5);
// Numerical calibration must affect pixels independently on both axes and survive export.
function alphaBounds(canvas){
  const data=pixels(canvas);let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>128){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  return {width:right-left+1,height:bottom-top+1};
}
const calibrated=sdk.createState(manifest,'field');
for(const kind of ['hair','head','neck']){
  const base=alphaBounds(await sdk.renderLayer(kind,calibrated,manifest));
  const wider=structuredClone(calibrated);wider.layers[kind].scaleX=1.2;
  const resized=alphaBounds(await sdk.renderLayer(kind,wider,manifest));
  assert(Math.abs(resized.width/base.width-1.2)<.025,`${kind} width parameter did not resize pixels.`);
  assert(Math.abs(resized.height-base.height)<=1,`${kind} width changed its height.`);
  Object.assign(calibrated.layers[kind],{x:5.5,y:-7.2,scale:.95,scaleX:.92,scaleY:.86});
}
const restored=sdk.normalizeState(JSON.parse(JSON.stringify(calibrated)),manifest);
assert.deepEqual(pixels(await sdk.renderAvatar(null,calibrated,manifest)),pixels(await sdk.renderAvatar(null,restored,manifest)),'Calibrated configuration must restore the same exported pixels.');
const calibratedStack=await sdk.renderCompositeLayers(restored,manifest),calibratedCanvas=sdk.makeCanvas(manifest);
for(const part of calibratedStack)calibratedCanvas.getContext('2d').drawImage(part.canvas,0,0);
assert.deepEqual(pixels(calibratedCanvas),pixels(await sdk.renderAvatar(null,restored,manifest)),'Calibrated ten-layer export must match the avatar.');
const full=pixels(await sdk.renderAvatar(null,state,manifest)),stack=await sdk.renderCompositeLayers(state,manifest),np=pixels(neck),tp=pixels(stack.find(p=>p.kind==='top').canvas),op=pixels(stack.find(p=>p.kind==='outer').canvas);
let exposed=0;
for(let y=330;y<415;y++)for(let x=430;x<520;x++){
  const i=(y*manifest.width+x)*4;
  if(np[i+3]>250&&tp[i+3]<2&&op[i+3]<2){exposed++;assert(full[i+3]>250);for(let c=0;c<3;c++)assert(Math.abs(full[i+c]-np[i+c])<=2);}
}
assert(exposed>100,'Open collar must expose a continuous neck/clavicle patch.');
for(const id of ['top-shirt','top-formal']){
  const asset=manifest.assets.find(a=>a.id===id),look=sdk.createState(manifest);look.layers.top.id=id;look.layers.outer.id='none';
  const alpha=pixels(await sdk.renderLayer('top',look,manifest));
  const firstY=fraction=>{const x=Math.round(asset.box[0]+asset.box[2]*fraction);for(let y=asset.box[1];y<asset.box[1]+asset.box[3];y++)if(alpha[(y*manifest.width+x)*4+3]>200)return y;return Infinity;};
  assert(firstY(.2)>firstY(.8),`${id} shoulder line points opposite to the head.`);
}
// Four inner garments x all five outer choices, checked as an upper-body contact sheet.
const tops=manifest.assets.filter(a=>a.kind==='top'),outers=manifest.assets.filter(a=>a.kind==='outer');
const atlas=createCanvas(outers.length*220,tops.length*300),ac=atlas.getContext('2d');ac.fillStyle='#eeeae0';ac.fillRect(0,0,atlas.width,atlas.height);
for(let row=0;row<tops.length;row++)for(let col=0;col<outers.length;col++){
  const look=sdk.createState(manifest);look.layers.top.id=tops[row].id;look.layers.top.tint=null;look.layers.outer.id=outers[col].id;
  const image=await sdk.renderAvatar(null,look,manifest);
  ac.drawImage(image,375,195,220,300,col*220,row*300,220,300);
  ac.fillStyle='#fffdf5';ac.fillRect(col*220,row*300,220,18);ac.fillStyle='#355044';ac.font='10px sans-serif';ac.fillText(tops[row].id+' / '+outers[col].id,col*220+4,row*300+12);
}
await fs.writeFile(path.join(output,'collar-combinations.png'),atlas.toBuffer('image/png'));
console.log(`PASS: 5 presets, 20 garment combinations, 10 export layers, collar alpha preservation, independent neck movement, ${exposed} filled open-collar pixels, right-facing shoulders.`);
