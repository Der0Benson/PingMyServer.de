/* Scroll is the clock: these functions also run in Node for boundary tests. */
(() => {
  "use strict";
  const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  function state(progress) {
    const p = clamp(progress);
    return {
      progress: p,
      stage: p < .2 ? 0 : p < .4 ? 1 : p < .6 ? 2 : p < .75 ? 3 : 4,
      focus: smooth(p / .2),
      request: clamp((p - .2) / .2),
      response: clamp((p - .4) / .2),
      failure: smooth((p - .6) / .08),
      notify: clamp((p - .75) / .25),
    };
  }
  function layout(width, height) {
    const mobile = width <= 767;
    return {
      source: { x: width * (mobile ? .5 : .22), y: height * (mobile ? .43 : .55) },
      target: { x: width * (mobile ? .5 : .78), y: height * (mobile ? .65 : .55) },
      message: { x: width * (mobile ? .74 : .5), y: height * (mobile ? .54 : .43) },
      channels: mobile
        ? [{ x: width * .23, y: height * .78 }, { x: width * .77, y: height * .78 },
           { x: width * .23, y: height * .9 }, { x: width * .77, y: height * .9 }]
        : [.25, .42, .59, .76].map(x => ({ x: width * x, y: height * .83 })),
      mobile,
    };
  }
  // A shallow curved route, with the same normalized coordinates for both directions.
  function routePoint(t, from, to, mobile) {
    const bend = Math.sin(Math.PI * t);
    return {
      x: from.x + (to.x - from.x) * t + (mobile ? bend * 16 : 0),
      y: from.y + (to.y - from.y) * t - (mobile ? 0 : bend * 48),
    };
  }
  const api = { clamp, smooth, state, layout, routePoint, progress: 0, enabled: false };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined") return;
  window.PMS_CHECK_STORY = api;
  const journey = document.querySelector(".monitoring-journey");
  const story = document.querySelector(".check-story");
  const scene = document.querySelector(".journey-scene");
  if (!journey || !story || !scene) return;
  const canvas = document.getElementById("landing-traffic-globe");
  if (!canvas?.getContext("2d")) return;
  const labels = document.querySelector(".check-labels");
  const steps = Array.from(story.querySelectorAll("[data-check-step]"));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const short = window.matchMedia("(max-height: 640px)");
  let pending = 0;
  function place(name, point, opacity, offset = 22) {
    const label = labels.querySelector('[data-check-label="' + name + '"]');
    label.style.left = point.x + "px";
    label.style.top = point.y + offset + "px";
    label.style.opacity = String(opacity);
  }
  function update() {
    pending = 0;
    api.enabled = !reduced.matches && !short.matches;
    journey.classList.toggle("is-scroll-story", api.enabled);
    const box = story.getBoundingClientRect();
    const size = scene.getBoundingClientRect();
    // Begin as the story enters; complete while its last viewport is still pinned.
    api.progress = api.enabled ? clamp((size.height - box.top) / box.height) : 0;
    const s = state(api.progress);
    const geometry = layout(size.width, size.height);
    const alpha = smooth((api.progress - .1) / .1);
    labels.style.opacity = String(api.enabled ? alpha : 0);
    place("source", geometry.source, 1, -24);
    place("target", geometry.target, 1 - s.notify, 26);
    place("message", geometry.message, s.stage > 0 ? 1 : 0, 0);
    const message = labels.querySelector('[data-check-label="message"]');
    message.textContent = s.stage === 1 ? "REQUEST\nHTTP GET" : s.stage === 2 ? "200 OK\n184 ms" : "TIMEOUT";
    geometry.channels.forEach((point, i) => {
      place("channel" + i, point, smooth((s.notify - i * .12) / .5));
    });
    steps.forEach((step, index) => step.classList.toggle("is-current", index === s.stage));
    window.dispatchEvent(new CustomEvent("pms:check-progress"));
  }
  function schedule() {
    if (!pending) pending = window.requestAnimationFrame(update);
  }
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("pageshow", schedule);
  window.addEventListener("pagehide", () => {
    window.cancelAnimationFrame(pending);
    pending = 0;
  });
  reduced.addEventListener("change", schedule);
  short.addEventListener("change", schedule);
  document.fonts?.ready.then(schedule);
  if (typeof ResizeObserver === "function") new ResizeObserver(schedule).observe(journey);
  schedule();
})();
