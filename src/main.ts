import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { CncManager, CncDevice } from "./cnc-manager";

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

let greetInputEl: HTMLInputElement | null;
let greetMsgEl: HTMLElement | null;

// CNC-related elements
let connectButton: HTMLButtonElement | null;
let disconnectButton: HTMLButtonElement | null;
let statusIndicator: HTMLElement | null;
let statusText: HTMLElement | null;
let machineState: HTMLElement | null;
let communicationLog: HTMLElement | null;
let toggleLogButton: HTMLButtonElement | null;

// Position display elements
let machineXPos: HTMLElement | null;
let machineYPos: HTMLElement | null;
let machineZPos: HTMLElement | null;
let workXPos: HTMLElement | null;
let workYPos: HTMLElement | null;
let workZPos: HTMLElement | null;

// Control elements
let homeButton: HTMLButtonElement | null;
let clearAlarmButton: HTMLButtonElement | null;
let copyLogButton: HTMLButtonElement | null;
let jogButtons: { [key: string]: HTMLButtonElement | null } = {};
let stepSizeInput: HTMLInputElement | null;
let zeroButtons: { [key: string]: HTMLButtonElement | null } = {};

// Save XY preset elements
let saveXyPresetButton: HTMLButtonElement | null;
let xyPresetsList: HTMLElement | null;

let isConnected = false;
let discoveredDevices: CncDevice[] = [];
let lastWorkOffset = { x: 0, y: 0, z: 0 }; // Persistent work coordinate offset
let savedXyCoordinates: { [name: string]: { x: number; y: number; timestamp: string } } = {};

async function greet() {
  if (greetMsgEl && greetInputEl) {
    greetMsgEl.textContent = await invoke("greet", {
      name: greetInputEl.value,
    });
  }
}

function logMessage(message: string, type: 'info' | 'error' | 'success' = 'info') {
  if (!communicationLog) return;
  
  const timestamp = new Date().toLocaleTimeString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  const logEntry = `[${timestamp}] ${prefix} ${message}\n`;
  
  communicationLog.textContent += logEntry;
  communicationLog.scrollTop = communicationLog.scrollHeight;
}

function updateConnectionStatus(connected: boolean, deviceInfo?: CncDevice) {
  isConnected = connected;
  
  if (statusIndicator) {
    statusIndicator.className = `status-indicator ${connected ? 'connected' : ''}`;
  }
  
  if (statusText) {
    if (connected && deviceInfo) {
      statusText.textContent = `Connected to ${deviceInfo.name} (${deviceInfo.ip}:${deviceInfo.port})`;
    } else {
      statusText.textContent = 'Disconnected';
    }
  }
  
  // Update button states
  if (connectButton) connectButton.disabled = connected;
  if (disconnectButton) disconnectButton.disabled = !connected;
  if (clearAlarmButton) clearAlarmButton.disabled = !connected;
  if (homeButton) homeButton.disabled = !connected;
  if (saveXyPresetButton) saveXyPresetButton.disabled = !connected;
  
  // Update jog buttons
  Object.values(jogButtons).forEach(button => {
    if (button) button.disabled = !connected;
  });
  
  // Update zero buttons
  Object.values(zeroButtons).forEach(button => {
    if (button) button.disabled = !connected;
  });
}

async function discoverAndConnect() {
  logMessage("Starting CNC device discovery...");
  connectButton!.textContent = "Discovering...";
  connectButton!.disabled = true;
  
  try {
    discoveredDevices = await CncManager.discoverDevices();
    logMessage(`Found ${discoveredDevices.length} potential CNC device(s)`);
    
    if (discoveredDevices.length === 0) {
      logMessage("No CNC devices found. Make sure your Genmitsu WiFi module is connected and powered on.", 'error');
      return;
    }
    
    // For now, connect to the first device found
    // In a full implementation, you might want to show a device selection dialog
    const device = discoveredDevices[0];
    logMessage(`Attempting to connect to ${device.name} at ${device.ip}:${device.port}`);
    
    await CncManager.connect(device);
    updateConnectionStatus(true, device);
    logMessage(`Successfully connected to ${device.name}`, 'success');
    
    // Get initial status
    await updateMachineStatus();
    
  } catch (error) {
    logMessage(`Connection failed: ${error}`, 'error');
    updateConnectionStatus(false);
  } finally {
    connectButton!.textContent = "Connect";
    connectButton!.disabled = false;
  }
}

async function disconnect() {
  try {
    await CncManager.disconnect();
    updateConnectionStatus(false);
    lastWorkOffset = { x: 0, y: 0, z: 0 }; // Reset work offset
    logMessage("Disconnected from CNC", 'success');
  } catch (error) {
    logMessage(`Disconnect error: ${error}`, 'error');
  }
}

async function updateMachineStatus() {
  if (!isConnected) return;
  
  try {
    const status = await CncManager.getStatus();
    const parsed = CncManager.parseStatus(status, lastWorkOffset);
    
    if (parsed) {
      // Update stored work offset if this status contains WCO
      if ((parsed as any).workOffset) {
        lastWorkOffset = (parsed as any).workOffset;
      }
      
      // Update machine state
      if (machineState) {
        machineState.textContent = parsed.state;
        machineState.style.color = parsed.state === 'Idle' ? '#28a745' : 
                                   parsed.state.includes('Alarm') ? '#dc3545' : '#ffc107';
      }
      
      // Update position displays
      if (machineXPos) machineXPos.textContent = parsed.position.x.toFixed(3);
      if (machineYPos) machineYPos.textContent = parsed.position.y.toFixed(3);
      if (machineZPos) machineZPos.textContent = parsed.position.z.toFixed(3);
      if (workXPos) workXPos.textContent = parsed.workPosition.x.toFixed(3);
      if (workYPos) workYPos.textContent = parsed.workPosition.y.toFixed(3);
      if (workZPos) workZPos.textContent = parsed.workPosition.z.toFixed(3);
    }
    
  } catch (error) {
    logMessage(`Status update failed: ${error}`, 'error');
  }
}

async function sendJogCommand(axis: string, direction: number) {
  if (!isConnected) return;
  
  const stepSize = parseFloat(stepSizeInput!.value);
  const distance = stepSize * direction;
  
  try {
    const response = await CncManager.jog(axis, distance);
    logMessage(`Jog ${axis}${distance > 0 ? '+' : ''}${distance}: ${response.trim()}`);
  } catch (error) {
    logMessage(`Jog failed: ${error}`, 'error');
  }
}

async function homeAllAxes() {
  if (!isConnected) return;
  
  try {
    logMessage("Homing all axes...");
    const response = await CncManager.home();
    logMessage(`Home command: ${response.trim()}`, 'success');
  } catch (error) {
    logMessage(`Home failed: ${error}`, 'error');
  }
}

async function clearAlarm() {
  if (!isConnected) return;
  
  try {
    const response = await CncManager.reset();
    logMessage(`Reset/Clear alarm: ${response.trim()}`, 'success');
  } catch (error) {
    logMessage(`Reset failed: ${error}`, 'error');
  }
}

async function setWorkZero(axes: string) {
  if (!isConnected) return;
  
  try {
    const response = await CncManager.setWorkZero(axes);
    logMessage(`Set work zero ${axes}: ${response.trim()}`, 'success');
  } catch (error) {
    logMessage(`Set zero failed: ${error}`, 'error');
  }
}

async function goToWorkZero() {
  if (!isConnected) return;
  
  try {
    logMessage("Moving to work coordinate X0 Y0 (preserving Z)...");
    const response = await CncManager.sendCommand("G0 X0 Y0");
    logMessage(`Go work zero: ${response.trim()}`, 'success');
  } catch (error) {
    logMessage(`Go work zero failed: ${error}`, 'error');
  }
}

async function goToMachineZero() {
  if (!isConnected) return;
  
  try {
    logMessage("Moving to machine coordinate X0 Y0 (preserving Z)...");
    const response = await CncManager.sendCommand("G53 G0 X0 Y0");
    logMessage(`Go machine zero: ${response.trim()}`, 'success');
  } catch (error) {
    logMessage(`Go machine zero failed: ${error}`, 'error');
  }
}

async function copyLog() {
  if (!communicationLog) return;
  
  const text = communicationLog.textContent || '';
  
  try {
    await (window as any).tauriCopyToClipboard(text);
    
    // Temporarily change button text to show success
    if (copyLogButton) {
      const originalText = copyLogButton.textContent;
      copyLogButton.textContent = 'Copied!';
      setTimeout(() => {
        if (copyLogButton) copyLogButton.textContent = originalText;
      }, 1000);
    }
  } catch (error) {
    logMessage(`Failed to copy log: ${error}`, 'error');
  }
}

// Load saved XY coordinates from localStorage
function loadSavedXyCoordinates() {
  try {
    const saved = localStorage.getItem('cnc_xy_coordinates');
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    logMessage('Failed to load saved XY coordinates', 'error');
    return {};
  }
}

// Save XY coordinates to localStorage
function saveXyCoordinates() {
  try {
    localStorage.setItem('cnc_xy_coordinates', JSON.stringify(savedXyCoordinates));
    logMessage('XY coordinates saved');
  } catch (error) {
    logMessage('Failed to save XY coordinates', 'error');
  }
}

// Save current XY position as a preset
async function saveCurrentXyPosition(name?: string) {
  if (!isConnected) {
    logMessage('Not connected to CNC', 'error');
    return;
  }

  // Auto-generate name if not provided
  if (!name) {
    const existingPresets = Object.keys(savedXyCoordinates);
    let presetNumber = 1;
    let generatedName;
    
    // Find the next available preset number
    do {
      generatedName = `Preset ${presetNumber}`;
      presetNumber++;
    } while (existingPresets.includes(generatedName));
    
    name = generatedName;
  }

  // Get current work XY position from the display elements
  const xPos = workXPos ? parseFloat(workXPos.textContent || '0') : 0;
  const yPos = workYPos ? parseFloat(workYPos.textContent || '0') : 0;

  savedXyCoordinates[name] = {
    x: xPos,
    y: yPos,
    timestamp: new Date().toISOString()
  };

  saveXyCoordinates();
  logMessage(`Saved work XY position "${name}": X${xPos.toFixed(3)} Y${yPos.toFixed(3)}`, 'success');
  updateXyPresetsUi();
}

// Go to a saved XY position
async function gotoSavedXyPosition(name: string) {
  const coords = savedXyCoordinates[name];
  if (!coords) {
    logMessage(`XY position "${name}" not found`, 'error');
    return;
  }

  if (!isConnected) {
    logMessage('Not connected to CNC', 'error');
    return;
  }

  try {
    // Move to the saved work coordinates (using G0 rapid positioning)
    const response = await CncManager.sendCommand(`G0X${coords.x}Y${coords.y}`);
    logMessage(`Moving to "${name}": X${coords.x} Y${coords.y} - ${response.trim()}`, 'success');
  } catch (error) {
    logMessage(`Failed to move to "${name}": ${error}`, 'error');
  }
}

// Delete a saved XY position
function deleteSavedXyPosition(name: string) {
  if (savedXyCoordinates[name]) {
    delete savedXyCoordinates[name];
    saveXyCoordinates();
    logMessage(`Deleted XY position "${name}"`, 'success');
    updateXyPresetsUi();
  }
}

// Rename a saved XY position
function renameSavedXyPosition(oldName: string) {
  const newName = prompt(`Rename "${oldName}" to:`, oldName);
  if (!newName || newName === oldName) return;
  
  // Check if new name already exists
  if (savedXyCoordinates[newName]) {
    alert(`Preset "${newName}" already exists!`);
    return;
  }
  
  // Move the coordinates to the new name
  savedXyCoordinates[newName] = savedXyCoordinates[oldName];
  delete savedXyCoordinates[oldName];
  
  saveXyCoordinates();
  logMessage(`Renamed preset "${oldName}" to "${newName}"`, 'success');
  updateXyPresetsUi();
}

// Update the XY presets UI
function updateXyPresetsUi() {
  if (!xyPresetsList) return;

  xyPresetsList.innerHTML = '';
  
  Object.entries(savedXyCoordinates).forEach(([name, coords]) => {
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
    renameButton.addEventListener('click', () => renameSavedXyPosition(name));
    
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
    if (xyPresetsList) {
      xyPresetsList.appendChild(presetDiv);
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
        if (stepSizeInput) stepSizeInput.value = value.toString();
      });
    }
  });
}

function toggleLog() {
  if (!communicationLog || !toggleLogButton) return;
  
  const isVisible = communicationLog.style.display === 'block';
  communicationLog.style.display = isVisible ? 'none' : 'block';
  toggleLogButton.textContent = isVisible ? 'Show Log' : 'Hide Log';
}

window.addEventListener("DOMContentLoaded", () => {
  // Original greet functionality
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  const greetForm = document.querySelector("#greet-form");
  if (greetForm) {
    greetForm.addEventListener("submit", (e) => {
      e.preventDefault();
      greet();
    });
  }
  
  // CNC UI elements
  connectButton = document.getElementById("connect_button") as HTMLButtonElement;
  disconnectButton = document.getElementById("disconnect_button") as HTMLButtonElement;
  statusIndicator = document.getElementById("status_indicator");
  statusText = document.getElementById("status_text");
  machineState = document.getElementById("machine_state");
  communicationLog = document.getElementById("communication_log");
  toggleLogButton = document.getElementById("toggle_log_button") as HTMLButtonElement;
  
  // Position display elements
  machineXPos = document.getElementById("machine_x_position");
  machineYPos = document.getElementById("machine_y_position");
  machineZPos = document.getElementById("machine_z_position");
  workXPos = document.getElementById("work_x_position");
  workYPos = document.getElementById("work_y_position");
  workZPos = document.getElementById("work_z_position");
  
  // Control elements
  homeButton = document.getElementById("home_button") as HTMLButtonElement;
  clearAlarmButton = document.getElementById("clear_alarm_button") as HTMLButtonElement;
  copyLogButton = document.getElementById("copy_log_button") as HTMLButtonElement;
  stepSizeInput = document.getElementById("step_size_input") as HTMLInputElement;
  
  // Save XY preset elements
  saveXyPresetButton = document.getElementById("save_xy_preset_button") as HTMLButtonElement;
  xyPresetsList = document.getElementById("xy_presets_list");
  
  // Jog buttons
  jogButtons = {
    'x_plus': document.getElementById("jog_x_plus_button") as HTMLButtonElement,
    'x_minus': document.getElementById("jog_x_minus_button") as HTMLButtonElement,
    'y_plus': document.getElementById("jog_y_plus_button") as HTMLButtonElement,
    'y_minus': document.getElementById("jog_y_minus_button") as HTMLButtonElement,
    'z_plus': document.getElementById("jog_z_plus_button") as HTMLButtonElement,
    'z_minus': document.getElementById("jog_z_minus_button") as HTMLButtonElement,
  };
  
  // Zero buttons
  zeroButtons = {
    'all': document.getElementById("zero_all_button") as HTMLButtonElement,
    'x': document.getElementById("zero_x_button") as HTMLButtonElement,
    'y': document.getElementById("zero_y_button") as HTMLButtonElement,
    'z': document.getElementById("zero_z_button") as HTMLButtonElement,
    'xy': document.getElementById("zero_xy_button") as HTMLButtonElement,
    'go_work_zero': document.getElementById("go_work_zero_button") as HTMLButtonElement,
    'go_machine_zero': document.getElementById("go_machine_zero_button") as HTMLButtonElement,
  };
  
  // Event listeners
  if (connectButton) {
    connectButton.addEventListener("click", discoverAndConnect);
  }
  
  if (disconnectButton) {
    disconnectButton.addEventListener("click", disconnect);
  }
  
  if (homeButton) {
    homeButton.addEventListener("click", homeAllAxes);
  }
  
  if (clearAlarmButton) {
    clearAlarmButton.addEventListener("click", clearAlarm);
  }
  
  if (copyLogButton) {
    copyLogButton.addEventListener("click", copyLog);
  }
  
  if (toggleLogButton) {
    toggleLogButton.addEventListener("click", toggleLog);
  }
  
  // Jog button events
  if (jogButtons.x_plus) jogButtons.x_plus.addEventListener("click", () => sendJogCommand("X", 1));
  if (jogButtons.x_minus) jogButtons.x_minus.addEventListener("click", () => sendJogCommand("X", -1));
  if (jogButtons.y_plus) jogButtons.y_plus.addEventListener("click", () => sendJogCommand("Y", 1));
  if (jogButtons.y_minus) jogButtons.y_minus.addEventListener("click", () => sendJogCommand("Y", -1));
  if (jogButtons.z_plus) jogButtons.z_plus.addEventListener("click", () => sendJogCommand("Z", 1));
  if (jogButtons.z_minus) jogButtons.z_minus.addEventListener("click", () => sendJogCommand("Z", -1));
  
  // Zero button events
  if (zeroButtons.all) zeroButtons.all.addEventListener("click", () => setWorkZero("X0Y0Z0"));
  if (zeroButtons.x) zeroButtons.x.addEventListener("click", () => setWorkZero("X0"));
  if (zeroButtons.y) zeroButtons.y.addEventListener("click", () => setWorkZero("Y0"));
  if (zeroButtons.z) zeroButtons.z.addEventListener("click", () => setWorkZero("Z0"));
  if (zeroButtons.xy) zeroButtons.xy.addEventListener("click", () => setWorkZero("X0Y0"));
  if (zeroButtons.go_work_zero) zeroButtons.go_work_zero.addEventListener("click", goToWorkZero);
  if (zeroButtons.go_machine_zero) zeroButtons.go_machine_zero.addEventListener("click", goToMachineZero);
  
  // Setup step size buttons
  setupStepSizeButtons();
  
  // Save XY preset functionality
  if (saveXyPresetButton) {
    saveXyPresetButton.addEventListener("click", () => saveCurrentXyPosition());
  }
  
  // Load saved XY coordinates and update UI
  savedXyCoordinates = loadSavedXyCoordinates();
  updateXyPresetsUi();
  
  // Initial state
  updateConnectionStatus(false);
  
  // Start with log hidden
  if (communicationLog) {
    communicationLog.style.display = 'none';
  }
  
  // Status update interval when connected
  setInterval(() => {
    if (isConnected) {
      updateMachineStatus();
    }
  }, 100); // Update every 100ms (10 times per second)
  
  logMessage("CNC Panel initialized. Click 'Connect' to discover and connect to your Genmitsu CNC.");
});
