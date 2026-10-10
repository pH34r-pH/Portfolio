// Shared live/poster projection. Fitting changes the lens, not perspective pose.
const tangent = Math.tan(14 * Math.PI / 180);

export const POSTER_VIEWS = Object.freeze({
  desktop: {width:1280,height:740,spanX:10,spanY:5.8,distance:5.8/tangent,yaw:-.5,pitch:.1},
  phone: {width:500,height:280,spanX:10,spanY:5.1,distance:5.1/tangent,yaw:-.15,pitch:.38},
});
// homepage-digital.css gives the desktop stage a 280px minimum height; the
// supported phone layout starts at 320px wide. Containment scales every source
// pixel, including its inset. Reserve 12 CSS px at the smaller of those scales:
// ceil(12 / min(280/740, 320/500)) = 32 canonical pixels. Live and poster use the
// same distance and contain transform, including fractional/zoomed host sizes.
const minimumContainScale = Math.min(280 / POSTER_VIEWS.desktop.height, 320 / POSTER_VIEWS.phone.width);
export const POSTER_FIT_MARGIN = Math.ceil(12 / minimumContainScale);
export function digitalView(aspect,phone) {
  const view=POSTER_VIEWS[phone?'phone':'desktop'];
  return {...view,fov:2*Math.atan(Math.max(view.spanY,view.spanX/aspect)/(2*view.distance))*180/Math.PI};
}
export function containedDigitalView(width,height,phone) {
  const view=POSTER_VIEWS[phone?'phone':'desktop'];
  const canonical=digitalView(view.width/view.height,phone);
  const scale=Math.min(width/view.width,height/view.height);
  const tangent=Math.tan(canonical.fov*Math.PI/360)*height/(scale*view.height);
  return {...canonical,fov:2*Math.atan(tangent)*180/Math.PI,aspect:width/height,containScale:scale};
}
