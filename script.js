// --- SCRIPT CONFIGURATION & CONSTANTS ---
const WORKER_URL = 'https://smartrasta.timespace.workers.dev'; // No trailing slash
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

// --- GLOBAL STATE VARIABLES ---
let currentRoadmap = null;
let isCompletionPopupShown = false;
let lastScrollY = 0;
let confirmCallback = null;
let progressInterval = null;
let loadingMessageInterval = null;

// --- DOM ELEMENT SELECTORS ---
const el = id => document.getElementById(id);
const loadingScreen = el('loading-screen'), apiLoadingOverlay = el('api-loading-overlay'),
      apiLoadingProgressBar = el('api-loading-progress-bar'), apiLoadingProgressText = el('api-loading-progress-text'),
      loadingMessageContainer = el('loading-message-container'),
      questionnaireModalOverlay = el('questionnaire-modal-overlay'), questionnaireForm = el('questionnaire-form'),
      generateBtn = el('generate-btn'), mainContent = el('main-content'),
      mainHeader = el('main-header'), roadmapGridContainer = el('roadmap-grid-container'),
      regenerateBtn = el('regenerate-btn'),
      roadmapContent = el('roadmap-content'), progressContainer = el('progress-container'),
      pdfControls = el('pdf-controls'), downloadPdfBtn = el('download-pdf-btn'),
      skillModalOverlay = el('skill-modal-overlay'), skillModalContent = el('skill-modal-content'),
      modalTitle = el('modal-title'), modalDescription = el('modal-description'),
      modalResources = el('modal-resources'), modalCloseBtn = el('modal-close-btn'),
      modalCompleteBtn = el('modal-complete-btn'), modalDetailsGrid = el('modal-details-grid'),
      completionModalOverlay = el('completion-modal-overlay'), completionModalContent = el('completion-modal-content'),
      completionCloseBtn = el('completion-close-btn'),
      customAlertOverlay = el('custom-alert-overlay'), customAlertContent = el('custom-alert-content'),
      customAlertTitle = el('custom-alert-title'), customAlertMessage = el('custom-alert-message'),
      customAlertConfirmBtn = el('custom-alert-confirm-btn'), customAlertCancelBtn = el('custom-alert-cancel-btn'),
      regenerateSection = el('regenerate-section');

const emailModalOverlay = el('email-modal-overlay');
const emailForm = el('email-form');
const emailInput = el('email-input');
const loginBtn = el('login-btn');

// --- TRANSLATIONS ---
const translations = {
    en: {
        questionnaire_title: "Design Your Pakistan-Specific Roadmap",
        questionnaire_subtitle: "Let our AI design a personalized career blueprint based on the local job market.",
        career_goal_label: "Your Desired Career Field",
        interests_label: "Specific Interests (Optional)",
        education_label: "Highest Education",
        province_label: "Your Province",
        generate_button: "Generate My Grid",
        progress_label: "Overall Progress",
        resources_title: "Suggested Resources",
        completion_title: "Congratulations!",
        completion_subtitle: "You've completed all the steps in your roadmap. You're ready for the next chapter!",
        awesome_button: "Awesome!",
        completed_message: "Roadmap Completed!",
        lang_confirm_title: "Confirm Language Change",
        lang_confirm_message: "Changing the language will re-generate your roadmap with new, translated content from the AI. Do you want to continue?",
        limit_title: "Usage Limit Reached",
        limit_message: "You have generated too many roadmaps recently. Please try again later.",
        error_title: "Error"
    },
    ur: {
        questionnaire_title: "Apna Pakistan-Makhsoos Roadmap Banayein",
        questionnaire_subtitle: "Hamare AI ko muqami job market ki bunyad par aap ka zati career blueprint design karne dein.",
        career_goal_label: "Aap Ka Matlooba Career Shoba",
        interests_label: "Makhsoos Dilchaspiyan (Ikhtiyaari)",
        education_label: "Aala Taleem",
        province_label: "Aap Ka Sooba",
        generate_button: "Mera Grid Banayein",
        progress_label: "Majmui Taraqqi",
        resources_title: "Tajweez Karda Wasail",
        completion_title: "Mubarak Ho!",
        completion_subtitle: "Aap ne apne roadmap ke tamam marahil mukammal kar liye hain. Aap agle bab ke liye tayar hain!",
        awesome_button: "Zabardast!",
        completed_message: "Roadmap Mukammal!",
        lang_confirm_title: "Zubaan Tabdeel Karne Ki Tasdeeq Karein",
        lang_confirm_message: "Zubaan tabdeel karne se AI se naye, tarjuma shuda mawad ke sath aap ka roadmap dobara banaya jayega. Kya aap jari rakhna chahte hain?",
        limit_title: "Istemaal Ki Hadd Mukammal",
        limit_message: "Aap ne pichle ghantay mein 3 roadmaps banaye hain. Baraye meharbani baad mein koshish karein. Safha ab band ho jayega.",
        error_title: "Ghalti"
    }
};

// --- CORE LOGIC ---

function checkUsageLimit() {
    if (sessionStorage.getItem('isAdmin') === 'true') return true;
    const now = new Date().getTime();
    const oneHourAgo = now - (60 * 60 * 1000);
    let timestamps = JSON.parse(localStorage.getItem('generationTimestamps')) || [];
    const recentTimestamps = timestamps.filter(ts => ts > oneHourAgo);
    localStorage.setItem('generationTimestamps', JSON.stringify(recentTimestamps));
    return recentTimestamps.length < 50;
}

function recordGeneration() {
    if (sessionStorage.getItem('isAdmin') === 'true') return;
    let timestamps = JSON.parse(localStorage.getItem('generationTimestamps')) || [];
    timestamps.push(new Date().getTime());
    localStorage.setItem('generationTimestamps', JSON.stringify(timestamps));
}

async function callGeminiAPI(goal, interests, education, location, lang) {
    const payload = { goal, interests, education, location, lang };
    try {
        const response = await fetch(`${WORKER_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            credentials: 'include'
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            try {
                const errJson = JSON.parse(errorText);
                throw new Error(errJson.error || errorText);
            } catch(e) {
                throw new Error(`Server Error: ${response.status} ${errorText}`);
            }
        }
        return await response.json();
    } catch (error) {
        console.error("Error calling Worker:", error);
        const currentLang = localStorage.getItem('lang') || 'en';
        showCustomAlert(
            translations[currentLang].error_title,
            `Failed to generate roadmap. ${error.message}`,
            () => {}
        );
        return null;
    }
}

function renderRoadmap(roadmapData) {
    if (!roadmapData || !roadmapData.milestones || !Array.isArray(roadmapData.milestones)) {
        console.error("Invalid Data Structure from AI:", roadmapData);
        showCustomAlert(
            "Generation Issue", 
            "The AI response was incomplete. Please click 'Regenerate' to try again.", 
            () => {}
        );
        hideLoadingOverlay(); 
        return; 
    }

    currentRoadmap = roadmapData;
    isCompletionPopupShown = false;
    
    progressContainer.innerHTML = `<div class="flex justify-between mb-1"><span class="text-base font-medium text-teal-400" data-translate-key="progress_label">Overall Progress</span><span id="progress-text" class="text-sm font-medium text-teal-400">0%</span></div><div class="w-full bg-gray-700 rounded-full h-2.5"><div id="progress-bar-inner" class="bg-teal-500 h-2.5 rounded-full" style="width: 0%"></div></div>`;
    let gridHTML = `<div class="space-y-12 animate-fade-in-scale-up">
        <div class="text-center sm:text-left">
            <h1 class="text-3xl sm:text-4xl font-bold text-white">${roadmapData.name}</h1>
            <p class="mt-2 text-lg text-gray-400">${roadmapData.summary || ''}</p>
        </div>
    `;
    roadmapData.milestones.forEach(m => {
        gridHTML += `<div class="milestone-phase"><h2 class="text-2xl font-bold text-teal-400 border-b border-gray-700 pb-3 mb-6">${m.title}</h2><div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 items-stretch">${m.skills.map(s => `
            <div class="skill-card p-5 rounded-xl cursor-pointer flex flex-col justify-between bg-gray-800 border border-gray-700 hover:border-teal-500 transition-all duration-200 ${s.status === 'completed' ? 'completed border-teal-500 ring-1 ring-teal-500' : ''}" data-skill-id="${s.id}">
                <p class="font-semibold text-white mb-4">${s.title}</p>
                <div class="self-end status-dot w-3 h-3 rounded-full ${s.status === 'completed' ? 'bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.6)]' : 'bg-gray-600'}"></div>
            </div>`).join('')}</div></div>`;
    });
    gridHTML += '</div>';
    roadmapGridContainer.innerHTML = gridHTML;
    
    updateProgress();
    applyTranslations(localStorage.getItem('lang') || 'en');
    
    regenerateSection.classList.remove('hidden');
    pdfControls.classList.add('hidden');
    setTimeout(() => {
        pdfControls.classList.remove('hidden');
        pdfControls.classList.add('animate-fade-in-scale-up');
    }, 2000);
}

function findSkillById(skillId) {
    if (!currentRoadmap) return null;
    for (const milestone of currentRoadmap.milestones) {
        const found = milestone.skills.find(s => s.id === skillId);
        if (found) return found;
    }
    return null;
}

function updateProgress() {
    if (!currentRoadmap) return;
    const allSkills = currentRoadmap.milestones.flatMap(m => m.skills);
    const completedSkills = allSkills.filter(s => s.status === 'completed');
    const progressPercentage = allSkills.length > 0 ? (completedSkills.length / allSkills.length) * 100 : 0;
    
    const progressBar = el('progress-bar-inner');
    const progressText = el('progress-text');
    if(progressBar) progressBar.style.width = `${progressPercentage}%`;
    if(progressText) progressText.textContent = `${Math.round(progressPercentage)}%`;
    if (Math.round(progressPercentage) === 100 && !isCompletionPopupShown) {
        openCompletionModal();
        isCompletionPopupShown = true;
    }
}

function renderCompletionState() {
    if(progressContainer) {
        progressContainer.innerHTML = `<div class="flex items-center justify-end h-full text-emerald-400 animate-pulse"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span class="text-base font-medium ml-2" data-translate-key="completed_message">Roadmap Completed!</span></div>`;
        applyTranslations(localStorage.getItem('lang') || 'en');
    }
}

function createStars(rating) {
    let starsHTML = '';
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 !== 0;
    for(let i = 0; i < 5; i++) {
        if (i < fullStars) {
            starsHTML += `<svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>`;
        } else if (i === fullStars && halfStar) {
            starsHTML += `<svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292zM10 12.433V6.214l.951 2.924a1 1 0 00.95.69h3.087l-2.4 1.74a1 1 0 00-.364 1.118l.95 2.923-2.4-1.74a1 1 0 00-1.175 0l-2.4 1.74.95-2.923a1 1 0 00-.364-1.118l-2.4-1.74h3.087a1 1 0 00.95-.69L10 6.214z"></path></svg>`;
        } else {
             starsHTML += `<svg class="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>`;
        }
    }
    return starsHTML;
}

// --- MODAL FUNCTIONS ---
function openModal(skill) {
     modalTitle.textContent = skill.title;
     modalDescription.textContent = skill.description || "No description available.";
     modalDetailsGrid.innerHTML = `<div class="bg-gray-800 p-4 rounded-lg border border-gray-700"><p class="text-sm text-gray-400 mb-1">Avg. Salary (PKR)</p><p class="text-lg font-semibold text-white">${skill.salary_pkr || 'N/A'}</p></div><div class="bg-gray-800 p-4 rounded-lg border border-gray-700"><p class="text-sm text-gray-400 mb-1">Future Growth</p><div class="flex items-center">${createStars(skill.future_growth_rating || 0)}</div></div><div class="bg-gray-800 p-4 rounded-lg sm:col-span-2 border border-gray-700"><p class="text-sm text-gray-400 mb-1">Opportunities</p><p class="text-lg font-semibold text-white">${skill.job_opportunities?.join(', ') || 'N/A'}</p></div>`;
     modalResources.innerHTML = skill.resources?.length ? skill.resources.map(r => `<li><a href="${r.url}" target="_blank" rel="noopener noreferrer" class="text-teal-400 hover:text-teal-300 underline hover:no-underline transition-colors">${r.name}</a></li>`).join('') : '<li class="text-gray-500">No suggestions provided.</li>';
     modalCompleteBtn.onclick = () => handleCompleteClick(skill.id);
     updateModalCompleteButton(skill.status);
     skillModalOverlay.classList.remove('hidden');
     setTimeout(() => skillModalOverlay.classList.add('open'), 10);
     applyTranslations(localStorage.getItem('lang') || 'en');
}

function closeModal() {
     skillModalOverlay.classList.remove('open');
     setTimeout(() => skillModalOverlay.classList.add('hidden'), 300);
}

function openCompletionModal() {
     completionModalOverlay.classList.remove('hidden');
     setTimeout(() => completionModalOverlay.classList.add('open'), 10);
     applyTranslations(localStorage.getItem('lang') || 'en');
}

function closeCompletionModal() {
     completionModalOverlay.classList.remove('open');
     setTimeout(() => {
         completionModalOverlay.classList.add('hidden');
         renderCompletionState();
     }, 300);
}

function updateModalCompleteButton(status) {
      modalCompleteBtn.textContent = status === 'completed' ? 'Mark as Incomplete' : 'Mark as Completed';
      modalCompleteBtn.className = `w-full font-bold py-3 px-4 rounded-lg transition-colors border ${status === 'completed' ? 'bg-transparent border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-gray-900' : 'bg-teal-600 border-teal-600 text-white hover:bg-teal-700 hover:border-teal-700'}`;
}

// --- UTILITY & EVENT HANDLERS ---
function showCustomAlert(title, message, onConfirm, showCancel = false) {
    customAlertTitle.textContent = title;
    customAlertMessage.textContent = message;
    confirmCallback = onConfirm;
    customAlertCancelBtn.classList.toggle('hidden', !showCancel);
    customAlertConfirmBtn.textContent = showCancel ? "Confirm" : "OK";
    customAlertOverlay.classList.remove('hidden');
}

function hideCustomAlert() {
    customAlertOverlay.classList.add('hidden');
}

function showLoadingWithProgress() {
    clearInterval(progressInterval);
    clearInterval(loadingMessageInterval);
    apiLoadingOverlay.classList.remove('hidden');
    let progress = 0;
    apiLoadingProgressBar.style.width = '0%';
    apiLoadingProgressText.textContent = '0%';
    progressInterval = setInterval(() => {
        progress += Math.random() * 5;
        if (progress > 95) {
            progress = 95;
            clearInterval(progressInterval);
        }
        apiLoadingProgressBar.style.width = `${progress}%`;
        apiLoadingProgressText.textContent = `${Math.round(progress)}%`;
    }, 200);
    let messageIndex = 0;
    loadingMessageContainer.textContent = animatedLoadingMessages[0];
    loadingMessageInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % animatedLoadingMessages.length;
        loadingMessageContainer.textContent = animatedLoadingMessages[messageIndex];
    }, 2500);
}

function hideLoadingOverlay() {
    clearInterval(progressInterval);
    clearInterval(loadingMessageInterval);
    apiLoadingProgressBar.style.width = '100%';
    apiLoadingProgressText.textContent = '100%';
    setTimeout(() => {
        apiLoadingOverlay.classList.add('hidden');
    }, 500);
}

async function handleLogin(e) {
  if (e) e.preventDefault();
  const email = emailInput.value.trim();
  if (!email) return showCustomAlert('Error', 'Please enter your email', () => {});
  try {
    const response = await fetch(`${WORKER_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials: 'include'
    });
    if (!response.ok) throw new Error(await response.text());
    emailModalOverlay.classList.add('hidden');
    questionnaireModalOverlay.classList.remove('hidden');
    questionnaireModalOverlay.querySelector('div').classList.add('animate-fade-in-scale-up');
  } catch (error) {
    showCustomAlert('Login Error', error.message, () => {});
  }
}

async function checkAuth() {
  try {
    const response = await fetch(`${WORKER_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkOnly: true }),
      credentials: 'include'
    });
    if (response.status === 401) throw new Error('Unauthorized');
    // Authorized
    questionnaireModalOverlay.classList.remove('hidden');
    questionnaireModalOverlay.querySelector('div').classList.add('animate-fade-in-scale-up');
  } catch {
    // Not authorized
    emailModalOverlay.classList.remove('hidden');
  }
}

async function handleFormSubmit(e) {
    if (e) e.preventDefault();
    const lang = localStorage.getItem('lang') || 'en';
    if (!checkUsageLimit()) {
        showCustomAlert(
            translations[lang].limit_title,
            translations[lang].limit_message,
            () => { window.location.href = 'about:blank'; }
        );
        return;
    }
    showLoadingWithProgress();
    generateBtn.disabled = true;
    regenerateBtn.disabled = true;
    const personalizedRoadmap = await callGeminiAPI(
        el('career-goal').value,
        el('user-interests').value,
        el('education-level').value,
        el('location').value,
        lang
    );
    hideLoadingOverlay();
    generateBtn.disabled = false;
    regenerateBtn.disabled = false;
    applyTranslations(lang);
    if (personalizedRoadmap) {
        recordGeneration();
        renderRoadmap(personalizedRoadmap);
        questionnaireModalOverlay.classList.add('opacity-0', 'pointer-events-none');
        mainContent.classList.remove('hidden');
        mainContent.classList.remove('animate-fade-in-scale-up');
        void mainContent.offsetWidth;
        mainContent.classList.add('animate-fade-in-scale-up');
    }
}

function handleGridClick(e) {
    const card = e.target.closest('.skill-card');
    if (card) {
        const skill = findSkillById(card.dataset.skillId);
        if(skill) openModal(skill);
    }
}

function handleCompleteClick(skillId) {
    const skill = findSkillById(skillId);
    if (!skill) return;
    skill.status = skill.status === 'completed' ? 'incomplete' : 'completed';
    const skillCard = document.querySelector(`.skill-card[data-skill-id="${skillId}"]`);
    if (skillCard) {
        const dot = skillCard.querySelector('.status-dot');
        if (skill.status === 'completed') {
            skillCard.classList.add('completed', 'border-teal-500', 'ring-1', 'ring-teal-500');
            dot.classList.remove('bg-gray-600');
            dot.classList.add('bg-teal-500', 'shadow-[0_0_8px_rgba(20,184,166,0.6)]');
        } else {
            skillCard.classList.remove('completed', 'border-teal-500', 'ring-1', 'ring-teal-500');
            dot.classList.remove('bg-teal-500', 'shadow-[0_0_8px_rgba(20,184,166,0.6)]');
            dot.classList.add('bg-gray-600');
        }
    }
    updateProgress(); 
    closeModal();
}

function handleDownloadPdf() {
    if (!currentRoadmap) {
        showCustomAlert("No Roadmap", "Please generate a roadmap first.", () => {});
        return;
    }
    const goal = el('career-goal').value || 'career';
    const filename = `${goal.toLowerCase().replace(/\s+/g, '-')}-roadmap.pdf`;
    const watermarkText = PDF_WATERMARK_TEXT;
    let pdfContentHtml = `
        <style>
            body { font-family: sans-serif; color: #333; padding: 20px; }
            h1 { font-size: 28px; color: #0d9488; border-bottom: 3px solid #0d9488; padding-bottom: 15px; margin-bottom: 30px; }
            h2 { font-size: 22px; color: #1f2937; margin-top: 35px; border-bottom: 1px solid #ccc; padding-bottom: 8px; }
            h3 { font-size: 18px; color: #111827; margin-top: 20px; font-weight: bold; }
            p { margin-bottom: 8px; line-height: 1.5; font-size: 14px; }
            ul { list-style-type: disc; margin-left: 20px; padding-left: 0; }
            li { margin-bottom: 4px; font-size: 14px; }
            strong { font-weight: bold; color: #374151; }
            a { color: #0d9488; text-decoration: none; }
        </style>
        <body>
            <h1>${currentRoadmap.name}</h1>
            <p style="font-size: 16px; margin-bottom: 30px;"><em>${currentRoadmap.summary}</em></p>
    `;
    currentRoadmap.milestones.forEach(milestone => {
        pdfContentHtml += `<h2>${milestone.title}</h2>`;
        milestone.skills.forEach(skill => {
            pdfContentHtml += `
                <div style="margin-bottom: 20px; page-break-inside: avoid; border: 1px solid #eee; padding: 15px; border-radius: 8px;">
                    <h3>${skill.title}</h3>
                    <p><strong>Description:</strong> ${skill.description || 'N/A'}</p>
                    <p><strong>Average Salary:</strong> ${skill.salary_pkr || 'N/A'}</p>
                    <p><strong>Growth Rating:</strong> ${skill.future_growth_rating || 'N/A'} / 5</p>
                    <p><strong>Suggested Resources:</strong></p>
            `;
            if (skill.resources && skill.resources.length > 0) {
                pdfContentHtml += '<ul>';
                skill.resources.forEach(resource => {
                    pdfContentHtml += `<li><a href="${resource.url}">${resource.name}</a></li>`;
                });
                pdfContentHtml += '</ul>';
            } else {
                pdfContentHtml += '<p>No resources suggested.</p>';
            }
            pdfContentHtml += '</div>';
        });
    });
    pdfContentHtml += '</body>';
    const opt = {
        margin: 0.5,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(pdfContentHtml).toPdf().get('pdf').then(function (pdf) {
        if (watermarkText) {
            const totalPages = pdf.internal.getNumberOfPages();
            pdf.setFontSize(50);
            pdf.setTextColor(200, 200, 200);
            for (let i = 1; i <= totalPages; i++) {
                pdf.setPage(i);
                pdf.text(watermarkText, pdf.internal.pageSize.getWidth() / 2, pdf.internal.pageSize.getHeight() / 2, {
                    angle: -45,
                    align: 'center'
                });
            }
        }
    }).save();
}

function toggleTheme() {
    document.documentElement.classList.toggle('light-mode');
    const isLight = document.documentElement.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

function toggleLanguage() {
    const currentLang = localStorage.getItem('lang') || 'en';
    const newLang = currentLang === 'en' ? 'ur' : 'en';
    if (currentRoadmap) {
        showCustomAlert(
            translations[currentLang].lang_confirm_title,
            translations[currentLang].lang_confirm_message,
            () => {
                localStorage.setItem('lang', newLang);
                handleFormSubmit();
            },
            true
        );
    } else {
         localStorage.setItem('lang', newLang);
         applyTranslations(newLang);
    }
}

function applyTranslations(lang) {
    document.querySelectorAll('[data-translate-key]').forEach(elem => {
        const key = elem.dataset.translateKey;
        if (translations[lang] && translations[lang][key]) {
            elem.textContent = translations[lang][key];
        }
    });
    const langBtn = el('lang-toggle');
    if(langBtn) langBtn.textContent = lang.toUpperCase();
}

// --- INITIALIZATION & EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'light') {
        document.documentElement.classList.add('light-mode');
    }
    const savedLang = localStorage.getItem('lang') || 'en';
    applyTranslations(savedLang);
    setTimeout(() => {
        loadingScreen.classList.add('opacity-0', 'pointer-events-none');
    }, 1000);
    checkAuth();
    
    questionnaireForm.addEventListener('submit', handleFormSubmit);
    regenerateBtn.addEventListener('click', handleFormSubmit);
    downloadPdfBtn.addEventListener('click', handleDownloadPdf);
    mainHeader.addEventListener('click', e => {
        if(e.target.closest('#theme-toggle')) toggleTheme();
        if(e.target.closest('#lang-toggle')) toggleLanguage();
    });
    roadmapContent.addEventListener('scroll', () => {
        const currentScrollY = roadmapContent.scrollTop;
        mainHeader.classList.toggle('scrolled', currentScrollY > 20);
        mainHeader.classList.toggle('hidden-header', currentScrollY > 100 && currentScrollY > lastScrollY);
        lastScrollY = currentScrollY;
    });
    roadmapGridContainer.addEventListener('click', handleGridClick);
    modalCloseBtn.addEventListener('click', closeModal);
    skillModalOverlay.addEventListener('click', e => { if (e.target === skillModalOverlay) closeModal(); });
    completionCloseBtn.addEventListener('click', closeCompletionModal);
    completionModalOverlay.addEventListener('click', e => { if (e.target === completionModalOverlay) closeCompletionModal(); });
    customAlertConfirmBtn.addEventListener('click', () => {
        if (typeof confirmCallback === 'function') {
            confirmCallback();
        }
        hideCustomAlert();
    });
    customAlertCancelBtn.addEventListener('click', hideCustomAlert);
    customAlertOverlay.addEventListener('click', e => { if (e.target === customAlertOverlay) hideCustomAlert(); });
    emailForm.addEventListener('submit', handleLogin);
});
