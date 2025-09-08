import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { CncManager, type CncDevice } from "./cnc_manager";
import { RunStatistics, time_async, time_sync } from "./performance_stats";
import { CncStateMachine, CncState, EventType, type CncEvent } from "./cnc_state_machine";

// Performance monitoring stats
const status_update_stats = new RunStatistics("CNC Status Update");
const log_message_stats = new RunStatistics("Log Message");
const dom_update_stats = new RunStatistics("DOM Updates");
const network_stats = new RunStatistics("Network Calls");
const ENABLE_PERF_LOGGING = true; // Set to false to disable performance logging

// Report performance stats periodically
function report_performance_stats() {
  if (!ENABLE_PERF_LOGGING) return;
  
  // Write to file instead of cluttering the UI
  const reports: string[] = [];
  
  if (status_update_stats.get_count() > 0 || network_stats.get_count() > 0 || 
      log_message_stats.get_count() > 0 || dom_update_stats.get_count() > 0) {
    
    reports.push("📊 Performance Report");
    
    if (status_update_stats.get_count() > 0) {
      reports.push(`Status: ${status_update_stats.toString()}`);
      if (status_update_stats.mean() > 50 || status_update_stats.max() > 200) {
        reports.push(`🐌 Status updates slow!`);
      }
    }
    
    if (network_stats.get_count() > 0) {
      reports.push(`Network: ${network_stats.toString()}`);
      if (network_stats.mean() > 100 || network_stats.max() > 500) {
        reports.push(`🐌 Network calls slow!`);
      }
    }
    
    if (log_message_stats.get_count() > 0) {
      reports.push(`Logging: ${log_message_stats.toString()}`);
    }
    
    if (dom_update_stats.get_count() > 0) {
      reports.push(`DOM: ${dom_update_stats.toString()}`);
    }
    
    // Write all reports to file
    for (const report of reports) {
      invoke("write_performance_log", { message: report }).catch(console.error);
    }
  }
}

// Report stats every 10 seconds for testing
setInterval(report_performance_stats, 10000);

// Log initial startup to performance file
if (ENABLE_PERF_LOGGING) {
  setTimeout(() => {
    invoke("write_performance_log", { message: "🚀 Performance monitoring started" }).catch(console.error);
  }, 1000);
}

// Global clipboard function for use by cnc-serial.js
(window as any).tauriCopyToClipboard = async (text: string): Promise<void> => {
  try {
    await writeText(text);
  } catch (error) {
    // Fall back to browser clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      throw new Error('Clipboard API not available: ' + error);
    }
  }
};

let greet_input_el: HTMLInputElement | null;
let greet_msg_el: HTMLElement | null;

// CNC-related elements
let connect_button: HTMLButtonElement | null;
let disconnect_button: HTMLButtonElement | null;
let status_indicator: HTMLElement | null;
let status_text: HTMLElement | null;
let communication_log: HTMLElement | null;
let toggle_log_button: HTMLButtonElement | null;

// Status details modal elements
let status_details_modal: HTMLElement | null;
let status_details_close: HTMLButtonElement | null;
let status_details_body: HTMLElement | null;

// Store detailed status information for the modal
interface StatusDetails {
  connection_status: string;
  device_info: string;
  grbl_state: string;
  grbl_substate: string;
  position_wco: string;
  alarm_code: string;
  last_updated: string;
}

let current_status_details: StatusDetails = {
  connection_status: 'Disconnected',
  device_info: 'None',
  grbl_state: 'Unknown',
  grbl_substate: 'None',
  position_wco: 'Unknown',
  alarm_code: 'None',
  last_updated: 'Never'
};

// Position display elements
let machine_x_pos: HTMLElement | null;
let machine_y_pos: HTMLElement | null;
let machine_z_pos: HTMLElement | null;
let work_x_pos: HTMLElement | null;
let work_y_pos: HTMLElement | null;
let work_z_pos: HTMLElement | null;

// Control elements
let home_button: HTMLButtonElement | null;
let clear_alarm_button: HTMLButtonElement | null;
let copy_log_button: HTMLButtonElement | null;
let jog_buttons: { [key: string]: HTMLButtonElement | null } = {};
let step_size_input: HTMLInputElement | null;
let zero_buttons: { [key: string]: HTMLButtonElement | null } = {};

// Save XY preset elements
let save_xy_preset_button: HTMLButtonElement | null;
let xy_presets_list: HTMLElement | null;

// Global state management
const state_machine = new CncStateMachine();

// State change listener to update UI based on state machine
function handle_state_change(old_state: CncState, new_state: CncState, event: CncEvent): void {
  log_message(`🔄 State change: ${old_state} → ${new_state} (${event.type})`, 'success');
  
  // Update connection status
  const connected = state_machine.is_connected();
  is_connected = connected;
  
  // Update UI elements based on new state
  update_button_states();
  update_status_display(new_state);
}

function update_button_states(): void {
  const connected = state_machine.is_connected();
  const can_jog = state_machine.can_jog();
  const can_home = state_machine.can_home();
  const can_clear_alarm = state_machine.can_clear_alarm();
  
  // Connection buttons
  if (connect_button) connect_button.disabled = connected;
  if (disconnect_button) disconnect_button.disabled = !connected;
  
  // Operation buttons - more intelligent based on state
  if (home_button) home_button.disabled = !can_home;
  if (clear_alarm_button) clear_alarm_button.disabled = !can_clear_alarm;
  if (save_xy_preset_button) save_xy_preset_button.disabled = !connected;
  
  // Jog buttons
  Object.values(jog_buttons).forEach(button => {
    if (button) button.disabled = !can_jog;
  });
  
  // Zero buttons
  Object.values(zero_buttons).forEach(button => {
    if (button) button.disabled = !connected;
  });
}

function update_status_display(state: CncState): void {
  if (!status_indicator || !status_text) return;
  
  log_message(`🎨 Updating status display for state: ${state}`, 'info');
  log_message(`🔧 DEBUG: State machine current state: ${state_machine.get_current_state()}`, 'info');
  
  switch (state) {
    case CncState.DISCONNECTED:
      status_indicator.className = 'status-indicator';
      status_text.textContent = 'Disconnected';
      current_status_details.connection_status = 'Disconnected';
      break;
    case CncState.CONNECTING:
      status_indicator.className = 'status-indicator connecting';
      status_text.textContent = 'Connecting...';
      current_status_details.connection_status = 'Connecting';
      break;
    case CncState.IDLE:
      status_indicator.className = 'status-indicator connected';
      status_text.textContent = 'Ready';
      current_status_details.connection_status = 'Connected';
      break;
    case CncState.JOG_REQUESTED:
      // Note: This state is no longer used with simplified jog status
      status_text.textContent = 'Jog Requested';
      break;
    case CncState.ALARM:
      status_indicator.className = 'status-indicator alarm';
      status_text.textContent = 'ALARM';
      break;
    case CncState.RUNNING:
      status_indicator.className = 'status-indicator running';
      status_text.textContent = 'Running';
      current_status_details.connection_status = 'Running Operation';
      break;
  }
  
  current_status_details.last_updated = new Date().toLocaleTimeString();
}

// Status details modal functions
function show_status_details() {
  if (!status_details_modal || !status_details_body) return;
  
  // Update device info
  const lastDevice = loadLastConnection();
  current_status_details.device_info = lastDevice ? 
    `${lastDevice.name} (${lastDevice.ip}:${lastDevice.port})` : 'None';
  
  // Update position info
  const wcoInfo = `X: ${last_work_offset.x.toFixed(3)}, Y: ${last_work_offset.y.toFixed(3)}, Z: ${last_work_offset.z.toFixed(3)}`;
  current_status_details.position_wco = wcoInfo;
  
  // Generate the modal content
  const content = `
    <div class="status-detail-row">
      <span class="status-detail-label">Connection:</span>
      <span class="status-detail-value">${current_status_details.connection_status}</span>
    </div>
    <div class="status-detail-row">
      <span class="status-detail-label">Device:</span>
      <span class="status-detail-value">${current_status_details.device_info}</span>
    </div>
    <div class="status-detail-row">
      <span class="status-detail-label">GRBL State:</span>
      <span class="status-detail-value">${current_status_details.grbl_state}</span>
    </div>
    <div class="status-detail-row">
      <span class="status-detail-label">Alarm Code:</span>
      <span class="status-detail-value">${current_status_details.alarm_code}</span>
    </div>
    <div class="status-detail-row">
      <span class="status-detail-label">Work Offset:</span>
      <span class="status-detail-value">${current_status_details.position_wco}</span>
    </div>
    <div class="status-detail-row">
      <span class="status-detail-label">Last Updated:</span>
      <span class="status-detail-value">${current_status_details.last_updated}</span>
    </div>
  `;
  
  status_details_body.innerHTML = content;
  status_details_modal.style.display = 'flex';
}

function hide_status_details() {
  if (!status_details_modal) return;
  status_details_modal.style.display = 'none';
}

// Debug functions for testing
function debug_cnc_state() {
  log_message(`🔍 DEBUG STATE REPORT:`, 'info');
  log_message(`   Current state: ${state_machine.get_current_state()}`, 'info');
  log_message(`   Can jog: ${state_machine.can_jog()}`, 'info');
  log_message(`   Can home: ${state_machine.can_home()}`, 'info');
  log_message(`   Is connected: ${state_machine.is_connected()}`, 'info');
  log_message(`   Is busy: ${state_machine.is_busy()}`, 'info');
}

function debug_force_idle() {
  log_message('🔧 DEBUG: Forcing state to IDLE for testing', 'info');
  state_machine.handle_event({ type: EventType.STATUS_IDLE, data: {} });
}

// Make debug functions available globally
(window as any).debug_cnc_state = debug_cnc_state;
(window as any).debug_force_idle = debug_force_idle;

// Global state
let is_connected = false;
let discovered_devices: CncDevice[] = [];
let last_work_offset = { x: 0, y: 0, z: 0 }; // Persistent work coordinate offset
let current_alarm_code: number | null = null; // Track current alarm code
let saved_xy_coordinates: { [name: string]: { x: number; y: number; timestamp: string } } = {};

async function greet() {
  if (greet_msg_el && greet_input_el) {
    greet_msg_el.textContent = await invoke("greet", {
      name: greet_input_el.value,
    });
  }
}

function log_message(message: string, type: 'info' | 'error' | 'success' = 'info') {
  return time_sync(log_message_stats, () => {
    if (!communication_log) return;
    
    // Check for alarm codes and alarm-related messages
    const alarm_match = message.match(/ALARM:(\d+)/);
    if (alarm_match) {
      current_alarm_code = parseInt(alarm_match[1]);
    } else if (message.includes('[MSG:Check Limits]')) {
      // This indicates a hard limit alarm (alarm code 9)
      current_alarm_code = 9;
    }
    
    // Clear alarm code when machine returns to normal states
    if (message.includes('<Idle|') || message.includes('ok')) {
      current_alarm_code = null;
    }
    
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    const log_entry = `[${timestamp}] ${prefix} ${message}\n`;
    
    // Time the expensive DOM operations
    time_sync(dom_update_stats, () => {
      if (communication_log) {
        communication_log.textContent += log_entry;
        communication_log.scrollTop = communication_log.scrollHeight;
      }
    });
  });
}

// Connection state persistence
const CONNECTION_STORAGE_KEY = 'cnc_last_connection';

interface SavedConnection {
  device: CncDevice;
  timestamp: string;
}

function saveLastConnection(device: CncDevice) {
  const savedConnection: SavedConnection = {
    device,
    timestamp: new Date().toISOString()
  };
  localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(savedConnection));
  log_message(`Saved connection settings for ${device.name}`, 'info');
}

function loadLastConnection(): CncDevice | null {
  try {
    const saved = localStorage.getItem(CONNECTION_STORAGE_KEY);
    if (!saved) return null;
    
    const savedConnection: SavedConnection = JSON.parse(saved);
    return savedConnection.device;
  } catch (error) {
    console.error('Failed to load last connection:', error);
    return null;
  }
}

function clearLastConnection() {
  localStorage.removeItem(CONNECTION_STORAGE_KEY);
}

// Auto-reconnect to last connected device
async function attemptAutoReconnect(): Promise<boolean> {
  const lastConnection = loadLastConnection();
  if (lastConnection) {
    log_message(`Attempting to reconnect to ${lastConnection.name} at ${lastConnection.ip}:${lastConnection.port}`, 'info');
    
    // Notify state machine that connection is starting
    state_machine.handle_event({ type: EventType.CONNECT_BUTTON_CLICKED });
    
    try {
      await CncManager.connect(lastConnection);
      
      // Notify state machine of successful connection
      state_machine.handle_event({ type: EventType.CONNECTION_SUCCESS, data: lastConnection });
      
      update_connection_status(true, lastConnection);
      log_message('Auto-reconnect successful', 'success');
      
      // Get initial status to set correct state
      await updateMachineStatus();
      
      return true;
    } catch (error) {
      log_message(`Auto-reconnect failed: ${error}`, 'error');
      
      // Notify state machine of failed connection
      state_machine.handle_event({ type: EventType.CONNECTION_FAILED });
      
      // Keep the saved connection for future attempts - user can use discovery if needed
      return false;
    }
  }
  return false;
}

function update_connection_status(connected: boolean, deviceInfo?: CncDevice) {
  is_connected = connected;
  
  if (status_indicator) {
    status_indicator.className = `status-indicator ${connected ? 'connected' : ''}`;
  }
  
  // Only update status text if state machine is in a basic state
  // Don't override status during operations like homing, jogging, etc.
  const current_state = state_machine.get_current_state();
  const can_update_status = [
    CncState.DISCONNECTED,
    CncState.CONNECTING,
    CncState.IDLE
  ].includes(current_state);
  
  if (status_text && can_update_status) {
    if (connected && deviceInfo) {
      // Update device info for the details modal
      current_status_details.device_info = `${deviceInfo.name} (${deviceInfo.ip}:${deviceInfo.port})`;
      // Use simplified status text for consistency
      status_text.textContent = 'Ready';
    } else {
      current_status_details.device_info = 'None';
      status_text.textContent = 'Disconnected';
    }
  }
  
  // Update button states
  if (connect_button) connect_button.disabled = connected;
  if (disconnect_button) disconnect_button.disabled = !connected;
  if (clear_alarm_button) clear_alarm_button.disabled = !connected;
  if (home_button) home_button.disabled = !connected;
  if (save_xy_preset_button) save_xy_preset_button.disabled = !connected;
  
  // Update jog buttons
  Object.values(jog_buttons).forEach(button => {
    if (button) button.disabled = !connected;
  });
  
  // Update zero buttons
  Object.values(zero_buttons).forEach(button => {
    if (button) button.disabled = !connected;
  });
}

async function discover_and_connect() {
  // Send event to state machine
  state_machine.handle_event({ type: EventType.CONNECT_BUTTON_CLICKED });
  
  log_message("Starting CNC device discovery...");
  connect_button!.textContent = "Discovering...";
  connect_button!.disabled = true;
  
  try {
    discovered_devices = await CncManager.discover_devices();
    log_message(`Found ${discovered_devices.length} potential CNC device(s)`);
    
    if (discovered_devices.length === 0) {
      log_message("No CNC devices found. Make sure your Genmitsu WiFi module is connected and powered on.", 'error');
      state_machine.handle_event({ type: EventType.CONNECTION_FAILED });
      return;
    }
    
    // For now, connect to the first device found
    // In a full implementation, you might want to show a device selection dialog
    const device = discovered_devices[0];
    log_message(`Attempting to connect to ${device.name} at ${device.ip}:${device.port}`);
    
    await CncManager.connect(device);
    
    // Connection successful
    state_machine.handle_event({ type: EventType.CONNECTION_SUCCESS, data: device });
    update_connection_status(true, device);
    saveLastConnection(device); // Save successful connection
    log_message(`Successfully connected to ${device.name}`, 'success');
    
    // Check for alarm status immediately after connecting
    try {
      log_message("Checking initial alarm status...", 'info');
      const alarmStatus = await CncManager.check_alarm_status();
      log_message(`Initial alarm status check result: ${alarmStatus}`, 'info');
      
      // Parse the status response to extract alarm information
      const parsed = CncManager.parse_status(alarmStatus);
      if (parsed && parsed.state.includes('Alarm:')) {
        // Extract alarm code from parsed state like "Alarm: 9 (Hard limit triggered)"
        const alarmMatch = parsed.state.match(/Alarm: (\d+)/);
        if (alarmMatch) {
          current_alarm_code = parseInt(alarmMatch[1]);
          log_message(`Detected alarm code on connect: ${current_alarm_code}`, 'error');
        }
      }
    } catch (alarmError) {
      log_message(`Could not check alarm status on connect: ${alarmError}`, 'error');
    }
    
    // Get initial status
    await updateMachineStatus();
    
  } catch (error) {
    log_message(`Connection failed: ${error}`, 'error');
    state_machine.handle_event({ type: EventType.CONNECTION_FAILED });
    update_connection_status(false);
    // Don't clear saved connection on discovery/connect failure - might be temporary
  } finally {
    connect_button!.textContent = "Connect";
    connect_button!.disabled = false;
  }
}

async function disconnect() {
  try {
    await CncManager.disconnect();
    update_connection_status(false);
    last_work_offset = { x: 0, y: 0, z: 0 }; // Reset work offset
    clearLastConnection(); // Clear saved connection on manual disconnect
    log_message("Disconnected from CNC", 'success');
  } catch (error) {
    log_message(`Disconnect error: ${error}`, 'error');
  }
}

async function updateMachineStatus() {
  if (!is_connected) return;
  
  return await time_async(status_update_stats, async () => {
    try {
      const status = await time_async(network_stats, () => CncManager.get_status());
      const parsed = CncManager.parse_status(status, last_work_offset);
    
      if (parsed) {
        // Update stored work offset if this status contains WCO
        if ((parsed as any).workOffset) {
          last_work_offset = (parsed as any).workOffset;
        }
        
        // Update status details for the modal
        let displayState = parsed.state;
        let alarmCode = 'None';
        
        // Extract alarm code from parsed state if present
        if (parsed.state.includes('Alarm')) {
          displayState = parsed.state;
          
          // Try multiple alarm code extraction patterns
          let alarmMatch = parsed.state.match(/Alarm[:\s]*(\d+)/); // "Alarm: 9" or "Alarm 9:"
          if (!alarmMatch) {
            alarmMatch = parsed.state.match(/Alarm[:\s]+(\d+)/); // More flexible spacing
          }
          
          if (alarmMatch) {
            current_alarm_code = parseInt(alarmMatch[1]);
            alarmCode = `${current_alarm_code}`;
            log_message(`🚨 Extracted alarm code: ${current_alarm_code}`, 'error');
          } else {
            log_message(`🚨 Could not extract alarm code from: "${parsed.state}"`, 'error');
          }
        } else if (parsed.state.includes('Alarm') && current_alarm_code !== null) {
          // Fallback: if we just have "Alarm" but have a tracked code, show details
          const alarmDescriptions: { [key: number]: string } = {
            1: 'Hard limit during unlock',
            2: 'Motion exceeds travel',
            3: 'Reset while moving',
            4: 'Probe fail',
            5: 'Probe fail',
            6: 'Homing fail',
            7: 'Homing fail',
            8: 'Homing fail',
            9: 'Hard limit triggered',
            10: 'Soft limit error'
          };
          displayState = `Alarm: ${current_alarm_code} (${alarmDescriptions[current_alarm_code] || 'Unknown'})`;
          alarmCode = `${current_alarm_code}`;
        } else {
          // Clear alarm code if not in alarm state
          current_alarm_code = null;
        }
        
        // Update detailed status information
        current_status_details.grbl_state = displayState;
        current_status_details.grbl_substate = 'None'; // GRBL doesn't typically provide substates
        current_status_details.alarm_code = alarmCode;
        
        // Send status events to state machine
        if (parsed.state === 'Idle') {
          log_message('📡 Sending STATUS_IDLE event to state machine', 'info');
          log_message(`🔧 DEBUG: About to call handle_event with STATUS_IDLE, state machine type: ${typeof state_machine}`, 'info');
          state_machine.handle_event({ type: EventType.STATUS_IDLE, data: parsed });
          log_message(`🔧 DEBUG: Called handle_event with STATUS_IDLE`, 'info');
        } else if (parsed.state === 'Jog') {
          log_message('📡 Sending STATUS_JOG event to state machine', 'info');
          state_machine.handle_event({ type: EventType.STATUS_JOG, data: parsed });
        } else if (parsed.state === 'Run') {
          log_message('📡 Sending STATUS_RUN event to state machine', 'info');
          state_machine.handle_event({ type: EventType.STATUS_RUN, data: parsed });
        } else if (parsed.state === 'Home') {
          log_message('📡 Sending STATUS_HOME event to state machine', 'info');
          state_machine.handle_event({ type: EventType.STATUS_HOME, data: parsed });
        } else if (parsed.state.includes('Alarm')) {
          log_message('📡 Sending STATUS_ALARM event to state machine', 'info');
          state_machine.handle_event({ type: EventType.STATUS_ALARM, data: parsed });
        } else {
          log_message(`❓ Unknown status state: ${parsed.state}`, 'error');
        }
        
        // Update position displays
        if (machine_x_pos) machine_x_pos.textContent = parsed.position.x.toFixed(3);
        if (machine_y_pos) machine_y_pos.textContent = parsed.position.y.toFixed(3);
        if (machine_z_pos) machine_z_pos.textContent = parsed.position.z.toFixed(3);
        if (work_x_pos) work_x_pos.textContent = parsed.workPosition.x.toFixed(3);
        if (work_y_pos) work_y_pos.textContent = parsed.workPosition.y.toFixed(3);
        if (work_z_pos) work_z_pos.textContent = parsed.workPosition.z.toFixed(3);
      }
    } catch (error) {
      log_message(`Status update failed: ${error}`, 'error');
    }
  });
}

function send_jog_command(axis: string, direction: number) {
  log_message(`🎮 Jog button clicked: ${axis} ${direction}`, 'info');
  log_message(`🔍 Can jog: ${state_machine.can_jog()}`, 'info');
  log_message(`📊 Current state: ${state_machine.get_current_state()}`, 'info');
  
  if (!state_machine.can_jog()) {
    log_message('🚫 Jog blocked by state machine', 'error');
    return;
  }
  
  const stepSize = parseFloat(step_size_input!.value);
  const distance = stepSize * direction;
  
  log_message(`📤 Sending jog command: ${axis} ${distance}`, 'info');
  
  // Don't send event to state machine - let STATUS_JOG trigger the transition
  // This matches the behavior of presets for simplified status
  
  // Use non-blocking jog command
  CncManager.jog_no_wait(axis, distance).then(() => {
    log_message(`Jog ${axis}${distance > 0 ? '+' : ''}${distance}: command sent`, 'success');
    // No state machine event - let GRBL status drive the state transitions
  }).catch(error => {
    log_message(`❌ Jog error: ${error}`, 'error');
    // For errors, we could still send a failure event, but typically GRBL status will handle this
  });
}

function home_all_axes() {
  if (!state_machine.can_home()) return;
  
  // Send event to state machine
  state_machine.handle_event({ type: EventType.HOME_BUTTON_CLICKED });
  
  log_message("Homing all axes...");
  
  // Fire and forget - send command and return immediately
  // Use setTimeout to ensure this doesn't block even if invoke is synchronous
  setTimeout(() => {
    CncManager.home().then(() => {
      log_message("Home command sent successfully", 'success');
      // Don't send COMMAND_SUCCESS here - let status polling detect completion
    }).catch(error => {
      log_message(`Home command error: ${error}`, 'error');
      state_machine.handle_event({ type: EventType.COMMAND_FAILED });
    });
  }, 0); // Execute on next tick
}

async function clear_alarm() {
  if (!state_machine.can_clear_alarm()) return;
  
  // Send event to state machine
  state_machine.handle_event({ type: EventType.CLEAR_ALARM_CLICKED });
  
  try {
    const response = await CncManager.reset();
    const trimmedResponse = response.trim();
    
    // Check if response contains an error and translate it
    if (CncManager.contains_error(trimmedResponse)) {
      const translatedResponse = CncManager.translate_response(trimmedResponse);
      log_message(`Reset/Clear alarm: ${translatedResponse}`, 'error');
    } else {
      log_message(`Reset/Clear alarm: ${trimmedResponse}`, 'success');
    }
  } catch (error) {
    log_message(`Reset failed: ${error}`, 'error');
  }
}

async function set_work_zero(axes: string) {
  if (!is_connected) return;
  
  try {
    const response = await CncManager.set_work_zero(axes);
    const trimmedResponse = response.trim();
    
    // Check if response contains an error and translate it
    if (CncManager.contains_error(trimmedResponse)) {
      const translatedResponse = CncManager.translate_response(trimmedResponse);
      log_message(`Set work zero ${axes}: ${translatedResponse}`, 'error');
    } else {
      log_message(`Set work zero ${axes}: ${trimmedResponse}`, 'success');
    }
  } catch (error) {
    log_message(`Set zero failed: ${error}`, 'error');
  }
}

async function go_to_work_zero() {
  if (!is_connected) return;
  
  try {
    log_message("Moving to work coordinate X0 Y0 (preserving Z)...");
    const response = await CncManager.send_command("G0 X0 Y0");
    const trimmedResponse = response.trim();
    
    // Check if response contains an error and translate it
    if (CncManager.contains_error(trimmedResponse)) {
      const translatedResponse = CncManager.translate_response(trimmedResponse);
      log_message(`Go work zero: ${translatedResponse}`, 'error');
    } else {
      log_message(`Go work zero: ${trimmedResponse}`, 'success');
    }
  } catch (error) {
    log_message(`Go work zero failed: ${error}`, 'error');
  }
}

async function go_to_machine_zero() {
  if (!is_connected) return;
  
  try {
    log_message("Moving to machine coordinate X0 Y0 (preserving Z)...");
    const response = await CncManager.send_command("G53 G0 X0 Y0");
    const trimmedResponse = response.trim();
    
    // Check if response contains an error and translate it
    if (CncManager.contains_error(trimmedResponse)) {
      const translatedResponse = CncManager.translate_response(trimmedResponse);
      log_message(`Go machine zero: ${translatedResponse}`, 'error');
    } else {
      log_message(`Go machine zero: ${trimmedResponse}`, 'success');
    }
  } catch (error) {
    log_message(`Go machine zero failed: ${error}`, 'error');
  }
}

async function copy_log() {
  if (!communication_log) return;
  
  const text = communication_log.textContent || '';
  
  try {
    await (window as any).tauriCopyToClipboard(text);
    
    // Temporarily change button text to show success
    if (copy_log_button) {
      const originalText = copy_log_button.textContent;
      copy_log_button.textContent = 'Copied!';
      setTimeout(() => {
        if (copy_log_button) copy_log_button.textContent = originalText;
      }, 1000);
    }
  } catch (error) {
    log_message(`Failed to copy log: ${error}`, 'error');
  }
}

// Load saved XY coordinates from localStorage
function load_saved_xy_coordinates() {
  try {
    const saved = localStorage.getItem('cnc_xy_coordinates');
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    log_message('Failed to load saved XY coordinates', 'error');
    return {};
  }
}

// Save XY coordinates to localStorage
function saveXyCoordinates() {
  try {
    localStorage.setItem('cnc_xy_coordinates', JSON.stringify(saved_xy_coordinates));
    log_message('XY coordinates saved');
  } catch (error) {
    log_message('Failed to save XY coordinates', 'error');
  }
}

// Save current XY position as a preset (using machine coordinates)
async function save_current_xy_position(name?: string) {
  if (!is_connected) {
    log_message('Not connected to CNC', 'error');
    return;
  }

  // Get current machine status to get accurate machine coordinates
  try {
    const status = await CncManager.get_status();
    const parsed = CncManager.parse_status(status, last_work_offset);
    
    if (!parsed) {
      log_message('Could not get current position', 'error');
      return;
    }

    // Auto-generate name if not provided
    if (!name) {
      const existingPresets = Object.keys(saved_xy_coordinates);
      let presetNumber = 1;
      let generatedName;
      
      // Find the next available preset number
      do {
        generatedName = `Preset ${presetNumber}`;
        presetNumber++;
      } while (existingPresets.includes(generatedName));
      
      name = generatedName;
    }

    // Save machine coordinates (absolute positions for fixtures/vises/tooling)
    saved_xy_coordinates[name] = {
      x: parsed.position.x,  // Machine coordinates
      y: parsed.position.y,  // Machine coordinates
      timestamp: new Date().toISOString()
    };

    saveXyCoordinates();
    log_message(`Saved machine XY position "${name}": X${parsed.position.x.toFixed(3)} Y${parsed.position.y.toFixed(3)}`, 'success');
    updateXyPresetsUi();
    
  } catch (error) {
    log_message(`Failed to save XY position: ${error}`, 'error');
  }
}

// Go to a saved XY position
async function gotoSavedXyPosition(name: string) {
  const coords = saved_xy_coordinates[name];
  if (!coords) {
    log_message(`XY position "${name}" not found`, 'error');
    return;
  }

  if (!is_connected) {
    log_message('Not connected to CNC', 'error');
    return;
  }

  try {
    // Move to the saved machine coordinates using G53 (machine coordinate system)
    const response = await CncManager.send_command(`G53 G0 X${coords.x} Y${coords.y}`);
    const trimmedResponse = response.trim();
    
    // Check if response contains an error and translate it
    if (CncManager.contains_error(trimmedResponse)) {
      const translatedResponse = CncManager.translate_response(trimmedResponse);
      log_message(`Moving to "${name}" (machine coords): X${coords.x} Y${coords.y} - ${translatedResponse}`, 'error');
    } else {
      log_message(`Moving to "${name}" (machine coords): X${coords.x} Y${coords.y} - ${trimmedResponse}`, 'success');
    }
  } catch (error) {
    log_message(`Failed to move to "${name}": ${error}`, 'error');
  }
}

// Delete a saved XY position
function deleteSavedXyPosition(name: string) {
  if (saved_xy_coordinates[name]) {
    delete saved_xy_coordinates[name];
    saveXyCoordinates();
    log_message(`Deleted XY position "${name}"`, 'success');
    updateXyPresetsUi();
  }
}

// Edit a saved XY position
function editSavedXyPosition(oldName: string) {
  const coords = saved_xy_coordinates[oldName];
  if (!coords) return;
  
  // Create modal dialog
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;';
  
  const dialog = document.createElement('div');
  dialog.style.cssText = 'background: white; padding: 20px; border-radius: 8px; min-width: 300px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
  
  dialog.innerHTML = `
    <div style="margin-bottom: 15px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">Name:</label>
      <input type="text" id="edit-name" value="${oldName}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
    </div>
    <div style="margin-bottom: 15px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">X:</label>
      <input type="text" id="edit-x" value="${coords.x.toFixed(3)}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
    </div>
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">Y:</label>
      <input type="text" id="edit-y" value="${coords.y.toFixed(3)}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
    </div>
    <div style="text-align: right;">
      <button id="edit-cancel" style="margin-right: 10px; padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
      <button id="edit-ok" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">OK</button>
    </div>
  `;
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  // Focus the name input
  const nameInput = dialog.querySelector('#edit-name') as HTMLInputElement;
  nameInput.focus();
  nameInput.select();
  
  // Handle OK button
  dialog.querySelector('#edit-ok')?.addEventListener('click', () => {
    const newName = (dialog.querySelector('#edit-name') as HTMLInputElement).value.trim();
    const newX = parseFloat((dialog.querySelector('#edit-x') as HTMLInputElement).value);
    const newY = parseFloat((dialog.querySelector('#edit-y') as HTMLInputElement).value);
    
    if (!newName) {
      alert('Name cannot be empty');
      return;
    }
    
    if (isNaN(newX) || isNaN(newY)) {
      alert('X and Y must be valid numbers');
      return;
    }
    
    // Check if new name already exists (and it's different from current)
    if (newName !== oldName && saved_xy_coordinates[newName]) {
      alert(`Preset "${newName}" already exists!`);
      return;
    }
    
    // Remove old entry if name changed
    if (newName !== oldName) {
      delete saved_xy_coordinates[oldName];
    }
    
    // Save with new values
    saved_xy_coordinates[newName] = { 
      x: newX, 
      y: newY, 
      timestamp: new Date().toISOString() 
    };
    
    saveXyCoordinates();
    log_message(`Updated preset "${newName}"`, 'success');
    updateXyPresetsUi();
    document.body.removeChild(overlay);
  });
  
  // Handle Cancel button and overlay click
  const closeDialog = () => document.body.removeChild(overlay);
  dialog.querySelector('#edit-cancel')?.addEventListener('click', closeDialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDialog();
  });
  
  // Handle Enter key
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      dialog.querySelector('#edit-ok')?.dispatchEvent(new Event('click'));
    } else if (e.key === 'Escape') {
      closeDialog();
    }
  });
}

// Update the XY presets UI
function updateXyPresetsUi() {
  if (!xy_presets_list) return;

  xy_presets_list.innerHTML = '';
  
  Object.entries(saved_xy_coordinates).forEach(([name, coords]) => {
    const presetDiv = document.createElement('div');
    presetDiv.style.cssText = 'display: flex; gap: 4px; align-items: center; margin: 2px 0;';
    
    // Go to position button
    const gotoButton = document.createElement('button');
    gotoButton.textContent = `${name} (X${coords.x.toFixed(3)} Y${coords.y.toFixed(3)})`;
    gotoButton.style.cssText = 'font-size: 11px; padding: 4px 8px; flex: 1;';
    gotoButton.addEventListener('click', () => gotoSavedXyPosition(name));
    
    // Rename button
    const renameButton = document.createElement('button');
    renameButton.textContent = '✏️';
    renameButton.title = 'Rename preset';
    renameButton.style.cssText = 'font-size: 11px; padding: 4px 6px; background: #007bff; color: white; border: none; border-radius: 3px;';
    renameButton.addEventListener('click', () => editSavedXyPosition(name));
    
    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.textContent = '×';
    deleteButton.title = 'Delete preset';
    deleteButton.style.cssText = 'font-size: 11px; padding: 4px 6px; background: #dc3545; color: white; border: none; border-radius: 3px;';
    deleteButton.addEventListener('click', () => {
      if (confirm(`Delete preset "${name}"?`)) {
        deleteSavedXyPosition(name);
      }
    });
    
    presetDiv.appendChild(gotoButton);
    presetDiv.appendChild(renameButton);
    presetDiv.appendChild(deleteButton);
    if (xy_presets_list) {
      xy_presets_list.appendChild(presetDiv);
    }
  });
}

function setupStepSizeButtons() {
  const stepButtons = [
    { id: 'step_01_button', value: 0.1 },
    { id: 'step_1_button', value: 1 },
    { id: 'step_10_button', value: 10 }
  ];
  
  stepButtons.forEach(({ id, value }) => {
    const button = document.getElementById(id) as HTMLButtonElement;
    if (button) {
      button.addEventListener('click', () => {
        if (step_size_input) step_size_input.value = value.toString();
      });
    }
  });
}

function toggle_log() {
  if (!communication_log || !toggle_log_button) return;
  
  const isVisible = communication_log.style.display === 'block';
  const newVisibility = !isVisible;
  
  communication_log.style.display = newVisibility ? 'block' : 'none';
  toggle_log_button.textContent = newVisibility ? 'Hide Log' : 'Show Log';
  
  // Save the state to localStorage
  localStorage.setItem('cnc_log_visible', newVisibility.toString());
}

function restore_log_visibility() {
  if (!communication_log || !toggle_log_button) return;
  
  // Get saved state from localStorage (default to visible)
  const savedState = localStorage.getItem('cnc_log_visible');
  const isVisible = savedState !== null ? savedState === 'true' : true;
  
  communication_log.style.display = isVisible ? 'block' : 'none';
  toggle_log_button.textContent = isVisible ? 'Hide Log' : 'Show Log';
}

window.addEventListener("DOMContentLoaded", () => {
  // Register state machine listener
  state_machine.add_state_change_listener(handle_state_change);
  
  // Original greet functionality
  greet_input_el = document.querySelector("#greet-input");
  greet_msg_el = document.querySelector("#greet-msg");
  const greetForm = document.querySelector("#greet-form");
  if (greetForm) {
    greetForm.addEventListener("submit", (e) => {
      e.preventDefault();
      greet();
    });
  }
  
  // CNC UI elements
  connect_button = document.getElementById("connect_button") as HTMLButtonElement;
  disconnect_button = document.getElementById("disconnect_button") as HTMLButtonElement;
  status_indicator = document.getElementById("status_indicator");
  status_text = document.getElementById("status_text");
  communication_log = document.getElementById("communication_log");
  toggle_log_button = document.getElementById("toggle_log_button") as HTMLButtonElement;
  
  // Status details modal elements
  status_details_modal = document.getElementById("status_details_modal");
  status_details_close = document.getElementById("status_details_close") as HTMLButtonElement;
  status_details_body = document.getElementById("status_details_body");
  
  // Position display elements
  machine_x_pos = document.getElementById("machine_x_position");
  machine_y_pos = document.getElementById("machine_y_position");
  machine_z_pos = document.getElementById("machine_z_position");
  work_x_pos = document.getElementById("work_x_position");
  work_y_pos = document.getElementById("work_y_position");
  work_z_pos = document.getElementById("work_z_position");
  
  // Control elements
  home_button = document.getElementById("home_button") as HTMLButtonElement;
  clear_alarm_button = document.getElementById("clear_alarm_button") as HTMLButtonElement;
  copy_log_button = document.getElementById("copy_log_button") as HTMLButtonElement;
  step_size_input = document.getElementById("step_size_input") as HTMLInputElement;
  
  // Save XY preset elements
  save_xy_preset_button = document.getElementById("save_xy_preset_button") as HTMLButtonElement;
  xy_presets_list = document.getElementById("xy_presets_list");
  
  // Jog buttons
  jog_buttons = {
    'x_plus': document.getElementById("jog_x_plus_button") as HTMLButtonElement,
    'x_minus': document.getElementById("jog_x_minus_button") as HTMLButtonElement,
    'y_plus': document.getElementById("jog_y_plus_button") as HTMLButtonElement,
    'y_minus': document.getElementById("jog_y_minus_button") as HTMLButtonElement,
    'z_plus': document.getElementById("jog_z_plus_button") as HTMLButtonElement,
    'z_minus': document.getElementById("jog_z_minus_button") as HTMLButtonElement,
  };
  
  // Zero buttons
  zero_buttons = {
    'all': document.getElementById("zero_all_button") as HTMLButtonElement,
    'x': document.getElementById("zero_x_button") as HTMLButtonElement,
    'y': document.getElementById("zero_y_button") as HTMLButtonElement,
    'z': document.getElementById("zero_z_button") as HTMLButtonElement,
    'xy': document.getElementById("zero_xy_button") as HTMLButtonElement,
    'go_work_zero': document.getElementById("go_work_zero_button") as HTMLButtonElement,
    'go_machine_zero': document.getElementById("go_machine_zero_button") as HTMLButtonElement,
  };
  
  // Event listeners
  if (connect_button) {
    connect_button.addEventListener("click", discover_and_connect);
  }
  
  if (disconnect_button) {
    disconnect_button.addEventListener("click", disconnect);
  }
  
  if (home_button) {
    home_button.addEventListener("click", home_all_axes);
  }
  
  if (clear_alarm_button) {
    clear_alarm_button.addEventListener("click", clear_alarm);
  }
  
  if (copy_log_button) {
    copy_log_button.addEventListener("click", copy_log);
  }
  
  if (toggle_log_button) {
    toggle_log_button.addEventListener("click", toggle_log);
  }
  
  // Status details modal events
  if (status_text) {
    status_text.addEventListener("click", show_status_details);
  }
  
  if (status_details_close) {
    status_details_close.addEventListener("click", hide_status_details);
  }
  
  if (status_details_modal) {
    status_details_modal.addEventListener("click", (e) => {
      if (e.target === status_details_modal) {
        hide_status_details();
      }
    });
  }
  
  // Jog button events
  if (jog_buttons.x_plus) jog_buttons.x_plus.addEventListener("click", () => send_jog_command("X", 1));
  if (jog_buttons.x_minus) jog_buttons.x_minus.addEventListener("click", () => send_jog_command("X", -1));
  if (jog_buttons.y_plus) jog_buttons.y_plus.addEventListener("click", () => send_jog_command("Y", 1));
  if (jog_buttons.y_minus) jog_buttons.y_minus.addEventListener("click", () => send_jog_command("Y", -1));
  if (jog_buttons.z_plus) jog_buttons.z_plus.addEventListener("click", () => send_jog_command("Z", 1));
  if (jog_buttons.z_minus) jog_buttons.z_minus.addEventListener("click", () => send_jog_command("Z", -1));
  
  // Zero button events
  if (zero_buttons.all) zero_buttons.all.addEventListener("click", () => set_work_zero("X0Y0Z0"));
  if (zero_buttons.x) zero_buttons.x.addEventListener("click", () => set_work_zero("X0"));
  if (zero_buttons.y) zero_buttons.y.addEventListener("click", () => set_work_zero("Y0"));
  if (zero_buttons.z) zero_buttons.z.addEventListener("click", () => set_work_zero("Z0"));
  if (zero_buttons.xy) zero_buttons.xy.addEventListener("click", () => set_work_zero("X0Y0"));
  if (zero_buttons.go_work_zero) zero_buttons.go_work_zero.addEventListener("click", go_to_work_zero);
  if (zero_buttons.go_machine_zero) zero_buttons.go_machine_zero.addEventListener("click", go_to_machine_zero);
  
  // Setup step size buttons
  setupStepSizeButtons();
  
  // Save XY preset functionality
  if (save_xy_preset_button) {
    save_xy_preset_button.addEventListener("click", () => save_current_xy_position());
  }
  
  // Load saved XY coordinates and update UI
  saved_xy_coordinates = load_saved_xy_coordinates();
  updateXyPresetsUi();
  
  // Initial state
  update_connection_status(false);
  
  // Restore log visibility from saved state
  restore_log_visibility();
  
  // Status update with self-scheduling setTimeout to prevent backups
  function scheduleStatusUpdate() {
    setTimeout(async () => {
      if (is_connected) {
        try {
          await updateMachineStatus();
        } catch (error) {
          // Don't let status update errors break the polling loop
          console.error('Status update error:', error);
        }
      }
      // Schedule next update regardless of connection state or errors
      scheduleStatusUpdate();
    }, 100); // Update every 100ms when not blocked
  }
  
  // Start the status update loop
  scheduleStatusUpdate();
  
  log_message("CNC Panel initialized. Click 'Connect' to discover and connect to your Genmitsu CNC.");
  
  // Attempt auto-reconnect after a short delay to let the UI finish loading
  setTimeout(async () => {
    const reconnected = await attemptAutoReconnect();
    if (!reconnected) {
      log_message("Ready for manual connection.", 'info');
    }
  }, 1000); // 1 second delay
});
