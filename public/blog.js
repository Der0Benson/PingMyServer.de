(() => {
  const I18N = window.PMS_I18N || null;

  const COPY = {
    de: {
      metaTitle: "Blog | PingMyServer",
      metaDescription: "Produkt-Updates, Release-Notizen und sichtbare Verbesserungen von PingMyServer in einem GitHub-inspirierten Blog.",
      repoHint: "pingmyserver / blog",
      nav: {
        home: "Start",
        blog: "Blog",
        status: "Status",
      },
      auth: {
        login: "Anmelden",
        cta: "Kostenlos starten",
        dashboard: "Dashboard",
      },
      hero: {
        badge: "Release-Blog",
        subtle: "GitHub-inspiriert",
        title: "Klare Release-Notizen statt versteckter Änderungen",
        lead:
          "Diese Seite sammelt sichtbare Produkt-Updates im Stil eines Repository-Feeds: chronologisch, direkt und mit den wichtigsten Änderungen auf einen Blick.",
        statPosts: "Beiträge",
        statLatest: "Letzter Eintrag",
        statFormat: "Format",
        statFormatValue: "Release Feed",
      },
      feed: {
        kicker: "Repository Feed",
        title: "Neueste Beiträge",
        copy:
          "Jeder Eintrag ist wie ein sauberer Changelog-Post aufgebaut: Datum, Bereich, Kernaussage und konkrete Punkte.",
        latest: "Neu",
        empty: "Noch keine Blog-Beiträge vorhanden.",
        published: "Veröffentlicht",
        highlights: "{count} Highlights",
      },
      sidebar: {
        kicker: "Im Überblick",
        title: "Relevante Updates, klar zusammengefasst",
        copy:
          "Hier erscheinen nur Änderungen, die für Nutzer und Kunden im Alltag sichtbar oder spürbar sind.",
        notes: [
          "Sichtbare Releases, Fixes und Verbesserungen",
          "Schnell erfassbar über klare Labels und kurze Highlights",
          "Chronologisch sortiert, damit neue Änderungen sofort sichtbar sind",
        ],
      },
      footer: {
        home: "Start",
        blog: "Blog",
        status: "Status",
      },
      posts: [
        {
          date: "2026-03-04",
          title: "E-Mail-Login fragt den Verifizierungscode nur noch beim ersten Mal ab",
          excerpt:
            "Die Anmeldung per E-Mail und Passwort ist jetzt deutlich angenehmer, weil der zusätzliche Code nur noch beim ersten erfolgreichen Verifizieren nötig ist.",
          category: "Login",
          labels: [
            { text: "UX", tone: "default" },
            { text: "Sicherheit", tone: "success" },
            { text: "Anmeldung", tone: "neutral" },
          ],
          bullets: [
            "Nach der ersten bestätigten Code-Prüfung merkt sich das System den verifizierten E-Mail-Login dauerhaft.",
            "Wiederkehrende Anmeldungen laufen danach direkt über die Session.",
            "Neue Accounts bleiben beim ersten Einstieg weiterhin geschützt.",
          ],
        },
        {
          date: "2026-03-03",
          title: "Game-Monitor zeigt verbundene Mod-Sessions und Live-Metriken",
          excerpt:
            "Der Game-Monitor bündelt jetzt Heartbeats, Sessions und technische Live-Daten in einer deutlich klareren Ansicht.",
          category: "Monitoring",
          labels: [
            { text: "Live-Daten", tone: "default" },
            { text: "Dashboard", tone: "neutral" },
            { text: "Minecraft", tone: "success" },
          ],
          bullets: [
            "Verbundene Mod-Sessions werden separat angezeigt und können direkt getrennt werden.",
            "TPS, Ping und Heartbeat-Werte sind sichtbar, sobald Daten eingehen.",
            "Der Bereich bleibt klar vom klassischen Website-Monitoring getrennt.",
          ],
        },
        {
          date: "2026-02-26",
          title: "Öffentliche Tool-Seiten für DNS Lookup und Port Checker sind live",
          excerpt:
            "Zusatztools können ohne Login genutzt werden und machen schnelle Checks für DNS-Probleme und offene TCP-Ports deutlich einfacher.",
          category: "Tools",
          labels: [
            { text: "DNS", tone: "default" },
            { text: "Netzwerk", tone: "neutral" },
            { text: "Öffentlich", tone: "success" },
          ],
          bullets: [
            "DNS Lookup deckt A, AAAA, MX, TXT, CNAME, NS, SRV und SOA direkt im Browser ab.",
            "Der Port Checker prüft, ob ein öffentlicher TCP-Port von außen erreichbar ist.",
            "Beide Seiten sind schnell erreichbar und klar in die öffentliche Produktoberfläche integriert.",
          ],
        },
      ],
    },
    en: {
      metaTitle: "Blog | PingMyServer",
      metaDescription: "Product updates, release notes and visible improvements from PingMyServer in a GitHub-inspired blog.",
      repoHint: "pingmyserver / blog",
      nav: {
        home: "Home",
        blog: "Blog",
        status: "Status",
      },
      auth: {
        login: "Sign in",
        cta: "Start free",
        dashboard: "Dashboard",
      },
      hero: {
        badge: "Release blog",
        subtle: "GitHub-inspired",
        title: "Clear release notes instead of hidden changes",
        lead:
          "This page collects visible product updates in the style of a repository feed: chronological, direct and focused on the changes that matter most.",
        statPosts: "Posts",
        statLatest: "Latest entry",
        statFormat: "Format",
        statFormatValue: "Release feed",
      },
      feed: {
        kicker: "Repository feed",
        title: "Latest posts",
        copy:
          "Each entry is structured like a clean changelog post: date, area, key message and concrete bullet points.",
        latest: "Latest",
        empty: "No blog posts yet.",
        published: "Published",
        highlights: "{count} highlights",
      },
      sidebar: {
        kicker: "At a glance",
        title: "Relevant updates, clearly summarized",
        copy:
          "This page only includes changes that are visible or noticeable to users and customers in day-to-day use.",
        notes: [
          "Visible releases, fixes, and improvements",
          "Easy to scan through clear labels and short highlights",
          "Chronological order keeps the newest changes immediately visible",
        ],
      },
      footer: {
        home: "Home",
        blog: "Blog",
        status: "Status",
      },
      posts: [
        {
          date: "2026-03-04",
          title: "Email login now asks for the verification code only once",
          excerpt:
            "Signing in with email and password is now much smoother because the extra code is only required during the first successful verification.",
          category: "Login",
          labels: [
            { text: "UX", tone: "default" },
            { text: "Security", tone: "success" },
            { text: "Sign-in", tone: "neutral" },
          ],
          bullets: [
            "After the first confirmed code check, the system remembers that the email login was verified.",
            "Returning sign-ins go directly through the normal session flow.",
            "Brand-new accounts still stay protected on their first entry.",
          ],
        },
        {
          date: "2026-03-03",
          title: "Game monitor now shows connected mod sessions and live metrics",
          excerpt:
            "The game monitor now groups heartbeats, sessions and technical live data in a much clearer dedicated view.",
          category: "Monitoring",
          labels: [
            { text: "Live data", tone: "default" },
            { text: "Dashboard", tone: "neutral" },
            { text: "Minecraft", tone: "success" },
          ],
          bullets: [
            "Connected mod sessions are listed separately and can be disconnected directly.",
            "TPS, ping and heartbeat values become visible as soon as data arrives.",
            "The area stays clearly separated from classic website monitoring.",
          ],
        },
        {
          date: "2026-02-26",
          title: "Public DNS lookup and port checker pages are now live",
          excerpt:
            "Extra tools can now be used without signing in, making quick checks for DNS issues and public TCP ports much easier.",
          category: "Tools",
          labels: [
            { text: "DNS", tone: "default" },
            { text: "Network", tone: "neutral" },
            { text: "Public", tone: "success" },
          ],
          bullets: [
            "DNS lookup covers A, AAAA, MX, TXT, CNAME, NS, SRV and SOA directly in the browser.",
            "The port checker tests whether a public TCP port is reachable from the outside.",
            "Both pages are easy to reach and clearly integrated into the public product experience.",
          ],
        },
      ],
    },
  };

  const supportsFinePointer = typeof window.matchMedia === "function"
    && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const navHomeEls = Array.from(document.querySelectorAll("#blog-footer-home"));
  const navBlogEls = Array.from(document.querySelectorAll("#blog-footer-blog"));
  const navStatusEls = Array.from(document.querySelectorAll("#blog-footer-status"));
  const authLinks = Array.from(document.querySelectorAll("[data-blog-auth-link]"));
  const primaryLinks = Array.from(document.querySelectorAll("[data-blog-primary-link]"));
  const mobileMenu = document.getElementById("blog-mobile-menu");
  const mobileToggle = document.getElementById("blog-mobile-toggle");
  const mobileMenuLinks = Array.from(document.querySelectorAll("#blog-mobile-menu a"));
  const productMenu = document.querySelector("[data-blog-product-menu]");
  const productMenuLinks = Array.from(document.querySelectorAll("[data-blog-product-link]"));
  const mobileProductMenu = document.querySelector("[data-blog-mobile-product]");

  const repoHintEl = document.getElementById("blog-repo-hint");
  const badgeEl = document.getElementById("blog-badge");
  const subtleBadgeEl = document.getElementById("blog-badge-subtle");
  const titleEl = document.getElementById("blog-title");
  const leadEl = document.getElementById("blog-lead");
  const statPostsLabelEl = document.getElementById("blog-stat-label-posts");
  const statPostsEl = document.getElementById("blog-stat-posts");
  const statLatestLabelEl = document.getElementById("blog-stat-label-latest");
  const statLatestEl = document.getElementById("blog-stat-latest");
  const statFormatLabelEl = document.getElementById("blog-stat-label-format");
  const statFormatEl = document.getElementById("blog-stat-format");
  const feedKickerEl = document.getElementById("blog-feed-kicker");
  const feedTitleEl = document.getElementById("blog-feed-title");
  const feedCopyEl = document.getElementById("blog-feed-copy");
  const feedEl = document.getElementById("blog-feed");
  const sidebarKickerEl = document.getElementById("blog-sidebar-kicker");
  const sidebarTitleEl = document.getElementById("blog-sidebar-title");
  const sidebarCopyEl = document.getElementById("blog-sidebar-copy");
  const notesEl = document.getElementById("blog-notes");
  const metaTitleEl = document.getElementById("blog-meta-title");
  const metaDescriptionEl = document.getElementById("blog-meta-description");

  function getLang() {
    if (I18N && typeof I18N.getLang === "function") {
      const lang = String(I18N.getLang() || "").trim().toLowerCase();
      if (lang === "en") return "en";
    }
    return "de";
  }

  function getLocale() {
    if (I18N && typeof I18N.locale === "function") return I18N.locale();
    return getLang() === "en" ? "en-US" : "de-DE";
  }

  function getCopy() {
    return COPY[getLang()] || COPY.de;
  }

  function formatDate(value) {
    const date = new Date(String(value || ""));
    if (!Number.isFinite(date.getTime())) return "--";
    return new Intl.DateTimeFormat(getLocale(), {
      year: "numeric",
      month: "short",
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
    if (mobileProductMenu) mobileProductMenu.removeAttribute("open");
  }

  function closeProductMenu() {
    if (!productMenu) return;
    productMenu.removeAttribute("open");
  }

  function initProductMenu() {
    if (!productMenu) return;

    const productSummary = productMenu.querySelector("summary");
    let closeProductMenuTimer = 0;

    const shouldUseHoverMenu = () => supportsFinePointer && window.innerWidth >= 768;
    const clearProductMenuTimer = () => {
      if (!closeProductMenuTimer) return;
      window.clearTimeout(closeProductMenuTimer);
      closeProductMenuTimer = 0;
    };
    const openProductMenuOnHover = () => {
      clearProductMenuTimer();
      productMenu.setAttribute("open", "");
    };
    const scheduleProductMenuClose = (delayMs = 170) => {
      clearProductMenuTimer();
      closeProductMenuTimer = window.setTimeout(() => {
        closeProductMenuTimer = 0;
        closeProductMenu();
      }, delayMs);
    };

    if (supportsFinePointer) {
      productMenu.addEventListener("pointerenter", () => {
        if (!shouldUseHoverMenu()) return;
        openProductMenuOnHover();
      });

      productMenu.addEventListener("pointerleave", (event) => {
        if (!shouldUseHoverMenu()) return;
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && productMenu.contains(nextTarget)) return;
        scheduleProductMenuClose();
      });

      productMenu.addEventListener("focusin", () => {
        if (!shouldUseHoverMenu()) return;
        openProductMenuOnHover();
      });

      productMenu.addEventListener("focusout", (event) => {
        if (!shouldUseHoverMenu()) return;
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && productMenu.contains(nextTarget)) return;
        scheduleProductMenuClose(120);
      });
    }

    if (productSummary) {
      productSummary.addEventListener("click", (event) => {
        if (!shouldUseHoverMenu()) return;
        event.preventDefault();
        clearProductMenuTimer();
        if (productMenu.hasAttribute("open")) {
          closeProductMenu();
          return;
        }
        productMenu.setAttribute("open", "");
      });
    }

    productMenuLinks.forEach((link) => {
      link.addEventListener("click", () => {
        clearProductMenuTimer();
        closeProductMenu();
      });
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (productMenu.contains(target)) return;
      clearProductMenuTimer();
      closeProductMenu();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 768) return;
      clearProductMenuTimer();
      closeProductMenu();
    });
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

  function createLabel(label) {
    const item = document.createElement("span");
    const tone = String(label?.tone || "default").trim().toLowerCase();
    item.className = `blog-entry-label${tone === "success" ? " is-success" : tone === "neutral" ? " is-neutral" : ""}`;
    item.textContent = String(label?.text || "").trim();
    return item;
  }

  function createBullet(text) {
    const item = document.createElement("li");
    const copy = document.createElement("span");
    copy.textContent = text;
    item.appendChild(copy);
    return item;
  }

  function createDot() {
    const dot = document.createElement("span");
    dot.className = "blog-entry-dot";
    return dot;
  }

  function createEntry(post, index, pageCopy) {
    const entry = document.createElement("article");
    entry.className = "blog-entry";

    const icon = document.createElement("span");
    icon.className = "blog-entry-icon";
    icon.setAttribute("aria-hidden", "true");

    const main = document.createElement("div");
    main.className = "blog-entry-main";

    const head = document.createElement("div");
    head.className = "blog-entry-head";

    const title = document.createElement("h3");
    title.className = "blog-entry-title";
    title.textContent = post.title;

    const meta = document.createElement("div");
    meta.className = "blog-entry-meta";

    const published = document.createElement("span");
    published.textContent = `${pageCopy.feed.published} ${formatDate(post.date)}`;
    meta.appendChild(published);

    meta.appendChild(createDot());

    const category = document.createElement("span");
    category.textContent = String(post.category || "").trim() || pageCopy.feed.latest;
    meta.appendChild(category);

    head.appendChild(title);
    head.appendChild(meta);

    const labels = document.createElement("div");
    labels.className = "blog-entry-labels";
    (Array.isArray(post.labels) ? post.labels : []).forEach((label) => {
      labels.appendChild(createLabel(label));
    });
    if (index === 0) {
      const latest = document.createElement("span");
      latest.className = "blog-entry-label";
      latest.textContent = pageCopy.feed.latest;
      labels.appendChild(latest);
    }

    const summary = document.createElement("p");
    summary.className = "blog-entry-summary";
    summary.textContent = String(post.excerpt || "").trim();

    const list = document.createElement("ul");
    list.className = "blog-entry-list";
    (Array.isArray(post.bullets) ? post.bullets : []).forEach((bullet) => {
      list.appendChild(createBullet(bullet));
    });

    const foot = document.createElement("div");
    foot.className = "blog-entry-foot";

    const categoryText = document.createElement("span");
    categoryText.textContent = String(post.category || "").trim() || pageCopy.feed.latest;
    foot.appendChild(categoryText);

    foot.appendChild(createDot());

    const highlights = document.createElement("span");
    const bulletCount = Array.isArray(post.bullets) ? post.bullets.length : 0;
    highlights.textContent = pageCopy.feed.highlights.replace("{count}", String(bulletCount));
    foot.appendChild(highlights);

    main.appendChild(head);
    if (labels.childElementCount) main.appendChild(labels);
    main.appendChild(summary);
    if (list.childElementCount) main.appendChild(list);
    main.appendChild(foot);

    entry.appendChild(icon);
    entry.appendChild(main);

    return entry;
  }

  function renderFeed(pageCopy) {
    if (!feedEl) return;

    const posts = Array.isArray(pageCopy.posts) ? pageCopy.posts : [];
    feedEl.replaceChildren();

    if (!posts.length) {
      const empty = document.createElement("p");
      empty.className = "blog-feed-empty";
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
    if (repoHintEl) repoHintEl.textContent = pageCopy.repoHint;

    navHomeEls.forEach((el) => {
      el.textContent = pageCopy.nav.home;
    });
    navBlogEls.forEach((el) => {
      el.textContent = pageCopy.nav.blog;
    });
    navStatusEls.forEach((el) => {
      el.textContent = pageCopy.nav.status;
    });

    if (badgeEl) badgeEl.textContent = pageCopy.hero.badge;
    if (subtleBadgeEl) subtleBadgeEl.textContent = pageCopy.hero.subtle;
    if (titleEl) titleEl.textContent = pageCopy.hero.title;
    if (leadEl) leadEl.textContent = pageCopy.hero.lead;
    if (statPostsLabelEl) statPostsLabelEl.textContent = pageCopy.hero.statPosts;
    if (statLatestLabelEl) statLatestLabelEl.textContent = pageCopy.hero.statLatest;
    if (statFormatLabelEl) statFormatLabelEl.textContent = pageCopy.hero.statFormat;
    if (statFormatEl) statFormatEl.textContent = pageCopy.hero.statFormatValue;
    if (feedKickerEl) feedKickerEl.textContent = pageCopy.feed.kicker;
    if (feedTitleEl) feedTitleEl.textContent = pageCopy.feed.title;
    if (feedCopyEl) feedCopyEl.textContent = pageCopy.feed.copy;
    if (sidebarKickerEl) sidebarKickerEl.textContent = pageCopy.sidebar.kicker;
    if (sidebarTitleEl) sidebarTitleEl.textContent = pageCopy.sidebar.title;
    if (sidebarCopyEl) sidebarCopyEl.textContent = pageCopy.sidebar.copy;

    if (notesEl) {
      notesEl.replaceChildren();
      (Array.isArray(pageCopy.sidebar.notes) ? pageCopy.sidebar.notes : []).forEach((note) => {
        const item = document.createElement("li");
        item.textContent = note;
        notesEl.appendChild(item);
      });
    }
  }

  function renderStats(pageCopy) {
    const posts = Array.isArray(pageCopy.posts) ? pageCopy.posts : [];
    const firstPost = posts[0] || null;

    if (statPostsEl) statPostsEl.textContent = String(posts.length);
    if (statLatestEl) statLatestEl.textContent = firstPost ? formatDate(firstPost.date) : "--";
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
      if (event.key !== "Escape") return;
      closeProductMenu();
      closeMobileMenu();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 768) closeMobileMenu();
    });
  }

  function init() {
    const pageCopy = getCopy();
    renderStaticCopy(pageCopy);
    renderStats(pageCopy);
    renderFeed(pageCopy);
    renderAuthState(false, pageCopy);
    initProductMenu();
    initMobileNavigation();

    hasAuthenticatedSession().then((isAuthenticated) => {
      renderAuthState(isAuthenticated, pageCopy);
    });
  }

  init();
})();
