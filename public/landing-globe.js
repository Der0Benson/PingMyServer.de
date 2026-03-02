(() => {
  const canvas = document.getElementById("landing-traffic-globe");
  const globeWrap = canvas instanceof HTMLCanvasElement ? canvas.closest(".landing-traffic-globe-wrap") : null;
  const pingElements = {
    us: globeWrap instanceof HTMLElement ? globeWrap.querySelector(".landing-traffic-ping-us") : null,
    de: globeWrap instanceof HTMLElement ? globeWrap.querySelector(".landing-traffic-ping-de") : null,
    hk: globeWrap instanceof HTMLElement ? globeWrap.querySelector(".landing-traffic-ping-hk") : null,
  };

  if (!(canvas instanceof HTMLCanvasElement) || !(globeWrap instanceof HTMLElement)) {
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const degToRad = Math.PI / 180;
  const globeRadius = 0.8;
  const globeScale = 1.04;
  const globeOffset = [0, 0.02];
  const regions = [
    {
      id: "de",
      lat: 50.1109,
      lon: 8.6821,
    },
    {
      id: "hk",
      lat: 22.3193,
      lon: 114.1694,
    },
    {
      id: "us",
      lat: 37.4316,
      lon: -78.6569,
    },
  ];
  let globeInstance = null;

  function renderWidth(devicePixelRatio) {
    return Math.max(1, Math.round(globeWrap.clientWidth * devicePixelRatio));
  }

  function renderHeight(devicePixelRatio) {
    return Math.max(1, Math.round(globeWrap.clientHeight * devicePixelRatio));
  }

  function normalizeAngle(angle) {
    const fullTurn = Math.PI * 2;
    return ((angle % fullTurn) + fullTurn) % fullTurn;
  }

  function focusPhiForLon(lon) {
    return normalizeAngle((-90 - lon) * degToRad);
  }

  function projectRegion(region, phi, theta) {
    const lat = region.lat * degToRad;
    const lon = region.lon * degToRad;
    const cosLat = Math.cos(lat);
    const point = {
      x: cosLat * Math.cos(lon),
      y: Math.sin(lat),
      z: -cosLat * Math.sin(lon),
    };
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const local = {
      x: point.x * cosPhi + point.z * sinPhi,
      y: point.x * sinPhi * sinTheta + point.y * cosTheta - point.z * cosPhi * sinTheta,
      z: -point.x * sinPhi * cosTheta + point.y * sinTheta + point.z * cosPhi * cosTheta,
    };
    const width = Math.max(globeWrap.clientWidth, 1);
    const height = Math.max(globeWrap.clientHeight, 1);
    const offsetX = ((globeOffset[0] / width) || 0) * globeScale;
    const offsetY = ((-globeOffset[1] / height) || 0) * globeScale;
    const projectedX = local.x * globeRadius * globeScale + offsetX;
    const projectedY = local.y * globeRadius * globeScale + offsetY;

    return {
      left: ((projectedX + 1) * 50),
      top: ((1 - projectedY) * 50),
      visible: local.z > -0.16,
    };
  }

  function updatePingOverlay(phi, theta) {
    regions.forEach((region) => {
      const pingElement = pingElements[region.id];

      if (!(pingElement instanceof HTMLElement)) {
        return;
      }

      const projected = projectRegion(region, phi, theta);
      pingElement.style.left = `${projected.left}%`;
      pingElement.style.top = `${projected.top}%`;
      pingElement.style.display = projected.visible ? "block" : "none";
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
      const rotationSpeed = 0.00007;
      let lastFrameAt = performance.now();
      let phi = focusPhiForLon(regions[0].lon);
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
          updatePingOverlay(phi, theta);

          if (prefersReducedMotion) {
            return;
          }

          const now = performance.now();
          const elapsed = Math.min(now - lastFrameAt, 48);
          lastFrameAt = now;
          phi = normalizeAngle(phi + elapsed * rotationSpeed);
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
