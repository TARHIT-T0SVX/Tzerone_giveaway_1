/* =====================================================================================
   APP PRELOADER CONTROLLER (merged from the standalone loading animation project)
   Self-contained IIFE — does not touch or depend on any state below, so it can never
   interfere with the Firestore/offline-banner logic further down this file.
   - Shows on first paint (already visible by default via CSS/HTML) and hides once the
     window "load" event fires (all assets — images, fonts, etc. — fully loaded).
   - Re-triggers automatically on a genuine connectivity loss ("offline") and hides
     again shortly after connectivity returns ("online"), independent of the existing
     in-page "Connection unavailable" banner, which continues to work exactly as before.
===================================================================================== */
(function () {
    "use strict";

    var preloader = document.getElementById("app-preloader");
    var statusText = document.getElementById("preloader-status-text");
    if (!preloader) return;

    var initialLoadDone = false;
    var hideTimer = null;

    function setStatus(msg) {
        if (!statusText) return;
        if (msg) {
            statusText.textContent = msg;
            statusText.classList.add("visible");
        } else {
            statusText.classList.remove("visible");
            statusText.textContent = "";
        }
    }

    function showPreloader(msg) {
        clearTimeout(hideTimer);
        preloader.classList.remove("preloader-hidden");
        setStatus(msg || "");
    }

    function hidePreloader(delay) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(function () {
            preloader.classList.add("preloader-hidden");
            setStatus("");
        }, delay || 0);
    }

    // A. Initial load handling — reveal the site once everything has finished loading.
    function completeInitialLoad() {
        if (initialLoadDone) return;
        initialLoadDone = true;
        hidePreloader(150);
    }

    if (document.readyState === "complete") {
        completeInitialLoad();
    } else {
        window.addEventListener("load", completeInitialLoad);
        // Safety net: never trap the user on the loader indefinitely if some third-party
        // asset (e.g. an external logo image) hangs — reveal the site after 8s regardless.
        setTimeout(completeInitialLoad, 8000);
    }

    // B. Network status handling — re-trigger the loader on a genuine connectivity drop,
    // and dismiss it again once the connection is confirmed back.
    window.addEventListener("offline", function () {
        if (!initialLoadDone) return; // already showing during first load — nothing to do
        showPreloader("Connection lost — waiting to reconnect...");
    });

    window.addEventListener("online", function () {
        if (!initialLoadDone) return;
        setStatus("Back online");
        hidePreloader(500);
    });

    window.TZeroneLoader = { show: showPreloader, hide: hidePreloader };
})();

let formStagingCache = { name: '', age: '', countryDialCode: '+880', phoneNumber: '', gameId: '' };
let activeFirestoreSubmissionsSnapshot = [];
let activeFirestoreWinnerHistorySnapshot = [];
let activeArchiveSnapshot = [];
let activePastPrizesData = [];
let liveEventStatus = "open";
let registrationWindowExpired = false;
let registrationTimerInterval = null;
let currentEventEndsAt = null; // null = no deployed countdown (manual mode or stopped); timestamp = deployed custom timer

// Dashboard Sorting Tracker (1: Newest, 2: Oldest, 3: A-Z)
let dashboardSortState = 1;

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const DEFAULT_PRIZE_IMAGE = "";
const DEFAULT_PRIZE_CAPTION = "Loading prize details...";
const GIVEAWAY_DEFAULT_IMAGE = "https://raw.githubusercontent.com/TARHIT-T0SVX/All-image-t-z/refs/heads/main/gift_giveaway_bb.png";
const GIVEAWAY_ENDED_IMAGE = "https://raw.githubusercontent.com/TARHIT-T0SVX/All-image-t-z/refs/heads/main/event_end_bb.png";
const DASH_MASCOT_REGISTERED = "https://raw.githubusercontent.com/TARHIT-T0SVX/All-image-t-z/refs/heads/main/barbarian_thumbsup.png";
const DASH_MASCOT_WINNERS = "https://raw.githubusercontent.com/TARHIT-T0SVX/All-image-t-z/refs/heads/main/barbarian_holding_prize.png";

// Preload dashboard tab mascots so switching tabs never has to wait on a network fetch —
// this is what makes the Registered/Winners header swap feel instant (0ms) instead of popping in.
function preloadDashboardMascots() {
    [DASH_MASCOT_REGISTERED, DASH_MASCOT_WINNERS].forEach(url => {
        const img = new Image();
        img.src = url;
    });
}

// Dashboard tab-based character overlay (Register vs Winner tab)

// Shared fallback icon markup for any prize image slot with no uploaded image — mirrors the Creator Badge placeholder icon.
const IMAGE_PLACEHOLDER_SVG_MARKUP = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"/><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"/><g id="SVGRepo_iconCarrier"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.205 3h11.59c1.114 0 1.519.116 1.926.334.407.218.727.538.945.945.218.407.334.811.334 1.926v7.51l-4.391-4.053a1.5 1.5 0 0 0-2.265.27l-3.13 4.695-2.303-1.48a1.5 1.5 0 0 0-1.96.298L3.005 18.15A12.98 12.98 0 0 1 3 17.795V6.205c0-1.115.116-1.519.334-1.926.218-.407.538-.727.945-.945C4.686 3.116 5.09 3 6.205 3zm9.477 8.53L21 16.437v1.357c0 1.114-.116 1.519-.334 1.926a2.272 2.272 0 0 1-.945.945c-.407.218-.811.334-1.926.334H6.205c-1.115 0-1.519-.116-1.926-.334a2.305 2.305 0 0 1-.485-.345L8.2 15.067l2.346 1.508a1.5 1.5 0 0 0 2.059-.43l3.077-4.616zM7.988 6C6.878 6 6 6.832 6 7.988 6 9.145 6.879 10 7.988 10 9.121 10 10 9.145 10 7.988 10 6.832 9.121 6 7.988 6z" fill="#ffffff"/></g></svg>`;

const countryDataList = [
    { name: "Algeria", code: "+213", flag: "🇩🇿" }, { name: "Argentina", code: "+54", flag: "🇦🇷" },
    { name: "Australia", code: "+61", flag: "🇦🇺" }, { name: "Austria", code: "+43", flag: "🇦🇹" },
    { name: "Bangladesh", code: "+880", flag: "🇧🇩" }, { name: "Belarus", code: "+375", flag: "🇧🇾" },
    { name: "Belgium", code: "+32", flag: "🇧🇪" }, { name: "Bolivia", code: "+591", flag: "🇧🇴" },
    { name: "Brazil", code: "+55", flag: "🇧🇷" }, { name: "Bulgaria", code: "+359", flag: "🇧🇬" },
    { name: "Canada", code: "+1", flag: "🇨🇦" }, { name: "Chile", code: "+56", flag: "🇨🇱" },
    { name: "China", code: "+86", flag: "🇨🇳" }, { name: "Colombia", code: "+57", flag: "🇨🇴" },
    { name: "Costa Rica", code: "+506", flag: "🇨🇷" }, { name: "Czech Republic", code: "+420", flag: "🇨🇿" },
    { name: "Denmark", code: "+45", flag: "🇩🇰" }, { name: "Dominican Republic", code: "+1", flag: "🇩🇴" },
    { name: "Ecuador", code: "+593", flag: "🇪🇨" }, { name: "Egypt", code: "+20", flag: "🇪🇬" },
    { name: "Finland", code: "+358", flag: "🇫🇮" }, { name: "France", code: "+33", flag: "🇫🇷" },
    { name: "Germany", code: "+49", flag: "🇩🇪" }, { name: "Ghana", code: "+233", flag: "🇬🇭" },
    { name: "Greece", code: "+30", flag: "🇬🇷" }, { name: "Guatemala", code: "+502", flag: "🇬🇹" },
    { name: "Hong Kong", code: "+852", flag: "🇭🇰" }, { name: "Hungary", code: "+36", flag: "🇭🇺" },
    { name: "India", code: "+91", flag: "🇮🇳" }, { name: "Indonesia", code: "+62", flag: "🇮🇩" },
    { name: "Iran", code: "+98", flag: "🇮🇷" }, { name: "Iraq", code: "+964", flag: "🇮🇶" },
    { name: "Israel", code: "+972", flag: "🇮🇱" }, { name: "Italy", code: "+39", flag: "🇮🇹" },
    { name: "Japan", code: "+81", flag: "🇯🇵" }, { name: "Kenya", code: "+254", flag: "🇰🇪" },
    { name: "Kuwait", code: "+965", flag: "🇰🇼" }, { name: "Malaysia", code: "+60", flag: "🇲🇾" },
    { name: "Mexico", code: "+52", flag: "🇲🇽" }, { name: "Morocco", code: "+212", flag: "🇲🇦" },
    { name: "Nepal", code: "+977", flag: "🇳🇵" }, { name: "Netherlands", code: "+31", flag: "🇳🇱" },
    { name: "New Zealand", code: "+64", flag: "🇳🇿" }, { name: "Nigeria", code: "+234", flag: "🇳🇬" },
    { name: "Norway", code: "+47", flag: "🇳🇴" }, { name: "Pakistan", code: "+92", flag: "🇵🇰" },
    { name: "Panama", code: "+507", flag: "🇵🇦" }, { name: "Peru", code: "+51", flag: "🇵🇪" },
    { name: "Philippines", code: "+63", flag: "🇵🇭" }, { name: "Poland", code: "+48", flag: "🇵🇱" },
    { name: "Puerto Rico", code: "+1", flag: "🇵🇷" }, { name: "Qatar", code: "+974", flag: "🇶🇦" },
    { name: "Romania", code: "+40", flag: "🇷🇴" }, { name: "Russia", code: "+7", flag: "🇷🇺" },
    { name: "Saudi Arabia", code: "+966", flag: "🇸🇦" }, { name: "Singapore", code: "+65", flag: "🇸🇬" },
    { name: "Slovakia", code: "+421", flag: "🇸🇰" }, { name: "South Africa", code: "+27", flag: "🇿🇦" },
    { name: "South Korea", code: "+82", flag: "🇰🇷" }, { name: "Spain", code: "+34", flag: "🇪🇸" },
    { name: "Sri Lanka", code: "+94", flag: "🇱🇰" }, { name: "Sweden", code: "+46", flag: "🇸🇪" },
    { name: "Switzerland", code: "+41", flag: "🇨🇭" }, { name: "Taiwan", code: "+886", flag: "🇹🇼" },
    { name: "Thailand", code: "+66", flag: "🇹🇭" }, { name: "Tunisia", code: "+216", flag: "🇹🇳" },
    { name: "Turkey", code: "+90", flag: "🇹🇷" }, { name: "Ukraine", code: "+380", flag: "🇺🇦" },
    { name: "United Arab Emirates", code: "+971", flag: "🇦🇪" }, { name: "United Kingdom", code: "+44", flag: "🇬🇧" },
    { name: "United States", code: "+1", flag: "🇺🇸" }, { name: "Uruguay", code: "+598", flag: "🇺🇾" },
    { name: "Venezuela", code: "+58", flag: "🇻🇪" }, { name: "Vietnam", code: "+84", flag: "🇻🇳" }
];

window.customAlert = function(title, message, type = 'info') {
    return new Promise(resolve => {
        const overlay = document.getElementById("custom-alert-overlay");
        const titleEl = document.getElementById("custom-alert-title");
        const msgEl = document.getElementById("custom-alert-message");
        const btnContainer = document.getElementById("custom-alert-buttons");
        const iconEl = document.getElementById("custom-alert-icon");
        const boxEl = document.getElementById("custom-alert-box");

        boxEl.className = `modal-box-card custom-popup-card popup-${type}`;
        titleEl.innerText = title;
        msgEl.innerText = message;

        let iconSvg = '';
        if (type === 'error') iconSvg = `<svg viewBox="0 0 24 24" width="48" height="48" fill="#FF3B30"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
        else if (type === 'success') iconSvg = `<svg viewBox="0 0 24 24" width="48" height="48" fill="#39FF14"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
        else iconSvg = `<svg viewBox="0 0 24 24" width="48" height="48" fill="#00A8FF"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
        iconEl.innerHTML = iconSvg;

        btnContainer.innerHTML = `<button class="btn btn-secondary-soft btn-sm" id="popup-ok-btn" style="width:100%">UNDERSTOOD</button>`;
        overlay.classList.remove("hidden");

        document.getElementById("popup-ok-btn").onclick = () => {
            overlay.classList.add("hidden");
            resolve();
        };
    });
};

// Confirm/Cancel variant of customAlert — reuses the exact same overlay markup and
// modal styling, just swaps the single "UNDERSTOOD" button for a Cancel/Confirm pair.
// Resolves true on Confirm, false on Cancel (or overlay/backdrop dismiss).
window.customConfirm = function(title, message) {
    return new Promise(resolve => {
        const overlay = document.getElementById("custom-alert-overlay");
        const titleEl = document.getElementById("custom-alert-title");
        const msgEl = document.getElementById("custom-alert-message");
        const btnContainer = document.getElementById("custom-alert-buttons");
        const iconEl = document.getElementById("custom-alert-icon");
        const boxEl = document.getElementById("custom-alert-box");

        boxEl.className = `modal-box-card custom-popup-card popup-warning`;
        titleEl.innerText = title;
        msgEl.innerText = message;
        iconEl.innerHTML = `<svg viewBox="0 0 24 24" width="48" height="48" fill="#FFD200"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;

        btnContainer.innerHTML = `<button class="btn btn-secondary-soft" id="popup-cancel-btn">CANCEL</button><button class="btn btn-action-green btn-success-action" id="popup-confirm-btn">CONFIRM</button>`;
        overlay.classList.remove("hidden");

        const settle = (result) => {
            overlay.classList.add("hidden");
            resolve(result);
        };
        document.getElementById("popup-cancel-btn").onclick = () => settle(false);
        document.getElementById("popup-confirm-btn").onclick = () => settle(true);
    });
};

document.addEventListener("DOMContentLoaded", () => {
    injectDynamicBannerStyles();
    setupInteractionListeners();
    setupSliderObserver();
    populateCountryList(countryDataList);
    updateBottomNavState("page-home");
    preloadDashboardMascots();

    // Resolve the event status instantly from the last-known cache (synchronous, no network
    // wait) so the hero section reveals already-correct on first paint instead of showing the
    // default Giveaway markup while the live Firestore listener is still connecting below.
    const earlyEventCache = readCachedLiveData("event");
    if (earlyEventCache) {
        applyEventConfig(earlyEventCache.status, earlyEventCache.endsAt);
    } else {
        // No cache yet (first-ever visit): nothing to resolve from, so reveal with the
        // default markup as before rather than hiding the hero section indefinitely.
        updateEventUiState();
    }

    setTimeout(() => {
        bootFirestoreLiveConnections();
    }, 500);

    // Native browser connectivity signals — used only to nudge a re-check and
    // refresh the offline indicator; the Firestore SDK handles its own retry/queue.
    window.addEventListener("online", () => {
        hideOfflineModeIndicator();
        bootFirestoreLiveConnections();
    });
    window.addEventListener("offline", () => {
        showOfflineModeIndicator();
    });
});

function restrictToNumericKeydown(e) {
    const allowedKeys = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Home", "End"];
    if (allowedKeys.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return;
    if (!/^[0-9]$/.test(e.key)) { e.preventDefault(); }
}

// Blocks any keystroke that isn't a letter, number, or space at the keyboard level, so the
// user never even sees a disallowed character (e.g. "#", "@", "-") flash into the Game ID
// field before being sanitized. Paste and IME input are still caught by sanitizeGameIdInput.
function restrictGameIdKeydown(e) {
    const allowedKeys = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Home", "End"];
    if (allowedKeys.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return;
    if (!/^[a-zA-Z0-9 ]$/.test(e.key)) { e.preventDefault(); }
}

// Real-time sanitizer for the Game ID field (covers typing, IME input, and paste):
// - Uppercases everything
// - Strips anything that isn't A-Z, 0-9, a space, or "#"
// - Collapses any number/position of "#" characters down to exactly one, forced to the front
// - Caps the total length (including the leading "#") at 15 characters
window.sanitizeGameIdInput = function(input) {
    const raw = input.value.toUpperCase().replace(/[^A-Z0-9 #]/g, "");
    const withoutHashes = raw.replace(/#/g, "");
    let result = "#" + withoutHashes;
    if (result.length > 16) {
        result = result.slice(0, 16);
    }
    input.value = result;
};

// While the field is focused, it should never sit truly empty — clicking into an empty
// field immediately seeds the mandatory leading "#".
window.ensureGameIdPrefix = function(input) {
    if (input.value === "") {
        input.value = "#";
    }
};

// On blur, if the user never actually typed a Game ID (value is just the bare "#"), collapse
// it back to a fully empty field so the "GAME ID:" placeholder is visible again by default.
window.collapseEmptyGameId = function(input) {
    if (input.value === "#") {
        input.value = "";
    }
};

function setupInteractionListeners() {
    // Game ID field: forces a single leading "#", restricts input to A-Z / 0-9 / spaces,
    // auto-uppercases in real time, and caps the total length at 15 characters.
    const gameIdInput = document.getElementById("input-gameid");
    if (gameIdInput) gameIdInput.addEventListener("keydown", restrictGameIdKeydown);

    const ageInput = document.getElementById("input-age");
    if (ageInput) ageInput.addEventListener("keydown", restrictToNumericKeydown);

    const phoneInput = document.getElementById("input-phone");
    if (phoneInput) phoneInput.addEventListener("keydown", restrictToNumericKeydown);

    const customCountryInput = document.getElementById("custom-country-input");
    if (customCountryInput) {
        customCountryInput.addEventListener("keydown", (e) => {
            const allowedKeys = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Home", "End"];
            if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;
            if (!/^[0-9]$/.test(e.key)) { e.preventDefault(); }
        });
    }

    document.getElementById("country-selector-btn")?.addEventListener("click", () => toggleCountryModal(true));
}

// Populated by alignSliderArrowsToImageFrame with one re-align callback per carousel, so
// navigateTo() can force a fresh recalculation whenever the home page becomes visible again.
const sliderRealignCallbacks = [];

// Populated by initSwipeCarousel with one arrow-visibility callback per carousel. While a page
// is inactive (.view-page without .active) it is display:none, so track.scrollWidth/clientWidth
// both read as 0 — if the left/right arrow visibility is left stale from that state, "Latest
// Price", "Past Price", and "Notice Board" arrows can end up hidden after returning from the
// form flow. navigateTo() re-runs these callbacks once the home page is visible again so arrow
// state is always recalculated against real, laid-out dimensions instead of stale/zeroed ones.
const sliderArrowUpdateCallbacks = [];

function setupSliderObserver() {
    initSwipeCarousel("home-carousel-track", "slider-btn-left", "slider-btn-right", "home-slider-wrapper");
    initSwipeCarousel("notice-carousel-track", "notice-slider-btn-left", "notice-slider-btn-right", "notice-slider-wrapper");
}

// Shared behavior for any swipe-carousel-wrapper instance: arrow visibility at scroll edges,
// click-to-scroll, and true vertical-center alignment of the arrows against the visible
// image container box (rather than the whole wrapper, which also includes the section title
// and previously pushed the arrows slightly above center).
function initSwipeCarousel(trackId, leftBtnId, rightBtnId, wrapperId) {
    const track = document.getElementById(trackId);
    const leftBtn = document.getElementById(leftBtnId);
    const rightBtn = document.getElementById(rightBtnId);
    const wrapper = document.getElementById(wrapperId);

    if (!track || !leftBtn || !rightBtn) return;

    let arrowUpdateQueued = false;
    const updateArrows = () => {
        arrowUpdateQueued = false;
        const scrollL = track.scrollLeft;
        const maxScroll = track.scrollWidth - track.clientWidth;

        if (scrollL <= 5) leftBtn.classList.add("hidden");
        else leftBtn.classList.remove("hidden");

        if (scrollL >= maxScroll - 5) rightBtn.classList.add("hidden");
        else rightBtn.classList.remove("hidden");
    };
    const queueArrowUpdate = () => {
        if (arrowUpdateQueued) return;
        arrowUpdateQueued = true;
        requestAnimationFrame(updateArrows);
    };

    track.addEventListener("scroll", queueArrowUpdate, { passive: true });
    window.addEventListener("resize", queueArrowUpdate, { passive: true });
    updateArrows();

    leftBtn.onclick = () => track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
    rightBtn.onclick = () => track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });

    alignSliderArrowsToImageFrame(wrapper, leftBtn, rightBtn);

    // Expose this carousel's arrow-visibility recalculation so navigateTo() can force a fresh
    // check when the home page becomes visible again — fixes the "Latest Price"/"Past Price"/
    // "Notice Board" arrows staying invisible after a form submission returns to the home page.
    sliderArrowUpdateCallbacks.push(updateArrows);
}

// Positions the left/right arrows at the exact vertical center of the image container box
// (.prize-image-frame) instead of the vertical center of the whole wrapper (which also
// includes the section title above the image and previously threw the arrows off-center).
function alignSliderArrowsToImageFrame(wrapper, leftBtn, rightBtn) {
    if (!wrapper || !leftBtn || !rightBtn) return;

    let alignQueued = false;
    const applyOffset = () => {
        alignQueued = false;
        // Re-queried fresh on every call (rather than captured once) since carousels
        // like the dynamic multi-notice board rebuild their slide markup in place --
        // a cached reference to the original frame element would otherwise go stale
        // the moment ADD MORE / REMOVE / SAVE swaps in a new set of slides.
        const frame = wrapper.querySelector(".prize-image-frame");
        if (!frame) return;
        const frameRect = frame.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        const centerY = (frameRect.top - wrapperRect.top) + (frameRect.height / 2);
        leftBtn.style.top = `${centerY}px`;
        rightBtn.style.top = `${centerY}px`;
    };
    const queueAlign = () => {
        if (alignQueued) return;
        alignQueued = true;
        requestAnimationFrame(applyOffset);
    };

    queueAlign();
    window.addEventListener("resize", queueAlign, { passive: true });
    // Re-align whenever any image inside this wrapper finishes loading, since aspect-ratio
    // boxes can shift slightly once the real image (vs. the placeholder) is in place.
    // Delegated on the wrapper itself (capture phase) so it keeps working for images
    // inside slides that are swapped in later, not just the ones present at init time.
    wrapper.addEventListener("load", (e) => {
        if (e.target && e.target.tagName === "IMG") queueAlign();
    }, true);

    // Expose this carousel's re-align trigger so navigateTo() can force a fresh
    // recalculation when the home page becomes visible again — fixes the arrows drifting
    // toward the top after submitting a form and returning to the home page.
    sliderRealignCallbacks.push(queueAlign);
}

// Launches the standalone game experience. Uses JavaScript navigation (rather than a
// plain <a> tag) so it stays consistent with the app's onclick-driven navigation style
// and so a hook is available here later if pre-launch checks are ever needed.
window.openGame = function() {
    window.location.href = "game/game_index.html";
};

window.navigateTo = function(targetPageId) {
    if (targetPageId === 'page-form' && (liveEventStatus === "closed" || registrationWindowExpired)) {
        customAlert("EVENT ENDED", "This event is currently closed. Submissions are no longer accepted.", "error");
        return;
    }
    document.querySelectorAll(".view-page").forEach(page => page.classList.remove("active"));
    const targetNode = document.getElementById(targetPageId);
    if (targetNode) { targetNode.classList.add("active"); window.scrollTo(0, 0); }
    updateBottomNavState(targetPageId);
    document.body.classList.toggle("modal-scroll-lock", targetPageId === "page-see-more");

    // The Latest Prize / Notice slider arrows are positioned with an inline pixel offset
    // computed relative to their image frame, and their visibility (hidden at scroll edges)
    // is computed from track.scrollWidth/clientWidth. Both only need recalculating when the
    // page becomes visible again (hidden pages report a zero-size frame, which previously left
    // the arrows stuck invisible until the user manually touched the slider), so re-run both
    // here rather than on every navigation.
    if (targetPageId === "page-home") {
        refreshHomeCarousels();
    }
}

// Unified re-init entry point for every "Latest Price" / "Past Price" / "Notice Board" swipe
// carousel on the home page: forces both arrow-visibility state and arrow vertical alignment
// to be recalculated against the page's real, currently-laid-out dimensions.
function refreshHomeCarousels() {
    sliderArrowUpdateCallbacks.forEach(fn => fn());
    sliderRealignCallbacks.forEach(fn => fn());
}

function updateBottomNavState(pageId) {
    const navBar = document.getElementById("bottom-nav-bar");
    const homeBtn = document.getElementById("nav-btn-home");
    const dashBtn = document.getElementById("nav-btn-dashboard");
    const gameBtn = document.getElementById("nav-btn-game");
    if (!navBar || !homeBtn || !dashBtn) return;

    const visiblePages = ["page-home", "page-dashboard", "page-see-more", "page-game"];
    if (visiblePages.includes(pageId)) {
        navBar.classList.remove("hidden");
        document.body.classList.add("has-bottom-nav");
    } else {
        navBar.classList.add("hidden");
        document.body.classList.remove("has-bottom-nav");
    }

    dashBtn.classList.toggle("active", pageId === "page-dashboard");
    if (gameBtn) gameBtn.classList.toggle("active", pageId === "page-game");
    homeBtn.classList.toggle("active", pageId !== "page-dashboard" && pageId !== "page-game");

    // Strictly enforce freezing the main body context exclusively for the dashboard
    document.body.classList.toggle("dashboard-active", pageId === "page-dashboard");

    // Same frozen, single-screen treatment for the Game page (no-scroll requirement).
    document.body.classList.toggle("game-active", pageId === "page-game");
}

window.switchPublicTab = function(targetTabId) {
    document.querySelectorAll(".public-tab-content").forEach(tab => tab.classList.remove("active"));
    document.querySelectorAll(".public-tabs-nav .p-tab-btn").forEach(btn => btn.classList.remove("active"));
    document.getElementById(targetTabId).classList.add("active");
    const activeBtn = Array.from(document.querySelectorAll(".public-tabs-nav .p-tab-btn")).find(btn => btn.getAttribute("onclick").includes(targetTabId));
    if (activeBtn) activeBtn.classList.add("active");

    // Instant (0ms) mascot header swap — images are preloaded, so this is a direct
    // class toggle with no fade/transition, matching the zero-latency tab switch.
    const registeredMascot = document.getElementById("dash-mascot-registered");
    const winnersMascot = document.getElementById("dash-mascot-winners");
    if (registeredMascot && winnersMascot) {
        const showWinners = targetTabId === "public-history-tab";
        registeredMascot.classList.toggle("active", !showWinners);
        winnersMascot.classList.toggle("active", showWinners);
    }
}

window.toggleCountryModal = function(shouldShow) {
    const modal = document.getElementById("country-modal-overlay");
    if (shouldShow) {
        modal.classList.remove("hidden");
        document.getElementById("country-search-bar").value = "";
        document.getElementById("custom-country-input").value = "";
        populateCountryList(countryDataList);
    } else {
        modal.classList.add("hidden");
    }
}

function populateCountryList(list) {
    const ul = document.getElementById("dynamic-country-list");
    let html = "";
    list.forEach(country => {
        html += `<li onclick="selectCountryCode('${country.flag}', '${country.code}')">
                    <span class="flag-icon">${country.flag}</span> ${country.name} (${country.code})
                 </li>`;
    });
    ul.innerHTML = html;
}

window.filterCountryModal = function() {
    const term = document.getElementById("country-search-bar").value.trim().toLowerCase();
    const filtered = countryDataList.filter(c => c.name.toLowerCase().includes(term) || c.code.includes(term));
    populateCountryList(filtered);
}

window.selectCountryCode = function(flagEmoji, codeText) {
    formStagingCache.countryDialCode = codeText;
    document.getElementById("country-selector-btn").innerText = `${flagEmoji} ${codeText}`;
    toggleCountryModal(false);
}

window.enforceCustomCodeRule = function(input) {
    let val = input.value.replace(/[^0-9]/g, '');
    if (val.length > 0) { input.value = "+" + val; } else { input.value = ""; }
}

window.applyCustomCountryCode = function() {
    let val = document.getElementById("custom-country-input").value;
    if (val === "" || val === "+" || val.length < 2) {
        customAlert("Invalid Code", "Please enter a valid country code with numbers.", "error");
        return;
    }
    formStagingCache.countryDialCode = val;
    document.getElementById("country-selector-btn").innerText = `🌐 ${val}`;
    toggleCountryModal(false);
}

window.processFormSubmission = async function() {
    const nameVal = document.getElementById("input-name").value.trim();
    const ageVal = parseInt(document.getElementById("input-age").value, 10);
    const phoneVal = document.getElementById("input-phone").value.trim();
    let gameIdVal = document.getElementById("input-gameid").value.trim();

    if (!nameVal || isNaN(ageVal) || !phoneVal || !gameIdVal) {
        await customAlert("Missing Fields", "Please completely fill out all fields before submitting.", "error");
        return;
    }
    if (ageVal < 1 || ageVal > 99) {
        await customAlert("Invalid Age", "Please provide a valid age between 1 and 99.", "error");
        return;
    }

    // Only a still-live entry (pending review or already approved) should block a resubmission.
    // Entries the Admin Panel has marked "removed" or "disqualified" are free to be reused.
    const blockingStatuses = ["pending", "approved"];
    const existsInSubmissions = activeFirestoreSubmissionsSnapshot.some(sub => sub.gameId === gameIdVal && blockingStatuses.includes(sub.status));
    const existsInWinners = activeFirestoreWinnerHistorySnapshot.some(win => win.gameId === gameIdVal);

    if (existsInSubmissions || existsInWinners) {
        await customAlert("DUPLICATE ID FOUND", "Game ID already submitted. Please check your ID or wait for the next giveaway season.", "error");
        return;
    }

    formStagingCache.name = nameVal;
    formStagingCache.age = ageVal;
    formStagingCache.phoneNumber = phoneVal;
    formStagingCache.gameId = gameIdVal;

    document.getElementById("confirm-name").innerText = formStagingCache.name;
    document.getElementById("confirm-age").innerText = formStagingCache.age;
    document.getElementById("confirm-phone").innerText = `${formStagingCache.countryDialCode} ${formStagingCache.phoneNumber}`;
    document.getElementById("confirm-gameid").innerText = formStagingCache.gameId;

    navigateTo("page-confirm");
}

window.commitSubmissionToFirebase = async function() {
    if (!window.FirebaseBridge) {
        await customAlert("Connection Error", "Data Engine connection failed.", "error");
        return;
    }

    try {
        const { db, collection, addDoc } = window.FirebaseBridge;
        await addDoc(collection(db, "submissions"), {
            name: formStagingCache.name,
            age: formStagingCache.age,
            phoneNumber: `${formStagingCache.countryDialCode} ${formStagingCache.phoneNumber}`,
            gameId: formStagingCache.gameId,
            status: "pending",
            timestamp: new Date().getTime()
        });

        document.getElementById("input-name").value = "";
        document.getElementById("input-age").value = "";
        document.getElementById("input-phone").value = "";
        document.getElementById("input-gameid").value = "";

        navigateTo("page-success");
    } catch (err) {
        console.error("Firebase Fault:", err);
        await customAlert("Error", "Failed to securely stream data records over server infrastructure.", "error");
    }
}

window.filterPublicDashboard = function() {
    const queryTerm = document.getElementById("public-search-bar").value.trim().toUpperCase();
    const listRows = document.querySelectorAll("#public-players-list .player-row-item");
    listRows.forEach(row => {
        const idText = (row.getAttribute("data-gameid") || "").toUpperCase();
        const nameText = (row.getAttribute("data-name") || "").toUpperCase();
        if (idText.includes(queryTerm) || nameText.includes(queryTerm)) row.classList.remove("hidden");
        else row.classList.add("hidden");
    });
}

window.handleSeeMoreOverlayClick = function(e) {
    if (e.target.id === 'page-see-more') {
        navigateTo('page-home');
    }
}

window.toggleDashboardSort = function() {
    dashboardSortState++;
    if (dashboardSortState > 3) dashboardSortState = 1;
    
    const label = document.getElementById("sort-label");
    if (dashboardSortState === 1) label.innerText = "NEW";
    else if (dashboardSortState === 2) label.innerText = "OLD";
    else label.innerText = "A-Z";
    
    buildPublicDashboardUI();
}

function updateEventUiState() {
    const banner = document.getElementById("event-ended-banner");
    const homeBtn = document.getElementById("home-giveaway-btn");
    const giveawayImg = document.getElementById("home-giveaway-image");
    const timerWrap = document.getElementById("reg-timer-wrapper");
    const heroSection = document.getElementById("home-hero-section");
    if (!banner || !homeBtn) return;

    const isClosed = (liveEventStatus === "closed") || registrationWindowExpired;
    // Only "deployed" mode (admin set a custom time + Deploy) has an endsAt on the event doc.
    // Manual-start mode flips status to "open" without ever setting endsAt, which is exactly
    // the signal we use here to keep the Registration Time timer hidden during Manual Active.
    const isDeployedActive = !isClosed && !!currentEventEndsAt;

    if (timerWrap) {
        timerWrap.classList.toggle("timer-collapsed", !isDeployedActive);
    }

    if (isClosed) {
        banner.classList.remove("hidden");
        homeBtn.classList.add("hidden");
        if (giveawayImg && giveawayImg.getAttribute("src") !== GIVEAWAY_ENDED_IMAGE) {
            giveawayImg.src = GIVEAWAY_ENDED_IMAGE;
        }
    } else {
        banner.classList.add("hidden");
        homeBtn.classList.remove("hidden");
        if (giveawayImg && giveawayImg.getAttribute("src") !== GIVEAWAY_DEFAULT_IMAGE) {
            giveawayImg.src = GIVEAWAY_DEFAULT_IMAGE;
        }
    }

    // Reveal only now that the correct asset/banner for the real status has been set above —
    // removes the guard added in index.html, so the section becomes visible in a single,
    // already-correct frame instead of flashing the wrong state first.
    if (heroSection) heroSection.classList.remove("event-state-pending");
}

function setRegTimerDisplay(d, h, m, s) {
    const pad = n => String(Math.max(0, n)).padStart(2, '0');
    const dEl = document.getElementById("rt-days");
    const hEl = document.getElementById("rt-hours");
    const mEl = document.getElementById("rt-minutes");
    const sEl = document.getElementById("rt-seconds");
    if (dEl) dEl.innerText = pad(d);
    if (hEl) hEl.innerText = pad(h);
    if (mEl) mEl.innerText = pad(m);
    if (sEl) sEl.innerText = pad(s);
}

function formatInTimeOnDate(timestamp) {
    const d = new Date(timestamp);
    const datePart = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    const timePart = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${datePart}, ${timePart}`;
}

function setInTimeOnText(endTimestamp) {
    const el = document.getElementById("in-time-on-text");
    if (!el) return;
    if (!endTimestamp) {
        el.classList.add("hidden");
        el.innerHTML = "";
        return;
    }
    el.innerHTML = `End On: <span>${formatInTimeOnDate(endTimestamp)}</span>`;
    el.classList.remove("hidden");
}

function startRegistrationCountdown(endTimestamp) {
    if (registrationTimerInterval) { clearInterval(registrationTimerInterval); registrationTimerInterval = null; }
    setInTimeOnText(endTimestamp);

    const tick = () => {
        if (!endTimestamp) {
            setRegTimerDisplay(0, 0, 0, 0);
            registrationWindowExpired = false;
            updateEventUiState();
            return;
        }

        const diff = endTimestamp - Date.now();
        if (diff <= 0) {
            setRegTimerDisplay(0, 0, 0, 0);
            registrationWindowExpired = true;
            updateEventUiState();
            if (registrationTimerInterval) { clearInterval(registrationTimerInterval); registrationTimerInterval = null; }
            return;
        }

        registrationWindowExpired = false;
        const totalSeconds = Math.floor(diff / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        setRegTimerDisplay(days, hours, minutes, seconds);
        updateEventUiState();
    };

    tick();
    if (endTimestamp) { registrationTimerInterval = setInterval(tick, 1000); }
}

function buildHomePastPrizePreview() {
    const grid = document.getElementById("home-past-prize-grid");
    if (!grid) return;

    const previewItems = activePastPrizesData.slice(0, 3);
    let html = "";

    if (previewItems.length === 0) {
        html += `<div class="past-prize-cell-container"><div class="past-prize-cell empty-cell"><span>No Data Yet</span></div></div>`;
    } else {
        previewItems.forEach(item => {
            // Admin Panel writes this field as "imageUrl"; fall back to legacy "url" just in case.
            const imgUrl = item.imageUrl || item.url || "";
            const mediaMarkup = imgUrl
                ? `<img src="${imgUrl}" class="past-prize-thumb img-loading" alt="Past Prize" onload="this.classList.remove('img-loading')">`
                : `<div class="prize-fallback-placeholder">${IMAGE_PLACEHOLDER_SVG_MARKUP}</div>`;
            html += `<div class="past-prize-cell-container">
                        <div class="past-prize-cell">
                            ${mediaMarkup}
                            ${item.caption ? `<div class="past-prize-cell-caption">${escapeHtml(item.caption)}</div>` : ''}
                        </div>
                     </div>`;
        });
    }

    html += `<div class="past-prize-cell-container">
                <div class="past-prize-cell see-more-cell" onclick="navigateTo('page-see-more')">
                    <span>SEE<br>MORE</span>
                </div>
             </div>`;

    grid.innerHTML = html;
}

function buildSeeMoreGrid() {
    const grid = document.getElementById("see-more-grid-container");
    if (!grid) return;

    if (activePastPrizesData.length === 0) {
        grid.innerHTML = `<div class="empty-state-text">No past prizes available yet.</div>`;
        return;
    }

    let html = "";
    activePastPrizesData.forEach((item, index) => {
        // Admin Panel writes this field as "imageUrl"; fall back to legacy "url" just in case.
        const imgUrl = item.imageUrl || item.url || "";
        const mediaMarkup = imgUrl
            ? `<img src="${imgUrl}" class="see-more-img img-loading" alt="Past Prize" onload="this.classList.remove('img-loading')" onclick="openImagePreview('${imgUrl}')">`
            : `<div class="see-more-img prize-fallback-placeholder">${IMAGE_PLACEHOLDER_SVG_MARKUP}</div>`;
        html += `<div class="see-more-cell-item">
                    ${mediaMarkup}
                    ${item.caption ? `<div class="see-more-caption-overlay"><p class="see-more-caption">${escapeHtml(item.caption)}</p></div>` : ''}
                 </div>`;
    });
    grid.innerHTML = html;
}

window.openImagePreview = function(url) {
    const overlay = document.getElementById("image-preview-overlay");
    const img = document.getElementById("preview-full-image");
    const dlBtn = document.getElementById("download-preview-btn");
    
    img.src = url;
    
    dlBtn.onclick = async () => {
        const confirmed = await customConfirm("DOWNLOAD IMAGE", "Are you sure you want to download this image?");
        if (!confirmed) return;

        showDownloadBanner("downloading", "Downloading image...");
        fetch(url)
            .then(resp => resp.blob())
            .then(blob => {
                const a = document.createElement("a");
                a.style.display = "none";
                a.href = window.URL.createObjectURL(blob);
                a.download = "TZERONE_Prize_Image.png";
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(a.href);
                document.body.removeChild(a);
                showDownloadBanner("complete", "Download complete");
            })
            .catch(() => {
                window.open(url, '_blank');
                showDownloadBanner("complete", "Download complete");
            });
    };
    
    overlay.classList.remove("hidden");
}

window.closeImagePreviewModal = function() {
    document.getElementById("image-preview-overlay").classList.add("hidden");
}

window.handleImagePreviewOverlayClick = function(e) {
    if (e.target.id === 'image-preview-overlay') {
        closeImagePreviewModal();
    }
}

/* =====================================================================================
   LIVE-STATE FALLBACK CACHE (localStorage)
   Every successful Firestore snapshot mirrors its resolved data into localStorage.
   If Firestore fails to load or a listener's connection drops mid-session, the last
   known-good payload is read back and re-applied through the exact same render path,
   so the UI never shows a blank/broken state — only slightly stale data.
===================================================================================== */
const TZ_CACHE_PREFIX = "tzerone_live_cache::";

function cacheLiveData(cacheKey, payload) {
    try {
        localStorage.setItem(TZ_CACHE_PREFIX + cacheKey, JSON.stringify({ payload, cachedAt: Date.now() }));
    } catch (e) {
        // Storage may be unavailable (private browsing) or full — fail silently, live data still renders.
    }
}

function readCachedLiveData(cacheKey) {
    try {
        const raw = localStorage.getItem(TZ_CACHE_PREFIX + cacheKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return (parsed && parsed.payload !== undefined) ? parsed.payload : null;
    } catch (e) {
        return null;
    }
}

/* =====================================================================================
   APPLY-FUNCTIONS
   Pure UI-application layer shared by: live onSnapshot success callbacks, onSnapshot
   error callbacks (mid-session drop), and full offline bootstrap (Firebase never loaded).
   Keeping this logic in one place guarantees the live path and the fallback path always
   render identically.
===================================================================================== */
function applyLivePrizeConfig(imgUrl, captionStr) {
    const homeImg = document.getElementById("home-prize-image");
    const homePlaceholder = document.getElementById("home-prize-placeholder");
    if (imgUrl) {
        if (homeImg && homeImg.src !== imgUrl) { homeImg.classList.add("img-loading"); homeImg.src = imgUrl; }
        if (homeImg) homeImg.classList.remove("hidden");
        if (homePlaceholder) homePlaceholder.classList.add("hidden");
    } else {
        if (homeImg) { homeImg.classList.add("hidden"); homeImg.removeAttribute("src"); }
        if (homePlaceholder) homePlaceholder.classList.remove("hidden");
    }
    const captionEl = document.getElementById("home-prize-caption");
    if (captionEl) captionEl.innerText = captionStr;

    // Conditional gradient overlay: only show the bottom caption gradient when actual
    // caption text is present, so an image with no caption renders clean edge-to-edge.
    const captionOverlay = document.getElementById("home-prize-caption-overlay");
    if (captionOverlay) captionOverlay.classList.toggle("hidden", !captionStr);
}

/* Dynamic Multi-Notice Board: renders one carousel-slide per notice item, using the
   exact same "prize-card ratio-1-1 > prize-image-frame" structure (image, fallback
   placeholder, caption overlay) as every other slide in this app, and reusing the
   identical .swipe-carousel-track / .slider-arrow touch-swipe framework already
   powering the Latest Prize / Past Prize carousel above it. Fully sandboxed to its
   own #notice-carousel-track element, so it never affects that other carousel. */
let activeNoticeItems = [];
function buildNoticeCarousel(items) {
    activeNoticeItems = Array.isArray(items) ? items : [];
    const track = document.getElementById("notice-carousel-track");
    if (!track) return;

    let html = "";
    if (activeNoticeItems.length === 0) {
        html = `<section class="carousel-slide">
                    <div class="latest-prize-section">
                        <h3 class="section-title">NOTICE</h3>
                        <div class="prize-card ratio-1-1">
                            <div class="prize-image-frame">
                                <div class="prize-fallback-placeholder">${IMAGE_PLACEHOLDER_SVG_MARKUP}</div>
                                <div class="prize-caption-overlay">
                                    <p class="prize-caption">No active notice at this time.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>`;
    } else {
        activeNoticeItems.forEach(item => {
            // Admin Panel writes this field as "imageUrl"; fall back to legacy "url" just in case.
            const imgUrl = item.imageUrl || item.url || "";
            const captionStr = item.caption || "";
            const mediaMarkup = imgUrl
                ? `<img src="${imgUrl}" alt="Notice" class="prize-image img-loading" onload="this.classList.remove('img-loading')">`
                : `<div class="prize-fallback-placeholder">${IMAGE_PLACEHOLDER_SVG_MARKUP}</div>`;
            // Only render the bottom gradient overlay when there is actual caption text —
            // otherwise the image displays clean edge-to-edge with no empty shadow.
            const captionMarkup = captionStr
                ? `<div class="prize-caption-overlay"><p class="prize-caption">${escapeHtml(captionStr)}</p></div>`
                : '';
            html += `<section class="carousel-slide">
                        <div class="latest-prize-section">
                            <h3 class="section-title">NOTICE</h3>
                            <div class="prize-card ratio-1-1">
                                <div class="prize-image-frame">
                                    ${mediaMarkup}
                                    ${captionMarkup}
                                </div>
                            </div>
                        </div>
                     </section>`;
        });
    }
    track.innerHTML = html;

    // Slide count changed (images/captions swapped in-place), so the arrow visibility
    // state and their vertical-center alignment against the (possibly new) image frame
    // element both need a fresh recalculation.
    refreshHomeCarousels();
}

function applyPastPrizeConfig(items) {
    activePastPrizesData = Array.isArray(items) ? items : [];
    buildHomePastPrizePreview();
    buildSeeMoreGrid();
}

function applyCreatorIconConfig(imgUrl, ratio) {
    const badgeImg = document.getElementById("creator-badge-icon");
    const badgePlaceholder = document.getElementById("creator-badge-placeholder");
    const badgeFrame = document.getElementById("creator-badge-frame");
    if (!badgeImg) return;

    if (imgUrl) {
        if (badgeImg.getAttribute("src") !== imgUrl) {
            badgeImg.src = imgUrl;
        }
        badgeImg.classList.remove("hidden");
        if (badgePlaceholder) badgePlaceholder.classList.add("hidden");
    } else {
        badgeImg.removeAttribute("src");
        badgeImg.classList.add("hidden");
        if (badgePlaceholder) badgePlaceholder.classList.remove("hidden");
    }

    if (ratio) {
        badgeImg.style.aspectRatio = ratio;
        badgeImg.style.objectFit = "cover";
        if (badgeFrame) badgeFrame.style.aspectRatio = ratio;
    }
}

function applyEventConfig(status, endsAt) {
    liveEventStatus = status || "open";
    currentEventEndsAt = endsAt || null;
    startRegistrationCountdown(endsAt || null);
    updateEventUiState();
}

function applySubmissionsData(rawList) {
    activeFirestoreSubmissionsSnapshot = [];
    activeArchiveSnapshot = [];
    (Array.isArray(rawList) ? rawList : []).forEach(d => {
        if (d.status === "archived") activeArchiveSnapshot.push(d);
        else activeFirestoreSubmissionsSnapshot.push(d);
    });
    buildPublicDashboardUI();
}

function applyWinnerHistoryData(rawList) {
    activeFirestoreWinnerHistorySnapshot = (Array.isArray(rawList) ? rawList.slice() : []);
    activeFirestoreWinnerHistorySnapshot.sort((x, y) => (y.wonAt || 0) - (x.wonAt || 0));
    buildPublicWinnerHistoryUI();
}

/* =====================================================================================
   GPU-COMPOSITED GLASSMORPHISM ANNOUNCEMENT BANNER
   Purely additive: the banner is fixed-position and layered above the app, so its
   entrance/exit never reflows or shifts any existing element on the page. Motion runs
   exclusively on transform/opacity (translate3d + will-change + backface-visibility)
   so it composites on the GPU thread and stays smooth at high refresh rates, matching
   the rest of the app's animation approach.
===================================================================================== */
let liveAnnouncementData = null;
let liveSystemStatusData = null;
let lastDismissedAnnouncementId = null;
let announcementBannerAutoHideTimer = null;

function injectDynamicBannerStyles() {
    if (document.getElementById("tz-dynamic-banner-styles")) return;
    const style = document.createElement("style");
    style.id = "tz-dynamic-banner-styles";
    style.textContent = `
        .tz-announcement-banner {
            position: fixed;
            top: 14px;
            left: 50%;
            width: calc(100% - 40px);
            max-width: 440px;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 16px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            box-shadow: 0 15px 35px rgba(0,0,0,0.35);
            z-index: 9500;
            transform: translate3d(-50%, -140%, 0);
            opacity: 0;
            pointer-events: none;
            will-change: transform, opacity;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
            transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease;
            touch-action: pan-x;
        }
        .tz-announcement-banner.tz-banner-visible {
            transform: translate3d(-50%, 0, 0);
            opacity: 1;
            pointer-events: auto;
        }
        .tz-announcement-banner .tz-banner-icon { flex: 0 0 auto; display: flex; }
        .tz-announcement-banner .tz-banner-message {
            flex: 1 1 auto;
            font-size: 0.85rem;
            font-weight: 600;
            color: #FFFFFF;
            line-height: 1.35;
            text-align: left;
        }
        .tz-announcement-banner .tz-banner-close-btn {
            flex: 0 0 auto;
            background: rgba(255,255,255,0.08);
            border: none;
            width: 26px;
            height: 26px;
            min-width: 26px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #FFFFFF;
            cursor: pointer;
        }
        .tz-announcement-banner.tz-banner-type-success { border-color: rgba(57,255,20,0.35); }
        .tz-announcement-banner.tz-banner-type-error { border-color: rgba(255,59,48,0.4); }
        .tz-announcement-banner.tz-banner-type-warning { border-color: rgba(255,193,7,0.4); }
        .tz-announcement-banner.tz-banner-type-info { border-color: rgba(0,168,255,0.35); }
    `;
    document.head.appendChild(style);
}

function getBannerIconSvg(type) {
    if (type === "success") return `<svg viewBox="0 0 24 24" width="22" height="22" fill="#39FF14"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
    if (type === "error") return `<svg viewBox="0 0 24 24" width="22" height="22" fill="#FF3B30"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
    if (type === "warning") return `<svg viewBox="0 0 24 24" width="22" height="22" fill="#FFC107"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`;
    return `<svg viewBox="0 0 24 24" width="22" height="22" fill="#00A8FF"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
}

/* =====================================================================================
   DOWNLOAD NOTIFICATION BANNER (Past Prizes / Winner History image downloads)
   Purely additive and fully independent from the announcement banner above — shows a
   glassmorphism-blurred banner the instant an image download starts, with a theme-color
   border while downloading, then flips the border to Green on completion.
===================================================================================== */
let downloadBannerAutoHideTimer = null;

function ensureDownloadBannerElement() {
    let banner = document.getElementById("tz-download-banner");
    if (banner) return banner;

    banner = document.createElement("div");
    banner.id = "tz-download-banner";
    banner.className = "tz-download-banner";
    banner.innerHTML = `
        <span class="tz-dl-icon"></span>
        <span class="tz-dl-message"></span>
    `;
    document.body.appendChild(banner);
    return banner;
}

function getDownloadBannerIconSvg(state) {
    if (state === "complete") {
        return `<svg viewBox="0 0 24 24" width="22" height="22" fill="#39FF14"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
    }
    return `<svg class="tz-dl-spinner-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#00A8FF" stroke-width="2.5" stroke-linecap="round"><path d="M12 2 a10 10 0 0 1 10 10"/></svg>`;
}

// state: "downloading" | "complete"
function showDownloadBanner(state, message) {
    const banner = ensureDownloadBannerElement();
    clearTimeout(downloadBannerAutoHideTimer);

    banner.classList.toggle("tz-dl-complete", state === "complete");
    banner.querySelector(".tz-dl-icon").innerHTML = getDownloadBannerIconSvg(state);
    banner.querySelector(".tz-dl-message").innerText = message;

    requestAnimationFrame(() => banner.classList.add("tz-dl-visible"));

    if (state === "complete") {
        downloadBannerAutoHideTimer = setTimeout(() => {
            banner.classList.remove("tz-dl-visible");
        }, 1800);
    }
}

function ensureAnnouncementBannerElement() {
    let banner = document.getElementById("tz-live-announcement-banner");
    if (banner) return banner;

    banner = document.createElement("div");
    banner.id = "tz-live-announcement-banner";
    banner.className = "tz-announcement-banner";
    banner.innerHTML = `
        <span class="tz-banner-icon"></span>
        <span class="tz-banner-message"></span>
        <button type="button" class="tz-banner-close-btn" aria-label="Dismiss">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/></svg>
        </button>
    `;
    document.body.appendChild(banner);

    banner.querySelector(".tz-banner-close-btn").addEventListener("click", () => {
        lastDismissedAnnouncementId = banner.dataset.activeId || null;
        hideAnnouncementBanner(banner);
    });

    attachBannerSwipeToDismiss(banner);

    return banner;
}

// Swipe/drag-to-dismiss: lets the user push the banner upward off-screen with a finger
// (touch) or mouse drag, mirroring a native mobile push-notification gesture. Applies to
// this single reused banner element regardless of which content (live announcement or
// system status) it is currently rendering, so it works for any admin-controlled banner.
const BANNER_SWIPE_DISMISS_THRESHOLD = 50;
function attachBannerSwipeToDismiss(banner) {
    if (banner.dataset.swipeBound === "true") return;
    banner.dataset.swipeBound = "true";

    let isDragging = false;
    let startY = 0;
    let currentY = 0;

    const getClientY = (e) => (e.touches && e.touches.length) ? e.touches[0].clientY : e.clientY;

    const onDragStart = (e) => {
        // Ignore presses that start on the close button so a tap/click always dismisses
        // the banner immediately instead of being reinterpreted (and reverted) as a failed swipe.
        if (e.target.closest(".tz-banner-close-btn")) return;
        isDragging = true;
        startY = getClientY(e);
        currentY = startY;
        banner.style.transition = "none";
    };

    const onDragMove = (e) => {
        if (!isDragging) return;
        currentY = getClientY(e);
        // Only allow dragging upward (negative delta) — downward drags snap back with no visual movement.
        const delta = Math.min(0, currentY - startY);
        banner.style.transform = `translate3d(-50%, ${delta}px, 0)`;
        if (e.cancelable) e.preventDefault();
    };

    const onDragEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        const delta = currentY - startY;
        banner.style.transition = "";
        banner.style.transform = "";

        if (delta < -BANNER_SWIPE_DISMISS_THRESHOLD) {
            lastDismissedAnnouncementId = banner.dataset.activeId || null;
            hideAnnouncementBanner(banner);
        } else {
            requestAnimationFrame(() => banner.classList.add("tz-banner-visible"));
        }
    };

    banner.addEventListener("touchstart", onDragStart, { passive: true });
    banner.addEventListener("touchmove", onDragMove, { passive: false });
    banner.addEventListener("touchend", onDragEnd);
    banner.addEventListener("touchcancel", onDragEnd);

    banner.addEventListener("mousedown", onDragStart);
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
}

function hideAnnouncementBanner(banner) {
    const el = banner || document.getElementById("tz-live-announcement-banner");
    if (!el) return;
    clearTimeout(announcementBannerAutoHideTimer);
    el.classList.remove("tz-banner-visible");
}

function renderLiveAnnouncementBanner() {
    const banner = ensureAnnouncementBannerElement();

    // A maintenance / outage system-status entry always takes priority over a regular announcement.
    const activeItem = (liveSystemStatusData && liveSystemStatusData.active)
        ? { id: "system-status", type: liveSystemStatusData.type || "warning", message: liveSystemStatusData.message || "" }
        : liveAnnouncementData;

    if (!activeItem || !activeItem.message || activeItem.id === lastDismissedAnnouncementId) {
        hideAnnouncementBanner(banner);
        return;
    }

    banner.dataset.activeId = activeItem.id;
    banner.className = `tz-announcement-banner tz-banner-type-${activeItem.type || "info"}`;
    banner.querySelector(".tz-banner-icon").innerHTML = getBannerIconSvg(activeItem.type);
    banner.querySelector(".tz-banner-message").innerText = activeItem.message;

    requestAnimationFrame(() => banner.classList.add("tz-banner-visible"));

    clearTimeout(announcementBannerAutoHideTimer);
    const isPersistent = (activeItem.id === "system-status") || activeItem.autoHideMs === 0;
    if (!isPersistent) {
        const hideDelay = activeItem.autoHideMs || 8000;
        announcementBannerAutoHideTimer = setTimeout(() => hideAnnouncementBanner(banner), hideDelay);
    }
}

function showOfflineModeIndicator() {
    liveSystemStatusData = { active: true, type: "error", message: "Connection unavailable — showing last saved data." };
    renderLiveAnnouncementBanner();
}

function hideOfflineModeIndicator() {
    if (liveSystemStatusData && liveSystemStatusData.message === "Connection unavailable — showing last saved data.") {
        liveSystemStatusData = null;
        renderLiveAnnouncementBanner();
    }
}

/* =====================================================================================
   FIRESTORE LIVE-STATE LISTENERS
   Config/doc names, collection names, and function names are unchanged from the prior
   implementation. Each listener now also (a) caches its resolved payload to localStorage
   on every successful tick, and (b) accepts an onError callback so a mid-session
   connectivity drop degrades gracefully to the last cached payload instead of freezing
   or throwing in the console.
===================================================================================== */
function initializeRealtimeConfigurationStreams() {
    if (!window.FirebaseBridge) return;
    const { db, doc, onSnapshot } = window.FirebaseBridge;

    onSnapshot(doc(db, "configuration", "livePrize"), (docSnapshot) => {
        let imgUrl = DEFAULT_PRIZE_IMAGE, captionStr = DEFAULT_PRIZE_CAPTION;
        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            // Ignore the Admin Panel's blank-pixel reset value (data:image/gif...) so a
            // "Remove Image" save on the Edit page correctly restores the placeholder here
            // instead of rendering an invisible 1x1 image.
            if (data.imageUrl && data.imageUrl.indexOf("data:image/gif;base64") === -1) imgUrl = data.imageUrl;
            if (data.caption) captionStr = data.caption;
        }
        applyLivePrizeConfig(imgUrl, captionStr);
        cacheLiveData("livePrize", { imgUrl, captionStr });
    }, (error) => {
        console.error("livePrize stream connectivity drop:", error);
        const cached = readCachedLiveData("livePrize");
        if (cached) applyLivePrizeConfig(cached.imgUrl, cached.captionStr);
    });

    // NOTICE: real-time listener for the Admin Panel's dynamic multi-notice Notice Edit
    // section. configuration/notice now stores { items: [{imageUrl, caption}, ...] } --
    // the exact same array shape as configuration/pastPrize -- so any card added, edited,
    // or removed via ADD MORE / REMOVE / SAVE propagates here instantly as a fresh
    // multi-slide swiper, with no manual page reload required.
    onSnapshot(doc(db, "configuration", "notice"), (docSnapshot) => {
        let items = [];
        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            if (Array.isArray(data.items)) {
                items = data.items.filter(it => it && it.imageUrl && it.imageUrl.indexOf("data:image/gif;base64") === -1);
            } else if (data.imageUrl && data.imageUrl.indexOf("data:image/gif;base64") === -1) {
                // Backward-compatible migration path for the legacy single-notice record shape.
                items = [{ imageUrl: data.imageUrl, caption: data.caption || "" }];
            }
        }
        buildNoticeCarousel(items);
        cacheLiveData("notice", items);
    }, (error) => {
        console.error("notice stream connectivity drop:", error);
        const cached = readCachedLiveData("notice");
        if (cached) buildNoticeCarousel(cached);
    });

    // NOTE: the Admin Panel writes past-prize data to configuration/pastPrize (singular).
    // This listener was previously pointed at "pastPrizes" (plural) and never received updates.
    onSnapshot(doc(db, "configuration", "pastPrize"), (docSnapshot) => {
        let items = [];
        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            if (Array.isArray(data.items)) {
                items = data.items;
            } else if (data.imageUrl) {
                // Legacy single-image shape the admin panel can also write
                items = [{ url: data.imageUrl, caption: data.caption || "" }];
            }
        }
        applyPastPrizeConfig(items);
        cacheLiveData("pastPrize", items);
    }, (error) => {
        console.error("pastPrize stream connectivity drop:", error);
        const cached = readCachedLiveData("pastPrize");
        if (cached) applyPastPrizeConfig(cached);
    });

    onSnapshot(doc(db, "configuration", "creatorIcon"), (docSnapshot) => {
        let imgUrl = "";
        let ratio = null;
        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            // Same blank-pixel guard as livePrize: a removed/reset icon saved from the
            // Edit page falls back to the placeholder instead of an invisible 1x1 image.
            if (data.imageUrl && data.imageUrl.indexOf("data:image/gif;base64") === -1) imgUrl = data.imageUrl;
            if (data.aspectRatio) ratio = data.aspectRatio;
        }
        // Admin-pushed icon syncs immediately: swap or clear the cached image with no refresh/save step needed.
        applyCreatorIconConfig(imgUrl, ratio);
        cacheLiveData("creatorIcon", { imgUrl, ratio });
    }, (error) => {
        console.error("creatorIcon stream connectivity drop:", error);
        const cached = readCachedLiveData("creatorIcon");
        if (cached) applyCreatorIconConfig(cached.imgUrl, cached.ratio);
    });

    // The Admin Panel's countdown deploy/reset tools write status + endsAt together onto
    // configuration/event (there is no separate "registrationTimer" doc), so both are read here.
    onSnapshot(doc(db, "configuration", "event"), (docSnapshot) => {
        let status = "open";
        let endsAt = null;
        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            status = data.status || "open";
            if (data.endsAt) endsAt = data.endsAt;
        }
        applyEventConfig(status, endsAt);
        cacheLiveData("event", { status, endsAt });
    }, (error) => {
        console.error("event config stream connectivity drop:", error);
        const cached = readCachedLiveData("event");
        if (cached) applyEventConfig(cached.status, cached.endsAt);
    });
}

function initializeRealtimeSubmissionDataStreams() {
    if (!window.FirebaseBridge) return;
    const { db, collection, query, onSnapshot } = window.FirebaseBridge;

    onSnapshot(query(collection(db, "submissions")), (querySnapshot) => {
        const rawList = [];
        querySnapshot.forEach(docSnap => {
            rawList.push({ id: docSnap.id, ...docSnap.data() });
        });
        // Initialize display build with requested sorting mechanic
        applySubmissionsData(rawList);
        cacheLiveData("submissions", rawList);
    }, (error) => {
        console.error("submissions stream connectivity drop:", error);
        const cached = readCachedLiveData("submissions");
        if (cached) applySubmissionsData(cached);
    });
}

function initializeRealtimeWinnerHistoryStreams() {
    if (!window.FirebaseBridge) return;
    const { db, collection, query, onSnapshot } = window.FirebaseBridge;

    onSnapshot(query(collection(db, "winnerHistory")), (querySnapshot) => {
        const rawList = [];
        querySnapshot.forEach(docSnap => {
            rawList.push({ id: docSnap.id, ...docSnap.data() });
        });
        applyWinnerHistoryData(rawList);
        cacheLiveData("winnerHistory", rawList);
    }, (error) => {
        console.error("winnerHistory stream connectivity drop:", error);
        const cached = readCachedLiveData("winnerHistory");
        if (cached) applyWinnerHistoryData(cached);
    });
}

// Dynamic Notices/Events: listens to the "announcements" collection (one-off timed notices,
// latest active entry wins) and configuration/systemStatus (a persistent maintenance/outage
// flag the Admin Panel can toggle). Either one renders instantly via the glass banner above,
// with zero page refresh, matching the same onSnapshot pattern used everywhere else in this file.
function initializeRealtimeAnnouncementStreams() {
    if (!window.FirebaseBridge) return;
    const { db, doc, collection, query, onSnapshot } = window.FirebaseBridge;

    onSnapshot(query(collection(db, "announcements")), (querySnapshot) => {
        let latest = null;
        const now = Date.now();
        querySnapshot.forEach(docSnap => {
            const d = docSnap.data();
            if (d.active === false) return;
            if (d.expiresAt && d.expiresAt < now) return;
            const stamp = d.timestamp || d.createdAt || 0;
            if (!latest || stamp > latest._stamp) {
                latest = {
                    // The Admin Panel always republishes into the same doc ("current"), so the
                    // dismissal key must include the publish timestamp — otherwise dismissing
                    // one announcement would permanently suppress every future one this session.
                    id: `${docSnap.id}::${stamp}`,
                    type: d.type || "info",
                    message: d.message || d.text || "",
                    autoHideMs: (typeof d.autoHideMs === "number") ? d.autoHideMs : undefined,
                    _stamp: stamp
                };
            }
        });
        liveAnnouncementData = latest;
        cacheLiveData("announcements", latest);
        renderLiveAnnouncementBanner();
    }, (error) => {
        console.error("announcements stream connectivity drop:", error);
        const cached = readCachedLiveData("announcements");
        if (cached) { liveAnnouncementData = cached; renderLiveAnnouncementBanner(); }
    });

    onSnapshot(doc(db, "configuration", "systemStatus"), (docSnapshot) => {
        let statusData = null;
        if (docSnapshot.exists()) {
            const d = docSnapshot.data();
            statusData = { active: !!d.active, type: d.type || "warning", message: d.message || "" };
        }
        liveSystemStatusData = statusData;
        cacheLiveData("systemStatus", statusData);
        renderLiveAnnouncementBanner();
    }, (error) => {
        console.error("systemStatus stream connectivity drop:", error);
        const cached = readCachedLiveData("systemStatus");
        if (cached) { liveSystemStatusData = cached; renderLiveAnnouncementBanner(); }
    });
}

/* =====================================================================================
   CONNECTION BOOTSTRAP
   Waits for the Firebase module (loaded via <script type="module"> in index.html) to
   expose window.FirebaseBridge. If it never becomes available — network blocked, SDK
   failed to load, connectivity dropped before first paint — the app falls back to
   whatever was last cached in localStorage instead of showing empty/loading states forever.
===================================================================================== */
const FIREBASE_INIT_RETRY_LIMIT = 8;
const FIREBASE_INIT_RETRY_DELAY_MS = 400;
let firebaseInitRetryCount = 0;

// Guards every onSnapshot listener below from ever being registered more than once.
// bootFirestoreLiveConnections() is called both on initial load AND on every browser
// "online" event (network reconnects, wifi/airplane-mode toggles, mobile signal drops) —
// without this flag, each reconnect re-ran every initializeRealtime*Streams() function
// and stacked a brand new set of onSnapshot listeners on top of the still-active ones,
// so a session with a few reconnects ended up with 2x/3x/4x duplicate listeners: every
// live update then fired its render path multiple times (visible flicker/jank) and the
// tab quietly leaked memory + wasted reads for as long as it stayed open. The Firestore
// SDK already auto-resumes existing listeners on reconnect on its own, so once booted
// there is nothing further to (re)initialize here.
let liveConnectionsBooted = false;

function bootFirestoreLiveConnections() {
    if (liveConnectionsBooted) {
        // Already streaming — the Firestore SDK handles reconnect/resume internally.
        hideOfflineModeIndicator();
        return;
    }

    if (window.FirebaseBridge) {
        liveConnectionsBooted = true;
        hideOfflineModeIndicator();
        initializeRealtimeConfigurationStreams();
        initializeRealtimeSubmissionDataStreams();
        initializeRealtimeWinnerHistoryStreams();
        initializeRealtimeAnnouncementStreams();
        return;
    }

    if (firebaseInitRetryCount < FIREBASE_INIT_RETRY_LIMIT) {
        firebaseInitRetryCount++;
        setTimeout(bootFirestoreLiveConnections, FIREBASE_INIT_RETRY_DELAY_MS);
        return;
    }

    console.warn("Firebase Bridge unavailable after retries — engaging localStorage fallback mode.");
    engageOfflineFallbackMode();
}

function engageOfflineFallbackMode() {
    const livePrizeCache = readCachedLiveData("livePrize");
    if (livePrizeCache) applyLivePrizeConfig(livePrizeCache.imgUrl, livePrizeCache.captionStr);

    const noticeCache = readCachedLiveData("notice");
    if (noticeCache) buildNoticeCarousel(noticeCache);

    const pastPrizeCache = readCachedLiveData("pastPrize");
    if (pastPrizeCache) applyPastPrizeConfig(pastPrizeCache);

    const creatorIconCache = readCachedLiveData("creatorIcon");
    if (creatorIconCache) applyCreatorIconConfig(creatorIconCache.imgUrl, creatorIconCache.ratio);

    const eventCache = readCachedLiveData("event");
    if (eventCache) applyEventConfig(eventCache.status, eventCache.endsAt);

    const submissionsCache = readCachedLiveData("submissions");
    if (submissionsCache) applySubmissionsData(submissionsCache);

    const winnerHistoryCache = readCachedLiveData("winnerHistory");
    if (winnerHistoryCache) applyWinnerHistoryData(winnerHistoryCache);

    const announcementCache = readCachedLiveData("announcements");
    if (announcementCache) liveAnnouncementData = announcementCache;

    const statusCache = readCachedLiveData("systemStatus");
    if (statusCache) liveSystemStatusData = statusCache;

    showOfflineModeIndicator();
}

function buildPublicDashboardUI() {
    const scrollContainer = document.getElementById("public-players-list");
    if (!scrollContainer) return;
    let verifiedRecords = activeFirestoreSubmissionsSnapshot.filter(item => item.status === "approved");

    // Dynamic Filter Toggle State Processing
    if (dashboardSortState === 1) { 
        verifiedRecords.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Chronological Newest
    } else if (dashboardSortState === 2) { 
        verifiedRecords.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)); // Reverse Oldest
    } else if (dashboardSortState === 3) { 
        verifiedRecords.sort((a, b) => (a.name || "").localeCompare(b.name || "")); // Alphabetical
    }

    if (verifiedRecords.length === 0) {
        scrollContainer.innerHTML = `<div class="empty-state-text">No verified records listed.</div>`;
        return;
    }
    
    let html = "";
    verifiedRecords.forEach((player, idx) => {
        html += `<div class="player-row-item" data-gameid="${escapeHtml(player.gameId)}" data-name="${escapeHtml(player.name)}">
                    <span>${idx + 1}. NAME: ${escapeHtml(player.name)}</span>
                    <span class="p-meta-id">ID: ${escapeHtml(player.gameId)}</span>
                </div>`;
    });
    scrollContainer.innerHTML = html;
    
    // Re-apply existing text filter state after rendering new sort
    filterPublicDashboard();
}

function buildPublicWinnerHistoryUI() {
    const scrollContainer = document.getElementById("public-winners-list");
    if (!scrollContainer) return;

    if (activeFirestoreWinnerHistorySnapshot.length === 0) {
        scrollContainer.innerHTML = `<div class="empty-state-text">No past winners recorded yet.</div>`;
        return;
    }
    let html = "";
    activeFirestoreWinnerHistorySnapshot.forEach((player, idx) => {
        const dateStr = new Date(player.wonAt || Date.now()).toLocaleDateString();
        html += `<div class="winner-card-item" onclick="openWinnerModal('${player.id}')">
                    <div class="winner-card-row">
                        <span class="winner-card-name">${idx + 1}. ${escapeHtml(player.name)} 🏆</span>
                    </div>
                    <div class="winner-card-row">
                        <span class="p-meta-id">ID: ${escapeHtml(player.gameId)}</span>
                        <span class="p-meta-date">${dateStr}</span>
                    </div>
                </div>`;
    });
    scrollContainer.innerHTML = html;
}

window.openWinnerModal = function(winnerId) {
    const winner = activeFirestoreWinnerHistorySnapshot.find(w => w.id === winnerId);
    if (!winner) return;

    document.getElementById("winner-modal-name").innerText = winner.name || "N/A";
    document.getElementById("winner-modal-id").innerText = winner.gameId || "N/A";
    // Permanent static label — matches the "PRIZE GRANTED" tag styling used on the
    // Lucky Draw Website's congratulations popup exactly (see .winner-modal-tag in styles.css).
    document.getElementById("winner-modal-tag").innerText = "PRIZE GRANTED";

    const prizeImg = document.getElementById("winner-modal-image");
    const fallbackIcon = document.getElementById("winner-modal-fallback");
    // Unified schema: the canonical field is "prizeImage" (written by both the Lucky
    // Draw engine and the Admin Panel). The remaining names are kept only as legacy
    // fallbacks so older winner records keep rendering their image correctly.
    const prizeImgUrl = (winner.prizeImage || winner.prizeImageUrl || winner.imageUrl || winner.image || "").trim();

    const showFallbackIcon = () => {
        prizeImg.classList.add("hidden");
        prizeImg.classList.remove("img-loading");
        prizeImg.removeAttribute("src");
        prizeImg.onclick = null;
        fallbackIcon.classList.remove("hidden");
    };

    // Reset handlers before assigning a new src so stale onload/onerror callbacks
    // from a previously opened winner never fire against the wrong state.
    prizeImg.onload = null;
    prizeImg.onerror = null;

    if (prizeImgUrl && prizeImgUrl !== TRANSPARENT_PIXEL) {
        prizeImg.classList.add("hidden");
        // Same shimmering skeleton used by the Latest Prize / Past Prizes / Notice images
        // while this popup's prize image downloads.
        prizeImg.classList.add("img-loading");
        fallbackIcon.classList.add("hidden");
        prizeImg.onload = () => {
            prizeImg.classList.remove("img-loading");
            fallbackIcon.classList.add("hidden");
            prizeImg.classList.remove("hidden");
        };
        // Strict validation fallback: if the URL is broken / fails to load, swap to the SVG icon
        // instead of leaving a blank space or a broken-image glyph.
        prizeImg.onerror = showFallbackIcon;
        prizeImg.onclick = () => openImagePreview(prizeImgUrl);
        prizeImg.src = prizeImgUrl;
    } else {
        showFallbackIcon();
    }

    document.getElementById("winner-modal-overlay").classList.remove("hidden");
}

window.closeWinnerModal = function() {
    document.getElementById("winner-modal-overlay").classList.add("hidden");
}

window.handleWinnerOverlayClick = function(e) {
    if (e.target.id === "winner-modal-overlay") closeWinnerModal();
}

window.copyWinnerId = async function() {
    const idText = document.getElementById("winner-modal-id").innerText;
    const btn = document.querySelector(".copy-id-btn");
    const originalBtnHtml = btn ? btn.innerHTML : null;

    // Clean, native-feeling confirmation: briefly swap the icon instead of popping an alert modal.
    const showCopiedFeedback = () => {
        if (!btn) return;
        btn.classList.add("copied");
        btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#39FF14"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
        clearTimeout(btn._copyResetTimer);
        btn._copyResetTimer = setTimeout(() => {
            btn.classList.remove("copied");
            btn.innerHTML = originalBtnHtml;
        }, 1600);
    };

    // Reliable fallback for legacy or restricted embedded webview browsers (e.g. in-app
    // browsers inside social apps) where navigator.clipboard is unavailable or blocked.
    const legacyCopyFallback = (text) => {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        let succeeded = false;
        try {
            succeeded = document.execCommand("copy");
        } catch (e) {
            succeeded = false;
        }
        document.body.removeChild(textarea);
        return succeeded;
    };

    try {
        if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(idText);
            showCopiedFeedback();
            return;
        }
        throw new Error("Clipboard API unavailable in this context");
    } catch (e) {
        if (legacyCopyFallback(idText)) {
            showCopiedFeedback();
        } else {
            await customAlert("Error", "Unable to copy ID to clipboard.", "error");
        }
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}