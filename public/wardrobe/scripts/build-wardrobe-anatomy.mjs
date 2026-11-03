/** Split the existing identity without redrawing it; register a generated neck/clavicle patch. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { RIG_ALIGNMENT, fitNeckPixels } from './rig-registration.mjs';
import { registerTurtleneckCollar } from './turtleneck-collar.mjs';
const require = createRequire(import.meta.url);
const sharp = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'sharp') : 'sharp');
const rootDefault = new URL('../', import.meta.url);
const jaw = [[400,211],[425,220],[431,218],[443,238],[466,252],[489,265],[507,273],[521,275],[534,274],[544,264],[560,239]];
function jawAt(x) {
  for (let i = 1; i < jaw.length; i++) if (x <= jaw[i][0]) {
    const a = jaw[i - 1], b = jaw[i]; return a[1] + (x - a[0]) / (b[0] - a[0]) * (b[1] - a[1]);
  }
  return jaw.at(-1)[1];
}
async function saveCrop(buffer, width, height, file, origin, root) {
  let left=width, top=height, right=-1, bottom=-1;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) if(buffer[(y*width+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  const box=[origin[0]+left,origin[1]+top,right-left+1,bottom-top+1];
  await sharp(buffer,{raw:{width,height,channels:4}}).extract({left,top,width:box[2],height:box[3]}).png().toFile(new URL(file,root).pathname);
  return box;
}
export async function buildAnatomy({root=rootDefault,neckSource}={}) {
  let hasRear=false;
  try { await fs.access(new URL('assets/outer-trench-lining.png',root));hasRear=true; }catch(error){if(error.code!=='ENOENT')throw error;}
  if(hasRear){const{registerRearAssets}=await import('./register-rear-assets.mjs');await registerRearAssets({root});}
  await registerTurtleneckCollar({root});
  const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
  const original=await sharp(new URL('assets/skin.png',root).pathname).ensureAlpha().raw().toBuffer();
  const source={box:[256,93,452,859],width:452,height:859};
  const arms=Buffer.from(original), head=Buffer.from(original);
  for(let y=0;y<source.height;y++) for(let x=0;x<source.width;x++) {
    const i=(y*source.width+x)*4,gx=x+256,gy=y+93;
    if(gy<490) arms.fill(0,i,i+4);
    if(gy>jawAt(gx)+7 || gy>=400 || gx<398 || gx>562) head.fill(0,i,i+4);
  }
  const armsBox=await saveCrop(arms,452,859,'assets/skin-arms.png',[256,93],root);
  const headBox=await saveCrop(head,452,859,'assets/head-base.png',[256+RIG_ALIGNMENT.x,93+RIG_ALIGNMENT.y],root);
  const neckBox=[383,218,191,245];
  const neutralFile=new URL('assets/neck-neutral.png',root);
  if(neckSource) {
    const {data,info}=await sharp(neckSource).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(let i=0;i<data.length;i+=4) if(data[i+3]<64)data.fill(0,i,i+4);
    const neck=await sharp(data,{raw:info}).extract({left:400,top:45,width:750,height:940}).resize(neckBox[2],neckBox[3],{fit:'fill'}).raw().toBuffer();
    for(let y=0;y<neckBox[3];y++) for(let x=0;x<neckBox[2];x++) {
      const gx=x+neckBox[0],gy=y+neckBox[1],i=(y*neckBox[2]+x)*4;
      const sx=gx-256,sy=gy-93,si=(sy*452+sx)*4;
      const old=sx>=0&&sx<452&&sy>=0&&sy<400 ? original.subarray(si,si+4) : null;
      if(gy<292){
        if(old && gy>=jawAt(gx)-3) neck.set(old,i); else neck.fill(0,i,i+4);
      } else if(gy<322 && old?.[3]) {
        const mix=(322-gy)/30*old[3]/255;
        for(let c=0;c<3;c++) neck[i+c]=Math.round(old[c]*mix+neck[i+c]*(1-mix));
        neck[i+3]=Math.max(neck[i+3],Math.round(old[3]*mix));
      }
    }
    await sharp(neck,{raw:{width:neckBox[2],height:neckBox[3],channels:4}}).png().toFile(neutralFile.pathname);
  } else {
    // Retain the neutral authoring source. Rebuilding must never shorten an
    // already fitted runtime neck a second time.
    try { await fs.access(neutralFile); }
    catch(error){if(error.code!=='ENOENT')throw error;await fs.copyFile(new URL('assets/neck-base.png',root),neutralFile);}
  }
  // Keep a vertical nape before the clavicles widen. The generated patch's
  // trapezius rose above several garment shoulders and created skin spikes.
  const contour=[[275,427,529],[292,428,531],[313,428,537],[330,418,548],[350,393,571],[370,383,574],[463,383,574]];
  const registered=await sharp(neutralFile.pathname).ensureAlpha().raw().toBuffer();
  for(let y=0;y<neckBox[3];y++){
    const gy=y+neckBox[1];if(gy<contour[0][0])continue;
    const j=contour.findIndex((point,index)=>index>0&&gy<=point[0]);
    if(j<1)continue;
    const a=contour[j-1],b=contour[j],t=(gy-a[0])/(b[0]-a[0]);
    const left=a[1]+t*(b[1]-a[1]),right=a[2]+t*(b[2]-a[2]);
    for(let x=0;x<neckBox[2];x++){
      const gx=x+neckBox[0],i=(y*neckBox[2]+x)*4;
      const coverage=Math.max(0,Math.min(1,gx-left+.5,right-gx+.5));
      registered[i+3]=Math.min(registered[i+3],Math.round(coverage*255));
    }
  }
  await sharp(registered,{raw:{width:neckBox[2],height:neckBox[3],channels:4}}).png().toFile(neutralFile.pathname);
  const fitted=Buffer.from(fitNeckPixels(registered,neckBox));
  await sharp(fitted,{raw:{width:neckBox[2],height:neckBox[3],channels:4}}).png().toFile(new URL('assets/neck-base.png',root).pathname);
  manifest.version='2026-11-03.2';manifest.rigAlignment=RIG_ALIGNMENT;
  manifest.anatomySource={file:'./assets/skin.png',box:source.box};
  manifest.defaults={...manifest.defaults,body:'skin',head:'head-base',neck:'neck-base'};
  const body=manifest.assets.find(a=>a.id==='skin');
  Object.assign(body,{name:'手臂与手掌',file:'./assets/skin-arms.png',box:armsBox});
  manifest.assets=manifest.assets.filter(a=>!['head','neck'].includes(a.kind));
  manifest.assets.splice(1,0,
    {id:'head-base',kind:'head',name:'基础头部',file:'./assets/head-base.png',box:headBox},
    {id:'neck-base',kind:'neck',name:'颈部与锁骨',file:'./assets/neck-base.png',box:neckBox});
  manifest.slots.body=armsBox;manifest.slots.head=headBox;manifest.slots.neck=neckBox;
  manifest.bodyLongSleeveClips=[[245,836,125,125],[587,835,125,130]];
  // The rear bridge is the first opaque run above the neck opening. Extract its
  // actual contour, rather than cutting a horizontal strip through front lapels.
  const collars={
    'top-shirt':[150,300,70], 'top-formal':[165,285,55],
    'outer-bomber':[150,305,80],
    'outer-field':[150,290,75], 'outer-trench':[175,295,80],
    'outer-blazer':[185,290,75],
  };
  for(const asset of manifest.assets){
    asset.facing='right-three-quarter';
    delete asset.backCollar;
    if(collars[asset.id]){
      const {data,info}=await sharp(new URL(asset.file,root).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const mask=Buffer.alloc(data.length),[startX,endX,maxY]=collars[asset.id];
      for(let x=startX;x<Math.min(info.width,endX);x++){
        let y=0;while(y<maxY && data[(y*info.width+x)*4+3]<96)y++;
        const first=y;
        while(y<maxY && data[(y*info.width+x)*4+3]>=96)y++;
        if(y<maxY && y-first>=2)for(let py=first;py<y;py++)mask[(py*info.width+x)*4+3]=255;
      }
      const expanded=Buffer.from(mask);
      for(let y=0;y<maxY;y++)for(let x=Math.max(0,startX-3);x<Math.min(info.width,endX+3);x++)if(mask[(y*info.width+x)*4+3]){
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
          const px=x+dx,py=y+dy;
          if(px>=0&&px<info.width&&py>=0&&py<info.height)expanded[(py*info.width+px)*4+3]=255;
        }
      }
      const file=`./assets/${asset.id}-rear-mask.png`;
      if(asset.id==='top-formal'&&hasRear){
        // At the widened nape corner, the grey inner band is connected to the
        // front fold, so alpha alone cannot identify it as a rear surface.
        for(let x=165;x<286;x++){
          const sample=y=>data.subarray((y*info.width+x)*4,(y*info.width+x)*4+4);
          let start=0;
          for(;start<22;start++){const p=sample(start);if(p[3]>96&&Math.max(...p.subarray(0,3))-Math.min(...p.subarray(0,3))<22&&p[0]>95&&p[0]<226)break;}
          if(start>=22)continue;
          let end=start;
          for(;end<38;end++){const p=sample(end);if(p[3]<96||(p[0]>231&&p[1]>225&&p[2]>225))break;}
          if(end-start<3)continue;
          let edge=end-.25,min=Infinity;
          for(let y=Math.max(start,end-3);y<end;y++){const p=sample(y),lum=p[0]+p[1]+p[2];if(lum<min){min=lum;edge=y-.25;}}
          for(let y=0;y<end;y++)expanded[(y*info.width+x)*4+3]=Math.max(expanded[(y*info.width+x)*4+3],Math.round(Math.max(0,Math.min(1,edge-y+.5))*255));
        }
      }
      await sharp(expanded,{raw:info}).blur(.6).png().toFile(new URL(file,root).pathname);
      asset.rearCollar={file};
    }
    if(asset.id==='top-shirt')asset.mirrorX=true;
    if(asset.id==='top-formal'){
      asset.mirrorX=!hasRear;
      delete asset.collarFit;
    }
  }
  await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
  console.log('Registered separate head, neck/clavicles and arms; corrected shirt and formal top orientation.');
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) await buildAnatomy({neckSource:process.argv[2]});
