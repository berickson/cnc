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
let statusButton: HTMLButtonElement | null;
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
let jogButtons: { [key: string]: HTMLButtonElement | null } = {};
let stepSizeInput: HTMLInputElement | null;
let zeroButtons: { [key: string]: HTMLButtonElement | null } = {};

let isConnected = false;
let discoveredDevices: CncDevice[] = [];

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
  if (statusButton) statusButton.disabled = !connected;
  if (clearAlarmButton) clearAlarmButton.disabled = !connected;
  if (homeButton) homeButton.disabled = !connected;
  
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
    logMessage("Disconnected from CNC", 'success');
  } catch (error) {
    logMessage(`Disconnect error: ${error}`, 'error');
  }
}

async function updateMachineStatus() {
  if (!isConnected) return;
  
  try {
    const status = await CncManager.getStatus();
    const parsed = CncManager.parseStatus(status);
    
    if (parsed) {
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
  statusButton = document.getElementById("status_button") as HTMLButtonElement;
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
  stepSizeInput = document.getElementById("step_size_input") as HTMLInputElement;
  
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
  };
  
  // Event listeners
  if (connectButton) {
    connectButton.addEventListener("click", discoverAndConnect);
  }
  
  if (disconnectButton) {
    disconnectButton.addEventListener("click", disconnect);
  }
  
  if (statusButton) {
    statusButton.addEventListener("click", updateMachineStatus);
  }
  
  if (homeButton) {
    homeButton.addEventListener("click", homeAllAxes);
  }
  
  if (clearAlarmButton) {
    clearAlarmButton.addEventListener("click", clearAlarm);
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
  
  // Setup step size buttons
  setupStepSizeButtons();
  
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
  }, 2000); // Update every 2 seconds
  
  logMessage("CNC Panel initialized. Click 'Connect' to discover and connect to your Genmitsu CNC.");
});
