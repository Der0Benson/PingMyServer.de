const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const publicDir = path.join(__dirname, "..", "public");
const source = fs.readFileSync(path.join(publicDir, "landing-globe.js"), "utf8");

function globeHarness({ reduced = false, width = 1440, contextAvailable = true } = {}) {
  const frames = new Map(), events = {}, mediaEvents = {};
  let nextFrame = 0, dots = 0, visibility;
  const context = {
    clearRect() {}, setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() {}, setLineDash() {}, arc() {}, fill() {},
    fillRect(...values) {
      assert.ok(values.every(Number.isFinite), "finite projected coordinates");
      dots++;
    },
  };
  class Canvas {
    parentElement = { getBoundingClientRect: () => ({ width, height: 900 }) };
    getContext() { return contextAvailable ? context : null; }
  }
  const canvas = new Canvas();
  const motion = { matches: reduced, addEventListener: (name, fn) => { mediaEvents[name] = fn; } };
  const document = {
    hidden: false,
    getElementById: () => canvas,
    addEventListener: (name, fn) => { events[name] = fn; },
    createElement: () => ({
      getContext: () => ({
        drawImage() {},
        // Synthetic all-land mask exercises projection, not geographic accuracy.
        getImageData: () => ({ data: new Uint8ClampedArray(256 * 128 * 4).fill(255) }),
      }),
    }),
  };
  vm.runInNewContext(source, {
    HTMLCanvasElement: Canvas,
    document,
    window: { addEventListener: (name, fn) => { events[name] = fn; } },
    matchMedia: query => query.includes("reduced") ? motion : { matches: width < 768, addEventListener() {} },
    devicePixelRatio: 3,
    Image: class { set src(value) { assert.match(value, /^data:image\/png;base64,/); this.onload(); } },
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
    IntersectionObserver: class { constructor(fn) { visibility = fn; } observe() {} },
    ResizeObserver: class { observe() {} },
  });
  return { canvas, frames, events, mediaEvents, motion, document,
    visible: value => visibility([{ isIntersecting: value }]), dots: () => dots };
}

test("hero contains only background earth, copy and two actions", () => {
  const html = fs.readFileSync(path.join(publicDir, "landing.html"), "utf8");
  const hero = html.match(/<section class="hero"[^]*?<\/section>/)[0];
  assert.equal((hero.match(/<a /g) || []).length, 2);
  assert.match(hero, /href="#so-funktioniert-es"/);
  assert.match(hero, /class="hero-earth" aria-hidden="true"/);
  assert.doesNotMatch(hero, /hero-grid|network-stage|live-readout|hero-facts|badge|<dl/);
});

test("earth renders with bounded canvas resolution on desktop, tablet and mobile", () => {
  for (const width of [1440, 1024, 390, 320]) {
    const h = globeHarness({ width });
    assert.ok(h.dots() > 0);
    assert.ok(h.canvas.width <= width * 1.5);
    assert.equal(h.frames.size, 1);
  }
});

test("reduced motion draws a static earth and supports live preference changes", () => {
  const h = globeHarness({ reduced: true });
  assert.ok(h.dots() > 0);
  assert.equal(h.frames.size, 0);
  h.motion.matches = false;
  h.mediaEvents.change();
  assert.equal(h.frames.size, 1);
  h.motion.matches = true;
  h.mediaEvents.change();
  assert.equal(h.frames.size, 0);
});

test("animation pauses offscreen, in hidden tabs and across page navigation", () => {
  const h = globeHarness();
  h.visible(false);
  assert.equal(h.frames.size, 0);
  h.visible(true);
  assert.equal(h.frames.size, 1);
  h.document.hidden = true;
  h.events.visibilitychange();
  assert.equal(h.frames.size, 0);
  h.document.hidden = false;
  h.events.visibilitychange();
  assert.equal(h.frames.size, 1);
  h.events.pagehide();
  assert.equal(h.frames.size, 0);
  h.events.pageshow();
  assert.equal(h.frames.size, 1);
});

test("missing canvas context does not prevent text and actions from loading", () => {
  assert.doesNotThrow(() => globeHarness({ contextAvailable: false }));
});
