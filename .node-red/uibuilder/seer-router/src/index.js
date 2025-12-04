document.addEventListener('DOMContentLoaded', function () {
    // Wait for Vue to load
    if (typeof Vue === 'undefined') {
        console.error('❌ Vue is not loaded! Check network connection or script loading order.');
        alert('Vue.js failed to load. Please refresh the page or check your internet connection.');
        return;
    }

    // Ensure uibuilder client library is available before starting
    if (typeof uibuilder === 'undefined') {
        console.error('❌ uibuilder client is not loaded! Check the script path ../uibuilder/uibuilder.iife.min.js');
    } else {
        try {
            uibuilder.start()
        } catch (err) {
            console.error('❌ uibuilder.start() failed:', err);
        }
    }

    const { createApp } = Vue;

    const app = createApp({
        data() {
            return {
                devices: [],
                policies: [],
                searchText: '',
                filterStatus: 'all',
                showModal: false,
                isEditing: false,
                editingIndex: -1,
                selectedDeviceMACs: new Set(),
                selectedDevice: null,
                newPolicy: {
                    hosts: '',
                    customHost: '',
                    website: '',
                    schedule: '',
                    enabled: true
                }
                ,
                blockedDevices: [],
                showBlockedModal: false,
                lastUnblockedMacs: new Set() // Track recently unblocked MACs to filter them out
            }
        },

        computed: {
            filteredPolicies() {
                return this.policies.filter(policy => {
                    const searchMatch = !this.searchText ||
                        policy.policy?.toLowerCase().includes(this.searchText.toLowerCase()) ||
                        policy.source?.toLowerCase().includes(this.searchText.toLowerCase()) ||
                        policy.destination?.toLowerCase().includes(this.searchText.toLowerCase());

                    const statusMatch = this.filterStatus === 'all' ||
                        (this.filterStatus === 'enabled' && policy.enabled) ||
                        (this.filterStatus === 'disabled' && !policy.enabled);

                    return searchMatch && statusMatch;
                });
            }
        },

        methods: {
            // ---------------- DHCP DEVICE SECTION ----------------
            updateDevices(msg) {
                if (!msg || !Array.isArray(msg.payload)) return;

                this.devices = msg.payload.map(device => ({
                    ...device,
                    status: device.status || 'active',
                    leaseType: device.static ? 'Static' : 'Dynamic',
                    leaseTime: this.formatLeaseTime(device.leaseTime),
                    interface: device.interface || 'eth0',
                    deviceType: device.deviceType || 'Unknown',
                    selected: this.selectedDeviceMACs.has(device.mac)
                }));

                this.updateDOMTable(this.devices);

                if (typeof window.populateHostsSelect === 'function') {
                    window.populateHostsSelect();
                }
            },

            toggleDeviceSelection(mac, isChecked) {
                console.log('🟢 CHECKBOX CHANGED:', mac, 'checked:', isChecked);
                console.log('🟢 Before:', Array.from(this.selectedDeviceMACs));

                if (isChecked) {
                    this.selectedDeviceMACs.add(mac);
                    console.log('🟢 Added:', mac);
                } else {
                    this.selectedDeviceMACs.delete(mac);
                    console.log('🟢 Removed:', mac);
                }

                console.log('🟢 After:', Array.from(this.selectedDeviceMACs));
            },

            removeSelectedDevices() {
                console.log('🔴 BUTTON CLICKED!');
                console.log('🔴 Selected MACs:', Array.from(this.selectedDeviceMACs));
                console.log('🔴 Size:', this.selectedDeviceMACs.size);

                if (this.selectedDeviceMACs.size === 0) {
                    alert('Please select at least one device to remove');
                    return;
                }

                if (confirm(`Are you sure you want to remove ${this.selectedDeviceMACs.size} selected device(s)?`)) {
                    const payload = Array.from(this.selectedDeviceMACs);
                    console.log('🔴 SENDING:', { topic: 'remove_devices', payload: payload });

                    uibuilder.send({
                        topic: 'remove_devices',
                        payload: payload
                    });

                    console.log('🔴 SENT! Clearing selection...');
                    this.selectedDeviceMACs.clear();
                }
            },

            updateDOMTable(leases) {
                const container = document.querySelector('.router-leases-table');
                if (!container) return;

                const headerHTML = `
                    <div class="table-header">
                        <div></div>
                        <div>Host Name</div>
                        <div>IP Address</div>
                        <div>MAC Address</div>
                        <div>Device Status</div>
                        <div>Device Type</div>
                        <div>Lease Up Time</div>
                        <div>Options</div>
                    </div>`;
                container.innerHTML = headerHTML;

                leases.forEach(lease => {
                    const row = document.createElement('div');
                    row.className = 'table-row';
                    row.style.display = 'contents';

                    const checkboxDiv = document.createElement('div');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = lease.selected || false;
                    checkbox.dataset.mac = lease.mac;
                    checkbox.addEventListener('change', e => {
                        this.toggleDeviceSelection(lease.mac, e.target.checked);
                    });
                    checkboxDiv.appendChild(checkbox);
                    row.appendChild(checkboxDiv);

                    const cells = [
                        lease.hostname || 'N/A',
                        lease.ip || 'N/A',
                        lease.mac || 'N/A',
                        `<span class="status-${lease.status}">${lease.status}</span>`,
                        lease.deviceType || 'Unknown',
                        lease.leaseTime || 'N/A'
                    ];

                    cells.forEach(content => {
                        const cell = document.createElement('div');
                        cell.innerHTML = content;
                        row.appendChild(cell);
                    });

                    const optionsCell = document.createElement('div');
                    const detailsBtn = document.createElement('button');
                    detailsBtn.textContent = 'Details';
                    detailsBtn.className = 'btn-details';
                    detailsBtn.addEventListener('click', () => {
                        this.showDeviceDetails(lease);
                    });
                    optionsCell.appendChild(detailsBtn);
                    row.appendChild(optionsCell);
                    container.appendChild(row);
                });
            },

            formatLeaseTime(seconds) {
                if (!seconds || seconds === 0) return 'N/A';
                const days = Math.floor(seconds / 86400);
                const hours = Math.floor((seconds % 86400) / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                return `${days}d ${hours}h ${minutes}m`;
            },

            showDeviceDetails(device) {
                this.selectedDevice = device;
                const modal = document.getElementById('deviceModal');
                if (modal) modal.classList.add('active');
            },

            closeModal() {
                const modal = document.getElementById('deviceModal');
                if (modal) modal.classList.remove('active');
                this.selectedDevice = null;
            },

            /* Blocked devices modal methods */
            openBlockedModal() {
                console.log('📋 Opening blocked devices modal, current count:', this.blockedDevices.length);
                // Clear old data first to prevent showing stale devices
                this.blockedDevices = [];
                // Request fresh blocked list from backend via safeSend
                if (typeof this.safeSend === 'function') {
                    this.safeSend('fetch_blocked_devices', null);
                } else {
                    try { uibuilder.send({ topic: 'fetch_blocked_devices', payload: null }); } catch (e) { console.error('fetch_blocked_devices send failed', e); }
                }
                // show modal while waiting for reply
                this.showBlockedModal = true;
            },

            closeBlockedModal() {
                this.showBlockedModal = false;
            },

            confirmUnblock(device) {
                if (!device || !device.mac) return;
                if (!confirm(`Unblock ${device.mac} (${device.ip || 'no ip'})?`)) return;
                this.unblockDevice(device.mac, device.ip || null);
            },

            unblockDevice(mac, ip = null) {
                console.log('🔓 Unblocking device:', mac, ip);
                console.log('🔓 Before removal, blockedDevices:', this.blockedDevices.length);

                // Normalize MAC address for comparison (lowercase, colons)
                const normalizedMac = mac.toLowerCase().replace(/-/g, ':');

                // Track this MAC as recently unblocked (will be filtered for 5 seconds)
                this.lastUnblockedMacs.add(normalizedMac);
                console.log('🔓 Added to lastUnblockedMacs:', normalizedMac);

                // Clear from tracking after 5 seconds (gives backend time to delete file)
                setTimeout(() => {
                    this.lastUnblockedMacs.delete(normalizedMac);
                    console.log('🔓 Removed from lastUnblockedMacs:', normalizedMac);
                }, 5000);

                uibuilder.send({ topic: 'unblock_device', payload: { mac: mac, ip: ip } });

                // Optimistically remove from UI immediately
                this.blockedDevices = this.blockedDevices.filter(d => {
                    const deviceMac = (d.mac || '').toLowerCase().replace(/-/g, ':');
                    const keep = deviceMac !== normalizedMac;
                    if (!keep) {
                        console.log('🔓 Removing device from UI:', d.mac);
                    }
                    return keep;
                });

                console.log('🔓 After removal, blockedDevices:', this.blockedDevices.length);

                // DO NOT refresh devices here - wait for unblock_result handler
            },

            // Safe send helper: retries briefly if uibuilder isn't ready yet
            safeSend(topic, payload, attempt = 0) {
                if (typeof uibuilder === 'undefined' || typeof uibuilder.send !== 'function') {
                    if (attempt > 5) {
                        console.error('safeSend: uibuilder not available after retries. Giving up for topic', topic);
                        return;
                    }
                    // retry after a short delay
                    console.warn('safeSend: uibuilder not ready, retrying in 200ms (attempt', attempt + 1, ')');
                    setTimeout(() => this.safeSend(topic, payload, attempt + 1), 200);
                    return;
                }
                try {
                    console.log('safeSend ->', topic, payload);
                    uibuilder.send({ topic: topic, payload: payload });
                } catch (err) {
                    console.error('safeSend: send failed for topic', topic, err);
                }
            },




























            // ---------------- TEMPORAL POLICIES SECTION ----------------



            updatePolicies(msg) {
                console.log('📥 updatePolicies called with:', msg);

                if (msg && Array.isArray(msg.payload)) {
                    this.policies = msg.payload.map((policy, idx) => ({
                        ...policy,
                        stableIndex: idx,
                        selected: false,
                        enabled: policy.enabled !== false,
                        applied: policy.enabled !== false,
                        policy: policy.policy || `Block ${policy.destination}`,
                        source: policy.source || '*',
                        destination: policy.destination || policy.domain || policy.website,
                        schedule: (policy.schedule && typeof policy.schedule === 'object') ? {
                            start: policy.schedule.start || '00:00',
                            end: policy.schedule.end || '23:59'
                        } : (typeof policy.schedule === 'string' ? this.parseSchedule(policy.schedule) : { start: '00:00', end: '23:59' })
                    }));

                    console.log('✅ Policies updated, count:', this.policies.length);
                } else {
                    console.warn('⚠️ updatePolicies: invalid payload format', msg);
                }
            },

            formatScheduleTime(schedule) {
                if (!schedule || (!schedule.start && !schedule.end)) return 'All Day';
                return `${schedule.start || '00:00'} to ${schedule.end || '23:59'}`;
            },

            // ⭐ TOGGLE: Just change enabled state, NEVER remove from list
            togglePolicyEnable(policy) {
                if (!policy) return;

                const previousState = policy.enabled;

                // Toggle the enabled state (green ↔ red)
                policy.enabled = !policy.enabled;

                const shouldBeActiveNow = policy.enabled && this.isNowInSchedule(policy.schedule);
                const action = shouldBeActiveNow ? 'block' : 'unblock';

                console.log('🔄 togglePolicyEnable:', {
                    destination: policy.destination,
                    enabled: policy.enabled,
                    shouldBeActiveNow: shouldBeActiveNow,
                    action: action
                });

                policy.applied = (action === 'block');

                // ⭐ CRITICAL: Send with keep_policy: true
                const payload = {
                    action: action,
                    destination: policy.destination,
                    website: policy.destination,
                    domain: policy.destination,
                    schedule: policy.schedule || { start: '00:00', end: '23:59' },
                    keep_policy: true  // ⭐ KEEP IN LIST
                };

                try {
                    if (typeof this.safeSend === 'function') {
                        this.safeSend('policy_action', payload);
                    } else {
                        uibuilder.send({
                            topic: 'policy_action',
                            payload: payload
                        });
                    }
                } catch (e) {
                    console.error('togglePolicyEnable: send failed', e);
                    policy.enabled = previousState;
                    policy.applied = previousState;
                    alert('Failed to toggle policy. Please try again.');
                }
            },

            editPolicy(policy, index) {
                this.isEditing = true;
                this.editingIndex = index;

                const modal = document.getElementById('addModal');
                if (!modal) {
                    alert('Modal element #addModal not found.');
                    return;
                }

                const modalTitle = document.querySelector('#addModal h2');
                if (modalTitle) {
                    modalTitle.textContent = 'Edit Temporal Policy (Board-Wide)';
                }

                const websiteInput = document.getElementById('website');
                const startTimeInput = document.getElementById('start-time');
                const endTimeInput = document.getElementById('end-time');
                const appDropdown = document.getElementById('appDropdown');

                if (websiteInput) websiteInput.value = policy.destination;
                if (startTimeInput) startTimeInput.value = policy.schedule?.start || '00:00';
                if (endTimeInput) endTimeInput.value = policy.schedule?.end || '23:59';
                if (appDropdown) appDropdown.value = '';

                modal.style.display = 'block';
            },

            addPolicy() {
                const websiteInput = document.getElementById('website');
                const startTimeInput = document.getElementById('start-time');
                const endTimeInput = document.getElementById('end-time');

                if (!websiteInput) {
                    alert('Website input field not found.');
                    return;
                }

                const websiteVal = websiteInput.value.trim();
                const startVal = startTimeInput?.value.trim() || '00:00';
                const endVal = endTimeInput?.value.trim() || '23:59';
                const schedule = { start: startVal, end: endVal };

                if (!websiteVal) {
                    alert('Please enter a website domain to block.');
                    return;
                }

                const cleanDomain = websiteVal
                    .replace(/^https?:\/\//, '')
                    .replace(/\/$/, '')
                    .trim();

                const newPolicy = {
                    policy: `Block ${cleanDomain}`,
                    source: '*',
                    destination: cleanDomain,
                    website: cleanDomain,
                    schedule: schedule,
                    enabled: true
                };

                console.log('💾 Saving policy:', newPolicy);

                if (this.isEditing && this.editingIndex >= 0) {
                    const oldPolicy = this.policies[this.editingIndex];

                    uibuilder.send({
                        topic: 'policy_action',
                        payload: {
                            action: 'unblock',
                            destination: oldPolicy.destination,
                            website: oldPolicy.destination,
                            keep_policy: false
                        }
                    });

                    setTimeout(() => {
                        uibuilder.send({
                            topic: 'policy_action',
                            payload: {
                                action: 'block',
                                ...newPolicy
                            }
                        });
                    }, 500);
                } else {
                    uibuilder.send({
                        topic: 'policy_action',
                        payload: {
                            action: 'block',
                            ...newPolicy
                        }
                    });
                }

                this.isEditing = false;
                this.editingIndex = -1;

                const modal = document.getElementById('addModal');
                if (modal) modal.style.display = 'none';
            },

            // ⭐ DELETE: Only this removes from list (keep_policy: false)
            deleteSelected() {
                const selectedPolicies = this.policies.filter(p => p.selected);

                if (selectedPolicies.length === 0) {
                    alert('Please select one or more policies to delete.');
                    return;
                }

                if (confirm(`Are you sure you want to delete ${selectedPolicies.length} selected policy(s)?`)) {
                    selectedPolicies.forEach(policy => {
                        console.log('🗑️ Deleting policy:', policy.destination);

                        uibuilder.send({
                            topic: 'policy_action',
                            payload: {
                                action: 'unblock',
                                destination: policy.destination,
                                website: policy.destination,
                                keep_policy: false  // ⭐ REMOVE FROM LIST
                            }
                        });
                    });

                    this.policies.forEach(p => (p.selected = false));
                }
            },

            parseSchedule(scheduleStr) {
                if (!scheduleStr) return { start: '00:00', end: '23:59' };
                const parts = scheduleStr.split(' to ');
                return {
                    start: parts[0]?.trim() || '00:00',
                    end: parts[1]?.trim() || '23:59'
                };
            },

            isNowInSchedule(schedule) {
                if (!schedule) return true;
                const toMinutes = (hhmm) => {
                    if (!hhmm || typeof hhmm !== 'string') return 0;
                    const parts = hhmm.split(':');
                    const h = parseInt(parts[0], 10) || 0;
                    const m = parseInt(parts[1], 10) || 0;
                    return h * 60 + m;
                };

                const startMin = toMinutes(schedule.start || '00:00');
                const endMin = toMinutes(schedule.end || '23:59');
                const now = new Date();
                const nowMin = now.getHours() * 60 + now.getMinutes();

                if (startMin <= endMin) {
                    return nowMin >= startMin && nowMin <= endMin;
                }
                return nowMin >= startMin || nowMin <= endMin;
            },

            evaluatePolicySchedules() {
                try {
                    console.log('[SCHEDULER] Evaluating policy schedules at', new Date().toLocaleTimeString());

                    this.policies.forEach(policy => {
                        if (!policy || !policy.destination) return;

                        const inSchedule = this.isNowInSchedule(policy.schedule);
                        const shouldBeApplied = !!policy.enabled && inSchedule;

                        console.log(`[SCHEDULER] ${policy.destination}: enabled=${policy.enabled}, inSchedule=${inSchedule}, applied=${policy.applied}, shouldBe=${shouldBeApplied}`);

                        if (policy.applied && !shouldBeApplied) {
                            console.log('⏱️ schedule: unblocking (out of window)', policy.destination);

                            const payload = {
                                action: 'unblock',
                                destination: policy.destination,
                                website: policy.destination,
                                domain: policy.destination,
                                keep_policy: true,
                                schedule: policy.schedule
                            };

                            if (typeof this.safeSend === 'function') {
                                this.safeSend('policy_action', payload);
                            } else {
                                uibuilder.send({ topic: 'policy_action', payload: payload });
                            }

                            policy.applied = false;

                        } else if (!policy.applied && shouldBeApplied) {
                            console.log('⏱️ schedule: blocking (in window)', policy.destination);

                            const payload = {
                                action: 'block',
                                destination: policy.destination,
                                website: policy.destination,
                                domain: policy.destination,
                                schedule: policy.schedule,
                                keep_policy: true
                            };

                            if (typeof this.safeSend === 'function') {
                                this.safeSend('policy_action', payload);
                            } else {
                                uibuilder.send({ topic: 'policy_action', payload: payload });
                            }

                            policy.applied = true;
                        }
                    });
                } catch (e) {
                    console.error('evaluatePolicySchedules failed', e);
                }
            },

            refreshPolicies() {
                console.log('🔄 Manually refreshing policies...');
                uibuilder.send({ topic: 'fetch_policies' });
            }

            // ============== END TEMPORAL POLICIES SECTION ==============
        },

        mounted() {
            if (typeof uibuilder === 'undefined') {
                console.error('❌ mounted(): uibuilder is not available. Cannot set up message handlers.');
                return;
            }

            console.log('🚀 App mounted, setting up message handlers...');

            uibuilder.onChange('msg', (msg) => {
                console.log('🔵 Message received:', msg);
                console.log('🔵 Topic:', msg.topic, 'Type:', typeof msg.topic);

                if (!msg.topic) {
                    console.warn('⚠️ Message without topic received');
                    return;
                }

                console.log('📨 Topic name: "' + msg.topic + '"');

                switch (msg.topic) {
                    case 'blocked_devices':
                    case 'blocked_list':
                        console.log('✅ Blocked devices message detected:', msg.payload);
                        const rawDevices = Array.isArray(msg.payload) ? msg.payload : [];
                        this.blockedDevices = rawDevices.filter(d => {
                            const dMac = (d.mac || '').toLowerCase().replace(/-/g, ':');
                            const isRecentlyUnblocked = this.lastUnblockedMacs.has(dMac);
                            if (isRecentlyUnblocked) {
                                console.log('🚫 Filtering out recently unblocked device:', d.mac);
                            }
                            return !isRecentlyUnblocked;
                        });
                        console.log('✅ Updated blockedDevices count:', this.blockedDevices.length);
                        break;

                    case 'unblock_result':
                        console.log('✅ Unblock result:', msg.payload);
                        if (msg.payload && msg.payload.success) {
                            const normMac = (msg.payload.mac || '').toLowerCase().replace(/-/g, ':');
                            const beforeCount = this.blockedDevices.length;
                            this.blockedDevices = this.blockedDevices.filter(d => {
                                const dMac = (d.mac || '').toLowerCase().replace(/-/g, ':');
                                return dMac !== normMac;
                            });
                            console.log('✅ After unblock_result filter:', beforeCount, '->', this.blockedDevices.length);

                            alert('Device ' + msg.payload.mac + ' unblocked successfully!\n\nThe device can now reconnect.');
                            uibuilder.send({ topic: 'fetch_devices' });
                        } else {
                            alert('Failed to unblock device. Check Node-RED logs.');
                        }
                        break;

                    case 'policies':
                        console.log('✅ Policies message received');
                        this.updatePolicies(msg);
                        break;

                    case 'policy_action':
                        console.log('🔁 Policy action request (ignore echo)');
                        break;

                    case 'policy_action_result':
                        console.log('✅ Policy action result:', msg.payload);
                        if (msg.payload) {
                            if (msg.payload.success === false) {
                                alert(msg.payload.message || 'Policy action failed');
                            } else if (msg.payload.success === true) {
                                console.log('✅ Policy action succeeded:', msg.payload.message);
                            }

                            // ⭐ Update policies from backend response
                            if (msg.payload.policies && Array.isArray(msg.payload.policies)) {
                                console.log('📋 Updating policies from action result');
                                this.updatePolicies({ payload: msg.payload.policies });
                            }

                            try {
                                const dest = msg.payload.destination || msg.payload.website || msg.payload.domain;
                                const action = msg.payload.action;
                                if (dest && action) {
                                    const p = this.policies.find(x => (x.destination || '').toLowerCase() === (dest || '').toLowerCase());
                                    if (p) {
                                        p.applied = (action === 'block' && msg.payload.success !== false);
                                        console.log('✅ policy_action_result updated applied state for', dest, '->', p.applied);
                                    }
                                }
                            } catch (e) {
                                console.warn('policy_action_result: could not update local policy state', e);
                            }
                        }
                        break;

                    case 'devices':
                        console.log('✅ Devices message received, count:', msg.payload ? msg.payload.length : 0);
                        this.updateDevices(msg);
                        break;

                    case 'error':
                        console.error('❌ Error:', msg.payload);
                        alert(msg.payload?.message || 'An error occurred on the router!');
                        break;

                    case 'fetch_policies':
                        console.log('🔁 Fetch policies request (ignore)');
                        break;

                    default:
                        console.warn('⚠️ Unknown topic:', msg.topic);
                        if (msg.payload && typeof msg.payload === 'string' && msg.payload.includes('Error')) {
                            console.error('❌ Error in payload:', msg.payload);
                            alert('Execution Error: Check Node-RED Debug Log or Python script permissions.');
                        }
                        break;
                }
            });

            console.log('🚀 Fetching initial data...');
            setTimeout(() => {
                uibuilder.send({ topic: 'fetch_policies' });
                uibuilder.send({ topic: 'fetch_devices' });
            }, 1000);

            try {
                if (this.evaluatePolicySchedules) {
                    setTimeout(() => this.evaluatePolicySchedules(), 1500);
                    this._policyInterval = setInterval(() => this.evaluatePolicySchedules(), 30 * 1000);
                }
            } catch (e) {
                console.error('Failed to start policy schedule evaluator', e);
            }
        }
    });

    const vm = app.mount('#app');

    const appDropdown = document.getElementById('appDropdown');
    if (appDropdown) {
        appDropdown.addEventListener('change', (e) => {
            const websiteInput = document.getElementById('website');
            if (websiteInput && e.target.value) {
                websiteInput.value = e.target.value;
            }
        });
    }

    document.getElementById('searchInput')?.addEventListener('input', e => {
        vm.searchText = e.target.value;
    });

    document.getElementById('filterInput')?.addEventListener('change', e => {
        vm.filterStatus = e.target.value;
    });

    document.querySelector('.btn-add')?.addEventListener('click', () => {
        vm.isEditing = false;
        vm.editingIndex = -1;
        const modal = document.getElementById('addModal');
        if (!modal) {
            alert('Modal element #addModal not found.');
            return;
        }

        const modalTitle = document.querySelector('#addModal h2');
        if (modalTitle) {
            modalTitle.textContent = 'Add Temporal Policy (Board-Wide)';
        }

        const websiteInput = document.getElementById('website');
        const appDropdownModal = document.getElementById('appDropdown');
        const startTimeInput = document.getElementById('start-time');
        const endTimeInput = document.getElementById('end-time');

        if (websiteInput) websiteInput.value = '';
        if (appDropdownModal) appDropdownModal.value = '';
        if (startTimeInput) startTimeInput.value = '12:00';
        if (endTimeInput) endTimeInput.value = '23:59';

        modal.style.display = 'block';
    });

    document.querySelector('#Temporal .btn-delete')?.addEventListener('click', () => {
        vm.deleteSelected();
    });

    document.querySelector('.btn-edit')?.addEventListener('click', () => {
        const selected = vm.policies.filter(p => p.selected);
        if (selected.length !== 1) {
            alert('Please select exactly ONE policy to edit.');
            return;
        }
        vm.editPolicy(selected[0], selected[0].stableIndex);
    });

    document.getElementById('savePolicy')?.addEventListener('click', (e) => {
        e.preventDefault();
        vm.addPolicy();
    });

    document.getElementById('closeModal')?.addEventListener('click', () => {
        const modal = document.getElementById('addModal');
        if (modal) modal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        const modal = document.getElementById('addModal');
        if (modal && e.target === modal) {
            modal.style.display = 'none';
        }
    });
});