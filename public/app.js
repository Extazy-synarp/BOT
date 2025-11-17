// ═══════════════════════════════════════════════════════════════
// 🌐 APPLICATION WEB - RASCA ULTRA PREMIUM v3.0
// ═══════════════════════════════════════════════════════════════
// 🤖 Créé par Extazy - Advanced Management System
// ═══════════════════════════════════════════════════════════════

const API_URL = window.location.origin;
let API_KEY = localStorage.getItem('apiKey') || '';
let socket = null;
let charts = {};
let currentMonth = new Date();

// ═══════════════════════════════════════════════════════════════
// 🔐 AUTHENTIFICATION
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    if (API_KEY) {
        checkAuth();
    }
    
    // Créer les particules animées
    createParticles();
    
    // Initialiser le thème
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('heureSelect').addEventListener('change', handleHeureChange);
    
    // Recherche d'opérations
    const searchInput = document.getElementById('searchOperations');
    if (searchInput) {
        searchInput.addEventListener('input', filterOperations);
    }
    
    // Filtre d'opérations
    const filterSelect = document.getElementById('filterOperations');
    if (filterSelect) {
        filterSelect.addEventListener('change', filterOperations);
    }
});

async function handleLogin(e) {
    e.preventDefault();
    API_KEY = document.getElementById('apiKeyInput').value;
    
    const success = await checkAuth();
    if (success) {
        localStorage.setItem('apiKey', API_KEY);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'grid';
        init();
    } else {
        showNotification('Clé API invalide', 'error');
        API_KEY = '';
    }
}

function logout() {
    if (socket) socket.disconnect();
    localStorage.removeItem('apiKey');
    API_KEY = '';
    location.reload();
}

async function checkAuth() {
    try {
        const response = await fetch(`${API_URL}/api/info`, {
            headers: { 'X-API-Key': API_KEY }
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
// 🎨 SYSTÈME DE THÈME
// ═══════════════════════════════════════════════════════════════

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    const icon = document.querySelector('.theme-toggle i');
    icon.className = newTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    
    showNotification(`Thème ${newTheme === 'dark' ? 'sombre' : 'clair'} activé`, 'success');
    
    // Recharger les graphiques avec les nouvelles couleurs
    setTimeout(() => {
        updateAllCharts();
    }, 300);
}

// ═══════════════════════════════════════════════════════════════
// 🎨 PARTICULES ANIMÉES
// ═══════════════════════════════════════════════════════════════

function createParticles() {
    const container = document.getElementById('particlesContainer');
    if (!container) return;
    
    for (let i = 0; i < 50; i++) {
        const particle = document.createElement('div');
        particle.className = 'animated-particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 20 + 's';
        particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
        container.appendChild(particle);
    }
}

// ═══════════════════════════════════════════════════════════════
// 🔌 CONNEXION SOCKET.IO
// ═══════════════════════════════════════════════════════════════

function initSocket() {
    socket = io(API_URL);

    socket.on('connect', () => {
        console.log('🟢 Connecté au serveur WebSocket');
        showNotification('✨ Connexion temps réel activée !', 'success');
        updateConnectionStatus(true);
    });

    socket.on('disconnect', () => {
        console.log('🔴 Déconnecté du serveur WebSocket');
        showNotification('⚠️ Connexion temps réel perdue', 'warning');
        updateConnectionStatus(false);
    });

    socket.on('reactionAdded', (data) => {
        handleRealtimeReaction(data, 'added');
        addToActivityTimeline(data, 'added');
    });

    socket.on('reactionRemoved', (data) => {
        handleRealtimeReaction(data, 'removed');
        addToActivityTimeline(data, 'removed');
    });

    socket.on('operationCreated', (data) => {
        showNotification(`📋 Nouvelle opération créée : ${data.heure}`, 'info');
        loadOperations();
        updateDashboardStats();
        addToActivityTimeline(data, 'created');
    });

    socket.on('operationDeleted', (data) => {
        showNotification('🗑️ Opération supprimée', 'info');
        loadOperations();
        updateDashboardStats();
    });
}

function updateConnectionStatus(connected) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    if (statusDot && statusText) {
        statusDot.style.background = connected ? 'var(--success)' : 'var(--danger)';
        statusText.textContent = connected ? 'Connecté' : 'Déconnecté';
    }
}

// ═══════════════════════════════════════════════════════════════
// 🔄 GESTION DES RÉACTIONS EN TEMPS RÉEL
// ═══════════════════════════════════════════════════════════════

function handleRealtimeReaction(data, action) {
    const { messageId, username, emoji, stats } = data;
    updateOperationStatsInList(messageId, stats);

    const emojiLabels = {
        '✅': 'Présent',
        '❌': 'Absent',
        '⏰': 'En retard'
    };

    const actionText = action === 'added' ? 'a réagi' : 'a retiré sa réaction';
    const label = emojiLabels[emoji] || emoji;
    
    showRealtimeNotification(`${emoji} ${username} ${actionText} : ${label}`, action === 'added' ? 'success' : 'info');

    const modal = document.getElementById('operationModal');
    if (modal.style.display === 'block') {
        const currentMessageId = modal.dataset.currentMessageId;
        if (currentMessageId === messageId) {
            viewOperation(messageId, true);
        }
    }
    
    updateDashboardStats();
}

function updateOperationStatsInList(messageId, stats) {
    const operationCard = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!operationCard) return;

    const presentStat = operationCard.querySelector('.stat-present .number');
    const absentStat = operationCard.querySelector('.stat-absent .number');
    const retardStat = operationCard.querySelector('.stat-retard .number');
    const totalStat = operationCard.querySelector('.stat-total');

    if (presentStat) animateNumber(presentStat, stats.present, '#00ff94');
    if (absentStat) animateNumber(absentStat, stats.absent, '#ff0051');
    if (retardStat) animateNumber(retardStat, stats.retard, '#ffb800');
    if (totalStat) totalStat.innerHTML = `<strong>${stats.total}</strong> réponse(s) au total`;
}

function animateNumber(element, newValue, color) {
    const oldValue = parseInt(element.textContent) || 0;
    
    if (oldValue !== newValue) {
        element.style.transform = 'scale(1.3)';
        element.style.color = color;
        
        setTimeout(() => {
            element.textContent = newValue;
            setTimeout(() => {
                element.style.transform = 'scale(1)';
                element.style.color = '';
            }, 300);
        }, 150);
    }
}

function showRealtimeNotification(message, type) {
    const container = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type} realtime-notification`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-bell',
        warning: 'fa-exclamation-triangle'
    };
    
    notification.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span>${message}</span>
        <div class="notification-progress"></div>
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'notificationSlide 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ═══════════════════════════════════════════════════════════════
// 🚀 INITIALISATION
// ═══════════════════════════════════════════════════════════════

async function init() {
    initSocket();
    initLogsRealtime();
    
    await loadBotInfo();
    await loadChannels();
    await loadOperations();
    await loadStats();
    await loadLogs('15h');
    await loadLogs('21h');
    
    // Initialiser le dashboard
    initDashboard();
    initCalendar();
    
    // Actualisation périodique
    setInterval(() => {
        loadStats();
        updateDashboardStats();
    }, 60000); // Toutes les minutes
}

// ═══════════════════════════════════════════════════════════════
// 📊 DASHBOARD
// ═══════════════════════════════════════════════════════════════

function initDashboard() {
    createKPICharts();
    createMainActivityChart();
    createResponsePieChart();
    updateDashboardStats();
}

function createKPICharts() {
    // Mini graphiques pour les KPIs
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { display: false } }
    };

    // Graphique Opérations
    charts.opsChart = new Chart(document.getElementById('opsChart'), {
        type: 'line',
        data: {
            labels: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
            datasets: [{
                data: [3, 5, 4, 7, 6, 8, 5],
                borderColor: '#00D9FF',
                backgroundColor: 'rgba(0, 217, 255, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: chartOptions
    });

    // Graphique Participation
    charts.participationChart = new Chart(document.getElementById('participationChart'), {
        type: 'line',
        data: {
            labels: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
            datasets: [{
                data: [85, 88, 92, 90, 95, 93, 97],
                borderColor: '#00FF94',
                backgroundColor: 'rgba(0, 255, 148, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: chartOptions
    });

    // Graphique Membres
    charts.membersChart = new Chart(document.getElementById('membersChart'), {
        type: 'line',
        data: {
            labels: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
            datasets: [{
                data: [45, 47, 46, 48, 50, 49, 50],
                borderColor: '#FF4FC3',
                backgroundColor: 'rgba(255, 79, 195, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: chartOptions
    });

    // Graphique Temps de réponse
    charts.responseChart = new Chart(document.getElementById('responseChart'), {
        type: 'line',
        data: {
            labels: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
            datasets: [{
                data: [3.2, 2.8, 2.5, 2.7, 2.3, 2.1, 2.5],
                borderColor: '#FFB800',
                backgroundColor: 'rgba(255, 184, 0, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: chartOptions
    });
}

function createMainActivityChart() {
    const ctx = document.getElementById('mainActivityChart');
    if (!ctx) return;

    charts.mainActivity = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
            datasets: [
                {
                    label: 'Présents',
                    data: [12, 15, 18, 14, 20, 16, 19],
                    borderColor: '#00FF94',
                    backgroundColor: 'rgba(0, 255, 148, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Absents',
                    data: [3, 2, 4, 3, 2, 5, 3],
                    borderColor: '#FF0051',
                    backgroundColor: 'rgba(255, 0, 81, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'En retard',
                    data: [2, 3, 1, 2, 1, 2, 2],
                    borderColor: '#FFB800',
                    backgroundColor: 'rgba(255, 184, 0, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: '#fff', padding: 20 }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#fff' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#fff' }
                }
            }
        }
    });
}

function createResponsePieChart() {
    const ctx = document.getElementById('responsePieChart');
    if (!ctx) return;

    charts.responsePie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Présents', 'Absents', 'En retard', 'Sans réponse'],
            datasets: [{
                data: [65, 15, 10, 10],
                backgroundColor: ['#00FF94', '#FF0051', '#FFB800', '#666'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#fff', padding: 15 }
                }
            }
        }
    });
}

async function updateDashboardStats() {
    try {
        const { data: operations } = await apiCall('/operations');
        const { data: info } = await apiCall('/info');
        
        // Mettre à jour les KPIs
        document.getElementById('kpiTotalOps').textContent = operations.length;
        document.getElementById('headerOpsCount').textContent = operations.length;
        document.getElementById('headerMembersCount').textContent = info.guild.memberCount;
        
        // Calculer le taux de participation
        let totalResponses = 0;
        let totalExpected = 0;
        operations.forEach(op => {
            totalResponses += op.stats.total;
            totalExpected += info.guild.memberCount;
        });
        const participationRate = totalExpected > 0 ? Math.round((totalResponses / totalExpected) * 100) : 0;
        document.getElementById('kpiParticipation').textContent = participationRate + '%';
        document.getElementById('headerResponseRate').textContent = participationRate + '%';
        
        // Mettre à jour le badge de navigation
        document.getElementById('navOpsBadge').textContent = operations.length;
        
    } catch (error) {
        console.error('Erreur mise à jour stats dashboard:', error);
    }
}

function refreshDashboard() {
    showNotification('Actualisation du dashboard...', 'info');
    updateDashboardStats();
    updateAllCharts();
    showNotification('✅ Dashboard actualisé', 'success');
}

function updateAllCharts() {
    Object.values(charts).forEach(chart => {
        if (chart) chart.update();
    });
}

// ═══════════════════════════════════════════════════════════════
// 📅 CALENDRIER
// ═══════════════════════════════════════════════════════════════

function initCalendar() {
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    // Mettre à jour le titre
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    document.getElementById('currentMonth').textContent = `${monthNames[month]} ${year}`;
    
    // Premier jour du mois
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let html = '';
    
    // Jours de la semaine
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    dayNames.forEach(day => {
        html += `<div class="calendar-day-name">${day}</div>`;
    });
    
    // Espaces vides avant le premier jour
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="calendar-day empty"></div>`;
    }
    
    // Jours du mois
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        const hasOperation = Math.random() > 0.7; // Simulé pour l'exemple
        
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${hasOperation ? 'has-operation' : ''}">
                <span class="day-number">${day}</span>
                ${hasOperation ? '<div class="operation-indicator"></div>' : ''}
            </div>
        `;
    }
    
    grid.innerHTML = html;
}

function previousMonth() {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderCalendar();
}

// ═══════════════════════════════════════════════════════════════
// 📡 APPELS API
// ═══════════════════════════════════════════════════════════════

async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_URL}/api${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY,
                ...options.headers
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Erreur API');
        }
        
        return data;
    } catch (error) {
        console.error('Erreur API:', error);
        showNotification(error.message, 'error');
        throw error;
    }
}

// ═══════════════════════════════════════════════════════════════
// 📊 CHARGEMENT DES DONNÉES
// ═══════════════════════════════════════════════════════════════

async function loadBotInfo() {
    try {
        const { data } = await apiCall('/info');
        document.getElementById('botStatus').innerHTML = `
            <span class="status-dot"></span>
            <div class="status-info">
                <span class="status-label">Bot Status</span>
                <span class="status-text">${data.bot.username}</span>
            </div>
        `;
    } catch (error) {
        console.error('Erreur chargement info bot:', error);
    }
}

async function loadChannels() {
    try {
        const { data } = await apiCall('/channels');
        const select = document.getElementById('channelSelect');
        
        select.innerHTML = '<option value="">-- Sélectionner un canal --</option>';
        
        let currentCategory = '';
        data.forEach(channel => {
            if (channel.category !== currentCategory) {
                currentCategory = channel.category;
                const optgroup = document.createElement('optgroup');
                optgroup.label = currentCategory;
                select.appendChild(optgroup);
            }
            
            const option = document.createElement('option');
            option.value = channel.id;
            option.textContent = `# ${channel.name}`;
            select.lastElementChild.appendChild(option);
        });
    } catch (error) {
        console.error('Erreur chargement canaux:', error);
    }
}

async function loadOperations() {
    try {
        const { data } = await apiCall('/operations');
        const container = document.getElementById('operationsList');
        
        if (data.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-secondary);">
                    <i class="fas fa-inbox" style="font-size: 60px; margin-bottom: 20px; display: block;"></i>
                    <h3>Aucune opération active</h3>
                    <p>Créez une nouvelle opération pour commencer</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = data.map(op => `
            <div class="operation-card" data-message-id="${op.messageId}" data-heure="${op.heure}">
                <div class="operation-header">
                    <div>
                        <div class="operation-time">${op.heure}</div>
                        <div class="operation-date">${op.date}</div>
                    </div>
                    <div style="text-align: right; color: var(--text-secondary); font-size: 12px;">
                        <i class="fas fa-hashtag"></i> ${op.channelName}
                    </div>
                </div>
                
                <div class="operation-stats">
                    <div class="stat-item stat-present">
                        <span class="number" style="color: var(--success);">${op.stats.present}</span>
                        <span class="label">✅ Présents</span>
                    </div>
                    <div class="stat-item stat-retard">
                        <span class="number" style="color: var(--warning);">${op.stats.retard}</span>
                        <span class="label">⏰ Retards</span>
                    </div>
                    <div class="stat-item stat-absent">
                        <span class="number" style="color: var(--danger);">${op.stats.absent}</span>
                        <span class="label">❌ Absents</span>
                    </div>
                </div>
                
                <div class="stat-total" style="text-align: center; margin: 10px 0; padding: 10px; background: var(--dark); border-radius: 8px;">
                    <strong>${op.stats.total}</strong> réponse(s) au total
                </div>
                
                <div class="operation-actions">
                    <button class="btn-primary" onclick="viewOperation('${op.messageId}')">
                        <i class="fas fa-eye"></i> Détails
                    </button>
                    <button class="btn-primary" onclick="sendReminder('${op.messageId}')">
                        <i class="fas fa-bell"></i> Rappel
                    </button>
                    <button class="btn-danger" onclick="deleteOperation('${op.messageId}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                
                <a href="${op.messageUrl}" target="_blank" style="display: block; text-align: center; margin-top: 10px; color: var(--secondary); text-decoration: none; font-size: 12px;">
                    <i class="fas fa-external-link-alt"></i> Voir sur Discord
                </a>
            </div>
        `).join('');
    } catch (error) {
        console.error('Erreur chargement opérations:', error);
    }
}

async function loadStats() {
    try {
        const { data } = await apiCall('/info');
        
        document.getElementById('statTotalOps').textContent = data.stats.activeOperations;
        document.getElementById('statMembers').textContent = data.guild.memberCount;
        
        const hours = Math.floor(data.stats.uptime / 3600);
        const minutes = Math.floor((data.stats.uptime % 3600) / 60);
        document.getElementById('statUptime').textContent = `${hours}h ${minutes}m`;
        
        document.getElementById('serverInfo').innerHTML = `
            <div style="display: flex; align-items: center; gap: 20px;">
                ${data.guild.icon ? `<img src="${data.guild.icon}" style="width: 80px; height: 80px; border-radius: 50%;">` : ''}
                <div>
                    <h3>${data.guild.name}</h3>
                    <p style="color: var(--text-secondary);">ID: ${data.guild.id}</p>
                    <p style="color: var(--text-secondary);">Membres: ${data.guild.memberCount}</p>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Erreur chargement stats:', error);
    }
}

// ═══════════════════════════════════════════════════════════════
// 🔍 RECHERCHE ET FILTRES
// ═══════════════════════════════════════════════════════════════

function filterOperations() {
    const searchValue = document.getElementById('searchOperations')?.value.toLowerCase() || '';
    const filterValue = document.getElementById('filterOperations')?.value || 'all';
    
    const cards = document.querySelectorAll('.operation-card');
    
    cards.forEach(card => {
        const heure = card.dataset.heure || '';
        const text = card.textContent.toLowerCase();
        
        const matchesSearch = text.includes(searchValue);
        const matchesFilter = filterValue === 'all' || 
                             (filterValue === '15h' && heure.startsWith('15')) ||
                             (filterValue === '21h' && heure.startsWith('21'));
        
        card.style.display = matchesSearch && matchesFilter ? 'block' : 'none';
    });
}

// ═══════════════════════════════════════════════════════════════
// 📋 SYSTÈME DE LOGS
// ═══════════════════════════════════════════════════════════════

async function loadLogs(category) {
    try {
        const { data } = await apiCall(`/logs/${category}`);
        displayLogs(category, data);
    } catch (error) {
        console.error(`Erreur chargement logs ${category}:`, error);
        showNotification(`Erreur lors du chargement des logs ${category}`, 'error');
    }
}

function displayLogs(category, logs) {
    const container = document.getElementById(`logs${category}Container`);
    const countEl = document.getElementById(`logs${category}Count`);
    const addedEl = document.getElementById(`logs${category}Added`);
    const removedEl = document.getElementById(`logs${category}Removed`);

    const stats = {
        total: logs.length,
        added: logs.filter(l => l.type === 'REACTION_ADDED').length,
        removed: logs.filter(l => l.type === 'REACTION_REMOVED').length
    };

    countEl.textContent = stats.total;
    addedEl.textContent = stats.added;
    removedEl.textContent = stats.removed;

    if (logs.length === 0) {
        container.innerHTML = `
            <div class="logs-empty">
                <i class="fas fa-inbox"></i>
                <h3>Aucun log disponible</h3>
                <p>Les actions seront enregistrées ici</p>
            </div>
        `;
        return;
    }

    container.innerHTML = logs.map(log => createLogItem(log)).join('');
}

function createLogItem(log) {
    const date = new Date(log.timestamp);
    const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    let icon, badge, description, typeClass;

    switch (log.type) {
        case 'REACTION_ADDED':
            icon = log.user.avatar 
                ? `<img src="${log.user.avatar}" alt="${log.user.username}">`
                : `<i class="fas fa-user"></i>`;
            badge = '<span class="log-badge badge-added">Réaction ajoutée</span>';
            description = `<strong>${log.user.username}</strong> a réagi avec <strong>${log.reaction.label}</strong>`;
            typeClass = 'log-added icon-added';
            break;

        case 'REACTION_REMOVED':
            icon = log.user.avatar 
                ? `<img src="${log.user.avatar}" alt="${log.user.username}">`
                : `<i class="fas fa-user"></i>`;
            badge = '<span class="log-badge badge-removed">Réaction retirée</span>';
            description = `<strong>${log.user.username}</strong> a retiré sa réaction <strong>${log.reaction.label}</strong>`;
            typeClass = 'log-removed icon-removed';
            break;

        case 'OPERATION_CREATED':
            icon = `<i class="fas fa-plus-circle"></i>`;
            badge = '<span class="log-badge badge-created">Opération créée</span>';
            description = `Nouvelle opération créée dans <strong>#${log.channel?.name || 'canal'}</strong>`;
            typeClass = 'log-created icon-created';
            break;

        default:
            icon = `<i class="fas fa-info-circle"></i>`;
            badge = '<span class="log-badge">Action</span>';
            description = 'Action inconnue';
            typeClass = '';
    }

    const emoji = log.reaction?.emoji || '';
    const emojiHtml = emoji ? `<div class="log-emoji">${emoji}</div>` : '';

    return `
        <div class="log-item ${typeClass}">
            <div class="log-icon ${typeClass}">
                ${icon}
                ${emojiHtml}
            </div>
            <div class="log-content">
                <div class="log-header">
                    <span class="log-user">${log.user.username}</span>
                    ${badge}
                </div>
                <div class="log-description">${description}</div>
                <div class="log-operation">
                    <span><i class="fas fa-calendar"></i> ${log.operation.date}</span>
                    <span><i class="fas fa-clock"></i> ${log.operation.heure}</span>
                </div>
            </div>
            <div class="log-meta">
                <div class="log-time">${timeStr}</div>
                <div class="log-date">${dateStr}</div>
            </div>
        </div>
    `;
}

async function clearLogs(category) {
    if (!confirm(`Êtes-vous sûr de vouloir effacer tous les logs ${category} ?`)) return;

    try {
        await apiCall(`/logs/${category}`, { method: 'DELETE' });
        showNotification(`✅ Logs ${category} effacés`, 'success');
        loadLogs(category);
    } catch (error) {
        showNotification('Erreur lors de la suppression des logs', 'error');
    }
}

function initLogsRealtime() {
    if (!socket) return;

    socket.on('newLog', (data) => {
        const { log, category } = data;
        const section = document.getElementById(`logs${category}Section`);
        if (section && section.classList.contains('active')) {
            addLogToContainer(category, log);
        }
        updateLogStats(category);
    });

    socket.on('logsCleaned', (data) => {
        const { category } = data;
        const section = document.getElementById(`logs${category}Section`);
        if (section && section.classList.contains('active')) {
            loadLogs(category);
        }
    });
}

function addLogToContainer(category, log) {
    const container = document.getElementById(`logs${category}Container`);
    const emptyMsg = container.querySelector('.logs-empty');
    if (emptyMsg) emptyMsg.remove();

    const logHtml = createLogItem(log);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = logHtml;
    const logElement = tempDiv.firstElementChild;
    
    logElement.classList.add('new-log');
    container.insertBefore(logElement, container.firstChild);

    const allLogs = container.querySelectorAll('.log-item');
    if (allLogs.length > 100) {
        allLogs[allLogs.length - 1].remove();
    }

    updateLogStats(category);
}

function updateLogStats(category) {
    const container = document.getElementById(`logs${category}Container`);
    const logs = container.querySelectorAll('.log-item');
    
    const stats = {
        total: logs.length,
        added: container.querySelectorAll('.log-added').length,
        removed: container.querySelectorAll('.log-removed').length
    };

    const countEl = document.getElementById(`logs${category}Count`);
    const addedEl = document.getElementById(`logs${category}Added`);
    const removedEl = document.getElementById(`logs${category}Removed`);

    if (countEl) animateNumber(countEl, stats.total, 'var(--primary)');
    if (addedEl) animateNumber(addedEl, stats.added, 'var(--success)');
    if (removedEl) animateNumber(removedEl, stats.removed, 'var(--danger)');
}

// ═══════════════════════════════════════════════════════════════
// ⚡ TIMELINE D'ACTIVITÉ
// ═══════════════════════════════════════════════════════════════

function addToActivityTimeline(data, type) {
    const timeline = document.getElementById('recentActivity');
    if (!timeline) return;
    
    const now = new Date();
    const timeStr = 'Il y a quelques secondes';
    
    let message = '';
    let dotClass = 'info';
    
    if (type === 'added') {
        message = `<strong>${data.username}</strong> a réagi ${data.emoji}`;
        dotClass = 'success';
    } else if (type === 'removed') {
        message = `<strong>${data.username}</strong> a retiré sa réaction ${data.emoji}`;
        dotClass = 'warning';
    } else if (type === 'created') {
        message = `Nouvelle opération créée pour <strong>${data.heure}</strong>`;
        dotClass = 'info';
    }
    
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
        <div class="timeline-dot ${dotClass}"></div>
        <div class="timeline-content">
            <span class="timeline-time">${timeStr}</span>
            <p>${message}</p>
        </div>
    `;
    
    timeline.insertBefore(item, timeline.firstChild);
    
    // Garder seulement les 10 derniers
    const items = timeline.querySelectorAll('.timeline-item');
    if (items.length > 10) {
        items[items.length - 1].remove();
    }
}

// ═══════════════════════════════════════════════════════════════
// 🔔 PANNEAU DE NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

function toggleNotificationsPanel() {
    const panel = document.getElementById('notificationsPanel');
    panel.classList.toggle('open');
}

// ═══════════════════════════════════════════════════════════════
// 💾 EXPORT DE DONNÉES
// ═══════════════════════════════════════════════════════════════

async function exportData(format = 'json') {
    try {
        showNotification('Préparation de l\'export...', 'info');
        
        const { data: operations } = await apiCall('/operations');
        const { data: info } = await apiCall('/info');
        
        const exportData = {
            exportDate: new Date().toISOString(),
            server: info.guild,
            operations: operations,
            stats: info.stats
        };
        
        if (format === 'json') {
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            downloadFile(blob, `rasca-export-${Date.now()}.json`);
        } else if (format === 'csv') {
            // Conversion simple en CSV
            let csv = 'Date,Heure,Canal,Présents,Absents,Retards,Total\n';
            operations.forEach(op => {
                csv += `${op.date},${op.heure},${op.channelName},${op.stats.present},${op.stats.absent},${op.stats.retard},${op.stats.total}\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            downloadFile(blob, `rasca-export-${Date.now()}.csv`);
        }
        
        showNotification('✅ Export réussi !', 'success');
    } catch (error) {
        showNotification('Erreur lors de l\'export', 'error');
    }
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════
// ✨ ACTIONS
// ═══════════════════════════════════════════════════════════════

function handleHeureChange() {
    const select = document.getElementById('heureSelect');
    const customGroup = document.getElementById('customHeureGroup');
    customGroup.style.display = select.value === 'custom' ? 'block' : 'none';
}

async function createOperation() {
    try {
        const channelId = document.getElementById('channelSelect').value;
        const dateSelect = document.getElementById('dateSelect').value;
        const heureSelect = document.getElementById('heureSelect').value;
        
        if (!channelId) {
            showNotification('Veuillez sélectionner un canal', 'error');
            return;
        }
        
        let heure = heureSelect;
        if (heureSelect === 'custom') {
            heure = document.getElementById('customHeure').value;
            if (!/^\d{1,2}:\d{2}$/.test(heure)) {
                showNotification('Format d\'heure invalide (HH:MM)', 'error');
                return;
            }
        }
        
        const date = dateSelect === 'today' ? getDateString(0) : getDateString(1);
        
        showNotification('Création de l\'opération...', 'info');
        
        await apiCall('/operation/create', {
            method: 'POST',
            body: JSON.stringify({ channelId, date, heure })
        });
        
        showNotification('✅ Opération créée avec succès !', 'success');
        
        document.getElementById('channelSelect').value = '';
        document.getElementById('dateSelect').value = 'today';
        document.getElementById('heureSelect').value = '15:00';
        document.getElementById('customHeure').value = '';
        document.getElementById('customHeureGroup').style.display = 'none';
        
        await loadOperations();
        showSection('operations');
        
    } catch (error) {
        showNotification('Erreur lors de la création', 'error');
    }
}

async function viewOperation(messageId, silent = false) {
    try {
        const { data } = await apiCall(`/operation/${messageId}`);
        
        const modal = document.getElementById('operationModal');
        const details = document.getElementById('operationDetails');
        
        modal.dataset.currentMessageId = messageId;
        
        details.innerHTML = `
            <div style="margin-bottom: 30px;">
                <h3 style="margin-bottom: 15px;">
                    <i class="fas fa-calendar"></i> ${data.date} à ${data.heure}
                </h3>
                <p style="color: var(--text-secondary);">
                    <i class="fas fa-hashtag"></i> ${data.channelName}
                </p>
            </div>
            
            <div class="stats-grid" style="margin-bottom: 30px;">
                <div class="stat-card">
                    <div class="stat-icon" style="background: var(--success);">
                        <i class="fas fa-check"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${data.stats.present}</h3>
                        <p>Présents</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background: var(--warning);">
                        <i class="fas fa-clock"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${data.stats.retard}</h3>
                        <p>En retard</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background: var(--danger);">
                        <i class="fas fa-times"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${data.stats.absent}</h3>
                        <p>Absents</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background: var(--text-secondary);">
                        <i class="fas fa-question"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${data.stats.noResponse}</h3>
                        <p>Sans réponse</p>
                    </div>
                </div>
            </div>
            
            ${createUserSection('✅ Présents', data.users.present, 'success')}
            ${createUserSection('⏰ En retard', data.users.retard, 'warning')}
            ${createUserSection('❌ Absents', data.users.absent, 'danger')}
            ${createUserSection('❓ Sans réponse', data.users.noResponse, 'secondary')}
            
            <div style="margin-top: 20px; text-align: center;">
                <a href="${data.messageUrl}" target="_blank" class="btn-primary">
                    <i class="fas fa-external-link-alt"></i> Voir sur Discord
                </a>
            </div>
        `;
        
        if (!silent) {
            modal.style.display = 'block';
        }
        
    } catch (error) {
        showNotification('Erreur lors du chargement des détails', 'error');
    }
}

function createUserSection(title, users, type) {
    if (users.length === 0) return '';
    
    const colors = {
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        secondary: 'var(--text-secondary)'
    };
    
    return `
        <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 15px; color: ${colors[type]};">${title} (${users.length})</h4>
            <div class="user-list">
                ${users.map(user => `
                    <div class="user-item">
                        <img src="${user.avatar}" class="user-avatar" alt="${user.username}">
                        <div>
                            <strong>${user.displayName}</strong>
                            <div style="color: var(--text-secondary); font-size: 12px;">@${user.username}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

async function sendReminder(messageId) {
    if (!confirm('Envoyer un rappel à tous ceux qui n\'ont pas réagi ?')) return;
    
    try {
        showNotification('Envoi des rappels...', 'info');
        
        const { data } = await apiCall(`/operation/${messageId}/reminder`, {
            method: 'POST'
        });
        
        showNotification(
            `✅ Rappels envoyés : ${data.sent} réussis, ${data.failed} échecs`,
            data.failed > 0 ? 'warning' : 'success'
        );
    } catch (error) {
        showNotification('Erreur lors de l\'envoi des rappels', 'error');
    }
}

async function deleteOperation(messageId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette opération ?')) return;
    
    try {
        await apiCall(`/operation/${messageId}`, { method: 'DELETE' });
        showNotification('✅ Opération supprimée', 'success');
    } catch (error) {
        showNotification('Erreur lors de la suppression', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
// 🎨 INTERFACE
// ═══════════════════════════════════════════════════════════════

function showSection(sectionName) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.getElementById(`${sectionName}Section`).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    event.currentTarget.classList.add('active');
}

function closeModal() {
    const modal = document.getElementById('operationModal');
    modal.style.display = 'none';
    modal.dataset.currentMessageId = '';
}

window.onclick = function(event) {
    const modal = document.getElementById('operationModal');
    const backdrop = modal.querySelector('.modal-backdrop');
    if (event.target === backdrop) {
        closeModal();
    }
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    };
    
    notification.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'notificationSlide 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

function getDateString(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const jour = date.getDate().toString().padStart(2, '0');
    const mois = (date.getMonth() + 1).toString().padStart(2, '0');
    const annee = date.getFullYear();
    return `${jour}/${mois}/${annee}`;
}