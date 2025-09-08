/**
 * G-code Job Time Estimation and Progress Tracking
 * 
 * This module provides comprehensive time estimation for G-code files and
 * real-time progress tracking during job execution.
 */

export interface GcodeTimeEstimate {
  total_time_seconds: number;
  total_distance: number;
  line_count: number;
  rapid_moves_time: number;
  cutting_moves_time: number;
  estimated_completion?: Date;
}

export interface GcodeProgress {
  current_line: number;
  total_lines: number;
  elapsed_time_seconds: number;
  estimated_remaining_seconds: number;
  percent_complete: number;
  current_operation: string;
}

export interface GcodeLine {
  line_number: number;
  original_text: string;
  command: string;
  x?: number;
  y?: number;
  z?: number;
  feed_rate?: number;
  estimated_time_seconds: number;
  distance: number;
  is_rapid_move: boolean;
}

/**
 * G-code time estimation parameters
 */
interface MachineParameters {
  // Default feed rates (mm/min)
  default_feed_rate: number;
  rapid_feed_rate: number;
  
  // Acceleration parameters (mm/s²)
  acceleration_x: number;
  acceleration_y: number;
  acceleration_z: number;
  
  // Junction deviation for cornering (mm)
  junction_deviation: number;
  
  // Minimum feed rate (mm/min)
  minimum_feed_rate: number;
}

/**
 * Default machine parameters for time estimation
 * These can be configured based on your specific CNC machine
 */
const DEFAULT_MACHINE_PARAMS: MachineParameters = {
  default_feed_rate: 1000,  // mm/min
  rapid_feed_rate: 5000,    // mm/min for G0 moves
  acceleration_x: 500,      // mm/s²
  acceleration_y: 500,      // mm/s²
  acceleration_z: 250,      // mm/s² (typically slower for Z)
  junction_deviation: 0.02, // mm
  minimum_feed_rate: 10     // mm/min
};

export class GcodeTimeEstimator {
  private machine_params: MachineParameters;
  private parsed_lines: GcodeLine[] = [];
  private current_position = { x: 0, y: 0, z: 0 };
  private current_feed_rate = 0;
  
  constructor(machine_params?: Partial<MachineParameters>) {
    this.machine_params = { ...DEFAULT_MACHINE_PARAMS, ...machine_params };
    this.current_feed_rate = this.machine_params.default_feed_rate;
  }
  
  /**
   * Parse and estimate time for a complete G-code file
   */
  estimate_gcode_time(gcode_content: string): GcodeTimeEstimate {
    this.reset_state();
    this.parsed_lines = [];
    
    const lines = gcode_content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let total_time = 0;
    let total_distance = 0;
    let rapid_moves_time = 0;
    let cutting_moves_time = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip comments and empty lines
      if (line.startsWith(';') || line.startsWith('(') || line.length === 0) {
        continue;
      }
      
      const parsed_line = this.parse_gcode_line(line, i + 1);
      if (parsed_line) {
        this.parsed_lines.push(parsed_line);
        total_time += parsed_line.estimated_time_seconds;
        total_distance += parsed_line.distance;
        
        if (parsed_line.is_rapid_move) {
          rapid_moves_time += parsed_line.estimated_time_seconds;
        } else {
          cutting_moves_time += parsed_line.estimated_time_seconds;
        }
      }
    }
    
    return {
      total_time_seconds: total_time,
      total_distance,
      line_count: this.parsed_lines.length,
      rapid_moves_time,
      cutting_moves_time,
      estimated_completion: new Date(Date.now() + total_time * 1000)
    };
  }
  
  /**
   * Get parsed G-code lines for progress tracking
   */
  get_parsed_lines(): GcodeLine[] {
    return [...this.parsed_lines];
  }
  
  /**
   * Calculate progress based on current line number
   */
  calculate_progress(current_line_number: number, start_time: Date): GcodeProgress {
    if (this.parsed_lines.length === 0) {
      return {
        current_line: 0,
        total_lines: 0,
        elapsed_time_seconds: 0,
        estimated_remaining_seconds: 0,
        percent_complete: 0,
        current_operation: 'No G-code loaded'
      };
    }
    
    const elapsed_time = (Date.now() - start_time.getTime()) / 1000;
    
    // Find the index of current line in our parsed lines
    const current_index = this.parsed_lines.findIndex(line => line.line_number >= current_line_number);
    const effective_index = current_index >= 0 ? current_index : this.parsed_lines.length - 1;
    
    // Calculate completed time and remaining time
    let completed_time = 0;
    let remaining_time = 0;
    
    for (let i = 0; i < this.parsed_lines.length; i++) {
      if (i < effective_index) {
        completed_time += this.parsed_lines[i].estimated_time_seconds;
      } else {
        remaining_time += this.parsed_lines[i].estimated_time_seconds;
      }
    }
    
    const total_estimated_time = completed_time + remaining_time;
    const percent_complete = total_estimated_time > 0 ? (completed_time / total_estimated_time) * 100 : 0;
    
    // Adjust remaining time based on actual elapsed time vs estimated time
    const time_ratio = elapsed_time > 0 && completed_time > 0 ? elapsed_time / completed_time : 1;
    const adjusted_remaining_time = remaining_time * time_ratio;
    
    // Determine current operation
    let current_operation = 'Idle';
    if (effective_index < this.parsed_lines.length) {
      const current_parsed_line = this.parsed_lines[effective_index];
      if (current_parsed_line.is_rapid_move) {
        current_operation = `Rapid move to X${current_parsed_line.x?.toFixed(2)} Y${current_parsed_line.y?.toFixed(2)}`;
      } else if (current_parsed_line.command.includes('G1')) {
        current_operation = `Cutting at ${current_parsed_line.feed_rate} mm/min`;
      } else {
        current_operation = `Executing: ${current_parsed_line.command}`;
      }
    }
    
    return {
      current_line: current_line_number,
      total_lines: this.parsed_lines.length,
      elapsed_time_seconds: elapsed_time,
      estimated_remaining_seconds: Math.max(0, adjusted_remaining_time),
      percent_complete: Math.min(100, Math.max(0, percent_complete)),
      current_operation
    };
  }
  
  /**
   * Format time duration as human-readable string
   */
  static format_time_duration(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remaining_seconds = Math.round(seconds % 60);
      return `${minutes}m ${remaining_seconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remaining_seconds = Math.round(seconds % 60);
      return `${hours}h ${minutes}m ${remaining_seconds}s`;
    }
  }
  
  /**
   * Get time estimation summary as formatted text
   */
  get_time_summary(estimate: GcodeTimeEstimate): string {
    const total_time_str = GcodeTimeEstimator.format_time_duration(estimate.total_time_seconds);
    const rapid_time_str = GcodeTimeEstimator.format_time_duration(estimate.rapid_moves_time);
    const cutting_time_str = GcodeTimeEstimator.format_time_duration(estimate.cutting_moves_time);
    
    return `Total: ${total_time_str} (${estimate.line_count} lines, ${estimate.total_distance.toFixed(1)}mm)\n` +
           `Rapid: ${rapid_time_str}, Cutting: ${cutting_time_str}\n` +
           `Est. completion: ${estimate.estimated_completion?.toLocaleTimeString()}`;
  }
  
  private reset_state(): void {
    this.current_position = { x: 0, y: 0, z: 0 };
    this.current_feed_rate = this.machine_params.default_feed_rate;
  }
  
  private parse_gcode_line(line: string, line_number: number): GcodeLine | null {
    // Remove comments
    const clean_line = line.split(';')[0].split('(')[0].trim().toUpperCase();
    if (clean_line.length === 0) return null;
    
    // Parse G-code command
    const g_match = clean_line.match(/G(\d+)/);
    const m_match = clean_line.match(/M(\d+)/);
    
    let command = '';
    if (g_match) command = `G${g_match[1]}`;
    if (m_match) command += (command ? ' ' : '') + `M${m_match[1]}`;
    if (!command) command = clean_line.split(' ')[0];
    
    // Parse coordinates
    const x = this.extract_coordinate(clean_line, 'X') ?? this.current_position.x;
    const y = this.extract_coordinate(clean_line, 'Y') ?? this.current_position.y;
    const z = this.extract_coordinate(clean_line, 'Z') ?? this.current_position.z;
    
    // Parse feed rate
    const f_match = clean_line.match(/F([\d.]+)/);
    if (f_match) {
      this.current_feed_rate = parseFloat(f_match[1]);
    }
    
    // Calculate distance moved
    const distance = this.calculate_distance(this.current_position, { x, y, z });
    
    // Determine if this is a rapid move
    const is_rapid_move = command.startsWith('G0') || command === 'G00';
    
    // Calculate time for this move
    const estimated_time = this.calculate_move_time(distance, is_rapid_move);
    
    // Update current position
    this.current_position = { x, y, z };
    
    return {
      line_number,
      original_text: line,
      command,
      x,
      y,
      z,
      feed_rate: this.current_feed_rate,
      estimated_time_seconds: estimated_time,
      distance,
      is_rapid_move
    };
  }
  
  private extract_coordinate(line: string, axis: string): number | null {
    const match = line.match(new RegExp(`${axis}([+-]?[\\d.]+)`));
    return match ? parseFloat(match[1]) : null;
  }
  
  private calculate_distance(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  private calculate_move_time(distance: number, is_rapid_move: boolean): number {
    if (distance === 0) return 0;
    
    const feed_rate = is_rapid_move ? this.machine_params.rapid_feed_rate : this.current_feed_rate;
    const feed_rate_mm_per_second = feed_rate / 60;
    
    // Basic time calculation: time = distance / speed
    let time = distance / feed_rate_mm_per_second;
    
    // Add acceleration time penalty for short moves
    if (distance < 10) { // Short moves under 10mm
      const acceleration = Math.min(
        this.machine_params.acceleration_x,
        this.machine_params.acceleration_y,
        this.machine_params.acceleration_z
      );
      
      // Time to accelerate to feed rate
      const acceleration_time = feed_rate_mm_per_second / acceleration;
      const acceleration_distance = 0.5 * acceleration * acceleration_time * acceleration_time;
      
      // If the move is shorter than acceleration distance, adjust time
      if (distance < 2 * acceleration_distance) {
        // The move doesn't reach full speed
        const actual_speed = Math.sqrt(distance * acceleration);
        time = 2 * actual_speed / acceleration;
      } else {
        // Add acceleration and deceleration time
        time += 2 * acceleration_time;
      }
    }
    
    // Add small buffer for rapid moves (they may not be perfectly instant)
    if (is_rapid_move) {
      time += 0.05; // 50ms buffer for rapid positioning
    }
    
    return time;
  }
}

/**
 * Job progress tracker for real-time monitoring
 */
export class GcodeJobProgressTracker {
  private estimator: GcodeTimeEstimator;
  private job_start_time?: Date;
  private current_line_number = 0;
  private is_running = false;
  
  constructor(estimator: GcodeTimeEstimator) {
    this.estimator = estimator;
  }
  
  start_job(): void {
    this.job_start_time = new Date();
    this.current_line_number = 0;
    this.is_running = true;
  }
  
  update_current_line(line_number: number): void {
    this.current_line_number = line_number;
  }
  
  pause_job(): void {
    this.is_running = false;
  }
  
  resume_job(): void {
    this.is_running = true;
  }
  
  stop_job(): void {
    this.is_running = false;
    this.current_line_number = 0;
  }
  
  get_current_progress(): GcodeProgress | null {
    if (!this.job_start_time) return null;
    
    return this.estimator.calculate_progress(this.current_line_number, this.job_start_time);
  }
  
  is_job_running(): boolean {
    return this.is_running;
  }
}
