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

// --- HELPER FUNCTIONS ---

function updateThemeIcon(isLight) {
    const btn = el('theme-toggle');
    if (!btn) return;
    if(isLight) btn.innerHTML = '<i class="fa-solid fa-sun text-yellow-500 text-xl"></i>';
    else btn.innerHTML = '<i class="fa-solid fa-moon text-gray-400 text-xl"></i>';
}

function createStars(n) { return '★'.repeat(Math.floor(n || 0)) + ((n || 0) % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(n || 0)); }

function showLoadingWithProgress() {
    const overlay = el('api-loading-overlay');
    if(overlay) overlay.classList.remove('hidden');
    
    let w = 0;
    progressInterval = setInterval(() => { 
        if(w < 95) w += Math.random() * 2; 
        const bar = el('api-loading-progress-bar');
        const text = el('api-loading-progress-text');
        if(bar) bar.style.width = `${w}%`; 
        if(text) text.textContent = `${Math.round(w)}%`; 
    }, 100);
    
    const msgContainer = el('loading-message-container');
    if(msgContainer) msgContainer.textContent = animatedLoadingMessages[0];
    
    let i = 0;
    loadingMessageInterval = setInterval(() => { 
        i = (i + 1) % animatedLoadingMessages.length; 
        if(msgContainer) msgContainer.textContent = animatedLoadingMessages[i]; 
    }, 2000);
}

function hideLoadingOverlay() {
    clearInterval(progressInterval);
    clearInterval(loadingMessageInterval);
    const bar = el('api-loading-progress-bar');
    if(bar) bar.style.width = '100%';
    setTimeout(() => {
        const overlay = el('api-loading-overlay');
        if(overlay) overlay.classList.add('hidden');
    }, 400);
}

function recordGeneration() {
    if (sessionStorage.getItem('isAdmin')) return;
    const ts = JSON.parse(localStorage.getItem('generationTimestamps') || '[]');
    ts.push(Date.now());
    localStorage.setItem('generationTimestamps', JSON.stringify(ts));
}

function showCustomAlert(title, msg) { 
    const t = el('custom-alert-title');
    const m = el('custom-alert-message');
    const o = el('custom-alert-overlay');
    if(t) t.textContent = title; 
    if(m) m.textContent = msg; 
    if(o) o.classList.remove('hidden'); 
}

function hideCustomAlert() { 
    const o = el('custom-alert-overlay');
    if(o) o.classList.add('hidden'); 
}

function updateProgress() {
    if(!currentRoadmap || !currentRoadmap.milestones) return;
    const all = currentRoadmap.milestones.flatMap(m => m.skills || []);
    const done = all.filter(s => s.status === 'completed');
    const pct = all.length > 0 ? Math.round((done.length / all.length) * 100) : 0;
    
    const bar = el('progress-bar-inner');
    if(bar) {
        bar.style.width = `${pct}%`;
    }
    const txt = el('progress-text');
    if(txt) txt.textContent = `${pct}%`;

    if(pct === 100 && !isCompletionPopupShown) {
        const modal = el('completion-modal-overlay');
        if(modal) {
            modal.classList.remove('hidden');
            isCompletionPopupShown = true;
        }
    }
}

function openSkillModal(id) {
    if(!currentRoadmap || !currentRoadmap.milestones) return;
    let skill = null;
    currentRoadmap.milestones.forEach(m => {
        const found = (m.skills || []).find(s => s.id === id);
        if(found) skill = found;
    });
    if(!skill) return;

    const titleEl = el('modal-title');
    const descEl = el('modal-description');
    const detailsEl = el('modal-details-grid');
    const resourcesEl = el('modal-resources');
    const completeBtn = el('modal-complete-btn');
    const modal = el('skill-modal-overlay');

    if(titleEl) titleEl.textContent = skill.title;
    if(descEl) descEl.textContent = skill.description;
    
    if(detailsEl) {
        detailsEl.innerHTML = `
            <div class="p-3 rounded-lg border" style="background-color: var(--bg-primary); border-color: var(--border-color)">
                <div class="text-xs uppercase mb-1" style="color: var(--text-secondary)">Est. Salary</div>
                <div class="font-bold" style="color: var(--text-primary)">${skill.salary_pkr}</div>
            </div>
            <div class="p-3 rounded-lg border" style="background-color: var(--bg-primary); border-color: var(--border-color)">
                <div class="text-xs uppercase mb-1" style="color: var(--text-secondary)">Demand</div>
                <div class="text-yellow-400 text-sm">${createStars(skill.future_growth_rating)}</div>
            </div>
        `;
    }

    if(resourcesEl) {
        const resources = skill.resources || [];
        resourcesEl.innerHTML = resources.length > 0 ? resources.map(r => 
            `<li class="flex items-center justify-between p-2 rounded hover:bg-gray-700/10 transition-colors">
                <span style="color: var(--text-primary)">${r.name}</span>
                <a href="${r.url}" target="_blank" class="text-teal-500 hover:text-orange-500 transition-colors"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
            </li>`
        ).join('') : '<li class="text-sm text-gray-500">No resources available</li>';
    }

    if(completeBtn) {
        completeBtn.onclick = () => toggleSkillComplete(skill.id);
        if(skill.status === 'completed') {
            completeBtn.textContent = 'Mark as Incomplete';
            completeBtn.className = 'w-full py-3 rounded-lg font-bold border-2 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition-all';
        } else {
            completeBtn.textContent = 'Mark as Completed';
            completeBtn.className = 'w-full py-3 rounded-lg font-bold btn-primary hover:shadow-lg transition-all';
        }
    }

    if(modal) modal.classList.remove('hidden');
}

function toggleSkillComplete(id) {
    currentRoadmap.milestones.forEach(m => {
        const s = (m.skills || []).find(sk => sk.id === id);
        if(s) s.status = s.status === 'completed' ? 'incomplete' : 'completed';
    });
    const modal = el('skill-modal-overlay');
    if(modal) modal.classList.add('hidden');
    renderRoadmap(currentRoadmap);
    if(currentUserEmail) saveRoadmapToCloud();
}

// --- RENDER FUNCTION ---
function renderRoadmap(data) {
    if (!data || !data.milestones || !Array.isArray(data.milestones)) {
        console.error("Invalid data structure received:", data);
        showCustomAlert("Error", "Received incomplete data. Please try generating again.");
        return;
    }

    currentRoadmap = data;
    const content = el('roadmap-content');
    const container = el('roadmap-grid-container');
    if(!content || !container) return;

    content.classList.remove('hidden');
    
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
        const skills = phase.skills || []; 
        
        html += `
            <div class="animate-fade-in-scale-up">
                <div class="flex items-center gap-3 mb-6 border-b pb-2" style="border-color: var(--border-color)">
                    <div class="w-8 h-8 rounded-full bg-teal-500/10 text-teal-500 flex items-center justify-center font-bold text-sm border border-teal-500/20">${index + 1}</div>
                    <h2 class="text-xl font-bold" style="color: var(--text-primary)">${phase.title}</h2>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        `;

        if (skills.length === 0) {
            html += `<p class="text-gray-500 italic col-span-full">No specific skills listed for this phase.</p>`;
        } else {
            skills.forEach((skill) => {
                const isCompleted = skill.status === 'completed';
                const iconClass = isCompleted ? 'fa-circle-check text-orange-500' : 'fa-circle text-gray-600';
                const dotClass = isCompleted ? 'status-dot-orange' : 'status-dot-teal';
                
                html += `
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
            });
        }

        html += `   </div>
            </div>`;
    });
    html += '</div>';
    
    container.innerHTML = html;
    
    // Re-attach listeners
    const regenBtn = el('regenerate-btn-inner');
    if(regenBtn) regenBtn.addEventListener('click', () => {
        el('roadmap-content').classList.add('hidden'); 
        el('questionnaire-container').classList.remove('hidden'); 
    });
    
    const dlBtn = el('download-json-btn-inner');
    if(dlBtn) dlBtn.addEventListener('click', handleDownloadJson);
    
    document.querySelectorAll('.skill-card').forEach(card => {
        card.addEventListener('click', () => openSkillModal(card.dataset.id));
    });

    updateProgress();
}

// --- LOGIC FUNCTIONS ---

function startSessionTimer() {
    if (!sessionExpirationTime) return;
    const timerInterval = setInterval(() => {
        const now = Date.now();
        const timeLeft = sessionExpirationTime - now;
        if (timeLeft <= 600000 && timeLeft > 599000) {
            const modal = el('session-warning-modal');
            if(modal) modal.classList.remove('hidden');
        }
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleSessionExpiry();
        }
    }, 1000);
}

function handleSessionExpiry() {
    const modal = el('session-expired-modal');
    const app = el('app');
    if(modal) modal.classList.remove('hidden');
    if(app) app.classList.add('blur-sm', 'pointer-events-none'); 
    fetch(`${WORKER_URL}/logout`, { method: 'POST', credentials: 'include' });
}

async function checkAuth() {
    try {
        const res = await fetch(`${WORKER_URL}/load`, { method: 'GET', credentials: 'include' });
        const data = await res.json();
        
        if (res.ok && data.success) {
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
                    const qContainer = el('questionnaire-container');
                    if(qContainer) qContainer.classList.add('hidden');
                }
            }
        } else {
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
            const stepEmail = el('step-email');
            const stepOtp = el('step-otp');
            if(stepEmail) stepEmail.classList.add('hidden');
            if(stepOtp) stepOtp.classList.remove('hidden');
            if(msg) msg.textContent = `Code sent to ${emailVal}. Check your inbox.`;
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
            const modal = el('email-modal-overlay');
            const info = el('info-modal-overlay');
            if(modal) modal.classList.add('hidden');
            if(info) info.classList.add('hidden');
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
    const stepEmail = el('step-email');
    const stepOtp = el('step-otp');
    const emailInput = el('email-input');
    const otpInput = el('otp-input');
    const msg = el('login-msg');
    const btn = el('login-submit-btn');

    if(stepEmail) stepEmail.classList.remove('hidden');
    if(stepOtp) stepOtp.classList.add('hidden');
    if(emailInput) emailInput.disabled = false;
    if(otpInput) otpInput.value = '';
    if(msg) msg.textContent = "Enter email to receive a login code.";
    if(btn) btn.textContent = "Send Code";
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
        if(loginBtn) loginBtn.classList.add('hidden');
        if(userGroup) {
            userGroup.classList.remove('hidden');
            userGroup.classList.add('flex');
        }
        if(emailText) emailText.textContent = currentUserEmail;
    } else {
        if(loginBtn) loginBtn.classList.remove('hidden');
        if(userGroup) {
            userGroup.classList.add('hidden');
            userGroup.classList.remove('flex');
        }
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
            const modal = el('restore-modal-overlay');
            const qContainer = el('questionnaire-container');
            if(modal) modal.classList.add('hidden');
            if(qContainer) qContainer.classList.add('hidden');
            
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
    const btn = el('generate-btn');
    if(btn) btn.disabled = true;

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
        if (!roadmap || !roadmap.milestones) throw new Error("Invalid response structure");
        
        recordGeneration();
        renderRoadmap(roadmap);
        const qContainer = el('questionnaire-container');
        if(qContainer) qContainer.classList.add('hidden');
        if(currentUserEmail) saveRoadmapToCloud();

    } catch (error) {
        showCustomAlert("Error", error.message);
    } finally {
        hideLoadingOverlay();
        if(btn) btn.disabled = false;
    }
}

function setupEventListeners() {
    // SAFETY CHECKS for every element
    const loginBtn = el('login-btn-header');
    if(loginBtn) loginBtn.onclick = () => { const m = el('email-modal-overlay'); if(m) m.classList.remove('hidden'); };

    const logoutBtn = el('logout-btn');
    if(logoutBtn) logoutBtn.onclick = handleLogout;

    const infoLoginBtn = el('info-login-btn');
    if(infoLoginBtn) infoLoginBtn.onclick = () => { 
        const info = el('info-modal-overlay'); 
        const email = el('email-modal-overlay');
        if(info) info.classList.add('hidden'); 
        if(email) email.classList.remove('hidden'); 
    };

    const infoCloseBtn = el('info-close-btn');
    if(infoCloseBtn) infoCloseBtn.onclick = () => { const m = el('info-modal-overlay'); if(m) m.classList.add('hidden'); };

    const emailCancelBtn = el('email-cancel-btn');
    if(emailCancelBtn) emailCancelBtn.onclick = () => {
        const m = el('email-modal-overlay');
        if(m) m.classList.add('hidden');
        resetLoginModal();
    };

    const modalCloseBtn = el('modal-close-btn');
    if(modalCloseBtn) modalCloseBtn.onclick = () => { const m = el('skill-modal-overlay'); if(m) m.classList.add('hidden'); };

    const completionCloseBtn = el('completion-close-btn');
    if(completionCloseBtn) completionCloseBtn.onclick = () => { const m = el('completion-modal-overlay'); if(m) m.classList.add('hidden'); };
    
    const openRestoreBtn = el('open-restore-btn');
    if(openRestoreBtn) openRestoreBtn.onclick = () => { const m = el('restore-modal-overlay'); if(m) m.classList.remove('hidden'); };

    const restoreCancelBtn = el('restore-cancel-btn');
    if(restoreCancelBtn) restoreCancelBtn.onclick = () => { const m = el('restore-modal-overlay'); if(m) m.classList.add('hidden'); };

    const restoreInput = el('restore-file-input');
    if(restoreInput) restoreInput.addEventListener('change', handleRestore);

    const warningDismissBtn = el('warning-dismiss-btn');
    if(warningDismissBtn) warningDismissBtn.onclick = () => { const m = el('session-warning-modal'); if(m) m.classList.add('hidden'); };

    const loginForm = el('login-form');
    if(loginForm) loginForm.addEventListener('submit', handleLogin);

    const qForm = el('questionnaire-form');
    if(qForm) qForm.addEventListener('submit', handleFormSubmit);

    const alertBtn = el('custom-alert-confirm-btn');
    if(alertBtn) alertBtn.onclick = hideCustomAlert;
    
    const appDiv = el('app');
    if(appDiv) {
        appDiv.addEventListener('scroll', () => {
            const currentY = appDiv.scrollTop;
            const header = el('main-header');
            if(header) {
                if (currentY > lastScrollY && currentY > 50) header.classList.add('hidden-header');
                else header.classList.remove('hidden-header');
            }
            lastScrollY = currentY;
        });
    }

    const themeBtn = el('theme-toggle');
    if(themeBtn) themeBtn.onclick = () => {
        const root = document.documentElement;
        const isLight = root.classList.toggle('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        updateThemeIcon(isLight);
    };
}

// --- MAIN (BOTTOM) ---
document.addEventListener('DOMContentLoaded', async () => {
    if (localStorage.getItem('theme') === 'light') {
        document.documentElement.classList.add('light-mode');
        updateThemeIcon(true);
    } else {
        updateThemeIcon(false);
    }
    
    setTimeout(() => {
        const ls = el('loading-screen');
        if(ls) ls.classList.add('opacity-0', 'pointer-events-none');
    }, 800);

    // Run setup before auth to ensure listeners are ready
    setupEventListeners();

    await checkAuth();
    
    if(sessionExpirationTime) {
        startSessionTimer();
    }

    if (!currentUserEmail && !localStorage.getItem('visitedBefore')) {
        setTimeout(() => {
            const modal = el('info-modal-overlay');
            if(modal) modal.classList.remove('hidden');
            localStorage.setItem('visitedBefore', 'true');
        }, 1500);
    }
});
