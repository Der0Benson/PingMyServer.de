(() => {
  const I18N = window.PMS_I18N || null;

  const COPY = {
    de: {
      metaTitle: "Updates | PingMyServer",
      metaDescription: "Neueste Produkt-Updates, Releases und Verbesserungen von PingMyServer in einer öffentlichen Übersicht.",
      nav: {
        home: "Start",
        updates: "Updates",
        status: "Status",
      },
      auth: {
        login: "Anmelden",
        cta: "Kostenlos starten",
        dashboard: "Dashboard",
      },
      hero: {
        badge: "Produkt-Updates",
        title: "Was sich zuletzt bei PingMyServer geändert hat",
        lead: "Sichtbare Releases, Verbesserungen und neue Werkzeuge an einem Ort, damit sofort klar ist, was zuletzt live gegangen ist.",
        statEntries: "Einträge",
        statLatest: "Letztes Update",
        panelKicker: "Live-Changelog",
        panelTitle: "Neue Einträge stehen immer oben",
        panelBody: "Die Seite funktioniert bewusst wie ein kompaktes Release-Journal: oben die neueste Änderung, darunter der Verlauf.",
        statusLink: "Status ansehen",
      },
      feed: {
        kicker: "Release-Journal",
        title: "Neueste Einträge",
        sub: "Keine Commit-Wand, sondern die Änderungen, die für Nutzer wirklich sichtbar und relevant sind.",
        featured: "Neu",
        empty: "Noch keine Updates vorhanden.",
      },
      side: {
        kicker: "Was hier landet",
        title: "Kurz, klar und produktnah",
        body: "Diese Seite ist für echte Releases gedacht. So sehen Besucher sofort, was sich am Produkt konkret verbessert hat.",
        items: [
          "Neue Features und freigeschaltete Werkzeuge",
          "Spürbare UX-Verbesserungen in Login, Dashboard und Statusansichten",
          "Sicherheits- und Stabilitätsupdates mit direkter Nutzerwirkung",
        ],
        maintenanceKicker: "Pflege",
        maintenanceTitle: "Leicht zu erweitern",
        maintenanceBody: "Neue Einträge pflegst du zentral in einer Liste. Dadurch bleibt die Seite schnell änderbar und inhaltlich sortiert.",
        maintenanceLink: "Commits auf GitHub",
      },
      footer: {
        home: "Start",
        updates: "Updates",
        status: "Status",
      },
      stats: {
        entries: "{count} aktiv",
      },
      posts: [
        {
          date: "2026-03-04",
          type: "Login",
          title: "E-Mail-Login fragt den Verifizierungscode nur noch beim ersten Mal ab",
          summary:
            "Wer sich per E-Mail und Passwort anmeldet, muss den Code jetzt nur noch bei der ersten erfolgreichen Verifizierung bestätigen. Danach läuft der Login wieder direkt über die Session.",
          tags: ["UX", "Sicherheit", "Anmeldung"],
          points: [
            "Nach der ersten bestätigten Code-Prüfung merkt sich das System den verifizierten E-Mail-Login dauerhaft.",
            "Wiederkehrende Anmeldungen mit derselben E-Mail und korrektem Passwort landen danach direkt in der Session.",
            "Die Verifikation bleibt für neue Accounts und beim allerersten Login weiterhin aktiv.",
          ],
        },
        {
          date: "2026-03-03",
          type: "Monitoring",
          title: "Game-Monitor zeigt verbundene Mod-Sessions und Live-Metriken",
          summary:
            "Der Game-Monitor bündelt jetzt verbundene Sessions, Heartbeats und technische Live-Daten in einer eigenen, klareren Übersicht.",
          tags: ["Live-Daten", "Dashboard", "Game-Monitor"],
          points: [
            "Verbundene Mod-Sessions werden getrennt angezeigt und können direkt getrennt werden.",
            "TPS, Ping, Heartbeat und weitere Live-Werte sind sichtbar, sobald Daten eintreffen.",
            "Der Bereich bleibt klar vom klassischen Website-Monitoring getrennt.",
          ],
        },
        {
          date: "2026-02-26",
          type: "Tools",
          title: "Öffentliche Tool-Seiten für DNS Lookup und Port Checker sind live",
          summary:
            "Zusatztools können jetzt direkt ohne Login genutzt werden. Damit werden schnelle Checks für DNS-Fehler und erreichbare TCP-Ports deutlich einfacher.",
          tags: ["DNS", "Netzwerk", "Öffentlich"],
          points: [
            "DNS Lookup deckt A, AAAA, MX, TXT, CNAME, NS, SRV und SOA direkt im Browser ab.",
            "Der Port Checker prüft, ob ein öffentlicher TCP-Port von außen erreichbar ist.",
            "Beide Seiten teilen sich denselben Sprachumschalter und passen optisch zur öffentlichen Produktseite.",
          ],
        },
      ],
    },
    en: {
      metaTitle: "Updates | PingMyServer",
      metaDescription: "Latest product updates, releases and improvements from PingMyServer in one public overview.",
      nav: {
        home: "Home",
        updates: "Updates",
        status: "Status",
      },
      auth: {
        login: "Sign in",
        cta: "Start free",
        dashboard: "Dashboard",
      },
      hero: {
        badge: "Product updates",
        title: "What changed recently in PingMyServer",
        lead: "Visible releases, improvements and new tools in one place so it is immediately clear what went live most recently.",
        statEntries: "Entries",
        statLatest: "Latest update",
        panelKicker: "Live changelog",
        panelTitle: "Newest entries always stay on top",
        panelBody: "The page is intentionally structured like a compact release journal: newest change first, timeline below.",
        statusLink: "View status",
      },
      feed: {
        kicker: "Release journal",
        title: "Latest entries",
        sub: "Not a raw commit wall, but the changes that are actually visible and relevant for users.",
        featured: "Latest",
        empty: "No updates yet.",
      },
      side: {
        kicker: "What gets posted here",
        title: "Short, clear and product-facing",
        body: "This page is meant for real releases so visitors can instantly see what improved in the product.",
        items: [
          "New features and newly released tools",
          "Noticeable UX improvements across sign-in, dashboard and status views",
          "Security and stability updates with direct user impact",
        ],
        maintenanceKicker: "Maintenance",
        maintenanceTitle: "Easy to extend",
        maintenanceBody: "Future entries live in one central list. That keeps the page fast to edit and easy to keep sorted.",
        maintenanceLink: "Commits on GitHub",
      },
      footer: {
        home: "Home",
        updates: "Updates",
        status: "Status",
      },
      stats: {
        entries: "{count} live",
      },
      posts: [
        {
          date: "2026-03-04",
          type: "Login",
          title: "Email login now asks for the verification code only once",
          summary:
            "Users signing in with email and password now need the code only for the first successful verification. After that, sign-in continues directly through the normal session flow.",
          tags: ["UX", "Security", "Sign-in"],
          points: [
            "After the first confirmed code check, the system remembers that the email login was verified.",
            "Future sign-ins with the same email and a valid password go straight into the session.",
            "Verification still remains active for brand-new accounts and the very first sign-in.",
          ],
        },
        {
          date: "2026-03-03",
          type: "Monitoring",
          title: "Game monitor now shows connected mod sessions and live metrics",
          summary:
            "The game monitor now groups connected sessions, heartbeats and technical live data in a cleaner dedicated view.",
          tags: ["Live data", "Dashboard", "Game monitor"],
          points: [
            "Connected mod sessions are listed separately and can be disconnected directly.",
            "TPS, ping, heartbeat and related live values become visible as soon as data arrives.",
            "The area stays clearly separated from classic website monitoring.",
          ],
        },
        {
          date: "2026-02-26",
          type: "Tools",
          title: "Public DNS lookup and port checker pages are now live",
          summary:
            "Extra tools can now be used without signing in, making quick checks for DNS issues and reachable TCP ports much easier.",
          tags: ["DNS", "Network", "Public"],
          points: [
            "DNS lookup covers A, AAAA, MX, TXT, CNAME, NS, SRV and SOA right in the browser.",
            "The port checker tests whether a public TCP port is reachable from the outside.",
            "Both pages share the same language switcher and visually match the public product pages.",
          ],
        },
      ],
    },
  };

  const navHomeEls = Array.from(document.querySelectorAll("#updates-nav-home, #updates-mobile-home, #updates-footer-home"));
  const navUpdatesEls = Array.from(document.querySelectorAll("#updates-nav-updates, #updates-mobile-updates, #updates-footer-updates"));
  const navStatusEls = Array.from(document.querySelectorAll("#updates-nav-status, #updates-mobile-status, #updates-footer-status"));
  const authLinks = Array.from(document.querySelectorAll("[data-updates-auth-link]"));
  const primaryLinks = Array.from(document.querySelectorAll("[data-updates-primary-link]"));
  const mobileMenu = document.getElementById("updates-mobile-menu");
  const mobileToggle = document.getElementById("updates-mobile-toggle");
  const mobileMenuLinks = Array.from(document.querySelectorAll("#updates-mobile-menu a"));

  const heroBadgeEl = document.getElementById("updates-badge");
  const heroTitleEl = document.getElementById("updates-title");
  const heroLeadEl = document.getElementById("updates-lead");
  const statEntriesLabelEl = document.getElementById("updates-stat-label-entries");
  const statEntriesEl = document.getElementById("updates-stat-entries");
  const statLatestLabelEl = document.getElementById("updates-stat-label-latest");
  const statLatestEl = document.getElementById("updates-stat-latest");
  const heroPanelKickerEl = document.getElementById("updates-panel-kicker");
  const heroPanelTitleEl = document.getElementById("updates-panel-title");
  const heroPanelBodyEl = document.getElementById("updates-panel-body");
  const secondaryLinkEl = document.getElementById("updates-secondary-link");
  const feedKickerEl = document.getElementById("updates-feed-kicker");
  const feedTitleEl = document.getElementById("updates-feed-title");
  const feedSubEl = document.getElementById("updates-feed-sub");
  const feedEl = document.getElementById("updates-feed");
  const sideKickerEl = document.getElementById("updates-side-kicker");
  const sideTitleEl = document.getElementById("updates-side-title");
  const sideBodyEl = document.getElementById("updates-side-body");
  const sideListEl = document.getElementById("updates-side-list");
  const maintenanceKickerEl = document.getElementById("updates-maintenance-kicker");
  const maintenanceTitleEl = document.getElementById("updates-maintenance-title");
  const maintenanceBodyEl = document.getElementById("updates-maintenance-body");
  const maintenanceLinkEl = document.getElementById("updates-maintenance-link");
  const metaTitleEl = document.getElementById("updates-meta-title");
  const metaDescriptionEl = document.getElementById("updates-meta-description");

  function getLang() {
    if (I18N && typeof I18N.getLang === "function") {
      const lang = String(I18N.getLang() || "").trim().toLowerCase();
      if (lang === "en") return "en";
    }
    return "de";
  }

  function getLocale() {
    if (I18N && typeof I18N.locale === "function") {
      return I18N.locale();
    }
    return getLang() === "en" ? "en-US" : "de-DE";
  }

  function getPageCopy() {
    return COPY[getLang()] || COPY.de;
  }

  function formatDate(dateValue) {
    const date = new Date(String(dateValue || ""));
    if (!Number.isFinite(date.getTime())) return "--";
    return new Intl.DateTimeFormat(getLocale(), {
      year: "numeric",
      month: "long",
      day: "2-digit",
    }).format(date);
  }

  function setMobileMenuOpen(isOpen) {
    if (!mobileMenu || !mobileToggle) return;
    mobileToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (isOpen) {
      mobileMenu.removeAttribute("hidden");
      return;
    }
    mobileMenu.setAttribute("hidden", "");
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  async function fetchJsonPayload(url) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async function hasAuthenticatedSession() {
    const payload = await fetchJsonPayload("/api/me");
    return !!payload?.ok && !!payload?.user;
  }

  function renderAuthState(isAuthenticated, pageCopy) {
    authLinks.forEach((link) => {
      if (isAuthenticated) {
        link.setAttribute("hidden", "");
        link.setAttribute("aria-hidden", "true");
      } else {
        link.removeAttribute("hidden");
        link.setAttribute("aria-hidden", "false");
        link.textContent = pageCopy.auth.login;
        link.setAttribute("href", "/login");
      }
    });

    primaryLinks.forEach((link) => {
      link.textContent = isAuthenticated ? pageCopy.auth.dashboard : pageCopy.auth.cta;
      link.setAttribute("href", isAuthenticated ? "/app" : "/login?mode=register");
    });
  }

  function createTag(text) {
    const tag = document.createElement("span");
    tag.className = "updates-entry-tag";
    tag.textContent = text;
    return tag;
  }

  function createBullet(text) {
    const item = document.createElement("li");
    const copy = document.createElement("span");
    copy.textContent = text;
    item.appendChild(copy);
    return item;
  }

  function createEntry(post, index, pageCopy) {
    const entry = document.createElement("article");
    entry.className = `updates-entry${index === 0 ? " is-featured" : ""}`;

    const meta = document.createElement("div");
    meta.className = "updates-entry-meta";

    const date = document.createElement("span");
    date.className = "updates-entry-date";
    date.textContent = formatDate(post.date);
    meta.appendChild(date);

    const badge = document.createElement("span");
    badge.className = "updates-entry-badge";
    badge.textContent = index === 0 ? pageCopy.feed.featured : String(post.type || "").trim() || pageCopy.feed.featured;
    meta.appendChild(badge);

    const title = document.createElement("h3");
    title.className = "updates-entry-title";
    title.textContent = post.title;

    const summary = document.createElement("p");
    summary.className = "updates-entry-summary";
    summary.textContent = post.summary;

    const tags = document.createElement("div");
    tags.className = "updates-entry-tags";
    (Array.isArray(post.tags) ? post.tags : []).forEach((tag) => {
      tags.appendChild(createTag(tag));
    });

    const points = document.createElement("ul");
    points.className = "updates-entry-points";
    (Array.isArray(post.points) ? post.points : []).forEach((point) => {
      points.appendChild(createBullet(point));
    });

    entry.appendChild(meta);
    entry.appendChild(title);
    entry.appendChild(summary);
    if (tags.childElementCount) entry.appendChild(tags);
    if (points.childElementCount) entry.appendChild(points);

    return entry;
  }

  function renderFeed(pageCopy) {
    if (!feedEl) return;

    const posts = Array.isArray(pageCopy.posts) ? pageCopy.posts : [];
    feedEl.replaceChildren();

    if (!posts.length) {
      const empty = document.createElement("p");
      empty.className = "updates-fallback";
      empty.textContent = pageCopy.feed.empty;
      feedEl.appendChild(empty);
      return;
    }

    posts.forEach((post, index) => {
      feedEl.appendChild(createEntry(post, index, pageCopy));
    });
  }

  function renderStaticCopy(pageCopy) {
    document.title = pageCopy.metaTitle;
    if (metaTitleEl) metaTitleEl.textContent = pageCopy.metaTitle;
    if (metaDescriptionEl) metaDescriptionEl.setAttribute("content", pageCopy.metaDescription);

    navHomeEls.forEach((el) => {
      el.textContent = pageCopy.nav.home;
    });
    navUpdatesEls.forEach((el) => {
      el.textContent = pageCopy.nav.updates;
    });
    navStatusEls.forEach((el) => {
      el.textContent = pageCopy.nav.status;
    });

    if (heroBadgeEl) heroBadgeEl.textContent = pageCopy.hero.badge;
    if (heroTitleEl) heroTitleEl.textContent = pageCopy.hero.title;
    if (heroLeadEl) heroLeadEl.textContent = pageCopy.hero.lead;
    if (statEntriesLabelEl) statEntriesLabelEl.textContent = pageCopy.hero.statEntries;
    if (statLatestLabelEl) statLatestLabelEl.textContent = pageCopy.hero.statLatest;
    if (heroPanelKickerEl) heroPanelKickerEl.textContent = pageCopy.hero.panelKicker;
    if (heroPanelTitleEl) heroPanelTitleEl.textContent = pageCopy.hero.panelTitle;
    if (heroPanelBodyEl) heroPanelBodyEl.textContent = pageCopy.hero.panelBody;
    if (secondaryLinkEl) secondaryLinkEl.textContent = pageCopy.hero.statusLink;
    if (feedKickerEl) feedKickerEl.textContent = pageCopy.feed.kicker;
    if (feedTitleEl) feedTitleEl.textContent = pageCopy.feed.title;
    if (feedSubEl) feedSubEl.textContent = pageCopy.feed.sub;
    if (sideKickerEl) sideKickerEl.textContent = pageCopy.side.kicker;
    if (sideTitleEl) sideTitleEl.textContent = pageCopy.side.title;
    if (sideBodyEl) sideBodyEl.textContent = pageCopy.side.body;
    if (maintenanceKickerEl) maintenanceKickerEl.textContent = pageCopy.side.maintenanceKicker;
    if (maintenanceTitleEl) maintenanceTitleEl.textContent = pageCopy.side.maintenanceTitle;
    if (maintenanceBodyEl) maintenanceBodyEl.textContent = pageCopy.side.maintenanceBody;
    if (maintenanceLinkEl) maintenanceLinkEl.textContent = pageCopy.side.maintenanceLink;

    if (sideListEl) {
      sideListEl.replaceChildren();
      (Array.isArray(pageCopy.side.items) ? pageCopy.side.items : []).forEach((item) => {
        const bullet = document.createElement("li");
        bullet.textContent = item;
        sideListEl.appendChild(bullet);
      });
    }
  }

  function renderStats(pageCopy) {
    const posts = Array.isArray(pageCopy.posts) ? pageCopy.posts : [];
    const firstPost = posts[0] || null;

    if (statEntriesEl) {
      statEntriesEl.textContent = pageCopy.stats.entries.replace("{count}", String(posts.length));
    }

    if (statLatestEl) {
      statLatestEl.textContent = firstPost ? formatDate(firstPost.date) : "--";
    }
  }

  function initMobileNavigation() {
    if (!mobileMenu || !mobileToggle) return;

    setMobileMenuOpen(false);

    mobileToggle.addEventListener("click", () => {
      const isOpen = mobileToggle.getAttribute("aria-expanded") === "true";
      setMobileMenuOpen(!isOpen);
    });

    mobileMenuLinks.forEach((link) => {
      link.addEventListener("click", () => {
        closeMobileMenu();
      });
    });

    document.addEventListener("click", (event) => {
      if (mobileMenu.hasAttribute("hidden")) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (mobileMenu.contains(target) || mobileToggle.contains(target)) return;
      closeMobileMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMobileMenu();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 881) closeMobileMenu();
    });
  }

  function init() {
    const pageCopy = getPageCopy();
    renderStaticCopy(pageCopy);
    renderStats(pageCopy);
    renderFeed(pageCopy);
    renderAuthState(false, pageCopy);
    initMobileNavigation();

    hasAuthenticatedSession().then((isAuthenticated) => {
      renderAuthState(isAuthenticated, pageCopy);
    });
  }

  init();
})();
