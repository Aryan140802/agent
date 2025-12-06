
// -----------------------------
// Deployment Tracker - main.js
// -----------------------------

// Global variable to store fetched data
let currentData = [];

// Helper: convert DD/MM/YYYY to Date
function parseDateString(dateString) {
    // Expects "DD/MM/YYYY"
    const parts = (dateString || '').split('/');
    return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
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
    const { hours, minutes, seconds } = parseTimeString(timeStr);
    d.setHours(hours, minutes, seconds || 0, 0);
    return d;
}

// -----------------------------
// Loader
// -----------------------------
async function loadDeployment() {
    const ip = document.getElementById('ipInput').value.trim();
    const contentArea = document.getElementById('contentArea');

    if (!ip) {
        contentArea.innerHTML = '<div class="error">⚠️ Please enter an IP address</div>';
        renderRecent24h([]); // clear/empty recent panel
        return;
    }

    contentArea.innerHTML = '<div class="loading">⏳ Loading deployment data</div>';

    try {
        const fileName = `${ip}_Deployment.json`;
        const filePath = `/EIS/Deployment_Tracker/data/${fileName}`;

        const response = await fetch(filePath, { headers: { 'Accept': 'application/json' } });
        if (!response.ok) throw new Error(`File not found: ${fileName}`);

        const data = await response.json();

        // Keep the full dataset for filtering
        currentData = Array.isArray(data) ? data : [];

        // Render the 24h panel + full table
        renderRecent24h(currentData);
        renderTable(currentData);
    } catch (error) {
        contentArea.innerHTML = `
            <div class="error">
                <strong>❌ Error:</strong> ${error.message}
                <br/><br/>
            </div>
        `;
        renderRecent24h([]); // clear/empty recent panel on error
    }
}

// -----------------------------
// Filter
// -----------------------------
function filterTable() {
    const filterBroker = (document.getElementById('filterBroker')?.value) || 'All';
    const filterEG     = (document.getElementById('filterEG')?.value)     || 'All';
    const filterDate   = (document.getElementById('filterDate')?.value)   || 'All';

    const filteredData = (currentData || []).filter(item => {
        const matchesBroker = filterBroker === 'All' || item.Broker === filterBroker;
        const matchesEG     = filterEG     === 'All' || item.EG     === filterEG;
        const matchesDate   = filterDate   === 'All' || item.Date   === filterDate;
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

    // If no data (e.g., empty filter results)
    if (!dataToRender || dataToRender.length === 0) {
        contentArea.innerHTML = '<div class="error">🔎 No matching deployment data found with current filters.</div>';
        return;
    }

    // Sort by combined date+time (newest first)
    dataToRender.sort((a, b) => {
        return toDateTime(b.Date, b.Time) - toDateTime(a.Date, a.Time);
    });

    // Stats based on full (original) dataset for filter options
    const uniqueBrokers = [...new Set((currentData || []).map(item => item.Broker))].sort();
    const uniqueEGs     = [...new Set((currentData || []).map(item => item.EG))].sort();
    const uniqueDates   = [...new Set((currentData || []).map(item => item.Date))]
        .map(d => ({ str: d, dt: parseDateString(d) }))
        .sort((a, b) => b.dt - a.dt)
        .map(x => x.str);

    const totalDeployments = dataToRender.length;

    let html = `
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

        <table>
            <thead>
                <tr>
                    <th>
                        Deployment Date
                        <select id="filterDate" onchange="filterTable()">
                            <option value="All">All Dates</option>
                            ${uniqueDates.map(date => `<option value="${date}">${date}</option>`).join('')}
                        </select>
                    </th>
                    <th>Time</th>
                    <th>Service Name</th>
                    <th>
                        Broker
                        <select id="filterBroker" onchange="filterTable()">
                            <option value="All">All</option>
                            ${uniqueBrokers.map(broker => `<option value="${broker}">${broker}</option>`).join('')}
                        </select>
                    </th>
                    <th>
                        Execution Group
                        <select id="filterEG" onchange="filterTable()">
                            <option value="All">All</option>
                            ${uniqueEGs.map(eg => `<option value="${eg}">${eg}</option>`).join('')}
                        </select>
                    </th>
                </tr>
            </thead>
            <tbody>
    `;

    dataToRender.forEach(item => {
        html += `
            <tr>
                <td>${safe(item.Date)}</td>
                <td>${safe(item.Time)}</td>
                <td class="service-name">${safe(item['Service Name'])}</td>
                <td><span class="badge badge-broker">${safe(item.Broker)}</span></td>
                <td><span class="badge badge-eg">${safe(item.EG)}</span></td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    // Write content
    contentArea.innerHTML = html;

    // Restore selected filter values (if provided)
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
// 24h Panel Renderer
// -----------------------------
function renderRecent24h(data) {
    const panel = document.getElementById('recentPanel');
    if (!panel) return; // safe no-op if panel isn't present

    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Filter last 24 hours using Date+Time fields
    const recent = (data || [])
        .filter(item => {
            const dt = toDateTime(item.Date, item.Time);
            return dt >= cutoff && dt <= now;
        })
        .sort((a, b) => toDateTime(b.Date, b.Time) - toDateTime(a.Date, a.Time)); // newest first

    // Quick stats (requires optional item.Status)
    const total = recent.length;
    const successCount = recent.filter(r => (r.Status || '').toUpperCase() === 'SUCCESS').length;
    const failedCount  = recent.filter(r => (r.Status || '').toUpperCase() === 'FAILED').length;

    setTextSafe('recentCount', total);
    setTextSafe('recentSuccess', successCount);
    setTextSafe('recentFailed', failedCount);

    const list = panel.querySelector('#recentList');
    const empty = panel.querySelector('#recentEmpty');
    list.innerHTML = '';

    if (recent.length === 0) {
        empty.classList.remove('hidden');
        return;
    } else {
        empty.classList.add('hidden');
    }

    // Render up to 20 items
    recent.slice(0, 20).forEach(item => {
        const li = document.createElement('div');
        li.className = 'deployment-item';

        const left = document.createElement('div');
        left.className = 'left';

        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = `${safe(item['Service Name'])} • ${safe(item.EG)} • ${safe(item.Broker)}`;

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = `${safe(item.Date)} ${safe(item.Time)}`;

        left.appendChild(title);
        left.appendChild(meta);

        const status = (item.Status || '').toUpperCase(); // SUCCESS | FAILED | IN_PROGRESS | ...
        const pill = document.createElement('div');
        pill.className =
            'status-pill ' +
            (status === 'SUCCESS' ? 'status-success' :
             status === 'FAILED'  ? 'status-failed'  :
                                    'status-inprog');
        pill.textContent = status || 'UNKNOWN';

        li.appendChild(left);
        li.appendChild(pill);
        list.appendChild(li);
    });
}

// -----------------------------
// Small utilities
// -----------------------------
function setTextSafe(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
function safe(s) {
    return (s ?? '').toString();
}

// Enter-to-load shortcut
document.getElementById('ipInput')?.addEventListener('keypress', function (event) {
    if (event.key === 'Enter') loadDeployment();
});
