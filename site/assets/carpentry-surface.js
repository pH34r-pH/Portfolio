const make = (className) => {
  const canvas = document.createElement("canvas");
  canvas.className = className;
  canvas.setAttribute("aria-hidden", "true");
  return canvas;
};

export class CarpentrySurface {
  constructor(node, frame, seed) {
    Object.assign(this, { node, frame, seed });
    this.canvas = make("carpentry-solid");
    this.press = 0;
    this.velocity = 0;
    this.target = 0;
    this.hover = false;
    this.light = { x: 0, y: 0 };
    this.selected = false;
    this.dirty = true;
    this.rail = frame ? (node.matches(".digital-pane") ? 14 : 7) : 0;
    this.mount();
    this.resize = new ResizeObserver(() => {
      this.dirty = true;
      this.wake?.();
    });
    this.resize.observe(node);
  }
  mount() {
    if (this.frame) {
      if (!this.node.contains(this.canvas)) this.node.append(this.canvas);
      this.node.dataset.carpentryFrame = "";
      return;
    }
    if (this.node.contains(this.canvas) && this.node.contains(this.label)) return;
    this.canvas.remove();
    this.label = document.createElement("span");
    this.label.className = "carpentry-label";
    this.label.append(...this.node.childNodes);
    this.node.append(this.canvas, this.label);
    this.node.dataset.carpentryControl = "";
    this.node.classList.add("carpentry-control");
    this.dirty = true;
  }
  layout() {
    const bounds = this.node.getBoundingClientRect();
    this.visible = bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < innerHeight;
    if (!this.visible) {
      this.canvas.style.width = this.canvas.style.height = "0px";
      return false;
    }
    this.rect = { width: this.node.offsetWidth, height: this.node.offsetHeight };
    const start = this.frame ? Math.max(0, -bounds.top - 12) : 0;
    this.crop = this.frame
      ? { x: 0, y: start, width: this.rect.width, height: Math.min(this.rect.height - start, innerHeight + 24) }
      : { x: -6, y: -6, width: this.rect.width + 12, height: this.rect.height + 12 };
    this.canvas.style.cssText = `left:${this.crop.x}px;top:${this.crop.y}px;width:${this.crop.width}px;height:${this.crop.height}px`;
    return true;
  }
  step(seconds, quiet) {
    this.selected = this.node.getAttribute("aria-pressed") === "true";
    const desired = this.target || (this.selected ? 0.22 : 0);
    if (quiet) {
      this.press = desired;
      this.velocity = 0;
    } else {
      this.velocity += (desired - this.press) * 380 * seconds;
      this.velocity *= Math.exp(-29 * seconds);
      this.press += this.velocity * seconds;
    }
    const moving = Math.abs(desired - this.press) > 0.002 || Math.abs(this.velocity) > 0.002;
    if (!moving) {
      this.press = desired;
      this.velocity = 0;
    }
    this.node.style.setProperty("--carpentry-travel", this.press.toFixed(4));
    return moving;
  }
  dispose() {
    this.resize.disconnect();
    this.canvas.remove();
    if (this.label?.isConnected) this.label.replaceWith(...this.label.childNodes);
    delete this.node.dataset.carpentryControl;
    delete this.node.dataset.carpentryFrame;
    this.node.classList.remove("carpentry-control");
  }
}
