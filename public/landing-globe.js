(() => {
  const canvas = document.getElementById("landing-traffic-globe");
  const globeWrap = canvas instanceof HTMLCanvasElement ? canvas.closest(".landing-traffic-globe-wrap") : null;

  if (!(canvas instanceof HTMLCanvasElement) || !(globeWrap instanceof HTMLElement)) {
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const regions = [
    {
      lat: 37.4316,
      lon: -78.6569,
      markerSize: 0.058,
      pulseOffset: 0.2,
      glowColor: [0.298, 0.788, 0.941],
      coreColor: [0.88, 0.98, 1],
    },
    {
      lat: 22.3193,
      lon: 114.1694,
      markerSize: 0.05,
      pulseOffset: 2.1,
      glowColor: [0.725, 0.949, 0.486],
      coreColor: [0.95, 1, 0.88],
    },
    {
      lat: 50.1109,
      lon: 8.6821,
      markerSize: 0.054,
      pulseOffset: 4,
      glowColor: [0.38, 0.86, 1],
      coreColor: [0.92, 0.99, 1],
    },
  ];

  let globeInstance = null;

  function renderWidth(devicePixelRatio) {
    return Math.max(1, Math.round(globeWrap.clientWidth * devicePixelRatio));
  }

  function renderHeight(devicePixelRatio) {
    return Math.max(1, Math.round(globeWrap.clientHeight * devicePixelRatio));
  }

  function buildMarkers(pulseTick) {
    return regions.flatMap((region) => {
      const pulse = (Math.sin(pulseTick + region.pulseOffset) + 1) / 2;
      const haloSize = region.markerSize + pulse * 0.024;
      const coreSize = Math.max(0.022, region.markerSize * 0.42);
      const location = [region.lat, region.lon];

      return [
        {
          location,
          size: haloSize,
          color: region.glowColor,
        },
        {
          location,
          size: coreSize,
          color: region.coreColor,
        },
      ];
    });
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
      let phi = 0.62;
      let pulseTick = 0;

      globeInstance = createGlobe(canvas, {
        devicePixelRatio,
        width: renderWidth(devicePixelRatio),
        height: renderHeight(devicePixelRatio),
        phi,
        theta: 0.28,
        dark: 1,
        diffuse: 1.15,
        mapSamples: 20000,
        mapBrightness: 5.6,
        mapBaseBrightness: 0.08,
        baseColor: [0.028, 0.11, 0.18],
        markerColor: [0.298, 0.788, 0.941],
        glowColor: [0.18, 0.65, 0.95],
        scale: 1.02,
        offset: [0, 0],
        opacity: 1,
        markers: buildMarkers(0),
        onRender: (state) => {
          state.width = renderWidth(devicePixelRatio);
          state.height = renderHeight(devicePixelRatio);
          state.phi = phi;
          state.theta = 0.28;
          state.markers = buildMarkers(pulseTick);

          if (prefersReducedMotion) {
            return;
          }

          phi += 0.0035;
          pulseTick += 0.08;
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
