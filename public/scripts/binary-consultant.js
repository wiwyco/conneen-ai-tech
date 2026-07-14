const page = document.getElementById("page");
  const canvas = document.getElementById("binary-canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const chatShell = document.getElementById("chat-shell");
  const chatPanel = chatShell.querySelector(".chat-panel");
  const chatLog = document.getElementById("chat-log");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const sendButton = document.getElementById("send-button");
  const leadCaptureForm = document.getElementById("lead-capture-form");
  const leadSubmitButton = document.getElementById("lead-submit-button");
  const leadDraftButton = document.getElementById("lead-draft-button");
  const leadWorkflowInput = document.getElementById("lead-workflow");
  const leadNameInput = document.getElementById("lead-name");
  const leadEmailInput = document.getElementById("lead-email");
  const leadCompanyInput = document.getElementById("lead-company");
  const leadFields = leadCaptureForm.querySelector(".lead-fields");
  const leadCaptureTitle = leadCaptureForm.querySelector(".lead-capture-title");
  const leadCaptureCopy = leadCaptureForm.querySelector(".lead-capture-copy");
  const leadAccountPanel = document.getElementById("lead-account-panel");
  const leadInviteTokenInput = document.getElementById("lead-invite-token");
  const leadAccountStatus = document.getElementById("lead-account-status");
  const leadAccountEmailInput = document.getElementById("lead-account-email");
  const leadAccountPasswordInput = document.getElementById("lead-account-password");
  const leadAccountPasswordConfirmInput = document.getElementById("lead-account-password-confirm");
  const leadCreateAccountButton = document.getElementById("lead-create-account-button");
  const leadGoSiteButton = document.getElementById("lead-go-site-button");
  const leadPortalLink = document.getElementById("lead-portal-link");
  const leadThanksMessage = document.getElementById("lead-thanks-message");
  const siteLeadForm = document.getElementById("site-lead-form");
  const siteLeadSubmitButton = document.getElementById("site-lead-submit-button");
  const siteLeadStatus = document.getElementById("site-lead-status");
  const goSiteHotspot = document.getElementById("go-site-hotspot");
  const siteShell = document.getElementById("site-shell");
  const logoTransition = document.getElementById("logo-transition");
  const returnChatTriggers = document.querySelectorAll(".return-chat-trigger");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LEAD_PANE_MARKER = "[[OPEN_LEAD_PANE]]";
  const turnstileSiteKey = chatShell.dataset.turnstileSiteKey || siteShell.dataset.turnstileSiteKey || "";
  let visitorFirstName = "";

  const state = {
    dpr: 1,
    width: 0,
    height: 0,
    cellW: 14,
    cellH: 18,
    glyphFont: "14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    isMobile: false,
    cols: 0,
    rows: 0,
    bits: new Uint8Array(0),
    settled: new Uint8Array(0),
    settleNoise: new Float32Array(0),
    erased: new Uint8Array(0),
    eraseNoise: new Float32Array(0),
    waves: [],
    siteWaves: [],
    started: false,
    completed: false,
    mode: "intro",
    siteStartedAt: 0,
    siteTransitionFinished: false,
    borderRevealStartedAt: 0,
    borderRevealDuration: 2400,
    chatOffsetX: 8,
    chatOffsetY: -12,
    goSiteVisible: false,
    goSiteBox: null,
    goSiteFrameVisible: false,
    leadPaneOpen: false,
  };

  const turnstileState = {
    loadPromise: null,
    widgetIds: new Map(),
    tokens: new Map(),
  };

  function loadTurnstile() {
    if (!turnstileSiteKey) return Promise.resolve(null);
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileState.loadPromise) return turnstileState.loadPromise;

    turnstileState.loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-turnstile-script]");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.turnstile || null), { once: true });
        existing.addEventListener("error", () => reject(new Error("Could not load verification challenge.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = "true";
      script.onload = () => resolve(window.turnstile || null);
      script.onerror = () => reject(new Error("Could not load verification challenge."));
      document.head.appendChild(script);
    });

    return turnstileState.loadPromise;
  }

  async function renderTurnstileWidgets() {
    if (!turnstileSiteKey) return;

    const turnstile = await loadTurnstile();
    if (!turnstile?.render) return;

    document.querySelectorAll("[data-turnstile-widget]").forEach((widget) => {
      const formKey = widget.dataset.turnstileForm || "lead";
      if (turnstileState.widgetIds.has(formKey)) return;
      if (!widget.getClientRects().length) return;

      const widgetId = turnstile.render(widget, {
        sitekey: turnstileSiteKey,
        callback: (token) => {
          turnstileState.tokens.set(formKey, token);
        },
        "expired-callback": () => {
          turnstileState.tokens.delete(formKey);
        },
        "error-callback": () => {
          turnstileState.tokens.delete(formKey);
        },
      });

      turnstileState.widgetIds.set(formKey, widgetId);
    });
  }

  async function getLeadCaptchaToken(formKey) {
    if (!turnstileSiteKey) return "";
    await renderTurnstileWidgets();
    return turnstileState.tokens.get(formKey) || "";
  }

  function resetLeadCaptcha(formKey) {
    if (!turnstileSiteKey) return;

    const widgetId = turnstileState.widgetIds.get(formKey);
    turnstileState.tokens.delete(formKey);

    if (window.turnstile?.reset && widgetId !== undefined) {
      window.turnstile.reset(widgetId);
    }
  }

  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    state.isMobile = state.width <= 620;
    state.cellW = state.isMobile ? 10 : 14;
    state.cellH = state.isMobile ? 14 : 18;
    state.glyphFont = state.isMobile
      ? "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
      : "14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    state.chatOffsetX = state.isMobile ? 0 : 8;
    state.chatOffsetY = state.isMobile ? 54 : -12;
    canvas.width = Math.floor(state.width * state.dpr);
    canvas.height = Math.floor(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    const nextCols = Math.ceil(state.width / state.cellW) + 2;
    const nextRows = Math.ceil(state.height / state.cellH) + 2;
    const changed = nextCols !== state.cols || nextRows !== state.rows;

    state.cols = nextCols;
    state.rows = nextRows;

    if (changed) {
      const count = state.cols * state.rows;
      state.bits = new Uint8Array(count);
      state.settled = new Uint8Array(count);
      state.erased = new Uint8Array(count);
      state.settleNoise = new Float32Array(count);
      state.eraseNoise = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        state.bits[i] = Math.random() > 0.5 ? 1 : 0;
        state.settleNoise[i] = Math.random();
        state.eraseNoise[i] = Math.random();
      }

      if (state.mode === "intro") {
        state.completed = false;
        state.borderRevealStartedAt = 0;
        state.goSiteVisible = false;
        chatShell.classList.remove("visible");
        hideGoSiteHotspot();
      } else if (state.mode === "chat") {
        state.bits.fill(1);
        state.settled.fill(1);
        state.erased.fill(0);
        positionGoSiteHotspot();
      } else if (state.mode === "site") {
        state.bits.fill(1);
        state.settled.fill(1);
        state.erased.fill(1);
      }
    }

    positionGoSiteHotspot();
  }

  function addWave(x, y) {
    if (state.completed || state.mode !== "intro") return;
    state.started = true;
    state.waves.push({
      x,
      y,
      radius: 0,
      speed: reducedMotion ? 36 : 7.8,

      // Three visible ripple ridges, like a droplet impact from above:
      // the leading ridge is largest, the next is smaller, the third is smallest.
      spacing: 62,
      crestWidths: [34, 24, 16],
      crestScales: [1.95, 1.38, 1.08],
      wakeFill: 210,
      rings: 3,
    });

    // Keep the active wave list small.
    if (state.waves.length > 8) state.waves.shift();
  }

  function addSiteWave(x, y) {
    state.siteWaves.push({
      x,
      y,
      radius: 0,
      speed: reducedMotion ? 44 : 9.2,
      spacing: 72,
      crestWidths: [42, 30, 20],
      crestScales: [2.0, 1.42, 1.12],
      wakeFill: 260,
      rings: 3,
    });

    if (state.siteWaves.length > 4) state.siteWaves.shift();
  }

  function pointerPosition(event) {
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    return {
      x: touch ? touch.clientX : event.clientX,
      y: touch ? touch.clientY : event.clientY,
    };
  }

  function handlePointer(event) {
    if (state.mode !== "intro") return;
    const p = pointerPosition(event);
    addWave(p.x, p.y);
  }

  function completeIntro() {
    if (state.completed) return;

    state.completed = true;
    state.mode = "chat";
    state.bits.fill(1);
    state.settled.fill(1);
    state.borderRevealStartedAt = performance.now();

    setTimeout(() => {
      chatShell.classList.add("visible");
      chatShell.classList.remove("site-exit");
      chatInput.focus();
      showGoSiteHotspot();
    }, state.borderRevealDuration + 250);
  }

  function showGoSiteHotspot() {
    state.goSiteVisible = true;
    positionGoSiteHotspot();
    goSiteHotspot.classList.add("visible");
  }

  function hideGoSiteHotspot() {
    state.goSiteVisible = false;
    goSiteHotspot.classList.remove("visible");
  }

  function getGoSiteZone() {
    const text = "GO TO SITE";
    const startCol = state.isMobile
      ? Math.max(4, state.cols - text.length - 6)
      : Math.max(4, state.cols - text.length - 8);

    return {
      name: "goSite",
      lines: [text],
      startCol,
      startRow: 3,
      padX: 2,
      padY: 1,
      alpha: 0.9,
      persistent: true,
      clickable: true,

      // This makes the button appear cell-by-cell as the first wave reaches it,
      // instead of popping in after the chat reveal finishes.
      revealOnSettle: true,
    };
  }

  function positionGoSiteHotspot() {
    if (!state.goSiteVisible || !state.goSiteBox) return;

    goSiteHotspot.style.left = `${state.goSiteBox.left}px`;
    goSiteHotspot.style.top = `${state.goSiteBox.top}px`;
    goSiteHotspot.style.width = `${state.goSiteBox.width}px`;
    goSiteHotspot.style.height = `${state.goSiteBox.height}px`;
  }

  function beginSiteTransition() {
    if (state.mode !== "chat") return;

    const box = state.goSiteBox;
    const x = box ? box.left + box.width / 2 : state.width - 140;
    const y = box ? box.top + box.height / 2 : 72;

    hideGoSiteHotspot();
    state.mode = "siteTransition";
    state.siteStartedAt = performance.now();
    state.siteTransitionFinished = false;
    state.siteWaves = [];
    state.erased.fill(0);

    page.classList.add("site-transitioning");
    chatShell.classList.add("site-exit");
    chatShell.classList.remove("visible");
    siteShell.classList.remove("visible", "fading-out");

    logoTransition.classList.remove("visible", "fly-home");

    addSiteWave(x, y);

    if (reducedMotion) {
      state.erased.fill(1);
      finishSiteTransition();
    }
  }

  function finishSiteTransition() {
    if (state.siteTransitionFinished) return;

    state.siteTransitionFinished = true;
    state.mode = "siteLogo";
    state.erased.fill(1);

    // The logo only appears after the site-clearing wave has crossed the full screen.
    logoTransition.classList.add("visible");
    logoTransition.classList.remove("fly-home");

    setTimeout(() => {
      logoTransition.classList.add("fly-home");
    }, reducedMotion ? 80 : 900);

    setTimeout(() => {
      state.mode = "site";
      page.classList.add("site-mode");
      page.classList.remove("site-transitioning", "returning-to-chat");

      siteShell.classList.add("visible");
      siteShell.classList.remove("fading-out");
      renderTurnstileWidgets().catch(() => {});

      // Keep the transition logo pinned at the top-left instead of hiding it.
      logoTransition.classList.add("visible", "fly-home");
    }, reducedMotion ? 180 : 2050);
  }

  function returnToChat() {
    if (state.mode !== "site") return;

    state.mode = "returning";
    state.completed = true;
    state.bits.fill(1);
    state.settled.fill(1);
    state.erased.fill(0);
    state.borderRevealStartedAt = performance.now();

    hideGoSiteHotspot();

    page.classList.add("returning-to-chat");
    page.classList.remove("site-mode");

    siteShell.classList.add("fading-out");
    siteShell.classList.remove("visible");

    // Start from the top-left logo position.
    logoTransition.classList.add("visible", "fly-home");

    // Then remove fly-home so the existing CSS transition moves it back to center.
    requestAnimationFrame(() => {
      logoTransition.classList.remove("fly-home");
    });

    // After it reaches center, fade it.
    setTimeout(() => {
      logoTransition.classList.remove("visible");
    }, reducedMotion ? 120 : 1050);

    // Then restore the chatbot page.
    setTimeout(() => {
      state.mode = "chat";

      chatShell.classList.remove("site-exit");
      chatShell.classList.add("visible");

      page.classList.remove("returning-to-chat");
      siteShell.classList.remove("fading-out");

      showGoSiteHotspot();
      chatInput.focus();
    }, reducedMotion ? 220 : 1550);
  }

  function openLeadPane() {
    if (state.leadPaneOpen) return;

    state.leadPaneOpen = true;
    leadCaptureForm.hidden = false;
    chatShell.classList.add("lead-open");
    state.borderRevealStartedAt = performance.now();
    renderTurnstileWidgets().catch(() => {});
  }

  function closeLeadPane() {
    state.leadPaneOpen = false;
    leadCaptureForm.hidden = true;
    chatShell.classList.remove("lead-open");
    state.borderRevealStartedAt = performance.now();
  }

  function tokenFromInviteUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.searchParams.get("invite") || "";
    } catch {
      return "";
    }
  }

  function showLeadAccountSetup(payload, provision) {
    const inviteUrl = provision?.inviteUrl || "";
    const inviteToken = tokenFromInviteUrl(inviteUrl);

    leadFields.hidden = true;
    leadAccountPanel.hidden = false;
    leadCaptureTitle.textContent = "Create your client portal account";
    leadCaptureCopy.textContent =
      "Scout created a workspace from this conversation so you can track the project, requested files, and next steps before the first meeting.";
    leadAccountEmailInput.value = payload.email || "";
    leadInviteTokenInput.value = inviteToken;
    leadAccountPasswordInput.value = "";
    leadAccountPasswordConfirmInput.value = "";
    leadPortalLink.href = inviteUrl || "/portal";
    leadPortalLink.hidden = !inviteUrl;

    if (provision?.inviteEmailSent) {
      leadAccountStatus.textContent =
        "The inquiry email was sent, and a portal invite was sent to your email. You can create your password here now.";
    } else if (inviteUrl && inviteToken) {
      leadAccountStatus.textContent =
        "The inquiry was saved and Scout created your workspace. Email delivery is not configured locally, so this invite link is ready here.";
    } else if (inviteUrl) {
      leadAccountStatus.textContent =
        "The inquiry was saved and Scout found an existing portal user. Use the invite link below to open the workspace.";
    } else {
      leadAccountStatus.textContent =
        "The inquiry was saved. Scout could not create a portal invite, so Conneen AI will follow up by email.";
    }
  }

  async function getThankYouMessage(payload) {
    try {
      const res = await fetch("/api/lead-thanks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.message) return data.message;
    } catch (error) {
      console.error(error);
    }

    if (payload.portalInviteEmailSent) {
      return "Thank you. Scout saved your diagnostic brief, created your client workspace, and sent a portal invite to your email.";
    }

    if (payload.portalInviteUrl) {
      return `Thank you. Scout saved your diagnostic brief and created your client workspace. Your local portal invite link is ${payload.portalInviteUrl}`;
    }

    return "Thank you. Scout saved your diagnostic brief, and Conneen AI will review the first useful pilot opportunity.";
  }

  async function playLeadThanks(message) {
    hideGoSiteHotspot();
    closeLeadPane();

    chatShell.classList.remove("visible");
    chatShell.classList.add("site-exit");
    page.classList.add("lead-thanks-active");

    leadThanksMessage.textContent = message;
    leadThanksMessage.classList.add("visible");

    logoTransition.classList.add("visible");
    logoTransition.classList.remove("fly-home");

    setTimeout(() => {
      logoTransition.classList.add("fly-home");
      leadThanksMessage.classList.remove("visible");
    }, reducedMotion ? 900 : 2200);

    setTimeout(() => {
      page.classList.remove("lead-thanks-active");
      chatShell.classList.remove("site-exit");
      chatShell.classList.add("visible");
      showGoSiteHotspot();
      chatInput.focus();
    }, reducedMotion ? 1400 : 3400);
  }

  function updateWaves() {
    if (!state.waves.length) return;

    let settledCount = 0;

    for (const wave of state.waves) {
      wave.radius += wave.speed;
    }

    const maxRadius = Math.hypot(state.width, state.height) + 260;
    state.waves = state.waves.filter((wave) => wave.radius < maxRadius);

    for (let row = 0; row < state.rows; row++) {
      const y = row * state.cellH + state.cellH * 0.5;

      for (let col = 0; col < state.cols; col++) {
        const x = col * state.cellW + state.cellW * 0.5;
        const idx = row * state.cols + col;

        if (!state.settled[idx]) {
          for (const wave of state.waves) {
            const dist = Math.hypot(x - wave.x, y - wave.y);
            const phase = wave.radius - dist;

            // phase < 0 means the first ripple ridge has not reached this cell yet.
            if (phase < 0) continue;

            let shouldSettle = false;

            for (let ring = 0; ring < wave.rings; ring++) {
              const ringPhase = phase - ring * wave.spacing;
              const crestWidth = wave.crestWidths[ring] || wave.crestWidths[wave.crestWidths.length - 1];

              if (ringPhase < -crestWidth || ringPhase > crestWidth) continue;

              const ridgePressure = 1 - Math.abs(ringPhase) / crestWidth;
              const ringBias = 0.18 + ring * 0.08;

              if (ridgePressure + ringBias > state.settleNoise[idx]) {
                shouldSettle = true;
                break;
              }
            }

            // The wake fills remaining holes only after the visible ripples have
            // physically passed this cell. This prevents far corners from snapping early.
            if (!shouldSettle && phase > wave.wakeFill) {
              shouldSettle = true;
            }

            if (shouldSettle) {
              state.bits[idx] = 1;
              state.settled[idx] = 1;
              break;
            }
          }
        }

        settledCount += state.settled[idx];
      }
    }

    // Do not complete at 98.5%. That caused the far corners to snap to 1s before
    // the ripple/wake reached them.
    if (state.started && settledCount === state.settled.length) {
      completeIntro();
    }
  }

  function updateSiteWaves() {
    if (state.mode !== "siteTransition" || !state.siteWaves.length) return;

    for (const wave of state.siteWaves) {
      wave.radius += wave.speed;
    }

    const elapsed = performance.now() - state.siteStartedAt;

    if (!reducedMotion && state.siteWaves.length === 1 && elapsed > 340) {
      const source = state.siteWaves[0];
      addSiteWave(source.x, source.y);
    }

    let erasedCount = 0;

    for (let row = 0; row < state.rows; row++) {
      const y = row * state.cellH + state.cellH * 0.5;

      for (let col = 0; col < state.cols; col++) {
        const x = col * state.cellW + state.cellW * 0.5;
        const idx = row * state.cols + col;

        if (!state.erased[idx]) {
          for (const wave of state.siteWaves) {
            const dist = Math.hypot(x - wave.x, y - wave.y);
            const phase = wave.radius - dist;

            if (phase < 0) continue;

            let shouldErase = false;

            for (let ring = 0; ring < wave.rings; ring++) {
              const ringPhase = phase - ring * wave.spacing;
              const crestWidth =
                wave.crestWidths[ring] || wave.crestWidths[wave.crestWidths.length - 1];

              if (ringPhase < -crestWidth || ringPhase > crestWidth) continue;

              const ridgePressure = 1 - Math.abs(ringPhase) / crestWidth;
              const ringBias = 0.24 + ring * 0.1;

              if (ridgePressure + ringBias > state.eraseNoise[idx]) {
                shouldErase = true;
                break;
              }
            }

            if (!shouldErase && phase > wave.wakeFill) {
              shouldErase = true;
            }

            if (shouldErase) {
              state.erased[idx] = 1;
              break;
            }
          }
        }

        erasedCount += state.erased[idx];
      }
    }

    // Do not start the logo sequence until the clearing wave has crossed every cell.
    if (erasedCount === state.erased.length) {
      finishSiteTransition();
    }
  }

  function getRippleEffect(x, y) {
    if (reducedMotion) {
      return { scale: 1, yOffset: 0, glow: 0 };
    }

    const activeWaves = state.mode === "siteTransition" ? state.siteWaves : state.waves;

    if (!activeWaves.length || state.mode === "site") {
      return { scale: 1, yOffset: 0, glow: 0 };
    }

    let scaleBoost = 0;
    let yOffset = 0;
    let glow = 0;

    for (const wave of activeWaves) {
      const dist = Math.hypot(x - wave.x, y - wave.y);
      const phase = wave.radius - dist;

      if (phase < -wave.crestWidths[0]) continue;

      for (let ring = 0; ring < wave.rings; ring++) {
        const crestWidth = wave.crestWidths[ring] || wave.crestWidths[wave.crestWidths.length - 1];
        const crestScale = wave.crestScales[ring] || 1;
        const ringPhase = phase - ring * wave.spacing;

        if (ringPhase < -crestWidth || ringPhase > crestWidth) continue;

        const ridge = 1 - Math.abs(ringPhase) / crestWidth;
        const direction = ring % 2 === 0 ? 1 : -0.35;
        const localScaleBoost = ridge * (crestScale - 1);

        scaleBoost += localScaleBoost * direction;
        yOffset += ridge * direction * -2.4;
        glow += ridge * (1 - ring * 0.18);
      }
    }

    const scale = Math.max(0.78, Math.min(1.95, 1 + scaleBoost));

    return {
      scale,
      yOffset,
      glow: Math.min(1, glow),
    };
  }

  function drawGlyph(text, x, y, scale = 1) {
    if (Math.abs(scale - 1) < 0.01) {
      ctx.fillText(text, x, y);
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function getEmbeddedTextZones() {
    const instructionLines = state.isMobile
      ? ["Tap to organize your data"]
      : ["Click to organize your data"];

    const instructionWidth = Math.max(...instructionLines.map((line) => line.length));
    const zones = [
      {
        name: "brand",
        lines: ["CONNEEN AI"],
        startCol: 4,
        startRow: 3,
        padX: 2,
        padY: 1,
        alpha: 0.9,
        persistent: true,
      },
      {
        name: "instruction",
        lines: instructionLines,
        startCol: Math.max(2, Math.floor((state.cols - instructionWidth) / 2)),
        startRow: state.isMobile
          ? Math.max(8, Math.floor(state.rows * 0.72))
          : Math.max(6, state.rows - instructionLines.length - 5),
        padX: 2,
        padY: 1,
        alpha: 0.62,
        persistent: false,
      },
    ];

    if ((state.started || state.completed) && state.mode !== "siteTransition" && state.mode !== "site") {
      zones.push(getGoSiteZone());
    }

    return zones;
  }

  function getEmbeddedCell(col, row, idx) {
    const zones = getEmbeddedTextZones();

    for (const zone of zones) {
      if (state.completed && !zone.persistent) continue;

      // Non-persistent text should be wiped out by the wave.
      // Once that cell settles, it goes back to normal grid behavior, which becomes a 1.
      if (!zone.persistent && state.settled[idx]) continue;

      const textW = Math.max(...zone.lines.map((line) => line.length));
      const textH = zone.lines.length;

      const boxLeft = zone.startCol - zone.padX;
      const boxRight = zone.startCol + textW + zone.padX - 1;
      const boxTop = zone.startRow - zone.padY;
      const boxBottom = zone.startRow + textH + zone.padY - 1;

      if (zone.clickable) {
        let isFullySettled = true;

        if (zone.revealOnSettle) {
          for (let boxRow = boxTop; boxRow <= boxBottom; boxRow++) {
            for (let boxCol = boxLeft; boxCol <= boxRight; boxCol++) {
              const boxIdx = boxRow * state.cols + boxCol;

              if (!state.settled[boxIdx]) {
                isFullySettled = false;
                break;
              }
            }

            if (!isFullySettled) break;
          }
        }

        const textLeft = zone.startCol * state.cellW;
        const textCenterY = zone.startRow * state.cellH;
        const textWidth = textW * state.cellW;
        const textHeight = Math.max(1, textH) * state.cellH;
        const framePadX = state.isMobile ? state.cellW * 1.6 : state.cellW * 1.7;
        const framePadY = state.isMobile ? state.cellH * 0.62 : state.cellH * 0.68;
        const frameWidth = textWidth + framePadX * 2;
        const baseFrameHeight = textHeight + framePadY * 2;
        const frameHeight = baseFrameHeight + state.cellH * 0.2;
        const frameLeft = textLeft + textWidth / 2 - frameWidth / 2;
        const frameTop = textCenterY - baseFrameHeight / 2 - state.cellH * 0.2;

        state.goSiteBox = {
          left: boxLeft * state.cellW,
          frameLeft,
          frameTop,
          frameWidth,
          frameHeight,
          top: boxTop * state.cellH,
          width: (boxRight - boxLeft + 1) * state.cellW,
          height: (boxBottom - boxTop + 1) * state.cellH,
          frameVisible: isFullySettled,
        };
      }

      const inBox =
        col >= boxLeft &&
        col <= boxRight &&
        row >= boxTop &&
        row <= boxBottom;

      if (!inBox) continue;

      // For zones like GO TO SITE, keep drawing normal binary until the wave
      // physically reaches each cell. Once settled, the text/blank padding appears.
      if (zone.revealOnSettle && !state.settled[idx]) {
        continue;
      }

      const textRow = row - zone.startRow;
      const textCol = col - zone.startCol;
      const line = zone.lines[textRow];

      if (line && textCol >= 0 && textCol < line.length) {
        const char = line[textCol];

        if (char !== " ") {
          return {
            type: "char",
            char,
            alpha: zone.alpha,
            clickable: Boolean(zone.clickable),
          };
        }
      }

      return {
        type: "blank",
        clickable: Boolean(zone.clickable),
      };
    }

    return null;
  }

  function draw() {
    updateWaves();
    updateSiteWaves();

    ctx.clearRect(0, 0, state.width, state.height);
    ctx.font = state.glyphFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const t = performance.now() / 1000;
    state.goSiteBox = null;

    for (let row = 0; row < state.rows; row++) {
      const y = row * state.cellH;

      for (let col = 0; col < state.cols; col++) {
        const idx = row * state.cols + col;
        const bit = state.completed ? 1 : state.bits[idx];
        const cellX = col * state.cellW + state.cellW / 2;
        const cellY = y;
        const ripple = getRippleEffect(cellX, cellY);
        const isSiteTransition = state.mode === "siteTransition";
        const isSiteMode =
          state.mode === "site" ||
          state.mode === "siteLogo" ||
          state.mode === "returning";

        const isSiteVisual = isSiteTransition || isSiteMode;

        if (isSiteTransition && state.erased[idx]) continue;

        const waveOffset = reducedMotion ? 0 : Math.sin(t * 1.7 + col * 0.45 + row * 0.22) * 1;
        const baseAlpha = isSiteMode ? 0.105 : isSiteTransition ? 0.24 : bit ? 0.86 : 0.46;
        const alpha = Math.min(1, baseAlpha + ripple.glow * 0.18);

        const embeddedCell = getEmbeddedCell(col, row, idx);

        if (embeddedCell && !isSiteVisual) {
          if (embeddedCell.type === "char") {
            const buttonBoost = embeddedCell.clickable ? 0.08 : 0;
            ctx.fillStyle = `rgba(17, 17, 17, ${Math.min(1, embeddedCell.alpha + buttonBoost + ripple.glow * 0.18)})`;
            drawGlyph(
              embeddedCell.char,
              cellX + waveOffset,
              cellY + ripple.yOffset,
              ripple.scale
            );
          }

          // Blank embedded cells create readable padding around the text.
          continue;
        }

        if (state.completed && state.mode === "chat") {
          const chatRect = chatShell.getBoundingClientRect();
          const panelW = chatRect.width
            ? chatRect.width + 14
            : Math.min(state.leadPaneOpen ? 1240 : 880, state.width - 56);
          const panelH = chatRect.height
            ? chatRect.height + 14
            : Math.min(state.leadPaneOpen ? 680 : 640, state.height - 56);
          const centerX = chatRect.width
            ? chatRect.left + chatRect.width / 2
            : state.width / 2 + state.chatOffsetX;
          const centerY = chatRect.height
            ? chatRect.top + chatRect.height / 2
            : state.height / 2 + state.chatOffsetY;

          const fullLeft = centerX - panelW / 2;
          const fullRight = centerX + panelW / 2;
          const fullTop = centerY - panelH / 2;
          const fullBottom = centerY + panelH / 2;

          const elapsed = performance.now() - state.borderRevealStartedAt;
          const rawProgress = Math.min(1, elapsed / state.borderRevealDuration);
          const progress = easeInOutCubic(rawProgress);

          const revealW = panelW * progress;
          const revealH = panelH * progress;

          const left = centerX - revealW / 2;
          const right = centerX + revealW / 2;
          const top = centerY - revealH / 2;
          const bottom = centerY + revealH / 2;

          const cx = col * state.cellW + state.cellW / 2;
          const cy = row * state.cellH;

          const insideRevealedPanel =
            cx > left &&
            cx < right &&
            cy > top &&
            cy < bottom;

          if (insideRevealedPanel) continue;

          ctx.fillStyle = `rgba(17, 17, 17, ${alpha})`;

          drawGlyph(
            "1",
            cellX + waveOffset,
            cellY + ripple.yOffset,
            ripple.scale
          );
          continue;
        }

        if (isSiteVisual) {
          const backgroundBit = state.settleNoise[idx] > 0.5 ? "1" : "0";
          const siteAlpha = isSiteMode ? 0.105 : alpha;

          ctx.fillStyle = `rgba(17, 17, 17, ${siteAlpha})`;
          drawGlyph(backgroundBit, cellX + waveOffset, cellY + ripple.yOffset, ripple.scale);
          continue;
        }

        ctx.fillStyle = bit
          ? `rgba(17, 17, 17, ${alpha})`
          : `rgba(95, 95, 95, ${alpha * 0.72})`;

        drawGlyph(String(bit), cellX + waveOffset, cellY + ripple.yOffset, ripple.scale);
      }
    }

    if (
      state.goSiteBox?.frameVisible &&
      state.goSiteVisible &&
      state.mode !== "site" &&
      state.mode !== "siteTransition"
    ) {
      ctx.save();
      ctx.strokeStyle = "rgba(17, 17, 17, 0.55)";
      ctx.lineWidth = 1;
      const inset = 1;
      ctx.strokeRect(
        Math.round(state.goSiteBox.frameLeft) + inset + 0.5,
        Math.round(state.goSiteBox.frameTop) + inset + 0.5,
        Math.round(state.goSiteBox.frameWidth) - inset * 2,
        Math.round(state.goSiteBox.frameHeight) - inset * 2
      );
      ctx.restore();
    }

    positionGoSiteHotspot();
    requestAnimationFrame(draw);
  }

  function setVisitorFirstName(name) {
    const cleanName = name.trim().replace(/[^a-zA-Z'-]/g, "");
    if (!cleanName) return;

    visitorFirstName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    if (leadNameInput && !leadNameInput.value.trim()) leadNameInput.value = visitorFirstName;
  }

  function extractFirstName(text) {
    const normalized = text.trim();
    const blacklist = new Set([
      "a",
      "an",
      "at",
      "from",
      "getting",
      "having",
      "in",
      "interested",
      "looking",
      "running",
      "the",
      "trying",
      "using",
      "we",
      "with",
      "working",
    ]);
    const patterns = [
      /\b(?:my name is|name is|i am|i'm|im|this is)\s+([a-zA-Z][a-zA-Z'-]{1,24})\b/i,
      /^([a-zA-Z][a-zA-Z'-]{1,24})(?:,|\s+from\b|\s+with\b|\s+at\b)/i,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      const candidate = match?.[1]?.toLowerCase();
      if (candidate && !blacklist.has(candidate)) return match[1];
    }

    return "";
  }

  function parseAssistantReply(text) {
    const raw = String(text || "");
    return {
      shouldOpenLeadPane: raw.includes(LEAD_PANE_MARKER),
      text: raw.replaceAll(LEAD_PANE_MARKER, "").trim(),
    };
  }

  function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = `message ${role}`;
    div.dataset.speaker = role === "user" ? visitorFirstName || "you" : "Scout";
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function getMessagesForApi() {
    return Array.from(chatLog.querySelectorAll(".message")).map((el) => ({
      role: el.classList.contains("user") ? "user" : "assistant",
      content: el.textContent || "",
    }));
  }

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const text = chatInput.value.trim();
    if (!text) return;

    if (!visitorFirstName) {
      const firstName = extractFirstName(text);
      if (firstName) setVisitorFirstName(firstName);
    }

    addMessage("user", text);
    chatPanel.classList.add("conversation-started");
    chatInput.value = "";
    sendButton.disabled = true;
    sendButton.textContent = "Thinking";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: getMessagesForApi(), visitorFirstName }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed.");

      const reply = parseAssistantReply(data.reply || "I had trouble generating a response.");
      addMessage("assistant", reply.text || "I had trouble generating a response.");
      if (reply.shouldOpenLeadPane && leadCaptureForm.hidden) openLeadPane();
    } catch (error) {
      addMessage(
        "assistant",
        error instanceof Error
          ? error.message
          : "I could not reach the consultation service. Check the server logs and confirm OPENAI_API_KEY is configured."
      );
    } finally {
      sendButton.disabled = false;
      sendButton.textContent = "Analyze";
      chatInput.focus();
    }
  });

  leadCaptureForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(leadCaptureForm);
    const payload = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      company: String(formData.get("company") || ""),
      workflow: String(formData.get("workflow") || ""),
      pagePath: window.location.pathname,
      messages: getMessagesForApi(),
    };

    leadSubmitButton.disabled = true;
    leadSubmitButton.textContent = "Sending inquiry";
    addMessage(
      "assistant",
      "I'm sending the inquiry to Conneen AI now. After it is saved, I'll set up a client portal workspace from this conversation so you can track next steps."
    );

    try {
      payload.captchaToken = await getLeadCaptchaToken("chat");
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lead capture failed.");

      payload.portalInviteUrl = data.portalProvision?.inviteUrl || "";
      payload.portalInviteEmailSent = Boolean(data.portalProvision?.inviteEmailSent);

      const emailStatus = data.emailSent
        ? "The inquiry email was successfully sent to Conneen AI."
        : "The inquiry was saved for Conneen AI. Email notification is not configured locally, so I saved the details in the system.";
      const hasPortalInvite = Boolean(data.portalProvision?.inviteUrl);
      const accountStatus = hasPortalInvite
        ? "I also created a portal workspace from this conversation. You can create your account in the panel on the right, or skip to the site."
        : "I could not create the portal workspace automatically, so Conneen AI will follow up by email.";

      addMessage("assistant", `${emailStatus} ${accountStatus}`);
      if (hasPortalInvite) showLeadAccountSetup(payload, data.portalProvision);
    } catch (error) {
      addMessage(
        "assistant",
        error instanceof Error
          ? error.message
          : "I could not save the diagnostic brief. Please email wiwyco@gmail.com directly."
      );
    } finally {
      resetLeadCaptcha("chat");
      leadSubmitButton.disabled = false;
      leadSubmitButton.textContent = "Send brief";
      chatInput.focus();
    }
  });

  leadCreateAccountButton.addEventListener("click", async () => {
    const token = leadInviteTokenInput.value.trim();
    const email = leadAccountEmailInput.value.trim();
    const password = leadAccountPasswordInput.value;
    const passwordConfirm = leadAccountPasswordConfirmInput.value;

    if (!token) {
      leadAccountStatus.textContent = "This workspace invite is a direct link. Use the portal invite link below to continue.";
      return;
    }

    if (password.length < 12) {
      leadAccountStatus.textContent = "Please use a password with at least 12 characters.";
      return;
    }

    if (password !== passwordConfirm) {
      leadAccountStatus.textContent = "The password fields do not match.";
      return;
    }

    leadCreateAccountButton.disabled = true;
    leadCreateAccountButton.textContent = "Creating";
    leadAccountStatus.textContent = "Creating your portal account...";

    try {
      const res = await fetch("/api/portal/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email,
          displayName: leadNameInput.value.trim() || email,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Account creation failed.");

      addMessage(
        "assistant",
        "Your portal account is ready. I'll open your dashboard now, where the setup tour shows where I stored the project details from this conversation."
      );
      window.location.href = "/portal/dashboard";
    } catch (error) {
      leadAccountStatus.textContent =
        error instanceof Error ? error.message : "I could not create the account. You can use the portal invite link instead.";
    } finally {
      leadCreateAccountButton.disabled = false;
      leadCreateAccountButton.textContent = "Create account";
    }
  });

  leadGoSiteButton.addEventListener("click", () => {
    addMessage(
      "assistant",
      "No problem. Your inquiry is saved, and you can come back to the portal invite later from your email."
    );
    beginSiteTransition();
  });

  leadDraftButton.addEventListener("click", async () => {
    leadDraftButton.disabled = true;
    leadDraftButton.textContent = "Drafting";

    try {
      const res = await fetch("/api/lead-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: getMessagesForApi() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft failed.");

      if (data.name && !leadNameInput.value.trim()) leadNameInput.value = data.name;
      if (data.email && !leadEmailInput.value.trim()) leadEmailInput.value = data.email;
      if (data.company && !leadCompanyInput.value.trim()) leadCompanyInput.value = data.company;
      leadWorkflowInput.value = data.workflow || leadWorkflowInput.value;
      leadWorkflowInput.focus();
    } catch (error) {
      addMessage(
        "assistant",
        error instanceof Error
          ? error.message
          : "I could not draft the inquiry fields. You can still type them manually."
      );
    } finally {
      leadDraftButton.disabled = false;
      leadDraftButton.textContent = "Ask Scout to draft";
    }
  });

  siteLeadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(siteLeadForm);
    const payload = {
      source: "site_contact_form",
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      company: String(formData.get("company") || ""),
      workflow: String(formData.get("workflow") || ""),
      pagePath: window.location.pathname,
    };

    siteLeadSubmitButton.disabled = true;
    siteLeadSubmitButton.textContent = "Sending";
    siteLeadStatus.textContent = "";

    try {
      payload.captchaToken = await getLeadCaptchaToken("site");
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lead capture failed.");

      siteLeadStatus.textContent = data.portalProvision?.inviteEmailSent
        ? "Workflow brief saved. Scout created your workspace and sent a portal invite to your email."
        : data.portalProvision?.inviteUrl
          ? `Workflow brief saved. Scout created your workspace. Local invite link: ${data.portalProvision.inviteUrl}`
          : data.emailSent
            ? "Workflow brief sent. Conneen AI will follow up from wiwyco@gmail.com."
            : "Workflow brief saved. Email notification could not be sent, but the lead is stored.";
      siteLeadForm.reset();
    } catch (error) {
      siteLeadStatus.textContent =
        error instanceof Error
          ? error.message
          : "Could not send the workflow brief. Please email wiwyco@gmail.com directly.";
    } finally {
      resetLeadCaptcha("site");
      siteLeadSubmitButton.disabled = false;
      siteLeadSubmitButton.textContent = "Send workflow brief";
    }
  });

  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });

  goSiteHotspot.addEventListener("click", beginSiteTransition);
  returnChatTriggers.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      returnToChat();
    });
  });

  window.addEventListener("resize", resize);
  window.addEventListener("click", handlePointer, { passive: true });
  window.addEventListener("touchstart", handlePointer, { passive: true });

  resize();

  if (reducedMotion) {
    setTimeout(() => completeIntro(), 700);
  }

  draw();
