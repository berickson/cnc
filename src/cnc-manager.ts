import { invoke } from "@tauri-apps/api/core";

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
    return await invoke("connect_to_cnc", { device });
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
   * Parse Grbl status response
   */
  static parseStatus(statusResponse: string): {
    state: string;
    position: { x: number; y: number; z: number };
    workPosition: { x: number; y: number; z: number };
  } | null {
    // Parse Grbl status format: <Idle|MPos:0.000,0.000,0.000|WPos:0.000,0.000,0.000>
    const match = statusResponse.match(/<([^|]+)\|MPos:([^|]+)\|WPos:([^>]+)>/);
    if (!match) return null;

    const [, state, mpos, wpos] = match;
    const [mx, my, mz] = mpos.split(',').map(parseFloat);
    const [wx, wy, wz] = wpos.split(',').map(parseFloat);

    return {
      state,
      position: { x: mx, y: my, z: mz },
      workPosition: { x: wx, y: wy, z: wz }
    };
  }
}
