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

// --- DOM SELECTORS ---
const el = id => document.getElementById(id);
const loadingScreen = el('loading-screen');
// Modals
const questionnaireModal = el('questionnaire-modal-overlay');
const infoModal = el('info-modal-overlay');
const emailModal = el('email-modal-overlay');
// Main Content
const mainContent = el('main-content');
const roadmapGrid = el('roadmap-grid-container');
const progressContainer = el('progress-container');
// Header Elements
const loginBtnHeader = el('login-btn-header');
const userEmailDisplay = el('user-email-display');
// Forms
const emailForm = el('email-form');
const questionnaireForm = el('questionnaire-form');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // Theme
    if (localStorage.getItem('theme') === 'light') document.documentElement.classList.add('light-mode');
    
    // Language
    applyTranslations(localStorage.getItem('lang') || 'en');

    // Remove Loading Screen ASAP
    setTimeout(() => {
        loadingScreen.classList.add('opacity-0', 'pointer-events-none');
    }, 800);

    // Check Login Status
    await checkAuth();

    // Show Info Modal if first time and not logged in
    if (!currentUserEmail && !localStorage.getItem('visitedBefore')) {
        setTimeout(() => {
            infoModal.classList.remove('hidden');
            localStorage.setItem('visitedBefore', 'true');
        }, 1500);
    } else if (!currentUserEmail) {
        // If not first time, but not logged in, show questionnaire
        questionnaireModal.classList.remove('hidden');
    }

    // Event Listeners
    setupEventListeners();
});

// --- AUTH LOGIC ---
async function checkAuth() {
    try {
        const res = await fetch(`${WORKER_URL}/load`, { method: 'GET', credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            currentUserEmail = data.email;
            updateHeaderState();
            
            // If user has saved data, load it
            if (data.data && data.data.milestones) {
                renderRoadmap(data.data);
                questionnaireModal.classList.add('hidden');
            } else {
                questionnaireModal.classList.remove('hidden');
            }
        }
    } catch (e) {
        console.log("Auth check failed or guest mode");
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = el('email-input').value.trim();
    if (!email) return showCustomAlert('Error', 'Please enter a valid email.');

    const submitBtn = el('login-submit-btn');
    submitBtn.textContent = 'Verifying...';
    submitBtn.disabled = true;

    try {
        const res = await fetch(`${WORKER_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
            credentials: 'include'
        });

        if (!res.ok) throw new Error('Login failed');

        currentUserEmail = email;
        updateHeaderState();
        emailModal.classList.add('hidden');
        infoModal.classList.add('hidden');

        // If we have a roadmap generated as guest, save it now
        if (currentRoadmap) {
            await saveRoadmapToCloud();
            showCustomAlert("Saved", "Your roadmap has been saved to your account!", () => {});
        } else {
            // If no roadmap, reload to check for existing data
            await checkAuth();
        }

    } catch (error) {
        showCustomAlert('Error', 'Could not log in. Please try again.');
    } finally {
        submitBtn.textContent = 'Continue';
        submitBtn.disabled = false;
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
    } catch (e) { console.error("Save failed", e); }
}

function updateHeaderState() {
    if (currentUserEmail) {
        loginBtnHeader.classList.add('hidden');
        userEmailDisplay.textContent = currentUserEmail;
        userEmailDisplay.classList.remove('hidden');
    } else {
        loginBtnHeader.classList.remove('hidden');
        userEmailDisplay.classList.add('hidden');
    }
}

// --- GENERATION LOGIC ---
async function handleFormSubmit(e) {
    if(e) e.preventDefault();
    
    // 1. Check Rate Limit (Client Side)
    if (!checkUsageLimit()) {
        return showCustomAlert('Limit Reached', 'You have generated too many roadmaps. Please try again later.');
    }

    // 2. UI Loading State
    showLoadingWithProgress();
    el('generate-btn').disabled = true;

    // 3. API Call
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
        
        // 4. Validate & Render
        if (!roadmap.milestones) throw new Error("Invalid AI response structure");
        
        recordGeneration(); // Update local limit
        renderRoadmap(roadmap);
        questionnaireModal.classList.add('hidden');
        
        // Auto-save if logged in (Worker also tries, but this is safe redundancy)
        if(currentUserEmail) saveRoadmapToCloud();

    } catch (error) {
        showCustomAlert("Error", error.message || "Something went wrong.");
    } finally {
        hideLoadingOverlay();
        el('generate-btn').disabled = false;
    }
}

// --- RENDERING & UI ---
function renderRoadmap(data) {
    currentRoadmap = data;
    mainContent.classList.remove('hidden');
    
    // Progress Bar
    progressContainer.innerHTML = `
        <div class="flex justify-between mb-1 text-teal-400 font-medium">
            <span>Overall Progress</span><span id="progress-text">0%</span>
        </div>
        <div class="w-full bg-gray-700 rounded-full h-2.5">
            <div id="progress-bar-inner" class="bg-teal-500 h-2.5 rounded-full transition-all duration-500" style="width: 0%"></div>
        </div>`;

    // Content Grid
    let html = `
        <div class="space-y-12 animate-fade-in-scale-up">
            <div class="text-center sm:text-left">
                <h1 class="text-3xl sm:text-4xl font-bold text-white mb-2">${data.name}</h1>
                <p class="text-lg text-gray-400">${data.summary}</p>
            </div>`;

    data.milestones.forEach(phase => {
        html += `
            <div class="milestone-phase">
                <h2 class="text-2xl font-bold text-teal-400 border-b border-gray-700 pb-3 mb-6">${phase.title}</h2>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 items-stretch">
                    ${phase.skills.map(skill => `
                        <div class="skill-card p-5 rounded-xl cursor-pointer bg-gray-800 border border-gray-700 hover:border-teal-500 transition-all flex flex-col justify-between ${skill.status === 'completed' ? 'border-teal-500 ring-1 ring-teal-500' : ''}" data-id="${skill.id}">
                            <p class="font-semibold text-white mb-4">${skill.title}</p>
                            <div class="self-end w-3 h-3 rounded-full ${skill.status === 'completed' ? 'bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.6)]' : 'bg-gray-600'}"></div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    });
    html += '</div>';
    
    roadmapGrid.innerHTML = html;
    el('regenerate-section').classList.remove('hidden');
    el('pdf-controls').classList.remove('hidden');
    
    // Add Click Events to New Cards
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
    
    // Details
    el('modal-details-grid').innerHTML = `
        <div class="bg-gray-800 p-3 rounded border border-gray-700">
            <p class="text-xs text-gray-400">Salary (PKR)</p>
            <p class="font-bold text-white">${skill.salary_pkr}</p>
        </div>
        <div class="bg-gray-800 p-3 rounded border border-gray-700">
            <p class="text-xs text-gray-400">Growth</p>
            <p class="font-bold text-white">${skill.future_growth_rating}/5</p>
        </div>
        <div class="bg-gray-800 p-3 rounded border border-gray-700 col-span-2">
            <p class="text-xs text-gray-400">Jobs</p>
            <p class="font-bold text-white text-sm">${skill.job_opportunities?.join(', ')}</p>
        </div>
    `;

    // Resources
    el('modal-resources').innerHTML = skill.resources.map(r => 
        `<li><a href="${r.url}" target="_blank" class="text-teal-400 hover:underline">${r.name}</a></li>`
    ).join('');

    // Button State
    const btn = el('modal-complete-btn');
    btn.onclick = () => toggleSkillComplete(skill.id);
    if(skill.status === 'completed') {
        btn.textContent = 'Mark Incomplete';
        btn.className = 'w-full py-3 rounded font-bold border border-yellow-500 text-yellow-500 hover:bg-yellow-900';
    } else {
        btn.textContent = 'Mark Complete';
        btn.className = 'w-full py-3 rounded font-bold bg-teal-600 text-white hover:bg-teal-700';
    }

    el('skill-modal-overlay').classList.remove('hidden');
}

async function toggleSkillComplete(id) {
    if(!currentRoadmap) return;
    currentRoadmap.milestones.forEach(m => {
        const s = m.skills.find(sk => sk.id === id);
        if(s) s.status = s.status === 'completed' ? 'incomplete' : 'completed';
    });
    
    el('skill-modal-overlay').classList.add('hidden');
    renderRoadmap(currentRoadmap); // Re-render to update UI
    if(currentUserEmail) saveRoadmapToCloud(); // Auto-save change
}

function updateProgress() {
    if(!currentRoadmap) return;
    const all = currentRoadmap.milestones.flatMap(m => m.skills);
    const done = all.filter(s => s.status === 'completed');
    const pct = Math.round((done.length / all.length) * 100);
    
    el('progress-bar-inner').style.width = `${pct}%`;
    el('progress-text').textContent = `${pct}%`;

    if(pct === 100 && !isCompletionPopupShown) {
        el('completion-modal-overlay').classList.remove('hidden');
        isCompletionPopupShown = true;
    }
}

// --- UTILS ---
function setupEventListeners() {
    emailForm.addEventListener('submit', handleLogin);
    questionnaireForm.addEventListener('submit', handleFormSubmit);
    
    el('login-btn-header').onclick = () => emailModal.classList.remove('hidden');
    el('info-login-btn').onclick = () => { infoModal.classList.add('hidden'); emailModal.classList.remove('hidden'); };
    el('info-close-btn').onclick = () => { infoModal.classList.add('hidden'); questionnaireModal.classList.remove('hidden'); };
    el('email-cancel-btn').onclick = () => emailModal.classList.add('hidden');
    
    el('modal-close-btn').onclick = () => el('skill-modal-overlay').classList.add('hidden');
    el('completion-close-btn').onclick = () => el('completion-modal-overlay').classList.add('hidden');
    el('regenerate-btn').onclick = () => { mainContent.classList.add('hidden'); questionnaireModal.classList.remove('hidden'); };
    
    // Theme
    el('theme-toggle').onclick = () => {
        const isLight = document.documentElement.classList.toggle('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    };
}

function showCustomAlert(title, msg) {
    el('custom-alert-title').textContent = title;
    el('custom-alert-message').textContent = msg;
    el('custom-alert-overlay').classList.remove('hidden');
    el('custom-alert-confirm-btn').onclick = () => el('custom-alert-overlay').classList.add('hidden');
}

function showLoadingWithProgress() {
    apiLoadingOverlay.classList.remove('hidden');
    let w = 0;
    progressInterval = setInterval(() => {
        if(w < 90) w += Math.random() * 5;
        el('api-loading-progress-bar').style.width = `${w}%`;
        el('api-loading-progress-text').textContent = `${Math.round(w)}%`;
    }, 200);
    
    let msgIdx = 0;
    el('loading-message-container').textContent = animatedLoadingMessages[0];
    loadingMessageInterval = setInterval(() => {
        msgIdx = (msgIdx + 1) % animatedLoadingMessages.length;
        el('loading-message-container').textContent = animatedLoadingMessages[msgIdx];
    }, 2000);
}

function hideLoadingOverlay() {
    clearInterval(progressInterval);
    clearInterval(loadingMessageInterval);
    el('api-loading-progress-bar').style.width = '100%';
    setTimeout(() => apiLoadingOverlay.classList.add('hidden'), 300);
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

function applyTranslations(lang) {
    // Placeholder for translation logic - keep existing if you have it
    el('lang-toggle').textContent = lang.toUpperCase();
}
