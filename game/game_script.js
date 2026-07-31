/* ============================================================
   CLASH ARENA — real-time sword battle arena for T ZERONE
   Clash-of-Clans-inspired top-down melee combat. Vanilla Canvas2D.
   No external assets. Delta-time engine (smooth at 60/90/120Hz+).
   Systems: joystick, combo melee, parry/block/dash, enemy AI,
   wave director, multi-phase bosses, champions, barracks metagame,
   procedural audio, particles, cached-field rendering.
   ============================================================ */
(function () {
  "use strict";
  const TAU = Math.PI * 2;

  /* ---------------- DOM references ---------------- */
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  const appRoot = document.getElementById("game-app");

  const hud = document.getElementById("hud");
  const hudScoreEl = document.getElementById("hud-score");
  const hudGoldEl = document.getElementById("hud-gold");
  const hudBestEl = document.getElementById("hud-best");
  const hudWaveEl = document.getElementById("hud-wave");
  const hpFillEl = document.getElementById("hp-bar-fill");
  const hpVignetteEl = document.getElementById("hp-vignette");
  const waveBannerEl = document.getElementById("wave-banner");
  const pauseBtn = document.getElementById("pause-btn");

  const touchZone = document.getElementById("touch-zone");
  const joyBase = document.getElementById("joy-base");
  const joyKnob = document.getElementById("joy-knob");
  const actionCluster = document.getElementById("action-cluster");
  const btnAttack = document.getElementById("btn-attack");
  const btnHeavy = document.getElementById("btn-heavy");
  const btnDash = document.getElementById("btn-dash");
  const btnBlock = document.getElementById("btn-block");
  const cdHeavyEl = document.getElementById("cd-heavy");
  const cdDashEl = document.getElementById("cd-dash");

  const screenStart = document.getElementById("screen-start");
  const screenPause = document.getElementById("screen-pause");
  const screenOver = document.getElementById("screen-over");
  const screenShop = document.getElementById("screen-shop");
  const screenSettings = document.getElementById("screen-settings");
  const startBtn = document.getElementById("start-btn");
  const resumeBtn = document.getElementById("resume-btn");
  const restartFromPauseBtn = document.getElementById("restart-from-pause-btn");
  const retryBtn = document.getElementById("retry-btn");
  const startBestEl = document.getElementById("start-best");
  const startGoldEl = document.getElementById("start-gold");
  const overScoreEl = document.getElementById("over-score");
  const overWaveEl = document.getElementById("over-wave");
  const overKillsEl = document.getElementById("over-kills");
  const overComboEl = document.getElementById("over-combo");
  const overBossesEl = document.getElementById("over-bosses");
  const overGoldEl = document.getElementById("over-gold");
  const newBestTag = document.getElementById("new-best-tag");

  document.getElementById("back-home-start").onclick = goHome;
  document.getElementById("back-home-over").onclick = goHome;
  function goHome() { window.location.href = "../index.html"; }

  /* Pause screen's "BACK TO HOME PAGE" no longer leaves the app — it asks for
     confirmation, then returns to the in-game Main Menu (screen-start). */
  const quitConfirmModal = document.getElementById("quit-confirm-modal");
  const quitConfirmYes = document.getElementById("quit-confirm-yes");
  const quitConfirmNo = document.getElementById("quit-confirm-no");
  document.getElementById("back-home-pause").onclick = () => {
    sfx.ui();
    if (quitConfirmModal) quitConfirmModal.classList.remove("hidden");
  };
  if (quitConfirmNo) quitConfirmNo.onclick = () => {
    sfx.ui();
    if (quitConfirmModal) quitConfirmModal.classList.add("hidden");
  };
  if (quitConfirmYes) quitConfirmYes.onclick = () => {
    sfx.ui();
    if (quitConfirmModal) quitConfirmModal.classList.add("hidden");
    goHomeScreen();
  };

  /* ---------------- Safe persistent storage ---------------- */
  function safeGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function safeSet(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }

  const HIGH_SCORE_KEY = "clashArenaHighScore";
  function getHighScore() { return parseInt(safeGet(HIGH_SCORE_KEY, "0"), 10) || 0; }
  function setHighScore(v) { safeSet(HIGH_SCORE_KEY, String(v)); }

  const GOLD_KEY = "clashArenaGold";
  function getGold() { return parseInt(safeGet(GOLD_KEY, "0"), 10) || 0; }
  function setGold(v) { safeSet(GOLD_KEY, String(Math.max(0, Math.floor(v)))); }

  const UPGRADES_KEY = "clashArenaUpgrades";
  const DEFAULT_UPGRADES = {
    blade: 0, heavymastery: 0, crit: 0, reach: 0, fury: 0, executioner: 0,
    vitality: 0, plating: 0, regen: 0, blockmaster: 0,
    boots: 0, dashmaster: 0, acrobat: 0,
    goldbag: 0, warhorn: 0, magnet: 0, lifesteal: 0, shockwave: 0,
  };
  function getUpgrades() {
    try {
      const raw = safeGet(UPGRADES_KEY, null);
      if (!raw) return { ...DEFAULT_UPGRADES };
      return { ...DEFAULT_UPGRADES, ...JSON.parse(raw) };
    } catch (e) { return { ...DEFAULT_UPGRADES }; }
  }
  function setUpgrades(u) { safeSet(UPGRADES_KEY, JSON.stringify(u)); }
  function lvl(k) { return upgrades[k] || 0; }

  const SETTINGS_KEY = "clashArenaSettings";
  const DEFAULT_SETTINGS = { master: 100, homeMusic: 60, gameMusic: 60, sfx: 90, joySize: 120, joyMode: "dynamic" };
  function getSettings() {
    try {
      const raw = safeGet(SETTINGS_KEY, null);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      // Migrate legacy single "music" slider to the new independent
      // Home Music / In-Game Music sliders so old saves keep working.
      if (parsed && parsed.music !== undefined && parsed.homeMusic === undefined && parsed.gameMusic === undefined) {
        parsed.homeMusic = parsed.music;
        parsed.gameMusic = parsed.music;
      }
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (e) { return { ...DEFAULT_SETTINGS }; }
  }
  function setSettings(s) { safeSet(SETTINGS_KEY, JSON.stringify(s)); }

  let upgrades = getUpgrades();
  let settings = getSettings();

  startBestEl.textContent = getHighScore();
  hudBestEl.textContent = getHighScore();
  startGoldEl.textContent = getGold();

  /* ---------------- Champions (playable roster) ---------------- */
  const HERO_KEY = "clashArenaHero";
  const HERO_DEFS = [
    { key: "barbarian", name: "BARBARIAN", desc: "Balanced sword fighter. Reliable and brave.", hp: 100, speed: 250, dmg: 12, range: 60, arc: 2.4, atkTime: 0.30, ranged: false, look: { skin: "#F2B279", hair: "#FFD34D", cloth: "#B44E2A", weapon: "sword" } },
    { key: "goblin", name: "GOBLIN", desc: "Lightning fast dagger strikes, low health.", hp: 78, speed: 305, dmg: 9, range: 50, arc: 2.0, atkTime: 0.20, ranged: false, look: { skin: "#7ED321", hair: "#4A8F12", cloth: "#6B4A2B", weapon: "dagger" } },
    { key: "valkyrie", name: "VALKYRIE", desc: "Whirling axe hits every enemy around her.", hp: 115, speed: 235, dmg: 11, range: 68, arc: TAU, atkTime: 0.42, ranged: false, look: { skin: "#F2B279", hair: "#FF6A00", cloth: "#7A3B4E", weapon: "axe" } },
    { key: "hogrider", name: "HOG RIDER", desc: "Fast hammer bruiser. HOG RIDAAAA!", hp: 105, speed: 290, dmg: 13, range: 60, arc: 2.2, atkTime: 0.30, ranged: false, look: { skin: "#8A5A34", hair: "#1B1B1B", cloth: "#3C6E3C", weapon: "hammer", mount: true } },
    { key: "pekka", name: "P.E.K.K.A", desc: "Slow armored titan with a devastating blade.", hp: 160, speed: 195, dmg: 22, range: 70, arc: 2.6, atkTime: 0.52, ranged: false, look: { skin: "#B9C2E8", hair: "#3E4462", cloth: "#3E4462", weapon: "darkblade", helm: "#5A64A0", horns: true } },
    { key: "barbking", name: "BARBARIAN KING", desc: "Royal greatsword hero. Big reach, big damage.", hp: 150, speed: 225, dmg: 17, range: 74, arc: 2.6, atkTime: 0.38, ranged: false, look: { skin: "#E8A972", hair: "#3B2A1A", cloth: "#6B4A2B", weapon: "sword", crown: true, scale: 1.2 } },
    { key: "archerqueen", name: "ARCHER QUEEN", desc: "Deadly royal archer. Fights from range.", hp: 85, speed: 265, dmg: 10, range: 999, arc: 0, atkTime: 0.30, ranged: true, proj: { kind: "arrow", speed: 520, color: "#FFD34D" }, look: { skin: "#F2C79A", hair: "#B45AF2", cloth: "#5A3B7A", weapon: "bow", crown: true } },
    { key: "wizard", name: "WIZARD", desc: "Hurls explosive fireballs straight from his bare hands.", hp: 80, speed: 240, dmg: 13, range: 999, arc: 0, atkTime: 0.45, ranged: true, proj: { kind: "fire", speed: 420, color: "#FF9F0A" }, look: { skin: "#F2B279", hair: "#3B2A1A", cloth: "#7A3BB4", weapon: "hands", hood: true, orb: "#FF9F0A" } },
  ];
  function getHero() {
    const v = safeGet(HERO_KEY, "barbarian");
    return HERO_DEFS.some((h) => h.key === v) ? v : "barbarian";
  }
  function setHero(v) { safeSet(HERO_KEY, v); }
  let selectedHero = getHero();
  function heroDef() { return HERO_DEFS.find((h) => h.key === selectedHero) || HERO_DEFS[0]; }

  /* ---------------- Utility ---------------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  function circleHit(ax, ay, ar, bx, by, br) { return dist2(ax, ay, bx, by) <= (ar + br) * (ar + br); }
  function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }

  /* ---------------- WebAudio synth engine (SFX only) ---------------- */
  let actx = null, masterGainNode = null, sfxGainNode = null;
  function audioCtx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        actx = new AC();
        masterGainNode = actx.createGain(); masterGainNode.connect(actx.destination);
        sfxGainNode = actx.createGain(); sfxGainNode.connect(masterGainNode);
        updateAudioGain();
      }
    }
    return actx;
  }
  function updateAudioGain() {
    if (!masterGainNode) return;
    masterGainNode.gain.value = clamp(settings.master / 100, 0, 1);
    sfxGainNode.gain.value = clamp(settings.sfx / 100, 0, 1);
  }
  function unlockAudio() {
    const ac = audioCtx();
    if (ac && ac.state === "suspended") ac.resume();
    unlockBgmAutoplay();
  }
  ["pointerdown", "touchstart", "mousedown", "keydown"].forEach((evt) =>
    window.addEventListener(evt, unlockAudio, { passive: true })
  );

  function beep({ freq = 440, dur = 0.08, type = "square", vol = 0.05, slideTo = null, node = null }) {
    const ac = audioCtx();
    if (!ac) return;
    if (ac.state === "suspended") ac.resume();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(gain).connect(node || sfxGainNode || ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur + 0.02);
  }
  function noiseBurst(dur, freqCut, vol) {
    const ac = audioCtx();
    if (!ac) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buffer = ac.createBuffer(1, n, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buffer;
    const filter = ac.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = freqCut;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    src.connect(filter).connect(gain).connect(sfxGainNode || ac.destination);
    src.start();
  }
  const sfx = {
    swing: () => noiseBurst(0.09, 2400, 0.05),
    heavySwing: () => { noiseBurst(0.16, 1400, 0.08); beep({ freq: 120, dur: 0.2, type: "sawtooth", vol: 0.05, slideTo: 55 }); },
    clank: () => { beep({ freq: 1500, dur: 0.06, type: "square", vol: 0.045, slideTo: 900 }); noiseBurst(0.05, 3200, 0.03); },
    hitFlesh: () => { beep({ freq: 200, dur: 0.08, type: "square", vol: 0.05, slideTo: 90 }); noiseBurst(0.06, 1500, 0.04); },
    crit: () => beep({ freq: 900, dur: 0.12, type: "square", vol: 0.05, slideTo: 1600 }),
    hurt: () => { beep({ freq: 150, dur: 0.14, type: "square", vol: 0.07, slideTo: 60 }); noiseBurst(0.09, 1100, 0.05); },
    block: () => beep({ freq: 650, dur: 0.09, type: "triangle", vol: 0.05, slideTo: 400 }),
    parry: () => { beep({ freq: 1100, dur: 0.14, type: "square", vol: 0.06, slideTo: 2100 }); noiseBurst(0.06, 4200, 0.035); },
    dash: () => noiseBurst(0.12, 1800, 0.045),
    arrow: () => beep({ freq: 900, dur: 0.07, type: "sine", vol: 0.035, slideTo: 500 }),
    fire: () => { beep({ freq: 250, dur: 0.2, type: "sawtooth", vol: 0.05, slideTo: 90 }); noiseBurst(0.14, 900, 0.04); },
    kill: () => { beep({ freq: 320, dur: 0.14, type: "triangle", vol: 0.05, slideTo: 620 }); noiseBurst(0.1, 1300, 0.045); },
    coin: () => { beep({ freq: 1050, dur: 0.07, type: "square", vol: 0.04, slideTo: 1500 }); setTimeout(() => beep({ freq: 1400, dur: 0.09, type: "square", vol: 0.035, slideTo: 1900 }), 55); },
    powerup: () => beep({ freq: 520, dur: 0.16, type: "triangle", vol: 0.05, slideTo: 1040 }),
    boss: () => { beep({ freq: 90, dur: 0.7, type: "sawtooth", vol: 0.09, slideTo: 40 }); noiseBurst(0.4, 700, 0.06); },
    slam: () => { beep({ freq: 100, dur: 0.4, type: "sawtooth", vol: 0.09, slideTo: 35 }); noiseBurst(0.25, 800, 0.08); },
    over: () => beep({ freq: 300, dur: 0.5, type: "sawtooth", vol: 0.07, slideTo: 60 }),
    waveChime: () => { beep({ freq: 660, dur: 0.14, type: "triangle", vol: 0.05, slideTo: 880 }); setTimeout(() => beep({ freq: 880, dur: 0.16, type: "triangle", vol: 0.05, slideTo: 1100 }), 90); },
    ui: () => beep({ freq: 500, dur: 0.05, type: "square", vol: 0.03, slideTo: 640 }),
  };

  /* ---------------- BGM state machine ----------------
     Home / Enemy-Wave / Boss-Wave background music, streamed from
     GitHub-hosted raw MP3s. Smooth crossfade engine: switching tracks
     fades the previous track out to silence while simultaneously fading
     the new track in from silence (both audible mid-transition, then the
     old one is paused once fully silent) — no abrupt/harsh cuts. Pausing
     the game silences audio completely and resuming continues from the
     exact timestamp it was paused at (not a restart).
     SFX above is completely separate and untouched by any of this — UI
     clicks and combat SFX always play instantly, never fade. */
  const BGM_URLS = {
    home: "https://raw.githubusercontent.com/TARHIT-T0SVX/All-image-t-z/main/Game/Game_music/clash_blade_game_home_screen.mp3",
    combat: "https://raw.githubusercontent.com/TARHIT-T0SVX/All-image-t-z/main/Game/Game_music/clash_blade_game_enemy_fight.mp3",
    boss: "https://raw.githubusercontent.com/TARHIT-T0SVX/All-image-t-z/main/Game/Game_music/clash_blade_game_boss_fight.mp3",
  };
  const BGM_FADE_MS = 1200; // professional crossfade duration (1.0s–1.5s range)
  const bgm = {};
  Object.keys(BGM_URLS).forEach((key) => {
    const a = new Audio();
    a.src = BGM_URLS[key];
    a.loop = true;
    a.preload = "auto";
    a.volume = 0;
    try { a.crossOrigin = "anonymous"; } catch (e) {}
    a.addEventListener("error", () => { /* network hiccup — fail silently, SFX keep working */ });
    bgm[key] = a;
  });
  let currentBgmKey = null;   // which track is the "active" one (home / combat / boss)
  let pausedBgmKey = null;    // remembers the track that was playing when the game was paused
  const bgmFadeRaf = {};      // key -> active requestAnimationFrame id for its volume fade

  function bgmVolumeFor(key) {
    if (!key) return 0;
    const track = key === "home" ? settings.homeMusic : settings.gameMusic;
    return clamp((track / 100) * (settings.master / 100), 0, 1);
  }
  function tryPlay(audio) {
    try {
      const p = audio.play();
      if (p && p.catch) p.catch(() => {}); // autoplay-policy rejection: resumed on next user gesture
    } catch (e) {}
  }
  // Cancels any in-flight volume fade for a track (e.g. it's being
  // re-targeted mid-fade by another transition or a settings change).
  function cancelBgmFade(key) {
    if (bgmFadeRaf[key]) { cancelAnimationFrame(bgmFadeRaf[key]); bgmFadeRaf[key] = null; }
  }
  // Smoothly interpolates a track's volume toward `target` over `duration`
  // ms using requestAnimationFrame (locked to the display refresh rate —
  // buttery-smooth at 60/90/120Hz+), with an ease-in-out curve so the
  // fade feels natural rather than linear. Calls `onComplete` once settled.
  function fadeBgmTo(key, target, duration, onComplete) {
    const audio = bgm[key];
    if (!audio) { if (onComplete) onComplete(); return; }
    cancelBgmFade(key);
    target = clamp(target, 0, 1);
    const startVol = audio.volume;
    if (duration <= 0 || Math.abs(target - startVol) < 0.004) {
      audio.volume = target;
      if (onComplete) onComplete();
      return;
    }
    const startTime = performance.now();
    function step(now) {
      const t = clamp((now - startTime) / duration, 0, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      audio.volume = clamp(startVol + (target - startVol) * eased, 0, 1);
      if (t < 1) {
        bgmFadeRaf[key] = requestAnimationFrame(step);
      } else {
        bgmFadeRaf[key] = null;
        if (onComplete) onComplete();
      }
    }
    bgmFadeRaf[key] = requestAnimationFrame(step);
  }
  // Switches the active track to `key`: the previous track (if any) fades
  // out to silence in parallel while `key` starts playing from 0:00 and
  // fades in — a true crossfade, never an abrupt cut. Calling this again
  // for the track that's already active is a no-op aside from smoothly
  // re-syncing its volume (e.g. after a settings slider move) — it keeps
  // looping uninterrupted, it does not restart.
  function playBgm(key) {
    if (!bgm[key]) return;
    if (currentBgmKey === key) {
      fadeBgmTo(key, bgmVolumeFor(key), 250);
      return;
    }
    const prevKey = currentBgmKey;
    currentBgmKey = key;
    pausedBgmKey = null;
    const next = bgm[key];
    cancelBgmFade(key);
    try { next.currentTime = 0; } catch (e) {}
    next.volume = 0;
    tryPlay(next);
    fadeBgmTo(key, bgmVolumeFor(key), BGM_FADE_MS);
    if (prevKey && prevKey !== key && bgm[prevKey]) {
      const stale = bgm[prevKey];
      fadeBgmTo(prevKey, 0, BGM_FADE_MS, () => { try { stale.pause(); } catch (e) {} });
    }
  }
  // Immediately silences the active track and remembers it, without
  // touching its timestamp (used when the player pauses the run).
  function pauseBgm() {
    if (!currentBgmKey) return;
    cancelBgmFade(currentBgmKey);
    pausedBgmKey = currentBgmKey;
    try { bgm[currentBgmKey].pause(); } catch (e) {}
  }
  // Resumes the track that was playing before pauseBgm() was called, from
  // the exact timestamp it left off at — never restarted from 0:00.
  function resumeBgm() {
    const key = pausedBgmKey || currentBgmKey;
    if (!key) return;
    currentBgmKey = key;
    pausedBgmKey = null;
    cancelBgmFade(key);
    bgm[key].volume = bgmVolumeFor(key);
    if (bgm[key].paused) tryPlay(bgm[key]);
  }
  // Stops every BGM track immediately, used when leaving the app entirely.
  function stopAllBgm() {
    Object.keys(bgm).forEach((key) => { cancelBgmFade(key); try { bgm[key].pause(); } catch (e) {} });
    currentBgmKey = null;
    pausedBgmKey = null;
  }
  // Re-applies volume to whichever track is currently active — called
  // whenever the Home Music / Game Music / Master sliders move. Uses a
  // short smoothing fade so slider drags don't produce zipper noise.
  function updateBgmGain() {
    const key = currentBgmKey || pausedBgmKey;
    if (!key) return;
    if (currentBgmKey === key) fadeBgmTo(key, bgmVolumeFor(key), 150);
    else { cancelBgmFade(key); bgm[key].volume = 0; }
  }
  // Browsers block <audio>.play() until a user gesture — retry the active
  // track (if any) the moment the player taps/clicks/presses a key, and
  // if it hadn't actually started yet, fade it in fresh instead of
  // snapping straight to full volume.
  function unlockBgmAutoplay() {
    const key = currentBgmKey;
    if (key && bgm[key] && bgm[key].paused) {
      const audio = bgm[key];
      const wasSilent = audio.volume <= 0.01;
      tryPlay(audio);
      if (wasSilent) fadeBgmTo(key, bgmVolumeFor(key), BGM_FADE_MS);
    }
  }

  /* ---------------- Canvas sizing + cached battlefield ---------------- */
  let W = 0, H = 0, DPR = 1;
  let fieldCanvas = null;
  function resize() {
    const rect = appRoot.getBoundingClientRect();
    W = rect.width; H = rect.height;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildField();
    // Rebuild ambience so cloud shadows match the new field size, and keep
    // on-screen controls correctly positioned if a run is already in progress.
    if (typeof buildAmbience === "function") buildAmbience();
    if (typeof state !== "undefined" && state === STATE.PLAYING) showControls(true);
  }
  window.addEventListener("resize", resize);

  // The entire static battlefield (grass, stripes, flowers, stones, fences,
  // ruins, trees) is pre-rendered once to an offscreen canvas so per-frame
  // cost is a single drawImage — the key to buttery high-refresh gameplay.
  function buildField() {
    fieldCanvas = document.createElement("canvas");
    fieldCanvas.width = Math.max(2, Math.floor(W * DPR));
    fieldCanvas.height = Math.max(2, Math.floor(H * DPR));
    const g = fieldCanvas.getContext("2d");
    g.setTransform(DPR, 0, 0, DPR, 0, 0);

    // base grass
    const base = g.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, "#57A82E");
    base.addColorStop(1, "#3E8A1F");
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);

    // mowing stripes
    for (let y = 0; y < H; y += 46) {
      if ((y / 46) % 2 === 0) {
        g.fillStyle = "rgba(255,255,255,0.045)";
        g.fillRect(0, y, W, 23);
      }
    }
    // organic grass patches — denser, richer coverage
    for (let i = 0; i < 46; i++) {
      g.fillStyle = Math.random() < 0.5 ? "rgba(46,122,27,0.25)" : "rgba(155,232,90,0.14)";
      g.beginPath();
      g.ellipse(rand(0, W), rand(0, H), rand(24, 74), rand(14, 42), rand(0, TAU), 0, TAU);
      g.fill();
    }
    // grass blade tufts — doubled density for a fuller field
    g.strokeStyle = "rgba(30,90,18,0.5)";
    g.lineWidth = 1.4;
    for (let i = 0; i < 180; i++) {
      const x = rand(0, W), y = rand(0, H);
      g.beginPath();
      g.moveTo(x, y); g.lineTo(x - 2, y - 6);
      g.moveTo(x + 3, y); g.lineTo(x + 4, y - 7);
      g.stroke();
    }
    // fine secondary grass layer for extra ground texture
    g.strokeStyle = "rgba(90,180,50,0.35)";
    g.lineWidth = 1;
    for (let i = 0; i < 140; i++) {
      const x = rand(0, W), y = rand(0, H);
      g.beginPath();
      g.moveTo(x, y); g.lineTo(x - 1.4, y - 4.5);
      g.moveTo(x + 2, y); g.lineTo(x + 2.8, y - 5);
      g.stroke();
    }
    // dirt path across
    g.strokeStyle = "rgba(139,90,43,0.35)";
    g.lineWidth = 26;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(-20, H * 0.72);
    g.quadraticCurveTo(W * 0.5, H * 0.55, W + 20, H * 0.68);
    g.stroke();

    // wooden fences top & bottom (arena boundary — no stone walls, no ruins)
    const _fenceGap = fenceGapX();
    drawFenceRow(g, 6, 52, W - 6, _fenceGap);
    drawFenceRow(g, 6, H - 14, W - 6, _fenceGap);

    // trees around the edges — extra pass for denser foliage coverage
    for (let i = 0; i < 11; i++) {
      const edge = i % 2 === 0;
      const x = edge ? (Math.random() < 0.5 ? rand(10, 50) : rand(W - 50, W - 10)) : rand(20, W - 20);
      const y = edge ? rand(80, H - 60) : (Math.random() < 0.5 ? rand(64, 96) : rand(H - 70, H - 30));
      drawTree(g, x, y, rand(14, 23));
    }
    // bushes — extra pass for denser foliage coverage
    for (let i = 0; i < 12; i++) drawBush(g, rand(16, W - 16), rand(70, H - 26), rand(8, 14));
  }
  function drawFenceRow(g, x0, y, x1, gap) {
    // draws the rail/post run in two segments so a clean open pathway sits
    // between them — enemies spawning from this edge funnel through here
    const segs = gap ? [[x0, gap.x0], [gap.x1, x1]] : [[x0, x1]];
    for (const [sx0, sx1] of segs) {
      if (sx1 <= sx0) continue;
      g.fillStyle = "rgba(0,0,0,0.16)";
      g.fillRect(sx0, y - 6, sx1 - sx0, 18);
      g.strokeStyle = "#6E4420";
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(sx0, y - 4); g.lineTo(sx1, y - 4); g.stroke();
      g.beginPath(); g.moveTo(sx0, y + 2); g.lineTo(sx1, y + 2); g.stroke();
      g.strokeStyle = "#A9713C";
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(sx0, y - 5); g.lineTo(sx1, y - 5); g.stroke();
      g.beginPath(); g.moveTo(sx0, y + 1); g.lineTo(sx1, y + 1); g.stroke();
      let bannerCounter = 0;
      for (let x = sx0; x < sx1; x += 26) {
        g.fillStyle = "#5A3A1E"; g.fillRect(x, y - 10, 5, 17);
        const postGrad = g.createLinearGradient(x, y - 10, x + 5, y - 10);
        postGrad.addColorStop(0, "#C68A48"); postGrad.addColorStop(1, "#8B5A2B");
        g.fillStyle = postGrad; g.fillRect(x, y - 9, 4, 15);
        bannerCounter++;
        if (bannerCounter % 6 === 0) drawBanner(g, x + 2, y - 9);
      }
    }
    if (gap) {
      // framing end-posts either side of the opening, capped with a
      // pennant so the gap reads as an intentional gateway, not damage
      drawGatePost(g, gap.x0 - 5, y);
      drawGatePost(g, gap.x1 + 1, y);
    }
  }
  function drawGatePost(g, x, y) {
    g.fillStyle = "rgba(0,0,0,0.22)";
    g.fillRect(x - 1, y - 13, 8, 22);
    const grad = g.createLinearGradient(x, y - 13, x + 7, y - 13);
    grad.addColorStop(0, "#C68A48"); grad.addColorStop(1, "#7A4E22");
    g.fillStyle = grad;
    g.fillRect(x, y - 12, 7, 20);
    drawBanner(g, x + 1, y - 12);
  }
  function drawBanner(g, x, y) {
    // small triangular pennant hung from a fence post — Supercell-arena flair
    const cols = ["#E23C3C", "#3C7DE2", "#FFD34D"];
    const c = cols[Math.floor((x / 26) % cols.length)];
    g.fillStyle = "rgba(0,0,0,0.2)";
    g.beginPath(); g.moveTo(x - 1, y + 15); g.lineTo(x + 9, y + 15); g.lineTo(x + 4, y + 32); g.closePath(); g.fill();
    g.fillStyle = c;
    g.beginPath(); g.moveTo(x, y + 14); g.lineTo(x + 8, y + 14); g.lineTo(x + 4, y + 30); g.closePath(); g.fill();
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.beginPath(); g.moveTo(x + 1, y + 15); g.lineTo(x + 3, y + 15); g.lineTo(x + 2.4, y + 26); g.closePath(); g.fill();
  }
  function drawTree(g, x, y, r) {
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.beginPath(); g.ellipse(x + 3, y + r * 0.9, r * 1.1, r * 0.4, 0, 0, TAU); g.fill();
    g.fillStyle = "#7A4E17";
    g.fillRect(x - 2.5, y - 2, 5, r * 0.8);
    g.fillStyle = "#2E7A1B";
    g.beginPath(); g.arc(x, y - r * 0.5, r, 0, TAU); g.fill();
    g.beginPath(); g.arc(x - r * 0.6, y - r * 0.1, r * 0.7, 0, TAU); g.fill();
    g.beginPath(); g.arc(x + r * 0.6, y - r * 0.1, r * 0.7, 0, TAU); g.fill();
    g.fillStyle = "#4CAF2E";
    g.beginPath(); g.arc(x - r * 0.3, y - r * 0.75, r * 0.55, 0, TAU); g.fill();
  }
  function drawBush(g, x, y, r) {
    g.fillStyle = "rgba(0,0,0,0.14)";
    g.beginPath(); g.ellipse(x + 2, y + r * 0.5, r * 1.2, r * 0.4, 0, 0, TAU); g.fill();
    g.fillStyle = "#3E8A1F";
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = "#57A82E";
    g.beginPath(); g.arc(x - r * 0.4, y - r * 0.35, r * 0.6, 0, TAU); g.fill();
  }

  /* ---------------- Living ambience (cloud shadows) ---------------- */
  let cloudShadows = [];
  function buildAmbience() {
    cloudShadows = [];
    for (let i = 0; i < 3; i++) {
      cloudShadows.push({ x: rand(0, W), y: rand(0, H), r: rand(90, 170), vx: rand(6, 12) });
    }
  }
  function updateAmbience(dt) {
    cloudShadows.forEach((c) => {
      c.x += c.vx * dt;
      if (c.x - c.r > W) { c.x = -c.r; c.y = rand(0, H); }
    });
  }
  function drawAmbience(g) {
    cloudShadows.forEach((c) => {
      g.fillStyle = "rgba(10,40,10,0.10)";
      g.beginPath(); g.ellipse(c.x, c.y, c.r, c.r * 0.55, 0, 0, TAU); g.fill();
    });
  }

  /* ---------------- Screen shake / hitstop ---------------- */
  let shakeTime = 0, shakeMag = 0, hitstop = 0;
  function triggerShake(mag, dur) { shakeMag = Math.max(shakeMag, mag); shakeTime = Math.max(shakeTime, dur); }
  function currentShakeOffset() {
    if (shakeTime <= 0) return { x: 0, y: 0 };
    const m = shakeMag * Math.min(1, shakeTime / 0.35);
    return { x: rand(-m, m), y: rand(-m, m) };
  }

  /* ---------------- Floating text / particles ---------------- */
  let floatingTexts = [], particles = [];
  const MAX_PARTICLES = 380;
  function spawnFloatingText(x, y, text, color, size, centered) {
    floatingTexts.push({ x, y, text, color, size: size || 14, life: 0.85, maxLife: 0.85, vy: centered ? 0 : -52, centered: !!centered });
  }
  function spawnParticles(x, y, color, count, sMin, sMax) {
    if (particles.length > MAX_PARTICLES) return;
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), sp = rand(sMin, sMax);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.25, 0.6), maxLife: 0.6, r: rand(1.5, 3.5), color, decay: rand(0.9, 0.97) });
    }
  }
  function spawnShockwave(x, y, color, maxR) {
    particles.push({ x, y, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, r: 6, color, ring: true, ringMaxR: maxR || 90, decay: 1 });
  }

  // Purple summoning magic circle — ground glyph + rising dark-energy sparks
  // marking exactly where a skeleton is emerging from beneath the earth.
  let magicCircles = [];
  function spawnMagicCircle(x, y) {
    magicCircles.push({ x, y, life: 0.62, maxLife: 0.62 });
    spawnParticles(x, y, "#9932CC", 10, 30, 90);
    spawnParticles(x, y, "#B45AF2", 6, 60, 140);
  }
  function drawMagicCircles(g) {
    for (const c of magicCircles) {
      const t = c.life / c.maxLife;
      const fade = t < 0.3 ? t / 0.3 : 1;
      const spin = (c.maxLife - c.life) * 3.2;
      g.save();
      g.translate(c.x, c.y);
      g.globalAlpha = fade * 0.85;
      const grad = g.createRadialGradient(0, 0, 2, 0, 0, 30);
      grad.addColorStop(0, "rgba(153,50,204,0.55)");
      grad.addColorStop(1, "rgba(153,50,204,0)");
      g.fillStyle = grad;
      g.beginPath(); g.ellipse(0, 4, 30, 12, 0, 0, TAU); g.fill();
      g.strokeStyle = "#9932CC"; g.lineWidth = 2;
      g.beginPath(); g.ellipse(0, 4, 22, 8.5, 0, 0, TAU); g.stroke();
      g.strokeStyle = "#B45AF2"; g.lineWidth = 1.4;
      g.rotate(spin);
      g.beginPath(); g.ellipse(0, 0, 15, 6, 0, 0, TAU); g.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const px = Math.cos(a) * 15, py = Math.sin(a) * 6;
        g.fillStyle = "#D9A9F2";
        g.beginPath(); g.arc(px, py * 0.7 + 4, 1.6, 0, TAU); g.fill();
      }
      g.restore();
    }
  }

  /* ---------------- Blood slash impact + ground splatter FX (ported from BLADE CLASH classic) ---------------- */
  let slashFx = [];
  let bloodDecals = [];
  const MAX_BLOOD_DECALS = 60;
  function spawnSlashEffect(x, y, angle) {
    slashFx.push({ x, y, angle: angle || 0, life: 0.16, maxLife: 0.16 });
  }
  function spawnBloodDecal(x, y, r) {
    if (bloodDecals.length > MAX_BLOOD_DECALS) bloodDecals.shift();
    bloodDecals.push({ x, y, r: r || 16, life: 0.5, maxLife: 0.5, seed: Math.random() * TAU });
  }

  /* ---------------- Combo ---------------- */
  let combo = 0, comboTimer = 0, maxCombo = 0;
  const COMBO_WINDOW = 2.2;
  function registerKillForCombo() {
    combo = comboTimer > 0 ? combo + 1 : 1;
    maxCombo = Math.max(maxCombo, combo);
    comboTimer = COMBO_WINDOW;
  }
  function comboMultiplier() { return clamp(1 + Math.floor(combo / 4), 1, 5); }

  /* ---------------- Game state ---------------- */
  const STATE = { START: "start", PLAYING: "playing", PAUSED: "paused", OVER: "over" };
  let state = STATE.START;

  let score = 0, wave = 1;
  let runStats = { kills: 0, bossesDefeated: 0, goldEarned: 0 };

  const player = {
    x: 0, y: 0, r: 15, facing: -Math.PI / 2,
    hp: 100, maxHp: 100, speed: 250,
    dmg: 12, range: 60, arc: 2.4, atkTime: 0.3,
    attack: null, chain: 0, chainTimer: 0, buffered: null,
    heavyCd: 0, dashCd: 0, dashT: 0, dashDx: 0, dashDy: 0,
    blocking: false, blockAge: 0,
    invuln: 0, rageTimer: 0, shieldTimer: 0, regenTick: 0,
    swingDir: 1, moving: false, mouthOpen: 0,
  };

  let enemies = [], projs = [], pickups = [], telegraphs = [];
  let boss = null;
  let waveSpawnQueue = [], waveSpawnTimer = 0, waveClearedPause = 0;

  function heroStats() {
    const d = heroDef();
    player.maxHp = d.hp + lvl("vitality") * 20;
    player.speed = d.speed + lvl("boots") * 20;
    player.dmg = d.dmg + lvl("blade") * 2;
    player.range = Math.min(d.range + lvl("reach") * 6, 999);
    player.arc = d.arc;
    player.atkTime = Math.max(0.12, d.atkTime * (1 - lvl("fury") * 0.06));
  }

  /* ---------------- Input: keyboard ---------------- */
  const keys = Object.create(null);
  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "Space" || e.code === "KeyJ") { e.preventDefault(); pressAttack(); }
    if (e.code === "KeyK") pressHeavy();
    if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "KeyL") pressDash();
    if (e.code === "KeyB") setBlock(true);
    if (e.code === "Escape" || e.code === "KeyP") togglePause();
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
    if (e.code === "KeyB") setBlock(false);
  });

  /* ---------------- Input: virtual joystick ---------------- */
  const joy = { active: false, id: null, bx: 0, by: 0, x: 0, y: 0 };
  function joyRadius() { return settings.joySize / 2; }
  function positionJoyEls() {
    const size = settings.joySize;
    joyBase.style.width = size + "px"; joyBase.style.height = size + "px";
    const ks = size * 0.42;
    joyKnob.style.width = ks + "px"; joyKnob.style.height = ks + "px";
    setJoyVisual(0, 0);
  }
  function setJoyVisual(dx, dy) {
    const size = settings.joySize, ks = size * 0.42;
    joyBase.style.left = (joy.bx - size / 2) + "px";
    joyBase.style.top = (joy.by - size / 2) + "px";
    joyKnob.style.left = (size / 2 - ks / 2 + dx) + "px";
    joyKnob.style.top = (size / 2 - ks / 2 + dy) + "px";
  }
  function fixedAnchor() {
    return { x: 30 + settings.joySize / 2, y: H - 40 - settings.joySize / 2 };
  }
  function joyStart(e) {
    if (state !== STATE.PLAYING) return;
    const rect = appRoot.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    joy.active = true;
    joy.id = e.pointerId;
    if (settings.joyMode === "fixed") {
      const a = fixedAnchor();
      joy.bx = a.x; joy.by = a.y;
    } else {
      joy.bx = px; joy.by = py;
    }
    joyBase.classList.remove("hidden");
    joyMove(e);
    e.preventDefault();
  }
  function joyMove(e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    const rect = appRoot.getBoundingClientRect();
    let dx = (e.clientX - rect.left) - joy.bx;
    let dy = (e.clientY - rect.top) - joy.by;
    const R = joyRadius();
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = dx / len * R; dy = dy / len * R; }
    joy.x = dx / R; joy.y = dy / R;
    setJoyVisual(dx, dy);
  }
  function joyEnd(e) {
    if (e.pointerId !== joy.id) return;
    joy.active = false; joy.id = null; joy.x = 0; joy.y = 0;
    setJoyVisual(0, 0);
    if (settings.joyMode !== "fixed") joyBase.classList.add("hidden");
  }
  touchZone.addEventListener("pointerdown", joyStart);
  window.addEventListener("pointermove", joyMove);
  window.addEventListener("pointerup", joyEnd);
  window.addEventListener("pointercancel", joyEnd);

  // desktop: click on canvas = attack toward pointer
  canvas.addEventListener("mousedown", (e) => {
    if (state !== STATE.PLAYING || e.pointerType === "touch") return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    player.facing = Math.atan2(py - player.y, px - player.x);
    pressAttack();
  });

  /* ---------------- Input: action buttons ---------------- */
  function bindPress(el, down, up) {
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); down(); });
    if (up) {
      el.addEventListener("pointerup", (e) => { e.preventDefault(); up(); });
      el.addEventListener("pointerleave", () => up());
      el.addEventListener("pointercancel", () => up());
    }
  }
  bindPress(btnAttack, pressAttack);
  bindPress(btnHeavy, pressHeavy);
  bindPress(btnDash, pressDash);
  bindPress(btnBlock, () => setBlock(true), () => setBlock(false));

  function setBlock(on) {
    if (state !== STATE.PLAYING) on = false;
    if (on && !player.blocking) player.blockAge = 0;
    player.blocking = on;
    btnBlock.classList.toggle("blocking", on);
  }

  /* ---------------- Player combat ---------------- */
  function rageMult() { return player.rageTimer > 0 ? 0.62 : 1; }

  // Hybrid melee swing: when a ranged hero (bow/hands) has an enemy at
  // point-blank range, they swing the ranged weapon itself as a short melee
  // strike instead of firing a projectile. No separate melee weapon needed.
  const RANGED_SWING_TRIGGER = 66;   // distance at which a ranged hero swings instead of shooting
  const RANGED_SWING_RANGE = 58;     // reach of that improvised melee swing
  const RANGED_SWING_ARC = 2.0;      // swing arc (radians) used for the hybrid strike

  function pressAttack() {
    if (state !== STATE.PLAYING) return;
    if (player.attack) { player.buffered = "light"; return; }
    startAttack("light");
  }
  function pressHeavy() {
    if (state !== STATE.PLAYING || player.heavyCd > 0) return;
    if (player.attack) { player.buffered = "heavy"; return; }
    startAttack("heavy");
  }
  function pressDash() {
    if (state !== STATE.PLAYING || player.dashCd > 0 || player.dashT > 0) return;
    let dx = joy.x, dy = joy.y;
    if (keys.ArrowLeft || keys.KeyA) dx -= 1;
    if (keys.ArrowRight || keys.KeyD) dx += 1;
    if (keys.ArrowUp || keys.KeyW) dy -= 1;
    if (keys.ArrowDown || keys.KeyS) dy += 1;
    const len = Math.hypot(dx, dy);
    if (len < 0.15) { dx = Math.cos(player.facing); dy = Math.sin(player.facing); }
    else { dx /= len; dy /= len; }
    player.dashDx = dx; player.dashDy = dy;
    player.dashT = 0.2;
    player.dashCd = Math.max(0.6, 1.6 - lvl("dashmaster") * 0.15);
    sfx.dash();
    spawnParticles(player.x, player.y, "#FFFFFF", 8, 60, 180);
  }

  function startAttack(type) {
    const d = heroDef();
    autoFace();
    if (d.ranged) {
      const foe = nearestFoe(player.x, player.y, RANGED_SWING_TRIGGER + 60);
      const foeD = foe ? Math.hypot(foe.x - player.x, foe.y - player.y) - (foe.r || 0) : Infinity;
      if (foeD <= RANGED_SWING_TRIGGER) {
        // Enemy is right on top of us — swing the bow/hands as melee instead
        // of firing a projectile into a target we're already touching.
        const dur = (type === "heavy" ? 0.5 : player.atkTime) * rageMult();
        player.swingDir *= -1;
        player.attack = { t: 0, dur, type, hitDone: false, dir: player.swingDir, chain: 0, ranged: false, hybridSwing: true };
        if (type === "heavy") { player.heavyCd = 2.4; sfx.heavySwing(); } else sfx.swing();
        return;
      }
      player.attack = { t: 0, dur: player.atkTime * rageMult(), type, hitDone: false, ranged: true };
      fireHeroProjectile(type);
    } else {
      const dur = (type === "heavy" ? 0.55 : player.atkTime) * rageMult();
      if (type === "light") {
        player.chain = player.chainTimer > 0 ? (player.chain + 1) % 3 : 0;
        player.chainTimer = 0.9;
        player.swingDir *= -1;
      }
      player.attack = { t: 0, dur, type, hitDone: false, dir: player.swingDir, chain: player.chain };
      if (type === "heavy") { player.heavyCd = 2.4; sfx.heavySwing(); }
      else sfx.swing();
    }
  }

  function autoFace() {
    const t = nearestFoe(player.x, player.y, 240);
    if (t) player.facing = Math.atan2(t.y - player.y, t.x - player.x);
  }

  function nearestFoe(x, y, maxD) {
    let best = null, bestD = maxD ? maxD * maxD : Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (boss && !boss.dead) {
      const d = dist2(x, y, boss.x, boss.y);
      if (d < bestD) best = boss;
    }
    return best;
  }

  function fireHeroProjectile(type) {
    const d = heroDef();
    const ang = player.facing;
    const heavy = type === "heavy";
    if (heavy) player.heavyCd = 2.4;
    const shots = heavy && d.proj.kind === "arrow" ? 5 : 1;
    for (let i = 0; i < shots; i++) {
      const a2 = ang + (shots > 1 ? (i - (shots - 1) / 2) * 0.14 : 0);
      projs.push({
        x: player.x + Math.cos(a2) * 18, y: player.y + Math.sin(a2) * 18,
        vx: Math.cos(a2) * d.proj.speed, vy: Math.sin(a2) * d.proj.speed,
        r: heavy && d.proj.kind === "fire" ? 9 : 5,
        dmg: player.dmg * (heavy && d.proj.kind === "fire" ? 2.4 : 1),
        color: d.proj.color, kind: d.proj.kind, from: "player", life: 1.4,
      });
    }
    if (d.proj.kind === "fire") sfx.fire(); else sfx.arrow();
  }

  function applyMeleeHits(heavy) {
    const hybridSwing = !!(player.attack && player.attack.hybridSwing);
    const chainFinisher = !heavy && !hybridSwing && player.attack && player.attack.chain === 2;
    // Reach fix: previously added player.r on top of player.range, letting the
    // sword connect nearly a body-width beyond its physical blade length. The
    // weapon's true reach is player.range alone, measured from the player's
    // center; only the target's own radius is added so contact registers at
    // the target's edge, not before it.
    let range = hybridSwing ? RANGED_SWING_RANGE * (heavy ? 1.15 : 1) : player.range * (heavy ? 1.3 : 1);
    let arcHalf = hybridSwing ? RANGED_SWING_ARC / 2 : (heavy ? 1.6 : player.arc / 2);
    if (!hybridSwing && player.arc >= TAU - 0.01) arcHalf = Math.PI;
    let dmg = player.dmg * (heavy ? 2.2 * (1 + lvl("heavymastery") * 0.15) : 1) * (chainFinisher ? 1.45 : 1);
    const critChance = lvl("crit") * 0.05;
    let hitAny = false;

    const tryHit = (t, isBoss) => {
      const d = Math.hypot(t.x - player.x, t.y - player.y);
      if (d > range + t.r) return;
      const a = Math.atan2(t.y - player.y, t.x - player.x);
      if (Math.abs(angDiff(a, player.facing)) > arcHalf + Math.atan2(t.r, Math.max(d, 1))) return;
      let final = dmg;
      if (Math.random() < critChance) { final *= 2; sfx.crit(); spawnFloatingText(t.x, t.y - t.r - 10, "CRIT!", "#FF6B5A", 12); }
      if (isBoss) final *= 1 + lvl("executioner") * 0.08;
      const kb = heavy ? 260 : (chainFinisher ? 160 : 70);
      if (isBoss) damageBoss(final);
      else damageEnemy(t, final, kb, a);
      if (lvl("lifesteal") > 0) { player.hp = clamp(player.hp + lvl("lifesteal"), 0, player.maxHp); updateHud(); }
      hitAny = true;
    };
    for (const e of enemies) if (e.alive) tryHit(e, false);
    if (boss && !boss.dead) tryHit(boss, true);

    if (heavy && lvl("shockwave") > 0) {
      spawnShockwave(player.x, player.y, "#FFD34D", 110);
      for (const e of enemies) {
        if (e.alive && circleHit(player.x, player.y, 110, e.x, e.y, e.r)) {
          damageEnemy(e, dmg * 0.4 * lvl("shockwave") * 0.5 + 4, 180, Math.atan2(e.y - player.y, e.x - player.x));
        }
      }
      sfx.slam();
      triggerShake(6, 0.2);
    }
    if (hitAny) {
      sfx.clank();
      hitstop = Math.max(hitstop, heavy ? 0.05 : 0.025);
      triggerShake(heavy ? 6 : 3, 0.15);
    }
  }

  /* ---------------- Enemies ---------------- */
  const ENEMY_DEFS = {
    barb: { hp: 26, sp: 100, dmg: 8, range: 48, windup: 0.55, score: 100, gold: 6, r: 15, look: { skin: "#F2B279", hair: "#FFD34D", cloth: "#8E3B3B", weapon: "sword" } },
    goblin: { hp: 15, sp: 172, dmg: 6, range: 42, windup: 0.38, score: 80, gold: 5, r: 12, look: { skin: "#7ED321", hair: "#4A8F12", cloth: "#5A3B2B", weapon: "dagger" } },
    skeleton: { hp: 10, sp: 148, dmg: 5, range: 44, windup: 0.42, score: 50, gold: 3, r: 12, look: { skin: "#E8E8E8", hair: "#E8E8E8", cloth: "#C9C9C9", weapon: "dagger", skeletal: true } },
    giant: { hp: 95, sp: 55, dmg: 18, range: 58, windup: 0.95, score: 280, gold: 18, r: 24, look: { skin: "#E8A972", hair: "#B4501E", cloth: "#8A6B4A", weapon: "fist", scale: 1.75, twoHanded: true } },
    archer: { hp: 18, sp: 115, dmg: 7, range: 999, windup: 0.55, score: 140, gold: 9, r: 13, ranged: true, keepMin: 170, keepMax: 260, proj: { kind: "arrow", speed: 250, color: "#FF7FB8" }, look: { skin: "#F2C79A", hair: "#7A1E4E", cloth: "#FF5FA8", cloth2: "#FFB6D9", weapon: "bow", female: true, ponytail: true } },
    wizardE: { hp: 22, sp: 105, dmg: 12, range: 999, windup: 0.8, score: 190, gold: 12, r: 14, ranged: true, keepMin: 160, keepMax: 240, proj: { kind: "fire", speed: 210, color: "#3C7DE2", flame: true }, look: { skin: "#F2B279", hair: "#1B2A4A", cloth: "#1F4EA3", cloth2: "#3C7DE2", weapon: "staff", hood: true, orb: "#3C7DE2" } },
    hog: { hp: 34, sp: 155, dmg: 12, range: 50, windup: 0.5, score: 170, gold: 10, r: 16, charger: true, look: { skin: "#8A5A34", hair: "#1B1B1B", cloth: "#6E4A2E", weapon: "hammer", mount: true } },
    witch: { hp: 26, sp: 95, dmg: 6, range: 999, windup: 0.7, score: 230, gold: 15, r: 14, ranged: true, keepMin: 190, keepMax: 280, summoner: true, proj: { kind: "bolt", speed: 230, color: "#B45AF2" }, look: { skin: "#C9A0E8", hair: "#3B1B5A", cloth: "#4A2B6E", weapon: "staff", hood: true, orb: "#B45AF2" } },
  };

  // fence pathway gap (top & bottom) — kept in sync with drawFenceRow's
  // gap so top/bottom spawns funnel visually through the opening
  const FENCE_GAP_RATIO = 0.22;
  function fenceGapX() {
    const gw = Math.max(60, W * FENCE_GAP_RATIO);
    return { x0: W / 2 - gw / 2, x1: W / 2 + gw / 2 };
  }

  function makeEnemy(type, waveN, sx, sy, opts) {
    const def = ENEMY_DEFS[type];
    const diff = 1 + (waveN - 1) * 0.11;
    let x = sx, y = sy;
    let fromEdge = false;
    if (x === undefined) {
      fromEdge = true;
      const side = Math.floor(rand(0, 4));
      const gap = fenceGapX();
      if (side === 0) { x = rand(gap.x0, gap.x1); y = 40; }
      else if (side === 1) { x = rand(gap.x0, gap.x1); y = H + 26; }
      else if (side === 2) { x = -26; y = rand(80, H - 40); }
      else { x = W + 26; y = rand(80, H - 40); }
    }
    const emerge = !!(opts && opts.emerge);
    return {
      type, def, alive: true,
      x, y, r: def.r,
      hp: Math.ceil(def.hp * diff), maxHp: Math.ceil(def.hp * diff),
      speed: def.sp * (0.92 + Math.random() * 0.16),
      dmg: Math.ceil(def.dmg * (1 + (waveN - 1) * 0.06)),
      facing: Math.atan2(H / 2 - y, W / 2 - x),
      state: "seek", st: 0,
      strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: rand(1, 2.5),
      kbx: 0, kby: 0, hitFlash: 0, stun: 0, mouthOpen: 0,
      summonT: rand(3, 5),
      chargeDx: 0, chargeDy: 0,
      score: def.score, gold: def.gold,
      // once true, enemy is strictly clamped to the visible screen and can
      // never attack or fire from off-screen; false only while approaching
      // from an off-screen spawn point
      entered: !fromEdge,
      // ground-rise summon VFX state (used by the Witch's skeleton summon)
      emerging: emerge, emergeT: emerge ? 0.42 : 0, emergeDur: 0.42,
    };
  }

  function updateEnemy(e, dt) {
    if (e.emerging) {
      e.emergeT -= dt;
      if (Math.random() < 0.55) {
        spawnParticles(e.x + rand(-e.r * 0.5, e.r * 0.5), e.y + e.r * 0.4, "#8B5A2B", 1, 20, 70);
      }
      if (e.emergeT <= 0) { e.emerging = false; e.emergeT = 0; }
      return;
    }
    e.st += dt;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.mouthOpen > 0) e.mouthOpen -= dt;
    if (e.slamT > 0) e.slamT -= dt;
    // knockback decay
    e.x += e.kbx * dt; e.y += e.kby * dt;
    e.kbx *= Math.pow(0.001, dt); e.kby *= Math.pow(0.001, dt);
    if (e.stun > 0) { e.stun -= dt; return; }

    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const toP = Math.atan2(dy, dx);

    const face = (target, rate) => {
      e.facing += angDiff(target, e.facing) * clamp(dt * (rate || 8), 0, 1);
    };

    if (e.def.charger) {
      if (e.state === "seek") {
        face(toP);
        if (d > 220) { e.x += (dx / d) * e.speed * dt; e.y += (dy / d) * e.speed * dt; }
        else { e.state = "windup"; e.st = 0; e.chargeDx = dx / d; e.chargeDy = dy / d; }
      } else if (e.state === "windup") {
        face(toP, 3);
        e.chargeDx = Math.cos(e.facing); e.chargeDy = Math.sin(e.facing);
        if (e.st >= e.def.windup) { e.state = "charge"; e.st = 0; sfx.dash(); }
      } else if (e.state === "charge") {
        e.x += e.chargeDx * 430 * dt; e.y += e.chargeDy * 430 * dt;
        if (Math.random() < 0.5) spawnParticles(e.x, e.y + 8, "#C9A26B", 1, 20, 60);
        if (circleHit(e.x, e.y, e.r, player.x, player.y, player.r) && e.st > 0.05) {
          resolveMeleeStrike(e, e.dmg);
          e.state = "recover"; e.st = 0;
        }
        if (e.st > 0.6 || e.x < 14 || e.x > W - 14 || e.y < 60 || e.y > H - 14) { e.state = "recover"; e.st = 0; }
      } else if (e.state === "recover") {
        if (e.st > 0.9) { e.state = "seek"; e.st = 0; }
      }
      clampEnemy(e);
      return;
    }

    if (e.def.ranged) {
      face(toP, 6);
      // Hybrid melee swing: at true point-blank range, firing a projectile
      // makes no sense — swing the bow/staff itself as a short melee hit.
      const meleeSwingDist = e.r + player.r + 14;
      if ((e.state === "seek" || e.state === "windup") && d < meleeSwingDist) {
        e.state = "swingWindup"; e.st = 0;
      }
      if (e.state === "seek") {
        if (d > e.def.keepMax) { e.x += (dx / d) * e.speed * dt; e.y += (dy / d) * e.speed * dt; }
        else if (d < e.def.keepMin) { e.x -= (dx / d) * e.speed * dt; e.y -= (dy / d) * e.speed * dt; }
        else {
          e.strafeT -= dt;
          if (e.strafeT <= 0) { e.strafeDir *= -1; e.strafeT = rand(1, 2.4); }
          e.x += Math.cos(toP + Math.PI / 2) * e.strafeDir * e.speed * 0.55 * dt;
          e.y += Math.sin(toP + Math.PI / 2) * e.strafeDir * e.speed * 0.55 * dt;
        }
        if (e.st > rand(1.2, 1.8) && d < e.def.keepMax + 60) { e.state = "windup"; e.st = 0; }
        if (e.def.summoner) {
          e.summonT -= dt;
          if (e.summonT <= 0) {
            e.summonT = rand(5.5, 7.5);
            const skels = enemies.filter((x) => x.type === "skeleton" && x.alive).length;
            if (skels < 5) {
              for (let i = 0; i < 2; i++) {
                const sx = e.x + rand(-26, 26), sy = e.y + rand(-26, 26);
                const sk = makeEnemy("skeleton", wave, sx, sy, { emerge: true });
                enemies.push(sk);
                spawnMagicCircle(sx, sy);
              }
              spawnFloatingText(e.x, e.y - e.r - 12, "SUMMON!", "#B45AF2", 11);
            }
          }
        }
      } else if (e.state === "windup") {
        if (e.st >= e.def.windup) {
          e.state = "seek"; e.st = 0;
          const a = Math.atan2(player.y - e.y, player.x - e.x);
          projs.push({
            x: e.x + Math.cos(a) * 14, y: e.y + Math.sin(a) * 14,
            vx: Math.cos(a) * e.def.proj.speed, vy: Math.sin(a) * e.def.proj.speed,
            r: e.def.proj.kind === "fire" ? 7 : 4.5, dmg: e.dmg,
            color: e.def.proj.color, kind: e.def.proj.kind, from: "enemy", life: 2.6,
          });
          if (e.def.proj.kind === "fire") sfx.fire(); else sfx.arrow();
        }
      } else if (e.state === "swingWindup") {
        face(toP, 4);
        if (e.st >= e.def.windup * 0.6) {
          e.state = "seek"; e.st = 0;
          sfx.swing();
          if (d < meleeSwingDist + 10 && Math.abs(angDiff(toP, e.facing)) < 1.25) {
            resolveMeleeStrike(e, e.dmg);
          }
        }
      }
      clampEnemy(e);
      return;
    }

    // melee AI
    if (e.state === "seek") {
      face(toP);
      if (d > e.def.range * 0.8) {
        e.x += (dx / d) * e.speed * dt;
        e.y += (dy / d) * e.speed * dt;
        // goblins juke sideways while closing in
        if (e.type === "goblin") {
          e.x += Math.cos(toP + Math.PI / 2) * Math.sin(e.st * 5) * 60 * dt;
          e.y += Math.sin(toP + Math.PI / 2) * Math.sin(e.st * 5) * 60 * dt;
        }
      } else { e.state = "windup"; e.st = 0; }
    } else if (e.state === "windup") {
      face(toP, 4);
      if (e.st >= e.def.windup) {
        e.state = "recover"; e.st = 0;
        sfx.swing();
        if (d < e.def.range + player.r + 6 && Math.abs(angDiff(toP, e.facing)) < 1.25) {
          resolveMeleeStrike(e, e.dmg);
        }
        if (e.type === "giant") { triggerShake(5, 0.2); spawnShockwave(e.x, e.y, "#C9A26B", 70); sfx.slam(); e.slamT = 0.3; }
      }
    } else if (e.state === "recover") {
      if (e.st > (e.type === "giant" ? 1.1 : 0.55)) {
        // occasionally back off / strafe to feel alive
        e.state = Math.random() < 0.3 ? "strafe" : "seek";
        e.st = 0;
      }
    } else if (e.state === "strafe") {
      face(toP, 5);
      e.x += Math.cos(toP + Math.PI / 2) * e.strafeDir * e.speed * 0.7 * dt;
      e.y += Math.sin(toP + Math.PI / 2) * e.strafeDir * e.speed * 0.7 * dt;
      if (e.st > rand(0.4, 0.8)) { e.state = "seek"; e.st = 0; e.strafeDir *= -1; }
    }
    clampEnemy(e);
  }
  function clampEnemy(e) {
    // Fence line sits at y≈52 (top) and y≈H-14 (bottom); once an enemy has
    // fully entered the playfield it is locked strictly inside those bounds
    // so it can never wander, linger, or attack from off-screen again.
    if (!e.entered) {
      const insideX = e.x > e.r && e.x < W - e.r;
      const insideY = e.y > 58 + e.r && e.y < H - 16 - e.r;
      if (insideX && insideY) e.entered = true;
      e.x = clamp(e.x, -40, W + 40);
      e.y = clamp(e.y, -40, H + 40);
      return;
    }
    e.x = clamp(e.x, e.r, W - e.r);
    e.y = clamp(e.y, 58 + e.r, H - 16 - e.r);
  }

  // resolves an enemy's melee strike against the player (dash i-frames,
  // parry timing, block reduction, acrobat dodge, then raw damage)
  function resolveMeleeStrike(e, dmg) {
    if (player.dashT > 0) { spawnFloatingText(player.x, player.y - 24, "DODGED", "#7ED321", 12); return; }
    if (Math.random() < lvl("acrobat") * 0.04) { spawnFloatingText(player.x, player.y - 24, "MISS", "#7ED321", 12); return; }
    if (player.blocking) {
      const parryWindow = 0.28 + lvl("blockmaster") * 0.04;
      if (player.blockAge <= parryWindow) {
        e.stun = 1.3;
        sfx.parry();
        triggerShake(4, 0.15);
        hitstop = Math.max(hitstop, 0.05);
        spawnParticles(player.x + Math.cos(player.facing) * 18, player.y + Math.sin(player.facing) * 18, "#FFD34D", 12, 80, 240);
        spawnFloatingText(player.x, player.y - 26, "PARRY!", "#FFD34D", 15);
        return;
      }
      sfx.block();
      spawnParticles(player.x, player.y, "#5AC8FA", 6, 40, 140);
      damagePlayer(dmg * Math.max(0.15, 0.35 - lvl("blockmaster") * 0.03));
      return;
    }
    damagePlayer(dmg);
  }

  /* ---------------- Damage resolution ---------------- */
  function damagePlayer(dmg) {
    if (state !== STATE.PLAYING) return;
    if (player.invuln > 0 || player.dashT > 0) return;
    if (player.shieldTimer > 0) {
      sfx.block();
      spawnParticles(player.x, player.y, "#5AC8FA", 8, 60, 160);
      spawnFloatingText(player.x, player.y - 26, "SHIELDED", "#5AC8FA", 12);
      return;
    }
    let final = dmg * (1 - lvl("plating") * 0.06);
    final = Math.max(1, Math.round(final));
    player.hp -= final;
    player.invuln = 0.5;
    sfx.hurt();
    triggerShake(7, 0.25);
    hitstop = Math.max(hitstop, 0.04);
    spawnParticles(player.x, player.y, "#FF6B5A", 12, 60, 200);
    spawnSlashEffect(player.x, player.y, player.facing + Math.PI);
    spawnFloatingText(player.x, player.y - 26, "-" + final, "#FF6B5A", 14);
    player.mouthOpen = 0.35;
    updateHud();
    if (player.hp <= 0) { player.hp = 0; gameOver(); }
  }

  function damageEnemy(e, dmg, kb, ang) {
    if (!e.alive) return;
    const final = Math.max(1, Math.round(dmg));
    e.hp -= final;
    e.hitFlash = 0.12;
    e.kbx += Math.cos(ang) * kb;
    e.kby += Math.sin(ang) * kb;
    sfx.hitFlesh();
    spawnParticles(e.x, e.y, "#FF6B5A", 5, 40, 150);
    spawnSlashEffect(e.x, e.y, ang);
    spawnFloatingText(e.x, e.y - e.r - 8, String(final), "#FFFFFF", 12);
    e.mouthOpen = 0.3;
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    e.alive = false;
    registerKillForCombo();
    runStats.kills++;
    const mult = comboMultiplier();
    score += e.score * mult;
    if (mult > 1) spawnFloatingText(e.x, e.y - e.r - 20, "x" + mult + " COMBO", "#FFD34D", 12);
    sfx.kill();
    triggerShake(4, 0.15);
    spawnBloodDecal(e.x, e.y, e.r * 1.3);
    spawnParticles(e.x, e.y, e.def.look.cloth, 16, 60, 240);
    spawnParticles(e.x, e.y, "#FFFFFF", 6, 40, 160);
    dropLoot(e.x, e.y, e.gold);
    grantKillReward();
    updateHud();
  }

  /* ---------------- Instant on-kill reward (ported/expanded from classic BLADE CLASH kill bonus) ----------------
     Every kill grants the player a small guaranteed stat tick, on top of the
     existing random loot drop from dropLoot(). Scales gently with combo. */
  const KILL_REWARD_HEAL = 2;
  const KILL_REWARD_SHIELD = 0.35;
  function grantKillReward() {
    const mult = comboMultiplier();
    player.mouthOpen = 0.3;
    if (player.hp < player.maxHp) {
      player.hp = clamp(player.hp + KILL_REWARD_HEAL, 0, player.maxHp);
    }
    player.shieldTimer = Math.max(player.shieldTimer, 0) + KILL_REWARD_SHIELD * mult;
  }

  /* ---------------- Loot & pickups ---------------- */
  function dropLoot(x, y, goldVal) {
    const coins = clamp(Math.round(goldVal / 4), 1, 5);
    let left = goldVal;
    for (let i = 0; i < coins; i++) {
      const v = i === coins - 1 ? Math.max(1, left) : Math.max(1, Math.round(goldVal / coins));
      left -= v;
      pickups.push({ kind: "gold", val: v, x: x + rand(-16, 16), y: y + rand(-16, 16), t: rand(0, TAU), life: 11 });
    }
    const roll = Math.random();
    if (roll < 0.05) pickups.push({ kind: "heart", x, y: y - 6, t: 0, life: 11 });
    else if (roll < 0.085) pickups.push({ kind: "rage", x, y: y - 6, t: 0, life: 11 });
    else if (roll < 0.115) pickups.push({ kind: "shield", x, y: y - 6, t: 0, life: 11 });
  }

  function collectPickup(p) {
    if (p.kind === "gold") {
      const v = Math.max(1, Math.round(p.val * (1 + lvl("goldbag") * 0.1)));
      setGold(getGold() + v);
      runStats.goldEarned += v;
      sfx.coin();
      spawnFloatingText(p.x, p.y - 10, "+" + v, "#FFD34D", 11);
    } else if (p.kind === "heart") {
      const heal = 25;
      player.hp = clamp(player.hp + heal, 0, player.maxHp);
      sfx.powerup();
      spawnFloatingText(player.x, player.y - 26, "+" + heal + " HP", "#7ED321", 13);
      spawnParticles(player.x, player.y, "#7ED321", 10, 50, 150);
    } else if (p.kind === "rage") {
      player.rageTimer = 6;
      sfx.powerup();
      spawnFloatingText(player.x, player.y - 26, "RAGE!", "#FF9F0A", 13);
      spawnParticles(player.x, player.y, "#FF9F0A", 12, 60, 180);
    } else if (p.kind === "shield") {
      player.shieldTimer = 6;
      sfx.powerup();
      spawnFloatingText(player.x, player.y - 26, "SHIELD!", "#5AC8FA", 13);
      spawnParticles(player.x, player.y, "#5AC8FA", 12, 60, 180);
    }
    updateHud();
  }

  function updatePickups(dt) {
    const magnet = 88 + lvl("magnet") * 42;
    for (const p of pickups) {
      p.t += dt; p.life -= dt;
      const dx = player.x - p.x, dy = player.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < magnet) {
        const pull = clamp((magnet - d) / magnet, 0, 1) * 300;
        p.x += (dx / d) * pull * dt; p.y += (dy / d) * pull * dt;
      }
      if (d < player.r + 13) { collectPickup(p); p.life = 0; }
    }
    pickups = pickups.filter((p) => p.life > 0);
  }

  /* ---------------- Projectiles ---------------- */
  function resolveProjectileHit(p) {
    if (player.dashT > 0 || player.invuln > 0) { spawnFloatingText(player.x, player.y - 24, "DODGED", "#7ED321", 12); return; }
    if (Math.random() < lvl("acrobat") * 0.04) { spawnFloatingText(player.x, player.y - 24, "MISS", "#7ED321", 12); return; }
    if (player.shieldTimer > 0) {
      sfx.block();
      spawnParticles(player.x, player.y, "#5AC8FA", 8, 60, 160);
      spawnFloatingText(player.x, player.y - 26, "SHIELDED", "#5AC8FA", 12);
      return;
    }
    if (player.blocking) {
      const parryWindow = 0.28 + lvl("blockmaster") * 0.04;
      if (player.blockAge <= parryWindow) {
        sfx.parry();
        spawnParticles(player.x, player.y, "#FFD34D", 10, 60, 200);
        spawnFloatingText(player.x, player.y - 26, "PARRY!", "#FFD34D", 14);
        return;
      }
      sfx.block();
      spawnParticles(player.x, player.y, "#5AC8FA", 6, 40, 140);
      damagePlayer(p.dmg * Math.max(0.15, 0.4 - lvl("blockmaster") * 0.03));
      return;
    }
    spawnParticles(p.x, p.y, p.color, 8, 40, 150);
    damagePlayer(p.dmg);
  }

  function updateProjectiles(dt) {
    for (const p of projs) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.trail === undefined) p.trail = 0;
      p.trail += dt;
      if (p.from === "player") {
        for (const e of enemies) {
          if (e.alive && circleHit(p.x, p.y, p.r, e.x, e.y, e.r)) {
            damageEnemy(e, p.dmg, 120, Math.atan2(p.vy, p.vx));
            if (p.kind === "fire") { spawnParticles(p.x, p.y, "#FF9F0A", 10, 50, 170); triggerShake(3, 0.1); }
            p.life = 0; break;
          }
        }
        if (boss && !boss.dead && p.life > 0 && circleHit(p.x, p.y, p.r, boss.x, boss.y, boss.r)) {
          damageBoss(p.dmg * (1 + lvl("executioner") * 0.08));
          if (p.kind === "fire") spawnParticles(p.x, p.y, "#FF9F0A", 10, 50, 170);
          p.life = 0;
        }
      } else {
        if (circleHit(p.x, p.y, p.r, player.x, player.y, player.r)) {
          resolveProjectileHit(p); p.life = 0;
        }
      }
      if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) p.life = 0;
    }
    projs = projs.filter((p) => p.life > 0);
  }

  /* ---------------- Bosses ---------------- */
  const BOSS_DEFS = [
    { key: "pekka", name: "MEGA P.E.K.K.A", hp: 900, r: 44, speed: 74, dmg: 26, color: "#8A7BFF", look: { skin: "#B9C2E8", hair: "#3E4462", cloth: "#3E4462", weapon: "darkblade", helm: "#5A64A0", horns: true, scale: 2 } },
    { key: "giant", name: "MOUNTAIN GIANT", hp: 1200, r: 52, speed: 52, dmg: 30, color: "#E8A972", look: { skin: "#E8A972", hair: "#B4501E", cloth: "#8A6B4A", weapon: "fist", scale: 2.2, twoHanded: true } },
    { key: "golem", name: "ANCIENT GOLEM", hp: 1500, r: 50, speed: 46, dmg: 28, color: "#9AA0A6", look: { skin: "#8A8F96", hair: "#5A5F66", cloth: "#6A6F76", weapon: "sword", scale: 2.1 } },
    { key: "wizardking", name: "DARK WIZARD KING", hp: 850, r: 42, speed: 82, dmg: 20, color: "#3C7DE2", look: { skin: "#C9A0E8", hair: "#12203E", cloth: "#1F4EA3", cloth2: "#3C7DE2", weapon: "staff", hood: true, orb: "#3C7DE2", scale: 1.9 } },
  ];

  function spawnBoss(n) {
    const idx = (Math.floor(n / 5) - 1) % BOSS_DEFS.length;
    const def = BOSS_DEFS[idx < 0 ? 0 : idx];
    const scaleLoops = Math.floor((n - 1) / (5 * BOSS_DEFS.length));
    const hp = Math.round(def.hp * (1 + (n - 5) * 0.05 + scaleLoops * 0.6));
    boss = {
      def, name: def.name, look: def.look, color: def.color,
      x: W / 2, y: 120, r: def.r, hp, maxHp: hp,
      facing: Math.PI / 2, speed: def.speed,
      state: "intro", st: 0, phase: 1, enraged: false, dead: false, deathT: 1.6,
      hitFlash: 0, kbx: 0, kby: 0, stun: 0, atk: null, atkCd: 1.4, mouthOpen: 0,
      jumpHeight: 0, recoverDur: 0,
    };
    sfx.boss();
    triggerShake(9, 0.7);
    spawnFloatingText(W / 2, 160, def.name, def.color, 20);
    spawnFloatingText(W / 2, 190, "BOSS", "#FF3C28", 14);
  }

  function chooseBossAttack(b) {
    const opts = ["smash"];
    if (b.def.key !== "wizardking") opts.push("charge");
    if (b.def.key === "wizardking") { opts.push("volley", "volley"); }
    opts.push("summon");
    const pick = opts[Math.floor(rand(0, opts.length))];
    b.st = 0;
    if (pick === "smash") {
      const radius = b.r + 78;
      const tele = b.enraged ? 0.68 : 0.95;
      b.atk = {
        type: "smash", tele, tx: player.x, ty: player.y, radius,
        fromX: b.x, fromY: b.y, leapPeak: 46 + b.r * 0.9,
      };
      telegraphs.push({ x: player.x, y: player.y, r: radius, t: 0, dur: tele, color: "#FF3C28" });
      b.state = "telegraph";
    } else if (pick === "charge") {
      const a = Math.atan2(player.y - b.y, player.x - b.x);
      b.atk = { type: "charge", tele: 0.5, dx: Math.cos(a), dy: Math.sin(a), speed: 540, dur: 0.6 };
      b.state = "telegraph";
    } else if (pick === "volley") {
      b.atk = { type: "volley", tele: 0.5, count: b.enraged ? 16 : 11 };
      b.state = "telegraph";
    } else {
      b.atk = { type: "summon", tele: 0.6 };
      b.state = "telegraph";
    }
  }

  function executeBossAttack(b) {
    const a = b.atk;
    if (a.type === "smash") {
      // Boss has finished its leap and is now touching down exactly on the
      // circular target — lock the position, then fire damage/impact
      // effects on this landing frame so everything reads as one blow.
      b.x = a.tx; b.y = a.ty; b.jumpHeight = 0;
      sfx.slam(); triggerShake(13, 0.45); hitstop = Math.max(hitstop, 0.06);
      spawnShockwave(b.x, b.y, "#FF3C28", a.radius);
      spawnShockwave(b.x, b.y, "#FFD8A0", a.radius * 0.55);
      spawnParticles(a.tx, a.ty, "#C9A26B", 24, 70, 260);
      if (dist2(player.x, player.y, a.tx, a.ty) < a.radius * a.radius) resolveMeleeStrike(b, b.def.dmg);
      b.state = "recover"; b.st = 0; b.recoverDur = b.enraged ? 0.22 : 0.32;
      b.atkCd = b.enraged ? 1.0 : 1.7; b.slamT = 0.3;
    } else if (a.type === "charge") {
      sfx.dash(); b.state = "charge"; b.st = 0; a._hit = false;
    } else if (a.type === "volley") {
      sfx.fire();
      spawnParticles(b.x, b.y - b.r * 0.6, b.color, 20, 70, 240);
      for (let i = 0; i < a.count; i++) {
        const ang = (i / a.count) * TAU;
        projs.push({ x: b.x + Math.cos(ang) * b.r, y: b.y + Math.sin(ang) * b.r, vx: Math.cos(ang) * 250, vy: Math.sin(ang) * 250, r: 7, dmg: b.def.dmg * 0.6, color: b.color, kind: "fire", from: "enemy", life: 3 });
      }
      b.state = "idle"; b.st = 0; b.atkCd = b.enraged ? 1.2 : 2.0;
    } else if (a.type === "summon") {
      sfx.powerup();
      const num = b.enraged ? 3 : 2;
      for (let i = 0; i < num; i++) {
        const e = makeEnemy(Math.random() < 0.5 ? "goblin" : "skeleton", wave, b.x + rand(-46, 46), b.y + rand(24, 56));
        enemies.push(e);
        spawnParticles(e.x, e.y, b.color, 10, 40, 150);
      }
      spawnFloatingText(b.x, b.y - b.r - 16, "SUMMON!", b.color, 13);
      b.state = "idle"; b.st = 0; b.atkCd = 2.2;
    }
  }

  function updateBoss(dt) {
    if (!boss) return;
    const b = boss;
    if (b.hitFlash > 0) b.hitFlash -= dt;
    if (b.mouthOpen > 0) b.mouthOpen -= dt;
    if (b.slamT > 0) b.slamT -= dt;
    b.x += b.kbx * dt; b.y += b.kby * dt;
    b.kbx *= Math.pow(0.002, dt); b.kby *= Math.pow(0.002, dt);

    if (b.dead) {
      b.deathT -= dt;
      if (Math.random() < 0.7) spawnParticles(b.x + rand(-b.r, b.r), b.y + rand(-b.r, b.r), b.color, 2, 40, 170);
      if (b.deathT <= 0) finalizeBossDeath();
      return;
    }

    const dx = player.x - b.x, dy = player.y - b.y, d = Math.hypot(dx, dy) || 1, toP = Math.atan2(dy, dx);
    b.facing += angDiff(toP, b.facing) * clamp(dt * 3, 0, 1);

    if (b.state === "intro") {
      const prevSt = b.st;
      b.st += dt;
      // two ground-shaking stomps as the boss strides in, then a roar burst
      if (prevSt < 0.6 && b.st >= 0.6) { spawnShockwave(b.x, b.y + b.r * 0.7, "rgba(120,90,60,0.5)", b.r * 1.6); spawnParticles(b.x, b.y + b.r * 0.7, "#C9A26B", 14, 40, 140); triggerShake(6, 0.2); sfx.slam(); }
      if (prevSt < 1.3 && b.st >= 1.3) { spawnShockwave(b.x, b.y + b.r * 0.7, "rgba(120,90,60,0.5)", b.r * 1.6); spawnParticles(b.x, b.y + b.r * 0.7, "#C9A26B", 14, 40, 140); triggerShake(6, 0.2); sfx.slam(); }
      if (prevSt < 1.8 && b.st >= 1.8) { spawnShockwave(b.x, b.y, b.color, b.r * 2.4); triggerShake(9, 0.4); sfx.boss(); b.mouthOpen = 0.5; }
      if (b.st > 2.2) { b.state = "idle"; b.st = 0; b.atkCd = 1.0; }
      return;
    }

    if (b.stun > 0) { b.stun -= dt; return; }

    if (!b.enraged && b.hp <= b.maxHp * 0.45) {
      b.enraged = true; b.phase = 2;
      sfx.boss(); triggerShake(9, 0.5);
      spawnFloatingText(b.x, b.y - b.r - 22, "ENRAGED!", "#FF3C28", 18);
      spawnShockwave(b.x, b.y, "#FF3C28", 190);
    }
    const spdMul = b.enraged ? 1.35 : 1;

    if (b.state === "idle") {
      if (d > b.r + 58) { b.x += (dx / d) * b.speed * spdMul * dt; b.y += (dy / d) * b.speed * spdMul * dt; }
      b.atkCd -= dt * spdMul;
      if (b.atkCd <= 0) chooseBossAttack(b);
    } else if (b.state === "telegraph") {
      b.st += dt;
      if (b.atk.type === "smash") {
        // Physically leap from the current spot to the center of the
        // ground indicator — position eases in (quick launch, fast
        // landing) while height follows a parabolic arc so the boss is
        // airborne for the whole telegraph and touches down exactly on
        // the last frame, in sync with the circular indicator.
        const t = clamp(b.st / b.atk.tele, 0, 1);
        const ease = t * t * (3 - 2 * t);
        b.x = b.atk.fromX + (b.atk.tx - b.atk.fromX) * ease;
        b.y = b.atk.fromY + (b.atk.ty - b.atk.fromY) * ease;
        b.jumpHeight = Math.sin(t * Math.PI) * b.atk.leapPeak;
        if (Math.random() < 0.5) spawnParticles(b.x, b.y, "rgba(120,90,60,0.6)", 1, 20, 70);
      }
      if (b.st >= b.atk.tele) executeBossAttack(b);
    } else if (b.state === "recover") {
      b.st += dt;
      if (b.st >= b.recoverDur) { b.state = "idle"; b.st = 0; }
    } else if (b.state === "charge") {
      b.st += dt;
      const a = b.atk;
      b.x += a.dx * a.speed * dt; b.y += a.dy * a.speed * dt;
      if (Math.random() < 0.6) spawnParticles(b.x, b.y + b.r * 0.4, b.color, 1, 20, 90);
      if (!a._hit && circleHit(b.x, b.y, b.r, player.x, player.y, player.r)) {
        a._hit = true; resolveMeleeStrike(b, b.def.dmg * 1.2); triggerShake(6, 0.2);
      }
      if (b.st >= a.dur || b.x <= b.r || b.x >= W - b.r || b.y <= 80 || b.y >= H - b.r) {
        b.state = "idle"; b.st = 0; b.atkCd = b.enraged ? 1.0 : 1.7;
      }
    }
    b.x = clamp(b.x, b.r, W - b.r);
    b.y = clamp(b.y, 80, H - b.r);
  }

  function damageBoss(dmg) {
    if (!boss || boss.dead) return;
    const final = Math.max(1, Math.round(dmg));
    boss.hp -= final;
    boss.hitFlash = 0.1;
    spawnFloatingText(boss.x, boss.y - boss.r - 6, String(final), "#FFFFFF", 13);
    spawnParticles(boss.x, boss.y, "#FF6B5A", 4, 40, 150);
    spawnSlashEffect(boss.x, boss.y, Math.atan2(boss.y - player.y, boss.x - player.x));
    boss.mouthOpen = 0.3;
    if (boss.hp <= 0) { boss.hp = 0; startBossDeath(); }
  }
  function startBossDeath() {
    boss.dead = true; boss.deathT = 1.6; boss.state = "dead";
    hitstop = Math.max(hitstop, 0.14);
    triggerShake(11, 0.8);
    sfx.boss();
    spawnShockwave(boss.x, boss.y, "#FFD34D", 230);
    spawnParticles(boss.x, boss.y, "#FFD34D", 30, 60, 300);
    spawnBloodDecal(boss.x, boss.y, boss.r * 1.3);
    grantKillReward();
  }
  function finalizeBossDeath() {
    const b = boss;
    const goldReward = 60 + wave * 8;
    setGold(getGold() + goldReward);
    runStats.goldEarned += goldReward;
    runStats.bossesDefeated++;
    score += 1000 + wave * 100;
    spawnFloatingText(W / 2, H / 2, "BOSS DEFEATED!", "#FFD34D", 22);
    for (let i = 0; i < 26; i++) {
      pickups.push({ kind: "gold", val: Math.max(1, Math.round(goldReward / 26)), x: b.x + rand(-60, 60), y: b.y + rand(-40, 40), t: rand(0, TAU), life: 14 });
    }
    pickups.push({ kind: "heart", x: b.x, y: b.y, t: 0, life: 16 });
    boss = null;
    updateHud();
  }

  /* ---------------- Telegraphs (ground indicators) ---------------- */
  function updateTelegraphs(dt) {
    for (const t of telegraphs) t.t += dt;
    telegraphs = telegraphs.filter((t) => t.t < t.dur);
  }

  /* ---------------- Wave director ---------------- */
  function buildWaveQueue(n) {
    const q = [];
    const count = 3 + Math.floor(n * 1.4);
    const pool = ["barb", "goblin", "skeleton"];
    if (n >= 2) pool.push("archer");
    if (n >= 3) pool.push("hog");
    if (n >= 4) pool.push("giant", "wizardE");
    if (n >= 6) pool.push("witch");
    for (let i = 0; i < count; i++) {
      const type = pool[Math.floor(rand(0, pool.length))];
      q.push({ type, delay: i === 0 ? 0.3 : rand(0.5, 1.4) });
    }
    waveSpawnQueue = q;
    waveSpawnTimer = q.length ? q[0].delay : 0;
  }
  // Big, prominent, screen-centered wave announcement that animates up and
  // shrinks into the HUD wave counter's position after a short delay.
  function showWaveBanner(text, boss) {
    waveBannerEl.textContent = text;
    waveBannerEl.classList.toggle("boss-wave", !!boss);
    waveBannerEl.classList.remove("show");
    void waveBannerEl.offsetWidth; // restart the CSS animation
    waveBannerEl.classList.add("show");
  }

  function startWave(n) {
    wave = n;
    hudWaveEl.textContent = n;
    if (n % 5 === 0) { spawnBoss(n); waveSpawnQueue = []; playBgm("boss"); }
    else { buildWaveQueue(n); playBgm("combat"); }
    sfx.waveChime();
    showWaveBanner(n % 5 === 0 ? "BOSS WAVE " + n : "WAVE " + n, n % 5 === 0);
    updateHud();
  }
  function updateWaveDirector(dt) {
    if (waveClearedPause > 0) {
      waveClearedPause -= dt;
      if (waveClearedPause <= 0) startWave(wave + 1);
      return;
    }
    if (waveSpawnQueue.length) {
      waveSpawnTimer -= dt;
      if (waveSpawnTimer <= 0) {
        const it = waveSpawnQueue.shift();
        enemies.push(makeEnemy(it.type, wave));
        waveSpawnTimer = waveSpawnQueue.length ? waveSpawnQueue[0].delay : 0;
      }
    }
    const anyEnemies = enemies.some((e) => e.alive);
    const bossAlive = boss && !boss.dead;
    if (!waveSpawnQueue.length && !anyEnemies && !bossAlive && !(boss && boss.dead)) {
      waveClearedPause = 2.2;
      spawnFloatingText(W / 2, H / 2, "WAVE CLEAR!", "#7ED321", 24, true);
      score += 50 * wave;
      updateHud();
    }
  }

  /* ---------------- Player update ---------------- */
  function updatePlayer(dt) {
    if (player.invuln > 0) player.invuln -= dt;
    if (player.heavyCd > 0) player.heavyCd -= dt;
    if (player.dashCd > 0) player.dashCd -= dt;
    if (player.rageTimer > 0) player.rageTimer -= dt;
    if (player.shieldTimer > 0) player.shieldTimer -= dt;
    if (player.mouthOpen > 0) player.mouthOpen -= dt;
    if (player.chainTimer > 0) player.chainTimer -= dt; else player.chain = 0;
    if (player.blocking) player.blockAge += dt;

    if (lvl("regen") > 0) {
      player.regenTick -= dt;
      if (player.regenTick <= 0) {
        player.regenTick = 1;
        if (player.hp < player.maxHp) { player.hp = clamp(player.hp + lvl("regen"), 0, player.maxHp); updateHud(); }
      }
    }

    let mx = joy.x, my = joy.y;
    if (keys.ArrowLeft || keys.KeyA) mx -= 1;
    if (keys.ArrowRight || keys.KeyD) mx += 1;
    if (keys.ArrowUp || keys.KeyW) my -= 1;
    if (keys.ArrowDown || keys.KeyS) my += 1;
    let ml = Math.hypot(mx, my);
    player.moving = ml > 0.12 && player.dashT <= 0;

    if (player.dashT > 0) {
      player.dashT -= dt;
      const ds = 520;
      player.x += player.dashDx * ds * dt;
      player.y += player.dashDy * ds * dt;
      if (Math.random() < 0.85) spawnParticles(player.x, player.y, "#EAF6E4", 1, 10, 40);
    } else if (ml > 0.12) {
      if (ml > 1) { mx /= ml; my /= ml; }
      const spd = player.speed * (player.blocking ? 0.5 : 1) * (player.attack ? 0.45 : 1);
      player.x += mx * spd * dt;
      player.y += my * spd * dt;
      if (!player.attack) player.facing = Math.atan2(my, mx);
    }
    player.x = clamp(player.x, player.r + 6, W - player.r - 6);
    player.y = clamp(player.y, 70 + player.r, H - player.r - 6);

    if (player.attack) {
      const a = player.attack;
      a.t += dt;
      if (!a.ranged && !a.hitDone && a.t >= a.dur * 0.35) { a.hitDone = true; applyMeleeHits(a.type === "heavy"); }
      if (a.t >= a.dur) {
        player.attack = null;
        if (player.buffered) { const b = player.buffered; player.buffered = null; startAttack(b); }
      }
    }
  }

  /* ---------------- Update dispatch ---------------- */
  function update(dt) {
    updatePlayer(dt);
    for (const e of enemies) if (e.alive) updateEnemy(e, dt);
    updateBoss(dt);
    updateProjectiles(dt);
    updatePickups(dt);
    updateTelegraphs(dt);
    updateWaveDirector(dt);
    enemies = enemies.filter((e) => e.alive);
  }

  function updateFloatingAndParticles(dt) {
    for (const f of floatingTexts) { f.life -= dt; f.y += f.vy * dt; f.vy *= Math.pow(0.1, dt); }
    floatingTexts = floatingTexts.filter((f) => f.life > 0);
    for (const p of particles) {
      if (p.ring) { p.life -= dt; p.r = 6 + (1 - p.life / p.maxLife) * p.ringMaxR; continue; }
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const dec = Math.pow(p.decay, dt * 60);
      p.vx *= dec; p.vy *= dec;
    }
    particles = particles.filter((p) => p.life > 0);
    for (let i = slashFx.length - 1; i >= 0; i--) {
      slashFx[i].life -= dt;
      if (slashFx[i].life <= 0) slashFx.splice(i, 1);
    }
    for (let i = bloodDecals.length - 1; i >= 0; i--) {
      bloodDecals[i].life -= dt;
      if (bloodDecals[i].life <= 0) bloodDecals.splice(i, 1);
    }
    for (let i = magicCircles.length - 1; i >= 0; i--) {
      magicCircles[i].life -= dt;
      if (magicCircles[i].life <= 0) magicCircles.splice(i, 1);
    }
  }

  /* ---------------- Drawing helpers ---------------- */
  function line(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function drawHeart(g, x, y, s, c) {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x - s * 0.4, y - s * 0.2, s * 0.5, 0, TAU);
    g.arc(x + s * 0.4, y - s * 0.2, s * 0.5, 0, TAU);
    g.moveTo(x - s * 0.85, y);
    g.lineTo(x, y + s * 0.9);
    g.lineTo(x + s * 0.85, y);
    g.closePath();
    g.fill();
  }
  function starShape(g, x, y, r, n) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = (i / (n * 2)) * TAU - Math.PI / 2;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
    g.fill();
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let rr = (n >> 16) + amt, gg = ((n >> 8) & 0xff) + amt, bb = (n & 0xff) + amt;
    rr = clamp(rr, 0, 255); gg = clamp(gg, 0, 255); bb = clamp(bb, 0, 255);
    return "rgb(" + rr + "," + gg + "," + bb + ")";
  }

  function weaponAngle(facing, st) {
    if (st.attackP != null) return facing + (st.attackP - 0.5) * (st.arc || 2.2) * (st.dir || 1);
    if (st.windup) return facing - 1.2 * (st.dir || 1);
    if (st.recover) return facing + 0.6 * (st.dir || 1);
    return facing - 0.55 * (st.dir || 1);
  }

  function drawWeapon(g, cx, cy, wa, look, r, st) {
    // Upgraded weapon rendering — bolder outlines, richer multi-stop
    // gradients, specular glints and a glowing swing trail. Same call
    // signature / hand anchor math as before.
    const w = look.weapon;
    const hx = cx + Math.cos(wa) * r * 0.55, hy = cy + Math.sin(wa) * r * 0.55;
    const accent = look.hair || "#FFD34D";
    const OUTLINE = "rgba(20,14,8,0.55)";

    if (w === "bow") {
      g.strokeStyle = OUTLINE; g.lineWidth = Math.max(3.4, r * 0.26);
      g.beginPath(); g.arc(hx, hy, r * 0.78, wa - 1.15, wa + 1.15); g.stroke();
      const bowGrad = g.createLinearGradient(hx - r * 0.7, hy, hx + r * 0.7, hy);
      bowGrad.addColorStop(0, "#B4772F"); bowGrad.addColorStop(0.5, "#8B5A2B"); bowGrad.addColorStop(1, "#6E4420");
      g.strokeStyle = bowGrad; g.lineWidth = Math.max(2.4, r * 0.19);
      g.beginPath(); g.arc(hx, hy, r * 0.78, wa - 1.15, wa + 1.15); g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = Math.max(1, r * 0.045);
      line(g, hx + Math.cos(wa - 1.15) * r * 0.78, hy + Math.sin(wa - 1.15) * r * 0.78, hx + Math.cos(wa + 1.15) * r * 0.78, hy + Math.sin(wa + 1.15) * r * 0.78);
      g.fillStyle = accent; g.beginPath(); g.arc(hx, hy, r * 0.15, 0, TAU); g.fill();
      g.fillStyle = "rgba(255,255,255,0.65)"; g.beginPath(); g.arc(hx - r * 0.04, hy - r * 0.04, r * 0.06, 0, TAU); g.fill();
      return;
    }
    if (w === "staff") {
      const tx = cx + Math.cos(wa) * r * 1.5, ty = cy + Math.sin(wa) * r * 1.5;
      g.strokeStyle = OUTLINE; g.lineWidth = Math.max(3.6, r * 0.27); line(g, cx, cy, tx, ty);
      const shaftGrad = g.createLinearGradient(cx, cy, tx, ty);
      shaftGrad.addColorStop(0, "#8A5C34"); shaftGrad.addColorStop(1, "#5A3A1E");
      g.strokeStyle = shaftGrad; g.lineWidth = Math.max(2.6, r * 0.2); line(g, cx, cy, tx, ty);
      const orbCol = look.orb || "#FF9F0A";
      const pulse = 1 + Math.sin(gameClock * 6) * 0.08;
      g.save(); g.translate(tx, ty);
      g.fillStyle = orbCol; g.globalAlpha = 0.35;
      g.beginPath(); g.arc(0, 0, r * 0.5 * pulse, 0, TAU); g.fill();
      g.globalAlpha = 1;
      const og = g.createRadialGradient(-r * 0.1, -r * 0.1, r * 0.04, 0, 0, r * 0.34);
      og.addColorStop(0, "#FFFFFF"); og.addColorStop(0.4, orbCol); og.addColorStop(1, shade(orbCol, -50));
      g.fillStyle = og; g.beginPath(); g.arc(0, 0, r * 0.32, 0, TAU); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, r * 0.32, 0, TAU); g.stroke();
      g.restore();
      return;
    }
    if (w === "hands") {
      // Bare-handed casting: no weapon mesh at all — just the forearm and an
      // open palm, with the spell's glowing orb hovering just above it.
      const hx2 = cx + Math.cos(wa) * r * 1.02, hy2 = cy + Math.sin(wa) * r * 1.02;
      g.strokeStyle = OUTLINE; g.lineWidth = Math.max(3.4, r * 0.26); g.lineCap = "round";
      line(g, cx, cy, hx2, hy2);
      const armGrad3 = g.createLinearGradient(cx, cy, hx2, hy2);
      armGrad3.addColorStop(0, shade(look.skin, 6)); armGrad3.addColorStop(1, shade(look.skin, -18));
      g.strokeStyle = armGrad3; g.lineWidth = Math.max(2.4, r * 0.2); g.lineCap = "round";
      line(g, cx, cy, hx2, hy2);
      // open palm
      g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
      const palmGrad = g.createLinearGradient(hx2, hy2 - r * 0.3, hx2, hy2 + r * 0.3);
      palmGrad.addColorStop(0, shade(look.skin, 24)); palmGrad.addColorStop(0.55, look.skin); palmGrad.addColorStop(1, shade(look.skin, -16));
      g.fillStyle = palmGrad;
      g.beginPath(); g.arc(hx2, hy2, r * 0.32, 0, TAU); g.fill(); g.stroke();
      // fireball orb hovering just above the palm
      const orbCol2 = look.orb || "#FF9F0A";
      const ox = hx2 + Math.cos(wa) * r * 0.42, oy = hy2 + Math.sin(wa) * r * 0.42;
      const pulse2 = 1 + Math.sin(gameClock * 7) * 0.1;
      g.save(); g.translate(ox, oy);
      g.fillStyle = orbCol2; g.globalAlpha = 0.32;
      g.beginPath(); g.arc(0, 0, r * 0.46 * pulse2, 0, TAU); g.fill();
      g.globalAlpha = 1;
      const og2 = g.createRadialGradient(-r * 0.08, -r * 0.08, r * 0.03, 0, 0, r * 0.3);
      og2.addColorStop(0, "#FFFFFF"); og2.addColorStop(0.4, orbCol2); og2.addColorStop(1, shade(orbCol2, -50));
      g.fillStyle = og2; g.beginPath(); g.arc(0, 0, r * 0.28, 0, TAU); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, r * 0.28, 0, TAU); g.stroke();
      g.restore();
      return;
    }
    if (w === "fist" && look.twoHanded) {
      // Hulk-style two-handed overhead smash: both fists rise straight up
      // and together during windup (driven by st.windupT), then slam down
      // in front of the body on impact (driven by st.slamT).
      const windT = st.windupT || 0;
      const slamT = st.slamT || 0;
      // raise: 0 = fists at sides, 1 = fists together overhead
      const raise = st.windup ? windT : (slamT > 0 ? Math.max(0, 1 - slamT * 2.4) : 0);
      const overheadY = cy - r * 1.5 * raise;
      const overheadX = cx + Math.cos(wa) * r * (0.5 + 0.5 * raise);
      const spread = r * 0.32 * (1 - raise * 0.6);
      [-1, 1].forEach((side) => {
        const ax = overheadX + Math.cos(wa + Math.PI / 2) * spread * side;
        const ay = overheadY + Math.sin(wa + Math.PI / 2) * spread * side;
        g.strokeStyle = OUTLINE; g.lineWidth = Math.max(4, r * 0.34); g.lineCap = "round";
        line(g, cx, cy - r * 0.1, ax, ay);
        const armGrad2 = g.createLinearGradient(cx, cy, ax, ay);
        armGrad2.addColorStop(0, shade(look.skin, 6)); armGrad2.addColorStop(1, shade(look.skin, -18));
        g.strokeStyle = armGrad2; g.lineWidth = Math.max(3, r * 0.26); g.lineCap = "round";
        line(g, cx, cy - r * 0.1, ax, ay);
        g.strokeStyle = OUTLINE; g.lineWidth = 2;
        const fg = g.createLinearGradient(ax, ay - r * 0.36, ax, ay + r * 0.36);
        fg.addColorStop(0, shade(look.skin, 28)); fg.addColorStop(0.55, look.skin); fg.addColorStop(1, shade(look.skin, -20));
        g.fillStyle = fg;
        g.beginPath(); g.arc(ax, ay, r * 0.4, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.beginPath(); g.arc(ax - r * 0.1, ay - r * 0.12, r * 0.13, 0, TAU); g.fill();
      });
      // ground-impact burst flash right as the fists land
      if (slamT > 0.55) {
        g.fillStyle = "rgba(255,255,255," + ((slamT - 0.55) / 0.45 * 0.5) + ")";
        g.beginPath(); g.ellipse(cx + Math.cos(wa) * r * 0.9, cy + r * 0.5, r * 0.9, r * 0.3, 0, 0, TAU); g.fill();
      }
      return;
    }
    if (w === "fist") {
      const fx = cx + Math.cos(wa) * r * 1.05, fy = cy + Math.sin(wa) * r * 1.05;
      g.strokeStyle = OUTLINE; g.lineWidth = 2;
      const fg = g.createLinearGradient(fx, fy - r * 0.36, fx, fy + r * 0.36);
      fg.addColorStop(0, shade(look.skin, 28)); fg.addColorStop(0.55, look.skin); fg.addColorStop(1, shade(look.skin, -20));
      g.fillStyle = fg;
      g.beginPath(); g.arc(fx, fy, r * 0.38, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.beginPath(); g.arc(fx - r * 0.1, fy - r * 0.12, r * 0.12, 0, TAU); g.fill();
      return;
    }

    // Forearm shaft shared by melee weapons — thicker, gradient-shaded "arm".
    const armGrad = g.createLinearGradient(cx, cy, hx, hy);
    armGrad.addColorStop(0, shade(look.skin, 6));
    armGrad.addColorStop(1, shade(look.skin, -18));
    g.strokeStyle = OUTLINE; g.lineWidth = Math.max(3.6, r * 0.3); g.lineCap = "round"; line(g, cx, cy, hx, hy);
    g.strokeStyle = armGrad; g.lineWidth = Math.max(2.6, r * 0.22); g.lineCap = "round"; line(g, cx, cy, hx, hy);

    g.save();
    g.translate(hx, hy); g.rotate(wa);

    if (w === "hammer") {
      g.strokeStyle = OUTLINE; g.lineWidth = Math.max(3.2, r * 0.2);
      g.beginPath(); g.moveTo(-r * 0.1, 0); g.lineTo(r * 0.26, 0); g.stroke();
      g.strokeStyle = shade(look.cloth, -20); g.lineWidth = Math.max(2.2, r * 0.13);
      g.beginPath(); g.moveTo(-r * 0.1, 0); g.lineTo(r * 0.26, 0); g.stroke();
      const hw = r * 0.52, hh = r * 0.52;
      g.fillStyle = OUTLINE; roundRect(g, r * 0.16 - 1.5, -hh - 1.5, hw + 3, hh * 2 + 3, r * 0.16); g.fill();
      const hg = g.createLinearGradient(0, -hh, 0, hh);
      hg.addColorStop(0, "#EFF3F8"); hg.addColorStop(0.5, "#B7C1CD"); hg.addColorStop(1, "#767F8C");
      g.fillStyle = hg;
      roundRect(g, r * 0.18, -hh, hw, hh * 2, r * 0.14); g.fill();
      g.strokeStyle = accent; g.lineWidth = Math.max(1.6, r * 0.1);
      g.strokeRect(r * 0.18, -hh, hw, hh * 2);
      g.fillStyle = "rgba(255,255,255,0.4)";
      g.fillRect(r * 0.22, -hh * 0.8, hw * 0.22, hh * 1.4);
    } else if (w === "axe") {
      g.fillStyle = OUTLINE;
      g.beginPath();
      g.moveTo(r * 0.06, -r * 0.7);
      g.quadraticCurveTo(r * 1.1, -r * 0.1, r * 0.06, r * 0.7);
      g.quadraticCurveTo(r * 0.32, 0, r * 0.06, -r * 0.7);
      g.closePath(); g.fill();
      const ag = g.createLinearGradient(r * 0.2, -r * 0.65, r * 0.2, r * 0.65);
      ag.addColorStop(0, "#F0F4F8"); ag.addColorStop(0.5, "#C4CCD6"); ag.addColorStop(1, "#767F8C");
      g.fillStyle = ag;
      g.beginPath();
      g.moveTo(r * 0.08, -r * 0.66);
      g.quadraticCurveTo(r * 1.05, -r * 0.1, r * 0.08, r * 0.66);
      g.quadraticCurveTo(r * 0.32, 0, r * 0.08, -r * 0.66);
      g.closePath(); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = Math.max(0.8, r * 0.03);
      g.beginPath(); g.moveTo(r * 0.2, -r * 0.4); g.quadraticCurveTo(r * 0.75, -r * 0.08, r * 0.2, r * 0.2); g.stroke();
      g.fillStyle = accent; g.beginPath(); g.arc(r * 0.14, 0, r * 0.11, 0, TAU); g.fill();
      g.fillStyle = "rgba(255,255,255,0.5)"; g.beginPath(); g.arc(r * 0.11, -r * 0.03, r * 0.04, 0, TAU); g.fill();
    } else {
      // sword / dagger / darkblade — bold gradient blade, glowing on darkblade.
      const len = w === "dagger" ? r * 0.95 : (look.scale ? r * 1.6 : r * 1.32);
      const isDark = w === "darkblade";
      const bladeTop = isDark ? "#E4D6FF" : "#FFFFFF";
      const bladeMid = isDark ? "#A87EEA" : "#D7E0EA";
      const bladeBot = isDark ? "#4A2E7A" : "#767F8C";
      if (isDark) {
        g.fillStyle = "rgba(150,90,230,0.35)";
        g.beginPath();
        g.moveTo(r * 0.1, -r * 0.28); g.lineTo(len * 1.02, 0); g.lineTo(r * 0.1, r * 0.28); g.closePath(); g.fill();
      }
      g.fillStyle = OUTLINE;
      g.beginPath();
      g.moveTo(r * 0.12, -r * 0.19);
      g.lineTo(len * 0.82, -r * 0.11);
      g.lineTo(len + 1.5, 0);
      g.lineTo(len * 0.82, r * 0.11);
      g.lineTo(r * 0.12, r * 0.19);
      g.closePath(); g.fill();
      g.fillStyle = "#C9A24B"; g.fillRect(-r * 0.08, -r * 0.32, r * 0.24, r * 0.64);
      g.fillStyle = shade(look.cloth, -30); g.fillRect(r * 0.02, -r * 0.17, r * 0.16, r * 0.34);
      const bg = g.createLinearGradient(0, -r * 0.16, 0, r * 0.16);
      bg.addColorStop(0, bladeTop); bg.addColorStop(0.5, bladeMid); bg.addColorStop(1, bladeBot);
      g.fillStyle = bg;
      g.beginPath();
      g.moveTo(r * 0.14, -r * 0.16);
      g.lineTo(len * 0.82, -r * 0.09);
      g.lineTo(len, 0);
      g.lineTo(len * 0.82, r * 0.09);
      g.lineTo(r * 0.14, r * 0.16);
      g.closePath(); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.65)"; g.lineWidth = Math.max(0.8, r * 0.035);
      g.beginPath(); g.moveTo(r * 0.18, 0); g.lineTo(len * 0.9, 0); g.stroke();
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.beginPath(); g.ellipse(len * 0.4, -r * 0.05, len * 0.12, r * 0.03, -0.15, 0, TAU); g.fill();
    }
    g.restore();

    if (st.attackP != null && st.attackP > 0.12 && st.attackP < 0.92) {
      const dir = st.dir || 1;
      const trailA = 1 - Math.abs(st.attackP - 0.5) * 2;
      const grad = g.createLinearGradient(cx - r * 1.3, cy, cx + r * 1.3, cy);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, "rgba(255,255,255," + (0.45 * trailA) + ")");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.strokeStyle = grad; g.lineWidth = r * 0.55;
      g.beginPath(); g.arc(cx, cy, r * 1.22, wa - 0.65 * dir, wa, dir < 0); g.stroke();
      g.strokeStyle = "rgba(255,255,255," + (0.25 * trailA) + ")"; g.lineWidth = r * 0.22;
      g.beginPath(); g.arc(cx, cy, r * 1.4, wa - 0.4 * dir, wa, dir < 0); g.stroke();
    }
  }

  function drawSkeletonUnit(g, x, cy, r, facing, look, st) {
    // Fully skeletal rig — bones only, no flesh/skin anywhere. Thin bone
    // "stick" limbs with round joint knobs, an open ribcage over a bare
    // spine, a hollow-socket skull with glowing pinpoint eyes, a small
    // pointed cloth cap, and a rattling jitter on every joint while it
    // moves. Uses the same st flags (bob/flash/attackP/windup/mouthOpen)
    // as the humanoid rig so combat, hit-flash and swing timing are
    // untouched.
    const flash = st.flash;
    const OUTLINE = "rgba(15,12,10,0.6)";
    const BONE_LIT = flash ? "#FFFFFF" : "#F2EEDF";
    const BONE_MID = flash ? "#FFFFFF" : "#D8D2BE";
    const BONE_DARK = flash ? "#FFFFFF" : "#A9A08A";
    const stride = clamp(Math.abs(st.bob || 0) / 2, 0, 1);
    const swing = Math.sin(gameClock * 12 + x * 0.01 + y_seed(x, cy)) * stride;
    // bone rattle — tiny high-frequency jitter per limb, stronger while moving
    const rattle = (seed) => (Math.sin(gameClock * 34 + seed) * (0.35 + stride * 1.1));

    function jointBone(x0, y0, x1, y1, width, seed) {
      const jx = rattle(seed) * 0.5, jy = rattle(seed + 3) * 0.5;
      g.strokeStyle = OUTLINE; g.lineWidth = Math.max(2.2, width + 1.4); g.lineCap = "round";
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + jx, y1 + jy); g.stroke();
      const bg = g.createLinearGradient(x0, y0, x1, y1);
      bg.addColorStop(0, BONE_LIT); bg.addColorStop(1, BONE_MID);
      g.strokeStyle = bg; g.lineWidth = Math.max(1.4, width); g.lineCap = "round";
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 + jx, y1 + jy); g.stroke();
      // joint knob
      g.fillStyle = OUTLINE; g.beginPath(); g.arc(x1 + jx, y1 + jy, width * 0.62, 0, TAU); g.fill();
      g.fillStyle = BONE_LIT; g.beginPath(); g.arc(x1 + jx, y1 + jy, width * 0.48, 0, TAU); g.fill();
      return { x: x1 + jx, y: y1 + jy };
    }

    g.save();
    g.translate(x, cy);
    if (st.invulnBlink) g.globalAlpha = 0.45 + Math.abs(Math.sin(performance.now() / 60)) * 0.4;

    // --- legs: femur -> tibia bone chain with alternating stride ---
    [-1, 1].forEach((side) => {
      const ph = swing * side;
      const hip = { x: side * r * 0.24, y: r * 0.42 };
      g.fillStyle = OUTLINE; g.beginPath(); g.arc(hip.x, hip.y, r * 0.16, 0, TAU); g.fill();
      g.fillStyle = BONE_MID; g.beginPath(); g.arc(hip.x, hip.y, r * 0.12, 0, TAU); g.fill();
      const knee = jointBone(hip.x, hip.y, hip.x + ph * r * 0.16, hip.y + r * 0.34, Math.max(2.6, r * 0.16), side * 11);
      const foot = jointBone(knee.x, knee.y, knee.x + ph * r * 0.22, knee.y + r * 0.32 - Math.abs(ph) * r * 0.08, Math.max(2.2, r * 0.13), side * 17);
      // little bone foot
      g.fillStyle = OUTLINE; g.beginPath(); g.ellipse(foot.x + side * r * 0.08, foot.y + r * 0.03, r * 0.16, r * 0.08, 0, 0, TAU); g.fill();
      g.fillStyle = BONE_LIT; g.beginPath(); g.ellipse(foot.x + side * r * 0.07, foot.y + r * 0.02, r * 0.13, r * 0.06, 0, 0, TAU); g.fill();
    });

    // --- pelvis bone ---
    g.fillStyle = OUTLINE; roundRect(g, -r * 0.3, r * 0.28, r * 0.6, r * 0.22, r * 0.1); g.fill();
    g.fillStyle = BONE_MID; roundRect(g, -r * 0.27, r * 0.3, r * 0.54, r * 0.17, r * 0.08); g.fill();

    // --- off-hand arm (no weapon) ---
    const offSide = -Math.sign(Math.cos(facing) || 1);
    const offSway = -swing * 0.6;
    const shoulder0 = { x: offSide * r * 0.46, y: -r * 0.14 };
    const elbow0 = jointBone(shoulder0.x, shoulder0.y, shoulder0.x + offSway * r * 0.22, shoulder0.y + r * 0.24, Math.max(2.4, r * 0.14), offSide * 23 + 40);
    jointBone(elbow0.x, elbow0.y, elbow0.x + offSway * r * 0.18, elbow0.y + r * 0.2, Math.max(2, r * 0.11), offSide * 23 + 60);

    // --- spine ---
    g.strokeStyle = OUTLINE; g.lineWidth = Math.max(2.6, r * 0.14);
    g.beginPath(); g.moveTo(0, r * 0.3); g.lineTo(0, -r * 0.52); g.stroke();
    g.strokeStyle = BONE_MID; g.lineWidth = Math.max(1.6, r * 0.08);
    g.beginPath(); g.moveTo(0, r * 0.3); g.lineTo(0, -r * 0.52); g.stroke();

    // --- ribcage: curved bone slats over the bare spine ---
    for (let rib = 0; rib < 4; rib++) {
      const ry = -r * 0.2 + rib * r * 0.18;
      const w = r * (0.34 - rib * 0.02);
      g.strokeStyle = OUTLINE; g.lineWidth = Math.max(1.8, r * 0.08);
      g.beginPath(); g.moveTo(-w, ry); g.quadraticCurveTo(0, ry + r * 0.11, w, ry); g.stroke();
      g.strokeStyle = BONE_LIT; g.lineWidth = Math.max(1.1, r * 0.05);
      g.beginPath(); g.moveTo(-w, ry); g.quadraticCurveTo(0, ry + r * 0.1, w, ry); g.stroke();
    }
    // sternum
    g.fillStyle = BONE_DARK;
    g.beginPath(); g.ellipse(0, -r * 0.34, r * 0.09, r * 0.16, 0, 0, TAU); g.fill();

    // --- shoulder blades ---
    g.fillStyle = OUTLINE;
    g.beginPath(); g.arc(-r * 0.34, -r * 0.42, r * 0.13, 0, TAU); g.fill();
    g.beginPath(); g.arc(r * 0.34, -r * 0.42, r * 0.13, 0, TAU); g.fill();
    g.fillStyle = BONE_LIT;
    g.beginPath(); g.arc(-r * 0.34, -r * 0.42, r * 0.1, 0, TAU); g.fill();
    g.beginPath(); g.arc(r * 0.34, -r * 0.42, r * 0.1, 0, TAU); g.fill();

    // --- weapon arm (drawn behind or in front depending on angle) ---
    const wa = weaponAngle(facing, st);
    const behind = Math.sin(wa) < -0.2;
    const wShoulder = { x: -offSide * r * 0.46, y: -r * 0.14 };
    const handX = Math.cos(wa) * r * 0.5, handY = Math.sin(wa) * r * 0.5;
    if (behind) drawWeapon(g, 0, 0, wa, look, r, st); // FIX: already inside g.translate(x, cy) — use local origin, not world coords, or the weapon renders double-offset and appears detached/floating
    const wElbow = jointBone(wShoulder.x, wShoulder.y, (wShoulder.x + handX) / 2, (wShoulder.y + handY) / 2, Math.max(2.4, r * 0.14), 71);
    jointBone(wElbow.x, wElbow.y, handX, handY, Math.max(2, r * 0.11), 91);

    // --- skull ---
    const hy0 = -r * 0.72;
    const skullJitter = rattle(5) * 0.3;
    g.save(); g.translate(skullJitter, 0);
    g.fillStyle = OUTLINE; g.beginPath(); g.arc(0, hy0, r * 0.5, 0, TAU); g.fill();
    const skullGrad = g.createRadialGradient(-r * 0.14, hy0 - r * 0.14, r * 0.05, 0, hy0, r * 0.48);
    skullGrad.addColorStop(0, BONE_LIT); skullGrad.addColorStop(1, BONE_MID);
    g.fillStyle = skullGrad; g.beginPath(); g.arc(0, hy0, r * 0.46, 0, TAU); g.fill();
    // cranium dome flattening + jaw
    g.fillStyle = BONE_MID;
    g.beginPath(); g.ellipse(0, hy0 + r * 0.32, r * 0.26, r * 0.16, 0, 0, Math.PI); g.fill();
    g.strokeStyle = OUTLINE; g.lineWidth = Math.max(1, r * 0.03);
    g.beginPath(); g.ellipse(0, hy0 + r * 0.32, r * 0.26, r * 0.16, 0, 0, Math.PI); g.stroke();
    // hollow eye sockets — dark pits with tiny glowing pinpoint eyes
    const ex = Math.cos(facing) * r * 0.1;
    [-1, 1].forEach((side) => {
      g.fillStyle = "#100C08";
      g.beginPath(); g.ellipse(side * r * 0.18 + ex, hy0 - r * 0.04, r * 0.13, r * 0.15, 0, 0, TAU); g.fill();
      const glow = 0.55 + Math.sin(gameClock * 5 + side) * 0.25;
      g.fillStyle = "rgba(255,80,40," + glow + ")";
      g.beginPath(); g.arc(side * r * 0.18 + ex * 1.3, hy0 - r * 0.04, r * 0.045, 0, TAU); g.fill();
      g.shadowColor = "rgba(255,80,40,0.9)"; g.shadowBlur = r * 0.3;
      g.beginPath(); g.arc(side * r * 0.18 + ex * 1.3, hy0 - r * 0.04, r * 0.025, 0, TAU); g.fill();
      g.shadowBlur = 0;
    });
    // nasal cavity
    g.fillStyle = "#100C08";
    g.beginPath(); g.moveTo(-r * 0.045, hy0 + r * 0.14); g.lineTo(r * 0.045, hy0 + r * 0.14); g.lineTo(0, hy0 + r * 0.24); g.closePath(); g.fill();
    // teeth
    const mouthT = clamp((st.mouthOpen || 0) / 0.3, 0, 1);
    const jawDrop = r * (0.08 + mouthT * 0.16);
    g.strokeStyle = "#100C08"; g.lineWidth = Math.max(0.8, r * 0.03);
    for (let t = -2; t <= 2; t++) {
      g.beginPath(); g.moveTo(t * r * 0.07, hy0 + r * 0.3); g.lineTo(t * r * 0.07, hy0 + r * 0.3 + jawDrop * 0.5 + r * 0.06); g.stroke();
    }
    g.restore();

    // small pointed cloth cap, classic CoC skeleton style
    g.fillStyle = OUTLINE;
    g.beginPath();
    g.moveTo(-r * 0.34 + skullJitter, hy0 - r * 0.28); g.lineTo(r * 0.34 + skullJitter, hy0 - r * 0.28);
    g.lineTo(r * 0.08 + skullJitter, hy0 - r * 0.72); g.closePath(); g.fill();
    const capGrad = g.createLinearGradient(0, hy0 - r * 0.72, 0, hy0 - r * 0.26);
    capGrad.addColorStop(0, "#8A5A2E"); capGrad.addColorStop(1, "#5A3A1E");
    g.fillStyle = flash ? "#FFFFFF" : capGrad;
    g.beginPath();
    g.moveTo(-r * 0.3 + skullJitter, hy0 - r * 0.3); g.lineTo(r * 0.3 + skullJitter, hy0 - r * 0.3);
    g.lineTo(r * 0.06 + skullJitter, hy0 - r * 0.68); g.closePath(); g.fill();
    g.fillStyle = "#3A2410";
    g.beginPath(); g.arc(r * 0.06 + skullJitter, hy0 - r * 0.68, r * 0.05, 0, TAU); g.fill();

    if (st.attackP != null && st.attackP > 0.3 && st.attackP < 0.75) {
      g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = Math.max(1.5, r * 0.14);
      g.beginPath(); g.arc(0, r * 0.14, r * 0.95, wa - facing - 1.1, wa - facing + 0.2); g.stroke();
    }
    if (st.hitFlash > 0) {
      g.fillStyle = "rgba(255,255,255," + clamp(st.hitFlash * 6, 0, 0.75) + ")";
      g.beginPath(); g.arc(0, 0, r * 0.95, 0, TAU); g.fill();
    }
    g.restore();

    if (!behind) drawWeapon(g, x, cy, wa, look, r, st);
  }
  function y_seed(x, y) { return x * 0.013 + y * 0.017; }

  function drawCharacter(g, x, y, r, facing, look, st) {
    // Upgraded "Supercell-style" hero silhouette: bold black outlines, thick
    // capsule arms/legs with a real walk cycle, a breathing torso, a
    // blinking/expressive face and an optional flowing cape — all driven by
    // the SAME state flags the engine already produces, so no gameplay,
    // timing, or call-site code needed to change.
    st = st || {};
    const bob = st.bob || 0;
    const cy = y + bob;
    const flash = st.flash;
    const OUTLINE = "rgba(18,12,8,0.55)";

    if (st.rage) { g.fillStyle = "rgba(255,107,90,0.20)"; g.beginPath(); g.arc(x, cy, r * 1.55, 0, TAU); g.fill(); }
    if (st.shield) {
      g.strokeStyle = "rgba(90,200,250,0.85)"; g.lineWidth = 2.5;
      g.beginPath(); g.arc(x, cy, r * 1.4 + Math.sin(gameClock * 5) * 1.5, 0, TAU); g.stroke();
    }

    // ground shadow (slightly wider/softer for a more grounded feel)
    g.fillStyle = "rgba(0,0,0,0.26)";
    g.beginPath(); g.ellipse(x, y + r * 0.86, r * 0.82, r * 0.32, 0, 0, TAU); g.fill();

    if (look.skeletal) { drawSkeletonUnit(g, x, cy, r, facing, look, st); return; }

    if (look.mount) {
      // hog: chunky brown body, snorting snout with tusks, floppy ear,
      // curly tail and a bouncing gait synced to the rider's stride.
      const hogBounce = Math.sin(gameClock * 12 + x * 0.01) * (st.bob ? Math.abs(st.bob) * 0.5 : 0);
      g.fillStyle = OUTLINE; roundRect(g, x - r * 0.97, cy + r * 0.08 + hogBounce, r * 1.94, r * 0.84, r * 0.36); g.fill();
      const mg = g.createLinearGradient(0, cy + r * 0.1, 0, cy + r * 0.9);
      mg.addColorStop(0, "#9A6B3E"); mg.addColorStop(1, "#5A3A1E");
      g.fillStyle = mg; roundRect(g, x - r * 0.95, cy + r * 0.1 + hogBounce, r * 1.9, r * 0.8, r * 0.35); g.fill();
      g.fillStyle = "rgba(255,255,255,0.12)"; roundRect(g, x - r * 0.9, cy + r * 0.14 + hogBounce, r * 1.6, r * 0.2, r * 0.1); g.fill();
      const snoutX = x + Math.cos(facing) * r * 1.0, snoutY = cy + r * 0.42 + hogBounce;
      g.fillStyle = shade("#5A3A1E", -10);
      g.beginPath(); g.ellipse(x - Math.cos(facing) * r * 0.55, cy - r * 0.1 + hogBounce, r * 0.24, r * 0.34, facing + 0.6, 0, TAU); g.fill();
      g.fillStyle = "#3A2414"; g.beginPath(); g.arc(snoutX, snoutY, r * 0.28, 0, TAU); g.fill();
      g.fillStyle = "#2A1810";
      g.beginPath(); g.ellipse(snoutX + Math.cos(facing) * r * 0.14, snoutY, r * 0.09, r * 0.06, facing, 0, TAU); g.fill();
      g.fillStyle = "#F4EEDD";
      [-1, 1].forEach((side) => {
        const tux = snoutX + Math.cos(facing) * r * 0.1 - Math.sin(facing) * side * r * 0.2;
        const tuy = snoutY + Math.sin(facing) * r * 0.1 + Math.cos(facing) * side * r * 0.2;
        g.beginPath();
        g.moveTo(tux, tuy);
        g.quadraticCurveTo(tux + Math.cos(facing) * r * 0.18, tuy - r * 0.14, tux + Math.cos(facing) * r * 0.24, tuy - r * 0.02);
        g.quadraticCurveTo(tux + Math.cos(facing) * r * 0.12, tuy + r * 0.02, tux, tuy);
        g.closePath(); g.fill();
      });
      const tailBase = x - Math.cos(facing) * r * 0.95, tailY = cy + r * 0.3 + hogBounce;
      g.strokeStyle = "#5A3A1E"; g.lineWidth = Math.max(2, r * 0.09); g.lineCap = "round";
      g.beginPath(); g.arc(tailBase - Math.cos(facing) * r * 0.1, tailY - r * 0.1, r * 0.14, 0, TAU * 0.75); g.stroke();
    }

    const wa = weaponAngle(facing, st);
    const behind = Math.sin(wa) < -0.2;
    if (behind) drawWeapon(g, x, cy, wa, look, r, st);

    // walk-cycle phase driven straight off the existing bob wobble so no new
    // per-entity state is required — swing amplitude scales with |bob|.
    const stride = clamp(Math.abs(bob) / 2, 0, 1);
    const swing = Math.sin(gameClock * 12 + x * 0.01 + y * 0.01) * stride;
    const breathe = 1 + Math.sin(gameClock * 2.6 + x * 0.02) * 0.015;

    g.save();
    g.translate(x, cy);

    if (st.invulnBlink) g.globalAlpha = 0.45 + Math.abs(Math.sin(performance.now() / 60)) * 0.4;

    // --- legs: thigh + calf capsules with alternating stride ---
    const legCol = flash ? "#FFFFFF" : shade(look.cloth, -34);
    const legColLit = flash ? "#FFFFFF" : shade(look.cloth, -18);
    [-1, 1].forEach((side) => {
      const ph = swing * side;
      const hipX = side * r * 0.3, hipY = r * 0.5;
      const footX = hipX + ph * r * 0.22, footY = r * 0.98 - Math.abs(ph) * r * 0.12;
      g.strokeStyle = OUTLINE; g.lineWidth = Math.max(3.2, r * 0.34); g.lineCap = "round";
      g.beginPath(); g.moveTo(hipX, hipY); g.lineTo(footX, footY); g.stroke();
      g.strokeStyle = side < 0 ? legCol : legColLit; g.lineWidth = Math.max(2.4, r * 0.26); g.lineCap = "round";
      g.beginPath(); g.moveTo(hipX, hipY); g.lineTo(footX, footY); g.stroke();
      // boot
      g.fillStyle = shade(look.cloth, -46);
      g.beginPath(); g.ellipse(footX, footY + r * 0.05, r * 0.2, r * 0.14, 0, 0, TAU); g.fill();
    });

    // --- off-hand (non-weapon) arm — swings opposite the legs, or raises a
    // small round buckler while blocking ---
    const offSide = -Math.sign(Math.cos(facing) || 1);
    const offSway = -swing * 0.6;
    const offShoulderX = offSide * r * 0.52, offShoulderY = -r * 0.18;
    const offHandX = offShoulderX + offSway * r * 0.3, offHandY = r * 0.36 + Math.abs(offSway) * r * 0.06;
    const armGrad = shade(look.skin, -10);
    g.strokeStyle = OUTLINE; g.lineWidth = Math.max(3.4, r * 0.3); g.lineCap = "round";
    g.beginPath(); g.moveTo(offShoulderX, offShoulderY); g.lineTo(offHandX, offHandY); g.stroke();
    g.strokeStyle = flash ? "#FFFFFF" : armGrad; g.lineWidth = Math.max(2.4, r * 0.22); g.lineCap = "round";
    g.beginPath(); g.moveTo(offShoulderX, offShoulderY); g.lineTo(offHandX, offHandY); g.stroke();
    if (st.blocking) {
      g.fillStyle = OUTLINE; g.beginPath(); g.arc(offHandX, offHandY, r * 0.34, 0, TAU); g.fill();
      const bg0 = g.createRadialGradient(offHandX - r * 0.1, offHandY - r * 0.1, r * 0.05, offHandX, offHandY, r * 0.3);
      bg0.addColorStop(0, "#9FE0FF"); bg0.addColorStop(1, "#3E7EA6");
      g.fillStyle = bg0; g.beginPath(); g.arc(offHandX, offHandY, r * 0.3, 0, TAU); g.fill();
    } else {
      g.fillStyle = flash ? "#FFFFFF" : shade(look.skin, -8);
      g.beginPath(); g.arc(offHandX, offHandY, r * 0.16, 0, TAU); g.fill();
    }

    // --- cape for royalty (billows behind, away from facing) ---
    if (look.crown) {
      const capeBack = facing + Math.PI;
      const flutter = Math.sin(gameClock * 5) * 0.18;
      const cx1 = Math.cos(capeBack + 0.35 + flutter) * r * 0.9, cy1 = r * 0.1 + Math.sin(capeBack + 0.35) * r * 0.3;
      const cx2 = Math.cos(capeBack - 0.35 - flutter) * r * 0.9, cy2 = r * 0.1 + Math.sin(capeBack - 0.35) * r * 0.3;
      g.fillStyle = shade(look.cloth, -30);
      g.beginPath();
      g.moveTo(-r * 0.4, -r * 0.1);
      g.quadraticCurveTo(cx1, r * 0.9 + cy1 * 0.3, 0, r * 1.15);
      g.quadraticCurveTo(cx2, r * 0.9 + cy2 * 0.3, r * 0.4, -r * 0.1);
      g.closePath(); g.fill();
    }

    // round cartoon torso with gradient shading + subtle breathing scale
    g.save();
    g.scale(breathe, breathe);
    g.strokeStyle = OUTLINE; g.lineWidth = Math.max(2, r * 0.1);
    g.beginPath(); g.ellipse(0, r * 0.14, r * 0.67, r * 0.73, 0, 0, TAU); g.stroke();
    const bg2 = g.createLinearGradient(0, -r * 0.6, 0, r * 0.75);
    bg2.addColorStop(0, flash ? "#FFFFFF" : shade(look.cloth, 22));
    bg2.addColorStop(0.6, flash ? "#FFFFFF" : look.cloth);
    bg2.addColorStop(1, flash ? "#FFFFFF" : shade(look.cloth, -18));
    g.fillStyle = bg2;
    g.beginPath(); g.ellipse(0, r * 0.14, r * 0.66, r * 0.72, 0, 0, TAU); g.fill();
    // chest highlight
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.beginPath(); g.ellipse(-r * 0.2, -r * 0.05, r * 0.22, r * 0.32, -0.3, 0, TAU); g.fill();
    if (look.skeletal) {
      // exposed ribcage — curved bone slats over the torso
      g.strokeStyle = "rgba(80,80,80,0.55)"; g.lineWidth = Math.max(1.2, r * 0.045);
      for (let rib = 0; rib < 4; rib++) {
        const ry = -r * 0.28 + rib * r * 0.22;
        g.beginPath(); g.moveTo(-r * 0.42, ry); g.quadraticCurveTo(0, ry + r * 0.12, r * 0.42, ry); g.stroke();
      }
      g.strokeStyle = "rgba(120,120,120,0.45)"; g.lineWidth = Math.max(1, r * 0.03);
      g.beginPath(); g.moveTo(0, -r * 0.32); g.lineTo(0, r * 0.5); g.stroke();
    }
    g.restore();

    // shoulder pads
    g.fillStyle = OUTLINE;
    g.beginPath(); g.arc(-r * 0.5, -r * 0.16, r * 0.24, 0, TAU); g.fill();
    g.beginPath(); g.arc(r * 0.5, -r * 0.16, r * 0.24, 0, TAU); g.fill();
    const padCol = shade(look.cloth, -36);
    g.fillStyle = flash ? "#FFFFFF" : padCol;
    g.beginPath(); g.arc(-r * 0.5, -r * 0.16, r * 0.2, 0, TAU); g.fill();
    g.beginPath(); g.arc(r * 0.5, -r * 0.16, r * 0.2, 0, TAU); g.fill();

    // belt
    g.fillStyle = shade(look.cloth, -38);
    g.fillRect(-r * 0.62, r * 0.42, r * 1.24, r * 0.2);
    g.fillStyle = look.cloth2 || look.hair;
    g.fillRect(-r * 0.14, r * 0.4, r * 0.28, r * 0.24);
    g.strokeStyle = "rgba(0,0,0,0.3)"; g.lineWidth = 1; g.strokeRect(-r * 0.14, r * 0.4, r * 0.28, r * 0.24);

    // head — round with facing-tracked eyes + periodic blink
    const hy0 = -r * 0.68;
    g.fillStyle = OUTLINE; g.beginPath(); g.arc(0, hy0, r * 0.54, 0, TAU); g.fill();
    const skinGrad = g.createRadialGradient(-r * 0.15, hy0 - r * 0.15, r * 0.05, 0, hy0, r * 0.52);
    skinGrad.addColorStop(0, flash ? "#FFFFFF" : shade(look.skin, 16));
    skinGrad.addColorStop(1, flash ? "#FFFFFF" : shade(look.skin, -10));
    g.fillStyle = skinGrad;
    g.beginPath(); g.arc(0, hy0, r * 0.52, 0, TAU); g.fill();

    const ex = Math.cos(facing) * r * 0.15, ey = Math.sin(facing) * r * 0.1;
    const blinkPhase = (gameClock * 0.6 + x * 0.13 + y * 0.07) % 3.4;
    const blink = blinkPhase > 3.2 ? clamp((blinkPhase - 3.2) / 0.1, 0, 1) : 0;
    const eyeH = r * 0.08 * (1 - blink);
    if (look.skeletal) {
      g.fillStyle = "#1A1A1A";
      g.beginPath(); g.ellipse(-r * 0.17 + ex, hy0 - r * 0.05 + ey, r * 0.11, r * 0.13, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(r * 0.17 + ex, hy0 - r * 0.05 + ey, r * 0.11, r * 0.13, 0, 0, TAU); g.fill();
      const glow = 0.6 + Math.sin(gameClock * 8 + x) * 0.3;
      g.fillStyle = "rgba(140,255,220," + glow + ")";
      g.beginPath(); g.arc(-r * 0.17 + ex, hy0 - r * 0.03 + ey, r * 0.045, 0, TAU); g.fill();
      g.beginPath(); g.arc(r * 0.17 + ex, hy0 - r * 0.03 + ey, r * 0.045, 0, TAU); g.fill();
    } else {
      g.fillStyle = look.helm ? "#7CF2FF" : "#22160A";
      g.beginPath(); g.ellipse(-r * 0.17 + ex, hy0 - r * 0.05 + ey, r * 0.08, Math.max(0.4, eyeH), 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(r * 0.17 + ex, hy0 - r * 0.05 + ey, r * 0.08, Math.max(0.4, eyeH), 0, 0, TAU); g.fill();
    }
    if (!look.helm && !look.skeletal && blink < 0.5) {
      g.fillStyle = "rgba(255,255,255,0.7)";
      g.beginPath(); g.arc(-r * 0.19 + ex, hy0 - r * 0.08 + ey, r * 0.02, 0, TAU); g.fill();
      g.beginPath(); g.arc(r * 0.15 + ex, hy0 - r * 0.08 + ey, r * 0.02, 0, TAU); g.fill();
    }
    // angry brows
    g.strokeStyle = "#22160A"; g.lineWidth = Math.max(0.8, r * 0.055); g.lineCap = "round";
    g.beginPath();
    g.moveTo(-r * 0.32 + ex, hy0 - r * 0.24 + ey); g.lineTo(-r * 0.08 + ex, hy0 - r * 0.15 + ey);
    g.moveTo(r * 0.32 + ex, hy0 - r * 0.24 + ey); g.lineTo(r * 0.08 + ex, hy0 - r * 0.15 + ey);
    g.stroke();

    // cheek shading for depth
    g.fillStyle = "rgba(0,0,0,0.08)";
    g.beginPath(); g.ellipse(r * 0.28, hy0 + r * 0.18, r * 0.12, r * 0.08, 0, 0, TAU); g.fill();

    // mouth — small closed line normally, opens into a shout/gasp shape on
    // hit or kill reactions (driven by st.mouthOpen, 0..1, set on damage/kill)
    const mouthT = clamp((st.mouthOpen || 0) / 0.3, 0, 1);
    const my = hy0 + r * 0.24 + ey * 0.4;
    if (mouthT > 0.02) {
      const mw = r * (0.14 + 0.1 * mouthT), mh = r * (0.05 + 0.22 * mouthT);
      g.fillStyle = "#5A1A14";
      g.beginPath(); g.ellipse(ex * 0.6, my, mw, mh, 0, 0, TAU); g.fill();
      g.fillStyle = "#FF6B78";
      g.beginPath(); g.ellipse(ex * 0.6, my + mh * 0.35, mw * 0.6, mh * 0.4, 0, 0, TAU); g.fill();
    } else {
      g.strokeStyle = "#22160A"; g.lineWidth = Math.max(0.8, r * 0.05);
      g.beginPath(); g.moveTo(ex * 0.6 - r * 0.13, my); g.lineTo(ex * 0.6 + r * 0.13, my); g.stroke();
    }

    // headwear: hood > helm > spiky hair, exactly per-champion as before
    if (look.hood) {
      g.fillStyle = OUTLINE;
      g.beginPath(); g.arc(0, hy0 - r * 0.05, r * 0.63, Math.PI * 0.8, Math.PI * 2.2); g.fill();
      const hoodGrad = g.createLinearGradient(0, hy0 - r * 0.7, 0, hy0 + r * 0.1);
      hoodGrad.addColorStop(0, shade(look.cloth, 12)); hoodGrad.addColorStop(1, shade(look.cloth, -18));
      g.fillStyle = hoodGrad;
      g.beginPath(); g.arc(0, hy0 - r * 0.05, r * 0.6, Math.PI * 0.82, Math.PI * 2.18); g.fill();
    } else if (look.helm) {
      g.fillStyle = OUTLINE;
      g.beginPath(); g.arc(0, hy0 - r * 0.06, r * 0.57, Math.PI, TAU); g.fill();
      g.fillRect(-r * 0.57, hy0 - r * 0.12, r * 1.14, r * 0.17);
      const hg = g.createLinearGradient(0, hy0 - r * 0.58, 0, hy0);
      hg.addColorStop(0, "#F0F4F8"); hg.addColorStop(0.5, "#C4CCD6"); hg.addColorStop(1, shade(look.helm, -14));
      g.fillStyle = hg;
      g.beginPath(); g.arc(0, hy0 - r * 0.06, r * 0.54, Math.PI, TAU); g.fill();
      g.fillRect(-r * 0.54, hy0 - r * 0.1, r * 1.08, r * 0.14);
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.beginPath(); g.arc(-r * 0.2, hy0 - r * 0.32, r * 0.09, 0, TAU); g.fill();
    } else {
      g.fillStyle = OUTLINE;
      g.beginPath(); g.arc(0, hy0 - r * 0.16, r * 0.53, Math.PI * 1.02, Math.PI * 1.98); g.fill();
      const hairGrad = g.createLinearGradient(0, hy0 - r * 0.7, 0, hy0);
      hairGrad.addColorStop(0, shade(look.hair, 18)); hairGrad.addColorStop(1, shade(look.hair, -14));
      g.fillStyle = hairGrad;
      g.beginPath(); g.arc(0, hy0 - r * 0.16, r * 0.5, Math.PI * 1.05, Math.PI * 1.95); g.fill();
      g.beginPath(); g.ellipse(0, hy0 - r * 0.38, r * 0.46, r * 0.26, 0, 0, TAU); g.fill();
      // spiky fringe
      g.beginPath();
      g.moveTo(-r * 0.43, hy0 - r * 0.28);
      g.lineTo(-r * 0.28, hy0 - r * 0.66);
      g.lineTo(-r * 0.14, hy0 - r * 0.34);
      g.lineTo(0, hy0 - r * 0.72);
      g.lineTo(r * 0.14, hy0 - r * 0.34);
      g.lineTo(r * 0.28, hy0 - r * 0.66);
      g.lineTo(r * 0.43, hy0 - r * 0.28);
      g.closePath(); g.fill();
      g.fillStyle = "rgba(255,255,255,0.22)";
      g.beginPath(); g.ellipse(-r * 0.14, hy0 - r * 0.42, r * 0.14, r * 0.08, -0.3, 0, TAU); g.fill();

      if (look.ponytail) {
        // side-swept ponytail with a soft sway synced to the walk cycle
        const pSide = Math.sign(Math.cos(facing) || 1) * -1;
        const pBaseX = pSide * r * 0.4, pBaseY = hy0 - r * 0.3;
        const sway = Math.sin(gameClock * 4 + x * 0.02) * r * 0.14;
        const pTipX = pBaseX + pSide * r * 0.36 + sway, pTipY = pBaseY + r * 0.85;
        const pMidX = pBaseX + pSide * r * 0.5 + sway * 0.6, pMidY = pBaseY + r * 0.4;
        g.strokeStyle = OUTLINE; g.lineWidth = Math.max(3, r * 0.24); g.lineCap = "round";
        g.beginPath(); g.moveTo(pBaseX, pBaseY); g.quadraticCurveTo(pMidX, pMidY, pTipX, pTipY); g.stroke();
        const tailGrad = g.createLinearGradient(pBaseX, pBaseY, pTipX, pTipY);
        tailGrad.addColorStop(0, shade(look.hair, 16)); tailGrad.addColorStop(1, shade(look.hair, -12));
        g.strokeStyle = tailGrad; g.lineWidth = Math.max(2.2, r * 0.17); g.lineCap = "round";
        g.beginPath(); g.moveTo(pBaseX, pBaseY); g.quadraticCurveTo(pMidX, pMidY, pTipX, pTipY); g.stroke();
        g.fillStyle = look.cloth2 || look.cloth;
        g.beginPath(); g.arc(pBaseX, pBaseY, r * 0.09, 0, TAU); g.fill();
      }
    }

    if (look.horns) {
      const hornCol = "#6B2FBF", hornTip = "#9B6BFF";
      [-1, 1].forEach((side) => {
        const bx = side * r * 0.34, by = hy0 - r * 0.42;
        const tx = side * r * 0.72, ty = hy0 - r * 0.92;
        const mx = side * r * 0.5, my = hy0 - r * 0.75;
        g.fillStyle = OUTLINE;
        g.beginPath(); g.moveTo(bx - side * r * 0.1, by); g.quadraticCurveTo(mx, my, tx, ty); g.quadraticCurveTo(mx + side * r * 0.06, my + r * 0.08, bx + side * r * 0.12, by + r * 0.1); g.closePath(); g.fill();
        const hg = g.createLinearGradient(bx, by, tx, ty);
        hg.addColorStop(0, hornCol); hg.addColorStop(1, hornTip);
        g.fillStyle = hg;
        g.beginPath(); g.moveTo(bx - side * r * 0.07, by); g.quadraticCurveTo(mx, my, tx, ty); g.quadraticCurveTo(mx + side * r * 0.04, my + r * 0.06, bx + side * r * 0.09, by + r * 0.08); g.closePath(); g.fill();
        g.fillStyle = "rgba(255,255,255,0.4)";
        g.beginPath(); g.ellipse((bx + tx) / 2, (by + ty) / 2, r * 0.03, r * 0.1, side * 0.5, 0, TAU); g.fill();
      });
    }

    if (look.horns && (st.attackP != null || st.windup)) {
      g.strokeStyle = "rgba(190,230,255,0.85)"; g.lineWidth = Math.max(1, r * 0.035);
      for (let s = 0; s < 3; s++) {
        const sa = rand(0, TAU), sr0 = r * rand(0.5, 0.8), sr1 = sr0 + r * rand(0.15, 0.3);
        const jx = Math.cos(sa) * sr1 + rand(-r * 0.1, r * 0.1), jy = Math.sin(sa) * sr1 * 0.7 + rand(-r * 0.1, r * 0.1);
        g.beginPath(); g.moveTo(Math.cos(sa) * sr0, Math.sin(sa) * sr0 * 0.7); g.lineTo(jx, jy); g.stroke();
      }
    }

    if (look.crown) {
      const cyy = hy0 - r * 0.8;
      g.fillStyle = OUTLINE;
      g.beginPath();
      g.moveTo(-r * 0.42, cyy + r * 0.22); g.lineTo(-r * 0.42, cyy - r * 0.02); g.lineTo(-r * 0.2, cyy + r * 0.16);
      g.lineTo(0, cyy - r * 0.08); g.lineTo(r * 0.2, cyy + r * 0.16); g.lineTo(r * 0.42, cyy - r * 0.02);
      g.lineTo(r * 0.42, cyy + r * 0.22); g.closePath(); g.fill();
      const crownGrad = g.createLinearGradient(0, cyy - r * 0.1, 0, cyy + r * 0.2);
      crownGrad.addColorStop(0, "#FFEC9E"); crownGrad.addColorStop(1, "#E8A800");
      g.fillStyle = crownGrad;
      g.beginPath();
      g.moveTo(-r * 0.4, cyy + r * 0.2); g.lineTo(-r * 0.4, cyy); g.lineTo(-r * 0.2, cyy + r * 0.14);
      g.lineTo(0, cyy - r * 0.06); g.lineTo(r * 0.2, cyy + r * 0.14); g.lineTo(r * 0.4, cyy);
      g.lineTo(r * 0.4, cyy + r * 0.2); g.closePath(); g.fill();
      g.fillStyle = "#FF3C6E";
      g.beginPath(); g.arc(0, cyy + r * 0.08, r * 0.06, 0, TAU); g.fill();
    }

    // strike motion trail while mid-swing
    if (st.attackP != null && st.attackP > 0.3 && st.attackP < 0.75) {
      g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = Math.max(1.5, r * 0.14);
      g.beginPath(); g.arc(0, r * 0.14, r * 0.95, wa - facing - 1.1, wa - facing + 0.2); g.stroke();
    }

    // hit flash pulse
    if (st.hitFlash > 0) {
      g.fillStyle = "rgba(255,255,255," + clamp(st.hitFlash * 6, 0, 0.75) + ")";
      g.beginPath(); g.arc(0, 0, r * 0.95, 0, TAU); g.fill();
    }

    g.restore();

    if (!behind) drawWeapon(g, x, cy, wa, look, r, st);

    if (st.blocking) {
      const sx = x + Math.cos(facing) * r * 0.7, sy = cy + Math.sin(facing) * r * 0.7;
      g.fillStyle = "#5AC8FA"; g.strokeStyle = "#2A6E8A"; g.lineWidth = 2;
      g.beginPath(); g.ellipse(sx, sy, r * 0.5, r * 0.62, facing, 0, TAU); g.fill(); g.stroke();
    }
  }

  function enemyDrawState(e) {
    const st = { dir: 1, flash: e.hitFlash > 0, mouthOpen: e.mouthOpen };
    st.bob = (e.state === "seek" || e.state === "strafe") ? Math.sin(e.st * 12) * 2 : 0;
    if (e.def.flying) st.bob = Math.sin(gameClock * 3 + e.x * 0.02) * 3.4 + (st.bob || 0) * 0.4;
    if (e.state === "windup") { st.windup = true; st.windupT = e.def.windup ? clamp(e.st / e.def.windup, 0, 1) : 0; }
    else if (e.state === "swingWindup") { st.windup = true; st.windupT = e.def.windup ? clamp(e.st / (e.def.windup * 0.6), 0, 1) : 0; }
    else if (e.state === "recover") st.recover = true;
    st.slamT = e.slamT > 0 ? e.slamT / 0.3 : 0;
    return st;
  }
  function drawEnemyUnit(g, e) {
    if (e.emerging) {
      // slides up out of the ground: starts fully below-grade and rises
      // into place while fading in, timed to the magic-circle VFX
      const rt = clamp(1 - e.emergeT / e.emergeDur, 0, 1);
      const riseY = e.y + (1 - rt) * (e.r * 2.1);
      g.save();
      g.globalAlpha = clamp(rt * 1.3, 0, 1);
      g.beginPath();
      g.rect(e.x - e.r * 1.8, e.y - e.r * 2.6, e.r * 3.6, e.r * 2.6 + 2);
      g.clip();
      drawCharacter(g, e.x, riseY, e.r, e.facing, e.def.look, enemyDrawState(e));
      g.restore();
      return;
    }
    if (!e.entered) {
      // Still walking in from an off-screen edge spawn point: clip strictly
      // to the visible playfield so no stray weapon/limb (which can extend
      // beyond the body's radius during windup/attack poses) is ever
      // rendered floating outside the canvas before the unit is on-screen.
      g.save();
      g.beginPath();
      g.rect(0, 0, W, H);
      g.clip();
      drawCharacter(g, e.x, e.y, e.r, e.facing, e.def.look, enemyDrawState(e));
      g.restore();
    } else {
      drawCharacter(g, e.x, e.y, e.r, e.facing, e.def.look, enemyDrawState(e));
    }
    if (e.hp < e.maxHp) {
      const w = e.r * 1.7, x = e.x - w / 2, y = e.y - e.r - 12;
      g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(x - 1, y - 1, w + 2, 5);
      g.fillStyle = "#FF6B5A"; g.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), 3);
    }
  }
  function drawPlayerUnit(g) {
    const st = {
      dir: player.swingDir,
      bob: player.moving ? Math.sin(gameClock * 12) * 2 : 0,
      flash: player.invuln > 0 && Math.floor(gameClock * 20) % 2 === 0,
      blocking: player.blocking,
      rage: player.rageTimer > 0,
      shield: player.shieldTimer > 0,
      mouthOpen: player.mouthOpen,
    };
    if (player.attack && !player.attack.ranged) {
      st.attackP = clamp(player.attack.t / player.attack.dur, 0, 1);
      st.arc = player.attack.hybridSwing ? RANGED_SWING_ARC : (player.arc >= TAU - 0.01 ? Math.PI * 1.6 : player.arc);
      st.dir = player.attack.dir;
    }
    drawCharacter(g, player.x, player.y, player.r, player.facing, heroDef().look, st);
  }
  function drawBoss(g, b) {
    // every boss carries a dark, slowly-churning ground aura so it always
    // reads as dangerous — brighter and wider once enraged.
    const auraPulse = 1 + Math.sin(gameClock * 2.4) * 0.06;
    const jumpH = b.jumpHeight || 0;
    // ground shadow stays pinned to the boss's true (x,y) and shrinks the
    // higher it gets, selling the leap; the body itself is drawn lifted.
    const shadowScale = 1 - clamp(jumpH / 260, 0, 0.6);
    g.fillStyle = "rgba(10,4,4,0.28)";
    g.beginPath(); g.ellipse(b.x, b.y + b.r * 0.6, b.r * 1.5 * auraPulse * shadowScale, b.r * 0.5 * auraPulse * shadowScale, 0, 0, TAU); g.fill();
    if (b.enraged) { g.fillStyle = "rgba(255,60,40,0.18)"; g.beginPath(); g.arc(b.x, b.y - jumpH, b.r * 1.4 * auraPulse, 0, TAU); g.fill(); }
    if (b.state !== "intro" && !b.dead && Math.random() < 0.045) {
      spawnParticles(b.x + rand(-b.r * 0.6, b.r * 0.6), b.y - jumpH + rand(-b.r * 0.4, b.r * 0.4), b.enraged ? "#FF6B3C" : "rgba(60,50,50,0.7)", 1, 10, 30);
    }
    const st = { dir: 1, flash: b.hitFlash > 0, mouthOpen: b.mouthOpen };
    if (b.state === "telegraph" && b.atk && b.atk.type === "charge") st.windup = true;
    if (b.state === "telegraph" && b.atk && b.atk.type === "smash" && b.look.twoHanded) {
      // weapon raised overhead for the whole flight, then slams down on
      // the landing frame via st.slamT below — matches the leap timing.
      st.windup = true; st.windupT = clamp(b.st / b.atk.tele, 0, 1);
    }
    st.slamT = b.slamT > 0 ? b.slamT / 0.3 : 0;
    drawCharacter(g, b.x, b.y - jumpH, b.r, b.facing, b.look, st);
  }

  function drawTelegraphs(g) {
    for (const t of telegraphs) {
      const p = t.t / t.dur;
      g.strokeStyle = t.color; g.globalAlpha = 0.5 + 0.3 * Math.sin(t.t * 20); g.lineWidth = 3;
      g.beginPath(); g.arc(t.x, t.y, t.r, 0, TAU); g.stroke();
      g.fillStyle = t.color; g.globalAlpha = 0.12 * p;
      g.beginPath(); g.arc(t.x, t.y, t.r * p, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
  }
  function drawPickups(g) {
    for (const p of pickups) {
      const bob = Math.sin(p.t * 4) * 3;
      g.globalAlpha = p.life < 2 ? clamp(p.life / 2, 0, 1) : 1;
      if (p.kind === "gold") {
        g.fillStyle = "#F5B800"; g.beginPath(); g.arc(p.x, p.y + bob, 5, 0, TAU); g.fill();
        g.fillStyle = "#FFE9A8"; g.beginPath(); g.arc(p.x - 1.5, p.y + bob - 1.5, 2, 0, TAU); g.fill();
      } else if (p.kind === "heart") {
        drawHeart(g, p.x, p.y + bob, 7, "#FF6B5A");
      } else if (p.kind === "rage") {
        g.fillStyle = "#FF9F0A"; starShape(g, p.x, p.y + bob, 7, 5);
      } else if (p.kind === "shield") {
        g.fillStyle = "#5AC8FA"; g.beginPath(); g.ellipse(p.x, p.y + bob, 6, 7, 0, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
  }
  function drawProjectiles(g) {
    for (const p of projs) {
      if (p.kind === "arrow") {
        const a = Math.atan2(p.vy, p.vx);
        g.strokeStyle = p.color; g.lineWidth = 2.5;
        line(g, p.x - Math.cos(a) * 8, p.y - Math.sin(a) * 8, p.x + Math.cos(a) * 6, p.y + Math.sin(a) * 6);
      } else if (p.kind === "fire") {
        // realistic flame-shaped projectile: teardrop core with a licking
        // outer flicker, oriented along the travel direction.
        const a = Math.atan2(p.vy, p.vx);
        const flicker = 1 + Math.sin(gameClock * 26 + p.x * 0.3) * 0.12;
        g.save();
        g.translate(p.x, p.y); g.rotate(a);
        const outerGrad = g.createRadialGradient(p.r * 0.2, 0, 0, 0, 0, p.r * 1.9 * flicker);
        outerGrad.addColorStop(0, "rgba(255,255,255,0.85)");
        outerGrad.addColorStop(0.35, p.color);
        outerGrad.addColorStop(0.75, shade(p.color, -20));
        outerGrad.addColorStop(1, "rgba(255,90,20,0)");
        g.fillStyle = outerGrad;
        g.beginPath();
        g.moveTo(p.r * 1.9 * flicker, 0);
        g.quadraticCurveTo(p.r * 0.5, -p.r * 1.15, -p.r * 1.3, -p.r * 0.42);
        g.quadraticCurveTo(-p.r * 1.7, 0, -p.r * 1.3, p.r * 0.42);
        g.quadraticCurveTo(p.r * 0.5, p.r * 1.15, p.r * 1.9 * flicker, 0);
        g.closePath(); g.fill();
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.beginPath(); g.ellipse(p.r * 0.5, 0, p.r * 0.55, p.r * 0.32, 0, 0, TAU); g.fill();
        g.restore();
      } else {
        g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
        g.fillStyle = "rgba(255,255,255,0.6)"; g.beginPath(); g.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.4, 0, TAU); g.fill();
      }
    }
  }
  function drawBloodDecals(g) {
    for (const b of bloodDecals) {
      const a = clamp(b.life / b.maxLife, 0, 1);
      g.save();
      g.globalAlpha = a * 0.75;
      g.fillStyle = "#8E140C";
      g.beginPath();
      g.ellipse(b.x, b.y + b.r * 0.15, b.r, b.r * 0.5, 0, 0, TAU);
      g.fill();
      for (let i = 0; i < 5; i++) {
        const ang = b.seed + i * 1.25;
        const dx = Math.cos(ang) * b.r * 0.8, dy = Math.sin(ang) * b.r * 0.4;
        g.beginPath();
        g.ellipse(b.x + dx, b.y + b.r * 0.15 + dy, b.r * 0.28, b.r * 0.16, ang, 0, TAU);
        g.fill();
      }
      g.restore();
    }
  }
  function drawSlashFx(g) {
    for (const s of slashFx) {
      const a = clamp(s.life / s.maxLife, 0, 1);
      g.save();
      g.translate(s.x, s.y);
      g.rotate(s.angle);
      g.globalAlpha = a * 0.85;
      g.strokeStyle = "#FF2A1E";
      g.lineWidth = 3.5 * a + 1.5;
      g.lineCap = "round";
      g.beginPath();
      g.arc(0, 0, 16, -0.6, 0.6);
      g.stroke();
      g.globalAlpha = a * 0.5;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(0, 0, 10, -0.5, 0.5);
      g.stroke();
      g.restore();
    }
    g.globalAlpha = 1;
  }
  function drawParticles(g) {
    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.ring) {
        g.strokeStyle = p.color; g.globalAlpha = a * 0.7; g.lineWidth = 3;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.stroke();
        g.globalAlpha = 1; continue;
      }
      g.globalAlpha = a; g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }
  function drawFloatingTexts(g) {
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    for (const f of floatingTexts) {
      g.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
      g.font = "900 " + f.size + "px 'Poppins', sans-serif";
      const px = f.centered ? W / 2 : f.x;
      const py = f.centered ? H / 2 : f.y;
      g.lineWidth = 3; g.strokeStyle = "rgba(0,0,0,0.6)"; g.strokeText(f.text, px, py);
      g.fillStyle = f.color; g.fillText(f.text, px, py);
    }
    g.globalAlpha = 1; g.textAlign = "left";
  }
  function drawBossBar(g) {
    const b = boss;
    const w = W * 0.7, x = (W - w) / 2, y = 70;
    g.fillStyle = "rgba(0,0,0,0.5)"; roundRect(g, x - 3, y - 3, w + 6, 16, 6); g.fill();
    const pct = clamp(b.hp / b.maxHp, 0, 1);
    g.fillStyle = b.enraged ? "#FF3C28" : "#D0342C"; roundRect(g, x, y, w * pct, 10, 5); g.fill();
    g.fillStyle = "rgba(255,255,255,0.25)"; roundRect(g, x, y, w * pct, 4, 3); g.fill();
    g.font = "800 11px 'Poppins', sans-serif"; g.fillStyle = "#FFE28A";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(b.name, W / 2, y + 5);
    g.textAlign = "left"; g.textBaseline = "alphabetic";
  }

  function render() {
    const sh = currentShakeOffset();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(sh.x, sh.y);
    if (fieldCanvas) ctx.drawImage(fieldCanvas, 0, 0, W, H);
    drawAmbience(ctx);
    drawBloodDecals(ctx);
    drawTelegraphs(ctx);
    drawPickups(ctx);
    drawMagicCircles(ctx);

    const units = [];
    for (const e of enemies) if (e.alive) units.push({ y: e.y, k: "e", ref: e });
    units.push({ y: player.y, k: "p" });
    if (boss) units.push({ y: boss.y, k: "b", ref: boss });
    units.sort((a, b) => a.y - b.y);
    for (const u of units) {
      if (u.k === "e") drawEnemyUnit(ctx, u.ref);
      else if (u.k === "p") drawPlayerUnit(ctx);
      else drawBoss(ctx, u.ref);
    }

    drawProjectiles(ctx);
    drawParticles(ctx);
    drawSlashFx(ctx);
    drawFloatingTexts(ctx);
    ctx.restore();

    if (boss && !boss.dead) drawBossBar(ctx);
  }

  /* ---------------- HUD ---------------- */
  function updateHud() {
    hudScoreEl.textContent = score;
    hudGoldEl.textContent = getGold();
    hudWaveEl.textContent = wave;
    hudBestEl.textContent = getHighScore();
    const pct = clamp(player.hp / player.maxHp, 0, 1);
    hpFillEl.style.width = (pct * 100) + "%";
    hpFillEl.classList.toggle("hp-mid", pct <= 0.5 && pct > 0.25);
    hpFillEl.classList.toggle("hp-low", pct <= 0.25);
    hpVignetteEl.classList.toggle("active", pct <= 0.25 && state === STATE.PLAYING);
  }
  function updateCooldownUI() {
    cdHeavyEl.style.height = (clamp(player.heavyCd / 2.4, 0, 1) * 100) + "%";
    const dashMax = Math.max(0.6, 1.6 - lvl("dashmaster") * 0.15);
    cdDashEl.style.height = (clamp(player.dashCd / dashMax, 0, 1) * 100) + "%";
  }

  /* ---------------- Main loop (delta-time, high-refresh safe) ---------------- */
  let gameClock = 0, lastTime = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    gameClock += dt;

    if (state === STATE.PLAYING) {
      if (hitstop > 0) hitstop -= dt;
      else update(dt);
    }
    if (shakeTime > 0) shakeTime -= dt;
    if (comboTimer > 0) comboTimer -= dt;
    updateAmbience(dt);
    updateFloatingAndParticles(dt);
    render();
    if (state === STATE.PLAYING) updateCooldownUI();
  }

  /* ---------------- Screens & state ---------------- */
  const screens = { start: screenStart, pause: screenPause, over: screenOver, shop: screenShop, settings: screenSettings };
  function showScreen(name) {
    for (const k in screens) screens[k].classList.toggle("active", k === name);
  }
  function showControls(on) {
    [hud, pauseBtn, touchZone, actionCluster].forEach((el) => el.classList.toggle("hidden", !on));
    if (on && settings.joyMode === "fixed") {
      const a = fixedAnchor();
      joy.bx = a.x; joy.by = a.y;
      joyBase.classList.remove("hidden");
      setJoyVisual(0, 0);
    } else {
      joyBase.classList.add("hidden");
    }
  }

  function resetRun() {
    heroStats();
    player.x = W / 2; player.y = H * 0.62; player.facing = -Math.PI / 2;
    player.hp = player.maxHp;
    player.attack = null; player.buffered = null; player.chain = 0; player.chainTimer = 0;
    player.heavyCd = 0; player.dashCd = 0; player.dashT = 0;
    player.blocking = false; player.blockAge = 0; player.invuln = 0;
    player.rageTimer = 0; player.shieldTimer = 0; player.regenTick = 0; player.swingDir = 1;
    setBlock(false);
    enemies = []; projs = []; pickups = []; telegraphs = []; boss = null;
    particles = []; floatingTexts = []; slashFx = []; bloodDecals = [];
    score = 0; wave = 1; combo = 0; comboTimer = 0; maxCombo = 0;
    runStats = { kills: 0, bossesDefeated: 0, goldEarned: 0 };
    waveSpawnQueue = []; waveSpawnTimer = 0; waveClearedPause = 0;
    buildAmbience();
  }
  function startGame() {
    resetRun();
    state = STATE.PLAYING;
    showScreen(null);
    showControls(true);
    updateHud();
    startWave(1); // startWave() already cuts straight into the Enemy Fight BGM
  }
  function gameOver() {
    if (state === STATE.OVER) return;
    state = STATE.OVER;
    playBgm("home"); sfx.over();
    showControls(false); setBlock(false);
    const best = getHighScore(); let isBest = false;
    if (score > best) { setHighScore(score); isBest = true; }
    overScoreEl.textContent = score;
    overWaveEl.textContent = wave;
    overKillsEl.textContent = runStats.kills;
    overComboEl.textContent = maxCombo;
    overBossesEl.textContent = runStats.bossesDefeated;
    overGoldEl.textContent = runStats.goldEarned;
    newBestTag.classList.toggle("hidden", !isBest);
    hudBestEl.textContent = getHighScore();
    startBestEl.textContent = getHighScore();
    startGoldEl.textContent = getGold();
    setTimeout(() => showScreen("over"), 600);
  }
  function togglePause() {
    if (state === STATE.PLAYING) {
      state = STATE.PAUSED;
      showScreen("pause"); showControls(false);
      setBlock(false); pauseBgm();
    } else if (state === STATE.PAUSED) {
      state = STATE.PLAYING;
      showScreen(null); showControls(true);
      resumeBgm();
    }
  }

  /* ---------------- Barracks: champions + upgrades ---------------- */
  const shopGoldEl = document.getElementById("shop-gold");
  const shopListEl = document.getElementById("shop-list");
  const shopTabsEl = document.getElementById("shop-tabs");
  const heroListEl = document.getElementById("hero-list");
  const heroSelectModal = document.getElementById("hero-select-modal");
  const heroSelectListEl = document.getElementById("hero-select-list");
  const launchBtn = document.getElementById("launch-btn");
  const heroSelectCancel = document.getElementById("hero-select-cancel");

  /* ---------------- Character carousel (Barracks + Pre-Battle select) ----------------
     Shared, unified carousel engine used identically by both the Barracks screen and
     the Pre-Battle "Start the Game" modal. Strictly horizontal, always keeps the
     focused card centered, and uses bounded, one-way linear navigation: the first
     champion has a hard left boundary and the last champion has a hard right
     boundary — no infinite looping / wrap-around / clone cut-out. Stays smooth by
     driving everything off native scroll-snap plus rAF-batched class painting
     (no layout thrash, no clone nodes, no wrap jumps). */
  function setupCarousel(listEl, dotsEl, prevBtn, nextBtn) {
    if (!listEl) return null;

    function allCards() { return Array.prototype.slice.call(listEl.children); }

    function centerIndex() {
      const cs = allCards();
      if (!cs.length) return -1;
      const listRect = listEl.getBoundingClientRect();
      const centerX = listRect.left + listRect.width / 2;
      let best = 0, bestDist = Infinity;
      cs.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const d = Math.abs(cx - centerX);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      return best;
    }
    function updateArrowStates(idx, count) {
      if (prevBtn) prevBtn.disabled = idx <= 0;
      if (nextBtn) nextBtn.disabled = idx >= count - 1;
    }
    function paintCentered() {
      const cs = allCards();
      const idx = centerIndex();
      cs.forEach((c, i) => c.classList.toggle("centered", i === idx));
      if (dotsEl) {
        Array.prototype.slice.call(dotsEl.children).forEach((d, i) => d.classList.toggle("active", i === idx));
      }
      updateArrowStates(idx, cs.length);
      return idx;
    }
    function buildDots() {
      if (!dotsEl) return;
      dotsEl.innerHTML = "";
      allCards().forEach(() => {
        const d = document.createElement("span");
        d.className = "carousel-dot";
        dotsEl.appendChild(d);
      });
    }
    function scrollToIndex(i, smooth) {
      const cs = allCards();
      const clamped = Math.max(0, Math.min(cs.length - 1, i));
      if (!cs[clamped]) return;
      cs[clamped].scrollIntoView({ behavior: smooth === false ? "auto" : "smooth", inline: "center", block: "nearest" });
    }
    let raf = null;
    listEl.addEventListener("scroll", () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paintCentered);
    }, { passive: true });
    if (prevBtn) prevBtn.onclick = () => {
      const idx = centerIndex();
      if (idx <= 0) return; // hard left boundary at first champion
      sfx.ui();
      scrollToIndex(idx - 1);
    };
    if (nextBtn) nextBtn.onclick = () => {
      const cs = allCards();
      const idx = centerIndex();
      if (idx >= cs.length - 1) return; // hard right boundary at last champion
      sfx.ui();
      scrollToIndex(idx + 1);
    };
    return {
      refresh(focusKey) {
        buildDots();
        requestAnimationFrame(() => {
          const cs = allCards();
          let idx = 0;
          if (focusKey != null) {
            const found = cs.findIndex((c) => c.dataset.heroKey === focusKey);
            if (found >= 0) idx = found;
          }
          scrollToIndex(idx, false);
          requestAnimationFrame(paintCentered);
        });
      },
    };
  }
  const heroCarousel = setupCarousel(
    heroListEl,
    document.getElementById("hero-carousel-dots"),
    document.getElementById("hero-carousel-prev"),
    document.getElementById("hero-carousel-next")
  );
  const heroSelectCarousel = setupCarousel(
    heroSelectListEl,
    document.getElementById("hero-select-dots"),
    document.getElementById("hero-select-prev"),
    document.getElementById("hero-select-next")
  );

  const SHOP_TABS = [
    { key: "offense", name: "OFFENSE" },
    { key: "defense", name: "DEFENSE" },
    { key: "mobility", name: "MOBILITY" },
    { key: "utility", name: "UTILITY" },
  ];
  const SHOP_DEFS = [
    { tab: "offense", key: "blade", name: "SHARPENED BLADE", desc: "+2 attack damage", max: 8, base: 60 },
    { tab: "offense", key: "heavymastery", name: "HEAVY MASTERY", desc: "+15% heavy damage", max: 6, base: 90 },
    { tab: "offense", key: "crit", name: "CRITICAL EDGE", desc: "+5% crit chance", max: 6, base: 110 },
    { tab: "offense", key: "reach", name: "LONG REACH", desc: "+6 attack range", max: 6, base: 80 },
    { tab: "offense", key: "fury", name: "BATTLE FURY", desc: "-6% attack time", max: 6, base: 120 },
    { tab: "offense", key: "executioner", name: "EXECUTIONER", desc: "+8% boss damage", max: 6, base: 140 },
    { tab: "defense", key: "vitality", name: "VITALITY", desc: "+20 max HP", max: 8, base: 70 },
    { tab: "defense", key: "plating", name: "IRON PLATING", desc: "-6% damage taken", max: 6, base: 110 },
    { tab: "defense", key: "regen", name: "REGENERATION", desc: "+1 HP per second", max: 6, base: 130 },
    { tab: "defense", key: "blockmaster", name: "BLOCK MASTERY", desc: "Wider parry & softer blocks", max: 6, base: 120 },
    { tab: "mobility", key: "boots", name: "SWIFT BOOTS", desc: "+20 move speed", max: 6, base: 80 },
    { tab: "mobility", key: "dashmaster", name: "DASH MASTERY", desc: "-0.15s dash cooldown", max: 6, base: 100 },
    { tab: "mobility", key: "acrobat", name: "ACROBAT", desc: "+4% dodge chance", max: 6, base: 120 },
    { tab: "utility", key: "goldbag", name: "GOLD BAG", desc: "+10% gold gain", max: 6, base: 90 },
    { tab: "utility", key: "magnet", name: "LOOT MAGNET", desc: "Wider pickup range", max: 5, base: 80 },
    { tab: "utility", key: "lifesteal", name: "LIFESTEAL", desc: "+1 HP per melee hit", max: 5, base: 150 },
    { tab: "utility", key: "shockwave", name: "SHOCKWAVE", desc: "Heavy hits emit a shockwave", max: 5, base: 170 },
  ];
  function upgradeCost(def) { return Math.round(def.base * (1 + lvl(def.key) * 0.8)); }
  let currentShopTab = "offense";

  function renderShopTabs() {
    shopTabsEl.innerHTML = "";
    SHOP_TABS.forEach((t) => {
      const b = document.createElement("button");
      b.className = "shop-tab" + (t.key === currentShopTab ? " active" : "");
      b.textContent = t.name;
      b.onclick = () => { currentShopTab = t.key; sfx.ui(); renderShopTabs(); renderShop(); };
      shopTabsEl.appendChild(b);
    });
  }
  function renderShop() {
    shopGoldEl.textContent = getGold();
    shopListEl.innerHTML = "";
    SHOP_DEFS.filter((d) => d.tab === currentShopTab).forEach((def) => {
      const cur = lvl(def.key), maxed = cur >= def.max, cost = upgradeCost(def);
      const item = document.createElement("div"); item.className = "shop-item";
      const info = document.createElement("div"); info.className = "shop-item-info";
      const nm = document.createElement("div"); nm.className = "shop-item-name"; nm.textContent = def.name;
      const ds = document.createElement("div"); ds.className = "shop-item-desc"; ds.textContent = def.desc;
      const lvlWrap = document.createElement("div"); lvlWrap.className = "shop-item-level";
      for (let i = 0; i < def.max; i++) {
        const pip = document.createElement("span");
        pip.className = "shop-pip" + (i < cur ? " filled" : "");
        lvlWrap.appendChild(pip);
      }
      info.appendChild(nm); info.appendChild(ds); info.appendChild(lvlWrap);
      const buy = document.createElement("button"); buy.className = "shop-buy-btn";
      if (maxed) { buy.textContent = "MAX"; buy.disabled = true; }
      else {
        buy.textContent = cost + " G";
        buy.disabled = getGold() < cost;
        buy.onclick = () => {
          if (getGold() >= cost) {
            setGold(getGold() - cost);
            upgrades[def.key] = cur + 1;
            setUpgrades(upgrades);
            sfx.powerup();
            renderShop();
            startGoldEl.textContent = getGold();
          }
        };
      }
      item.appendChild(info); item.appendChild(buy);
      shopListEl.appendChild(item);
    });
  }

  function renderHeroList(container) {
    container.innerHTML = "";
    HERO_DEFS.forEach((h) => {
      const item = document.createElement("div");
      item.className = "hull-item" + (h.key === selectedHero ? " selected" : "");
      item.dataset.heroKey = h.key;
      const cv = document.createElement("canvas");
      cv.width = 84; cv.height = 76;
      drawCharacter(cv.getContext("2d"), 42, 42, 17, -Math.PI / 2, h.look, {});
      const nm = document.createElement("div"); nm.className = "hull-item-name"; nm.textContent = h.name;
      const ds = document.createElement("div"); ds.className = "hull-item-desc"; ds.textContent = h.desc;
      const btn = document.createElement("button");
      btn.className = "hull-select-btn" + (h.key === selectedHero ? " active" : "");
      btn.textContent = h.key === selectedHero ? "SELECTED" : "SELECT";
      btn.onclick = () => selectHero(h.key);
      item.appendChild(cv); item.appendChild(nm); item.appendChild(ds); item.appendChild(btn);
      container.appendChild(item);
    });
    if (container === heroListEl && heroCarousel) heroCarousel.refresh(selectedHero);
    else if (container === heroSelectListEl && heroSelectCarousel) heroSelectCarousel.refresh(selectedHero);
  }
  function selectHero(key) {
    selectedHero = key; setHero(key); heroStats(); sfx.ui();
    if (screenShop.classList.contains("active")) renderHeroList(heroListEl);
    if (!heroSelectModal.classList.contains("hidden")) renderHeroList(heroSelectListEl);
  }
  function openBarracks() {
    renderHeroList(heroListEl);
    renderShopTabs();
    renderShop();
    shopGoldEl.textContent = getGold();
    showScreen("shop");
  }
  function openHeroSelect() {
    renderHeroList(heroSelectListEl);
    heroSelectModal.classList.remove("hidden");
  }
  function closeHeroSelect() { heroSelectModal.classList.add("hidden"); }

  /* ---------------- Settings wiring ---------------- */
  const masterVol = document.getElementById("master-vol");
  const homeMusicVol = document.getElementById("home-music-vol");
  const gameMusicVol = document.getElementById("game-music-vol");
  const sfxVol = document.getElementById("sfx-vol");
  const joySizeInput = document.getElementById("joy-size");
  const joyModeDynamic = document.getElementById("joy-mode-dynamic");
  const joyModeFixed = document.getElementById("joy-mode-fixed");
  let settingsReturn = "start";

  function setJoyMode(m) {
    settings.joyMode = m; setSettings(settings);
    joyModeDynamic.classList.toggle("active", m === "dynamic");
    joyModeFixed.classList.toggle("active", m === "fixed");
    if (state === STATE.PLAYING) showControls(true);
  }
  const masterVolPct = document.getElementById("master-vol-pct");
  const homeMusicVolPct = document.getElementById("home-music-vol-pct");
  const gameMusicVolPct = document.getElementById("game-music-vol-pct");
  const sfxVolPct = document.getElementById("sfx-vol-pct");
  function refreshVolPercents() {
    if (masterVolPct) masterVolPct.textContent = settings.master + "%";
    if (homeMusicVolPct) homeMusicVolPct.textContent = settings.homeMusic + "%";
    if (gameMusicVolPct) gameMusicVolPct.textContent = settings.gameMusic + "%";
    if (sfxVolPct) sfxVolPct.textContent = settings.sfx + "%";
    if (masterVol) masterVol.style.setProperty("--fill", settings.master + "%");
    if (homeMusicVol) homeMusicVol.style.setProperty("--fill", settings.homeMusic + "%");
    if (gameMusicVol) gameMusicVol.style.setProperty("--fill", settings.gameMusic + "%");
    if (sfxVol) sfxVol.style.setProperty("--fill", settings.sfx + "%");
  }
  function openSettings(from) {
    settingsReturn = from;
    masterVol.value = settings.master;
    homeMusicVol.value = settings.homeMusic;
    gameMusicVol.value = settings.gameMusic;
    sfxVol.value = settings.sfx;
    joySizeInput.value = settings.joySize;
    refreshVolPercents();
    setJoyMode(settings.joyMode);
    showScreen("settings");
  }

  /* ---------------- UI wiring ---------------- */
  function wireUI() {
    startBtn.onclick = () => { sfx.ui(); openHeroSelect(); };
    launchBtn.onclick = () => { sfx.ui(); closeHeroSelect(); startGame(); };
    heroSelectCancel.onclick = () => { sfx.ui(); closeHeroSelect(); };
    retryBtn.onclick = () => { sfx.ui(); startGame(); };
    resumeBtn.onclick = () => { sfx.ui(); togglePause(); };
    restartFromPauseBtn.onclick = () => { sfx.ui(); startGame(); };
    pauseBtn.onclick = () => { sfx.ui(); togglePause(); };

    document.getElementById("barracks-btn").onclick = () => { sfx.ui(); openBarracks(); };
    document.getElementById("barracks-btn-over").onclick = () => { sfx.ui(); openBarracks(); };
    document.getElementById("back-from-shop").onclick = () => {
      sfx.ui();
      startBestEl.textContent = getHighScore();
      startGoldEl.textContent = getGold();
      showScreen(state === STATE.OVER ? "over" : "start");
    };

    document.getElementById("settings-btn-start").onclick = () => { sfx.ui(); openSettings("start"); };
    document.getElementById("settings-btn-pause").onclick = () => { sfx.ui(); openSettings("pause"); };
    document.getElementById("back-from-settings").onclick = () => { sfx.ui(); showScreen(settingsReturn); };

    masterVol.oninput = (e) => { settings.master = +e.target.value; setSettings(settings); updateAudioGain(); updateBgmGain(); refreshVolPercents(); };
    homeMusicVol.oninput = (e) => { settings.homeMusic = +e.target.value; setSettings(settings); updateBgmGain(); refreshVolPercents(); };
    gameMusicVol.oninput = (e) => { settings.gameMusic = +e.target.value; setSettings(settings); updateBgmGain(); refreshVolPercents(); };
    sfxVol.oninput = (e) => { settings.sfx = +e.target.value; setSettings(settings); updateAudioGain(); refreshVolPercents(); };
    joySizeInput.oninput = (e) => { settings.joySize = +e.target.value; setSettings(settings); positionJoyEls(); if (state === STATE.PLAYING) showControls(true); };
    joyModeDynamic.onclick = () => { sfx.ui(); setJoyMode("dynamic"); };
    joyModeFixed.onclick = () => { sfx.ui(); setJoyMode("fixed"); };

    wireResetHold();
    wireResetConfirm();

    window.addEventListener("blur", () => { if (state === STATE.PLAYING) togglePause(); });
  }

  /* ---------------- Hold-to-reset (5s) + confirmation modal ---------------- */
  function performDataReset() {
    setHighScore(0); setGold(0);
    upgrades = { ...DEFAULT_UPGRADES }; setUpgrades(upgrades);
    setHero("barbarian"); selectedHero = "barbarian";
    heroStats();
    sfx.ui();
    startBestEl.textContent = "0"; startGoldEl.textContent = "0";
    hudBestEl.textContent = "0";
    spawnFloatingText(W / 2, H / 2, "DATA RESET", "#FF6B5A", 16);
  }
  function wireResetConfirm() {
    const modal = document.getElementById("reset-confirm-modal");
    const yesBtn = document.getElementById("reset-confirm-yes");
    const noBtn = document.getElementById("reset-confirm-no");
    if (!modal) return;
    yesBtn.onclick = () => { sfx.ui(); modal.classList.add("hidden"); performDataReset(); };
    noBtn.onclick = () => { sfx.ui(); modal.classList.add("hidden"); };
  }
  function wireResetHold() {
    const btn = document.getElementById("reset-data-btn");
    const fill = document.getElementById("reset-fill");
    const modal = document.getElementById("reset-confirm-modal");
    if (!btn || !fill) return;
    const HOLD_MS = 5000;
    let holdRAF = null, startedAt = 0, holding = false;

    function setFill(pct) { fill.style.width = Math.max(0, Math.min(100, pct)) + "%"; }

    function tick(now) {
      if (!holding) return;
      const elapsed = now - startedAt;
      setFill((elapsed / HOLD_MS) * 100);
      if (elapsed >= HOLD_MS) {
        endHold(false);
        setFill(100);
        setTimeout(() => setFill(0), 150);
        if (modal) modal.classList.remove("hidden");
        return;
      }
      holdRAF = requestAnimationFrame(tick);
    }
    function beginHold(e) {
      if (e) e.preventDefault();
      if (holding) return;
      holding = true;
      startedAt = performance.now();
      btn.classList.add("holding");
      holdRAF = requestAnimationFrame(tick);
    }
    function endHold(cancelFill) {
      holding = false;
      btn.classList.remove("holding");
      if (holdRAF) cancelAnimationFrame(holdRAF);
      holdRAF = null;
      if (cancelFill) setFill(0);
    }
    btn.addEventListener("pointerdown", beginHold);
    btn.addEventListener("pointerup", () => endHold(true));
    btn.addEventListener("pointerleave", () => endHold(true));
    btn.addEventListener("pointercancel", () => endHold(true));
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /* ---------------- HOW TO PLAY auto-scroll (manual-scroll friendly) ----------------
     Sequence: hold 2s at top -> smooth slow scroll to bottom -> hold 2s at bottom ->
     instant jump back to top -> repeat forever. The viewport is a real native
     scroll container so the player can grab and manually scroll it at any time;
     doing so pauses the automation for exactly 2s, then resumes smoothly from the
     EXACT position it was left at — it never resets or snaps back to the top. */
  function startHowtoAutoScroll() {
    const viewport = document.getElementById("howto-viewport");
    if (!viewport) return;
    const SPEED = 24;          // px/sec while auto-scrolling down
    const PAUSE_MS = 2000;     // 2s pause at top and bottom
    const RESUME_DELAY_MS = 2000; // wait exactly 2s after user lets go before auto-scroll resumes
    let phase = "pausedTop", pauseUntil = 0, last = 0;
    let userActive = false, resumeTimer = null;
    let programmatic = false; // true while the auto-scroll itself is writing scrollTop
    let pos = 0; // our own float accumulator — viewport.scrollTop is browser-rounded to
                 // whole pixels, so reading it back each frame and nudging it by a
                 // sub-pixel amount (SPEED*dt) would round-trip to the same integer
                 // forever and the animation would never visibly move.

    function setScrollTop(v) {
      programmatic = true;
      viewport.scrollTop = v;
      requestAnimationFrame(() => { programmatic = false; });
    }
    function reengageFromCurrentPosition(delay) {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        // Resume exactly where the user left it — read the live scrollTop, never reset.
        pos = Math.max(0, Math.min(maxScroll, viewport.scrollTop));
        userActive = false;
        last = 0;
        if (maxScroll <= 1) {
          phase = "pausedTop";
          pauseUntil = performance.now() + PAUSE_MS;
        } else if (pos >= maxScroll - 0.5) {
          phase = "pausedBottom";
          pauseUntil = performance.now() + PAUSE_MS;
        } else if (pos <= 0.5) {
          phase = "pausedTop";
          pauseUntil = performance.now() + PAUSE_MS;
        } else {
          // Mid-scroll: continue the downward sweep immediately from here, no re-pause.
          phase = "down";
        }
      }, delay);
    }
    function onUserInteract() {
      userActive = true;
      reengageFromCurrentPosition(RESUME_DELAY_MS);
    }
    ["pointerdown", "touchstart", "wheel"].forEach((ev) => {
      viewport.addEventListener(ev, onUserInteract, { passive: true });
    });
    viewport.addEventListener("scroll", () => {
      if (programmatic) return; // ignore scroll events caused by the animation itself
      if (!userActive) onUserInteract();
      else reengageFromCurrentPosition(RESUME_DELAY_MS); // still dragging: keep pushing the timer out
    }, { passive: true });

    function tick(now) {
      if (!last) last = now;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!userActive) {
        const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        if (maxScroll <= 1) { requestAnimationFrame(tick); return; }
        if (phase === "pausedTop") {
          if (now >= pauseUntil) phase = "down";
        } else if (phase === "down") {
          pos = Math.min(maxScroll, pos + SPEED * dt);
          setScrollTop(pos);
          if (pos >= maxScroll - 0.5) { phase = "pausedBottom"; pauseUntil = now + PAUSE_MS; }
        } else if (phase === "pausedBottom") {
          if (now >= pauseUntil) {
            viewport.classList.add("howto-wrap-fade");
            setTimeout(() => {
              pos = 0;
              setScrollTop(0);
              requestAnimationFrame(() => viewport.classList.remove("howto-wrap-fade"));
            }, 160);
            phase = "pausedTop";
            pauseUntil = now + PAUSE_MS + 160;
          }
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(() => requestAnimationFrame(tick));
  }

  /* ---------------- Device back button / exit-confirm handling ----------------
     Keeps the player on the in-game Home Screen: back from any sub-screen or
     active run returns Home instead of leaving the app. Pressing back twice
     in a row while already on the Home Screen opens an exit confirmation. */
  const exitModal = document.getElementById("exit-confirm-modal");
  const exitYesBtn = document.getElementById("exit-confirm-yes");
  const exitNoBtn = document.getElementById("exit-confirm-no");
  const EXIT_PRESS_WINDOW_MS = 2200;
  let lastBackPressAt = 0;

  function isExitModalOpen() { return exitModal && !exitModal.classList.contains("hidden"); }
  function isHeroModalOpen() { return !heroSelectModal.classList.contains("hidden"); }
  function currentActiveScreenName() {
    for (const k in screens) if (screens[k].classList.contains("active")) return k;
    return null;
  }
  function showExitConfirm() { if (exitModal) exitModal.classList.remove("hidden"); }
  function hideExitConfirm() { if (exitModal) exitModal.classList.add("hidden"); }
  function showBackToast() {
    let toast = document.getElementById("zerone-back-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "zerone-back-toast";
      toast.className = "zerone-toast";
      toast.textContent = "Press back again to exit";
      appRoot.appendChild(toast);
    }
    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");
    clearTimeout(showBackToast._t);
    showBackToast._t = setTimeout(() => toast.classList.remove("show"), EXIT_PRESS_WINDOW_MS);
  }
  function goHomeScreen() {
    if (state === STATE.PLAYING || state === STATE.PAUSED) {
      state = STATE.START;
      showControls(false);
      setBlock(false);
    }
    playBgm("home");
    showScreen("start");
    startBestEl.textContent = getHighScore();
    startGoldEl.textContent = getGold();
  }
  function attemptExitApp() {
    stopAllBgm();
    try { if (window.Android && typeof window.Android.exitApp === "function") { window.Android.exitApp(); return; } } catch (e) {}
    try { if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.exitApp) { window.webkit.messageHandlers.exitApp.postMessage("exit"); return; } } catch (e) {}
    try { window.close(); } catch (e) {}
    setTimeout(() => { try { history.go(-(history.length + 1)); } catch (e) {} }, 60);
  }
  function pushBackGuard() {
    try { history.pushState({ zerone: true }, "", location.href); } catch (e) {}
  }
  function handleBackPress() {
    if (isExitModalOpen()) { hideExitConfirm(); pushBackGuard(); return; }
    if (isHeroModalOpen()) { closeHeroSelect(); sfx.ui(); pushBackGuard(); return; }
    const active = currentActiveScreenName();
    if (state === STATE.PLAYING || (active && active !== "start")) {
      goHomeScreen();
      pushBackGuard();
      return;
    }
    // already on the Home Screen — require a second back press to exit
    const now = Date.now();
    if (now - lastBackPressAt < EXIT_PRESS_WINDOW_MS) {
      showExitConfirm();
    } else {
      lastBackPressAt = now;
      showBackToast();
    }
    pushBackGuard();
  }
  function wireBackHandling() {
    pushBackGuard();
    window.addEventListener("popstate", handleBackPress);
    document.addEventListener("backbutton", (e) => { e.preventDefault(); handleBackPress(); }, false);
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") handleBackPress(); });
    if (exitYesBtn) exitYesBtn.onclick = () => { hideExitConfirm(); attemptExitApp(); };
    if (exitNoBtn) exitNoBtn.onclick = () => { sfx.ui(); hideExitConfirm(); pushBackGuard(); };

    // Native WebView bridge hook: the Android/iOS wrapper calls this directly when the
    // hardware back button is pressed. Native wrappers commonly intercept the hardware
    // key before it ever reaches the page as a "popstate"/"backbutton" DOM event, so
    // without this explicit hook exposed on window, the hardware back button silently
    // did nothing in-game even though the double-tap/exit-confirm logic above was
    // otherwise fully wired and working for in-page (popstate/Escape) triggers.
    window.zeroneHandleBackPress = function () { handleBackPress(); };
  }

  /* ---------------- Boot ---------------- */
  function init() {
    resize();
    heroStats();
    player.x = W / 2; player.y = H * 0.62;
    wireUI();
    wireBackHandling();
    startHowtoAutoScroll();
    positionJoyEls();
    startBestEl.textContent = getHighScore();
    startGoldEl.textContent = getGold();
    hudBestEl.textContent = getHighScore();
    showScreen("start");
    showControls(false);
    updateHud();
    playBgm("home");
    lastTime = performance.now();
    requestAnimationFrame(frame);
  }

  init();
})();
