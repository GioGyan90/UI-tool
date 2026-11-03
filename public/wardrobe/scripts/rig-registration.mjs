/** Shared authoring anchors: move the head as one unit and keep the neck's torso end fixed. */
export const RIG_ALIGNMENT = {x:0,y:10,neckJoinY:285,torsoY:350};

export function fitNeckPixels(source, box, alignment = RIG_ALIGNMENT) {
  const [left,top,width,height]=box,{x:dx,y:dy,neckJoinY,torsoY}=alignment;
  const output=new Uint8Array(source.length),span=torsoY-neckJoinY,slope=1-dy/span;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const gy=top+y;
    const sy=gy<=neckJoinY+dy?gy-dy:gy<torsoY?(gy-dy*torsoY/span)/slope:gy;
    const weight=Math.max(0,Math.min(1,(torsoY-sy)/span)),sx=left+x-dx*weight;
    const px=sx-left,py=sy-top,x0=Math.floor(px),y0=Math.floor(py),fx=px-x0,fy=py-y0,i=(y*width+x)*4;
    let alpha=0;const rgb=[0,0,0];
    for(const[ox,oy,w]of[[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]){
      const cx=x0+ox,cy=y0+oy;if(cx<0||cx>=width||cy<0||cy>=height)continue;
      const j=(cy*width+cx)*4,a=source[j+3]*w;alpha+=a;
      for(let c=0;c<3;c++)rgb[c]+=source[j+c]*a;
    }
    output[i+3]=Math.round(alpha);for(let c=0;c<3;c++)output[i+c]=alpha?Math.round(rgb[c]/alpha):0;
  }
  return output;
}
