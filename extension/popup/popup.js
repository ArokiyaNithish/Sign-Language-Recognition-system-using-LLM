/* ══════════════════════════════════════════════
   SignBridge Extension Popup — JS
   Handles Sign Up, Sign In (user/user hardcoded per request),
   and Dashboard toggles (Sign Language & Report).
   ══════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
    // Screens
    const scrSignUp = document.getElementById('screen-signup');
    const scrSignIn = document.getElementById('screen-signin');
    const scrDash = document.getElementById('screen-dashboard');

    // Input Fields
    const suName = document.getElementById('su-name');
    const suUid = document.getElementById('su-uid');
    const suPw = document.getElementById('su-pw');
    const suErr = document.getElementById('su-error');

    const siUid = document.getElementById('si-uid');
    const siPw = document.getElementById('si-pw');
    const siErr = document.getElementById('si-error');

    // Dashboard elements
    const avatarChar = document.getElementById('user-avatar');
    const dashName = document.getElementById('user-fullname');
    const dashLabel = document.getElementById('user-id-label');

    const togSign = document.getElementById('toggle-sign');
    const signText = document.getElementById('sign-status-text');
    const cardSign = document.getElementById('card-sign');

    const togReport = document.getElementById('toggle-report');
    const reportText = document.getElementById('report-status-text');
    const cardReport = document.getElementById('card-report');
    const btnDown = document.getElementById('btn-download');

    const detBox = document.getElementById('detected-box');
    const detText = document.getElementById('detected-text');
    const detPhrase = document.getElementById('detected-phrase');

    // ── 1. Initialization ──────────────────────────────────────────
    try {
        const data = await chrome.storage.local.get(['currentUser', 'prefs']);
        if (data.currentUser && data.currentUser.uid) {
            // Already logged in
            showScreen(scrDash);
            populateDashboard(data.currentUser);
            initToggles(data.prefs || {});
        } else {
            // Default state: Show Sign Up first
            showScreen(scrSignUp);
        }
    } catch (e) {
        // Fallback for local dev testing outside extension logic
        showScreen(scrSignUp);
    }

    // ── 2. Navigation Handlers ─────────────────────────────────────
    document.getElementById('go-signin').addEventListener('click', (e) => {
        e.preventDefault();
        suErr.classList.add('hidden');
        showScreen(scrSignIn);
    });

    document.getElementById('go-signup').addEventListener('click', (e) => {
        e.preventDefault();
        siErr.classList.add('hidden');
        showScreen(scrSignUp);
    });

    document.getElementById('btn-signout').addEventListener('click', async () => {
        try {
            await chrome.storage.local.remove('currentUser');
            // Tell background script to stop things if needed
            chrome.runtime.sendMessage({ type: "STOP_SIGN_DETECTION" });
            chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
        } catch (e) { }

        // Clear inputs and drop back to Sign SignIn
        siUid.value = ''; siPw.value = '';
        siErr.classList.add('hidden');
        showScreen(scrSignIn);
    });

    // ── 3. Sign Up Logic ───────────────────────────────────────────
    document.getElementById('btn-signup').addEventListener('click', async () => {
        const name = suName.value.trim();
        const uid = suUid.value.trim();
        const pw = suPw.value.trim();

        if (!name || !uid || !pw) {
            suErr.textContent = "All fields are required.";
            suErr.classList.remove('hidden');
            return;
        }

        if (pw.length < 4) {
            suErr.textContent = "Password must be at least 4 characters.";
            suErr.classList.remove('hidden');
            return;
        }

        suErr.classList.add('hidden');

        // Create local user profile
        const user = { name, uid, token: `mock_jwt_${Date.now()}` };
        try {
            await chrome.storage.local.set({ currentUser: user });
        } catch (e) { }

        showScreen(scrDash);
        populateDashboard(user);
        initToggles({});
    });

    // ── 4. Sign In Logic (Hardcoded user/user per request) ────────
    document.getElementById('btn-signin').addEventListener('click', async () => {
        const uid = siUid.value.trim();
        const pw = siPw.value.trim();

        if (!uid || !pw) {
            siErr.textContent = "Please enter User ID and Password.";
            siErr.classList.remove('hidden');
            return;
        }

        // Hardcoded check requested by user
        if (uid === "user" && pw === "user") {
            siErr.classList.add('hidden');
            const user = { name: "Demo User", uid: "user", token: "mock_jwt_demo" };

            try {
                await chrome.storage.local.set({ currentUser: user });
            } catch (e) { }

            showScreen(scrDash);
            populateDashboard(user);
            initToggles({});
        } else {
            siErr.textContent = "Invalid User ID or Password. (Hint: user / user)";
            siErr.classList.remove('hidden');
        }
    });


    // ── 5. Dashboard Logic ─────────────────────────────────────────
    function showScreen(screenEl) {
        scrSignUp.classList.remove('active');
        scrSignIn.classList.remove('active');
        scrDash.classList.remove('active');
        screenEl.classList.add('active');
    }

    function populateDashboard(user) {
        dashName.textContent = user.name || "User";
        dashLabel.textContent = `@${user.uid}`;
        avatarChar.textContent = (user.name || "U")[0].toUpperCase();
    }

    function initToggles(prefs) {
        const signEnabled = prefs.signEnabled || false;
        const reportEnabled = prefs.recordingEnabled || false;

        togSign.checked = signEnabled;
        togReport.checked = reportEnabled;

        updateSignUI(signEnabled);
        updateReportUI(reportEnabled);

        // Initial mock data setup for UI showing
        detBox.style.opacity = signEnabled ? "1" : "0.4";
        if (!signEnabled) {
            detText.textContent = "—";
            detPhrase.textContent = "";
        }
    }

    // Toggle handlers
    togSign.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        updateSignUI(enabled);
        try {
            const data = await chrome.storage.local.get('prefs');
            const prefs = data.prefs || {};
            prefs.signEnabled = enabled;
            await chrome.storage.local.set({ prefs });

            // Signal background script/content script
            if (enabled) {
                chrome.runtime.sendMessage({ type: "START_SIGN_DETECTION" });
            } else {
                chrome.runtime.sendMessage({ type: "STOP_SIGN_DETECTION" });
            }
        } catch (err) { }
    });

    togReport.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        updateReportUI(enabled);

        try {
            const data = await chrome.storage.local.get('prefs');
            const prefs = data.prefs || {};
            prefs.recordingEnabled = enabled;
            await chrome.storage.local.set({ prefs });

            // Signal background script/content script
            if (enabled) {
                chrome.runtime.sendMessage({ type: "START_RECORDING" });
                btnDown.classList.add('hidden'); // PDF only available after stop
            } else {
                chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
                // Assume report is available once turned off
                btnDown.classList.remove('hidden');
            }
        } catch (err) { }
    });

    // UI Updaters
    function updateSignUI(enabled) {
        if (enabled) {
            cardSign.classList.add('active-card');
            signText.textContent = "On — active in meeting";
            signText.style.color = "var(--teal)";
            detBox.style.opacity = "1";
        } else {
            cardSign.classList.remove('active-card');
            signText.textContent = "Off — click to enable";
            signText.style.color = "var(--text-2)";
            detBox.style.opacity = "0.4";
            detText.textContent = "—";
            detPhrase.textContent = "";
        }
    }

    function updateReportUI(enabled) {
        if (enabled) {
            cardReport.classList.add('active-card');
            reportText.textContent = "On — recording audio";
            reportText.style.color = "var(--purple)";
        } else {
            cardReport.classList.remove('active-card');
            reportText.textContent = "Off — recording disabled";
            reportText.style.color = "var(--text-2)";
        }
    }

    // ── 6. Listen for incoming detection data ─────────────────────
    try {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === "SIGN_RECOGNIZED" && togSign.checked) {
                detText.textContent = request.sign || "—";
            }
            if (request.type === "PHRASE_READY" && togSign.checked) {
                detPhrase.textContent = request.text;
            }
        });
    } catch (e) { }

    // ── 7. Download Event ─────────────────────────────────────────
    btnDown.addEventListener('click', () => {
        // Send a message to background script to trigger download
        try {
            chrome.runtime.sendMessage({ type: "DOWNLOAD_REPORT" });
        } catch (e) { }

        // Give brief visual feedback
        const originalText = btnDown.textContent;
        btnDown.textContent = "Opening PDF...";
        setTimeout(() => { btnDown.textContent = originalText; }, 2000);
    });
});
