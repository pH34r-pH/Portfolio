function spherePoints() {
  const points = [];
  for (let i = 0; i < 48; i++) {
    const y = 1 - (i / 47) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.399963;
    points.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return points;
}

function drawSphere(canvas, ctx, points, angle) {
  const w = canvas.width;
  const h = canvas.height;
  const s = Math.min(w, h) * 0.34;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--line");
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent");
  points
    .map(([x, y, z]) => [
      x * Math.cos(angle) + z * Math.sin(angle),
      y,
      -x * Math.sin(angle) + z * Math.cos(angle),
    ])
    .sort((a, b) => a[2] - b[2])
    .forEach(([x, y, z]) => {
      ctx.globalAlpha = 0.35 + (z + 1) * 0.3;
      ctx.beginPath();
      ctx.arc(w / 2 + x * s, h / 2 + y * s, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  ctx.globalAlpha = 1;
}

function setupSphere() {
  const canvas = document.querySelector("#sphere-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const points = spherePoints();
  let angle = 0.45;
  let drag = false;
  let last = 0;

  function draw() {
    drawSphere(canvas, ctx, points, angle);
  }

  function set(next) {
    angle = next;
    draw();
  }

  canvas.addEventListener("pointerdown", e => {
    drag = true;
    last = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", e => {
    if (!drag) return;
    set(angle + (e.clientX - last) * 0.012);
    last = e.clientX;
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(eventName, () => { drag = false; });
  }
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") {
      set(angle - 0.12);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      set(angle + 0.12);
      e.preventDefault();
    }
  });
  draw();
  addEventListener("resize", draw);
  new MutationObserver(draw).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-palette"],
  });
}

function setupTangentSlider() {
  const slider = document.querySelector("#tangent-slider");
  if (!slider) return;
  const out = document.querySelector("#tangent-value");
  const viz = document.querySelector("#vector-viz");
  const update = () => {
    const value = Number(slider.value);
    out.value = value + "%";
    viz.style.setProperty("--tangent", value / 100);
    viz.setAttribute("aria-label", `Vector decomposition with ${value} percent tangent component`);
  };
  slider.addEventListener("input", update);
  update();
}

function setupHorizonSlider() {
  const slider = document.querySelector("#horizon-slider");
  if (!slider) return;
  const output = document.querySelector("#horizon-value");
  const trajectory = document.querySelector("#trajectory");
  const update = () => {
    const value = Number(slider.value);
    output.value = value + (value === 1 ? " layer" : " layers");
    trajectory.style.setProperty("--task-gain", Math.pow(0.98, value));
    trajectory.style.setProperty("--nuisance-gain", Math.pow(0.7, value));
    trajectory.setAttribute(
      "aria-label",
      `Conceptual finite-horizon trajectory over ${value} ${value === 1 ? "layer" : "layers"}`,
    );
  };
  slider.addEventListener("input", update);
  update();
}

function setupDetailButtons(selector, detailSelector, dataKey, copy) {
  const detail = document.querySelector(detailSelector);
  document.querySelectorAll(selector + " button").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(selector + " button")
        .forEach(item => item.setAttribute("aria-pressed", "false"));
      button.setAttribute("aria-pressed", "true");
      const [heading, text] = copy[button.dataset[dataKey]];
      detail.innerHTML = `<strong>${heading}</strong><p>${text}</p>`;
    });
  });
}

function setupEvidenceDetails() {
  setupDetailButtons(".evidence-map", "#evidence-detail", "node", {
    geometry: ["Geometry", "Normalization constrains state to the unit hypersphere; mathematical structure narrows what kinds of change are available."],
    representation: ["Representation", "Frozen-state probes test what distinctions remain accessible in the learned state without changing the representation."],
    consumer: ["Consumer", "Native next-byte behavior tests whether the frozen model actually uses an accessible distinction. Accessibility and utilization are separate questions."],
  });
  setupDetailButtons(".architecture-flow", "#architecture-detail", "stage", {
    input: ["Tokens", "Observed input enters the frozen model. This stage defines the task evidence available to the system."],
    state: ["Hypersphere state", "The recurrent representation is frozen. Probes ask what information is present here without retraining the state."],
    consumer: ["Consumer", "The native readout converts frozen state into prediction. Small controlled repairs test utilization without changing representation."],
    prediction: ["Next byte", "The 256-way next-byte distribution is the behavioral endpoint; improvements here must be distinguished from probe-only accessibility."],
  });
  setupDetailButtons(".ledger-grid", "#ledger-detail", "ledger", {
    theorem: ["Theorem", "Constrains admissible interpretations and architectures. It does not establish empirical performance by itself."],
    probe: ["Probe", "Establishes that a distinction is accessible to a specified frozen-state readout under the benchmark. It does not prove native utilization."],
    native: ["Native consumer", "Measures behavior of the frozen model consumer at the actual prediction boundary."],
    repair: ["Controlled repair", "Tests whether a deliberately small consumer change can convert accessible state information into better prediction without changing representation."],
  });
}

function evidenceRow(metric) {
  const row = document.createElement("div");
  const label = document.createElement("span");
  const meter = document.createElement("meter");
  const strong = document.createElement("strong");
  label.textContent = metric.label;
  meter.setAttribute("aria-label", metric.label);
  meter.min = 0;
  meter.max = 0.8;
  meter.value = metric.value;
  meter.textContent = String(metric.value);
  strong.textContent = "≈" + metric.value.toFixed(3) + " " + metric.unit;
  row.append(label, meter, strong);
  return row;
}

async function loadEvidence() {
  const host = document.querySelector("#consumer-data");
  const source = document.querySelector("#consumer-source");
  if (!host) return;
  try {
    const response = await fetch("/data/atlas-evidence.json", { cache: "no-store" });
    if (!response.ok) throw new Error();
    const data = await response.json();
    const series = data.series.find(item => item.id === "revision-branch-utilization");
    host.replaceChildren(...series.metrics.map(evidenceRow));
    source.textContent = "Empirical · " + series.source.evidence.join(" · ");
  } catch {
    host.innerHTML = "<p>Evidence data unavailable.</p>";
    source.textContent = "Empirical module unavailable; no fallback value substituted.";
  }
}

setupSphere();
setupTangentSlider();
setupHorizonSlider();
setupEvidenceDetails();
loadEvidence();
