/**
 * G-code Job Time Estimation and Progress Tracking
 * 
 * This module provides comprehensive time estimation for G-code files and
 * real-time progress tracking during job execution.
 */

export interface GcodeTimeEstimate {
  total_time_seconds: number;
  total_distance_mm: number;
  rapid_moves_time_seconds: number;
  cutting_moves_time_seconds: number;
  total_lines: number;
  line_count: number;
  rapid_moves_time: number;
  cutting_moves_time: number;
  total_distance: number;
  estimated_completion: Date;
}

export interface JobProgressInfo {
  current_line: number;
  total_lines: number;
  elapsed_time_seconds: number;
  estimated_remaining_seconds: number;
  percent_complete: number;
  current_operation: string;
  current_line_number: number;
  current_command: string;
}

export interface GcodeProgress {
  current_line: number;
  total_lines: number;
  elapsed_time_seconds: number;
  estimated_remaining_seconds: number;
  percent_complete: number;
  current_operation: string;
  current_line_number: number;
  current_command: string;
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
  private last_confirmed_line_index = 0; // Temporal progression constraint - never go backwards
  
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
      total_distance_mm: total_distance,
      rapid_moves_time_seconds: rapid_moves_time,
      cutting_moves_time_seconds: cutting_moves_time,
      total_lines: this.parsed_lines.length,
      line_count: this.parsed_lines.length,
      rapid_moves_time,
      cutting_moves_time,
      total_distance,
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
   * Calculate progress based on actual machine position (most accurate method)
   */
  calculate_progress_by_position(current_position: {x: number, y: number, z: number}, start_time: Date): GcodeProgress {
    if (this.parsed_lines.length === 0) {
      return {
        current_line: 0,
        total_lines: 0,
        elapsed_time_seconds: 0,
        estimated_remaining_seconds: 0,
        percent_complete: 0,
        current_operation: 'No G-code loaded',
        current_line_number: 0,
        current_command: ''
      };
    }

    const elapsed_time = (Date.now() - start_time.getTime()) / 1000;
    
    // Find which command the machine is currently executing based on position
    // Only search forward from last confirmed line (temporal progression constraint)
    let current_executing_line_index = this.last_confirmed_line_index;
    let current_operation = 'Starting...';
    let closest_distance = Infinity;
    
    // Search forward from last confirmed position
    for (let i = this.last_confirmed_line_index; i < this.parsed_lines.length; i++) {
      const line = this.parsed_lines[i];
      
      // Skip lines that don't involve movement
      if (line.distance === 0) {
        continue;
      }
      
      // Check if we're close to the path for this line
      if (i > 0) {
        const prev_line = this.parsed_lines[i - 1];
        const path_distance = this.calculate_distance_to_line_segment(
          current_position,
          { x: prev_line.x || 0, y: prev_line.y || 0, z: prev_line.z || 0 },
          { x: line.x || 0, y: line.y || 0, z: line.z || 0 }
        );
        
        // If we're very close to the path, we're executing this command
        if (path_distance < 0.5) { // Within 0.5mm of the path
          current_executing_line_index = i;
          this.last_confirmed_line_index = i;
          
          if (line.is_rapid_move) {
            current_operation = `Rapid move to X${line.x?.toFixed(2)} Y${line.y?.toFixed(2)}`;
          } else if (line.command.includes('G1')) {
            current_operation = `Cutting at ${line.feed_rate} mm/min`;
          } else {
            current_operation = `Executing: ${line.command}`;
          }
          break;
        }
      }
      
      // Also check distance to target as fallback
      const target_distance = this.calculate_distance(current_position, {
        x: line.x || 0,
        y: line.y || 0, 
        z: line.z || 0
      });
      
      if (target_distance < closest_distance) {
        closest_distance = target_distance;
        current_executing_line_index = i;
        
        if (line.is_rapid_move) {
          current_operation = `Rapid move to X${line.x?.toFixed(2)} Y${line.y?.toFixed(2)}`;
        } else if (line.command.includes('G1')) {
          current_operation = `Cutting at ${line.feed_rate} mm/min`;
        } else {
          current_operation = `Executing: ${line.command}`;
        }
      }
    }
    
    // IMPORTANT: Bounds check to prevent invalid indices
    current_executing_line_index = Math.max(0, Math.min(current_executing_line_index, this.parsed_lines.length - 1));
    
    // Update confirmed position with bounds check
    this.last_confirmed_line_index = Math.max(this.last_confirmed_line_index, current_executing_line_index);
    this.last_confirmed_line_index = Math.min(this.last_confirmed_line_index, this.parsed_lines.length - 1);
    
    // Calculate progress based on commands completed
    let completed_time = 0;
    let remaining_time = 0;
    
    for (let i = 0; i < this.parsed_lines.length; i++) {
      if (i < current_executing_line_index) {
        completed_time += this.parsed_lines[i].estimated_time_seconds;
      } else {
        remaining_time += this.parsed_lines[i].estimated_time_seconds;
      }
    }
    
    const total_estimated_time = completed_time + remaining_time;
    const percent_complete = total_estimated_time > 0 
      ? Math.min(100, Math.max(0, (completed_time / total_estimated_time) * 100))
      : 0;

    return {
      current_line: current_executing_line_index + 1, // Use 1-based indexing for display (1/13, 2/13, etc.)
      total_lines: this.parsed_lines.length,
      elapsed_time_seconds: elapsed_time,
      estimated_remaining_seconds: Math.max(0, remaining_time),
      percent_complete,
      current_operation,
      current_line_number: this.parsed_lines[current_executing_line_index]?.line_number || 0, // Original G-code line number
      current_command: this.parsed_lines[current_executing_line_index]?.original_text || ''
    };
  }  /**
   * Calculate distance from a point to a line segment
   */
  private calculate_distance_to_line_segment(
    point: {x: number, y: number, z: number},
    line_start: {x: number, y: number, z: number},
    line_end: {x: number, y: number, z: number}
  ): number {
    // Vector from line start to end
    const line_vec = {
      x: line_end.x - line_start.x,
      y: line_end.y - line_start.y,
      z: line_end.z - line_start.z
    };
    
    // Vector from line start to point
    const point_vec = {
      x: point.x - line_start.x,
      y: point.y - line_start.y,
      z: point.z - line_start.z
    };
    
    // Project point onto line (find parameter t)
    const line_length_sq = line_vec.x * line_vec.x + line_vec.y * line_vec.y + line_vec.z * line_vec.z;
    
    if (line_length_sq === 0) {
      // Line start and end are the same point
      return this.calculate_distance(point, line_start);
    }
    
    const t = Math.max(0, Math.min(1, 
      (point_vec.x * line_vec.x + point_vec.y * line_vec.y + point_vec.z * line_vec.z) / line_length_sq
    ));
    
    // Find closest point on line segment
    const closest_point = {
      x: line_start.x + t * line_vec.x,
      y: line_start.y + t * line_vec.y,
      z: line_start.z + t * line_vec.z
    };
    
    return this.calculate_distance(point, closest_point);
  }
  debug_progress_simulation(gcode_content: string): void {
    const estimate = this.estimate_gcode_time(gcode_content);
    
    console.log('=== Progress Simulation Debug ===');
    console.log(`Total estimated time: ${estimate.total_time_seconds.toFixed(2)}s`);
    console.log(`Total lines: ${this.parsed_lines.length}`);
    
    // Test different elapsed times
    const test_times = [0, 0.1, 1.0, 2.0, 5.0, 10.0, 15.0, 20.0];
    
    test_times.forEach(elapsed_seconds => {
      if (elapsed_seconds <= estimate.total_time_seconds + 5) {
        // Override elapsed time by adjusting start_time
        const test_start_time = new Date(Date.now() - elapsed_seconds * 1000);
        const progress = this.calculate_progress(0, test_start_time);
        
        console.log(`${elapsed_seconds.toFixed(1)}s: ${progress.percent_complete.toFixed(1)}% - Line ${progress.current_line} - ${progress.current_operation}`);
      }
    });
  }
  
  /**
   * Calculate progress based on current line number
   */
  calculate_progress(_current_line_number: number, start_time: Date): GcodeProgress {
    if (this.parsed_lines.length === 0) {
      return {
        current_line: 0,
        total_lines: 0,
        elapsed_time_seconds: 0,
        estimated_remaining_seconds: 0,
        percent_complete: 0,
        current_operation: 'No G-code loaded',
        current_line_number: 0,
        current_command: ''
      };
    }
    
    const elapsed_time = (Date.now() - start_time.getTime()) / 1000;
    
    // **NEW APPROACH**: Simulate execution line by line using time estimates
    let cumulative_time = 0;
    let current_executing_line_index = 0;
    let current_operation = 'Starting...';
    
    // Handle edge case: if no time has elapsed, show first command
    if (elapsed_time <= 0 && this.parsed_lines.length > 0) {
      const first_line = this.parsed_lines[0];
      current_operation = first_line.estimated_time_seconds === 0 
        ? `Setup: ${first_line.command}`
        : `Executing: ${first_line.command}`;
      current_executing_line_index = 0;
    } else {
      // Walk through each parsed line and find which one should be executing
      for (let i = 0; i < this.parsed_lines.length; i++) {
        const line = this.parsed_lines[i];
        const line_start_time = cumulative_time;
        const line_end_time = cumulative_time + line.estimated_time_seconds;
        
        // For zero-time commands, they execute "instantly" at their start time
        if (line.estimated_time_seconds === 0) {
          if (elapsed_time === line_start_time || (i === 0 && elapsed_time < 0.01)) {
            current_executing_line_index = i;
            current_operation = `Setup: ${line.command}`;
            break;
          }
        } else {
          // For timed commands, check if we're within the execution window
          if (elapsed_time >= line_start_time && elapsed_time < line_end_time) {
            current_executing_line_index = i;
            
            if (line.is_rapid_move) {
              current_operation = `Rapid move to X${line.x?.toFixed(2)} Y${line.y?.toFixed(2)}`;
            } else if (line.command.includes('G1')) {
              current_operation = `Cutting at ${line.feed_rate} mm/min`;
            } else {
              current_operation = `Executing: ${line.command}`;
            }
            break;
          }
        }
        
        cumulative_time = line_end_time;
        
        // If we haven't found the current command yet, this might be it (last processed)
        if (elapsed_time >= line_start_time) {
          current_executing_line_index = i;
        }
      }
    }
    
    // Final check: if we've exceeded all estimated times, we're at the end
    const total_time = this.parsed_lines.reduce((sum, line) => sum + line.estimated_time_seconds, 0);
    if (elapsed_time >= total_time && total_time > 0) {
      current_executing_line_index = this.parsed_lines.length - 1;
      current_operation = 'Job Complete';
    }
    
    // IMPORTANT: Bounds check to prevent invalid indices (same as position-based method)
    current_executing_line_index = Math.max(0, Math.min(current_executing_line_index, this.parsed_lines.length - 1));
    
    // Fallback: if we still don't have a valid operation, determine it from current line
    if (current_operation === 'Starting...' && current_executing_line_index < this.parsed_lines.length) {
      const line = this.parsed_lines[current_executing_line_index];
      if (line.estimated_time_seconds === 0) {
        current_operation = `Setup: ${line.command}`;
      } else if (line.is_rapid_move) {
        current_operation = `Rapid move to X${line.x?.toFixed(2)} Y${line.y?.toFixed(2)}`;
      } else if (line.command.includes('G1')) {
        current_operation = `Cutting at ${line.feed_rate} mm/min`;
      } else {
        current_operation = `Executing: ${line.command}`;
      }
    }
    
    // Calculate remaining time from current position
    let remaining_time = 0;
    for (let i = current_executing_line_index; i < this.parsed_lines.length; i++) {
      remaining_time += this.parsed_lines[i].estimated_time_seconds;
    }
    
    // Adjust remaining time if we're partway through current line
    if (current_executing_line_index < this.parsed_lines.length) {
      const current_line = this.parsed_lines[current_executing_line_index];
      const line_start_time = cumulative_time - current_line.estimated_time_seconds;
      const time_into_current_line = elapsed_time - line_start_time;
      
      if (time_into_current_line > 0 && current_line.estimated_time_seconds > 0) {
        const remaining_in_current_line = Math.max(0, current_line.estimated_time_seconds - time_into_current_line);
        remaining_time = remaining_in_current_line;
        
        // Add time for all subsequent lines
        for (let i = current_executing_line_index + 1; i < this.parsed_lines.length; i++) {
          remaining_time += this.parsed_lines[i].estimated_time_seconds;
        }
      }
    }
    
    const total_estimated_time = this.parsed_lines.reduce((sum, line) => sum + line.estimated_time_seconds, 0);
    const percent_complete = total_estimated_time > 0 
      ? Math.min(100, Math.max(0, (elapsed_time / total_estimated_time) * 100))
      : 0;
    
    return {
      current_line: current_executing_line_index + 1, // Use 1-based indexing for display (same as position-based method)
      total_lines: this.parsed_lines.length,
      elapsed_time_seconds: elapsed_time,
      estimated_remaining_seconds: Math.max(0, remaining_time),
      percent_complete,
      current_operation,
      current_line_number: this.parsed_lines[current_executing_line_index]?.line_number || 0,
      current_command: this.parsed_lines[current_executing_line_index]?.original_text || ''
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
  
  /**
   * Reset temporal progression tracking for a new job
   */
  reset_temporal_progression(): void {
    this.last_confirmed_line_index = 0;
  }

  private reset_state(): void {
    this.current_position = { x: 0, y: 0, z: 0 };
    this.current_feed_rate = this.machine_params.default_feed_rate;
    this.last_confirmed_line_index = 0; // Reset temporal progression tracking
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
  private is_running = false;
  private last_known_position: {x: number, y: number, z: number} | null = null;
  
  constructor(estimator: GcodeTimeEstimator) {
    this.estimator = estimator;
  }
  
  start_job(): void {
    this.job_start_time = new Date();
    this.is_running = true;
    this.estimator.reset_temporal_progression(); // Reset temporal progression for new job
  }
  
  update_buffer_status(_planner_blocks: number, _rx_bytes: number): void {
    // No longer needed - we use pure time-based simulation or position-based tracking
    // Buffer status was unreliable for progress tracking
  }
  
  update_position(position: {x: number, y: number, z: number}): void {
    this.last_known_position = position;
  }
  
  pause_job(): void {
    this.is_running = false;
  }
  
  resume_job(): void {
    this.is_running = true;
  }
  
  stop_job(): void {
    this.is_running = false;
  }
  
  get_current_progress(): GcodeProgress | null {
    if (!this.job_start_time) return null;
    
    // Use position-based tracking if we have position data, otherwise fall back to time-based
    if (this.last_known_position) {
      return this.estimator.calculate_progress_by_position(this.last_known_position, this.job_start_time);
    } else {
      // Fallback to time-based simulation
      return this.estimator.calculate_progress(0, this.job_start_time);
    }
  }
  
  is_job_running(): boolean {
    return this.is_running;
  }
}
