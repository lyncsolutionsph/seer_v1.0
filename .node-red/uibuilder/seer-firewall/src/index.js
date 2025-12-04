/** SEER Firewall Management Interface
 * Manages firewall configuration based on nftables.conf
 */

// API Configuration
const API_CONFIG = {
    // Manual override: Set this to your Raspberry Pi's IP if auto-detect doesn't work
    // Example: 'http://192.168.50.1:5000' or leave null for auto-detect
    manualUrl: null,

    // Auto-detect based on current hostname
    get baseUrl() {
        // Use manual URL if provided
        if (this.manualUrl) {
            return this.manualUrl;
        }

        // Auto-detect: if browsing from localhost, use localhost
        // Otherwise use the current hostname (works when accessing via Pi's IP or hostname)
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') {
            return 'http://localhost:5000';
        }
        return `http://${hostname}:5000`;
    },

    timeout: 5000 // 5 second timeout
};

// Firewall configuration data from nftables.conf
const seerFirewallConfig = {
    interfaces: {
        wan: 'eth1',
        lan: 'br0',
        loop: 'lo',
        lanNetwork: '192.168.50.0/24',
        tailnet: '100.64.0.0/10'
    },
    policyRules: [
        { id: 1, policy: 'DHCP Traffic', source: 'LAN/WAN', destination: 'Firewall', type: 'DHCP', protocol: 'UDP', action: 'ACCEPT', nat: 'No', enabled: true, schedule: 'Always', usage: 'Critical' },
        { id: 2, policy: 'Blacklist Drop', source: 'Any', destination: 'Any', type: 'Blacklist', protocol: 'All', action: 'DROP', nat: 'No', enabled: true, schedule: 'Always', usage: 'Security' },
        { id: 3, policy: 'Invalid Packets', source: 'Any', destination: 'Any', type: 'Invalid', protocol: 'All', action: 'DROP', nat: 'No', enabled: true, schedule: 'Always', usage: 'Security' },
        { id: 4, policy: 'Loopback', source: 'Loopback', destination: 'Loopback', type: 'Local', protocol: 'All', action: 'ACCEPT', nat: 'No', enabled: true, schedule: 'Always', usage: 'System' },
        { id: 5, policy: 'Established Connections', source: 'Any', destination: 'Any', type: 'Stateful', protocol: 'All', action: 'ACCEPT', nat: 'No', enabled: true, schedule: 'Always', usage: 'Critical' },
        { id: 6, policy: 'WAN Rate Limit', source: 'WAN', destination: 'Firewall', type: 'DoS Protection', protocol: 'All', action: 'RATE-LIMIT', nat: 'No', enabled: true, schedule: 'Always', usage: 'Security' },
        { id: 7, policy: 'SYN Flood Protection', source: 'WAN', destination: 'Firewall', type: 'DoS Protection', protocol: 'TCP', action: 'RATE-LIMIT', nat: 'No', enabled: true, schedule: 'Always', usage: 'Security' },
        { id: 8, policy: 'Anti-Spoofing', source: 'WAN', destination: 'Any', type: 'RFC Validation', protocol: 'All', action: 'DROP', nat: 'No', enabled: true, schedule: 'Always', usage: 'Security' },
        { id: 9, policy: 'Node-RED Access', source: 'Tailnet', destination: 'Firewall:1880', type: 'Service', protocol: 'TCP', action: 'ACCEPT', nat: 'No', enabled: true, schedule: 'Always', usage: 'Management' },
        { id: 10, policy: 'Temporal Policy', source: 'Tailnet/LAN', destination: 'Firewall:1889', type: 'Service', protocol: 'TCP', action: 'ACCEPT', nat: 'No', enabled: true, schedule: 'Always', usage: 'Management' },
        { id: 11, policy: 'FastAPI', source: 'Tailnet/LAN', destination: 'Firewall:5000', type: 'Service', protocol: 'TCP', action: 'ACCEPT', nat: 'No', enabled: true, schedule: 'Always', usage: 'API' },
        { id: 12, policy: 'LAN Access', source: 'LAN', destination: 'Firewall', type: 'Local Network', protocol: 'All', action: 'ACCEPT', nat: 'No', enabled: true, schedule: 'Always', usage: 'Network' },
        { id: 13, policy: 'DNS Queries', source: 'LAN', destination: 'Firewall:53', type: 'DNS', protocol: 'UDP/TCP', action: 'ACCEPT', nat: 'No', enabled: true, schedule: 'Always', usage: 'Network' },
        { id: 14, policy: 'ICMP Rate Limit', source: 'WAN', destination: 'Firewall', type: 'ICMP', protocol: 'ICMP', action: 'RATE-LIMIT', nat: 'No', enabled: true, schedule: 'Always', usage: 'Network' },
        { id: 15, policy: 'SSH Access', source: 'Tailnet/WAN', destination: 'Firewall:22', type: 'SSH', protocol: 'TCP', action: 'RATE-LIMIT', nat: 'No', enabled: true, schedule: 'Always', usage: 'Management' },
        { id: 16, policy: 'LAN to WAN Forward', source: 'LAN', destination: 'WAN', type: 'Forward', protocol: 'All', action: 'ACCEPT', nat: 'Yes', enabled: true, schedule: 'Always', usage: 'Routing' },
        { id: 17, policy: 'Firewall Outbound', source: 'Firewall', destination: 'WAN', type: 'Output', protocol: 'HTTP/HTTPS/DNS/NTP', action: 'ACCEPT', nat: 'No', enabled: true, schedule: 'Always', usage: 'System' }
    ],
    ports: [
        { service: 'SSH', port: 22, protocol: 'TCP', access: 'Tailnet + WAN (rate-limited)' },
        { service: 'DNS', port: 53, protocol: 'UDP/TCP', access: 'LAN' },
        { service: 'DHCP Server', port: 67, protocol: 'UDP', access: 'LAN' },
        { service: 'DHCP Client', port: 68, protocol: 'UDP', access: 'WAN' },
        { service: 'HTTP', port: 80, protocol: 'TCP', access: 'Outbound' },
        { service: 'NTP', port: 123, protocol: 'UDP', access: 'Outbound' },
        { service: 'HTTPS', port: 443, protocol: 'TCP', access: 'Outbound' },
        { service: 'Node-RED', port: 1880, protocol: 'TCP', access: 'Tailnet + LAN' },
        { service: 'Temporal Policy', port: 1889, protocol: 'TCP', access: 'Tailnet + LAN' },
        { service: 'FastAPI', port: 5000, protocol: 'TCP', access: 'Tailnet + LAN' }
    ],
    inputRules: [
        { order: 1, rule: 'DHCP traffic (LAN & WAN)', source: 'LAN/WAN', destination: 'Firewall', protocol: 'UDP', port: '67-68', action: 'ACCEPT', priority: 'Critical' },
        { order: 2, rule: 'Drop blacklisted IPs', source: 'Blacklist', destination: 'Any', protocol: 'All', port: 'Any', action: 'DROP', priority: 'High' },
        { order: 3, rule: 'Drop invalid packets', source: 'Any', destination: 'Any', protocol: 'All', port: 'Any', action: 'DROP', priority: 'High' },
        { order: 4, rule: 'Allow loopback', source: 'lo', destination: 'lo', protocol: 'All', port: 'Any', action: 'ACCEPT', priority: 'Critical' },
        { order: 5, rule: 'Established/related connections', source: 'Any', destination: 'Any', protocol: 'All', port: 'Any', action: 'ACCEPT', priority: 'Critical' },
        { order: 6, rule: 'WAN connection rate limit', source: 'WAN', destination: 'Firewall', protocol: 'All', port: 'Any', action: 'RATE-LIMIT', priority: 'High' },
        { order: 7, rule: 'SYN flood protection', source: 'WAN', destination: 'Firewall', protocol: 'TCP', port: 'Any', action: 'RATE-LIMIT', priority: 'High' },
        { order: 8, rule: 'Anti-spoofing (RFC 1918)', source: 'WAN', destination: 'Any', protocol: 'All', port: 'Any', action: 'DROP', priority: 'High' },
        { order: 9, rule: 'TCP flag validation', source: 'Any', destination: 'Any', protocol: 'TCP', port: 'Any', action: 'DROP', priority: 'Medium' },
        { order: 10, rule: 'Node-RED access', source: 'Tailnet', destination: 'Firewall', protocol: 'TCP', port: '1880', action: 'ACCEPT', priority: 'Medium' },
        { order: 11, rule: 'Temporal Policy access', source: 'Tailnet', destination: 'Firewall', protocol: 'TCP', port: '1889', action: 'ACCEPT', priority: 'Medium' },
        { order: 12, rule: 'FastAPI access', source: 'Tailnet', destination: 'Firewall', protocol: 'TCP', port: '5000', action: 'ACCEPT', priority: 'Medium' },
        { order: 13, rule: 'Temporal Policy (LAN)', source: 'LAN', destination: 'Firewall', protocol: 'TCP', port: '1889', action: 'ACCEPT', priority: 'Medium' },
        { order: 14, rule: 'FastAPI (LAN)', source: 'LAN', destination: 'Firewall', protocol: 'TCP', port: '5000', action: 'ACCEPT', priority: 'Medium' },
        { order: 15, rule: 'Allow all LAN traffic', source: 'LAN', destination: 'Firewall', protocol: 'All', port: 'Any', action: 'ACCEPT', priority: 'Medium' },
        { order: 16, rule: 'DNS queries', source: 'LAN', destination: 'Firewall', protocol: 'UDP/TCP', port: '53', action: 'ACCEPT', priority: 'Medium' },
        { order: 17, rule: 'ICMP rate limiting', source: 'WAN', destination: 'Firewall', protocol: 'ICMP', port: 'N/A', action: 'RATE-LIMIT', priority: 'Low' },
        { order: 18, rule: 'SSH rate limiting', source: 'Tailnet/WAN', destination: 'Firewall', protocol: 'TCP', port: '22', action: 'RATE-LIMIT', priority: 'Medium' },
        { order: 19, rule: 'Log and drop all other', source: 'Any', destination: 'Any', protocol: 'All', port: 'Any', action: 'LOG-DROP', priority: 'Low' }
    ],
    forwardRules: [
        { order: 1, rule: 'Drop blacklisted IPs', source: 'Blacklist', destination: 'Any', protocol: 'All', port: 'Any', action: 'DROP', priority: 'High' },
        { order: 2, rule: 'Drop invalid packets', source: 'Any', destination: 'Any', protocol: 'All', port: 'Any', action: 'DROP', priority: 'High' },
        { order: 3, rule: 'Established/related connections', source: 'Any', destination: 'Any', protocol: 'All', port: 'Any', action: 'ACCEPT', priority: 'Critical' },
        { order: 4, rule: 'WAN connection rate limit', source: 'WAN', destination: 'Any', protocol: 'All', port: 'Any', action: 'RATE-LIMIT', priority: 'High' },
        { order: 5, rule: 'SYN flood protection', source: 'WAN', destination: 'Any', protocol: 'TCP', port: 'Any', action: 'RATE-LIMIT', priority: 'High' },
        { order: 6, rule: 'LAN → WAN (outbound)', source: 'LAN', destination: 'WAN', protocol: 'All', port: 'Any', action: 'ACCEPT', priority: 'Medium' },
        { order: 7, rule: 'Drop WAN → LAN (unsolicited)', source: 'WAN', destination: 'LAN', protocol: 'All', port: 'Any', action: 'LOG-DROP', priority: 'Medium' }
    ],
    outputRules: [
        { order: 1, rule: 'Allow loopback', source: 'Firewall', destination: 'lo', protocol: 'All', port: 'Any', action: 'ACCEPT', priority: 'Critical' },
        { order: 2, rule: 'DHCP server responses', source: 'Firewall', destination: 'LAN', protocol: 'UDP', port: '67-68', action: 'ACCEPT', priority: 'Critical' },
        { order: 3, rule: 'Established/related connections', source: 'Firewall', destination: 'Any', protocol: 'All', port: 'Any', action: 'ACCEPT', priority: 'Critical' },
        { order: 4, rule: 'Drop invalid packets', source: 'Firewall', destination: 'Any', protocol: 'All', port: 'Any', action: 'DROP', priority: 'High' },
        { order: 5, rule: 'Firewall → LAN', source: 'Firewall', destination: 'LAN', protocol: 'All', port: 'Any', action: 'ACCEPT', priority: 'Medium' },
        { order: 6, rule: 'DHCP client on WAN', source: 'Firewall', destination: 'WAN', protocol: 'UDP', port: '67-68', action: 'ACCEPT', priority: 'Medium' },
        { order: 7, rule: 'DNS/NTP on WAN', source: 'Firewall', destination: 'WAN', protocol: 'UDP', port: '53,123', action: 'ACCEPT', priority: 'Medium' },
        { order: 8, rule: 'HTTP/HTTPS on WAN', source: 'Firewall', destination: 'WAN', protocol: 'TCP', port: '80,443', action: 'ACCEPT', priority: 'Medium' },
        { order: 9, rule: 'Log unexpected output', source: 'Firewall', destination: 'Any', protocol: 'All', port: 'Any', action: 'LOG', priority: 'Medium' }
    ],
    blacklist: []
};

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function () {
    console.log('SEER Firewall Management loaded');
    console.log('DOM Content Loaded - Initializing...');

    // Check if uibuilder is available
    if (typeof uibuilder !== 'undefined') {
        // Initialize uibuilder
        uibuilder.start();
        console.log('UIBuilder started');
    } else {
        console.warn('UIBuilder not available - running in standalone mode');
    }

    // Initialize the interface
    initializeFirewallUI();

    // Set up event listeners
    setupEventListeners();

    // Request firewall status from Node-RED (if uibuilder available)
    if (typeof uibuilder !== 'undefined') {
        requestFirewallStatus();
        // Auto-refresh every 30 seconds
        setInterval(requestFirewallStatus, 30000);
    }
});

// Listen for incoming messages from Node-RED
if (typeof uibuilder !== 'undefined') {
    uibuilder.onChange('msg', (msg) => {
        console.log('Received message:', msg);

        if (msg.topic === 'firewallStatus') {
            updateFirewallStatus(msg.payload);
        } else if (msg.topic === 'blacklistUpdate') {
            updateBlacklist(msg.payload);
        } else if (msg.topic === 'configReloaded') {
            showNotification('Configuration reloaded successfully', 'success');
        } else if (msg.topic === 'error') {
            showNotification(msg.payload.message || 'An error occurred', 'error');
        }
    });
}

// Initialize the firewall UI with static data from nftables.conf
function initializeFirewallUI() {
    console.log('Initializing Firewall UI...');

    // Load rules from API first, then display
    loadPolicyRulesFromAPI()
        .then(() => {
            console.log('Policy Rules:', seerFirewallConfig.policyRules.length);
            displayPolicyRules();
            loadCustomRules();
        })
        .catch(error => {
            console.error('Failed to load rules from API, using default config:', error);
            // Fallback to displaying hardcoded rules if API fails
            displayPolicyRules();
            loadCustomRules();
        });
}

// Load policy rules from API
async function loadPolicyRulesFromAPI() {
    const apiUrl = API_CONFIG.baseUrl + '/api/rules';

    console.log('═══ API CONNECTION DEBUG ═══');
    console.log('Current hostname:', window.location.hostname);
    console.log('Current full URL:', window.location.href);
    console.log('Detected API URL:', API_CONFIG.baseUrl);
    console.log('Fetching rules from:', apiUrl);
    console.log('═══════════════════════════');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

        const response = await fetch(apiUrl, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error('API returned status: ' + response.status);
        }

        const data = await response.json();

        console.log('API Response:', data);
        console.log('data.success:', data.success);
        console.log('data.rules:', data.rules);

        if (data.success && data.rules) {
            // Map database fields to UI format
            seerFirewallConfig.policyRules = data.rules.map(rule => ({
                id: rule.id,
                policy: rule.policy,
                source: rule.source,
                destination: rule.destination,
                type: rule.type,
                protocol: rule.protocol,
                action: rule.action,
                nat: rule.nat_enabled === 1 ? 'Yes' : 'No',
                enabled: rule.rule_enabled === 1,
                schedule: rule.schedule,
                usage: rule.usage
            }));

            console.log('✓ Loaded ' + data.rules.length + ' rules from API');
            showAPIStatus(true);
        } else {
            throw new Error('Invalid API response format');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('API request timed out after ' + API_CONFIG.timeout + 'ms');
            showNotification('API connection timeout. Using cached rules.', 'warning');
        } else {
            console.error('Error loading rules from API:', error);
        }
        showAPIStatus(false);
        throw error;
    }
}

// Display policy rules in table format
function displayPolicyRules() {
    const tableBody = document.getElementById('policy-table-body');
    if (!tableBody) {
        console.error('Policy table body not found');
        return;
    }

    tableBody.innerHTML = '';

    // Define toggleable services with user-friendly descriptions
    const toggleableServices = [
        {
            id: 15,
            name: 'SSH Access',
            description: 'Secure Shell remote access',
            details: 'SSH access with rate limiting for remote management',
            port: '22',
            usage: 'Administration'
        },
        {
            id: 9,
            name: 'SEER Web Interface',
            description: 'SEER management web interface',
            details: 'Access to SEER control panel from Tailscale network',
            port: '1880',
            usage: 'Management'
        },
        {
            id: 16,
            name: 'LAN to WAN NAT',
            description: 'Internet access for LAN devices (NAT/Masquerading)',
            details: 'Enables LAN devices to access the internet through the firewall',
            port: 'N/A',
            usage: 'Routing'
        }
    ];

    // Filter rules to show only toggleable ones
    const displayRules = seerFirewallConfig.policyRules.filter(rule =>
        toggleableServices.some(service => service.id === rule.id)
    );

    if (displayRules.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 20px;">No services available</td></tr>';
        return;
    }

    displayRules.forEach((rule) => {
        const serviceInfo = toggleableServices.find(s => s.id === rule.id);
        if (!serviceInfo) return;

        const row = document.createElement('tr');
        row.dataset.ruleId = rule.id;

        // Description column
        const descCell = document.createElement('td');
        descCell.className = 'description-col';
        descCell.style.padding = '15px';

        const titleDiv = document.createElement('div');
        titleDiv.style.fontWeight = 'bold';
        titleDiv.style.fontSize = '14px';
        titleDiv.style.marginBottom = '5px';
        titleDiv.textContent = serviceInfo.description;

        const detailsDiv = document.createElement('div');
        detailsDiv.style.fontSize = '12px';
        detailsDiv.style.color = '#7f8c8d';
        detailsDiv.textContent = serviceInfo.details;

        descCell.appendChild(titleDiv);
        descCell.appendChild(detailsDiv);
        row.appendChild(descCell);

        // Port column
        const portCell = document.createElement('td');
        portCell.className = 'port-col';
        portCell.style.textAlign = 'center';
        portCell.style.fontWeight = '600';
        portCell.textContent = serviceInfo.port;
        row.appendChild(portCell);

        // Usage column
        const usageCell = document.createElement('td');
        usageCell.className = 'usage-col';
        usageCell.style.textAlign = 'center';
        usageCell.textContent = serviceInfo.usage;
        row.appendChild(usageCell);

        // Toggle column
        const toggleCell = document.createElement('td');
        toggleCell.className = 'toggle-col';
        toggleCell.style.textAlign = 'center';
        toggleCell.style.width = '120px';

        // Determine which toggle to show (NAT or Enable)
        const fieldType = serviceInfo.id === 16 ? 'nat_enabled' : 'rule_enabled';
        const isEnabled = serviceInfo.id === 16 ? (rule.nat === 'Yes') : rule.enabled;

        const toggle = createToggleButton(isEnabled, 'toggle-' + rule.id, rule.id, fieldType);
        toggleCell.appendChild(toggle);
        row.appendChild(toggleCell);

        tableBody.appendChild(row);
    });

    console.log('Successfully displayed ' + displayRules.length + ' toggleable services');
}

// Create toggle button (ON/OFF switch)
function createToggleButton(isOn, toggleId, ruleId, fieldType) {
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'toggle-switch';
    toggleContainer.dataset.toggleId = toggleId;
    toggleContainer.dataset.ruleId = ruleId;
    toggleContainer.dataset.fieldType = fieldType;
    toggleContainer.dataset.state = isOn ? 'on' : 'off';

    const toggleButton = document.createElement('button');
    toggleButton.className = 'toggle-btn ' + (isOn ? 'on' : 'off');
    toggleButton.textContent = isOn ? 'ON' : 'OFF';
    toggleButton.style.backgroundColor = isOn ? '#27ae60' : '#e74c3c';
    toggleButton.style.color = 'white';
    toggleButton.style.border = 'none';
    toggleButton.style.padding = '4px 12px';
    toggleButton.style.borderRadius = '12px';
    toggleButton.style.cursor = 'pointer';
    toggleButton.style.fontSize = '11px';
    toggleButton.style.fontWeight = 'bold';
    toggleButton.style.minWidth = '45px';

    toggleButton.onclick = function () {
        const currentState = toggleContainer.dataset.state === 'on';
        const newState = !currentState;

        // Get service name for confirmation
        const row = toggleButton.closest('tr');
        const serviceDesc = row.querySelector('.description-col div').textContent;

        // Show confirmation modal
        const action = newState ? 'ENABLE' : 'DISABLE';
        const warning = !newState ? 'This may affect network connectivity and active connections.' : '';

        showConfirmationModal(
            `${action} Service`,
            `Are you sure you want to ${action.toLowerCase()} this service?\n\n"${serviceDesc}"`,
            warning,
            () => {
                // User confirmed - proceed with toggle
                executeToggle();
            }
        );

        function executeToggle() {
            // Disable button during API call
            toggleButton.disabled = true;
            toggleButton.style.opacity = '0.6';
            toggleButton.style.cursor = 'wait';
            toggleButton.textContent = '...';

            // Call API to update rule
            updateRuleState(ruleId, fieldType, newState ? 1 : 0)
                .then(response => {
                    if (response.success) {
                        // Update UI
                        toggleContainer.dataset.state = newState ? 'on' : 'off';
                        toggleButton.className = 'toggle-btn ' + (newState ? 'on' : 'off');
                        toggleButton.textContent = newState ? 'ON' : 'OFF';
                        toggleButton.style.backgroundColor = newState ? '#27ae60' : '#e74c3c';

                        // Update local config to reflect new state
                        const ruleIndex = seerFirewallConfig.policyRules.findIndex(r => r.id === ruleId);
                        if (ruleIndex !== -1) {
                            if (fieldType === 'rule_enabled') {
                                seerFirewallConfig.policyRules[ruleIndex].enabled = newState;
                            } else if (fieldType === 'nat_enabled') {
                                seerFirewallConfig.policyRules[ruleIndex].nat = newState ? 'Yes' : 'No';
                            }
                        }

                        const actionText = newState ? 'enabled' : 'disabled';
                        showToast(`✓ Service ${actionText} successfully. Firewall rules updated.`, 'success');
                    } else {
                        showToast('Failed to update rule: ' + (response.error || 'Unknown error'), 'error');
                    }
                })
                .catch(error => {
                    console.error('Error updating rule:', error);
                    showToast('Network error: Unable to update rule', 'error');
                })
                .finally(() => {
                    // Re-enable button
                    toggleButton.disabled = false;
                    toggleButton.style.opacity = '1';
                    toggleButton.style.cursor = 'pointer';
                });
        }
    };

    toggleContainer.appendChild(toggleButton);
    return toggleContainer;
}

// API call to update rule state
async function updateRuleState(ruleId, fieldType, value) {
    const apiUrl = API_CONFIG.baseUrl + '/api/rules/' + ruleId + '/toggle';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

        const response = await fetch(apiUrl, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                field: fieldType,
                value: value
            })
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'HTTP ' + response.status }));
            return { success: false, error: errorData.error || 'Server error' };
        }

        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);

        let errorMessage = 'Failed to fetch';
        if (error.name === 'AbortError') {
            errorMessage = 'Request timeout - API not responding';
        } else if (error.message.includes('fetch')) {
            errorMessage = 'Cannot connect to API at ' + API_CONFIG.baseUrl + '. Make sure the Flask API is running.';
        } else {
            errorMessage = error.message;
        }

        return { success: false, error: errorMessage };
    }
}

// Toggle select all checkboxes
function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('select-all');
    const checkboxes = document.querySelectorAll('.rule-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
        const row = checkbox.closest('tr');
        if (row) {
            if (selectAllCheckbox.checked) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        }
    });
}

// Add new rule
function addRule() {
    showNotification('Add Rule functionality - to be implemented', 'info');
}

// Delete selected rules
function deleteSelectedRules() {
    const selectedCheckboxes = document.querySelectorAll('.rule-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        showNotification('Please select rules to delete', 'error');
        return;
    }

    if (confirm('Are you sure you want to delete ' + selectedCheckboxes.length + ' rule(s)?')) {
        showNotification('Delete functionality - to be implemented', 'info');
    }
}

// Edit selected rule
function editSelectedRule() {
    const selectedCheckboxes = document.querySelectorAll('.rule-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        showNotification('Please select a rule to edit', 'error');
        return;
    }
    if (selectedCheckboxes.length > 1) {
        showNotification('Please select only one rule to edit', 'error');
        return;
    }

    showNotification('Edit functionality - to be implemented', 'info');
}

// Setup event listeners
function setupEventListeners() {
    // Add to blacklist
    const addBlacklistBtn = document.getElementById('add-blacklist-btn');
    if (addBlacklistBtn) {
        addBlacklistBtn.addEventListener('click', addToBlacklist);
    }

    // Enter key on blacklist input
    const blacklistInput = document.getElementById('blacklist-ip');
    if (blacklistInput) {
        blacklistInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addToBlacklist();
            }
        });
    }

    // Reload configuration
    const reloadBtn = document.getElementById('reload-config-btn');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', reloadConfiguration);
    }

    // View logs
    const viewLogsBtn = document.getElementById('view-logs-btn');
    if (viewLogsBtn) {
        viewLogsBtn.addEventListener('click', viewLogs);
    }

    // Export configuration
    const exportBtn = document.getElementById('export-config-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportConfiguration);
    }

    // Add custom rule button
    const addCustomRuleBtn = document.getElementById('add-custom-rule-btn');
    if (addCustomRuleBtn) {
        addCustomRuleBtn.addEventListener('click', showAddRuleModal);
    }

    // Delete custom rule button
    const deleteCustomRuleBtn = document.getElementById('delete-custom-rule-btn');
    if (deleteCustomRuleBtn) {
        deleteCustomRuleBtn.addEventListener('click', deleteCustomRules);
    }

    // Select all custom rules checkbox
    const selectAllCustom = document.getElementById('select-all-custom');
    if (selectAllCustom) {
        selectAllCustom.addEventListener('change', toggleSelectAllCustom);
    }
}

// Request firewall status from Node-RED
function requestFirewallStatus() {
    if (typeof uibuilder !== 'undefined') {
        uibuilder.send({
            topic: 'getFirewallStatus',
            payload: {}
        });
    }
}

// Update firewall status
function updateFirewallStatus(status) {
    if (status.blacklist) {
        seerFirewallConfig.blacklist = status.blacklist;
        displayBlacklist();
        const blacklistCountElem = document.getElementById('blacklist-count');
        if (blacklistCountElem) {
            blacklistCountElem.textContent = status.blacklist.length;
        }
    }

    if (status.rateLimited !== undefined) {
        const rateLimitCountElem = document.getElementById('ratelimit-count');
        if (rateLimitCountElem) {
            rateLimitCountElem.textContent = status.rateLimited;
        }
    }
}

// Add IP to blacklist
function addToBlacklist() {
    const blacklistIpInput = document.getElementById('blacklist-ip');
    if (!blacklistIpInput) return;
    const ipAddress = blacklistIpInput.value.trim();

    if (!ipAddress) {
        showNotification('Please enter an IP address', 'error');
        return;
    }

    // Basic IP validation
    if (!isValidIP(ipAddress)) {
        showNotification('Invalid IP address format', 'error');
        return;
    }

    // Send to Node-RED
    if (typeof uibuilder !== 'undefined') {
        uibuilder.send({
            topic: 'addBlacklist',
            payload: { ip: ipAddress }
        });
    } else {
        showNotification('UIBuilder not available', 'error');
    }

    blacklistIpInput.value = '';
}

// Remove IP from blacklist
function removeFromBlacklist(ipAddress) {
    if (typeof uibuilder !== 'undefined') {
        uibuilder.send({
            topic: 'removeBlacklist',
            payload: { ip: ipAddress }
        });
    } else {
        showNotification('UIBuilder not available', 'error');
    }
}

// Update and display blacklist
function updateBlacklist(blacklistData) {
    seerFirewallConfig.blacklist = blacklistData;
    displayBlacklist();
    const blacklistCountElem = document.getElementById('blacklist-count');
    if (blacklistCountElem) {
        blacklistCountElem.textContent = blacklistData.length;
    }
}

// Display blacklist
function displayBlacklist() {
    const blacklistBodyContainer = document.getElementById('blacklist-body');
    if (!blacklistBodyContainer) return;

    if (seerFirewallConfig.blacklist.length === 0) {
        blacklistBodyContainer.innerHTML = '<tr><td colspan="4" class="no-data">No blacklisted IPs</td></tr>';
        return;
    }

    blacklistBodyContainer.innerHTML = '';

    seerFirewallConfig.blacklist.forEach(item => {
        const blacklistRow = document.createElement('tr');

        const ipType = item.ip.includes(':') ? 'IPv6' : 'IPv4';
        const addedTime = item.added ? new Date(item.added).toLocaleString() : 'N/A';

        blacklistRow.innerHTML = '<td>' + escapeHtml(item.ip) + '</td>' +
            '<td>' + ipType + '</td>' +
            '<td>' + addedTime + '</td>' +
            '<td><button class="remove-btn" onclick="removeFromBlacklist(\'' + escapeHtml(item.ip) + '\')">Remove</button></td>';

        blacklistBodyContainer.appendChild(blacklistRow);
    });
}

// Reload firewall configuration
function reloadConfiguration() {
    if (confirm('Are you sure you want to reload the firewall configuration? This may temporarily disrupt network connectivity.')) {
        if (typeof uibuilder !== 'undefined') {
            uibuilder.send({
                topic: 'reloadFirewall',
                payload: {}
            });
            showNotification('Reloading firewall configuration...', 'info');
        } else {
            showNotification('UIBuilder not available', 'error');
        }
    }
}

// View firewall logs
function viewLogs() {
    window.location.href = '/seer-dashboard/';
}

// Export configuration
function exportConfiguration() {
    if (typeof uibuilder !== 'undefined') {
        uibuilder.send({
            topic: 'exportConfig',
            payload: {}
        });
        showNotification('Configuration export requested', 'info');
    } else {
        showNotification('UIBuilder not available', 'error');
    }
}

// Show add custom rule modal
function showAddRuleModal() {
    const modal = document.getElementById('add-rule-modal');
    const cancelBtn = document.getElementById('add-rule-cancel');
    const saveBtn = document.getElementById('add-rule-save');

    // Clear form
    document.getElementById('rule-name').value = '';
    document.getElementById('rule-description').value = '';
    document.getElementById('rule-port').value = '';
    document.getElementById('rule-protocol').value = 'TCP';
    document.getElementById('rule-usage').value = 'Management';
    document.getElementById('rule-action').value = 'ACCEPT';
    document.getElementById('rule-access-lan').checked = true;
    document.getElementById('rule-access-tailnet').checked = true;
    document.getElementById('rule-access-wan').checked = false;

    modal.style.display = 'flex';

    // Cancel handler
    const cancelHandler = () => {
        modal.style.display = 'none';
        cancelBtn.removeEventListener('click', cancelHandler);
        saveBtn.removeEventListener('click', saveHandler);
    };

    // Save handler
    const saveHandler = () => {
        const name = document.getElementById('rule-name').value.trim();
        const description = document.getElementById('rule-description').value.trim();
        const port = document.getElementById('rule-port').value.trim();
        const protocol = document.getElementById('rule-protocol').value;
        const usage = document.getElementById('rule-usage').value;
        const action = document.getElementById('rule-action').value;
        const accessLan = document.getElementById('rule-access-lan').checked;
        const accessTailnet = document.getElementById('rule-access-tailnet').checked;
        const accessWan = document.getElementById('rule-access-wan').checked;

        // Validation
        if (!name) {
            showToast('Please enter a service name', 'error');
            return;
        }
        if (!port) {
            showToast('Please enter a port number', 'error');
            return;
        }

        // Validate port is a number
        const portNum = parseInt(port);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
            showToast('Port must be a number between 1 and 65535', 'error');
            return;
        }

        if (!accessLan && !accessTailnet && !accessWan) {
            showToast('Please select at least one access source', 'error');
            return;
        }

        // Build access string
        const accessParts = [];
        if (accessLan) accessParts.push('LAN');
        if (accessTailnet) accessParts.push('Tailscale');
        if (accessWan) accessParts.push('WAN');
        const accessFrom = accessParts.join(' + ');

        // Send to API to create custom rule
        modal.style.display = 'none';
        showToast('Adding custom rule...', 'info');

        const apiUrl = API_CONFIG.baseUrl + '/api/custom-rules';

        fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                description: description,
                port: port,
                protocol: protocol,
                usage: usage,
                action: action,
                accessFrom: accessFrom,
                accessLan: accessLan,
                accessTailnet: accessTailnet,
                accessWan: accessWan
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('✓ Custom rule added and applied immediately (no reboot needed)', 'success');
                    loadCustomRules();
                } else {
                    showToast('Failed to add rule: ' + (data.error || 'Unknown error'), 'error');
                }
            })
            .catch(error => {
                console.error('Error adding rule:', error);
                showToast('Network error: Unable to add rule', 'error');
            })

        cancelBtn.removeEventListener('click', cancelHandler);
        saveBtn.removeEventListener('click', saveHandler);
    };

    cancelBtn.addEventListener('click', cancelHandler);
    saveBtn.addEventListener('click', saveHandler);

    // Close on outside click
    modal.onclick = (e) => {
        if (e.target === modal) {
            cancelHandler();
        }
    };
}

// Delete custom rules
function deleteCustomRules() {
    const checkboxes = document.querySelectorAll('#custom-rules-table-body input[type="checkbox"]:checked');

    if (checkboxes.length === 0) {
        showToast('Please select at least one rule to delete', 'error');
        return;
    }

    const ruleIds = Array.from(checkboxes).map(cb => cb.dataset.ruleId);
    const ruleNames = Array.from(checkboxes).map(cb => {
        const row = cb.closest('tr');
        return row.querySelector('.description-col div').textContent;
    });

    showConfirmationModal(
        'Delete Custom Rules',
        `Are you sure you want to delete ${ruleIds.length} custom rule(s)?\n\n${ruleNames.join('\n')}`,
        'This action cannot be undone. The firewall rules will be removed immediately.',
        () => {
            showToast('Deleting custom rules...', 'info');

            // Delete each rule via API
            const deletePromises = ruleIds.map(ruleId => {
                const apiUrl = API_CONFIG.baseUrl + '/api/custom-rules/' + ruleId;
                return fetch(apiUrl, { method: 'DELETE' })
                    .then(response => response.json());
            });

            Promise.all(deletePromises)
                .then(results => {
                    const allSuccess = results.every(r => r.success);
                    if (allSuccess) {
                        showToast('✓ Custom rule(s) deleted successfully', 'success');
                        loadCustomRules();
                    } else {
                        showToast('Some rules failed to delete', 'warning');
                        loadCustomRules();
                    }
                })
                .catch(error => {
                    console.error('Error deleting rules:', error);
                    showToast('Network error: Unable to delete rules', 'error');
                });
        }
    );
}

// Toggle select all custom rules
function toggleSelectAllCustom() {
    const selectAll = document.getElementById('select-all-custom');
    const checkboxes = document.querySelectorAll('#custom-rules-table-body input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = selectAll.checked;
    });
}

// Load custom rules from API
function loadCustomRules() {
    const apiUrl = API_CONFIG.baseUrl + '/api/custom-rules';

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayCustomRules(data.rules);
            } else {
                console.error('Failed to load custom rules:', data.error);
                displayCustomRules([]);
            }
        })
        .catch(error => {
            console.error('Error loading custom rules:', error);
            displayCustomRules([]);
        });
}

// Display custom rules in table
function displayCustomRules(rules) {
    const tableBody = document.getElementById('custom-rules-table-body');
    if (!tableBody) return;

    // Clear table
    tableBody.innerHTML = '';

    if (!rules || rules.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #7f8c8d;">No custom rules defined. Click "+ Add Custom Rule" to create one.</td></tr>';
        return;
    }

    rules.forEach((rule) => {
        const row = document.createElement('tr');
        row.dataset.ruleId = rule.id;

        // Checkbox column
        const checkboxCell = document.createElement('td');
        checkboxCell.style.textAlign = 'center';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.ruleId = rule.id;
        checkboxCell.appendChild(checkbox);
        row.appendChild(checkboxCell);

        // Description column
        const descCell = document.createElement('td');
        descCell.className = 'description-col';
        descCell.style.padding = '15px';

        const titleDiv = document.createElement('div');
        titleDiv.style.fontWeight = 'bold';
        titleDiv.style.fontSize = '14px';
        titleDiv.style.marginBottom = '5px';
        titleDiv.textContent = rule.name || rule.description;

        const detailsDiv = document.createElement('div');
        detailsDiv.style.fontSize = '12px';
        detailsDiv.style.color = '#7f8c8d';

        // Build access string from flags if accessFrom is empty
        let accessDisplay = rule.accessFrom;
        if (!accessDisplay || accessDisplay === 'N/A') {
            const accessParts = [];
            if (rule.access_lan || rule.accessLan) accessParts.push('LAN');
            if (rule.access_tailnet || rule.accessTailnet) accessParts.push('Tailscale');
            if (rule.access_wan || rule.accessWan) accessParts.push('WAN');
            accessDisplay = accessParts.length > 0 ? accessParts.join(' + ') : 'N/A';
        }

        // Show action type and access
        const actionText = rule.action === 'DROP' ? 'BLOCK' : 'ALLOW';
        detailsDiv.textContent = rule.details || `${actionText} • Access from: ${accessDisplay}`;

        descCell.appendChild(titleDiv);
        descCell.appendChild(detailsDiv);
        row.appendChild(descCell);

        // Port column
        const portCell = document.createElement('td');
        portCell.className = 'port-col';
        portCell.style.textAlign = 'center';
        portCell.style.fontWeight = '600';
        portCell.textContent = rule.port || 'N/A';
        row.appendChild(portCell);

        // Usage column
        const usageCell = document.createElement('td');
        usageCell.className = 'usage-col';
        usageCell.style.textAlign = 'center';
        usageCell.textContent = rule.usage || 'Custom';
        row.appendChild(usageCell);

        // Toggle column
        const toggleCell = document.createElement('td');
        toggleCell.className = 'toggle-col';
        toggleCell.style.textAlign = 'center';
        toggleCell.style.width = '120px';

        // Handle both boolean and integer (0/1) values from database
        const isEnabled = rule.enabled === true || rule.enabled === 1;
        const toggle = createCustomRuleToggle(isEnabled, rule.id);
        toggleCell.appendChild(toggle);
        row.appendChild(toggleCell);

        tableBody.appendChild(row);
    });
}

// Create toggle button for custom rules
function createCustomRuleToggle(isOn, ruleId) {
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'toggle-switch';
    toggleContainer.dataset.ruleId = ruleId;
    toggleContainer.dataset.state = isOn ? 'on' : 'off';

    const toggleButton = document.createElement('button');
    toggleButton.className = 'toggle-btn ' + (isOn ? 'on' : 'off');
    toggleButton.textContent = isOn ? 'ON' : 'OFF';
    toggleButton.style.backgroundColor = isOn ? '#27ae60' : '#e74c3c';
    toggleButton.style.color = 'white';
    toggleButton.style.border = 'none';
    toggleButton.style.padding = '4px 12px';
    toggleButton.style.borderRadius = '12px';
    toggleButton.style.cursor = 'pointer';
    toggleButton.style.fontSize = '11px';
    toggleButton.style.fontWeight = 'bold';
    toggleButton.style.minWidth = '45px';

    toggleButton.onclick = function () {
        const currentState = toggleContainer.dataset.state === 'on';
        const newState = !currentState;

        // Get service name
        const row = toggleButton.closest('tr');
        const serviceDesc = row.querySelector('.description-col div').textContent;

        // Show confirmation
        const action = newState ? 'ENABLE' : 'DISABLE';
        const warning = !newState ? 'This will block access to this custom service.' : '';

        showConfirmationModal(
            `${action} Custom Rule`,
            `Are you sure you want to ${action.toLowerCase()} this rule?\n\n"${serviceDesc}"`,
            warning,
            () => {
                // Send to API
                const apiUrl = API_CONFIG.baseUrl + '/api/custom-rules/' + ruleId + '/toggle';

                fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ enabled: newState })
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            // Update UI
                            toggleContainer.dataset.state = newState ? 'on' : 'off';
                            toggleButton.className = 'toggle-btn ' + (newState ? 'on' : 'off');
                            toggleButton.textContent = newState ? 'ON' : 'OFF';
                            toggleButton.style.backgroundColor = newState ? '#27ae60' : '#e74c3c';

                            const actionText = newState ? 'enabled' : 'disabled';
                            showToast(`✓ Custom rule ${actionText} successfully`, 'success');
                        } else {
                            showToast('Failed to toggle rule: ' + (data.error || 'Unknown error'), 'error');
                        }
                    })
                    .catch(error => {
                        console.error('Error toggling rule:', error);
                        showToast('Network error: Unable to toggle rule', 'error');
                    });
            }
        );
    };

    toggleContainer.appendChild(toggleButton);
    return toggleContainer;
}

// Validate IP address (basic validation)
function isValidIP(ipAddress) {
    // IPv4 validation
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(ipAddress)) {
        const parts = ipAddress.split('.');
        return parts.every(part => parseInt(part) >= 0 && parseInt(part) <= 255);
    }

    // IPv6 validation (basic)
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    return ipv6Regex.test(ipAddress);
}

// Show confirmation modal
function showConfirmationModal(title, message, warning, onConfirm) {
    const modal = document.getElementById('confirmation-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalWarning = document.getElementById('modal-warning');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalWarning.textContent = warning;
    modalWarning.style.display = warning ? 'block' : 'none';

    modal.style.display = 'flex';

    // Handle confirm
    const confirmHandler = () => {
        modal.style.display = 'none';
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
        onConfirm();
    };

    // Handle cancel
    const cancelHandler = () => {
        modal.style.display = 'none';
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
    };

    confirmBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', cancelHandler);

    // Close on outside click
    modal.onclick = (e) => {
        if (e.target === modal) {
            cancelHandler();
        }
    };
}

// Show toast notification (matches API status style)
function showToast(message, type) {
    if (!type) type = 'info';

    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());

    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.style.position = 'fixed';
    toast.style.top = '10px';
    toast.style.right = '10px';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '5px';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = 'bold';
    toast.style.zIndex = '10000';
    toast.style.boxShadow = '0 3px 10px rgba(0,0,0,0.3)';
    toast.style.minWidth = '250px';
    toast.style.maxWidth = '400px';

    // Set colors based on type
    if (type === 'success') {
        toast.style.backgroundColor = '#27ae60';
        toast.style.color = 'white';
    } else if (type === 'error') {
        toast.style.backgroundColor = '#e74c3c';
        toast.style.color = 'white';
    } else if (type === 'warning') {
        toast.style.backgroundColor = '#f39c12';
        toast.style.color = 'white';
    } else {
        toast.style.backgroundColor = '#3498db';
        toast.style.color = 'white';
    }

    toast.textContent = message;
    document.body.appendChild(toast);

    // Auto-hide after 4 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// Show notification (wrapper for showToast for backwards compatibility)
function showNotification(message, type) {
    showToast(message, type);
}

// Show API connection status
function showAPIStatus(isConnected) {
    // Remove existing status indicator
    const existingStatus = document.querySelector('.api-status-indicator');
    if (existingStatus) {
        existingStatus.remove();
    }

    // Create status indicator
    const statusDiv = document.createElement('div');
    statusDiv.className = 'api-status-indicator';
    statusDiv.style.position = 'fixed';
    statusDiv.style.top = '10px';
    statusDiv.style.right = '10px';
    statusDiv.style.padding = '8px 15px';
    statusDiv.style.borderRadius = '5px';
    statusDiv.style.fontSize = '12px';
    statusDiv.style.fontWeight = 'bold';
    statusDiv.style.zIndex = '10000';
    statusDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

    if (isConnected) {
        statusDiv.style.backgroundColor = '#27ae60';
        statusDiv.style.color = 'white';
        statusDiv.innerHTML = '● API Connected';

        // Auto-hide after 3 seconds
        setTimeout(() => {
            statusDiv.style.opacity = '0';
            statusDiv.style.transition = 'opacity 0.5s';
            setTimeout(() => statusDiv.remove(), 500);
        }, 3000);
    } else {
        statusDiv.style.backgroundColor = '#e74c3c';
        statusDiv.style.color = 'white';
        statusDiv.innerHTML = '● API Offline - Using cached data';
        statusDiv.title = 'API URL: ' + API_CONFIG.baseUrl;
    }

    document.body.appendChild(statusDiv);
}

// Escape HTML to prevent XSS
function escapeHtml(textContent) {
    const tempDiv = document.createElement('div');
    tempDiv.textContent = textContent;
    return tempDiv.innerHTML;
}

// Make removeFromBlacklist globally accessible
window.removeFromBlacklist = removeFromBlacklist;
