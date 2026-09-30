(() => {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const stages = ["input", "tokenization", "representation", "architecture", "consumer", "output"];

  function tokenize(text) {
    return (text.match(/\w+|[^\w\s]/g) || []).slice(0, 18);
  }

  function deterministicReply(tokens) {
    if (!tokens.length) return [];
    const words = ["signal", "moves", "through", "state", "and", "becomes", "a", "prediction", "."];
    const seed = tokens.join("").split("").reduce((n, ch) => (n + ch.charCodeAt(0)) % words.length, 0);
    return words.map((_, i) => words[(i + seed) % words.length]).slice(0, 9);
  }

  function stageIndex(focus) {
    const normalized = String(focus || "full").toLowerCase();
    const aliases = {
      "recurrent-state": "representation",
      normalization: "representation",
      readout: "consumer",
      "next-token": "output",
      full: "full",
    };
    const resolved = aliases[normalized] || normalized;
    return resolved === "full" ? -1 : Math.max(0, stages.indexOf(resolved));
  }
  function variantNodes(base, variant) {
    const kind = String(variant || "baseline").toLowerCase();
    const counts = new Map(stages.map((_, stage) => [stage, base.filter(node => node.stage === stage).length]));
    return base.map((node, index) => {
      const next = { ...node };
      const rank = base.slice(0, index).filter(candidate => candidate.stage === node.stage).length;
      const count = counts.get(node.stage) || 1;
      const fraction = count <= 1 ? .5 : rank / (count - 1);
      if (kind === "spectral" && node.stage === 2) {
        const angle = fraction * Math.PI * 2;
        next.y = Math.sin(angle) * .52;
        next.z = Math.cos(angle) * .42;
      } else if (kind === "phase-aware" && (node.stage === 2 || node.stage === 3)) {
        next.y *= .78;
        next.z = (rank % 2 ? .34 : -.34) + (fraction - .5) * .08;
      } else if (kind === "hypersphere" && (node.stage === 2 || node.stage === 3)) {
        const angle = -.72 * Math.PI + fraction * 1.44 * Math.PI;
        next.y = Math.sin(angle) * .61;
        next.z = Math.cos(angle) * .43;
      } else if (kind === "dynamic-quotient" && node.stage === 2) {
        next.y = [-.42, 0, .42][rank % 3];
        next.z = (Math.floor(rank / 3) - .5) * .22;
      } else if (kind === "geometry" && (node.stage === 2 || node.stage === 3)) {
        next.y *= 1.08;
        next.z *= 1.75;
      } else if (kind === "consumer-probe" && node.stage === 4) {
        next.x += .055;
        next.y = -.68 + fraction * 1.36;
        next.z = rank % 2 ? .32 : -.32;
      }
      return next;
    });
  }


  class Instrument {
    constructor(root) {
      this.root = root;
      this.canvas = root.querySelector(".model-canvas");
      this.input = root.querySelector("[data-model-input]");
      this.button = root.querySelector("[data-model-submit]");
      this.output = root.querySelector("[data-model-output]");
      this.rail = root.querySelector("[data-token-rail]");
      this.outputRail = root.querySelector("[data-output-rail]");
      this.focus = stageIndex(root.dataset.focus);
      this.variant = root.dataset.variant || "baseline";
      this.start = performance.now();
      this.morphStart = this.start;
      this.pulses = [];
      this.gl = null;
      this.program = null;
      this.lineBuffer = null;
      this.pointBuffer = null;
      this.baseNodes = this.buildNodes();
      this.nodes = variantNodes(this.baseNodes, this.variant);
      this.edges = this.buildEdges(this.baseNodes);
      this.frame = this.frame.bind(this);
      this.resize = this.resize.bind(this);
      this.activate = this.activate.bind(this);

      this.root.querySelectorAll("[data-stage]").forEach((el, index) => {
        if (this.focus < 0 || index === this.focus) el.classList.add("is-focus");
      });

      if (this.canvas) this.initGL();
      this.button?.addEventListener("click", this.activate);
      this.root.addEventListener("portfolio:model-focus", event => {
        this.focus = stageIndex(event.detail?.focus || "full");
        this.root.querySelectorAll("[data-stage]").forEach((el, index) => {
          el.classList.toggle("is-focus", this.focus < 0 || index === this.focus);
        });
        this.draw(performance.now());
      });
      this.input?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.activate();
        }
      });
      addEventListener("resize", this.resize, { passive: true });
      if (!reduceMotion.matches && this.gl) requestAnimationFrame(this.frame);
      else this.draw(performance.now());
    }

    buildNodes() {
      const nodes = [];
      const columns = [-.82, -.48, -.15, .16, .45, .76];
      const counts = [2, 3, 7, 8, 5, 2];
      columns.forEach((x, c) => {
        const count = counts[c];
        for (let i = 0; i < count; i++) {
          const y = count === 1 ? 0 : -.62 + (1.24 * i) / (count - 1);
          const z = Math.sin((i + 1) * (c + 1) * .91) * .22;
          nodes.push({ x, y, z, stage: Math.min(c, stages.length - 1) });
        }
      });
      return nodes;
    }

    buildEdges(nodes = this.nodes) {
      const groups = stages.map((_, stage) => nodes.map((n, i) => ({...n, i})).filter(n => n.stage === stage));
      const edges = [];
      for (let c = 0; c < groups.length - 1; c++) {
        for (const a of groups[c]) {
          const candidates = [...groups[c + 1]]
            .sort((p, q) => Math.abs(p.y - a.y) - Math.abs(q.y - a.y))
            .slice(0, c === 2 || c === 3 ? 3 : 2);
          candidates.forEach(b => edges.push([a.i, b.i]));
        }
      }
      return edges;
    }

    initGL() {
      const gl = this.canvas.getContext("webgl2", { alpha: true, antialias: true, powerPreference: "high-performance" });
      if (!gl) return;
      this.gl = gl;
      const vs = `#version 300 es
        in vec3 a_position;
        in float a_size;
        uniform float u_time;
        uniform float u_aspect;
        uniform float u_focus;
        uniform float u_mode;
        out float v_alpha;
        out float v_energy;
        void main(){
          vec3 p=a_position;
          p.y += sin(u_time*.0007 + p.x*9.0 + p.z*7.0)*.012;
          float depth=1.0 + p.z*.45;
          vec2 xy=vec2(p.x, p.y)/depth;
          xy.x/=max(.7,u_aspect);
          gl_Position=vec4(xy,0.0,1.0);
          gl_PointSize=a_size;
          float stage=floor((p.x + .94)/.31);
          float focused=(u_focus<0.0 || abs(stage-u_focus)<.6)?1.0:.28;
          v_alpha=mix(.18,focused,u_mode);
          v_energy=clamp((a_size-3.0)/25.0,.15,1.0);
        }`;
      const fs = `#version 300 es
        precision highp float;
        in float v_alpha;
        in float v_energy;
        uniform vec3 u_color;
        uniform float u_points;
        out vec4 outColor;
        void main(){
          float a=v_alpha;
          if(u_points>0.5){
            vec2 q=gl_PointCoord-.5;
            float d=length(q);
            if(d>.5) discard;
            a*=smoothstep(.5,.08,d)*mix(.35,1.0,v_energy);
          }
          outColor=vec4(u_color,a);
        }`;
      const compile = (type, src) => {
        const shader = gl.createShader(type); gl.shaderSource(shader, src); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
      };
      try {
        const program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        this.program = program;
        this.position = gl.getAttribLocation(program, "a_position");
        this.size = gl.getAttribLocation(program, "a_size");
        this.uTime = gl.getUniformLocation(program, "u_time");
        this.uAspect = gl.getUniformLocation(program, "u_aspect");
        this.uFocus = gl.getUniformLocation(program, "u_focus");
        this.uMode = gl.getUniformLocation(program, "u_mode");
        this.uColor = gl.getUniformLocation(program, "u_color");
        this.uPoints = gl.getUniformLocation(program, "u_points");
        this.lineBuffer = gl.createBuffer();
        this.pointBuffer = gl.createBuffer();
        this.root.classList.add("webgl-ready");
        this.resize();
      } catch (error) {
        console.warn("Model instrument WebGL fallback:", error);
        this.gl = null;
      }
    }

    resize() {
      if (!this.gl) return;
      const rect = this.canvas.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * ratio));
      const h = Math.max(1, Math.round(rect.height * ratio));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w; this.canvas.height = h;
        this.gl.viewport(0, 0, w, h);
      }
      this.draw(performance.now());
    }

    activate() {
      const tokens = tokenize(this.input?.value || "");
      if (!tokens.length) return;
      this.rail?.replaceChildren(...tokens.map((token, index) => {
        const el = document.createElement("span");
        el.className = "token-chip";
        el.style.animationDelay = `${index * 34}ms`;
        el.textContent = token;
        return el;
      }));
      const now = performance.now();
      this.pulses = tokens.map((_, i) => ({
        start: now + i * 95,
        duration: 1050 + i * 22,
        edge: i % Math.max(1, this.edges.length),
        intensity: .65 + ((i * 37) % 35) / 100,
      }));
      const reply = deterministicReply(tokens);
      if (this.outputRail) this.outputRail.replaceChildren();
      if (this.output) {
        this.output.textContent = "";
        reply.forEach((token, i) => setTimeout(() => {
          this.output.textContent += (i && /^[\w]/.test(token) ? " " : "") + token;
          if (this.outputRail) {
            const chip = document.createElement("span");
            chip.className = "output-chip";
            chip.textContent = token;
            this.outputRail.append(chip);
          }
        }, reduceMotion.matches ? 0 : 690 + i * 95));
      }
      if (reduceMotion.matches) this.draw(now + 600);
    }

    nodePosition(index, now) {
      const target = this.nodes[index];
      const base = this.baseNodes[index] || target;
      if (!target) return base;
      const raw = reduceMotion.matches ? 1 : Math.max(0, Math.min(1, (now - this.morphStart) / 920));
      const t = raw * raw * (3 - 2 * raw);
      return {
        x: base.x + (target.x - base.x) * t,
        y: base.y + (target.y - base.y) * t,
        z: base.z + (target.z - base.z) * t,
        stage: target.stage,
      };
    }

    pointForPulse(pulse, now) {
      const edge = this.edges[pulse.edge];
      if (!edge) return null;
      const t = Math.max(0, Math.min(1, (now - pulse.start) / pulse.duration));
      if (t <= 0 || t >= 1) return null;
      const a = this.nodePosition(edge[0], now), b = this.nodePosition(edge[1], now);
      const eased = t * t * (3 - 2 * t);
      return {
        x: a.x + (b.x - a.x) * eased,
        y: a.y + (b.y - a.y) * eased,
        z: a.z + (b.z - a.z) * eased,
        size: 12 + pulse.intensity * 16,
      };
    }

    draw(now) {
      const gl = this.gl;
      if (!gl || !this.program) return;
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(this.program);
      gl.uniform1f(this.uTime, now);
      gl.uniform1f(this.uAspect, this.canvas.width / Math.max(1, this.canvas.height));
      gl.uniform1f(this.uFocus, this.focus);

      const css = getComputedStyle(this.root);
      const hex = css.getPropertyValue("--blue-hot").trim() || "#1784ff";
      const rgb = hex.match(/[0-9a-f]{2}/gi)?.map(v => parseInt(v,16)/255) || [0.09,.52,1];
      gl.uniform3f(this.uColor, rgb[0], rgb[1], rgb[2]);

      const lineData = [];
      this.edges.forEach(([ai, bi]) => {
        const a=this.nodePosition(ai, now), b=this.nodePosition(bi, now);
        lineData.push(a.x,a.y,a.z,1,b.x,b.y,b.z,1);
      });
      gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(lineData),gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this.position);
      gl.vertexAttribPointer(this.position,3,gl.FLOAT,false,16,0);
      gl.enableVertexAttribArray(this.size);
      gl.vertexAttribPointer(this.size,1,gl.FLOAT,false,16,12);
      gl.uniform1f(this.uMode,1); gl.uniform1f(this.uPoints,0);
      gl.drawArrays(gl.LINES,0,lineData.length/4);

      const points = this.nodes.map((n, index) => {
        const p = this.nodePosition(index, now);
        return [p.x,p.y,p.z, n.stage===this.focus || this.focus<0 ? 6.5 : 4];
      }).flat();
      this.pulses.map(p=>this.pointForPulse(p,now)).filter(Boolean).forEach(p=>points.push(p.x,p.y,p.z,p.size));
      gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(this.position,3,gl.FLOAT,false,16,0);
      gl.vertexAttribPointer(this.size,1,gl.FLOAT,false,16,12);
      gl.uniform1f(this.uPoints,1);
      gl.drawArrays(gl.POINTS,0,points.length/4);
    }

    frame(now) {
      this.draw(now);
      if (!reduceMotion.matches) requestAnimationFrame(this.frame);
    }
  }

  function init() {
    document.querySelectorAll("[data-model-lab]").forEach(root => new Instrument(root));
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", init, { once:true });
  else init();
})();