/** Optional pixel QA: npm install --no-save @napi-rs/canvas, then run with an output folder. */
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const sharp=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp') : 'sharp');
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
    assert.equal(stack.length,12);
    const recomposed=sdk.makeCanvas(manifest);
    for(const part of stack)recomposed.getContext('2d').drawImage(part.canvas,0,0);
    assert.deepEqual(pixels(recomposed),data,'Export stack must reproduce the complete avatar.');
    const files=await Promise.all(stack.map(async({kind,canvas},index)=>({name:`layers/${String(index).padStart(2,'0')}-${kind}.png`,data:await sdk.canvasBlob(canvas)})));
    files.push({name:'character.png',data:await sdk.canvasBlob(canvas)});
    const zip=await makeZip(files);await fs.writeFile(path.join(output,'formal-layered.zip'),Buffer.from(await zip.arrayBuffer()));
    for(const kind of ['top','outer']){
      const joined=sdk.makeCanvas(manifest),jc=joined.getContext('2d');
      jc.drawImage(stack.find(p=>p.kind===kind+'-collar-back').canvas,0,0);jc.drawImage(stack.find(p=>p.kind===kind).canvas,0,0);
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
function verticalStats(canvas){
  const data=pixels(canvas);let mass=0,sum=0,squared=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const a=data[(y*canvas.width+x)*4+3];mass+=a;sum+=a*y;squared+=a*y*y;}
  return{center:sum/mass,spread:Math.sqrt(squared/mass-(sum/mass)**2)};
}
const calibrated=sdk.createState(manifest,'field');
for(const kind of ['hair','head','neck']){
  const baseCanvas=await sdk.renderLayer(kind,calibrated,manifest),base=alphaBounds(baseCanvas);
  const wider=structuredClone(calibrated);wider.layers[kind].scaleX=1.2;
  const widerCanvas=await sdk.renderLayer(kind,wider,manifest),resized=alphaBounds(widerCanvas);
  assert(Math.abs(resized.width/base.width-1.2)<.025,`${kind} width parameter did not resize pixels.`);
  // A thin split hair tip can cross the 128-alpha threshold after horizontal
  // resampling. Check the vertical mass distribution instead of that one tip.
  const beforeY=verticalStats(baseCanvas),afterY=verticalStats(widerCanvas);
  assert(Math.abs(beforeY.center-afterY.center)<.1&&Math.abs(beforeY.spread-afterY.spread)<.1,`${kind} width changed its vertical geometry.`);
  Object.assign(calibrated.layers[kind],{x:5.5,y:-7.2,scale:.95,scaleX:.92,scaleY:.86});
}
const restored=sdk.normalizeState(JSON.parse(JSON.stringify(calibrated)),manifest);
assert.deepEqual(pixels(await sdk.renderAvatar(null,calibrated,manifest)),pixels(await sdk.renderAvatar(null,restored,manifest)),'Calibrated configuration must restore the same exported pixels.');
const calibratedStack=await sdk.renderCompositeLayers(restored,manifest),calibratedCanvas=sdk.makeCanvas(manifest);
for(const part of calibratedStack)calibratedCanvas.getContext('2d').drawImage(part.canvas,0,0);
assert.deepEqual(pixels(calibratedCanvas),pixels(await sdk.renderAvatar(null,restored,manifest)),'Calibrated export stack must match the avatar.');
const rearLook=sdk.createState(manifest,'trench');
const withoutRear=structuredClone(rearLook);withoutRear.layers['hair-back'].visible=false;withoutRear.layers['outer-back'].visible=false;
const rearResult=await sdk.renderAvatar(null,rearLook,manifest),without=pixels(await sdk.renderAvatar(null,withoutRear,manifest)),withPixels=pixels(rearResult);
await fs.writeFile(path.join(output,'rear-layer-demo.png'),rearResult.toBuffer('image/png'));
const rearStack=await sdk.renderCompositeLayers(rearLook,manifest),joinedRear=sdk.makeCanvas(manifest);
for(const part of rearStack)joinedRear.getContext('2d').drawImage(part.canvas,0,0);
assert.deepEqual(pixels(joinedRear),withPixels,'Nonempty rear pieces must survive the exported paint stack.');
// A closed collar must keep its curved near rim in front of the neck, without
// the head's short neck overlap cutting through the cloth at the throat.
const highTop=pixels(rearStack.find(p=>p.kind==='top').canvas),highRear=pixels(rearStack.find(p=>p.kind==='top-collar-back').canvas);
const highHead=pixels(rearStack.find(p=>p.kind==='head').canvas),highNeck=pixels(rearStack.find(p=>p.kind==='neck').canvas);
const rimSamples=[[185,28],[200,35],[225,40],[240,39],[255,35],[272,22]];
assert(!manifest.assets.find(a=>a.id==='top-turtleneck').rearCollar&&!highRear.some((v,i)=>i%4===3&&v),'The high collar must not expose a rear part.');
for(const[x,y]of rimSamples){
  const i=((268+y)*manifest.width+256+x)*4;
  assert(highTop[i+3]>230&&highRear[i+3]<10,'The visible collar band must remain in the front garment.');
  assert(highNeck[i+3]>200&&highHead[i+3]<2,'The neck should meet the inside of the collar without head pixels cutting its rim.');
  const a=highTop[i+3]/255;
  for(let c=0;c<3;c++)assert(Math.abs(withPixels[i+c]-(highTop[i+c]*a+highNeck[i+c]*(1-a)))<=3,'Neck skin painted over the front collar band.');
}
const collarJoined=sdk.makeCanvas(manifest),collarContext=collarJoined.getContext('2d');
collarContext.drawImage(rearStack.find(p=>p.kind==='top-collar-back').canvas,0,0);collarContext.drawImage(rearStack.find(p=>p.kind==='top').canvas,0,0);
const collarDelta=difference(pixels(collarJoined),pixels(await sdk.renderLayer('top',rearLook,manifest)));
assert(collarDelta.alpha<=1&&collarDelta.rgb<=2,'The new collar split must preserve the edited garment.');
const rearFiles=await Promise.all(rearStack.map(async({kind,canvas},index)=>({name:`layers/${String(index).padStart(2,'0')}-${kind}.png`,data:await sdk.canvasBlob(canvas)})));
rearFiles.push({name:'character.png',data:await sdk.canvasBlob(rearResult)});
await fs.writeFile(path.join(output,'rear-layered.zip'),Buffer.from(await(await makeZip(rearFiles)).arrayBuffer()));
let exposedRear=0,opaqueFront=0,maxFrontError=0;
for(let i=0;i<without.length;i+=4){
  // The flattened alpha may round 254.5 to 255; allow the same 2/255 edge
  // quantization tolerance used by the source collar recomposition check.
  if(without[i+3]===255){opaqueFront++;for(let c=0;c<4;c++)maxFrontError=Math.max(maxFrontError,Math.abs(withPixels[i+c]-without[i+c]));}
  if(without[i+3]===0&&withPixels[i+3]>200)exposedRear++;
}
assert(opaqueFront>10000&&exposedRear>100,'Rear pieces should be visible only where the foreground permits.');
assert(maxFrontError<=2,`Rear art covered the opaque foreground: max channel difference ${maxFrontError}.`);
function centerX(canvas){const data=pixels(canvas);let sum=0,weight=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const a=data[(y*canvas.width+x)*4+3];sum+=a*x;weight+=a;}return sum/weight;}
const initialRear=await sdk.renderLayer('hair-back',rearLook,manifest),shifted=structuredClone(rearLook);shifted.layers.hair.x=17;
assert(Math.abs(centerX(await sdk.renderLayer('hair-back',shifted,manifest))-centerX(initialRear)-17)<1e-5,'Rear hair should follow its front piece.');
const hideCoat=structuredClone(rearLook);hideCoat.layers.outer.visible=false;
assert(!pixels(await sdk.renderLayer('outer-back',hideCoat,manifest)).some((v,i)=>i%4===3&&v),'A linked lining should hide with its coat.');
hideCoat.layers['outer-back'].followParent=false;
assert(pixels(await sdk.renderLayer('outer-back',hideCoat,manifest)).some((v,i)=>i%4===3&&v>200),'An unlinked lining remains independently editable.');
await fs.writeFile(path.join(output,'rear-layer-demo.png'),rearResult.toBuffer('image/png'));
for(const kind of ['hair-back','outer-back'])await fs.writeFile(path.join(output,kind+'.png'),(await sdk.renderLayer(kind,rearLook,manifest)).toBuffer('image/png'));
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
// Splitting an existing hairstyle or coat must preserve its source pixels.
const root=new URL('../',import.meta.url),raw=async file=>sharp(new URL(file,root).pathname).ensureAlpha().raw().toBuffer();
const[oldKnit,newKnit]=await Promise.all(['assets/top-turtleneck.png','assets/top-turtleneck-v2.png'].map(raw));
const rimY=x=>{for(let y=0;y<90;y++)if(newKnit[(y*452+x)*4+3]>128)return y;return Infinity;};
for(let dx=0;dx<=48;dx++){
  assert(Math.abs(rimY(223-dx)-rimY(223+dx))<=1,'The collar opening must be left-right symmetric.');
  for(const x of [223-dx,223+dx])for(let y=0;y<rimY(x)-2;y++)assert(newKnit[(y*452+x)*4+3]<8,'No rear rim or dark interior may appear above the front collar edge.');
}
assert(rimY(223)>rimY(175)+12&&rimY(223)>rimY(271)+12,'The front collar must have one continuous shallow U-shaped edge.');
const neckSides=[];
for(let x=383;x<574;x++)if(highNeck[(294*manifest.width+x)*4+3]>128)neckSides.push(x);
assert(Math.abs((neckSides[0]+neckSides.at(-1))/2-(256+223))<=2,'The symmetric collar must be centered on the actual neck, not the shirt canvas.');
for(let y=0;y<596;y++)for(let x=0;x<452;x++)if(x<148||x>=313||y>=115){
  const i=(y*452+x)*4;
  assert.deepEqual(newKnit.subarray(i,i+4),oldKnit.subarray(i,i+4),'The collar edit changed the original shirt outside the neck patch.');
}
for(let y=60;y<115;y++)for(let x=148;x<313;x++){
  const i=(y*452+x)*4;assert.equal(newKnit[i+3],oldKnit[i+3],'The neckline patch must not leave transparent seams in the shoulders or chest.');
}
async function checkSourceSplit(originalFile,frontFile,backFile){
  const[source,front,back]=await Promise.all([originalFile,frontFile,backFile].map(raw)),joined=Buffer.alloc(source.length);
  let rearCount=0;
  for(let i=0;i<source.length;i+=4){
    const fa=front[i+3]/255,ba=back[i+3]/255,a=fa+ba*(1-fa);joined[i+3]=Math.round(a*255);
    if(back[i+3]>128)rearCount++;
    for(let c=0;c<3;c++)joined[i+c]=a?Math.round((front[i+c]*fa+back[i+c]*ba*(1-fa))/a):0;
  }
  const delta=difference(joined,source);assert(delta.alpha<=1&&delta.rgb<=2,`${frontFile} changed original art: ${JSON.stringify(delta)}`);
  assert(rearCount>500,`${backFile} must contain an actual rear section.`);
}
for(const id of ['hair-black','hair-blonde','hair-slickback']){
  await checkSourceSplit(`assets/${id}.png`,`assets/${id}-front.png`,`assets/${id}-back.png`);
  const front=manifest.assets.find(a=>a.id===id),rear=manifest.assets.find(a=>a.id===id+'-back');
  assert.deepEqual(front.box,rear.box);assert(rear.box[1]+rear.box[3]<310,'Original short hair must not gain a long extension.');
}
// The new haircut has a clear forehead and a cropped rear; it must work with
// all existing outfits and retain the same twelve exported paint layers.
for(const preset of manifest.presets){
  const look=sdk.createState(manifest,preset.id);look.layers.hair.id='hair-slickback';look.layers['hair-back'].id='hair-slickback-back';
  const stack=await sdk.renderCompositeLayers(look,manifest),avatar=sdk.makeCanvas(manifest);
  for(const part of stack)avatar.getContext('2d').drawImage(part.canvas,0,0);
  assert.equal(stack.length,12);
  await fs.writeFile(path.join(output,`slickback-${preset.id}.png`),avatar.toBuffer('image/png'));
  const forehead=pixels(stack.find(p=>p.kind==='hair').canvas);
  for(const[x,y]of[[490,157],[505,169]])assert(forehead[(y*manifest.width+x)*4+3]<2,'Swept-back hair must not add bangs over the forehead.');
  assert(manifest.assets.find(a=>a.id==='hair-slickback-back').box[1]+154<=225,'The short nape must end above the neck and collar.');
  if(preset.id==='trench'){
    const files=await Promise.all(stack.map(async({kind,canvas},index)=>({name:`layers/${String(index).padStart(2,'0')}-${kind}.png`,data:await sdk.canvasBlob(canvas)})));
    files.push({name:'character.png',data:await sdk.canvasBlob(avatar)});
    await fs.writeFile(path.join(output,'slickback-layered.zip'),Buffer.from(await(await makeZip(files)).arrayBuffer()));
    assert.deepEqual(pixels(avatar),pixels(await sdk.renderAvatar(null,look,manifest)),'Slicked-back export layers must reproduce the full avatar.');
  }
}
await checkSourceSplit('assets/outer-trench.png','assets/outer-trench-front.png','assets/outer-trench-inner.png');
const neckNeutral=await raw('assets/neck-neutral.png'),neckFitted=await raw('assets/neck-base.png'),neckBox=manifest.slots.neck;
for(let y=0;y<neckBox[3];y++)for(let x=0;x<neckBox[2];x++){
  const gy=y+neckBox[1],i=(y*neckBox[2]+x)*4;
  const sourceY=gy>=350?y:gy>=228&&gy<=295?y-10:null;
  if(sourceY===null)continue;
  const j=(sourceY*neckBox[2]+x)*4;
  assert.equal(neckFitted[i+3],neckNeutral[j+3]);
  if(neckFitted[i+3])for(let c=0;c<3;c++)assert.equal(neckFitted[i+c],neckNeutral[j+c]);
}
const pantsPixels=pixels(await sdk.renderLayer('pants',rearLook,manifest)),coatPixels=pixels(await sdk.renderLayer('outer',rearLook,manifest)),facing=await raw('assets/outer-trench-inner.png');
const hemReference=sdk.makeCanvas(manifest);
for(const part of rearStack.slice(0,4))hemReference.getContext('2d').drawImage(part.canvas,0,0);
const hemExpected=pixels(hemReference);
let hemChecks=0;const hemSides=[0,0];
for(let y=980;y<1190;y++)for(let x=249;x<724;x++){
  const i=(y*manifest.width+x)*4,j=((y-274)*475+x-249)*4;
  if(facing[j+3]>230&&pantsPixels[i+3]>250&&coatPixels[i+3]<2){
    hemChecks++;hemSides[x<480?0:1]++;
    // The source trousers retain 252–254 alpha in their cloth. Compare to the
    // actual rear-under-trousers composite, including that slight transparency.
    for(let c=0;c<4;c++)assert(Math.abs(withPixels[i+c]-hemExpected[i+c])<=2,'Inner trench facing painted in front of a trouser leg.');
  }
}
assert(hemSides.every(count=>count>500),'Check both extracted inner facings where they overlap the trousers.');
console.log(`PASS: 5 presets, slicked-back hair in all 5 outfits, 20 garment combinations, 12 export layers, three hair/coat split preservation, ${hemChecks} leg-over-facing pixels, anchored neck registration, centered curved turtleneck rim in front of skin, unchanged shirt outside neck patch, rear occlusion/link/unlink, ${exposedRear} exposed rear pixels, collar alpha preservation, independent calibration, ${exposed} filled open-collar pixels, right-facing shoulders.`);
