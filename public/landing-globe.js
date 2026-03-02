(() => {
  const canvas = document.getElementById("landing-traffic-globe");
  const globeWrap = canvas instanceof HTMLCanvasElement ? canvas.closest(".landing-traffic-globe-wrap") : null;

  if (!(canvas instanceof HTMLCanvasElement) || !(globeWrap instanceof HTMLElement)) {
    return;
  }

  let globeInstance = null;

  function renderWidth(devicePixelRatio) {
    return Math.max(1, Math.round(globeWrap.clientWidth * devicePixelRatio));
  }

  function renderHeight(devicePixelRatio) {
    return Math.max(1, Math.round(globeWrap.clientHeight * devicePixelRatio));
  }

  async function initGlobe() {
    if (typeof window.WebGLRenderingContext !== "function") {
      return;
    }

    try {
      const cobeModule = await import("/assets/vendor/cobe.esm.js");
      const createGlobe = cobeModule && cobeModule.default;

      if (typeof createGlobe !== "function") {
        return;
      }

      const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const phi = 1.08;
      const theta = 0.24;

      globeInstance = createGlobe(canvas, {
        devicePixelRatio,
        width: renderWidth(devicePixelRatio),
        height: renderHeight(devicePixelRatio),
        phi,
        theta,
        dark: 1,
        diffuse: 1.15,
        mapSamples: 22000,
        mapBrightness: 5.8,
        mapBaseBrightness: 0.09,
        baseColor: [0.03, 0.12, 0.2],
        markerColor: [0.298, 0.788, 0.941],
        glowColor: [0.16, 0.62, 0.9],
        scale: 1.04,
        offset: [0, 0.02],
        opacity: 1,
        markers: [],
        onRender: (state) => {
          state.width = renderWidth(devicePixelRatio);
          state.height = renderHeight(devicePixelRatio);
          state.phi = phi;
          state.theta = theta;
        },
      });
    } catch (error) {
      canvas.classList.add("is-fallback");
    }
  }

  function cleanup() {
    if (globeInstance && typeof globeInstance.destroy === "function") {
      globeInstance.destroy();
      globeInstance = null;
    }
  }

  initGlobe();
  window.addEventListener("pagehide", cleanup, { once: true });
})();
