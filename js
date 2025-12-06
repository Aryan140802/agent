// -----------------------------
// Deployment Tracker - main.js
// -----------------------------

// Global variables
let currentData = [];
let allRecentDeployments = [];
let availableServers = [];
let isScanning = false;
let scanProgress = 0;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Deployment Tracker Initializing...');
    
    // Setup search input for suggestions
    const ipInput = document.getElementById('ipInput');
    ipInput.addEventListener('input', debounce(showServerSuggestions, 300));
    ipInput.addEventListener('blur', () => {
        setTimeout(() => {
            const suggestions = document.getElementById('serverSuggestions');
            if (suggestions) suggestions.style.display = 'none';
        }, 200);
    });
    
    // Enter key to search
    ipInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            searchDeployments();
        }
    });
    
    // Auto-focus search input
    ipInput.focus();
    
    // Show initial loading state
    updateRecentPanelMessage('⌛ Scanning for available servers...');
    
    // Start server discovery
    await loadAvailableServersFromFolder();
});

// -----------------------------
// Debounce function for input events
// -----------------------------
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// -----------------------------
// Update Recent Panel Message
// -----------------------------
function updateRecentPanelMessage(message, isError = false) {
    const recentList = document.getElementById('recentList');
    if (recentList) {
        recentList.innerHTML = `
            <div class="empty-recent" style="${isError ? 'color: #ff6b6b;' : ''}">
                ${isError ? '⚠️ ' : ''}${message}
            </div>
        `;
    }
}

// -----------------------------
// Load Available Servers from /data folder
// -----------------------------
async function loadAvailableServersFromFolder() {
    try {
        isScanning = true;
        scanProgress = 0;
        
        console.log('Starting server discovery...');
        updateRecentPanelMessage('🔍 Discovering available servers...');
        
        // Try multiple methods to find servers
        const servers = await discoverServers();
        
        availableServers = servers;
        
        if (availableServers.length === 0) {
            updateRecentPanelMessage('❌ No deployment files found. Please check the data folder.', true);
            console.log('No servers found');
        } else {
            console.log(`Found ${availableServers.length} servers:`, availableServers);
            updateRecentPanelMessage(`✅ Found ${availableServers.length} servers`);
            
            // Show available servers in the recent panel
            renderAvailableServers();
            
            // Load recent deployments from found servers
            await loadRecentDeployments();
        }
        
        isScanning = false;
        scanProgress = 100;
        
    } catch (error) {
        console.error('Error loading servers:', error);
        updateRecentPanelMessage('❌ Error discovering servers. Please try again.', true);
        isScanning = false;
    }
}

// -----------------------------
// Discover servers using multiple methods
// -----------------------------
async function discoverServers() {
    const servers = new Set();
    
    // Method 1: Try to get server list from a known file
    try {
        const listResponse = await fetch('/EIS/Deployment_Tracker/data/servers.json', {
            cache: 'no-cache'
        });
        if (listResponse.ok) {
            const serverList = await listResponse.json();
            if (Array.isArray(serverList)) {
                serverList.forEach(server => servers.add(server));
                console.log(`Found ${serverList.length} servers from servers.json`);
            }
        }
    } catch (error) {
        // servers.json doesn't exist, continue with other methods
    }
    
    // Method 2: Try directory listing
    try {
        const dirResponse = await fetch('/EIS/Deployment_Tracker/data/');
        if (dirResponse.ok) {
            const text = await dirResponse.text();
            const foundServers = parseServersFromHTML(text);
            foundServers.forEach(server => servers.add(server));
            console.log(`Found ${foundServers.length} servers from directory listing`);
        }
    } catch (error) {
        // Directory listing failed, continue with pattern scanning
    }
    
    // Method 3: Pattern scanning (fallback)
    if (servers.size === 0) {
        console.log('No servers found from listing, starting pattern scan...');
        updateRecentPanelMessage('🔍 Scanning network patterns...');
        
        const patternServers = await scanServerPatterns();
        patternServers.forEach(server => servers.add(server));
        console.log(`Found ${patternServers.length} servers from pattern scan`);
    }
    
    // Convert Set to Array and sort
    const serverArray = Array.from(servers).sort((a, b) => {
        // Sort by IP segments
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        
        for (let i = 0; i < 4; i++) {
            if (aParts[i] !== bParts[i]) {
                return aParts[i] - bParts[i];
            }
        }
        return 0;
    });
    
    return serverArray;
}

// -----------------------------
// Parse servers from directory HTML listing
// -----------------------------
function parseServersFromHTML(html) {
    const servers = [];
    
    try {
        // Look for JSON files with pattern *_Deployment.json
        const regex = /href="([^"]+_Deployment\.json)"/g;
        let match;
        
        while ((match = regex.exec(html)) !== null) {
            const fileName = match[1];
            // Extract IP from filename: "10.188.25.74_Deployment.json"
            const ipMatch = fileName.match(/^(\d+\.\d+\.\d+\.\d+)_Deployment\.json$/);
            if (ipMatch && ipMatch[1]) {
                servers.push(ipMatch[1]);
            }
        }
    } catch (error) {
        console.error('Error parsing HTML:', error);
    }
    
    return servers;
}

// -----------------------------
// Scan for servers using common patterns
// -----------------------------
async function scanServerPatterns() {
    const detectedServers = [];
    const testPatterns = [];
    
    // Create test patterns based on common ranges
    // Base on your example: 10.188.25.xx
    const baseIP = '10.188.25.';
    
    // Test common ranges first
    const commonRanges = [
        [70, 85],   // Your example shows .74
        [160, 170], // Your example shows .163
        [1, 30],    // Common low ranges
        [200, 220]  // Common high ranges
    ];
    
    // Generate IPs from common ranges
    for (const [start, end] of commonRanges) {
        for (let i = start; i <= end; i++) {
            testPatterns.push(`${baseIP}${i}`);
        }
    }
    
    // Also test some random samples across the entire range
    for (let i = 0; i < 20; i++) {
        const randomIP = Math.floor(Math.random() * 254) + 1;
        testPatterns.push(`${baseIP}${randomIP}`);
    }
    
    // Remove duplicates
    const uniquePatterns = [...new Set(testPatterns)];
    
    console.log(`Testing ${uniquePatterns.length} IP patterns...`);
    
    // Test each pattern with Promise.all for efficiency
    const testPromises = uniquePatterns.map(async (ip, index) => {
        try {
            const fileName = `${ip}_Deployment.json`;
            const filePath = `/EIS/Deployment_Tracker/data/${fileName}`;
            
            // Update progress
            scanProgress = Math.floor((index / uniquePatterns.length) * 100);
            
            // Use HEAD request for faster checking
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            
            const response = await fetch(filePath, {
                method: 'HEAD',
                cache: 'no-cache',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                return ip;
            }
        } catch (error) {
            // File doesn't exist or request failed
        }
        return null;
    });
    
    // Process in batches to avoid too many concurrent requests
    const batchSize = 10;
    for (let i = 0; i < uniquePatterns.length; i += batchSize) {
        const batch = uniquePatterns.slice(i, i + batchSize);
        const batchPromises = batch.map(ip => testServerExistence(ip));
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                detectedServers.push(result.value);
            }
        });
        
        // Update UI progress
        scanProgress = Math.floor(((i + batchSize) / uniquePatterns.length) * 100);
        if (scanProgress % 20 === 0) {
            updateRecentPanelMessage(`🔍 Scanning... ${scanProgress}% complete`);
        }
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return detectedServers;
}

// -----------------------------
// Test if a server file exists
// -----------------------------
async function testServerExistence(ip) {
    try {
        const fileName = `${ip}_Deployment.json`;
        const filePath = `/EIS/Deployment_Tracker/data/${fileName}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(filePath, {
            method: 'HEAD',
            cache: 'no-cache',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            console.log(`Found server: ${ip}`);
            return ip;
        }
    } catch (error) {
        // Server not found
    }
    return null;
}

// -----------------------------
// Render Available Servers in Recent Panel
// -----------------------------
function renderAvailableServers() {
    const recentList = document.getElementById('recentList');
    const statsContainer = document.querySelector('.recent-stats');
    
    if (!statsContainer) return;
    
    // Update stats
    document.getElementById('totalCount').textContent = availableServers.length;
    document.getElementById('successCount').textContent = '0';
    document.getElementById('failedCount').textContent = '0';
    
    let html = `
        <div class="available-servers">
            <div class="servers-header">
                <h3 style="margin: 0; color: #e0e0e0;">Available Servers (${availableServers.length})</h3>
                <div class="scan-info">Click any server to view deployments</div>
            </div>
            <div class="servers-grid">
    `;
    
    // Group servers by subnet for better organization
    const serversBySubnet = {};
    availableServers.forEach(server => {
        const subnet = server.substring(0, server.lastIndexOf('.'));
        if (!serversBySubnet[subnet]) {
            serversBySubnet[subnet] = [];
        }
        serversBySubnet[subnet].push(server);
    });
    
    // Display servers grouped by subnet
    Object.keys(serversBySubnet).sort().forEach(subnet => {
        const servers = serversBySubnet[subnet];
        
        html += `
            <div class="subnet-group">
                <div class="subnet-header">${subnet}.x</div>
                <div class="server-list">
        `;
        
        servers.forEach(server => {
            const lastOctet = server.split('.').pop();
            html += `
                <div class="server-chip" onclick="selectServer('${server}')">
                    <span class="server-ip">${server}</span>
                    <span class="server-badge">${lastOctet}</span>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
            <div class="servers-footer">
                <div class="hint">💡 Start typing in the search bar above for smart suggestions</div>
                <button onclick="rescanServers()" class="rescan-btn">
                    🔄 Rescan for Servers
                </button>
            </div>
        </div>
    `;
    
    recentList.innerHTML = html;
}

// -----------------------------
// Select Server (from available servers list)
// -----------------------------
function selectServer(server) {
    document.getElementById('ipInput').value = server;
    searchDeployments();
}

// -----------------------------
// Rescan for Servers
// -----------------------------
async function rescanServers() {
    if (isScanning) return;
    
    console.log('Rescanning for servers...');
    updateRecentPanelMessage('🔍 Rescanning for available servers...');
    
    // Show rescan button as loading
    const rescanBtn = document.querySelector('.rescan-btn');
    if (rescanBtn) {
        rescanBtn.innerHTML = '⏳ Scanning...';
        rescanBtn.disabled = true;
    }
    
    await loadAvailableServersFromFolder();
    
    if (rescanBtn) {
        rescanBtn.innerHTML = '🔄 Rescan for Servers';
        rescanBtn.disabled = false;
    }
}

// -----------------------------
// Show Server Suggestions
// -----------------------------
function showServerSuggestions() {
    const input = document.getElementById('ipInput');
    const value = input.value.trim();
    
    // Remove existing suggestions
    let suggestions = document.getElementById('serverSuggestions');
    if (!suggestions) {
        suggestions = document.createElement('div');
        suggestions.id = 'serverSuggestions';
        suggestions.className = 'server-suggestions';
        input.parentNode.appendChild(suggestions);
    }
    
    suggestions.innerHTML = '';
    
    if (!value) {
        // If input is empty, show recently accessed servers
        const recentServers = getRecentlyAccessedServers();
        if (recentServers.length > 0) {
            showRecentServersSuggestions(suggestions, recentServers);
            return;
        } else {
            suggestions.style.display = 'none';
            return;
        }
    }
    
    // Filter servers based on input
    const filteredServers = availableServers.filter(server => 
        server.includes(value)
    ).slice(0, 15);
    
    if (filteredServers.length === 0) {
        // Show no matches with option to scan for this pattern
        showNoMatchesSuggestions(suggestions, value);
    } else {
        // Show matching servers
        filteredServers.forEach(server => {
            const item = createSuggestionItem(server, input, suggestions);
            suggestions.appendChild(item);
        });
        
        // Add option to scan for more if pattern looks like IP
        if (value.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            const scanItem = document.createElement('div');
            scanItem.className = 'suggestion-item scan-item';
            scanItem.innerHTML = `🔍 Scan for exact IP: ${value}`;
            scanItem.addEventListener('click', async () => {
                input.value = value;
                suggestions.style.display = 'none';
                await testAndAddServer(value);
            });
            suggestions.appendChild(scanItem);
        }
    }
    
    // Position and show suggestions
    positionSuggestions(suggestions, input);
    suggestions.style.display = 'block';
}

// -----------------------------
// Test and Add Server (for manual entry)
// -----------------------------
async function testAndAddServer(ip) {
    const loading = document.createElement('div');
    loading.className = 'loading-overlay';
    loading.innerHTML = '<div class="loading">Testing server...</div>';
    document.body.appendChild(loading);
    
    try {
        const serverExists = await testServerExistence(ip);
        
        if (serverExists) {
            // Add to available servers if not already there
            if (!availableServers.includes(ip)) {
                availableServers.push(ip);
                availableServers.sort();
            }
            searchDeployments();
        } else {
            alert(`❌ Server ${ip} not found. No deployment file exists for this IP.`);
        }
    } catch (error) {
        alert('❌ Error testing server. Please check the IP and try again.');
    } finally {
        document.body.removeChild(loading);
    }
}

// -----------------------------
// Show No Matches Suggestions
// -----------------------------
function showNoMatchesSuggestions(suggestions, value) {
    const noMatch = document.createElement('div');
    noMatch.className = 'suggestion-item no-match';
    noMatch.innerHTML = `<span style="color: rgba(255,255,255,0.5);">No servers found matching "${value}"</span>`;
    suggestions.appendChild(noMatch);
    
    // Add option to try common endings
    if (value.match(/^\d+\.\d+\.\d+\.$/)) {
        const prefix = value;
        const commonEndings = ['74', '163', '75', '76', '77', '78', '79', '80'];
        
        const header = document.createElement('div');
        header.className = 'suggestion-header';
        header.textContent = 'Try these common endings:';
        suggestions.appendChild(header);
        
        commonEndings.forEach(ending => {
            const fullIP = `${prefix}${ending}`;
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.innerHTML = `${fullIP}`;
            item.addEventListener('click', () => {
                document.getElementById('ipInput').value = fullIP;
                suggestions.style.display = 'none';
                searchDeployments();
            });
            suggestions.appendChild(item);
        });
    }
}

// -----------------------------
// Show Recently Accessed Servers
// -----------------------------
function showRecentServersSuggestions(suggestions, recentServers) {
    const header = document.createElement('div');
    header.className = 'suggestion-header';
    header.textContent = 'Recently searched:';
    suggestions.appendChild(header);
    
    recentServers.slice(0, 5).forEach(server => {
        const input = document.getElementById('ipInput');
        const item = createSuggestionItem(server, input, suggestions);
        suggestions.appendChild(item);
    });
    
    const input = document.getElementById('ipInput');
    positionSuggestions(suggestions, input);
    suggestions.style.display = 'block';
}

// -----------------------------
// Create Suggestion Item
// -----------------------------
function createSuggestionItem(server, input, suggestions) {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    
    const inputValue = input.value.trim();
    if (inputValue) {
        const index = server.indexOf(inputValue);
        if (index !== -1) {
            const before = server.substring(0, index);
            const match = server.substring(index, index + inputValue.length);
            const after = server.substring(index + inputValue.length);
            item.innerHTML = `${before}<strong>${match}</strong>${after}`;
        } else {
            item.textContent = server;
        }
    } else {
        item.textContent = server;
    }
    
    item.addEventListener('click', () => {
        input.value = server;
        suggestions.style.display = 'none';
        searchDeployments();
    });
    
    return item;
}

// -----------------------------
// Position Suggestions
// -----------------------------
function positionSuggestions(suggestions, input) {
    const rect = input.getBoundingClientRect();
    suggestions.style.width = rect.width + 'px';
    suggestions.style.top = (rect.top + rect.height + window.scrollY + 5) + 'px';
    suggestions.style.left = rect.left + window.scrollX + 'px';
}

// -----------------------------
// Get Recently Accessed Servers
// -----------------------------
function getRecentlyAccessedServers() {
    try {
        const recent = localStorage.getItem('recentServers');
        return recent ? JSON.parse(recent) : [];
    } catch (error) {
        return [];
    }
}

// -----------------------------
// Save Recently Accessed Server
// -----------------------------
function saveRecentlyAccessedServer(server) {
    try {
        let recent = getRecentlyAccessedServers();
        
        // Remove if already exists
        recent = recent.filter(s => s !== server);
        
        // Add to beginning
        recent.unshift(server);
        
        // Keep only last 10
        recent = recent.slice(0, 10);
        
        localStorage.setItem('recentServers', JSON.stringify(recent));
    } catch (error) {
        console.error('Error saving recent server:', error);
    }
}

// -----------------------------
// Load Recent Deployments (24h)
// -----------------------------
async function loadRecentDeployments() {
    if (availableServers.length === 0) return;
    
    try {
        console.log('Loading recent deployments...');
        
        // Load from first 3 servers (for performance)
        const serversToLoad = availableServers.slice(0, 3);
        const recentDeployments = [];
        
        for (const server of serversToLoad) {
            try {
                const deployments = await loadServerDeployments(server);
                recentDeployments.push(...deployments);
                
                console.log(`Loaded ${deployments.length} deployments from ${server}`);
            } catch (error) {
                console.log(`Could not load data for ${server}:`, error);
            }
        }
        
        allRecentDeployments = recentDeployments;
        
        // Update stats
        updateRecentDeploymentsStats();
        
    } catch (error) {
        console.error('Error loading recent deployments:', error);
    }
}

// -----------------------------
// Load Deployments for a Specific Server
// -----------------------------
async function loadServerDeployments(server) {
    try {
        const fileName = `${server}_Deployment.json`;
        const filePath = `/EIS/Deployment_Tracker/data/${fileName}`;
        
        const response = await fetch(filePath, { 
            headers: { 'Accept': 'application/json' },
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const deployments = Array.isArray(data) ? data : [];
        
        // Add server info and parse dates
        deployments.forEach(deployment => {
            deployment.Server = server;
            deployment.SortDate = parseDateString(deployment.Date);
        });
        
        return deployments;
    } catch (error) {
        console.error(`Error loading deployments for ${server}:`, error);
        return [];
    }
}

// -----------------------------
// Update Recent Deployments Stats
// -----------------------------
function updateRecentDeploymentsStats() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Get deployments from last 24 hours
    const recent = allRecentDeployments.filter(item => {
        const dt = toDateTime(item.Date, item.Time);
        return dt >= cutoff && dt <= now;
    }).sort((a, b) => {
        return toDateTime(b.Date, b.Time) - toDateTime(a.Date, a.Time);
    });
    
    // Update stats
    document.getElementById('totalCount').textContent = recent.length;
    
    // Estimate status counts (you can modify this based on your actual data)
    const successCount = Math.floor(recent.length * 0.8); // Example: 80% success rate
    const failedCount = recent.length - successCount;
    
    document.getElementById('successCount').textContent = successCount;
    document.getElementById('failedCount').textContent = failedCount;
}

// -----------------------------
// Parse Date from "MMM DD" format
// -----------------------------
function parseDateString(dateString) {
    if (!dateString) return new Date(0);
    
    const months = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    
    const parts = dateString.split(' ');
    if (parts.length !== 2) return new Date(0);
    
    const month = months[parts[0]];
    const day = parseInt(parts[1]);
    
    if (isNaN(month) || isNaN(day)) return new Date(0);
    
    const currentYear = new Date().getFullYear();
    const now = new Date();
    const date = new Date(currentYear, month, day);
    
    // If date is in future (more than 6 months ahead), use previous year
    if (date > now && (date - now) > 180 * 24 * 60 * 60 * 1000) {
        return new Date(currentYear - 1, month, day);
    }
    
    return date;
}

// -----------------------------
// Parse Time String
// -----------------------------
function parseTimeString(timeString) {
    if (!timeString) return { hours: 0, minutes: 0, seconds: 0 };
    const parts = timeString.split(':').map(Number);
    return {
        hours: parts[0] || 0,
        minutes: parts[1] || 0,
        seconds: parts[2] || 0
    };
}

// -----------------------------
// Combine Date and Time
// -----------------------------
function toDateTime(dateStr, timeStr) {
    const d = parseDateString(dateStr);
    const { hours, minutes, seconds } = parseTimeString(timeStr);
    d.setHours(hours, minutes, seconds || 0, 0);
    return d;
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
    
    // Validate IP format
    if (!isValidIP(ip)) {
        alert('Please enter a valid IP address (e.g., 10.188.25.74)');
        return;
    }
    
    // Hide suggestions
    const suggestions = document.getElementById('serverSuggestions');
    if (suggestions) suggestions.style.display = 'none';
    
    // Save to recently accessed
    saveRecentlyAccessedServer(ip);
    
    // Switch to results view
    recentPanel.style.display = 'none';
    resultsPanel.style.display = 'block';
    
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="loading">⏳ Loading deployment data...</div>';
    
    try {
        const deployments = await loadServerDeployments(ip);
        
        if (deployments.length === 0) {
            throw new Error('No deployment data found for this server');
        }
        
        currentData = deployments;
        
        // Add server IP if not already there
        currentData.forEach(item => {
            if (!item.Server) {
                item.Server = ip;
            }
        });
        
        // Sort by date+time (newest first)
        currentData.sort((a, b) => {
            return toDateTime(b.Date, b.Time) - toDateTime(a.Date, a.Time);
        });
        
        renderTable(currentData);
        
        // Add this server to available servers if not already there
        if (!availableServers.includes(ip)) {
            availableServers.push(ip);
            availableServers.sort();
        }
        
    } catch (error) {
        contentArea.innerHTML = `
            <div class="error">
                <strong>❌ Server Not Found:</strong> ${error.message}
                <br/><br/>
                <div style="margin-top: 15px;">
                    <p>Available servers:</p>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;" id="availableServersList">
                        ${availableServers.map(server => 
                            `<span class="server-chip" onclick="selectServer('${server}')">
                                ${server}
                            </span>`
                        ).join('')}
                    </div>
                </div>
                <br/>
                <div style="display: flex; gap: 10px;">
                    <button onclick="searchDeployments()">Retry</button>
                    <button onclick="showRecentPanel()" class="secondary-btn">
                        ← Back to Recent
                    </button>
                </div>
            </div>
        `;
    }
}

// -----------------------------
// Validate IP Address
// -----------------------------
function isValidIP(ip) {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;
    
    const parts = ip.split('.').map(Number);
    return parts.every(part => part >= 0 && part <= 255);
}

// -----------------------------
// Show Recent Panel (Back button)
// -----------------------------
function showRecentPanel() {
    const recentPanel = document.querySelector('.recent-panel');
    const resultsPanel = document.getElementById('resultsPanel');
    
    // Update recent deployments display
    updateRecentDeploymentsStats();
    renderAvailableServers();
    
    // Switch back to recent panel
    recentPanel.style.display = 'block';
    resultsPanel.style.display = 'none';
    
    // Focus back on search input
    document.getElementById('ipInput').focus();
}

// -----------------------------
// Enhanced Table Renderer
// -----------------------------
function renderTable(dataToRender, selections = {}) {
    const contentArea = document.getElementById('contentArea');
    
    if (!dataToRender || dataToRender.length === 0) {
        contentArea.innerHTML = '<div class="error">🔎 No deployment data found for this server.</div>';
        return;
    }
    
    // Ensure data is sorted by date+time (newest first)
    dataToRender.sort((a, b) => {
        return toDateTime(b.Date, b.Time) - toDateTime(a.Date, a.Time);
    });
    
    // Group by date for better organization
    const deploymentsByDate = {};
    dataToRender.forEach(item => {
        if (!deploymentsByDate[item.Date]) {
            deploymentsByDate[item.Date] = [];
        }
        deploymentsByDate[item.Date].push(item);
    });
    
    // Sort dates (newest first)
    const sortedDates = Object.keys(deploymentsByDate)
        .map(d => ({ str: d, dt: parseDateString(d) }))
        .sort((a, b) => b.dt - a.dt)
        .map(x => x.str);
    
    // Get unique values for filters
    const uniqueBrokers = [...new Set(dataToRender.map(item => item.Broker))].sort();
    const uniqueEGs = [...new Set(dataToRender.map(item => item.EG))].sort();
    const uniqueDates = sortedDates;
    
    const serverIP = dataToRender[0]?.Server || '';
    
    let html = `
        <div class="stats">
            <div class="stat-card">
                <h3>${dataToRender.length}</h3>
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
                    <label>Date</label>
                    <select id="filterDate" onchange="filterTable()">
                        <option value="All">All Dates</option>
                        ${uniqueDates.map(date => 
                            `<option value="${date}">${date}</option>`
                        ).join('')}
                    </select>
                </div>
                <div>
                    <label>Broker</label>
                    <select id="filterBroker" onchange="filterTable()">
                        <option value="All">All Brokers</option>
                        ${uniqueBrokers.map(broker => 
                            `<option value="${broker}">${broker}</option>`
                        ).join('')}
                    </select>
                </div>
                <div>
                    <label>Execution Group</label>
                    <select id="filterEG" onchange="filterTable()">
                        <option value="All">All EGs</option>
                        ${uniqueEGs.map(eg => 
                            `<option value="${eg}">${eg}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <button onclick="clearFilters()" class="clear-filters-btn">
                Clear All Filters
            </button>
        </div>
    `;
    
    // Group by date sections
    sortedDates.forEach(date => {
        const deployments = deploymentsByDate[date];
        
        html += `
            <div class="date-section">
                <h3 class="date-header">
                    <span>${date}</span>
                    <span class="date-count">${deployments.length} deployments</span>
                </h3>
                
                <table class="date-table">
                    <thead>
                        <tr>
                            <th width="15%">Time</th>
                            <th width="40%">Service Name</th>
                            <th width="15%">Broker</th>
                            <th width="15%">EG</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        deployments.forEach(item => {
            html += `
                <tr>
                    <td class="time-cell">${safe(item.Time)}</td>
                    <td>
                        <div class="service-name">${safe(item['Service Name'])}</div>
                        <div class="file-info">${formatFileName(item['Service Name'])}</div>
                    </td>
                    <td><span class="badge badge-broker">${safe(item.Broker)}</span></td>
                    <td><span class="badge badge-eg">${safe(item.EG)}</span></td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
    });
    
    contentArea.innerHTML = html;
    
    // Restore selected filter values if provided
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
// Filter Table
// -----------------------------
function filterTable() {
    const filterBroker = (document.getElementById('filterBroker')?.value) || 'All';
    const filterEG = (document.getElementById('filterEG')?.value) || 'All';
    const filterDate = (document.getElementById('filterDate')?.value) || 'All';
    
    const filteredData = currentData.filter(item => {
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
// Clear Filters
// -----------------------------
function clearFilters() {
    if (document.getElementById('filterDate')) {
        document.getElementById('filterDate').value = 'All';
    }
    if (document.getElementById('filterBroker')) {
        document.getElementById('filterBroker').value = 'All';
    }
    if (document.getElementById('filterEG')) {
        document.getElementById('filterEG').value = 'All';
    }
    renderTable(currentData);
}

// -----------------------------
// Format File Name for Display
// -----------------------------
function formatFileName(fileName) {
    // Remove .bar extension
    let name = fileName.replace('.bar', '');
    
    // Replace underscores with spaces
    name = name.replace(/_/g, ' ');
    
    // Capitalize first letter of each word
    name = name.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
    
    return name;
}

// -----------------------------
// Safe string display
// -----------------------------
function safe(s) {
    return (s ?? '').toString();
}

// -----------------------------
// Add CSS for new elements
// -----------------------------
const style = document.createElement('style');
style.textContent = `
    .available-servers {
        margin-top: 20px;
    }
    
    .servers-header {
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    
    .scan-info {
        color: rgba(255,255,255,0.5);
        font-size: 0.9em;
        margin-top: 5px;
    }
    
    .servers-grid {
        display: grid;
        gap: 20px;
    }
    
    .subnet-group {
        background: rgba(255,255,255,0.03);
        border-radius: 10px;
        padding: 15px;
        border: 1px solid rgba(255,255,255,0.05);
    }
    
    .subnet-header {
        color: #667eea;
        font-weight: 600;
        margin-bottom: 10px;
        font-size: 0.9em;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    
    .server-list {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }
    
    .server-chip {
        background: rgba(102,126,234,0.1);
        color: #667eea;
        padding: 10px 15px;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.3s;
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(102,126,234,0.2);
    }
    
    .server-chip:hover {
        background: rgba(102,126,234,0.2);
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(102,126,234,0.1);
    }
    
    .server-ip {
        font-weight: 500;
    }
    
    .server-badge {
        background: rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.7);
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 0.8em;
    }
    
    .servers-footer {
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid rgba(255,255,255,0.1);
        text-align: center;
    }
    
    .hint {
        color: rgba(255,255,255,0.5);
        font-size: 0.9em;
        margin-bottom: 15px;
    }
    
    .rescan-btn {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 10px;
        padding: 10px 20px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s;
    }
    
    .rescan-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(102,126,234,0.3);
    }
    
    .rescan-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    }
    
    .scan-item {
        color: #4CAF50;
        border-top: 1px solid rgba(255,255,255,0.1);
        margin-top: 5px;
        padding-top: 10px;
    }
    
    .scan-item:hover {
        background: rgba(76,175,80,0.1);
        color: #4CAF50;
    }
    
    .no-match {
        cursor: default;
    }
    
    .no-match:hover {
        background: transparent;
    }
`;
document.head.appendChild(style);

console.log('Deployment Tracker initialized successfully!');
