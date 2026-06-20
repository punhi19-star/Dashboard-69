// ==========================================================================
// APP.JS - SCHOOL OF EDUCATION PROJECT TRACKING DASHBOARD
// ==========================================================================

// Global state variables
let allProjects = [];
let filteredProjects = [];
let workgroups = [];
let owners = [];

// Chart instances
let charts = {
    budgetSpent: null,
    workgroupBudget: null,
    projectProgress: null,
    ownerProjects: null
};

// Sorting state
let sortState = {
    column: 'name',
    direction: 'asc' // 'asc' or 'desc'
};

// Google Sheet Gviz JSON Link (supports CORS)
const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1D2qKUiDIZ-qfbegZzM6-fKPNBjy56Ch4ZYUUZE4qIXo/gviz/tq?tqx=out:json";

// ==========================================================================
// INITIALIZATION
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupEventListeners();
    fetchData();
});

// ==========================================================================
// THEME MANAGEMENT (Light / Dark Mode)
// ==========================================================================

function initTheme() {
    const savedTheme = localStorage.getItem('dashboard-theme') || 'dark-theme';
    document.body.className = savedTheme;
    updateThemeToggleUI();
}

function toggleTheme() {
    if (document.body.classList.contains('dark-theme')) {
        document.body.classList.replace('dark-theme', 'light-theme');
        localStorage.setItem('dashboard-theme', 'light-theme');
    } else {
        document.body.classList.replace('light-theme', 'dark-theme');
        localStorage.setItem('dashboard-theme', 'dark-theme');
    }
    updateThemeToggleUI();
    
    // Re-render charts with new theme colors
    if (allProjects.length > 0) {
        renderCharts();
    }
}

function updateThemeToggleUI() {
    // Theme toggled state is represented by classes on the body, 
    // which css uses to slide icons, but we can also perform custom updates if needed.
}

// Get chart grid & text colors based on current active theme
function getThemeChartColors() {
    const isDark = document.body.classList.contains('dark-theme');
    return {
        text: isDark ? '#94a3b8' : '#64748b',
        grid: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        tooltipBg: isDark ? '#1e293b' : '#ffffff',
        tooltipText: isDark ? '#f8fafc' : '#0f172a',
        tooltipBorder: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
    };
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================

function setupEventListeners() {
    // Theme Toggle Button
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    
    // Manual Refresh Button
    document.getElementById('btn-refresh').addEventListener('click', () => {
        const refreshIcon = document.getElementById('refresh-icon');
        refreshIcon.classList.add('icon-spin');
        fetchData().finally(() => {
            setTimeout(() => {
                refreshIcon.classList.remove('icon-spin');
            }, 600);
        });
    });

    // Reset Filters Button
    document.getElementById('btn-reset-filters').addEventListener('click', resetFilters);

    // Live Search input
    const searchInput = document.getElementById('filter-search');
    const clearSearch = document.getElementById('clear-search');
    
    searchInput.addEventListener('input', () => {
        if (searchInput.value.trim() !== '') {
            clearSearch.style.display = 'block';
        } else {
            clearSearch.style.display = 'none';
        }
        applyFilters();
    });

    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        clearSearch.style.display = 'none';
        applyFilters();
    });

    // Dropdown filters
    document.getElementById('filter-workgroup').addEventListener('change', applyFilters);
    document.getElementById('filter-owner').addEventListener('change', applyFilters);
    document.getElementById('filter-status').addEventListener('change', applyFilters);

    // Table sorting
    const headers = document.querySelectorAll('#projects-table th.sortable');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-sort');
            handleSort(column);
            
            // Update sort icon UI
            headers.forEach(h => {
                const icon = h.querySelector('i');
                icon.className = 'fa-solid fa-sort';
            });
            const activeIcon = header.querySelector('i');
            activeIcon.className = sortState.direction === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
        });
    });

    // Modal Close
    document.getElementById('modal-close-btn').addEventListener('click', hideModal);
    document.getElementById('modal-close-action').addEventListener('click', hideModal);
    document.getElementById('details-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('details-modal')) {
            hideModal();
        }
    });
    
    // ESC key close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideModal();
        }
    });
}

// ==========================================================================
// DATA FETCHING & PARSING
// ==========================================================================

let currentScriptTag = null;

// Setup global callback for Google Visualization API JSONP response
window.google = window.google || {};
window.google.visualization = window.google.visualization || {};
window.google.visualization.Query = window.google.visualization.Query || {};
window.google.visualization.Query.setResponse = function(data) {
    if (data.status === 'error') {
        const errorMsg = data.errors && data.errors[0] ? data.errors[0].detailed_message : "ดึงข้อมูลจาก Google Sheets ไม่สำเร็จ";
        handleFetchError(new Error(errorMsg));
        return;
    }
    
    try {
        processGvizData(data);
        updateLoadingStatus(false);
        
        // Save current timestamp
        const now = new Date();
        const timeString = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        document.getElementById('last-update').textContent = `อัปเดตล่าสุด: ${timeString} น. (เรียลไทม์)`;
        
        // Remove dynamic script to keep DOM clean
        if (currentScriptTag) {
            currentScriptTag.remove();
            currentScriptTag = null;
        }
    } catch (e) {
        handleFetchError(e);
    }
};

function fetchData() {
    updateLoadingStatus(true);
    
    // Clear any previous script tag
    if (currentScriptTag) {
        currentScriptTag.remove();
    }
    
    // Create new script tag for JSONP fetch (completely bypasses CORS)
    currentScriptTag = document.createElement('script');
    
    // Append cache-buster timestamp
    const fetchUrl = `${GOOGLE_SHEET_URL}&t=${new Date().getTime()}`;
    currentScriptTag.src = fetchUrl;
    
    currentScriptTag.onerror = function() {
        handleFetchError(new Error("เครือข่ายขัดข้อง หรือเบราว์เซอร์บล็อกการโหลดสคริปต์ (CORS/Ad-blocker)"));
    };
    
    document.body.appendChild(currentScriptTag);
}

function handleFetchError(error) {
    console.error("Error loading data:", error);
    document.getElementById('last-update').textContent = `ดึงข้อมูลล้มเหลว: ${error.message}`;
    showErrorInTable(error.message);
    updateLoadingStatus(false);
}

// Parse Google Visualization JSON structure
function processGvizData(data) {
    if (!data.table || !data.table.rows) {
        throw new Error("ไม่พบตารางข้อมูลในผลลัพธ์ของ Google Sheets");
    }
    
    allProjects = [];
    workgroups = new Set();
    owners = new Set();
    
    const rows = data.table.rows;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.c || row.c.length === 0) continue;
        
        // Col A (0): ชื่อโครงการ
        // Col B (1): ผู้รับผิดชอบ
        // Col C (2): กลุ่มงาน
        // Col D (3): งบประมาณ
        // Col E (4): ใช้ไปแล้ว
        // Col F (5): คงเหลือ
        // Col G (6): ความคืบหน้า
        
        const name = row.c[0] && row.c[0].v !== null ? String(row.c[0].v).trim() : '';
        // Skip header row if returned, and empty name rows
        if (name === "ชื่อโครงการ" || !name) continue;
        
        const owner = row.c[1] && row.c[1].v !== null ? String(row.c[1].v).trim() : '';
        const workgroup = row.c[2] && row.c[2].v !== null ? String(row.c[2].v).trim() : '';
        
        const budget = row.c[3] && row.c[3].v !== null ? parseFloat(row.c[3].v) : 0;
        const spent = row.c[4] && row.c[4].v !== null ? parseFloat(row.c[4].v) : 0;
        
        // Calculate remaining if not explicitly provided, or read it
        const remaining = row.c[5] && row.c[5].v !== null ? parseFloat(row.c[5].v) : (budget - spent);
        const progress = row.c[6] && row.c[6].v !== null ? parseFloat(row.c[6].v) : 0;
        
        if (workgroup) workgroups.add(workgroup);
        if (owner) owners.add(owner);
        
        allProjects.push({
            name,
            owner,
            workgroup,
            budget,
            spent,
            remaining,
            progress
        });
    }
    
    // Sort projects initially by name
    allProjects.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    
    // Populate dropdown options
    populateFilterDropdowns();
    
    // Apply filters and render UI
    applyFilters();
}


function updateLoadingStatus(isLoading) {
    const tableBody = document.getElementById('table-body');
    if (isLoading) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-4">
                    <div class="loading-spinner">
                        <i class="fa-solid fa-spinner fa-spin"></i> กำลังซิงก์ข้อมูลจาก Google Sheets แบบสด...
                    </div>
                </td>
            </tr>
        `;
    }
}

function showErrorInTable(message) {
    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = `
        <tr>
            <td colspan="9" class="text-center py-4 text-red">
                <i class="fa-solid fa-triangle-exclamation"></i> <strong>เกิดข้อผิดพลาดในการโหลดข้อมูล:</strong> ${message}<br>
                <small>โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต หรือตรวจสอบการแชร์ Google Sheets</small>
            </td>
        </tr>
    `;
}

// ==========================================================================
// FILTERS & SEARCH SYSTEM
// ==========================================================================

function populateFilterDropdowns() {
    const workgroupSelect = document.getElementById('filter-workgroup');
    const ownerSelect = document.getElementById('filter-owner');
    
    // Store current selections to restore if possible
    const currentWg = workgroupSelect.value;
    const currentOwner = ownerSelect.value;
    
    // Clear and add default option
    workgroupSelect.innerHTML = '<option value="">-- แสดงทุกกลุ่มงาน --</option>';
    ownerSelect.innerHTML = '<option value="">-- แสดงผู้รับผิดชอบทั้งหมด --</option>';
    
    // Populate unique sorted lists
    Array.from(workgroups).sort((a, b) => a.localeCompare(b, 'th')).forEach(wg => {
        workgroupSelect.innerHTML += `<option value="${wg}">${wg}</option>`;
    });
    
    Array.from(owners).sort((a, b) => a.localeCompare(b, 'th')).forEach(owner => {
        ownerSelect.innerHTML += `<option value="${owner}">${owner}</option>`;
    });
    
    // Restore selections
    if (workgroups.has(currentWg)) workgroupSelect.value = currentWg;
    if (owners.has(currentOwner)) ownerSelect.value = currentOwner;
}

function applyFilters() {
    const searchVal = document.getElementById('filter-search').value.toLowerCase().trim();
    const workgroupVal = document.getElementById('filter-workgroup').value;
    const ownerVal = document.getElementById('filter-owner').value;
    const statusVal = document.getElementById('filter-status').value;
    
    filteredProjects = allProjects.filter(project => {
        // 1. Search Query filter (matches project name or responsible owner)
        const matchSearch = project.name.toLowerCase().includes(searchVal) || 
                            project.owner.toLowerCase().includes(searchVal);
                            
        // 2. Workgroup filter
        const matchWorkgroup = !workgroupVal || project.workgroup === workgroupVal;
        
        // 3. Responsible person filter
        const matchOwner = !ownerVal || project.owner === ownerVal;
        
        // 4. Status filter
        let matchStatus = true;
        if (statusVal === 'completed') {
            matchStatus = project.progress === 100;
        } else if (statusVal === 'in_progress') {
            matchStatus = project.progress > 0 && project.progress < 100;
        } else if (statusVal === 'not_started') {
            matchStatus = project.progress === 0;
        }
        
        return matchSearch && matchWorkgroup && matchOwner && matchStatus;
    });
    
    // Maintain sorting
    sortData();
    
    // Update dashboard elements
    updateKPIs();
    renderCharts();
    renderTable();
}

function resetFilters() {
    document.getElementById('filter-search').value = '';
    document.getElementById('clear-search').style.display = 'none';
    document.getElementById('filter-workgroup').value = '';
    document.getElementById('filter-owner').value = '';
    document.getElementById('filter-status').value = '';
    
    applyFilters();
}

// ==========================================================================
// CALCULATE & UPDATE KPI CARDS
// ==========================================================================

function updateKPIs() {
    // Total projects
    const totalProjects = filteredProjects.length;
    document.getElementById('kpi-total-projects').textContent = totalProjects;
    
    const activeProjects = filteredProjects.filter(p => p.progress > 0 && p.progress < 100).length;
    const completedProjects = filteredProjects.filter(p => p.progress === 100).length;
    document.getElementById('kpi-project-sub').textContent = `กำลังดำเนินการ ${activeProjects} / สำเร็จ ${completedProjects} โครงการ`;

    // Totals calculations
    let totalBudget = 0;
    let totalSpent = 0;
    let totalRemaining = 0;
    let weightedProgressSum = 0;
    
    filteredProjects.forEach(p => {
        totalBudget += p.budget;
        totalSpent += p.spent;
        totalRemaining += p.remaining;
        weightedProgressSum += (p.progress * p.budget);
    });

    // Formatting numbers
    const formatCurrency = (val) => {
        return new Intl.NumberFormat('th-TH', { style: 'decimal', maximumFractionDigits: 0 }).format(val) + " บาท";
    };

    document.getElementById('kpi-total-budget').textContent = formatCurrency(totalBudget);
    document.getElementById('kpi-spent-budget').textContent = formatCurrency(totalSpent);
    document.getElementById('kpi-remaining-budget').textContent = formatCurrency(totalRemaining);

    // Percentage of usage
    const spentPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    const remainingPercent = totalBudget > 0 ? (totalRemaining / totalBudget) * 100 : 0;

    document.getElementById('kpi-spent-percent').textContent = `คิดเป็น ${spentPercent.toFixed(1)}% ของงบรวม`;
    document.getElementById('kpi-spent-progress-bar').style.width = `${spentPercent}%`;

    document.getElementById('kpi-remaining-percent').textContent = `คิดเป็น ${remainingPercent.toFixed(1)}% ของงบรวม`;
    document.getElementById('kpi-remaining-progress-bar').style.width = `${remainingPercent}%`;

    // Weighted Average Progress
    const avgProgress = totalBudget > 0 ? (weightedProgressSum / totalBudget) : 0;
    document.getElementById('kpi-avg-progress').textContent = `${avgProgress.toFixed(2)}%`;
    document.getElementById('kpi-avg-progress-bar').style.width = `${avgProgress}%`;
    
    // Simple average progress as sub-info
    const simpleAvgProgress = totalProjects > 0 ? (filteredProjects.reduce((sum, p) => sum + p.progress, 0) / totalProjects) : 0;
    document.getElementById('kpi-avg-progress-sub').textContent = `ความคืบหน้าแบบเฉลี่ยตรง: ${simpleAvgProgress.toFixed(1)}%`;
}

// ==========================================================================
// RENDER CHARTS (Chart.js implementation)
// ==========================================================================

function renderCharts() {
    const colors = getThemeChartColors();
    
    // Reset/Destroy existing charts to clean up canvas
    Object.keys(charts).forEach(key => {
        if (charts[key]) {
            charts[key].destroy();
        }
    });

    if (filteredProjects.length === 0) return;

    // --- CHART 1: Budget vs Spent by Project (Bar Chart) ---
    const budgetSpentCtx = document.getElementById('chart-budget-spent').getContext('2d');
    const projectNames = filteredProjects.map(p => p.name.length > 22 ? p.name.substring(0, 20) + '...' : p.name);
    
    charts.budgetSpent = new Chart(budgetSpentCtx, {
        type: 'bar',
        data: {
            labels: projectNames,
            datasets: [
                {
                    label: 'งบประมาณจัดสรร',
                    data: filteredProjects.map(p => p.budget),
                    backgroundColor: 'rgba(249, 115, 22, 0.7)',
                    borderColor: '#f97316',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'ใช้ไปแล้ว',
                    data: filteredProjects.map(p => p.spent),
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: colors.text, font: { family: 'Kanit' } }
                },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipText,
                    bodyColor: colors.tooltipText,
                    borderColor: colors.tooltipBorder,
                    borderWidth: 1,
                    titleFont: { family: 'Kanit' },
                    bodyFont: { family: 'Sarabun' },
                    callbacks: {
                        title: function(context) {
                            return filteredProjects[context[0].dataIndex].name;
                        },
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.raw !== null) {
                                label += new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(context.raw);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: colors.grid },
                    ticks: { color: colors.text, font: { family: 'Kanit', size: 10 } }
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: {
                        color: colors.text,
                        font: { family: 'Kanit' },
                        callback: function(value) {
                            return value >= 1000 ? (value / 1000) + 'k' : value;
                        }
                    }
                }
            }
        }
    });

    // --- CHART 2: Budget Distribution by Workgroup (Doughnut Chart) ---
    const workgroupCtx = document.getElementById('chart-workgroup-budget').getContext('2d');
    
    // Group budgets by workgroup
    const wgBudgetMap = {};
    filteredProjects.forEach(p => {
        wgBudgetMap[p.workgroup] = (wgBudgetMap[p.workgroup] || 0) + p.budget;
    });
    
    const wgLabels = Object.keys(wgBudgetMap);
    const wgData = Object.values(wgBudgetMap);

    charts.workgroupBudget = new Chart(workgroupCtx, {
        type: 'doughnut',
        data: {
            labels: wgLabels,
            datasets: [{
                data: wgData,
                backgroundColor: [
                    'rgba(249, 115, 22, 0.75)', // Orange
                    'rgba(59, 130, 246, 0.75)', // Blue
                    'rgba(16, 185, 129, 0.75)', // Green
                    'rgba(139, 92, 246, 0.75)', // Purple
                    'rgba(236, 72, 153, 0.75)', // Pink
                    'rgba(20, 184, 166, 0.75)'  // Teal
                ],
                borderColor: colors.tooltipBg,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: colors.text, font: { family: 'Kanit', size: 11 } }
                },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipText,
                    bodyColor: colors.tooltipText,
                    borderColor: colors.tooltipBorder,
                    borderWidth: 1,
                    titleFont: { family: 'Kanit' },
                    bodyFont: { family: 'Sarabun' },
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = ((val / total) * 100).toFixed(1);
                            const formattedVal = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(val);
                            return ` ${context.label}: ${formattedVal} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // --- CHART 3: Project Progress (Horizontal Bar Chart) ---
    const progressCtx = document.getElementById('chart-project-progress').getContext('2d');
    
    // Sort projects by progress for progress chart representation
    const sortedForProgress = [...filteredProjects].sort((a, b) => b.progress - a.progress);
    const progressNames = sortedForProgress.map(p => p.name.length > 25 ? p.name.substring(0, 23) + '...' : p.name);

    charts.projectProgress = new Chart(progressCtx, {
        type: 'bar',
        data: {
            labels: progressNames,
            datasets: [{
                label: 'ความคืบหน้า (%)',
                data: sortedForProgress.map(p => p.progress),
                backgroundColor: 'rgba(139, 92, 246, 0.7)', // Purple
                borderColor: '#8b5cf6',
                borderWidth: 1,
                borderRadius: 4,
                barThickness: 16
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipText,
                    bodyColor: colors.tooltipText,
                    borderColor: colors.tooltipBorder,
                    borderWidth: 1,
                    titleFont: { family: 'Kanit' },
                    bodyFont: { family: 'Sarabun' },
                    callbacks: {
                        title: function(context) {
                            return sortedForProgress[context[0].dataIndex].name;
                        },
                        label: function(context) {
                            return `ความคืบหน้า: ${context.raw}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    min: 0,
                    max: 100,
                    grid: { color: colors.grid },
                    ticks: { color: colors.text, font: { family: 'Kanit' } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: colors.text, font: { family: 'Sarabun', size: 10 } }
                }
            }
        }
    });

    // --- CHART 4: Projects by Owner (Doughnut Chart) ---
    const ownerCtx = document.getElementById('chart-owner-projects').getContext('2d');
    
    // Count projects by owner
    const ownerCountMap = {};
    filteredProjects.forEach(p => {
        ownerCountMap[p.owner] = (ownerCountMap[p.owner] || 0) + 1;
    });
    
    const ownerLabels = Object.keys(ownerCountMap);
    const ownerData = Object.values(ownerCountMap);

    charts.ownerProjects = new Chart(ownerCtx, {
        type: 'pie',
        data: {
            labels: ownerLabels,
            datasets: [{
                data: ownerData,
                backgroundColor: [
                    'rgba(59, 130, 246, 0.75)', // Blue
                    'rgba(16, 185, 129, 0.75)', // Green
                    'rgba(249, 115, 22, 0.75)', // Orange
                    'rgba(139, 92, 246, 0.75)', // Purple
                    'rgba(20, 184, 166, 0.75)', // Teal
                    'rgba(239, 68, 68, 0.75)'   // Red
                ],
                borderColor: colors.tooltipBg,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: colors.text, font: { family: 'Kanit', size: 11 } }
                },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipText,
                    bodyColor: colors.tooltipText,
                    borderColor: colors.tooltipBorder,
                    borderWidth: 1,
                    titleFont: { family: 'Kanit' },
                    bodyFont: { family: 'Sarabun' },
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${context.raw} โครงการ`;
                        }
                    }
                }
            }
        }
    });
}

// ==========================================================================
// RENDER TABLE COMPONENT
// ==========================================================================

function renderTable() {
    const tableBody = document.getElementById('table-body');
    const countBadge = document.getElementById('table-count-badge');
    
    countBadge.textContent = `พบ ${filteredProjects.length} รายการ`;
    tableBody.innerHTML = '';

    if (filteredProjects.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-4 text-secondary">
                    <i class="fa-solid fa-folder-open"></i> ไม่พบโครงการตามตัวเลือกการคัดกรอง
                </td>
            </tr>
        `;
        return;
    }

    filteredProjects.forEach((project, index) => {
        const tr = document.createElement('tr');
        
        // Status calculations
        let statusBadge = '';
        if (project.progress === 100) {
            statusBadge = '<span class="badge bg-green text-white">เสร็จสิ้น</span>';
        } else if (project.progress > 0) {
            statusBadge = '<span class="badge bg-orange text-white">กำลังดำเนินการ</span>';
        } else {
            statusBadge = '<span class="badge bg-secondary">ยังไม่เริ่ม</span>';
        }

        // Formatting financials
        const formatNumber = (val) => new Intl.NumberFormat('th-TH').format(val);

        tr.innerHTML = `
            <td><strong>${project.name}</strong></td>
            <td><span class="badge badge-secondary">${project.workgroup}</span></td>
            <td>${project.owner}</td>
            <td class="num-col">${formatNumber(project.budget)}</td>
            <td class="num-col">${project.spent > 0 ? formatNumber(project.spent) : '-'}</td>
            <td class="num-col">${formatNumber(project.remaining)}</td>
            <td>
                <div class="table-progress-container">
                    <div class="table-progress-bg">
                        <div class="table-progress-fill bg-purple" style="width: ${project.progress}%"></div>
                    </div>
                    <span class="table-progress-val">${project.progress}%</span>
                </div>
            </td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-secondary btn-sm btn-action-details" data-index="${index}">
                    <i class="fa-solid fa-eye"></i> รายละเอียด
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    // Dynamic click handler bindings to prevent global namespace pollution
    const detailButtons = tableBody.querySelectorAll('.btn-action-details');
    detailButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const index = btn.getAttribute('data-index');
            showProjectDetails(filteredProjects[index]);
        });
    });
}

// ==========================================================================
// SORTING LOGIC
// ==========================================================================

function handleSort(column) {
    if (sortState.column === column) {
        // Toggle direction
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.column = column;
        sortState.direction = 'asc';
    }
    
    applyFilters();
}

function sortData() {
    const col = sortState.column;
    const dir = sortState.direction;
    
    filteredProjects.sort((a, b) => {
        let valA, valB;
        
        switch (col) {
            case 'name':
                valA = a.name;
                valB = b.name;
                return dir === 'asc' ? valA.localeCompare(valB, 'th') : valB.localeCompare(valA, 'th');
            case 'workgroup':
                valA = a.workgroup;
                valB = b.workgroup;
                return dir === 'asc' ? valA.localeCompare(valB, 'th') : valB.localeCompare(valA, 'th');
            case 'owner':
                valA = a.owner;
                valB = b.owner;
                return dir === 'asc' ? valA.localeCompare(valB, 'th') : valB.localeCompare(valA, 'th');
            case 'budget':
                valA = a.budget;
                valB = b.budget;
                break;
            case 'spent':
                valA = a.spent;
                valB = b.spent;
                break;
            case 'remaining':
                valA = a.remaining;
                valB = b.remaining;
                break;
            case 'progress':
                valA = a.progress;
                valB = b.progress;
                break;
            default:
                return 0;
        }
        
        return dir === 'asc' ? valA - valB : valB - valA;
    });
}

// ==========================================================================
// PROJECT DETAIL MODAL DETAILS
// ==========================================================================

function showProjectDetails(project) {
    const modal = document.getElementById('details-modal');
    
    // Set text values
    document.getElementById('modal-workgroup-badge').textContent = project.workgroup;
    document.getElementById('modal-project-title').textContent = project.name;
    document.getElementById('modal-project-owner').textContent = project.owner;

    const formatCurrencyStr = (val) => {
        return new Intl.NumberFormat('th-TH', { style: 'decimal', maximumFractionDigits: 0 }).format(val) + " บาท";
    };

    document.getElementById('modal-fin-budget').textContent = formatCurrencyStr(project.budget);
    document.getElementById('modal-fin-spent').textContent = formatCurrencyStr(project.spent);
    document.getElementById('modal-fin-remaining').textContent = formatCurrencyStr(project.remaining);

    // spent percentage relative to budget allocation
    const spentPercent = project.budget > 0 ? (project.spent / project.budget) * 100 : 0;
    document.getElementById('modal-fin-percent').textContent = `${spentPercent.toFixed(1)}%`;
    document.getElementById('modal-fin-progress-fill').style.width = `${spentPercent}%`;

    // Radial progress gauge calculations
    // Circumference = 2 * Math.PI * r (For r=40, circumference is ~251.2)
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const fillCircle = document.getElementById('modal-radial-fill');
    
    const offset = circumference - (project.progress / 100) * circumference;
    fillCircle.style.strokeDasharray = `${circumference} ${circumference}`;
    fillCircle.style.strokeDashoffset = offset;
    
    document.getElementById('modal-radial-text').textContent = `${project.progress}%`;

    // Status mapping & badge styling
    const statusBadge = document.getElementById('modal-status-badge');
    if (project.progress === 100) {
        statusBadge.textContent = 'เสร็จสิ้นแผนงาน';
        statusBadge.className = 'badge bg-green text-white';
    } else if (project.progress > 0) {
        statusBadge.textContent = 'กำลังดำเนินการ';
        statusBadge.className = 'badge bg-orange text-white';
    } else {
        statusBadge.textContent = 'รอดำเนินงาน';
        statusBadge.className = 'badge bg-secondary';
    }

    // Display modal
    modal.classList.add('active');
}

function hideModal() {
    const modal = document.getElementById('details-modal');
    modal.classList.remove('active');
}
