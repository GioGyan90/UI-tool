/** Split original short hair and inner coat facings; register the retained back sheet and collar edit. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {RIG_ALIGNMENT} from './rig-registration.mjs';
const require=createRequire(import.meta.url);
const sharp=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp') : 'sharp');
const defaultRoot=new URL('../',import.meta.url);
async function registered(source,width,height){
  const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=4)if(data[i+3]<48)data.fill(0,i,i+4);
  return sharp(data,{raw:info}).trim({threshold:1}).resize(width,height,{fit:'fill'}).ensureAlpha().raw().toBuffer();
}
function partition(source,mask){
  const front=Buffer.from(source),back=Buffer.from(source);
  for(let i=0;i<source.length;i+=4){
    const a=source[i+3]/255,m=mask[i+3]/255,fa=a*(1-m),ba=fa<1?(a-fa)/(1-fa):0;
    front[i+3]=Math.round(fa*255);back[i+3]=Math.round(ba*255);
  }
  return{front,back};
}
export async function registerRearAssets({root=defaultRoot,formalSource,liningSource}={}){
  if(formalSource){
    const old=await sharp(new URL('assets/top-formal.png',root).pathname).flop().ensureAlpha().raw().toBuffer();
    const edit=await registered(formalSource,452,581),fitted=Buffer.from(edit),out=Buffer.from(old);
    // Register the rear/left half of the new collar to the actual nape at x=428.
    // The tie center and lower vest remain fixed while the left neck opening widens.
    for(let y=0;y<115;y++)for(let x=148;x<233;x++){
      const stretch=1+.45*(1-y/115),sx=233+(x-233)/stretch,x0=Math.floor(sx),t=sx-x0;
      const a=(y*452+x0)*4,b=a+4,i=(y*452+x)*4,alpha=edit[a+3]*(1-t)+edit[b+3]*t;
      for(let c=0;c<3;c++)fitted[i+c]=alpha?Math.round((edit[a+c]*edit[a+3]*(1-t)+edit[b+c]*edit[b+3]*t)/alpha):0;
      fitted[i+3]=Math.round(alpha);
    }
    // Preserve the original sleeves, vest, waist and pose; replace only the generated collar patch.
    for(let y=0;y<125;y++)for(let x=148;x<310;x++){
      const i=(y*452+x)*4,m=Math.max(0,Math.min(1,(x-148)/8,(310-x)/8,(125-y)/12));
      const a=old[i+3]/255,b=fitted[i+3]/255,alpha=a*(1-m)+b*m;
      for(let c=0;c<3;c++)out[i+c]=alpha ? Math.round((old[i+c]*a*(1-m)+fitted[i+c]*b*m)/alpha) : 0;
      out[i+3]=Math.round(alpha*255);
    }
    await sharp(out,{raw:{width:452,height:581,channels:4}}).png().toFile(new URL('assets/top-formal-v2.png',root).pathname);
  }
  if(liningSource)await sharp(await registered(liningSource,366,892),{raw:{width:366,height:892,channels:4}}).png().toFile(new URL('assets/outer-trench-lining.png',root).pathname);
  for(const file of ['top-formal-v2.png','outer-trench-lining.png'])await fs.access(new URL('assets/'+file,root));
  const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
  manifest.assets=manifest.assets.filter(a=>!['hair-blonde-long','hair-long-back'].includes(a.id));
  const add=asset=>{const index=manifest.assets.findIndex(a=>a.id===asset.id);if(index<0)manifest.assets.push(asset);else manifest.assets[index]=asset;};
  const formal=manifest.assets.find(a=>a.id==='top-formal');
  Object.assign(formal,{file:'./assets/top-formal-v2.png',mirrorX:false});delete formal.collarFit;
  const skin=await sharp(new URL('assets/skin.png',root).pathname).ensureAlpha().raw().toBuffer();
  const hairSources=[['hair-black',[373,53,219,228],'黑色原发型后发'],['hair-blonde',[369,49,229,239],'金色原发型后发']];
  for(const[id,box,name]of hairSources){
    const sourceFile=`./assets/${id}.png`,{data,info}=await sharp(new URL(sourceFile,root).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const pathData=`M365 100 C388 80 417 70 441 75 C443 113 428 150 420 178 C419 206 429 231 441 255 L443 296 H360 Z M563 169 C588 185 599 220 574 257 L550 296 H606 V160 Z`;
    const mask=await sharp(Buffer.from(`<svg width="${info.width}" height="${info.height}" viewBox="${box.join(' ')}"><path d="${pathData}" fill="white"/></svg>`)).ensureAlpha().raw().toBuffer();
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
      const gx=x+box[0],gy=y+box[1],i=(y*info.width+x)*4,sx=gx-256,sy=gy-93;
      const headAlpha=sx>=0&&sx<452&&sy>=0&&sy<859?skin[(sy*452+sx)*4+3]/255:0;
      const nape=Math.max(0,Math.min(1,(gy-215)/20));
      mask[i+3]=Math.round(mask[i+3]*(1-headAlpha*(1-nape)));
    }
    const pieces=partition(data,mask);
    for(const[part,pixels]of Object.entries(pieces))await sharp(pixels,{raw:info}).png().toFile(new URL(`assets/${id}-${part}.png`,root).pathname);
    const aligned=[box[0]+RIG_ALIGNMENT.x,box[1]+RIG_ALIGNMENT.y,box[2],box[3]],asset=manifest.assets.find(a=>a.id===id);
    Object.assign(asset,{file:`./assets/${id}-front.png`,sourceFile,box:aligned,backAsset:`${id}-back`});delete asset.thumbBox;
    add({id:`${id}-back`,kind:'hair-back',name,file:`./assets/${id}-back.png`,box:aligned,sourceFile,facing:'right-three-quarter'});
  }
  // The two dark lower facings are inner surfaces. Partition the ORIGINAL coat
  // along its seams, then put those same pixels in the rear, ahead of the back sheet.
  const coat=await sharp(new URL('assets/outer-trench.png',root).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const hemPath='M121 493 C116 557 101 628 87 701 C76 755 69 821 65 879 L66 920 H230 V493 Z M314 520 C319 541 326 571 337 622 C350 704 366 791 377 881 L377 920 H260 V520 Z';
  const hemMask=await sharp(Buffer.from(`<svg width="475" height="920"><path d="${hemPath}" fill="white"/></svg>`)).ensureAlpha().raw().toBuffer();
  const coatPieces=partition(coat.data,hemMask);
  await sharp(coatPieces.front,{raw:coat.info}).png().toFile(new URL('assets/outer-trench-front.png',root).pathname);
  await sharp(coatPieces.back,{raw:coat.info}).png().toFile(new URL('assets/outer-trench-inner.png',root).pathname);
  await sharp(hemMask,{raw:coat.info}).png().toFile(new URL('assets/outer-trench-facing-mask.png',root).pathname);
  const inner=await sharp(coatPieces.back,{raw:coat.info}).png().toBuffer();
  await sharp({create:{width:475,height:920,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:new URL('assets/outer-trench-lining.png',root).pathname,left:53,top:18},{input:inner,left:0,top:0}]).png().toFile(new URL('assets/outer-trench-back.png',root).pathname);
  Object.assign(manifest.assets.find(a=>a.id==='outer-trench'),{file:'./assets/outer-trench-front.png',sourceFile:'./assets/outer-trench.png',innerFile:'./assets/outer-trench-inner.png',facingMask:'./assets/outer-trench-facing-mask.png',backAsset:'outer-trench-lining'});
  manifest.slots.hair=[365+RIG_ALIGNMENT.x,45+RIG_ALIGNMENT.y,240,250];
  add({id:'hair-back-none',kind:'hair-back',name:'无后发',empty:true,box:manifest.slots.hair,facing:'right-three-quarter'});
  add({id:'outer-back-none',kind:'outer-back',name:'无后衬',empty:true,box:[249,274,475,920],facing:'right-three-quarter'});
  add({id:'outer-trench-lining',kind:'outer-back',name:'风衣内侧与后衬',file:'./assets/outer-trench-back.png',box:[249,274,475,920],clipToParent:true,facing:'right-three-quarter'});
  manifest.slots['hair-back']=manifest.slots.hair;manifest.slots['outer-back']=[249,274,475,920];
  Object.assign(manifest.defaults,{'hair-back':'hair-back-none','outer-back':'outer-back-none'});
  manifest.version='2026-11-03.1';manifest.rigAlignment=RIG_ALIGNMENT;
  await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
  console.log('Split both original short hairstyles and trench inner facings; registered rear pieces.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await registerRearAssets({formalSource:process.argv[2],liningSource:process.argv[3]});
