// -----------------------------
// Deployment Tracker - main.js
// -----------------------------

// Global variable to store fetched data
let currentData = [];

// Helper: convert DD/MM/YYYY to Date
function parseDateString(dateString) {
    if (!dateString) return new Date(NaN);
    const parts = (dateString || '').split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    return new Date(NaN);
}

// Helper: parse "HH:mm" or "HH:mm:ss" to {h, m, s}
function parseTimeString(timeString) {
    if (!timeString) return { hours: 0, minutes: 0, seconds: 0 };
    const parts = timeString.split(':').map(Number);
    return {
        hours: parts[0] || 0,
        minutes: parts[1] || 0,
        seconds: parts[2] || 0
    };
}

// Compose Date + Time into a Date object
function toDateTime(dateStr, timeStr) {
    const d = parseDateString(dateStr);
    if (isNaN(d.getTime())) {
        return new Date(0);
    }
    const { hours, minutes, seconds } = parseTimeString(timeStr);
    d.setHours(hours, minutes, seconds || 0, 0);
    return d;
}

// Safe HTML escaping function
function safe(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s.toString();
    return div.innerHTML;
}

// -----------------------------
// UI Panel Management
// -----------------------------
function showRecentPanel() {
    document.querySelector('.recent-panel').style.display = 'block';
    document.getElementById('resultsPanel').style.display = 'none';
}

function showResultsPanel() {
    document.querySelector('.recent-panel').style.display = 'none';
    document.getElementById('resultsPanel').style.display = 'block';
}

// -----------------------------
// Main Search Function
// -----------------------------
async function searchDeployments() {
    const ip = document.getElementById('ipInput').value.trim();
    const contentArea = document.getElementById('contentArea');

    if (!ip) {
        contentArea.innerHTML = '<div class="error">⚠️ Please enter an IP address</div>';
        return;
    }

    contentArea.innerHTML = '<div class="loading">⏳ Loading deployment data...</div>';
    showResultsPanel();

    try {
        const fileName = `${ip}_Deployment.json`;
        const filePath = `/EIS/Deployment_Tracker/data/${fileName}`;

        const response = await fetch(filePath, { 
            headers: { 'Accept': 'application/json' } 
        });
        
        if (!response.ok) {
            throw new Error(`Server ${ip} not found or no deployment data available`);
        }

        const data = await response.json();

        // Keep the full dataset for filtering
        currentData = Array.isArray(data) ? data : [];

        // Update recent panel with new data
        updateRecentPanel(currentData);
        
        // Render the full table
        renderTable(currentData);
    } catch (error) {
        contentArea.innerHTML = `
            <div class="error">
                <strong>❌ Error:</strong> ${error.message}
                <br/><br/>
                <small>Make sure the IP address is correct and deployment data exists.</small>
            </div>
        `;
    }
}

// -----------------------------
// Update Recent Panel
// -----------------------------
function updateRecentPanel(data) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Filter last 24 hours using Date+Time fields
    const recent = (data || [])
        .filter(item => {
            const dt = toDateTime(item.Date, item.Time);
            return dt >= cutoff && dt <= now;
        })
        .sort((a, b) => toDateTime(b.Date, b.Time) - toDateTime(a.Date, a.Time)); // newest first

    // Update stats
    const total = recent.length;
    const successCount = recent.filter(r => (r.Status || '').toUpperCase() === 'SUCCESS').length;
    const failedCount = recent.filter(r => (r.Status || '').toUpperCase() === 'FAILED').length;

    document.getElementById('totalCount').textContent = total;
    document.getElementById('successCount').textContent = successCount;
    document.getElementById('failedCount').textContent = failedCount;

    // Update list
    const recentList = document.getElementById('recentList');
    const emptyElement = recentList.querySelector('.empty-recent');
    
    if (recent.length === 0) {
        if (emptyElement) {
            emptyElement.style.display = 'block';
        }
        return;
    } else {
        if (emptyElement) {
            emptyElement.style.display = 'none';
        }
    }

    // Clear existing items except empty state
    const items = recentList.querySelectorAll('.recent-item');
    items.forEach(item => item.remove());

    // Add new items (limit to 10 for better performance)
    recent.slice(0, 10).forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'recent-item';
        
        const status = (item.Status || '').toUpperCase();
        const statusClass = status === 'SUCCESS' ? 'status-success' :
                          status === 'FAILED' ? 'status-failed' : 'status-pending';
        
        itemDiv.innerHTML = `
            <div class="recent-info">
                <div class="service">${safe(item['Service Name'] || 'Unknown Service')}</div>
                <div class="details">${safe(item.Broker || 'Unknown')} • ${safe(item.EG || 'Unknown')} • ${safe(item.Date || '')} ${safe(item.Time || '')}</div>
            </div>
            <div class="recent-status ${statusClass}">${safe(status || 'PENDING')}</div>
        `;
        
        recentList.appendChild(itemDiv);
    });
}

// -----------------------------
// Filter Functionality
// -----------------------------
function filterTable() {
    const filterBroker = (document.getElementById('filterBroker')?.value) || 'All';
    const filterEG = (document.getElementById('filterEG')?.value) || 'All';
    const filterDate = (document.getElementById('filterDate')?.value) || 'All';

    const filteredData = (currentData || []).filter(item => {
        const matchesBroker = filterBroker === 'All' || item.Broker === filterBroker;
        const matchesEG = filterEG === 'All' || item.EG === filterEG;
        const matchesDate = filterDate === 'All' || item.Date === filterDate;
        return matchesBroker && matchesEG && matchesDate;
    });

    renderTable(filteredData, {
        selectedBroker: filterBroker,
        selectedEG: filterEG,
        selectedDate: filterDate
    });
}

// -----------------------------
// Table Renderer
// -----------------------------
function renderTable(dataToRender, selections = {}) {
    const contentArea = document.getElementById('contentArea');

    // If no data
    if (!dataToRender || dataToRender.length === 0) {
        contentArea.innerHTML = '<div class="error">🔎 No matching deployment data found with current filters.</div>';
        return;
    }

    // Sort by combined date+time (newest first)
    dataToRender.sort((a, b) => {
        return toDateTime(b.Date, b.Time) - toDateTime(a.Date, a.Time);
    });

    // Get unique values for filters from full dataset
    const uniqueBrokers = [...new Set((currentData || []).map(item => item.Broker).filter(Boolean))].sort();
    const uniqueEGs = [...new Set((currentData || []).map(item => item.EG).filter(Boolean))].sort();
    const uniqueDates = [...new Set((currentData || []).map(item => item.Date).filter(Boolean))]
        .map(d => ({ str: d, dt: parseDateString(d) }))
        .filter(d => !isNaN(d.dt.getTime()))
        .sort((a, b) => b.dt - a.dt)
        .map(x => x.str);

    const totalDeployments = dataToRender.length;

    // Build the table HTML
    let html = `
        <div class="table-header">
            <div class="stats">
                <div class="stat-card">
                    <h3>${totalDeployments}</h3>
                    <p>Filtered Deployments</p>
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
            
            <div class="filters">
                <div class="filter-group">
                    <label>Date Filter:</label>
                    <select id="filterDate" onchange="filterTable()">
                        <option value="All">All Dates</option>
                        ${uniqueDates.map(date => `<option value="${safe(date)}">${safe(date)}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Broker Filter:</label>
                    <select id="filterBroker" onchange="filterTable()">
                        <option value="All">All Brokers</option>
                        ${uniqueBrokers.map(broker => `<option value="${safe(broker)}">${safe(broker)}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>EG Filter:</label>
                    <select id="filterEG" onchange="filterTable()">
                        <option value="All">All Groups</option>
                        ${uniqueEGs.map(eg => `<option value="${safe(eg)}">${safe(eg)}</option>`).join('')}
                    </select>
                </div>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Deployment Date</th>
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
        const statusClass = status === 'SUCCESS' ? 'status-success' :
                          status === 'FAILED' ? 'status-failed' : 'status-pending';
        
        html += `
            <tr>
                <td>${safe(item.Date)}</td>
                <td>${safe(item.Time)}</td>
                <td class="service-name">${safe(item['Service Name'])}</td>
                <td><span class="badge badge-broker">${safe(item.Broker)}</span></td>
                <td><span class="badge badge-eg">${safe(item.EG)}</span></td>
                <td><span class="status-badge ${statusClass}">${safe(status || 'PENDING')}</span></td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
        
        <div class="table-footer">
            <div class="summary">
                Showing ${dataToRender.length} of ${currentData.length} total deployments
            </div>
        </div>
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
}

// -----------------------------
// Enter Key Support
// -----------------------------
document.getElementById('ipInput')?.addEventListener('keypress', function (event) {
    if (event.key === 'Enter') {
        searchDeployments();
    }
});

// -----------------------------
// Initialize
// -----------------------------
document.addEventListener('DOMContentLoaded', function() {
    // Set focus to input on page load
    document.getElementById('ipInput').focus();
    
    // Add a sample IP for testing (optional)
    // document.getElementById('ipInput').value = '10.188.25.163';
});
