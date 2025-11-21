// --- CONFIGURATION ---
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
let confirmCallback = null;
let progressInterval = null;
let loadingMessageInterval = null;

// --- DOM SELECTORS (Safe Selection) ---
const el = id => document.getElementById(id);

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Setup Theme & Lang
    if (localStorage.getItem('theme') === 'light') document.documentElement.classList.add('light-mode');
    
    // 2. Remove Loading Screen FAST (Fixes 15s delay issue)
    setTimeout(() => {
        const ls = el('loading-screen');
        if(ls) ls.classList.add('opacity-0', 'pointer-events-none');
    }, 800);

    // 3. Check Auth in Background
    await checkAuth();

    // 4. Show Info Modal if first visit and not logged in
    if (!currentUserEmail && !localStorage.getItem('visitedBefore')) {
        setTimeout(() => {
            el('info-modal-overlay').classList.remove('hidden');
            localStorage.setItem('visitedBefore', 'true');
        }, 1500);
    }

    // 5. Setup ALL Listeners
    setupEventListeners();
});

// --- AUTH & SAVE LOGIC ---
async function checkAuth() {
    try {
        // This ping does NOT count towards rate limit
        const res = await fetch(`${WORKER_URL}/load`, { method: 'GET', credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            currentUserEmail = data.email;
            updateHeaderState();
            
            // If saved data exists, show it immediately
            if (data.data && data.data.milestones) {
                renderRoadmap(data.data);
                el('questionnaire-container').classList.add('hidden');
            }
        }
    } catch (e) {
        console.log("User is guest or auth failed");
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

        // Success
        currentUserEmail = emailVal;
        updateHeaderState();
        el('email-modal-overlay').classList.add('hidden');
        el('info-modal-overlay').classList.add('hidden'); // Ensure info modal closes too

        // If we have a roadmap on screen, save it now
        if (currentRoadmap) {
            await saveRoadmapToCloud();
            showCustomAlert("Success", "Your roadmap is now saved!");
        } else {
            // If screen is empty, reload to see if account has data
            await checkAuth();
        }

    } catch (error) {
        showCustomAlert('Login Error', 'Could not verify email. Please try again.');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
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
    } catch (e) { console.error("Background save failed", e); }
}

function updateHeaderState() {
    const loginBtn = el('login-btn-header');
    const emailDisplay = el('user-email-display');
    
    if (currentUserEmail) {
        loginBtn.classList.add('hidden');
        emailDisplay.textContent = currentUserEmail;
        emailDisplay.classList.remove('hidden');
    } else {
        loginBtn.classList.remove('hidden');
        emailDisplay.classList.add('hidden');
    }
}

// --- GENERATION LOGIC ---
async function handleFormSubmit(e) {
    if(e) e.preventDefault();
    
    showLoadingWithProgress();
    el('generate-btn').disabled = true;

    const lang = localStorage.getItem('lang') || 'en';
    
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
        
        if (!roadmap.milestones) throw new Error("Invalid structure");
        
        renderRoadmap(roadmap);
        el('questionnaire-container').classList.add('hidden');
        
        // Auto-save
        if(currentUserEmail) saveRoadmapToCloud();

    } catch (error) {
        showCustomAlert("Error", error.message || "Something went wrong.");
    } finally {
        hideLoadingOverlay();
        el('generate-btn').disabled = false;
    }
}

// --- UI RENDERING ---
function renderRoadmap(data) {
    currentRoadmap = data;
    const roadmapContent = el('roadmap-content');
    roadmapContent.classList.remove('hidden');
    
    // Setup Progress UI
    const progContainer = el('progress-container');
    progContainer.innerHTML = `
        <div class="flex justify-between mb-2 text-teal-400 font-semibold">
            <span>Progress</span><span id="progress-text">0%</span>
        </div>
        <div class="w-full bg-gray-700 rounded-full h-3 overflow-hidden border border-gray-600">
            <div id="progress-bar-inner" class="bg-gradient-to-r from-teal-500 to-emerald-400 h-full transition-all duration-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]" style="width: 0%"></div>
        </div>`;

    // Build Grid
    let html = `
        <div class="space-y-12 animate-fade-in-scale-up">
            <div class="text-center sm:text-left border-b border-white/10 pb-8">
                <h1 class="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-4">${data.name}</h1>
                <p class="text-xl text-gray-300 max-w-3xl leading-relaxed">${data.summary}</p>
            </div>`;

    data.milestones.forEach(phase => {
        html += `
            <div class="milestone-phase">
                <div class="flex items-center gap-4 mb-8">
                    <div class="h-10 w-1 bg-teal-500 rounded-full"></div>
                    <h2 class="text-3xl font-bold text-white">${phase.title}</h2>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 items-stretch">
                    ${phase.skills.map(skill => `
                        <div class="skill-card group p-6 rounded-2xl cursor-pointer bg-gray-800/50 border border-white/5 hover:border-teal-500/50 hover:bg-gray-800 transition-all duration-300 relative overflow-hidden ${skill.status === 'completed' ? 'ring-2 ring-teal-500 border-teal-500 bg-teal-900/10' : ''}" data-id="${skill.id}">
                            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-500 to-emerald-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>
                            <p class="font-semibold text-white mb-8 text-lg group-hover:text-teal-300 transition-colors">${skill.title}</p>
                            <div class="absolute bottom-6 right-6">
                                <div class="status-dot w-4 h-4 rounded-full border-2 border-gray-700 ${skill.status === 'completed' ? 'bg-teal-500 border-teal-500 shadow-[0_0_12px_rgba(20,184,166,0.8)]' : 'bg-transparent'} transition-all duration-300"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    });
    html += '</div>';
    
    el('roadmap-grid-container').innerHTML = html;
    el('regenerate-section').classList.remove('hidden');
    el('pdf-controls').classList.remove('hidden');
    
    // Card Click Listeners
    document.querySelectorAll('.skill-card').forEach(card => {
        card.addEventListener('click', () => openSkillModal(card.dataset.id));
    });

    updateProgress();
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
        <div class="bg-gray-800/50 p-4 rounded-xl border border-white/5">
            <p class="text-xs uppercase tracking-wider text-gray-500 mb-1">Avg. Salary</p>
            <p class="font-bold text-white text-lg">${skill.salary_pkr}</p>
        </div>
        <div class="bg-gray-800/50 p-4 rounded-xl border border-white/5">
            <p class="text-xs uppercase tracking-wider text-gray-500 mb-1">Growth Potential</p>
            <div class="flex text-yellow-400 gap-1">${createStars(skill.future_growth_rating)}</div>
        </div>
        <div class="bg-gray-800/50 p-4 rounded-xl border border-white/5 col-span-2">
            <p class="text-xs uppercase tracking-wider text-gray-500 mb-1">Job Roles</p>
            <p class="font-medium text-white">${skill.job_opportunities?.join(', ') || 'General'}</p>
        </div>
    `;

    el('modal-resources').innerHTML = skill.resources.map(r => 
        `<li class="bg-gray-800 rounded-lg p-3 flex items-center justify-between group hover:bg-gray-700 transition-colors">
            <span class="font-medium text-gray-300">${r.name}</span>
            <a href="${r.url}" target="_blank" class="text-teal-400 hover:text-teal-300 px-3 py-1 rounded bg-teal-900/30 hover:bg-teal-900/50 text-sm transition-all">Open ↗</a>
        </li>`
    ).join('');

    const btn = el('modal-complete-btn');
    btn.onclick = () => toggleSkillComplete(skill.id);
    
    if(skill.status === 'completed') {
        btn.textContent = 'Mark as Incomplete';
        btn.className = 'w-full py-4 rounded-xl font-bold border-2 border-yellow-600/50 text-yellow-500 hover:bg-yellow-900/20 transition-all';
    } else {
        btn.textContent = 'Complete Skill';
        btn.className = 'w-full py-4 rounded-xl font-bold bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white shadow-lg transition-all';
    }

    el('skill-modal-overlay').classList.remove('hidden');
}

function toggleSkillComplete(id) {
    if(!currentRoadmap) return;
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
    
    el('progress-bar-inner').style.width = `${pct}%`;
    el('progress-text').textContent = `${pct}%`;

    if(pct === 100 && !isCompletionPopupShown) {
        el('completion-modal-overlay').classList.remove('hidden');
        isCompletionPopupShown = true;
    }
}

// --- SETUP ---
function setupEventListeners() {
    // Modals
    el('login-btn-header').onclick = () => el('email-modal-overlay').classList.remove('hidden');
    el('info-login-btn').onclick = () => { el('info-modal-overlay').classList.add('hidden'); el('email-modal-overlay').classList.remove('hidden'); };
    el('info-close-btn').onclick = () => el('info-modal-overlay').classList.add('hidden');
    el('email-cancel-btn').onclick = () => el('email-modal-overlay').classList.add('hidden');
    el('modal-close-btn').onclick = () => el('skill-modal-overlay').classList.add('hidden');
    el('completion-close-btn').onclick = () => el('completion-modal-overlay').classList.add('hidden');
    
    // Actions
    el('email-form').addEventListener('submit', handleLogin);
    el('questionnaire-form').addEventListener('submit', handleFormSubmit);
    el('regenerate-btn').onclick = () => { 
        el('roadmap-content').classList.add('hidden'); 
        el('questionnaire-container').classList.remove('hidden'); 
    };
    el('custom-alert-confirm-btn').onclick = hideCustomAlert;
    
    // Theme
    el('theme-toggle').onclick = () => {
        const isLight = document.documentElement.classList.toggle('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    };
}

// --- HELPERS ---
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

function showCustomAlert(title, msg) {
    el('custom-alert-title').textContent = title;
    el('custom-alert-message').textContent = msg;
    el('custom-alert-overlay').classList.remove('hidden');
}

function hideCustomAlert() {
    el('custom-alert-overlay').classList.add('hidden');
}
