// -----------------------------
// Deployment Tracker - main.js
// -----------------------------

// Global variables
let currentData = [];
let allRecentDeployments = []; // Stores all recent deployments from all servers

// Initialize recent deployments on page load
document.addEventListener('DOMContentLoaded', function() {
    // Try to load recent deployments from all known servers
    // You might want to load from a summary file or multiple files
    loadRecentDeployments();
});

// -----------------------------
// Load Recent Deployments (24h from all servers)
// -----------------------------
async function loadRecentDeployments() {
    try {
        // This could load from a summary JSON file that aggregates recent deployments
        // For now, we'll show empty state
        allRecentDeployments = [];
        renderRecentDeployments();
    } catch (error) {
        console.error('Error loading recent deployments:', error);
    }
}

// -----------------------------
// Render Recent Deployments (24h panel)
// -----------------------------
function renderRecentDeployments() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Get deployments from last 24 hours
    const recent = allRecentDeployments
        .filter(item => {
            const dt = toDateTime(item.Date, item.Time);
            return dt >= cutoff && dt <= now;
        })
        .sort((a, b) => toDateTime(b.Date, b.Time) - toDateTime(a.Date, a.Time));
    
    // Update stats
    document.getElementById('totalCount').textContent = recent.length;
    const successCount = recent.filter(r => (r.Status || '').toUpperCase() === 'SUCCESS').length;
    const failedCount = recent.filter(r => (r.Status || '').toUpperCase() === 'FAILED').length;
    document.getElementById('successCount').textContent = successCount;
    document.getElementById('failedCount').textContent = failedCount;
    
    // Render list
    const recentList = document.getElementById('recentList');
    
    if (recent.length === 0) {
        recentList.innerHTML = `
            <div class="empty-recent">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                </svg>
                <h3>No recent deployments</h3>
                <p>Search for a server IP to see deployment history</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    recent.forEach(item => {
        const status = (item.Status || '').toUpperCase();
        let statusClass = 'status-pending';
        if (status === 'SUCCESS') statusClass = 'status-success';
        if (status === 'FAILED') statusClass = 'status-failed';
        
        html += `
            <div class="recent-item">
                <div class="recent-info">
                    <div class="service">${safe(item['Service Name'])}</div>
                    <div class="details">
                        ${safe(item.Broker)} • ${safe(item.EG)} • ${safe(item.Date)} ${safe(item.Time)}
                        ${item.Server ? `• Server: ${item.Server}` : ''}
                    </div>
                </div>
                <div class="recent-status ${statusClass}">
                    ${status || 'PENDING'}
                </div>
            </div>
        `;
    });
    
    recentList.innerHTML = html;
}

// -----------------------------
// Search Deployments by Server IP
// -----------------------------
async function searchDeployments() {
    const ip = document.getElementById('ipInput').value.trim();
    const recentPanel = document.querySelector('.recent-panel');
    const resultsPanel = document.getElementById('resultsPanel');
    
    if (!ip) {
        alert('Please enter a server IP address');
        return;
    }
    
    // Switch to results view
    recentPanel.style.display = 'none';
    resultsPanel.style.display = 'block';
    
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="loading">⏳ Loading deployment data...</div>';
    
    try {
        const fileName = `${ip}_Deployment.json`;
        const filePath = `/EIS/Deployment_Tracker/data/${fileName}`;
        
        const response = await fetch(filePath, { headers: { 'Accept': 'application/json' } });
        if (!response.ok) throw new Error(`Server data not found for IP: ${ip}`);
        
        const data = await response.json();
        currentData = Array.isArray(data) ? data : [];
        
        // Add server IP to each record for reference
        currentData.forEach(item => item.Server = ip);
        
        // Add to recent deployments if within 24h
        const now = new Date();
        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        currentData.forEach(item => {
            const dt = toDateTime(item.Date, item.Time);
            if (dt >= cutoff && dt <= now) {
                // Add to recent deployments if not already there
                const exists = allRecentDeployments.some(existing => 
                    existing['Service Name'] === item['Service Name'] && 
                    existing.Date === item.Date && 
                    existing.Time === item.Time
                );
                if (!exists) {
                    allRecentDeployments.push({...item, Server: ip});
                }
            }
        });
        
        renderTable(currentData);
    } catch (error) {
        contentArea.innerHTML = `
            <div class="error">
                <strong>❌ Error:</strong> ${error.message}
                <br/><br/>
                <button onclick="searchDeployments()">Retry</button>
            </div>
        `;
    }
}

// -----------------------------
// Show Recent Panel (Back button)
// -----------------------------
function showRecentPanel() {
    const recentPanel = document.querySelector('.recent-panel');
    const resultsPanel = document.getElementById('resultsPanel');
    
    // Update recent deployments display
    renderRecentDeployments();
    
    // Switch back to recent panel
    recentPanel.style.display = 'block';
    resultsPanel.style.display = 'none';
}

// -----------------------------
// Filter Table (For Search Results)
// -----------------------------
function filterTable() {
    const filterBroker = (document.getElementById('filterBroker')?.value) || 'All';
    const filterEG = (document.getElementById('filterEG')?.value) || 'All';
    const filterDate = (document.getElementById('filterDate')?.value) || 'All';
    const filterStatus = (document.getElementById('filterStatus')?.value) || 'All';
    
    const filteredData = currentData.filter(item => {
        const matchesBroker = filterBroker === 'All' || item.Broker === filterBroker;
        const matchesEG = filterEG === 'All' || item.EG === filterEG;
        const matchesDate = filterDate === 'All' || item.Date === filterDate;
        const matchesStatus = filterStatus === 'All' || (item.Status || '').toUpperCase() === filterStatus.toUpperCase();
        return matchesBroker && matchesEG && matchesDate && matchesStatus;
    });
    
    renderTable(filteredData, {
        selectedBroker: filterBroker,
        selectedEG: filterEG,
        selectedDate: filterDate,
        selectedStatus: filterStatus
    });
}

// -----------------------------
// Enhanced Table Renderer with More Filters
// -----------------------------
function renderTable(dataToRender, selections = {}) {
    const contentArea = document.getElementById('contentArea');
    
    if (!dataToRender || dataToRender.length === 0) {
        contentArea.innerHTML = '<div class="error">🔎 No deployment data found for this server.</div>';
        return;
    }
    
    // Sort by date+time (newest first)
    dataToRender.sort((a, b) => {
        return toDateTime(b.Date, b.Time) - toDateTime(a.Date, a.Time);
    });
    
    // Get unique values for filters
    const uniqueBrokers = [...new Set(currentData.map(item => item.Broker))].sort();
    const uniqueEGs = [...new Set(currentData.map(item => item.EG))].sort();
    const uniqueDates = [...new Set(currentData.map(item => item.Date))]
        .map(d => ({ str: d, dt: parseDateString(d) }))
        .sort((a, b) => b.dt - a.dt)
        .map(x => x.str);
    
    const uniqueStatuses = [...new Set(currentData.map(item => item.Status || 'UNKNOWN'))]
        .filter(s => s).sort();
    
    const totalDeployments = dataToRender.length;
    const serverIP = dataToRender[0]?.Server || '';
    
    let html = `
        <div class="stats">
            <div class="stat-card">
                <h3>${totalDeployments}</h3>
                <p>Total Deployments</p>
            </div>
            <div class="stat-card">
                <h3>${serverIP}</h3>
                <p>Server IP</p>
            </div>
            <div class="stat-card">
                <h3>${uniqueBrokers.length}</h3>
                <p>Unique Brokers</p>
            </div>
            <div class="stat-card">
                <h3>${uniqueEGs.length}</h3>
                <p>Execution Groups</p>
            </div>
        </div>
        
        <div class="filter-controls">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                <div>
                    <label style="display: block; margin-bottom: 8px; color: rgba(255,255,255,0.7);">Date</label>
                    <select id="filterDate" onchange="filterTable()" style="width: 100%;">
                        <option value="All">All Dates</option>
                        ${uniqueDates.map(date => `<option value="${date}">${date}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 8px; color: rgba(255,255,255,0.7);">Broker</label>
                    <select id="filterBroker" onchange="filterTable()" style="width: 100%;">
                        <option value="All">All Brokers</option>
                        ${uniqueBrokers.map(broker => `<option value="${broker}">${broker}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 8px; color: rgba(255,255,255,0.7);">Execution Group</label>
                    <select id="filterEG" onchange="filterTable()" style="width: 100%;">
                        <option value="All">All EGs</option>
                        ${uniqueEGs.map(eg => `<option value="${eg}">${eg}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 8px; color: rgba(255,255,255,0.7);">Status</label>
                    <select id="filterStatus" onchange="filterTable()" style="width: 100%;">
                        <option value="All">All Status</option>
                        ${uniqueStatuses.map(status => `<option value="${status}">${status}</option>`).join('')}
                    </select>
                </div>
            </div>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Service Name</th>
                    <th>Broker</th>
                    <th>Execution Group</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    dataToRender.forEach(item => {
        const status = (item.Status || '').toUpperCase();
        let statusBadge = `<span class="badge">${status || 'UNKNOWN'}</span>`;
        if (status === 'SUCCESS') statusBadge = `<span class="badge badge-success">${status}</span>`;
        if (status === 'FAILED') statusBadge = `<span class="badge badge-failed">${status}</span>`;
        
        html += `
            <tr>
                <td>${safe(item.Date)}</td>
                <td>${safe(item.Time)}</td>
                <td class="service-name">${safe(item['Service Name'])}</td>
                <td><span class="badge badge-broker">${safe(item.Broker)}</span></td>
                <td><span class="badge badge-eg">${safe(item.EG)}</span></td>
                <td>${statusBadge}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    contentArea.innerHTML = html;
    
    // Restore selected filter values
    if (selections.selectedBroker && document.getElementById('filterBroker')) {
        document.getElementById('filterBroker').value = selections.selectedBroker;
    }
    if (selections.selectedEG && document.getElementById('filterEG')) {
        document.getElementById('filterEG').value = selections.selectedEG;
    }
    if (selections.selectedDate && document.getElementById('filterDate')) {
        document.getElementById('filterDate').value = selections.selectedDate;
    }
    if (selections.selectedStatus && document.getElementById('filterStatus')) {
        document.getElementById('filterStatus').value = selections.selectedStatus;
    }
}

// -----------------------------
// Helper Functions (Keep existing)
// -----------------------------
function parseDateString(dateString) {
    const parts = (dateString || '').split('/');
    return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
}

function parseTimeString(timeString) {
    if (!timeString) return { hours: 0, minutes: 0, seconds: 0 };
    const parts = timeString.split(':').map(Number);
    return {
        hours: parts[0] || 0,
        minutes: parts[1] || 0,
        seconds: parts[2] || 0
    };
}

function toDateTime(dateStr, timeStr) {
    const d = parseDateString(dateStr);
    const { hours, minutes, seconds } = parseTimeString(timeStr);
    d.setHours(hours, minutes, seconds || 0, 0);
    return d;
}

function safe(s) {
    return (s ?? '').toString();
}

// Enter key support
document.getElementById('ipInput')?.addEventListener('keypress', function (event) {
    if (event.key === 'Enter') searchDeployments();
});
