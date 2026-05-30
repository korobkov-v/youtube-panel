(() => {
  const CONTROL_ID = "qyp-controls";
  const VOLUME_CONTROL_ID = "qyp-volume-controls";
  const NATIVE_VOLUME_WIDTH = "48px";
  const SPEEDS = [1, 1.25, 1.5, 1.75, 2.0, 2.5];
  const QUALITY_LABELS = {
    auto: "Auto",
    highres: "8K",
    hd4320: "8K",
    hd2880: "5K",
    hd2160: "4K",
    hd1440: "1440p",
    hd1080: "1080p",
    hd720: "720p",
    large: "480p",
  };
  const QUALITY_ORDER = [
    "large",
    "hd720",
    "hd1080",
    "hd1440",
    "hd2160",
    "hd2880",
    "hd4320",
    "highres",
  ];

  const state = {
    controls: null,
    volumeControls: null,
    desiredSpeed: null,
    selectedQuality: "auto",
    rateLockUntil: 0,
    scheduled: false,
  };
  const wiredVideos = new WeakSet();
  const wiredVolumeAreas = new WeakSet();

  function getPlayer() {
    return (
      document.querySelector("#movie_player.html5-video-player") ||
      document.querySelector(".html5-video-player")
    );
  }

  function getVideo(player = getPlayer()) {
    return (
      player?.querySelector("video.html5-main-video") ||
      player?.querySelector("video") ||
      document.querySelector("video.html5-main-video") ||
      document.querySelector("video")
    );
  }

  function callPlayer(player, method, ...args) {
    if (!player || typeof player[method] !== "function") {
      return undefined;
    }

    try {
      return player[method](...args);
    } catch {
      return undefined;
    }
  }

  function formatSpeed(speed) {
    if (speed === 2) {
      return "2.0";
    }

    return String(speed);
  }

  function qualityRank(quality) {
    const index = QUALITY_ORDER.indexOf(quality);
    return index === -1 ? QUALITY_ORDER.length : index;
  }

  function qualityLabel(quality) {
    return QUALITY_LABELS[quality] || quality;
  }

  function setImportantStyles(element, styles) {
    if (!element) {
      return;
    }

    Object.entries(styles).forEach(([property, value]) => {
      element.style.setProperty(property, value, "important");
    });
  }

  function lockNativeVolumeArea(volumeArea) {
    if (!volumeArea) {
      return;
    }

    setImportantStyles(volumeArea, {
      "box-sizing": "border-box",
      flex: `0 0 ${NATIVE_VOLUME_WIDTH}`,
      width: NATIVE_VOLUME_WIDTH,
      "min-width": NATIVE_VOLUME_WIDTH,
      "max-width": NATIVE_VOLUME_WIDTH,
      padding: "0",
      "padding-inline": "0",
      "padding-left": "0",
      "padding-right": "0",
      overflow: "hidden",
      transition: "none",
      transform: "none",
    });

    setImportantStyles(volumeArea.querySelector(".ytp-volume-panel"), {
      display: "none",
      width: "0",
      "min-width": "0",
      margin: "0",
      opacity: "0",
      "pointer-events": "none",
    });

    setImportantStyles(volumeArea.querySelector(".ytp-mute-button"), {
      "box-sizing": "border-box",
      width: NATIVE_VOLUME_WIDTH,
      "min-width": NATIVE_VOLUME_WIDTH,
      "max-width": NATIVE_VOLUME_WIDTH,
      height: "100%",
      padding: "0",
      transition: "none",
      transform: "none",
      scale: "1",
    });

    volumeArea
      .querySelectorAll(".ytp-mute-button *, .ytp-volume-icon, .ytp-volume-icon *")
      .forEach((element) => {
        setImportantStyles(element, {
          transition: "none",
          transform: "none",
          scale: "1",
        });
      });
  }

  function wireNativeVolumeArea(volumeArea) {
    if (!volumeArea || wiredVolumeAreas.has(volumeArea)) {
      return;
    }

    wiredVolumeAreas.add(volumeArea);

    const relock = () => {
      lockNativeVolumeArea(volumeArea);
      requestAnimationFrame(() => lockNativeVolumeArea(volumeArea));
      setTimeout(() => lockNativeVolumeArea(volumeArea), 50);
    };

    ["pointerenter", "pointerover", "mouseenter", "mouseover", "focusin"].forEach(
      (eventName) => {
        volumeArea.addEventListener(eventName, relock, true);
      },
    );
  }

  function getAvailableQualities(player) {
    const raw = callPlayer(player, "getAvailableQualityLevels");
    const levels = Array.isArray(raw) ? raw.filter(Boolean) : [];
    const unique = [...new Set(levels)]
      .filter((quality) => QUALITY_ORDER.includes(quality))
      .sort((a, b) => qualityRank(a) - qualityRank(b));

    return ["auto", ...unique.filter((quality) => quality !== "auto")];
  }

  function getCurrentQuality(player) {
    return callPlayer(player, "getPlaybackQuality") || state.selectedQuality || "auto";
  }

  function setSpeed(speed) {
    const player = getPlayer();
    const video = getVideo(player);

    state.desiredSpeed = speed;
    state.rateLockUntil = speed > 2 ? performance.now() + 2200 : 0;
    callPlayer(player, "setPlaybackRate", speed);

    if (video) {
      video.playbackRate = speed;
      setTimeout(() => {
        if (performance.now() < state.rateLockUntil) {
          video.playbackRate = speed;
        }
      }, 150);
    }

    updateSpeedState();
  }

  function setQuality(quality) {
    const player = getPlayer();
    state.selectedQuality = quality;

    if (quality === "auto") {
      callPlayer(player, "setPlaybackQualityRange");
      callPlayer(player, "setPlaybackQuality", "auto");
    } else {
      callPlayer(player, "setPlaybackQualityRange", quality, quality);
      callPlayer(player, "setPlaybackQuality", quality);
    }

    updateQualityState();
  }

  function setVolume(value) {
    const player = getPlayer();
    const video = getVideo(player);
    const volume = Math.max(0, Math.min(100, Number(value) || 0));

    callPlayer(player, "setVolume", volume);

    if (volume > 0) {
      callPlayer(player, "unMute");
    } else {
      callPlayer(player, "mute");
    }

    if (video) {
      video.volume = volume / 100;
      video.muted = volume === 0;
    }

    updateVolumeState();
  }

  function getVolume() {
    const player = getPlayer();
    const video = getVideo(player);
    const playerVolume = callPlayer(player, "getVolume");
    const playerMuted = callPlayer(player, "isMuted");

    if (playerMuted || video?.muted) {
      return 0;
    }

    if (typeof playerVolume === "number") {
      return Math.max(0, Math.min(100, Math.round(playerVolume)));
    }

    if (video) {
      return video.muted ? 0 : Math.round(video.volume * 100);
    }

    return 100;
  }

  function createButtonLabel(text) {
    const label = document.createElement("span");
    label.className = "qyp-button-label";
    label.textContent = text;
    return label;
  }

  function createButton(speed) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ytp-button qyp-player-button qyp-speed-button";
    button.dataset.speed = String(speed);
    button.append(createButtonLabel(`${formatSpeed(speed)}x`));
    button.title = `Speed ${formatSpeed(speed)}x`;
    button.setAttribute("aria-label", `Set playback speed to ${formatSpeed(speed)}x`);
    button.addEventListener("click", () => setSpeed(speed));
    return button;
  }

  function createVolumeControls() {
    const controls = document.createElement("div");
    controls.id = VOLUME_CONTROL_ID;
    controls.className = "qyp-volume-controls";
    const volume = document.createElement("input");
    volume.className = "qyp-volume-slider";
    volume.type = "range";
    volume.min = "0";
    volume.max = "100";
    volume.step = "1";
    volume.title = "Volume";
    volume.setAttribute("aria-label", "Volume");
    volume.addEventListener("input", (event) => setVolume(event.currentTarget.value));
    controls.append(volume);

    return controls;
  }

  function createQualityButton(quality) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ytp-button qyp-player-button qyp-quality-button";
    button.dataset.quality = quality;
    button.append(createButtonLabel(qualityLabel(quality)));
    button.title = `Quality ${qualityLabel(quality)}`;
    button.setAttribute("aria-label", `Set video quality to ${qualityLabel(quality)}`);
    button.addEventListener("click", () => setQuality(quality));
    return button;
  }

  function createControls() {
    const controls = document.createElement("div");
    controls.id = CONTROL_ID;
    controls.className = "qyp-controls";

    const speeds = document.createElement("div");
    speeds.className = "qyp-speed-group";
    speeds.setAttribute("role", "group");
    speeds.setAttribute("aria-label", "Playback speed");
    SPEEDS.forEach((speed) => speeds.append(createButton(speed)));
    controls.append(speeds);

    const quality = document.createElement("div");
    quality.className = "qyp-quality-group";
    quality.setAttribute("role", "group");
    quality.setAttribute("aria-label", "Video quality");
    controls.append(quality);

    return controls;
  }

  function placeControls(player) {
    const leftControls = player?.querySelector(".ytp-left-controls");
    const rightControls = player?.querySelector(".ytp-right-controls");
    if (!leftControls || !rightControls) {
      return null;
    }

    let volumeControls = document.getElementById(VOLUME_CONTROL_ID);
    if (!volumeControls?.querySelector(".qyp-volume-slider")) {
      volumeControls?.remove();
      volumeControls = null;
    }

    if (!volumeControls || !volumeControls.isConnected) {
      volumeControls = createVolumeControls();
    }

    const volumeArea = leftControls.querySelector(".ytp-volume-area");
    lockNativeVolumeArea(volumeArea);
    wireNativeVolumeArea(volumeArea);

    if (volumeArea?.parentElement === leftControls) {
      if (volumeArea.nextElementSibling !== volumeControls) {
        volumeArea.insertAdjacentElement("afterend", volumeControls);
      }
    } else {
      if (volumeControls.parentElement !== leftControls) {
        leftControls.append(volumeControls);
      }
    }

    let controls = document.getElementById(CONTROL_ID);
    if (!controls?.querySelector(".qyp-quality-group") || !controls.querySelector(".qyp-button-label")) {
      controls?.remove();
      controls = null;
    }

    if (!controls || !controls.isConnected) {
      controls = createControls();
    }

    const rightControlsLeft = rightControls.querySelector(".ytp-right-controls-left");
    if (rightControlsLeft?.parentElement === rightControls) {
      if (rightControlsLeft.previousElementSibling !== controls) {
        rightControlsLeft.insertAdjacentElement("beforebegin", controls);
      }
    } else {
      if (rightControls.firstElementChild !== controls) {
        rightControls.prepend(controls);
      }
    }

    state.volumeControls = volumeControls;
    return controls;
  }

  function updateSpeedState() {
    const controls = state.controls;
    const video = getVideo();
    if (!controls || !video) {
      return;
    }

    const current = video.playbackRate;
    controls.querySelectorAll(".qyp-speed-button").forEach((button) => {
      const speed = Number(button.dataset.speed);
      button.classList.toggle("is-active", Math.abs(speed - current) < 0.02);
      button.setAttribute("aria-pressed", Math.abs(speed - current) < 0.02 ? "true" : "false");
    });
  }

  function updateQualityState() {
    const controls = state.controls;
    const player = getPlayer();
    const group = controls?.querySelector(".qyp-quality-group");
    if (!group) {
      return;
    }

    const available = getAvailableQualities(player);
    const current = getCurrentQuality(player);
    const options = available;
    const signature = options.join("|");

    if (group.dataset.options !== signature) {
      group.replaceChildren(...options.map(createQualityButton));
      group.dataset.options = signature;
    }

    const activeQuality = options.includes(state.selectedQuality)
      ? state.selectedQuality
      : options.includes(current)
        ? current
        : "auto";
    group.classList.toggle("is-disabled", options.length <= 1);
    group.querySelectorAll(".qyp-quality-button").forEach((button) => {
      const isActive = button.dataset.quality === activeQuality;
      button.classList.toggle("is-active", isActive);
      button.disabled = options.length <= 1;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function updateVolumeState() {
    const controls = state.volumeControls;
    const slider = controls?.querySelector(".qyp-volume-slider");
    if (!slider) {
      return;
    }

    const volume = getVolume();
    slider.value = String(volume);
    slider.style.setProperty("--qyp-volume", `${volume}%`);
  }

  function wireVideo(video) {
    if (!video || wiredVideos.has(video)) {
      return;
    }

    wiredVideos.add(video);

    video.addEventListener("ratechange", () => {
      if (
        state.desiredSpeed &&
        Math.abs(video.playbackRate - state.desiredSpeed) >= 0.02 &&
        performance.now() < state.rateLockUntil
      ) {
        video.playbackRate = state.desiredSpeed;
      }
      updateSpeedState();
    });
    video.addEventListener("volumechange", updateVolumeState);
    video.addEventListener("loadedmetadata", () => {
      if (state.desiredSpeed) {
        setTimeout(() => setSpeed(state.desiredSpeed), 150);
      }
      updateSpeedState();
      updateQualityState();
      updateVolumeState();
    });
  }

  function syncControls() {
    updateSpeedState();
    updateQualityState();
    updateVolumeState();
  }

  function ensureControls() {
    state.scheduled = false;

    const player = getPlayer();
    if (!player) {
      return;
    }

    state.controls = placeControls(player);
    wireVideo(getVideo(player));
    syncControls();
  }

  function scheduleEnsure() {
    if (state.scheduled) {
      return;
    }

    state.scheduled = true;
    setTimeout(ensureControls, 100);
  }

  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("yt-navigate-finish", scheduleEnsure);
  window.addEventListener("yt-page-data-updated", scheduleEnsure);
  window.addEventListener("pageshow", scheduleEnsure);

  setInterval(scheduleEnsure, 1500);
  scheduleEnsure();
})();
