let formStagingCache = { name: '', age: '', countryDialCode: '+880', phoneNumber: '', gameId: '' };
let activeFirestoreSubmissionsSnapshot = [];
let activeFirestoreWinnerHistorySnapshot = [];
let activeArchiveSnapshot = [];
let liveEventStatus = "open"; 

const DEFAULT_PRIZE_IMAGE = "";
const DEFAULT_PRIZE_CAPTION = "Loading prize details...";
const DEFAULT_PAST_PRIZE_IMAGE = "";
const DEFAULT_PAST_PRIZE_CAPTION = "Loading past rewards...";

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
        if(type === 'error') iconSvg = `<svg viewBox="0 0 24 24" width="48" height="48" fill="#FF3B30"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
        else if(type === 'success') iconSvg = `<svg viewBox="0 0 24 24" width="48" height="48" fill="#39FF14"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
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

window.addEventListener("load", () => {
    setTimeout(() => {
        const loader = document.getElementById("global-page-loader");
        if (loader) loader.classList.add("hidden");
    }, 400);
});

document.addEventListener("DOMContentLoaded", () => {
    setupInteractionListeners();
    setupSliderObserver();
    populateCountryList(countryDataList);
    
    setTimeout(() => {
        initializeRealtimeConfigurationStreams();
        initializeRealtimeSubmissionDataStreams();
        initializeRealtimeWinnerHistoryStreams();
    }, 500);
});

function setupInteractionListeners() {
    const gameIdInput = document.getElementById("input-gameid");
    if (gameIdInput) {
        gameIdInput.addEventListener("input", (e) => {
            let val = e.target.value.toUpperCase();
            if (val.length > 0) {
                val = val.replace(/^#+/g, '');
                e.target.value = "#" + val;
            }
        });
        gameIdInput.addEventListener("blur", (e) => {
            if (e.target.value === "#" || e.target.value.length === 0) { e.target.value = ""; }
        });
    }
    document.getElementById("country-selector-btn")?.addEventListener("click", () => toggleCountryModal(true));
}

function setupSliderObserver() {
    const track = document.getElementById("home-carousel-track");
    const leftBtn = document.getElementById("slider-btn-left");
    const rightBtn = document.getElementById("slider-btn-right");

    if(!track || !leftBtn || !rightBtn) return;

    const updateArrows = () => {
        const scrollL = track.scrollLeft;
        const maxScroll = track.scrollWidth - track.clientWidth;
        
        if (scrollL <= 5) leftBtn.classList.add("hidden");
        else leftBtn.classList.remove("hidden");

        if (scrollL >= maxScroll - 5) rightBtn.classList.add("hidden");
        else rightBtn.classList.remove("hidden");
    };

    track.addEventListener("scroll", updateArrows);
    window.addEventListener("resize", updateArrows);
    updateArrows();

    leftBtn.onclick = () => track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
    rightBtn.onclick = () => track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
}

window.navigateTo = function(targetPageId) {
    if(targetPageId === 'page-form' && liveEventStatus === "closed") {
        customAlert("EVENT ENDED", "This event is currently closed. Submissions are no longer accepted.", "error");
        return;
    }
    document.querySelectorAll(".view-page").forEach(page => page.classList.remove("active"));
    const targetNode = document.getElementById(targetPageId);
    if (targetNode) { targetNode.classList.add("active"); window.scrollTo(0, 0); }
}

window.switchPublicTab = function(targetTabId) {
    document.querySelectorAll(".public-tab-content").forEach(tab => tab.classList.remove("active"));
    document.querySelectorAll(".public-tabs-nav .p-tab-btn").forEach(btn => btn.classList.remove("active"));
    document.getElementById(targetTabId).classList.add("active");
    const activeBtn = Array.from(document.querySelectorAll(".public-tabs-nav .p-tab-btn")).find(btn => btn.getAttribute("onclick").includes(targetTabId));
    if (activeBtn) activeBtn.classList.add("active");
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
    if(val.length > 0) { input.value = "+" + val; } else { input.value = ""; }
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
    const gameIdVal = document.getElementById("input-gameid").value.trim().toUpperCase();

    if (!nameVal || isNaN(ageVal) || !phoneVal || !gameIdVal) {
        await customAlert("Missing Fields", "Please completely fill out all fields before submitting.", "error");
        return;
    }
    if (ageVal < 1 || ageVal > 99) {
        await customAlert("Invalid Age", "Please provide a valid age between 1 and 99.", "error");
        return;
    }
    if (!gameIdVal.startsWith("#") || gameIdVal.length < 2 || gameIdVal.length > 15) {
        await customAlert("Invalid ID", "A valid Game ID must begin with '#' and be under 15 characters.", "error");
        return;
    }

    const existsInSubmissions = activeFirestoreSubmissionsSnapshot.some(sub => sub.gameId === gameIdVal && sub.status !== "rejected");
    const existsInWinners = activeFirestoreWinnerHistorySnapshot.some(win => win.gameId === gameIdVal);
    const existsInArchive = activeArchiveSnapshot.some(arc => arc.gameId === gameIdVal);

    if (existsInSubmissions || existsInWinners || existsInArchive) {
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
            phone: `${formStagingCache.countryDialCode} ${formStagingCache.phoneNumber}`,
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
        const idText = row.getAttribute("data-gameid").toUpperCase();
        if (idText.includes(queryTerm)) row.classList.remove("hidden");
        else row.classList.add("hidden");
    });
}

function initializeRealtimeConfigurationStreams() {
    if (!window.FirebaseBridge) return;
    const { db, doc, onSnapshot } = window.FirebaseBridge;

    onSnapshot(doc(db, "configuration", "livePrize"), (docSnapshot) => {
        let imgUrl = DEFAULT_PRIZE_IMAGE, captionStr = DEFAULT_PRIZE_CAPTION;
        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            if (data.imageUrl) imgUrl = data.imageUrl;
            if (data.caption) captionStr = data.caption;
        }
        if (imgUrl) {
            const homeImg = document.getElementById("home-prize-image");
            if(homeImg.src !== imgUrl) { homeImg.classList.add("img-loading"); homeImg.src = imgUrl; }
        }
        document.getElementById("home-prize-caption").innerText = captionStr;
    });

    onSnapshot(doc(db, "configuration", "pastPrize"), (docSnapshot) => {
        let imgUrl = DEFAULT_PAST_PRIZE_IMAGE, captionStr = DEFAULT_PAST_PRIZE_CAPTION;
        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            if (data.imageUrl) imgUrl = data.imageUrl;
            if (data.caption) captionStr = data.caption;
        }
        if (imgUrl) {
            const homePastImg = document.getElementById("home-past-prize-image");
            if(homePastImg.src !== imgUrl) { homePastImg.classList.add("img-loading"); homePastImg.src = imgUrl; }
        }
        document.getElementById("home-past-prize-caption").innerText = captionStr;
    });

    onSnapshot(doc(db, "configuration", "event"), (docSnapshot) => {
        if(docSnapshot.exists() && docSnapshot.data().status) {
            liveEventStatus = docSnapshot.data().status;
        } else {
            liveEventStatus = "open";
        }

        const banner = document.getElementById("event-ended-banner");
        const homeBtn = document.getElementById("home-giveaway-btn");

        if(liveEventStatus === "closed") {
            banner.classList.remove("hidden");
            homeBtn.classList.add("hidden");
        } else {
            banner.classList.add("hidden");
            homeBtn.classList.remove("hidden");
        }
    });
}

function initializeRealtimeSubmissionDataStreams() {
    if (!window.FirebaseBridge) return;
    const { db, collection, query, onSnapshot } = window.FirebaseBridge;

    onSnapshot(query(collection(db, "submissions")), (querySnapshot) => {
        activeFirestoreSubmissionsSnapshot = [];
        activeArchiveSnapshot = [];
        
        querySnapshot.forEach(doc => {
            const d = doc.data();
            if(d.status === "archived") {
                activeArchiveSnapshot.push({ id: doc.id, ...d });
            } else {
                activeFirestoreSubmissionsSnapshot.push({ id: doc.id, ...d });
            }
        });

        activeFirestoreSubmissionsSnapshot.sort((x, y) => (y.timestamp || 0) - (x.timestamp || 0));
        activeArchiveSnapshot.sort((x, y) => (y.timestamp || 0) - (x.timestamp || 0));

        buildPublicDashboardUI();
    });
}

function initializeRealtimeWinnerHistoryStreams() {
    if (!window.FirebaseBridge) return;
    const { db, collection, query, onSnapshot } = window.FirebaseBridge;

    onSnapshot(query(collection(db, "winnerHistory")), (querySnapshot) => {
        activeFirestoreWinnerHistorySnapshot = [];
        querySnapshot.forEach(doc => {
            activeFirestoreWinnerHistorySnapshot.push({ id: doc.id, ...doc.data() });
        });
        activeFirestoreWinnerHistorySnapshot.sort((x, y) => (y.wonAt || 0) - (x.wonAt || 0));
        buildPublicWinnerHistoryUI();
    });
}

function buildPublicDashboardUI() {
    const scrollContainer = document.getElementById("public-players-list");
    if (!scrollContainer) return;
    const verifiedRecords = activeFirestoreSubmissionsSnapshot.filter(item => item.status === "approved");

    if (verifiedRecords.length === 0) {
        scrollContainer.innerHTML = `<div class="empty-state-text">No verified records listed.</div>`;
        return;
    }
    let html = "";
    verifiedRecords.forEach((player, idx) => {
        html += `<div class="player-row-item" data-gameid="${player.gameId}">
                    <span>${idx + 1}. NAME: ${escapeHtml(player.name)}</span>
                    <span class="p-meta-id">ID: ${escapeHtml(player.gameId)}</span>
                </div>`;
    });
    scrollContainer.innerHTML = html;
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
        html += `<div class="player-row-item" data-gameid="${player.gameId}">
                    <span>${idx + 1}. WINNER: ${escapeHtml(player.name)} 🏆</span>
                    <span class="p-meta-id">ID: ${escapeHtml(player.gameId)}</span>
                    <span class="p-meta-date">Date: ${dateStr}</span>
                </div>`;
    });
    scrollContainer.innerHTML = html;
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
