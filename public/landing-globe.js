(() => {
  "use strict";
  const canvas = document.getElementById("landing-traffic-globe");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return; // Copy and CTAs remain usable without canvas.
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = matchMedia("(max-width: 767px)");
  // Same 256×128 geographic land mask as the existing bundled COBE renderer.
  // White = land, black = ocean; no photo texture or network dependency.
  const landMask = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAACAAQAAAADMzoqnAAAAAXNSR0IArs4c6QAABA5JREFUeNrV179uHEUAx/Hf3JpbF+E2VASBsmVKTBcpKJs3SMEDcDwBiVJAAewYEBUivIHT0uUBIt0YCovKD0CRjUC4QfHYh8hYXu+P25vZ2Zm9c66gMd/GJ/tz82d3bk8GN4SrByYF2366FNTACIAkivVAAazQdnf3MvAlbNUQfOPAdQDvSAimMWhwy4I2g4SU+Kp04ISLpPBAKLxPyic3O/CCi+Y7rUJbiodcpDOFY7CgxCEXmdYD2EYK2s5lApOx5pEDDYCUwM1XdJUwBV11QQMg59kePSCaPAASQMEL2hwo6TJFgxpg+TgC2ymXPbuvc40awr3D1QCFfbH9kcoqAOkZozpQo0aqAGQRKCog/+tjkgbNFEtg2FffBvBGlSxHoAaAa1u6X4PBAwDiR8FFsrQgeUhfJTSALaB9jy5NCybJPn1SVFiWk7ywN+KzhH1aKAuydhGkbEF4lWohLXDXavlyFgHY7LBnLRdlAP6BS5Cc8RfVDXbkwN/oIvmY+6obbNeBP0JwTuMGu9gTzy1Q4RS/cWpfzszeYwd+CAFrtBW/Hur0gLbJGlD+/OjVwe/drfBxkbbg63dndEDfiEBlAd7ac0BPe1D6Jd8dfbLH+RI0OzseFB5s01/M+gMdAeluLOCAuaUA9Lezo/vSgXoCX9rtEiXnp7Q1W/CNyWcd8DXoS6jH/YZ5vAJEWY2dXFQe2TUgaFaNejCzJ98g6HnlVrsE58sDcYqg+9XY75fPqdoh/kRQWiXKg8MWlJQxUFMPjqnyujhFBE7UxIMjyszk0QwQlFsezImsyvUYYYVED2pk6m0Tg8T04Fwjk2kdAwSACqlM6gRRt3vQYAFGX0Ah7Ebx1H+MDRI5ui0QldH4j7FGcm90XdxD2Jg1AOEAVAKhEFXSn4cKUELurIAKwJ3MArypPscQaLhJFICJ0ohjDySAdH8AhDtCiTuMycH8CXzhH9jUACAO5uMhoAwA5i+T6WAKmmAqnLy80wxHqIPFYpqCwxGaYLt4Dyievg5kEoVEUAhs6pqKgFtDQYOuaXypaWKQfIuwwoGSZgfLsu/XAtI8cGN+h7Cc1A5oLOMhwlIPXuhu48AIvsSBkvtV9wsJRKCyYLfq5lTrQMFd1a262oqBck9K1V0YjQg0iEYYgpS1A9GlXQV5cykwm4A7BzVsxQqo7E+zCegO7Ma7yKgsuOcfKbMBwLC8wvVNYDsANYalEpOAa6zpWjTeMKGwEwC1CiQewJc5EKfgy7GmRAZA4vUVGwE2dPM/g0xuAInE/yG5aZ8ISxWGfYigUVbdyBElTHh2uCwGdfCkOLGgQVBh3Ewp+/QK4CDlR5Ws/Zf7yhCf8pH7vinWAvoVCQ6zz0NX5V/6GkAVV+2/5qsJ/gU8bsxpM8IeAQAAAABJRU5ErkJggg==";
  const image = new Image();
  const TAU = Math.PI * 2;
  const rad = Math.PI / 180;
  const locations = [
    [50.1, 8.7], [40.7, -74], [51.5, -0.1], [1.35, 103.8],
    [52.4, 4.9], [35.7, 139.7], [-23.6, -46.6], [-33.9, 18.4],
    [19.1, 72.9], [37.8, -122.4], [-33.9, 151.2],
  ];
  const pairs = [[0, 1], [2, 3], [4, 5], [0, 7], [1, 6], [7, 8], [5, 10], [9, 4]];
  let points = [];
  let pixels;
  let width = 1, height = 1, radius = 1, cx = 0, cy = 0;
  let frame = 0, lastFrame = 0, elapsed = 0;
  let visible = true, disposed = false;

  function vector(lat, lon) {
    const c = Math.cos(lat);
    return [c * Math.sin(lon), Math.sin(lat), c * Math.cos(lon)];
  }

  // Equal-area sampling retains continent silhouettes without polar clusters.
  function sampleLand() {
    const count = mobile.matches ? 8500 : 19000;
    points = [];
    for (let i = 0; i < count; i += 1) {
      const lat = Math.asin(1 - 2 * (i + 0.5) / count);
      const lon = ((i * Math.PI * (3 - Math.sqrt(5))) % TAU) - Math.PI;
      const u = Math.min(255, Math.floor((lon / TAU + 0.5) * 256));
      const v = Math.min(127, Math.floor((0.5 - lat / Math.PI) * 128));
      if (pixels[(v * 256 + u) * 4] > 127) points.push(vector(lat, lon));
    }
  }

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    width = Math.max(1, box.width);
    height = Math.max(1, box.height);
    const dpr = Math.min(devicePixelRatio || 1, mobile.matches ? 1.25 : 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    radius = Math.min(width * (mobile.matches ? 0.85 : 0.46), height * 0.77);
    cx = width / 2;
    cy = height * (mobile.matches ? 0.94 : 0.98);
    if (pixels) sampleLand();
    render();
  }

  function project(point, rotation) {
    const x = point[0] * Math.cos(rotation) - point[2] * Math.sin(rotation);
    const z = point[0] * Math.sin(rotation) + point[2] * Math.cos(rotation);
    // Tilt toward the northern hemisphere without distorting geography.
    const y = point[1] * Math.cos(0.28) - z * Math.sin(0.28);
    const depth = point[1] * Math.sin(0.28) + z * Math.cos(0.28);
    return { x: cx + x * radius, y: cy - y * radius, z: depth };
  }

  function arc(from, to, progress) {
    const dot = Math.max(-1, Math.min(1, from.reduce((sum, val, i) => sum + val * to[i], 0)));
    const angle = Math.acos(dot);
    const denominator = Math.sin(angle) || 1;
    const a = Math.sin((1 - progress) * angle) / denominator;
    const b = Math.sin(progress * angle) / denominator;
    const lift = 1 + Math.sin(progress * Math.PI) * 0.15;
    return from.map((val, i) => (val * a + to[i] * b) * lift);
  }

  function drawConnection(pair, phase, rotation, staticMode) {
    const from = vector(...locations[pair[0]].map(v => v * rad));
    const to = vector(...locations[pair[1]].map(v => v * rad));
    const opacity = staticMode ? 0.5 : Math.min(1, phase / 0.18, (1 - phase) / 0.23) * 0.65;
    if (opacity <= 0) return;
    const head = staticMode ? 1 : Math.min(1, phase / 0.48);
    ctx.strokeStyle = `rgba(230,230,228,${opacity})`;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    let drawing = false;
    for (let i = 0; i <= 64 * head; i += 1) {
      const p = project(arc(from, to, i / 64), rotation);
      if (p.z < 0.04) { drawing = false; continue; }
      if (drawing) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
      drawing = true;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    [from, to].forEach(v => {
      const p = project(v, rotation);
      if (p.z <= 0.04) return;
      ctx.fillStyle = `rgba(245,245,242,${opacity})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, mobile.matches ? 2 : 2.6, 0, TAU);
      ctx.fill();
    });
    if (!staticMode && head < 1) {
      const p = project(arc(from, to, head), rotation);
      if (p.z > 0.04) {
        ctx.fillStyle = `rgba(255,255,255,${opacity})`;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, width, height);
    const rotation = motion.matches ? 0.12 : 0.12 + elapsed * 0.000012;
    const size = mobile.matches ? 1.1 : 1.2;
    for (const point of points) {
      const p = project(point, rotation);
      if (p.z <= 0 || p.y < 0 || p.y > height) continue;
      // Quiet limb, brighter land toward the camera. No glow or overlay box.
      const alpha = (0.08 + p.z * 0.4) * (mobile.matches ? 0.8 : 1);
      ctx.fillStyle = `rgba(205,205,201,${alpha})`;
      ctx.fillRect(p.x, p.y, size, size);
    }
    for (let slot = 0; slot < 2; slot += 1) {
      const cycle = elapsed / 14000 + slot * 0.5;
      const pair = pairs[(Math.floor(cycle) * 3 + slot) % pairs.length];
      drawConnection(pair, motion.matches ? 0.5 : cycle % 1, rotation, motion.matches);
    }
  }

  function tick(now) {
    frame = 0;
    if (disposed || !visible || document.hidden || motion.matches) return;
    if (now - lastFrame >= 48) { // At most ~20 fps; no per-frame DOM/layout reads.
      elapsed += lastFrame ? Math.min(100, now - lastFrame) : 0;
      lastFrame = now;
      render();
    }
    frame = requestAnimationFrame(tick);
  }

  function resume() {
    if (disposed || !pixels) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    render();
    if (visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(tick);
  }

  const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    resume();
  }) : null;
  observer?.observe(canvas.parentElement);
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(canvas.parentElement);
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", resume);
  motion.addEventListener("change", resume);
  mobile.addEventListener("change", resize);
  window.addEventListener("pagehide", () => {
    disposed = true;
    cancelAnimationFrame(frame);
    frame = 0;
  });
  window.addEventListener("pageshow", () => {
    disposed = false;
    resume();
  });
  image.onload = () => {
    const mask = document.createElement("canvas");
    mask.width = 256;
    mask.height = 128;
    const maskContext = mask.getContext("2d", { willReadFrequently: true });
    if (!maskContext) return;
    maskContext.drawImage(image, 0, 0);
    pixels = maskContext.getImageData(0, 0, 256, 128).data;
    resize();
    resume();
  };
  image.src = landMask;
})();
