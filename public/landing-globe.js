(() => {
  const canvas = document.getElementById("landing-traffic-globe");
  const feed = document.getElementById("landing-traffic-feed");
  const globeWrap = canvas instanceof HTMLCanvasElement ? canvas.closest(".landing-traffic-globe-wrap") : null;

  if (!(canvas instanceof HTMLCanvasElement) || !(feed instanceof HTMLElement) || !(globeWrap instanceof HTMLElement)) {
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const I18N = window.PMS_I18N || null;
  const t = (key, vars, fallback) =>
    I18N && typeof I18N.t === "function" ? I18N.t(key, vars, fallback) : typeof fallback === "string" ? fallback : "";
  const locale = () =>
    I18N && typeof I18N.locale === "function" ? I18N.locale() : document.documentElement.lang || "en-US";
  const formatNumber = (value) => new Intl.NumberFormat(locale()).format(value);

  const regions = [
    {
      id: "us",
      labelKey: "landing.live.traffic_regions.us",
      fallbackLabel: "USA / Virginia",
      lat: 37.4316,
      lon: -78.6569,
      baseRate: 186,
      baseLatency: 34,
      baseNodes: 8,
      markerSize: 0.06,
    },
    {
      id: "hk",
      labelKey: "landing.live.traffic_regions.hk",
      fallbackLabel: "Hong Kong / Central",
      lat: 22.3193,
      lon: 114.1694,
      baseRate: 141,
      baseLatency: 128,
      baseNodes: 5,
      markerSize: 0.045,
    },
    {
      id: "de",
      labelKey: "landing.live.traffic_regions.de",
      fallbackLabel: "Germany / Frankfurt",
      lat: 50.1109,
      lon: 8.6821,
      baseRate: 214,
      baseLatency: 22,
      baseNodes: 6,
      markerSize: 0.05,
    },
  ];

  let globeInstance = null;
  let trafficTimer = 0;

  function formatRate(value) {
    const count = formatNumber(value);
    return t("landing.live.traffic_rate", { count }, `${count} req/s`);
  }

  function formatNodes(value) {
    const count = formatNumber(value);
    return t("landing.live.traffic_nodes", { count }, `${count} active nodes`);
  }

  function formatLatency(value) {
    const ms = formatNumber(value);
    return t("landing.live.traffic_latency", { ms }, `${ms} ms median`);
  }

  function regionLabel(region) {
    return t(region.labelKey, null, region.fallbackLabel);
  }

  function buildTrafficSnapshot(timestamp) {
    const time = Number(timestamp || Date.now());

    return regions.map((region, index) => {
      const phase = time / 900 + index * 1.75;
      const rate =
        region.baseRate +
        Math.round(Math.sin(phase) * 14 + Math.cos(phase * 0.6) * 7 + Math.sin(phase * 0.24) * 4);
      const latency =
        region.baseLatency +
        Math.round(Math.sin(phase * 0.72) * 4 + Math.cos(phase * 0.48) * 2);
      const nodes = region.baseNodes + (Math.sin(phase * 0.42) > 0.45 ? 1 : 0);

      return {
        id: region.id,
        label: regionLabel(region),
        rate: Math.max(48, rate),
        latency: Math.max(12, latency),
        nodes: Math.max(3, nodes),
      };
    });
  }

  function buildTrafficRoute(snapshot) {
    const item = document.createElement("article");
    item.className = "landing-traffic-route";
    item.dataset.region = snapshot.id;

    const head = document.createElement("div");
    head.className = "landing-traffic-route-head";

    const dot = document.createElement("span");
    dot.className = "landing-traffic-route-dot";
    dot.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "landing-traffic-route-name";
    name.textContent = snapshot.label;

    const rate = document.createElement("span");
    rate.className = "landing-traffic-route-rate";
    rate.textContent = formatRate(snapshot.rate);

    head.appendChild(dot);
    head.appendChild(name);
    head.appendChild(rate);

    const meta = document.createElement("div");
    meta.className = "landing-traffic-route-meta";
    meta.textContent = `${formatNodes(snapshot.nodes)} | ${formatLatency(snapshot.latency)}`;

    const status = document.createElement("div");
    status.className = "landing-traffic-route-status";
    status.textContent = t("landing.live.traffic_status", null, "sending live traffic");

    item.appendChild(head);
    item.appendChild(meta);
    item.appendChild(status);

    return item;
  }

  function renderTrafficFeed() {
    const snapshot = buildTrafficSnapshot(Date.now());
    feed.innerHTML = "";
    snapshot.forEach((entry) => {
      feed.appendChild(buildTrafficRoute(entry));
    });
  }

  function buildMarkers() {
    return regions.map((region) => ({
      location: [region.lat, region.lon],
      size: region.markerSize,
    }));
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
      const renderWidth = Math.max(1, Math.round(globeWrap.clientWidth * devicePixelRatio));
      const renderHeight = Math.max(1, Math.round(globeWrap.clientHeight * devicePixelRatio));

      let phi = 0;

      globeInstance = createGlobe(canvas, {
        devicePixelRatio,
        width: renderWidth,
        height: renderHeight,
        phi: 0,
        theta: 0,
        dark: 1,
        diffuse: 1.2,
        mapSamples: 16000,
        mapBrightness: 6,
        baseColor: [0.3, 0.3, 0.3],
        markerColor: [0.1, 0.8, 1],
        glowColor: [1, 1, 1],
        scale: 1,
        offset: [0, 0],
        opacity: 1,
        markers: buildMarkers(),
        onRender: (state) => {
          state.width = canvas.width;
          state.height = canvas.height;
          state.phi = phi;
          state.markers = buildMarkers();

          if (prefersReducedMotion) {
            return;
          }

          phi += 0.01;
        },
      });
    } catch (error) {
      canvas.classList.add("is-fallback");
    }
  }

  function cleanup() {
    if (trafficTimer) {
      window.clearInterval(trafficTimer);
      trafficTimer = 0;
    }

    if (globeInstance && typeof globeInstance.destroy === "function") {
      globeInstance.destroy();
      globeInstance = null;
    }
  }

  renderTrafficFeed();
  if (!prefersReducedMotion) {
    trafficTimer = window.setInterval(renderTrafficFeed, 1600);
  }

  initGlobe();

  window.addEventListener("pagehide", cleanup, { once: true });
})();
