// Pointer-count transitions only rebase; they never apply a camera/replay delta.
export class ModelGestures {
  constructor(actions) { this.actions=actions; this.points=new Map(); this.moved=0; this.multi=false; }
  geometry() {
    const points=[...this.points.values()],count=points.length;
    if(!count)return null;
    return {count,x:points.reduce((sum,p)=>sum+p.x,0)/count,y:points.reduce((sum,p)=>sum+p.y,0)/count,
      distance:count===2?Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y):0};
  }
  down(id,x,y) {
    if(!this.points.size) { this.moved=0;this.multi=false; }
    this.points.set(id,{x,y});this.multi ||= this.points.size>1;this.previous=this.geometry();
  }
  move(id,x,y) {
    if(!this.points.has(id))return;
    this.points.set(id,{x,y});const next=this.geometry(),previous=this.previous;this.previous=next;
    if(!previous||next.count!==previous.count)return;
    const dx=next.x-previous.x,dy=next.y-previous.y;this.moved+=Math.abs(dx)+Math.abs(dy);
    if(next.count===1)this.actions.orbit(dx,dy);
    if(next.count===2) {
      if(previous.distance>0&&next.distance>0)this.actions.zoom(next.distance/previous.distance);
      this.actions.pan(dx,dy);
    }
    if(next.count===3)this.actions.scrub(dx);
  }
  up(id,cancelled=false) {
    if(!this.points.has(id))return false;
    const select=!cancelled&&this.points.size===1&&!this.multi&&this.moved<8;
    this.points.delete(id);this.previous=this.geometry();return select;
  }
  clear() { this.points.clear();this.previous=null;this.multi=false;this.moved=0; }
}
