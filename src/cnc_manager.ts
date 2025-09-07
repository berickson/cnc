import { invoke } from "@tauri-apps/api/core";
import { GrblErrorTranslator } from './grbl_error_translator';

export interface CncDevice {
  name: string;
  ip: string;
  port: number;
  mac?: string;
  firmware?: string;
}

export interface CncConnection {
  device: CncDevice;
  connected: boolean;
}

export class CncManager {
  /**
   * Discover CNC devices on the network
   */
  static async discoverDevices(): Promise<CncDevice[]> {
    return await invoke<CncDevice[]>("discover_cnc_devices");
  }

  /**
   * Connect to a specific CNC device
   */
  static async connect(device: CncDevice): Promise<void> {
    await invoke("connect_to_cnc", { device });
    
    // Check for alarm status immediately after connecting
    try {
      const alarmStatus = await invoke<string>("check_cnc_alarm_status");
      console.log('Initial alarm status check:', alarmStatus);
    } catch (alarmError) {
      console.warn('Could not check alarm status on connect:', alarmError);
    }
  }

  /**
   * Check current alarm status - can be called when needed
   */
  static async checkAlarmStatus(): Promise<string> {
    return await invoke<string>("check_cnc_alarm_status");
  }

  /**
   * Disconnect from current CNC device
   */
  static async disconnect(): Promise<void> {
    return await invoke("disconnect_cnc");
  }

  /**
   * Send a raw command to the CNC
   */
  static async sendCommand(command: string): Promise<string> {
    return await invoke<string>("send_cnc_command", { command });
  }

  /**
   * Get the current machine status
   */
  static async getStatus(): Promise<string> {
    return await invoke<string>("get_cnc_status");
  }

  /**
   * Jog the machine in a specific direction
   */
  static async jog(axis: string, distance: number, feedRate: number = 1000): Promise<string> {
    return await invoke<string>("jog_cnc", { axis, distance, feedRate });
  }

  /**
   * Home the machine
   */
  static async home(): Promise<string> {
    return await invoke<string>("home_cnc");
  }

  /**
   * Reset/unlock the machine
   */
  static async reset(): Promise<string> {
    return await invoke<string>("reset_cnc");
  }

  /**
   * Get current connection status
   */
  static async getConnectionStatus(): Promise<CncConnection | null> {
    return await invoke<CncConnection | null>("get_connection_status");
  }

  /**
   * Set work coordinate zero for specified axes
   */
  static async setWorkZero(axes: string = "X0Y0Z0"): Promise<string> {
    return await this.sendCommand(`G10L20P1${axes}`);
  }

  /**
   * Move to work coordinates
   */
  static async moveToWorkPosition(x?: number, y?: number, z?: number, feedRate: number = 1000): Promise<string> {
    let gcode = "G0";
    if (x !== undefined) gcode += `X${x}`;
    if (y !== undefined) gcode += `Y${y}`;
    if (z !== undefined) gcode += `Z${z}`;
    if (feedRate !== 1000) gcode += `F${feedRate}`;
    return await this.sendCommand(gcode);
  }

  /**
   * Emergency stop
   */
  static async emergencyStop(): Promise<string> {
    return await this.sendCommand("!");
  }

  /**
   * Translate GRBL error responses to human-readable format
   */
  static translateResponse(response: string): string {
    return GrblErrorTranslator.translateError(response);
  }

  /**
   * Check if a response contains an error or alarm
   */
  static containsError(response: string): boolean {
    return GrblErrorTranslator.containsError(response);
  }

  /**
   * Get detailed error information from a response
   */
  static getErrorDetails(response: string): { type: 'error' | 'alarm', code: number }[] {
    return GrblErrorTranslator.extractErrorCodes(response);
  }

  /**
   * Parse Grbl status response
   */
  static parseStatus(statusResponse: string, lastKnownWCO?: { x: number; y: number; z: number }): {
    state: string;
    position: { x: number; y: number; z: number };
    workPosition: { x: number; y: number; z: number };
    workOffset?: { x: number; y: number; z: number };
  } | null {
    // Clean up the response - remove "ok" and trim whitespace
    const cleanResponse = statusResponse.replace(/\n?ok\s*$/m, '').trim();
    
    // Check for ALARM messages first (e.g., "ALARM:9")
    const alarmMatch = cleanResponse.match(/ALARM:(\d+)/);
    if (alarmMatch) {
      const alarmCode = parseInt(alarmMatch[1]);
      const translatedAlarm = GrblErrorTranslator.translateAlarm(alarmCode);
      
      return {
        state: translatedAlarm,
        position: { x: 0, y: 0, z: 0 },
        workPosition: { x: 0, y: 0, z: 0 }
      };
    }
    
    // Parse Grbl status format: <State|MPos:x,y,z|...>
    // May include: Bf:, FS:, Pn:, WCO:, WPos:, Ov:, etc.
    const statusMatch = cleanResponse.match(/<([^|>]+)(?:\|([^>]+))?>/);
    if (!statusMatch) return null;

    const [, state, statusFields] = statusMatch;
    
    // Handle generic "Alarm" state (common in older Grbl versions)
    if (state === 'Alarm' && statusFields) {
      // Look for pin states that indicate limit switches
      const pinMatch = statusFields.match(/Pn:([^|]+)/);
      if (pinMatch) {
        const pins = pinMatch[1];
        // If pins contain X, Y, or Z, it's likely a hard limit alarm
        if (pins.match(/[XYZ]/)) {
          const translatedAlarm = GrblErrorTranslator.translateAlarm(9); // Hard limit
          return {
            state: translatedAlarm,
            position: { x: 0, y: 0, z: 0 },
            workPosition: { x: 0, y: 0, z: 0 }
          };
        }
      }
      
      // Default alarm without specific code
      return {
        state: 'Alarm: Unknown - Check limits, position, and GRBL status',
        position: { x: 0, y: 0, z: 0 },
        workPosition: { x: 0, y: 0, z: 0 }
      };
    }
    
    // Parse MPos (machine position) - always present
    let mpos: number[] = [];
    let wco: number[] | null = null; // Work coordinate offset from this status
    let wpos: number[] = []; // Work position, if explicitly provided
    
    if (statusFields) {
      const fields = statusFields.split('|');
      
      for (const field of fields) {
        if (field.startsWith('MPos:')) {
          mpos = field.substring(5).split(',').map(parseFloat);
        } else if (field.startsWith('WPos:')) {
          wpos = field.substring(5).split(',').map(parseFloat);
        } else if (field.startsWith('WCO:')) {
          wco = field.substring(4).split(',').map(parseFloat);
        }
      }
    }
    
    if (mpos.length < 3) return null; // MPos is required
    
    // Determine which WCO to use: current status or last known
    let effectiveWCO = { x: 0, y: 0, z: 0 };
    if (wco && wco.length >= 3) {
      // Use WCO from current status
      effectiveWCO = { x: wco[0], y: wco[1], z: wco[2] };
    } else if (lastKnownWCO) {
      // Use last known WCO
      effectiveWCO = lastKnownWCO;
    }
    
    // Calculate work position: WPos = MPos - WCO
    // If WPos is explicitly provided, use it; otherwise calculate it
    const workPosition = wpos.length >= 3 ? wpos : [
      mpos[0] - effectiveWCO.x,
      mpos[1] - effectiveWCO.y,
      mpos[2] - effectiveWCO.z
    ];

    const result = {
      state,
      position: { x: mpos[0], y: mpos[1], z: mpos[2] },
      workPosition: { x: workPosition[0], y: workPosition[1], z: workPosition[2] }
    };

    // Include work offset if it was provided in this status
    if (wco && wco.length >= 3) {
      (result as any).workOffset = { x: wco[0], y: wco[1], z: wco[2] };
    }

    return result;
  }
}
