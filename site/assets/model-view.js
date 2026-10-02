// Shared live/poster projection. Fitting changes the lens, not perspective pose.
const tangent = Math.tan(14 * Math.PI / 180);
export const POSTER_VIEWS = Object.freeze({
  desktop: {width:1280,height:740,spanX:10,spanY:5.8,distance:5.8/tangent,yaw:-.5,pitch:.1},
  phone: {width:500,height:280,spanX:10,spanY:5.1,distance:5.1/tangent,yaw:-.15,pitch:.38},
});
export function digitalView(aspect,phone) {
  const view=POSTER_VIEWS[phone?'phone':'desktop'];
  return {...view,fov:2*Math.atan(Math.max(view.spanY,view.spanX/aspect)/(2*view.distance))*180/Math.PI};
}
