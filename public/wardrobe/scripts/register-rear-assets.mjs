/** Register generated rear sprites and a local collar edit in the shared art coordinates. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const sharp=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp') : 'sharp');
const defaultRoot=new URL('../',import.meta.url);
async function registered(source,width,height){
  const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=4)if(data[i+3]<48)data.fill(0,i,i+4);
  return sharp(data,{raw:info}).trim({threshold:1}).resize(width,height,{fit:'fill'}).ensureAlpha().raw().toBuffer();
}
export async function registerRearAssets({root=defaultRoot,formalSource,liningSource,hairSource}={}){
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
  if(hairSource)await sharp(await registered(hairSource,320,500),{raw:{width:320,height:500,channels:4}}).png().toFile(new URL('assets/hair-long-back.png',root).pathname);
  for(const file of ['top-formal-v2.png','outer-trench-lining.png','hair-long-back.png'])await fs.access(new URL('assets/'+file,root));
  const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
  const add=asset=>{const index=manifest.assets.findIndex(a=>a.id===asset.id);if(index<0)manifest.assets.push(asset);else manifest.assets[index]=asset;};
  const formal=manifest.assets.find(a=>a.id==='top-formal');
  Object.assign(formal,{file:'./assets/top-formal-v2.png',mirrorX:false});delete formal.collarFit;
  manifest.assets.find(a=>a.id==='outer-trench').backAsset='outer-trench-lining';
  const blonde=manifest.assets.find(a=>a.id==='hair-blonde');
  add({...blonde,id:'hair-blonde-long',name:'鎏金长发',backAsset:'hair-long-back',thumbBox:[305,49,320,576]});
  add({id:'hair-back-none',kind:'hair-back',name:'无后发',empty:true,box:[305,125,320,500],facing:'right-three-quarter'});
  add({id:'hair-long-back',kind:'hair-back',name:'金色长发后束',file:'./assets/hair-long-back.png',box:[305,125,320,500],facing:'right-three-quarter'});
  add({id:'outer-back-none',kind:'outer-back',name:'无后衬',empty:true,box:[302,292,366,892],facing:'right-three-quarter'});
  add({id:'outer-trench-lining',kind:'outer-back',name:'风衣后背内衬',file:'./assets/outer-trench-lining.png',box:[302,292,366,892],clipToParent:true,facing:'right-three-quarter'});
  manifest.slots['hair-back']=[305,125,320,500];manifest.slots['outer-back']=[302,292,366,892];
  Object.assign(manifest.defaults,{'hair-back':'hair-back-none','outer-back':'outer-back-none'});
  manifest.version='2026-11-02.4';
  await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
  console.log('Registered separate rear hair, trench lining and corrected formal collar.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await registerRearAssets({formalSource:process.argv[2],liningSource:process.argv[3],hairSource:process.argv[4]});
