(() => {
  "use strict";

  const canvas = document.getElementById("landing-traffic-globe");
  const wrap = canvas instanceof HTMLCanvasElement ? canvas.parentElement : null;
  if (!(canvas instanceof HTMLCanvasElement) || !(wrap instanceof HTMLElement)) return;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    canvas.classList.add("is-fallback");
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const smallScreen = window.matchMedia("(max-width: 767px)").matches;
  const pointCount = smallScreen ? 92 : 164;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const connections = [];
  const points = Array.from({ length: pointCount }, (_, index) => {
    const y = 1 - (index / (pointCount - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * index;
    const seed = Math.sin((index + 1) * 183.13) * 43758.5453;
    const random = seed - Math.floor(seed);
    return {
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
      scatterX: random * 2.8 - 1.4,
      scatterY: ((random * 7.31) % 1) * 2.8 - 1.4,
      scatterZ: ((random * 13.17) % 1) * 2 - 1,
    };
  });

  for (let index = 0; index < pointCount; index += 1) {
    connections.push([index, (index + 8) % pointCount]);
    if (index % 4 === 0) connections.push([index, (index + 13) % pointCount]);
  }

  let width = 1;
  let height = 1;
  let dpr = 1;
  let frame = 0;
  let stage = 0;
  let visible = true;
  const startedAt = performance.now();
  let lastDrawAt = 0;

  function resize() {
    const rect = wrap.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function easeOutQuart(value) {
    return 1 - Math.pow(1 - value, 4);
  }

  function projectedPoints(now) {
    const intro = reducedMotion ? 1 : Math.min(1, Math.max(0, (now - startedAt - 120) / 1350));
    const formation = easeOutQuart(intro);
    const rotation = reducedMotion ? -0.38 : -0.38 + Math.max(0, now - startedAt - 1250) * 0.000025;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const radius = Math.min(width, height) * (smallScreen ? 0.35 : 0.385);

    return points.map((point) => {
      const x = point.scatterX + (point.x - point.scatterX) * formation;
      const y = point.scatterY + (point.y - point.scatterY) * formation;
      const z = point.scatterZ + (point.z - point.scatterZ) * formation;
      const rotatedX = x * cos - z * sin;
      const rotatedZ = x * sin + z * cos;
      const depth = 0.7 + (rotatedZ + 1) * 0.15;
      return {
        x: width / 2 + rotatedX * radius * depth,
        y: height / 2 + y * radius * depth,
        z: rotatedZ,
        alpha: 0.22 + Math.max(0, rotatedZ + 0.25) * 0.42,
      };
    });
  }

  function drawRoute(activeStage) {
    const center = { x: width * 0.5, y: height * 0.43 };
    const probe = { x: width * 0.31, y: height * 0.51 };
    const target = { x: width * 0.71, y: height * 0.56 };
    const alert = { x: width * 0.28, y: height * 0.76 };
    const route = [center, probe, target, center, alert];
    const activeSegments = Math.max(0, Math.min(4, activeStage));

    context.save();
    context.lineWidth = 1.25;
    context.strokeStyle = "rgba(255,255,255,.18)";
    context.setLineDash([3, 7]);
    for (let index = 0; index < route.length - 1; index += 1) {
      context.beginPath();
      context.moveTo(route[index].x, route[index].y);
      context.lineTo(route[index + 1].x, route[index + 1].y);
      context.stroke();
    }
    context.setLineDash([]);
    for (let index = 0; index < activeSegments; index += 1) {
      context.strokeStyle = "rgba(255,255,255,.88)";
      context.beginPath();
      context.moveTo(route[index].x, route[index].y);
      context.lineTo(route[index + 1].x, route[index + 1].y);
      context.stroke();
    }
    route.forEach((point, index) => {
      const active = index <= activeSegments;
      context.fillStyle = active ? "#ffffff" : "rgba(255,255,255,.32)";
      context.beginPath();
      context.arc(point.x, point.y, active ? 3.1 : 2.1, 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }

  function draw(now) {
    frame = 0;
    if (!visible || document.hidden) return;
    if (!reducedMotion && now - lastDrawAt < 38) {
      frame = window.requestAnimationFrame(draw);
      return;
    }
    lastDrawAt = now;
    context.clearRect(0, 0, width, height);
    const projected = projectedPoints(now);

    context.lineWidth = 0.65;
    connections.forEach(([from, to]) => {
      const a = projected[from];
      const b = projected[to];
      if (!a || !b || a.z < -0.34 || b.z < -0.34) return;
      context.strokeStyle = `rgba(255,255,255,${Math.min(a.alpha, b.alpha) * 0.2})`;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    });
    projected.slice().sort((a, b) => a.z - b.z).forEach((point) => {
      const size = point.z > 0.25 ? 1.45 : 0.9;
      context.fillStyle = `rgba(255,255,255,${Math.min(0.9, point.alpha)})`;
      context.beginPath();
      context.arc(point.x, point.y, size, 0, Math.PI * 2);
      context.fill();
    });
    drawRoute(stage);
    if (!reducedMotion) frame = window.requestAnimationFrame(draw);
  }

  function start() {
    if (frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(draw);
  }

  function stop() {
    if (!frame) return;
    window.cancelAnimationFrame(frame);
    frame = 0;
  }

  const visibilityObserver = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(([entry]) => {
        visible = !!entry?.isIntersecting;
        if (visible) start();
        else stop();
      }, { rootMargin: "160px" })
    : null;

  if (visibilityObserver) visibilityObserver.observe(wrap);
  window.addEventListener("resize", () => {
    resize();
    if (reducedMotion) draw(performance.now());
  }, { passive: true });
  window.addEventListener("pms:story-stage", (event) => {
    stage = Number(event.detail?.stage || 0);
    if (reducedMotion) draw(performance.now());
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });
  window.addEventListener("pagehide", () => {
    stop();
    visibilityObserver?.disconnect();
  }, { once: true });

  resize();
  start();
})();
