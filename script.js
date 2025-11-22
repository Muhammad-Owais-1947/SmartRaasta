// --- CONFIGURATION ---
var WORKER_URL = 'https://smartrasta.timespace.workers.dev'; 
var SESSION_DURATION = 60 * 60 * 1000; 
var WARNING_TIME = 50 * 60 * 1000; 

var animatedLoadingMessages = [
    "Analyzing local job market trends...",
    "Consulting AI career strategists...",
    "Mapping skills to opportunities...",
    "Tailoring your personalized path...",
    "Identifying key growth areas...",
    "Compiling relevant resources...",
    "Forecasting salary expectations...",
    "Structuring your milestones...",
    "Finalizing your career blueprint...",
    "Almost there, preparing your Raasta..."
];

// --- STATE ---
let currentRoadmap = null;
let currentUserEmail = null;
let isCompletionPopupShown = false;
let progressInterval = null;
let loadingMessageInterval = null;
let lastScrollY = 0;
let scrollObserver = null; 
let sessionExpirationTime = null;
let isOtpSent = false;

const el = id => document.getElementById(id);

// --- FUNCTIONS (DEFINED FIRST) ---

function startSessionTimer() {
    if (!sessionExpirationTime) return;
    const timerInterval = setInterval(() => {
        const now = Date.now();
        const timeLeft = sessionExpirationTime - now;
        if (timeLeft <= 600000 && timeLeft > 599000) {
            el('session-warning-modal').classList.remove('hidden');
        }
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleSessionExpiry();
        }
    }, 1000);
}

function handleSessionExpiry() {
    el('session-expired-modal').classList.remove('hidden');
    el('app').classList.add('blur-sm', 'pointer-events-none'); 
    fetch(`${WORKER_URL}/logout`, { method: 'POST', credentials: 'include' });
}

function setupScrollObserver() {
    const options = {
        root: el('app'),
        threshold: 0.01,
        rootMargin: "50px"
    };
    scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                scrollObserver.unobserve(entry.target);
            }
        });
    }, options);
}

async function checkAuth() {
    try {
        const res = await fetch(`${WORKER_URL}/load`, { method: 'GET', credentials: 'include' });
        const data = await res.json();
        
        if (res.ok && data.success) {
            // Logged In
            console.log("Session found for:", data.email);
            currentUserEmail = data.email;
            if (data.expiresAt) sessionExpirationTime = data.expiresAt;
            updateHeaderState();
            
            if (data.data && Object.keys(data.data).length > 0) {
                let roadmap = data.data;
                if (roadmap.roadmap) roadmap = roadmap.roadmap; 
                if (roadmap.career_roadmap) roadmap = roadmap.career_roadmap;
                if (roadmap.milestones) {
                    renderRoadmap(roadmap);
                    el('questionnaire-container').classList.add('hidden');
                }
            }
        } else {
            // Guest Mode
            console.log("Guest mode");
            currentUserEmail = null;
            sessionExpirationTime = null;
            updateHeaderState();
        }
    } catch (e) { console.error("Auth check failed", e); }
}

async function handleLogin(e) {
    e.preventDefault();
    const emailInput = el('email-input');
    const otpInput = el('otp-input');
    const btn = el('login-submit-btn');
    const msg = el('login-msg');

    const emailVal = emailInput.value.trim();
    if (!emailVal) return showCustomAlert('Error', 'Please enter a valid email.');

    btn.disabled = true;

    try {
        if (!isOtpSent) {
            btn.textContent = 'Sending Code...';
            const res = await fetch(`${WORKER_URL}/send-otp`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email: emailVal })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send code');

            isOtpSent = true;
            el('step-email').classList.add('hidden');
            el('step-otp').classList.remove('hidden');
            msg.textContent = `Code sent to ${emailVal}. Check your inbox.`;
            btn.textContent = 'Verify Code';
            emailInput.disabled = true;
            otpInput.focus();

        } else {
            const otpVal = otpInput.value.trim();
            if(!otpVal) throw new Error("Please enter the code");

            btn.textContent = 'Verifying...';
            const res = await fetch(`${WORKER_URL}/verify-otp`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email: emailVal, otp: otpVal }),
                credentials: 'include'
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Invalid code');

            currentUserEmail = data.email;
            if (data.expiresAt) {
                sessionExpirationTime = data.expiresAt;
                startSessionTimer();
            }
            
            updateHeaderState();
            el('email-modal-overlay').classList.add('hidden');
            el('info-modal-overlay').classList.add('hidden');
            resetLoginModal();

            if (currentRoadmap) {
                await saveRoadmapToCloud();
                showCustomAlert("Success", "Logged in & saved!");
            } else {
                await checkAuth();
            }
        }
    } catch (error) {
        showCustomAlert('Login Error', error.message);
        if(isOtpSent) btn.textContent = 'Verify Code';
        else btn.textContent = 'Send Code';
    } finally {
        btn.disabled = false;
    }
}

function resetLoginModal() {
    isOtpSent = false;
    el('step-email').classList.remove('hidden');
    el('step-otp').classList.add('hidden');
    el('email-input').disabled = false;
    el('otp-input').value = '';
    el('login-msg').textContent = "Enter email to receive a login code.";
    el('login-submit-btn').textContent = "Send Code";
}

async function handleLogout() {
    try { await fetch(`${WORKER_URL}/logout`, { method: 'POST', credentials: 'include' }); } 
    catch (e) {} 
    finally { location.reload(); }
}

async function saveRoadmapToCloud() {
    if (!currentUserEmail || !currentRoadmap) return;
    try {
        await fetch(`${WORKER_URL}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roadmap: currentRoadmap }),
            credentials: 'include'
        });
    } catch (e) {}
}

function updateHeaderState() {
    const loginBtn = el('login-btn-header');
    const userGroup = el('user-auth-group');
    const emailText = el('user-email-text');
    
    if (currentUserEmail) {
        loginBtn.classList.add('hidden');
        userGroup.classList.remove('hidden');
        userGroup.classList.add('flex');
        emailText.textContent = currentUserEmail;
    } else {
        loginBtn.classList.remove('hidden');
        userGroup.classList.add('hidden');
        userGroup.classList.remove('flex');
    }
}

function handleDownloadJson() {
    if (!currentRoadmap) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentRoadmap));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `roadmap_${currentUserEmail || 'guest'}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    showCustomAlert("Downloaded!", "Save this file. Upload it later to restore progress.");
}

function handleRestore(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const jsonObj = JSON.parse(event.target.result);
            if (!jsonObj.milestones) throw new Error("Invalid Roadmap File");
            renderRoadmap(jsonObj);
            el('restore-modal-overlay').classList.add('hidden');
            el('questionnaire-container').classList.add('hidden');
            if(currentUserEmail) {
                saveRoadmapToCloud();
                showCustomAlert("Restored!", "Your roadmap has been restored and saved.");
            } else {
                showCustomAlert("Restored!", "Roadmap loaded. Log in to save it.");
            }
        } catch (err) {
            showCustomAlert("Error", "Invalid JSON file.");
        }
    };
    reader.readAsText(file);
}

async function handleFormSubmit(e) {
    if(e) e.preventDefault();
    showLoadingWithProgress();
    el('generate-btn').disabled = true;

    const lang = 'en';
    try {
        const payload = {
            goal: el('career-goal').value,
            interests: el('user-interests').value,
            education: el('education-level').value,
            location: el('location').value,
            lang: lang
        };

        const res = await fetch(`${WORKER_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            credentials: 'include'
        });

        if (!res.ok) throw new Error('Generation failed');

        const roadmap = await res.json();
        if (!roadmap.milestones) throw new Error("Invalid response");
        
        recordGeneration();
        renderRoadmap(roadmap);
        el('questionnaire-container').classList.add('hidden');
        if(currentUserEmail) saveRoadmapToCloud();

    } catch (error) {
        showCustomAlert("Error", error.message);
    } finally {
        hideLoadingOverlay();
        el('generate-btn').disabled = false;
    }
}

// --- UPDATE PROGRESS FUNCTION (Must be defined before renderRoadmap) ---
function updateProgress() {
    if(!currentRoadmap) return;
    const all = currentRoadmap.milestones.flatMap(m => m.skills);
    const done = all.filter(s => s.status === 'completed');
    const pct = all.length > 0 ? Math.round((done.length / all.length) * 100) : 0;
    
    const bar = el('progress-bar-inner');
    if(bar) {
        bar.style.width = `${pct}%`;
        if(pct > 0) {
             bar.className = 'h-full transition-all duration-500 bg-gradient-to-r from-teal-500 to-teal-400'; 
        }
    }
    if(el('progress-text')) el('progress-text').textContent = `${pct}%`;

    if(pct === 100 && !isCompletionPopupShown) {
        el('completion-modal-overlay').classList.remove('hidden');
        isCompletionPopupShown = true;
    }
}

function renderRoadmap(data) {
    currentRoadmap = data;
    el('roadmap-content').classList.remove('hidden');
    
    let html = `
        <div class="mb-10 text-center animate-fade-in-scale-up">
            <h1 class="text-3xl md:text-4xl font-bold mb-3" style="color: var(--text-primary)">${data.name}</h1>
            <p class="text-lg max-w-3xl mx-auto" style="color: var(--text-secondary)">${data.summary}</p>
        </div>
    `;

    html += `
        <div class="mb-10 animate-fade-in-scale-up">
            <div class="progress-floating-bar rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-md">
                <div class="w-full md:flex-1">
                    <div class="flex justify-between text-xs font-bold tracking-wider mb-2" style="color: var(--text-secondary)">
                        <span>YOUR PROGRESS</span>
                        <span id="progress-text" style="color: var(--accent-teal)">0%</span>
                    </div>
                    <div class="w-full h-2.5 rounded-full bg-gray-700 overflow-hidden">
                        <div id="progress-bar-inner" class="h-full bg-teal-500 transition-all duration-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]" style="width: 0%"></div>
                    </div>
                </div>
                <div class="flex gap-3 w-full md:w-auto justify-end">
                    <button id="regenerate-btn-inner" class="btn-action px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                        <i class="fa-solid fa-rotate-right"></i> New
                    </button>
                    <button id="download-json-btn-inner" class="btn-action px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                        <i class="fa-solid fa-download"></i> Data
                    </button>
                </div>
            </div>
        </div>
    `;

    html += `<div class="max-w-6xl mx-auto space-y-12 pb-20">`;
    data.milestones.forEach((phase, index) => {
        html += `
            <div class="animate-fade-in-scale-up">
                <div class="flex items-center gap-3 mb-6 border-b pb-2" style="border-color: var(--border-color)">
                    <div class="w-8 h-8 rounded-full bg-teal-500/10 text-teal-500 flex items-center justify-center font-bold text-sm border border-teal-500/20">${index + 1}</div>
                    <h2 class="text-xl font-bold" style="color: var(--text-primary)">${phase.title}</h2>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    ${phase.skills.map((skill) => {
                        const isCompleted = skill.status === 'completed';
                        const iconClass = isCompleted ? 'fa-circle-check text-orange-500' : 'fa-circle text-gray-600';
                        const dotClass = isCompleted ? 'status-dot-orange' : 'status-dot-teal';
                        return `
                        <div class="skill-card p-5 rounded-xl cursor-pointer flex flex-col justify-between group ${isCompleted ? 'completed' : ''}" data-id="${skill.id}">
                            <div class="flex justify-between items-start mb-4">
                                <h3 class="font-semibold text-sm pr-2 group-hover:text-teal-500 transition-colors" style="color: var(--text-primary)">${skill.title}</h3>
                                <i class="fa-regular ${iconClass} text-sm transition-colors"></i>
                            </div>
                            <div class="flex justify-between items-end">
                                <span class="view-details-text text-[10px] uppercase tracking-wider font-bold opacity-0 group-hover:opacity-100 transition-opacity">View Details</span>
                                <div class="status-dot w-2 h-2 rounded-full ${dotClass}"></div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    });
    html += '</div>';
    
    el('roadmap-grid-container').innerHTML = html;
    el('regenerate-btn-inner').addEventListener('click', () => {
        el('roadmap-content').classList.add('hidden'); 
        el('questionnaire-container').classList.remove('hidden'); 
    });
    el('download-json-btn-inner').addEventListener('click', handleDownloadJson);
    
    document.querySelectorAll('.skill-card').forEach(card => {
        card.addEventListener('click', () => openSkillModal(card.dataset.id));
    });

    updateProgress();
}

function setupEventListeners() {
    el('login-btn-header').onclick = () => el('email-modal-overlay').classList.remove('hidden');
    el('logout-btn').onclick = handleLogout;
    el('info-login-btn').onclick = () => { el('info-modal-overlay').classList.add('hidden'); el('email-modal-overlay').classList.remove('hidden'); };
    el('info-close-btn').onclick = () => el('info-modal-overlay').classList.add('hidden');
    el('email-cancel-btn').onclick = () => {
        el('email-modal-overlay').classList.add('hidden');
        resetLoginModal();
    };
    el('modal-close-btn').onclick = () => el('skill-modal-overlay').classList.add('hidden');
    el('completion-close-btn').onclick = () => el('completion-modal-overlay').classList.add('hidden');
    
    el('open-restore-btn').onclick = () => el('restore-modal-overlay').classList.remove('hidden');
    el('restore-cancel-btn').onclick = () => el('restore-modal-overlay').classList.add('hidden');
    el('restore-file-input').addEventListener('change', handleRestore);

    el('warning-dismiss-btn').onclick = () => el('session-warning-modal').classList.add('hidden');

    el('login-form').addEventListener('submit', handleLogin);
    el('questionnaire-form').addEventListener('submit', handleFormSubmit);
    el('custom-alert-confirm-btn').onclick = hideCustomAlert;
    
    const appDiv = el('app');
    appDiv.addEventListener('scroll', () => {
        const currentY = appDiv.scrollTop;
        const header = el('main-header');
        if (currentY > lastScrollY && currentY > 50) header.classList.add('hidden-header');
        else header.classList.remove('hidden-header');
        lastScrollY = currentY;
    });
    el('theme-toggle').onclick = () => {
        const root = document.documentElement;
        const isLight = root.classList.toggle('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        updateThemeIcon(isLight);
    };
}

function updateThemeIcon(isLight) {
    const btn = el('theme-toggle');
    if(isLight) btn.innerHTML = '<i class="fa-solid fa-sun text-yellow-500 text-xl"></i>';
    else btn.innerHTML = '<i class="fa-solid fa-moon text-gray-400 text-xl"></i>';
}

function createStars(n) { return '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(n)); }

function showLoadingWithProgress() {
    el('api-loading-overlay').classList.remove('hidden');
    let w = 0;
    progressInterval = setInterval(() => { if(w < 95) w += Math.random() * 2; el('api-loading-progress-bar').style.width = `${w}%`; el('api-loading-progress-text').textContent = `${Math.round(w)}%`; }, 100);
    el('loading-message-container').textContent = animatedLoadingMessages[0];
    let i = 0;
    loadingMessageInterval = setInterval(() => { i = (i + 1) % animatedLoadingMessages.length; el('loading-message-container').textContent = animatedLoadingMessages[i]; }, 2000);
}

function hideLoadingOverlay() {
    clearInterval(progressInterval);
    clearInterval(loadingMessageInterval);
    el('api-loading-progress-bar').style.width = '100%';
    setTimeout(() => el('api-loading-overlay').classList.add('hidden'), 400);
}

function recordGeneration() {
    if (sessionStorage.getItem('isAdmin')) return;
    const ts = JSON.parse(localStorage.getItem('generationTimestamps') || '[]');
    ts.push(Date.now());
    localStorage.setItem('generationTimestamps', JSON.stringify(ts));
}

function showCustomAlert(title, msg) { 
    el('custom-alert-title').textContent = title; 
    el('custom-alert-message').textContent = msg; 
    el('custom-alert-overlay').classList.remove('hidden'); 
}

function hideCustomAlert() { el('custom-alert-overlay').classList.add('hidden'); }

// --- STARTUP LOGIC (MOVED TO BOTTOM TO ENSURE FUNCTIONS ARE DEFINED) ---
// This logic runs AFTER all functions above have been read by the browser
