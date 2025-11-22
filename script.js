// --- CONFIGURATION ---
const WORKER_URL = 'https://smartrasta.timespace.workers.dev'; 
const PDF_WATERMARK_TEXT = 'Smart Raasta Report';
const SESSION_DURATION = 60 * 60 * 1000; // 1 hour
const WARNING_TIME = 50 * 60 * 1000; // 50 minutes

const animatedLoadingMessages = [
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

const el = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
    // Theme Init
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

    await checkAuth();
    
    if(sessionExpirationTime) {
        startSessionTimer();
    }

    if (!currentUserEmail && !localStorage.getItem('visitedBefore')) {
        setTimeout(() => {
            el('info-modal-overlay').classList.remove('hidden');
            localStorage.setItem('visitedBefore', 'true');
        }, 1500);
    }

    setupEventListeners();
    setupScrollObserver();
});

// --- BACKEND CONTROLLED TIMER ---
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

// --- SCROLL ANIMATIONS ---
function setupScrollObserver() {
    const options = {
        root: el('app'),
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
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

// --- AUTH ---
async function checkAuth() {
    try {
        const res = await fetch(`${WORKER_URL}/load`, { method: 'GET', credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            currentUserEmail = data.email;
            
            if (data.expiresAt) {
                sessionExpirationTime = data.expiresAt;
            }

            updateHeaderState();
            if (data.data && data.data.milestones) {
                renderRoadmap(data.data);
                el('questionnaire-container').classList.add('hidden');
            }
        }
    } catch (e) { 
        console.log("Guest mode or Session Expired"); 
        sessionExpirationTime = null;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const emailVal = el('email-input').value.trim();
    if (!emailVal) return showCustomAlert('Error', 'Please enter a valid email.');

    const btn = el('login-submit-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Verifying...';
    btn.disabled = true;

    try {
        const res = await fetch(`${WORKER_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailVal }),
            credentials: 'include'
        });

        if (!res.ok) throw new Error('Login failed');

        const data = await res.json();
        currentUserEmail = emailVal;
        
        if (data.expiresAt) {
            sessionExpirationTime = data.expiresAt;
            startSessionTimer();
        }

        updateHeaderState();
        el('email-modal-overlay').classList.add('hidden');
        el('info-modal-overlay').classList.add('hidden');

        if (currentRoadmap) {
            await saveRoadmapToCloud();
            showCustomAlert("Success", "Your roadmap has been saved!");
        } else {
            await checkAuth();
        }

    } catch (error) {
        showCustomAlert('Login Error', 'Could not verify email.');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function handleLogout() {
    const btn = el('logout-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    try {
        await fetch(`${WORKER_URL}/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {
        console.error("Logout failed", e);
    } finally {
        currentUserEmail = null;
        currentRoadmap = null;
        sessionExpirationTime = null;
        location.reload(); 
    }
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

// --- GENERATION ---
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

        if (!res.ok) {
            const txt = await res.json();
            throw new Error(txt.error || 'Generation failed');
        }

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

// --- RENDER ---
function renderRoadmap(data) {
    currentRoadmap = data;
    el('roadmap-content').classList.remove('hidden');
    
    let html = `
        <div class="mb-10 text-center reveal-on-scroll">
            <h1 class="text-3xl md:text-4xl font-bold mb-3" style="color: var(--text-primary)">${data.name}</h1>
            <p class="text-lg max-w-3xl mx-auto" style="color: var(--text-secondary)">${data.summary}</p>
        </div>
    `;

    html += `
        <div class="mb-10 reveal-on-scroll">
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
                    <button id="download-pdf-btn-inner" class="btn-action px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                        <i class="fa-solid fa-file-pdf"></i> PDF Report
                    </button>
                </div>
            </div>
        </div>
    `;

    html += `<div class="max-w-6xl mx-auto space-y-12 pb-20">`;
    
    data.milestones.forEach((phase, index) => {
        html += `
            <div class="reveal-on-scroll">
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
                        </div>
                        `;
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
    el('download-pdf-btn-inner').addEventListener('click', handleDownloadPdf);
    
    document.querySelectorAll('.skill-card').forEach(card => {
        card.addEventListener('click', () => openSkillModal(card.dataset.id));
    });

    updateProgress();
    
    if (scrollObserver) {
        document.querySelectorAll('.reveal-on-scroll').forEach(el => scrollObserver.observe(el));
    }
}

function openSkillModal(id) {
    if(!currentRoadmap) return;
    let skill = null;
    currentRoadmap.milestones.forEach(m => {
        const found = m.skills.find(s => s.id === id);
        if(found) skill = found;
    });
    if(!skill) return;

    el('modal-title').textContent = skill.title;
    el('modal-description').textContent = skill.description;
    
    el('modal-details-grid').innerHTML = `
        <div class="p-3 rounded-lg border" style="background-color: var(--bg-primary); border-color: var(--border-color)">
            <div class="text-xs uppercase mb-1" style="color: var(--text-secondary)">Est. Salary</div>
            <div class="font-bold" style="color: var(--text-primary)">${skill.salary_pkr}</div>
        </div>
        <div class="p-3 rounded-lg border" style="background-color: var(--bg-primary); border-color: var(--border-color)">
            <div class="text-xs uppercase mb-1" style="color: var(--text-secondary)">Demand</div>
            <div class="text-yellow-400 text-sm">${createStars(skill.future_growth_rating)}</div>
        </div>
    `;

    el('modal-resources').innerHTML = skill.resources.map(r => 
        `<li class="flex items-center justify-between p-2 rounded hover:bg-gray-700/10 transition-colors">
            <span style="color: var(--text-primary)">${r.name}</span>
            <a href="${r.url}" target="_blank" class="text-teal-500 hover:text-orange-500 transition-colors"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
        </li>`
    ).join('');

    const btn = el('modal-complete-btn');
    btn.onclick = () => toggleSkillComplete(skill.id);
    
    if(skill.status === 'completed') {
        btn.textContent = 'Mark as Incomplete';
        btn.className = 'w-full py-3 rounded-lg font-bold border-2 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition-all';
    } else {
        btn.textContent = 'Mark as Completed';
        btn.className = 'w-full py-3 rounded-lg font-bold btn-primary hover:shadow-lg transition-all';
    }

    el('skill-modal-overlay').classList.remove('hidden');
}

function toggleSkillComplete(id) {
    currentRoadmap.milestones.forEach(m => {
        const s = m.skills.find(sk => sk.id === id);
        if(s) s.status = s.status === 'completed' ? 'incomplete' : 'completed';
    });
    el('skill-modal-overlay').classList.add('hidden');
    renderRoadmap(currentRoadmap);
    if(currentUserEmail) saveRoadmapToCloud();
}

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

// --- FIXED PDF GENERATION ---
function handleDownloadPdf() {
    if (!currentRoadmap) return;
    
    // 1. Show Loading Overlay (z-index 200)
    el('pdf-generating-overlay').classList.remove('hidden');

    const date = new Date().toLocaleDateString();
    
    // 2. Build content string
    let pdfContent = `
        <div style="padding: 40px; font-family: 'Helvetica', sans-serif; color: #000; background: #fff; line-height: 1.5; width: 100%;">
            <div style="border-bottom: 4px solid #14b8a6; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h1 style="font-size: 28px; color: #111; margin: 0; font-weight: bold;">Smart Raasta Report</h1>
                    <p style="color: #555; margin: 5px 0 0 0; font-size: 14px;">${currentRoadmap.name}</p>
                </div>
                <div style="text-align: right; font-size: 12px; color: #777;">
                    <p>Date: ${date}</p>
                </div>
            </div>
            
            <div style="margin-bottom: 30px; background: #f8f9fa; padding: 15px; border-left: 5px solid #14b8a6;">
                <strong style="display:block; margin-bottom:5px; color:#111;">Summary:</strong>
                <span style="color: #333; font-size: 13px;">${currentRoadmap.summary}</span>
            </div>
    `;

    currentRoadmap.milestones.forEach((phase, idx) => {
        pdfContent += `
            <div style="margin-bottom: 25px; page-break-inside: avoid;">
                <h3 style="font-size: 18px; font-weight: bold; color: #111; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 15px;">
                    Phase ${idx + 1}: ${phase.title}
                </h3>
                <ul style="list-style: none; padding: 0;">
        `;
        
        phase.skills.forEach(skill => {
            const statusText = skill.status === 'completed' ? '[ COMPLETED ]' : '[ TO DO ]';
            const statusColor = skill.status === 'completed' ? '#166534' : '#555';
            
            pdfContent += `
                <li style="margin-bottom: 10px; background: #fff; border: 1px solid #eee; padding: 10px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <strong style="font-size: 14px; color: #000;">${skill.title}</strong>
                        <span style="font-size: 10px; font-weight: bold; color: ${statusColor};">${statusText}</span>
                    </div>
                    <div style="font-size: 12px; color: #444; margin-bottom: 5px;">${skill.description}</div>
                    <div style="font-size: 11px; color: #666;">
                        Salary: ${skill.salary_pkr} | Growth: ${skill.future_growth_rating}/5
                    </div>
                </li>
            `;
        });
        pdfContent += `</ul></div>`;
    });

    pdfContent += `
            <div style="margin-top: 40px; text-align: center; color: #999; font-size: 10px; border-top: 1px solid #eee; padding-top: 10px;">
                © 2025 Smart Raasta. All rights reserved.
            </div>
        </div>
    `;

    const container = el('pdf-container');
    container.innerHTML = pdfContent;
    
    // 3. CRITICAL FIX: Force container visibility for capture
    // We set z-index to 150 (Below overlay at 200, Above app at 0)
    container.style.display = 'block';
    container.style.zIndex = '150'; 
    container.style.opacity = '1';

    const opt = {
        margin: 10,
        filename: `SmartRaasta_${date.replace(/\//g,'-')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, scrollY: 0, windowWidth: 800 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().from(container).set(opt).save().then(() => {
        // 4. Clean up
        container.innerHTML = '';
        container.style.display = 'none'; // Hide again
        container.style.zIndex = '-1';
        el('pdf-generating-overlay').classList.add('hidden');
    });
}


// --- SETUP ---
function setupEventListeners() {
    el('login-btn-header').onclick = () => el('email-modal-overlay').classList.remove('hidden');
    el('logout-btn').onclick = handleLogout;
    el('info-login-btn').onclick = () => { el('info-modal-overlay').classList.add('hidden'); el('email-modal-overlay').classList.remove('hidden'); };
    el('info-close-btn').onclick = () => el('info-modal-overlay').classList.add('hidden');
    el('email-cancel-btn').onclick = () => el('email-modal-overlay').classList.add('hidden');
    el('modal-close-btn').onclick = () => el('skill-modal-overlay').classList.add('hidden');
    el('completion-close-btn').onclick = () => el('completion-modal-overlay').classList.add('hidden');
    
    // Warning Modal Buttons
    el('warning-download-btn').onclick = () => {
        handleDownloadPdf();
        el('session-warning-modal').classList.add('hidden');
    };
    el('warning-dismiss-btn').onclick = () => el('session-warning-modal').classList.add('hidden');

    el('email-form').addEventListener('submit', handleLogin);
    el('questionnaire-form').addEventListener('submit', handleFormSubmit);
    el('custom-alert-confirm-btn').onclick = hideCustomAlert;
    
    const appDiv = el('app');
    appDiv.addEventListener('scroll', () => {
        const currentY = appDiv.scrollTop;
        const header = el('main-header');
        
        if (currentY > lastScrollY && currentY > 50) {
            header.classList.add('hidden-header');
        } else {
            header.classList.remove('hidden-header');
        }
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
    if(isLight) {
        btn.innerHTML = '<i class="fa-solid fa-sun text-yellow-500 text-xl"></i>';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-moon text-gray-400 text-xl"></i>';
    }
}

function createStars(n) {
    return '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(n));
}

function showLoadingWithProgress() {
    el('api-loading-overlay').classList.remove('hidden');
    let w = 0;
    progressInterval = setInterval(() => {
        if(w < 95) w += Math.random() * 2;
        el('api-loading-progress-bar').style.width = `${w}%`;
        el('api-loading-progress-text').textContent = `${Math.round(w)}%`;
    }, 100);
    
    el('loading-message-container').textContent = animatedLoadingMessages[0];
    let i = 0;
    loadingMessageInterval = setInterval(() => {
        i = (i + 1) % animatedLoadingMessages.length;
        el('loading-message-container').textContent = animatedLoadingMessages[i];
    }, 2000);
}

function hideLoadingOverlay() {
    clearInterval(progressInterval);
    clearInterval(loadingMessageInterval);
    el('api-loading-progress-bar').style.width = '100%';
    setTimeout(() => el('api-loading-overlay').classList.add('hidden'), 400);
}

function checkUsageLimit() {
    if (sessionStorage.getItem('isAdmin')) return true;
    const ts = JSON.parse(localStorage.getItem('generationTimestamps') || '[]');
    const valid = ts.filter(t => t > Date.now() - 3600000);
    localStorage.setItem('generationTimestamps', JSON.stringify(valid));
    return valid.length < 50;
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

function hideCustomAlert() {
    el('custom-alert-overlay').classList.add('hidden');
}

function applyTranslations(lang) {}// --- CONFIGURATION ---
const WORKER_URL = 'https://smartrasta.timespace.workers.dev'; 
const PDF_WATERMARK_TEXT = 'Smart Raasta Report';

const animatedLoadingMessages = [
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
let sessionExpirationTime = null; // Provided by backend

const el = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
    // Theme Init
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

    await checkAuth();
    
    // Check if we have an active session to start the timer
    if(sessionExpirationTime) {
        startSessionTimer();
    }

    if (!currentUserEmail && !localStorage.getItem('visitedBefore')) {
        setTimeout(() => {
            el('info-modal-overlay').classList.remove('hidden');
            localStorage.setItem('visitedBefore', 'true');
        }, 1500);
    }

    setupEventListeners();
    setupScrollObserver();
});

// --- BACKEND CONTROLLED TIMER ---
function startSessionTimer() {
    if (!sessionExpirationTime) return;

    // Update timer check every second
    const timerInterval = setInterval(() => {
        const now = Date.now();
        const timeLeft = sessionExpirationTime - now;

        // 1. Warning: 10 minutes left (600000 ms)
        // We check if we are roughly 10 mins away (with a small buffer so it doesn't fire repeatedly)
        if (timeLeft <= 600000 && timeLeft > 599000) {
            el('session-warning-modal').classList.remove('hidden');
        }

        // 2. Expiry
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleSessionExpiry();
        }
    }, 1000);
}

function handleSessionExpiry() {
    el('session-expired-modal').classList.remove('hidden');
    el('app').classList.add('blur-sm', 'pointer-events-none'); // Block UI
    // Force logout in background to ensure security
    fetch(`${WORKER_URL}/logout`, { method: 'POST', credentials: 'include' });
}

// --- SCROLL ANIMATIONS ---
function setupScrollObserver() {
    const options = {
        root: el('app'),
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
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

// --- AUTH ---
async function checkAuth() {
    try {
        const res = await fetch(`${WORKER_URL}/load`, { method: 'GET', credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            currentUserEmail = data.email;
            
            // BACKEND PROVIDED EXPIRATION
            if (data.expiresAt) {
                sessionExpirationTime = data.expiresAt;
            }

            updateHeaderState();
            if (data.data && data.data.milestones) {
                renderRoadmap(data.data);
                el('questionnaire-container').classList.add('hidden');
            }
        }
    } catch (e) { 
        console.log("Guest mode or Session Expired"); 
        sessionExpirationTime = null;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const emailVal = el('email-input').value.trim();
    if (!emailVal) return showCustomAlert('Error', 'Please enter a valid email.');

    const btn = el('login-submit-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Verifying...';
    btn.disabled = true;

    try {
        const res = await fetch(`${WORKER_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailVal }),
            credentials: 'include'
        });

        if (!res.ok) throw new Error('Login failed');

        const data = await res.json();
        currentUserEmail = emailVal;
        
        // Update Expiration from Login Response
        if (data.expiresAt) {
            sessionExpirationTime = data.expiresAt;
            startSessionTimer();
        }

        updateHeaderState();
        el('email-modal-overlay').classList.add('hidden');
        el('info-modal-overlay').classList.add('hidden');

        if (currentRoadmap) {
            await saveRoadmapToCloud();
            showCustomAlert("Success", "Your roadmap has been saved!");
        } else {
            await checkAuth();
        }

    } catch (error) {
        showCustomAlert('Login Error', 'Could not verify email.');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function handleLogout() {
    // Show loading state on button
    const btn = el('logout-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    try {
        // Call Backend to clear cookie
        await fetch(`${WORKER_URL}/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {
        console.error("Logout failed", e);
    } finally {
        // Reset Local State
        currentUserEmail = null;
        currentRoadmap = null;
        sessionExpirationTime = null;
        location.reload(); // Refresh page to clear UI
    }
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

// --- GENERATION ---
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

        if (!res.ok) {
            const txt = await res.json();
            throw new Error(txt.error || 'Generation failed');
        }

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

// --- RENDER ---
function renderRoadmap(data) {
    currentRoadmap = data;
    el('roadmap-content').classList.remove('hidden');
    
    // 1. Header Section
    let html = `
        <div class="mb-10 text-center reveal-on-scroll">
            <h1 class="text-3xl md:text-4xl font-bold mb-3" style="color: var(--text-primary)">${data.name}</h1>
            <p class="text-lg max-w-3xl mx-auto" style="color: var(--text-secondary)">${data.summary}</p>
        </div>
    `;

    // 2. Floating Progress Bar
    html += `
        <div class="mb-10 reveal-on-scroll">
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
                    <button id="download-pdf-btn-inner" class="btn-action px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                        <i class="fa-solid fa-file-pdf"></i> PDF Report
                    </button>
                </div>
            </div>
        </div>
    `;

    // 3. Cards Grid
    html += `<div class="max-w-6xl mx-auto space-y-12 pb-20">`;
    
    data.milestones.forEach((phase, index) => {
        html += `
            <div class="reveal-on-scroll">
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
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>`;
    });
    html += '</div>';
    
    // Inject HTML
    el('roadmap-grid-container').innerHTML = html;
    
    // Re-attach Listeners
    el('regenerate-btn-inner').addEventListener('click', () => {
        el('roadmap-content').classList.add('hidden'); 
        el('questionnaire-container').classList.remove('hidden'); 
    });
    el('download-pdf-btn-inner').addEventListener('click', handleDownloadPdf);
    
    document.querySelectorAll('.skill-card').forEach(card => {
        card.addEventListener('click', () => openSkillModal(card.dataset.id));
    });

    updateProgress();
    
    if (scrollObserver) {
        document.querySelectorAll('.reveal-on-scroll').forEach(el => scrollObserver.observe(el));
    }
}

function openSkillModal(id) {
    if(!currentRoadmap) return;
    let skill = null;
    currentRoadmap.milestones.forEach(m => {
        const found = m.skills.find(s => s.id === id);
        if(found) skill = found;
    });
    if(!skill) return;

    el('modal-title').textContent = skill.title;
    el('modal-description').textContent = skill.description;
    
    el('modal-details-grid').innerHTML = `
        <div class="p-3 rounded-lg border" style="background-color: var(--bg-primary); border-color: var(--border-color)">
            <div class="text-xs uppercase mb-1" style="color: var(--text-secondary)">Est. Salary</div>
            <div class="font-bold" style="color: var(--text-primary)">${skill.salary_pkr}</div>
        </div>
        <div class="p-3 rounded-lg border" style="background-color: var(--bg-primary); border-color: var(--border-color)">
            <div class="text-xs uppercase mb-1" style="color: var(--text-secondary)">Demand</div>
            <div class="text-yellow-400 text-sm">${createStars(skill.future_growth_rating)}</div>
        </div>
    `;

    el('modal-resources').innerHTML = skill.resources.map(r => 
        `<li class="flex items-center justify-between p-2 rounded hover:bg-gray-700/10 transition-colors">
            <span style="color: var(--text-primary)">${r.name}</span>
            <a href="${r.url}" target="_blank" class="text-teal-500 hover:text-orange-500 transition-colors"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
        </li>`
    ).join('');

    const btn = el('modal-complete-btn');
    btn.onclick = () => toggleSkillComplete(skill.id);
    
    if(skill.status === 'completed') {
        btn.textContent = 'Mark as Incomplete';
        btn.className = 'w-full py-3 rounded-lg font-bold border-2 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition-all';
    } else {
        btn.textContent = 'Mark as Completed';
        btn.className = 'w-full py-3 rounded-lg font-bold btn-primary hover:shadow-lg transition-all';
    }

    el('skill-modal-overlay').classList.remove('hidden');
}

function toggleSkillComplete(id) {
    currentRoadmap.milestones.forEach(m => {
        const s = m.skills.find(sk => sk.id === id);
        if(s) s.status = s.status === 'completed' ? 'incomplete' : 'completed';
    });
    el('skill-modal-overlay').classList.add('hidden');
    renderRoadmap(currentRoadmap);
    if(currentUserEmail) saveRoadmapToCloud();
}

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

// --- PDF GENERATION FIX (Uses Hidden Container) ---
function handleDownloadPdf() {
    if (!currentRoadmap) return;
    
    el('pdf-generating-overlay').classList.remove('hidden');

    const date = new Date().toLocaleDateString();
    
    // We write explicitly white background styles to force the look
    let pdfContent = `
        <div style="padding: 40px; font-family: 'Helvetica', sans-serif; color: #000; background: #fff; line-height: 1.5;">
            <div style="border-bottom: 4px solid #14b8a6; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h1 style="font-size: 28px; color: #111; margin: 0; font-weight: bold;">Smart Raasta Report</h1>
                    <p style="color: #555; margin: 5px 0 0 0; font-size: 14px;">${currentRoadmap.name}</p>
                </div>
                <div style="text-align: right; font-size: 12px; color: #777;">
                    <p>Date: ${date}</p>
                </div>
            </div>
            
            <div style="margin-bottom: 30px; background: #f8f9fa; padding: 15px; border-left: 5px solid #14b8a6;">
                <strong style="display:block; margin-bottom:5px; color:#111;">Summary:</strong>
                <span style="color: #333; font-size: 13px;">${currentRoadmap.summary}</span>
            </div>
    `;

    currentRoadmap.milestones.forEach((phase, idx) => {
        pdfContent += `
            <div style="margin-bottom: 25px; page-break-inside: avoid;">
                <h3 style="font-size: 18px; font-weight: bold; color: #111; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 15px;">
                    Phase ${idx + 1}: ${phase.title}
                </h3>
                <ul style="list-style: none; padding: 0;">
        `;
        
        phase.skills.forEach(skill => {
            const statusText = skill.status === 'completed' ? '[ COMPLETED ]' : '[ TO DO ]';
            const statusColor = skill.status === 'completed' ? '#166534' : '#555';
            
            pdfContent += `
                <li style="margin-bottom: 10px; background: #fff; border: 1px solid #eee; padding: 10px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <strong style="font-size: 14px; color: #000;">${skill.title}</strong>
                        <span style="font-size: 10px; font-weight: bold; color: ${statusColor};">${statusText}</span>
                    </div>
                    <div style="font-size: 12px; color: #444; margin-bottom: 5px;">${skill.description}</div>
                    <div style="font-size: 11px; color: #666;">
                        Salary: ${skill.salary_pkr} | Growth: ${skill.future_growth_rating}/5
                    </div>
                </li>
            `;
        });
        pdfContent += `</ul></div>`;
    });

    pdfContent += `
            <div style="margin-top: 40px; text-align: center; color: #999; font-size: 10px; border-top: 1px solid #eee; padding-top: 10px;">
                © 2025 Smart Raasta. All rights reserved.
            </div>
        </div>
    `;

    const container = el('pdf-container');
    container.innerHTML = pdfContent;

    const opt = {
        margin: 10,
        filename: `SmartRaasta_${date.replace(/\//g,'-')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().from(container).set(opt).save().then(() => {
        container.innerHTML = '';
        el('pdf-generating-overlay').classList.add('hidden');
    });
}


// --- SETUP ---
function setupEventListeners() {
    el('login-btn-header').onclick = () => el('email-modal-overlay').classList.remove('hidden');
    el('logout-btn').onclick = handleLogout;
    el('info-login-btn').onclick = () => { el('info-modal-overlay').classList.add('hidden'); el('email-modal-overlay').classList.remove('hidden'); };
    el('info-close-btn').onclick = () => el('info-modal-overlay').classList.add('hidden');
    el('email-cancel-btn').onclick = () => el('email-modal-overlay').classList.add('hidden');
    el('modal-close-btn').onclick = () => el('skill-modal-overlay').classList.add('hidden');
    el('completion-close-btn').onclick = () => el('completion-modal-overlay').classList.add('hidden');
    
    // Warning Modal Buttons
    el('warning-download-btn').onclick = () => {
        handleDownloadPdf();
        el('session-warning-modal').classList.add('hidden');
    };
    el('warning-dismiss-btn').onclick = () => el('session-warning-modal').classList.add('hidden');

    el('email-form').addEventListener('submit', handleLogin);
    el('questionnaire-form').addEventListener('submit', handleFormSubmit);
    el('custom-alert-confirm-btn').onclick = hideCustomAlert;
    
    const appDiv = el('app');
    appDiv.addEventListener('scroll', () => {
        const currentY = appDiv.scrollTop;
        const header = el('main-header');
        
        if (currentY > lastScrollY && currentY > 50) {
            header.classList.add('hidden-header');
        } else {
            header.classList.remove('hidden-header');
        }
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
    if(isLight) {
        btn.innerHTML = '<i class="fa-solid fa-sun text-yellow-500 text-xl"></i>';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-moon text-gray-400 text-xl"></i>';
    }
}

function createStars(n) {
    return '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(n));
}

function showLoadingWithProgress() {
    el('api-loading-overlay').classList.remove('hidden');
    let w = 0;
    progressInterval = setInterval(() => {
        if(w < 95) w += Math.random() * 2;
        el('api-loading-progress-bar').style.width = `${w}%`;
        el('api-loading-progress-text').textContent = `${Math.round(w)}%`;
    }, 100);
    
    el('loading-message-container').textContent = animatedLoadingMessages[0];
    let i = 0;
    loadingMessageInterval = setInterval(() => {
        i = (i + 1) % animatedLoadingMessages.length;
        el('loading-message-container').textContent = animatedLoadingMessages[i];
    }, 2000);
}

function hideLoadingOverlay() {
    clearInterval(progressInterval);
    clearInterval(loadingMessageInterval);
    el('api-loading-progress-bar').style.width = '100%';
    setTimeout(() => el('api-loading-overlay').classList.add('hidden'), 400);
}

function checkUsageLimit() {
    if (sessionStorage.getItem('isAdmin')) return true;
    const ts = JSON.parse(localStorage.getItem('generationTimestamps') || '[]');
    const valid = ts.filter(t => t > Date.now() - 3600000);
    localStorage.setItem('generationTimestamps', JSON.stringify(valid));
    return valid.length < 50;
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

function hideCustomAlert() {
    el('custom-alert-overlay').classList.add('hidden');
}

function applyTranslations(lang) {}
