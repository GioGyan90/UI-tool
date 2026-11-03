/** Register only the edited neck opening; retain the original shirt below it. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp') : 'sharp');
const rootDefault=new URL('../',import.meta.url);

export async function registerTurtleneckCollar({root=rootDefault}={}) {
  const {data,info}=await sharp(new URL('assets/top-turtleneck.png',root).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const source=await sharp(new URL('assets/top-turtleneck-collar-source.png',root).pathname).ensureAlpha().raw().toBuffer();
  const [left,top,width,height]=[148,0,165,115],out=Buffer.from(data);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    // Replace the opening (including its old alpha) completely, then blend only
    // at the cloth join. Never redraw the shoulders, sleeves, chest or waist.
    const weight=Math.max(0,Math.min(1,x/8,(width-1-x)/8,(height-1-y)/25));
    const i=((top+y)*info.width+left+x)*4,j=(y*width+x)*4;
    const a=data[i+3]/255,b=source[j+3]/255,mixed=a*(1-weight)+b*weight;
    // Only the opening changes the silhouette. Below the collar, retain the
    // original cloth alpha so the edited patch cannot cut holes at its sides.
    const protect=Math.max(0,Math.min(1,(y-45)/15)),alpha=mixed*(1-protect)+a*protect;
    for(let c=0;c<3;c++){
      const regular=data[i+c]*a*(1-weight)+source[j+c]*b*weight;
      const protectedColor=data[i+c]*(1-weight*b)+source[j+c]*weight*b;
      out[i+c]=alpha?Math.round((regular*(1-protect)+protectedColor*a*protect)/alpha):0;
    }
    out[i+3]=Math.round(alpha*255);
  }
  await sharp(out,{raw:info}).png().toFile(new URL('assets/top-turtleneck-v2.png',root).pathname);
  const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
  const asset=manifest.assets.find(a=>a.id==='top-turtleneck');
  Object.assign(asset,{
    file:'./assets/top-turtleneck-v2.png',sourceFile:'./assets/top-turtleneck.png',
    collarSource:{file:'./assets/top-turtleneck-collar-source.png',box:[left,top,width,height]},
  });
  // This high collar deliberately exposes only its symmetric front band.
  // Everything above the U-shaped edge is actual alpha, never a dark cavity
  // or a rear rim. The separate neck is painted behind this complete band.
  delete asset.rearCollar;
  await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
}
