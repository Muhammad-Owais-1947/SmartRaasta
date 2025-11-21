// --- CONFIGURATION ---
const WORKER_URL = 'https://smartrasta.timespace.workers.dev'; 
const PDF_WATERMARK_TEXT = 'Smart Raasta Report';

const animatedLoadingMessages = [
    "Analyzing market trends...",
    "Curating best resources...",
    "Structuring your milestones...",
    "Mapping career path...",
    "Finalizing your roadmap..."
];

// --- STATE ---
let currentRoadmap = null;
let currentUserEmail = null;
let isCompletionPopupShown = false;
let confirmCallback = null;
let progressInterval = null;
let loadingMessageInterval = null;
let lastScrollY = 0;

// --- DOM SELECTORS ---
const el = id => document.getElementById(id);

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    if (localStorage.getItem('theme') === 'light') {
        document.documentElement.classList.add('light-mode');
        const moonIcon = document.querySelector('.fa-moon');
        if(moonIcon) {
            moonIcon.classList.remove('fa-moon');
            moonIcon.classList.add('fa-sun');
        }
    }
    
    // Remove Loading Screen Fast
    setTimeout(() => {
        const ls = el('loading-screen');
        if(ls) ls.classList.add('opacity-0', 'pointer-events-none');
    }, 800);

    await checkAuth();

    // First visit check
    if (!currentUserEmail && !localStorage.getItem('visitedBefore')) {
        setTimeout(() => {
            el('info-modal-overlay').classList.remove('hidden');
            localStorage.setItem('visitedBefore', 'true');
        }, 1500);
    }

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
            
            if (data.data && data.data.milestones) {
                renderRoadmap(data.data);
                el('questionnaire-container').classList.add('hidden');
            }
        }
    } catch (e) { console.log("Guest or Network Error"); }
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

        currentUserEmail = emailVal;
        updateHeaderState();
        el('email-modal-overlay').classList.add('hidden');
        el('info-modal-overlay').classList.add('hidden');

        if (currentRoadmap) {
            await saveRoadmapToCloud();
            showCustomAlert("Success", "Roadmap saved successfully!");
        } else {
            await checkAuth();
        }

    } catch (error) {
        showCustomAlert('Error', 'Login failed. Please try again.');
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
    } catch (e) {}
}

function updateHeaderState() {
    const loginBtn = el('login-btn-header');
    const emailDisplay = el('user-email-display');
    const emailText = el('user-email-text');
    
    if (currentUserEmail) {
        loginBtn.classList.add('hidden');
        emailText.textContent = currentUserEmail;
        emailDisplay.classList.remove('hidden');
        emailDisplay.classList.add('flex');
    } else {
        loginBtn.classList.remove('hidden');
        emailDisplay.classList.add('hidden');
        emailDisplay.classList.remove('flex');
    }
}

// --- GENERATION ---
async function handleFormSubmit(e) {
    if(e) e.preventDefault();
    showLoadingWithProgress();
    el('generate-btn').disabled = true;

    const lang = 'en'; // Default to English as per request/simplification
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
        if (!roadmap.milestones) throw new Error("Invalid AI response");
        
        renderRoadmap(roadmap);
        el('questionnaire-container').classList.add('hidden');
        
        if(currentUserEmail) saveRoadmapToCloud();

    } catch (error) {
        showCustomAlert("Error", "Could not generate roadmap. Please try again.");
    } finally {
        hideLoadingOverlay();
        el('generate-btn').disabled = false;
    }
}

// --- RENDER ---
function renderRoadmap(data) {
    currentRoadmap = data;
    el('roadmap-content').classList.remove('hidden');
    
    // 1. Setup Header/Title
    let html = `
        <div class="mb-12 text-center animate-fade-in-up">
            <h1 class="text-4xl font-bold mb-3" style="color: var(--text-primary);">${data.name}</h1>
            <p class="text-lg max-w-2xl mx-auto" style="color: var(--text-secondary);">${data.summary}</p>
        </div>
    `;

    // 2. Loop Phases
    data.milestones.forEach((phase, index) => {
        html += `
            <div class="mb-12 animate-fade-in-up" style="animation-delay: ${index * 100}ms">
                <div class="flex items-center gap-3 mb-6 border-b border-gray-700 pb-2">
                    <div class="w-8 h-8 rounded-full bg-teal-500/20 text-teal-500 flex items-center justify-center font-bold text-sm">${index + 1}</div>
                    <h2 class="text-2xl font-bold" style="color: var(--text-primary);">${phase.title}</h2>
                </div>
                
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    ${phase.skills.map(skill => {
                        const isCompleted = skill.status === 'completed';
                        // Conditional Classes
                        const borderClass = isCompleted ? 'border-orange-500' : 'border-gray-700';
                        const bgClass = isCompleted ? 'bg-orange-500/10' : 'bg-[#1e293b]';
                        const dotClass = isCompleted ? 'bg-orange-500 shadow-[0_0_10px_#f97316]' : 'bg-gray-600';
                        const iconClass = isCompleted ? 'fa-check text-orange-500' : 'fa-angle-right text-gray-500';
                        
                        return `
                        <div class="skill-card p-5 rounded-xl cursor-pointer border ${borderClass} ${bgClass} flex flex-col justify-between group" onclick="openSkillModal('${skill.id}')">
                            <div class="flex justify-between items-start mb-4">
                                <h3 class="font-semibold text-sm pr-2 group-hover:text-teal-400 transition-colors" style="color: var(--text-primary);">${skill.title}</h3>
                                <i class="fa-solid ${iconClass} text-sm"></i>
                            </div>
                            <div class="flex justify-between items-end">
                                <span class="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Click for details</span>
                                <div class="status-dot w-2 h-2 rounded-full ${dotClass}"></div>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    });

    el('roadmap-grid-container').innerHTML = html;
    updateProgress();
}

function openSkillModal(id) {
    let skill = null;
    currentRoadmap.milestones.forEach(m => {
        const found = m.skills.find(s => s.id === id);
        if(found) skill = found;
    });
    if(!skill) return;

    el('modal-title').textContent = skill.title;
    el('modal-description').textContent = skill.description;
    
    // Stats Grid
    el('modal-details-grid').innerHTML = `
        <div class="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
            <div class="text-xs text-gray-400 uppercase mb-1">Est. Salary</div>
            <div class="font-bold text-white">${skill.salary_pkr}</div>
        </div>
        <div class="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
            <div class="text-xs text-gray-400 uppercase mb-1">Demand</div>
            <div class="text-yellow-400 text-sm">${getStarIcons(skill.future_growth_rating)}</div>
        </div>
    `;

    // Resources
    el('modal-resources').innerHTML = skill.resources.map(r => 
        `<li class="flex items-center justify-between p-2 rounded hover:bg-gray-800 transition-colors">
            <span class="text-gray-300">${r.name}</span>
            <a href="${r.url}" target="_blank" class="text-teal-400 hover:text-teal-300"><i class="fa-solid fa-external-link-alt"></i></a>
        </li>`
    ).join('');

    // Button Logic
    const btn = el('modal-complete-btn');
    btn.onclick = () => toggleSkillComplete(skill.id);
    
    if(skill.status === 'completed') {
        btn.textContent = 'Mark as Incomplete';
        btn.className = 'w-full py-3 rounded-lg font-bold border-2 border-orange-500 text-orange-500 hover:bg-orange-500/10 transition-all';
    } else {
        btn.textContent = 'Mark as Completed';
        // Consistent hover effect requested by user
        btn.className = 'w-full py-3 rounded-lg font-bold bg-teal-600 text-white hover:bg-teal-500 transition-all shadow-lg';
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
        // Use Teal for progress bar (User requested greenish/theme color)
        bar.className = 'h-full bg-teal-500 transition-all duration-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]'; 
    }
    if(el('progress-text')) el('progress-text').textContent = `${pct}%`;

    if(pct === 100 && !isCompletionPopupShown) {
        el('completion-modal-overlay').classList.remove('hidden');
        isCompletionPopupShown = true;
    }
}

// --- EVENT SETUP ---
function setupEventListeners() {
    // Modals
    el('login-btn-header').onclick = () => el('email-modal-overlay').classList.remove('hidden');
    el('info-login-btn').onclick = () => { el('info-modal-overlay').classList.add('hidden'); el('email-modal-overlay').classList.remove('hidden'); };
    el('info-close-btn').onclick = () => el('info-modal-overlay').classList.add('hidden');
    el('email-cancel-btn').onclick = () => el('email-modal-overlay').classList.add('hidden');
    el('modal-close-btn').onclick = () => el('skill-modal-overlay').classList.add('hidden');
    el('completion-close-btn').onclick = () => el('completion-modal-overlay').classList.add('hidden');
    
    // Forms
    el('email-form').addEventListener('submit', handleLogin);
    el('questionnaire-form').addEventListener('submit', handleFormSubmit);
    
    // Buttons
    el('regenerate-btn').onclick = () => { 
        el('roadmap-content').classList.add('hidden'); 
        el('questionnaire-container').classList.remove('hidden'); 
    };
    el('custom-alert-confirm-btn').onclick = hideCustomAlert;
    
    // Scroll Header Logic
    const appDiv = el('app'); // Main scroll container
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
    
    // Theme Toggle
    el('theme-toggle').onclick = () => {
        const root = document.documentElement;
        const icon = el('theme-toggle').querySelector('i');
        
        if (root.classList.contains('light-mode')) {
            root.classList.remove('light-mode');
            localStorage.setItem('theme', 'dark');
            icon.className = 'fa-solid fa-moon text-xl';
        } else {
            root.classList.add('light-mode');
            localStorage.setItem('theme', 'light');
            icon.className = 'fa-solid fa-sun text-xl';
        }
    };
}

// --- HELPER ---
function getStarIcons(rating) {
    let html = '';
    for (let i = 0; i < 5; i++) {
        if (i < Math.floor(rating)) html += '<i class="fa-solid fa-star"></i>';
        else if (i === Math.floor(rating) && rating % 1 !== 0) html += '<i class="fa-solid fa-star-half-stroke"></i>';
        else html += '<i class="fa-regular fa-star"></i>';
    }
    return html;
}

function showLoadingWithProgress() {
    el('api-loading-overlay').classList.remove('hidden');
    let w = 0;
    progressInterval = setInterval(() => {
        if(w < 90) w += Math.random() * 3;
        el('api-loading-progress-bar').style.width = `${w}%`;
    }, 200);
    
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
    setTimeout(() => el('api-loading-overlay').classList.add('hidden'), 300);
}

function showCustomAlert(title, msg) {
    el('custom-alert-title').textContent = title;
    el('custom-alert-message').textContent = msg;
    el('custom-alert-overlay').classList.remove('hidden');
}

function hideCustomAlert() {
    el('custom-alert-overlay').classList.add('hidden');
}

function applyTranslations(lang) {
    // Implementation if needed
}
