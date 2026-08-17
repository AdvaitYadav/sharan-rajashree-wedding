const form = document.querySelector("#rsvpForm");
const statusEl = document.querySelector("#formStatus");
const messageInput = form.elements.message;
const messageCount = document.querySelector("#messageCount");
const adminTrigger = document.querySelector("#adminTrigger");
const adminModal = document.querySelector("#adminModal");
const adminClose = document.querySelector("#adminClose");
const adminSummary = document.querySelector("#adminSummary");
const rsvpList = document.querySelector("#rsvpList");
const exportCsvButton = document.querySelector("#exportCsv");
const exportJsonButton = document.querySelector("#exportJson");
const clearRsvpsButton = document.querySelector("#clearRsvps");
const petalLayer = document.querySelector("#petalLayer");
const scratchCard = document.querySelector("#scratchCard");
const scratchCanvas = document.querySelector("#scratchCanvas");
const weddingAudio = document.querySelector("#weddingAudio");
const musicToggle = document.querySelector("#musicToggle");
const inviteGate = document.querySelector("#inviteGate");
const revealTargets = document.querySelectorAll(
  ".section-heading, .scratch-card, .story-card, .event-section > div, .gallery-heading, .rsvp-copy, .rsvp-form, .venue-grid article, .map-shell, .blessing-grid"
);

const RSVP_STORAGE_KEY = "weddingRsvps";
// Paste the deployed Google Apps Script Web App URL here after deployment.
const GOOGLE_SHEET_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyk4dIFqcWMp2VpykPtOvGm19ZlOLpw38Ps0FTCxgTlG3LmYUdmeW5qvVRy2FdaLaM1/exec";
const YOUTUBE_MUSIC_VIDEO_ID = "J2lwoD_kXPg";
const NAME_PATTERN = /^[A-Za-z ]{2,80}$/;
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;
const PETAL_COLORS = [
  ["#ff8aae", "#d81b60"],
  ["#ff6f91", "#c5163e"],
  ["#ffb3c9", "#e13b71"],
  ["#ef5350", "#b71c1c"],
  ["#ff9aa8", "#d62828"]
];

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

function readStoredRsvps() {
  return JSON.parse(localStorage.getItem(RSVP_STORAGE_KEY) || "[]");
}

let rsvpEntries = readStoredRsvps();
let sheetConnectionReady = false;
let youtubePlayer = null;
let youtubePlayerReady = false;
let youtubeApiRequested = false;
let youtubePendingPlay = false;
let youtubeFailed = false;
let musicSource = "youtube";

function isRemoteRsvpEnabled() {
  return GOOGLE_SHEET_WEB_APP_URL.trim().startsWith("https://script.google.com/");
}

function readRsvps() {
  return rsvpEntries;
}

function writeRsvps(entries) {
  rsvpEntries = entries;
  localStorage.setItem(RSVP_STORAGE_KEY, JSON.stringify(entries, null, 2));
}

function normalizeEvents(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return String(value || "")
    .split(",")
    .map((eventName) => eventName.trim())
    .filter(Boolean);
}

function createRsvpId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 10);
  return `rsvp-${Date.now().toString(36)}-${randomPart}`;
}

function normalizeRemoteEntry(entry) {
  return {
    id: entry.id || entry.ID || createRsvpId(),
    name: entry.name || entry.Name || "",
    phone: entry.phone || entry.Phone || "",
    side: entry.side || entry.Side || "",
    guests: Number(entry.guests || entry.Guests || 1),
    attendance: entry.attendance || entry.Attendance || "",
    events: normalizeEvents(entry.events || entry.Events),
    message: entry.message || entry.Message || "",
    submittedAt: entry.submittedAt || entry["Submitted At"] || entry.submitted_at || ""
  };
}

async function fetchSheetRsvps() {
  if (!isRemoteRsvpEnabled()) {
    return readRsvps();
  }

  const url = new URL(GOOGLE_SHEET_WEB_APP_URL.trim());
  url.searchParams.set("action", "list");
  url.searchParams.set("_", String(Date.now()));

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not fetch RSVP sheet.");
  }

  const payload = await response.json();
  const remoteEntries = Array.isArray(payload.entries) ? payload.entries : Array.isArray(payload) ? payload : [];
  const entries = remoteEntries.map(normalizeRemoteEntry).filter((entry) => entry.name);
  sheetConnectionReady = true;
  writeRsvps(entries);
  return entries;
}

async function refreshRsvpsFromSheet({ silent = false } = {}) {
  try {
    await fetchSheetRsvps();
    if (adminModal.classList.contains("open")) {
      renderAdminList();
    }
  } catch (error) {
    sheetConnectionReady = false;
    console.warn("RSVP sheet fetch failed", error);
    if (!silent && statusEl.textContent === "") {
      statusEl.textContent = "Using saved RSVPs from this browser until the RSVP sheet is connected.";
    }
  }
}

async function saveRsvpToSheet(entry) {
  if (!isRemoteRsvpEnabled()) {
    return false;
  }

  const payload = new FormData();
  payload.append("payload", JSON.stringify(entry));
  payload.append("id", entry.id);
  payload.append("name", entry.name);
  payload.append("phone", entry.phone);
  payload.append("side", entry.side);
  payload.append("guests", String(entry.guests));
  payload.append("attendance", entry.attendance);
  payload.append("events", entry.events.join(", "));
  payload.append("message", entry.message);
  payload.append("submittedAt", entry.submittedAt);

  await fetch(GOOGLE_SHEET_WEB_APP_URL.trim(), {
    method: "POST",
    mode: "no-cors",
    body: payload
  });

  return true;
}

async function storeRsvp(entry) {
  if (!isRemoteRsvpEnabled()) {
    writeRsvps([...readRsvps(), entry]);
    return { remote: false };
  }

  if (!sheetConnectionReady) {
    try {
      await fetchSheetRsvps();
    } catch (error) {
      sheetConnectionReady = false;
      writeRsvps([...readRsvps(), entry]);
      return { remote: false };
    }
  }

  writeRsvps([...readRsvps(), entry]);

  try {
    await saveRsvpToSheet(entry);
    return { remote: true };
  } catch (error) {
    sheetConnectionReady = false;
    return { remote: false };
  }
}

function createConfetti() {
  const colors = ["#f4a300", "#d62828", "#d81b60", "#007c83", "#21409a", "#2e7d32", "#d4a017"];

  for (let index = 0; index < 76; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * 220}ms`;
    piece.style.transform = `rotate(${Math.random() * 180}deg)`;
    document.body.appendChild(piece);
    window.setTimeout(() => piece.remove(), 1600);
  }
}

function createFallingElement(className, index, sizeRange, durationRange) {
  const element = document.createElement("span");
  const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
  const duration = durationRange[0] + Math.random() * (durationRange[1] - durationRange[0]);
  const delay = Math.random() * -duration;
  const drift = (Math.random() * 120 - 60).toFixed(1);
  const sway = (Math.random() * 36 - 18).toFixed(1);
  const opacityBase = className === "mogra-flower" ? 0.76 : 0.7;
  const opacityRange = className === "mogra-flower" ? 0.18 : 0.2;
  const opacity = (opacityBase + Math.random() * opacityRange).toFixed(2);
  const blur = (Math.random() * 0.45).toFixed(2);
  const scaleX = (0.82 + Math.random() * 0.34).toFixed(2);
  const scaleY = (0.9 + Math.random() * 0.24).toFixed(2);
  const tiltValue = Math.random() * 70 - 35;
  const tilt = `${tiltValue.toFixed(1)}deg`;
  const tiltReverse = `${(tiltValue * -1).toFixed(1)}deg`;

  element.className = className;
  element.style.setProperty("--x", `${Math.random() * 100}%`);
  element.style.setProperty("--size", `${size.toFixed(1)}px`);
  element.style.setProperty("--duration", `${duration.toFixed(1)}s`);
  element.style.setProperty("--delay", `${delay.toFixed(1)}s`);
  element.style.setProperty("--drift", `${drift}px`);
  element.style.setProperty("--sway", `${sway}px`);
  element.style.setProperty("--opacity", opacity);
  element.style.setProperty("--blur", `${blur}px`);
  element.style.setProperty("--scale-x", scaleX);
  element.style.setProperty("--scale-y", scaleY);
  element.style.setProperty("--tilt", tilt);
  element.style.setProperty("--tilt-reverse", tiltReverse);
  element.style.setProperty("--rotate", `${Math.random() * 360}deg`);

  if (className === "rose-petal") {
    const color = PETAL_COLORS[index % PETAL_COLORS.length];
    element.style.setProperty("--petal-light", color[0]);
    element.style.setProperty("--petal-dark", color[1]);
  }

  petalLayer.appendChild(element);
}

function createRosePetals() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const petalCount = window.innerWidth < 700 ? 10 : 18;
  const mograCount = window.innerWidth < 700 ? 18 : 28;
  petalLayer.innerHTML = "";

  for (let index = 0; index < petalCount; index += 1) {
    createFallingElement("rose-petal", index, [9, 17], [8.8, 11.4]);
  }

  for (let index = 0; index < mograCount; index += 1) {
    createFallingElement("mogra-flower", index, [6, 11], [9.2, 12.2]);
  }
}

function createAkshataBurst() {
  if (!inviteGate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const grainCount = window.innerWidth < 700 ? 34 : 54;

  for (let index = 0; index < grainCount; index += 1) {
    const grain = document.createElement("span");
    const size = 3 + Math.random() * 3.8;
    const duration = 1.05 + Math.random() * 0.55;
    const delay = 0.88 + Math.random() * 0.52;
    const drift = Math.random() * 170 - 85;
    const startX = 18 + Math.random() * 64;
    const startY = -18 - Math.random() * 38;

    grain.className = "akshata-grain";
    grain.style.setProperty("--x", `${startX.toFixed(1)}%`);
    grain.style.setProperty("--y", `${startY.toFixed(1)}px`);
    grain.style.setProperty("--size", `${size.toFixed(1)}px`);
    grain.style.setProperty("--duration", `${duration.toFixed(2)}s`);
    grain.style.setProperty("--delay", `${delay.toFixed(2)}s`);
    grain.style.setProperty("--drift", `${drift.toFixed(1)}px`);
    grain.style.setProperty("--rotate", `${(Math.random() * 220 - 110).toFixed(1)}deg`);
    inviteGate.appendChild(grain);
    window.setTimeout(() => grain.remove(), Math.ceil((duration + delay + 0.4) * 1000));
  }
}

function selectedEvents(formData) {
  return formData.getAll("events");
}

function setupScratchCard() {
  if (!scratchCanvas || !scratchCard) {
    return;
  }

  const context = scratchCanvas.getContext("2d");
  let isScratching = false;
  let scratchChecks = 0;
  let hasRevealedDate = false;

  function revealIfEnoughScratched() {
    if (scratchCard.classList.contains("revealed")) {
      return;
    }

    scratchChecks += 1;
    if (scratchChecks % 5 !== 0) {
      return;
    }

    const pixels = context.getImageData(0, 0, scratchCanvas.width, scratchCanvas.height).data;
    let transparentPixels = 0;

    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] < 24) {
        transparentPixels += 1;
      }
    }

    const scratchedRatio = transparentPixels / (scratchCanvas.width * scratchCanvas.height);
    if (scratchedRatio >= 0.75) {
      hasRevealedDate = true;
      scratchCard.classList.add("revealed");
    }
  }

  function paintCover() {
    if (hasRevealedDate) {
      scratchCard.classList.add("revealed");
      return;
    }

    const rect = scratchCard.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    scratchCanvas.width = Math.round(rect.width * scale);
    scratchCanvas.height = Math.round(rect.height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);

    const gradient = context.createLinearGradient(0, 0, rect.width, rect.height);
    gradient.addColorStop(0, "#7a3f1c");
    gradient.addColorStop(0.44, "#d8a43a");
    gradient.addColorStop(1, "#fff1c4");
    context.globalCompositeOperation = "source-over";
    context.fillStyle = gradient;
    context.fillRect(0, 0, rect.width, rect.height);

    context.fillStyle = "rgba(255, 249, 234, 0.16)";
    for (let x = -rect.height; x < rect.width + rect.height; x += 22) {
      context.fillRect(x, 0, 1.2, rect.height);
    }

    context.fillStyle = "rgba(91, 43, 18, 0.32)";
    context.fillRect(16, 16, rect.width - 32, 1);
    context.fillRect(16, rect.height - 17, rect.width - 32, 1);
    context.fillRect(16, 16, 1, rect.height - 32);
    context.fillRect(rect.width - 17, 16, 1, rect.height - 32);

    context.fillStyle = "rgba(255, 249, 234, 0.94)";
    context.font = "800 15px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("SCRATCH TO SEE", rect.width / 2, rect.height / 2 - 12);
    context.fillText("WEDDING DATE", rect.width / 2, rect.height / 2 + 12);

    context.fillStyle = "rgba(169, 33, 32, 0.9)";
    context.beginPath();
    context.arc(rect.width / 2 - 82, rect.height / 2, 3.5, 0, Math.PI * 2);
    context.arc(rect.width / 2 + 82, rect.height / 2, 3.5, 0, Math.PI * 2);
    context.fill();

    scratchChecks = 0;
    scratchCard.classList.remove("revealed");
  }

  function scratchAt(event) {
    const rect = scratchCanvas.getBoundingClientRect();
    const pointer = event.touches ? event.touches[0] : event;
    const x = pointer.clientX - rect.left;
    const y = pointer.clientY - rect.top;
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(x, y, 24, 0, Math.PI * 2);
    context.fill();
    revealIfEnoughScratched();
  }

  function startScratch(event) {
    isScratching = true;
    scratchAt(event);
  }

  function moveScratch(event) {
    if (!isScratching) {
      return;
    }
    event.preventDefault();
    scratchAt(event);
  }

  function stopScratch() {
    isScratching = false;
  }

  paintCover();
  window.addEventListener("resize", paintCover);
  scratchCanvas.addEventListener("mousedown", startScratch);
  scratchCanvas.addEventListener("mousemove", moveScratch);
  window.addEventListener("mouseup", stopScratch);
  scratchCanvas.addEventListener("touchstart", startScratch, { passive: false });
  scratchCanvas.addEventListener("touchmove", moveScratch, { passive: false });
  window.addEventListener("touchend", stopScratch);
}

function setMusicButton(isPlaying) {
  const musicIcon = musicToggle.querySelector(".music-note");
  musicToggle.classList.toggle("is-playing", isPlaying);
  musicToggle.setAttribute("aria-pressed", String(isPlaying));
  musicToggle.setAttribute(
    "aria-label",
    isPlaying ? "Pause Mangalorean wedding instrumental" : "Play Mangalorean wedding instrumental"
  );
  musicToggle.title = isPlaying ? "Pause song" : "Play song";
  if (musicIcon) {
    musicIcon.textContent = isPlaying ? "♫" : "♪";
  }
}

function loadYouTubeMusicPlayer() {
  if (youtubePlayerReady || youtubeApiRequested || !document.querySelector("#youtubeMusicPlayer")) {
    return;
  }

  youtubeApiRequested = true;
  window.onYouTubeIframeAPIReady = () => {
    youtubePlayer = new YT.Player("youtubeMusicPlayer", {
      width: "1",
      height: "1",
      videoId: YOUTUBE_MUSIC_VIDEO_ID,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        loop: 1,
        modestbranding: 1,
        playsinline: 1,
        playlist: YOUTUBE_MUSIC_VIDEO_ID,
        rel: 0
      },
      events: {
        onReady: () => {
          youtubePlayerReady = true;
          youtubeFailed = false;
          youtubePlayer.setVolume(42);
          if (youtubePendingPlay) {
            youtubePendingPlay = false;
            try {
              youtubePlayer.playVideo();
              musicSource = "youtube";
            } catch (error) {
              youtubeFailed = true;
              playBackupSong();
            }
          }
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.PLAYING) {
            musicSource = "youtube";
            weddingAudio.pause();
            setMusicButton(true);
          }

          if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
            setMusicButton(false);
          }
        },
        onError: () => {
          youtubePlayerReady = false;
          youtubeFailed = true;
          if (youtubePendingPlay) {
            youtubePendingPlay = false;
            playBackupSong();
          } else {
            setMusicButton(false);
          }
          musicSource = "backup";
        }
      }
    });
  };

  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.async = true;
  script.onerror = () => {
    youtubeApiRequested = false;
    youtubeFailed = true;
    if (youtubePendingPlay) {
      youtubePendingPlay = false;
      playBackupSong();
    } else {
      setMusicButton(false);
    }
    musicSource = "backup";
  };
  document.head.appendChild(script);
}

async function playBackupSong() {
  if (!weddingAudio) {
    return false;
  }

  try {
    weddingAudio.volume = 0.42;
    await weddingAudio.play();
    musicSource = "backup";
    setMusicButton(true);
    return true;
  } catch (error) {
    setMusicButton(false);
    musicToggle.title = "Audio could not be played by this browser.";
    return false;
  }
}

async function playWeddingSong() {
  if (!musicToggle) {
    return;
  }

  loadYouTubeMusicPlayer();

  if (youtubeFailed) {
    await playBackupSong();
    return;
  }

  if (youtubePlayerReady && youtubePlayer && typeof youtubePlayer.playVideo === "function") {
    try {
      youtubePlayer.playVideo();
      musicSource = "youtube";
      return;
    } catch (error) {
      await playBackupSong();
      return;
    }
  }

  youtubePendingPlay = true;
  musicSource = "youtube";
  musicToggle.title = "Loading YouTube wedding song...";
}

async function toggleWeddingSong() {
  if (!weddingAudio || !musicToggle) {
    return;
  }

  if (
    musicSource === "youtube" &&
    youtubePlayerReady &&
    youtubePlayer &&
    typeof youtubePlayer.getPlayerState === "function" &&
    youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING
  ) {
    youtubePlayer.pauseVideo();
    setMusicButton(false);
    return;
  }

  if (!weddingAudio.paused) {
    weddingAudio.pause();
    setMusicButton(false);
    return;
  }

  if (youtubePendingPlay) {
    youtubePendingPlay = false;
    setMusicButton(false);
    return;
  }

  await playWeddingSong();
}

async function startWeddingSong() {
  await playWeddingSong();
}

function openInvitationGate() {
  if (!inviteGate || inviteGate.classList.contains("opening")) {
    return;
  }

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  inviteGate.classList.add("opening");
  createAkshataBurst();
  document.body.classList.remove("gate-active");
  startWeddingSong();

  window.setTimeout(() => {
    inviteGate.classList.add("is-hidden");
    inviteGate.setAttribute("aria-hidden", "true");
  }, 5000);
}

function cleanName(value) {
  return value.replace(/[^A-Za-z ]/g, "").replace(/\s{2,}/g, " ").trimStart();
}

function cleanPhone(value) {
  const trimmed = value.trim();
  const prefix = trimmed.startsWith("+") ? "+" : "";
  return prefix + trimmed.replace(/\D/g, "");
}

function enforceMessageLimit() {
  if (messageInput.value.length > 200) {
    messageInput.value = messageInput.value.slice(0, 200);
  }
  messageCount.textContent = `${messageInput.value.length}/200`;
}

function setFieldValidity(nameInput, phoneInput) {
  if (!NAME_PATTERN.test(nameInput.value.trim())) {
    nameInput.setCustomValidity("Please enter letters and spaces only.");
  } else {
    nameInput.setCustomValidity("");
  }

  if (!PHONE_PATTERN.test(phoneInput.value.trim())) {
    phoneInput.setCustomValidity("Please enter digits only, with an optional country code like +91.");
  } else {
    phoneInput.setCustomValidity("");
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const nameInput = form.elements.name;
  const phoneInput = form.elements.phone;
  const submitButton = form.querySelector(".submit-action");

  nameInput.value = cleanName(nameInput.value);
  phoneInput.value = cleanPhone(phoneInput.value);
  enforceMessageLimit();
  setFieldValidity(nameInput, phoneInput);

  if (!form.reportValidity()) {
    return;
  }

  const formData = new FormData(form);
  const entry = {
    id: createRsvpId(),
    name: formData.get("name").trim(),
    phone: formData.get("phone").trim(),
    side: formData.get("side"),
    guests: Number(formData.get("guests")),
    attendance: formData.get("attendance"),
    events: selectedEvents(formData),
    message: formData.get("message").trim(),
    submittedAt: new Date().toISOString()
  };

  submitButton.disabled = true;
  statusEl.textContent = "Saving your RSVP...";

  try {
    const result = await storeRsvp(entry);
    statusEl.textContent = result.remote
      ? "You're on the list! RSVP saved."
      : "You're on the list locally. Sheet connection is pending.";
    form.reset();
    enforceMessageLimit();
    createConfetti();
  } catch (error) {
    console.warn("RSVP save failed", error);
    statusEl.textContent = "Could not save to the RSVP sheet. Please try again.";
  } finally {
    submitButton.disabled = false;
  }
}

async function hydrateDemoCount() {
  await refreshRsvpsFromSheet({ silent: true });
  const savedRsvps = readRsvps();
  if (savedRsvps.length > 0) {
    statusEl.textContent = isRemoteRsvpEnabled()
      ? `${savedRsvps.length} RSVP${savedRsvps.length === 1 ? "" : "s"} loaded from the RSVP sheet.`
      : `${savedRsvps.length} RSVP${savedRsvps.length === 1 ? "" : "s"} saved on this browser.`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function comingRsvps() {
  return readRsvps().filter((entry) => entry.attendance === "Joyfully attending" || entry.attendance === "Yes, with joy");
}

function renderAdminList() {
  const entries = comingRsvps();
  const totalGuests = entries.reduce((sum, entry) => sum + Number(entry.guests || 0), 0);
  const sideCounts = entries.reduce(
    (counts, entry) => {
      const side = entry.side || "Unknown";
      counts[side] = (counts[side] || 0) + 1;
      return counts;
    },
    { "Team Groom": 0, "Team Bride": 0, Both: 0 }
  );
  const eventCounts = entries.reduce(
    (counts, entry) => {
      (entry.events || []).forEach((eventName) => {
        counts[eventName] = (counts[eventName] || 0) + Number(entry.guests || 0);
      });
      return counts;
    },
    { Sangeet: 0, Wedding: 0, Reception: 0 }
  );

  adminSummary.innerHTML = `
    <strong>${entries.length} coming RSVP${entries.length === 1 ? "" : "s"} · ${totalGuests} guest${totalGuests === 1 ? "" : "s"}</strong>
    <span>Groom ${sideCounts["Team Groom"] || 0} · Bride ${sideCounts["Team Bride"] || 0} · Both ${sideCounts.Both || 0}</span>
    <span>Sangeet ${eventCounts.Sangeet || 0} · Wedding ${eventCounts.Wedding || 0} · Reception ${eventCounts.Reception || 0}</span>
  `;

  if (entries.length === 0) {
    rsvpList.innerHTML = '<tr><td class="empty-row" colspan="6">No coming RSVPs saved on this browser yet.</td></tr>';
    return;
  }

  rsvpList.innerHTML = entries
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.name)}</td>
          <td>${escapeHtml(entry.phone || entry.contact || "")}</td>
          <td>${escapeHtml(entry.side || "-")}</td>
          <td>${escapeHtml(entry.guests)}</td>
          <td>${escapeHtml(entry.events.join(", "))}</td>
          <td>${escapeHtml(entry.message || "-")}</td>
        </tr>
      `
    )
    .join("");
}

async function openAdminModal() {
  renderAdminList();
  adminModal.classList.add("open");
  adminModal.setAttribute("aria-hidden", "false");
  adminClose.focus();
  await refreshRsvpsFromSheet({ silent: true });
}

function closeAdminModal() {
  adminModal.classList.remove("open");
  adminModal.setAttribute("aria-hidden", "true");
  adminTrigger.focus();
}

function downloadFile(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCsv() {
  const rows = comingRsvps();
  const header = ["Name", "Phone", "Side", "Guests", "Events", "Message", "Submitted At"];
  const body = rows.map((entry) =>
    [
      entry.name,
      entry.phone || entry.contact || "",
      entry.side || "",
      entry.guests,
      entry.events.join(", "),
      entry.message,
      entry.submittedAt
    ].map(csvCell).join(",")
  );
  downloadFile("sharan-rajashree-rsvps.csv", "text/csv", [header.map(csvCell).join(","), ...body].join("\n"));
}

function exportJson() {
  downloadFile("sharan-rajashree-rsvps.json", "application/json", JSON.stringify(comingRsvps(), null, 2));
}

function clearRsvps() {
  const confirmed = window.confirm(
    isRemoteRsvpEnabled()
      ? "Clear the cached RSVPs from this browser? This will not delete rows from the Google Sheet."
      : "Clear all saved RSVPs from this browser?"
  );
  if (!confirmed) {
    return;
  }

  writeRsvps([]);
  renderAdminList();
  statusEl.textContent = "";
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  },
  { threshold: 0.16 }
);

form.elements.name.addEventListener("input", (event) => {
  event.target.value = cleanName(event.target.value);
  setFieldValidity(form.elements.name, form.elements.phone);
});

form.elements.phone.addEventListener("input", (event) => {
  event.target.value = cleanPhone(event.target.value);
  setFieldValidity(form.elements.name, form.elements.phone);
});

messageInput.addEventListener("input", enforceMessageLimit);
adminTrigger.addEventListener("click", openAdminModal);
adminClose.addEventListener("click", closeAdminModal);
exportCsvButton.addEventListener("click", exportCsv);
exportJsonButton.addEventListener("click", exportJson);
clearRsvpsButton.addEventListener("click", clearRsvps);
musicToggle.addEventListener("click", toggleWeddingSong);
weddingAudio.addEventListener("pause", () => {
  if (musicSource === "backup") {
    setMusicButton(false);
  }
});
weddingAudio.addEventListener("ended", () => {
  if (musicSource === "backup") {
    setMusicButton(false);
  }
});
if (inviteGate) {
  document.body.classList.add("gate-active");
  inviteGate.addEventListener("click", openInvitationGate);
  inviteGate.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openInvitationGate();
    }
  });
}
adminModal.addEventListener("click", (event) => {
  if (event.target === adminModal) {
    closeAdminModal();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && adminModal.classList.contains("open")) {
    closeAdminModal();
  }
});

window.addEventListener("load", () => {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
});

revealTargets.forEach((target) => {
  target.classList.add("reveal");
  observer.observe(target);
});

form.addEventListener("submit", handleSubmit);
enforceMessageLimit();
hydrateDemoCount();
createRosePetals();
loadYouTubeMusicPlayer();
setupScratchCard();
