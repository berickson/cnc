// CNC State Machine - Event-driven state management for UI and operations

export enum CncState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting', 
  IDLE = 'idle',
  JOG_REQUESTED = 'jog_requested',
  RUNNING = 'running', // Any machine movement: jog, home, presets, probing, jobs
  ALARM = 'alarm'
}

export enum EventType {
  // User events
  CONNECT_BUTTON_CLICKED = 'connect_button_clicked',
  DISCONNECT_BUTTON_CLICKED = 'disconnect_button_clicked',
  HOME_BUTTON_CLICKED = 'home_button_clicked',
  JOG_BUTTON_CLICKED = 'jog_button_clicked',
  CLEAR_ALARM_CLICKED = 'clear_alarm_clicked',
  
  // Running operation events
  OPERATION_STARTED = 'operation_started',
  OPERATION_COMPLETED = 'operation_completed',
  
  // Command response events
  COMMAND_SUCCESS = 'command_success',
  COMMAND_FAILED = 'command_failed',
  CONNECTION_SUCCESS = 'connection_success',
  CONNECTION_FAILED = 'connection_failed',
  
  // Status poll events
  STATUS_IDLE = 'status_idle',
  STATUS_JOG = 'status_jog', 
  STATUS_RUN = 'status_run',
  STATUS_HOME = 'status_home',
  STATUS_ALARM = 'status_alarm',
  
  // Special events
  HOMING_COMPLETE = 'homing_complete'
}

export interface CncEvent {
  type: EventType;
  data?: any;
}

export interface StateChangeListener {
  (oldState: CncState, newState: CncState, event: CncEvent): void;
}

export class CncStateMachine {
  private current_state: CncState = CncState.DISCONNECTED;
  private listeners: StateChangeListener[] = [];
  private homing_start_time: number | null = null;
  private instance_id: string;

  constructor() {
    this.instance_id = Math.random().toString(36).substring(7);
    // Use setTimeout to ensure log_message is available on window
    setTimeout(() => {
      const log_message = (window as any).log_message || console.log;
      log_message(`🏭 State machine initialized in DISCONNECTED state (ID: ${this.instance_id})`, 'info');
    }, 100);
  }

  get_current_state(): CncState {
    return this.current_state;
  }

  add_state_change_listener(listener: StateChangeListener): void {
    this.listeners.push(listener);
  }

  remove_state_change_listener(listener: StateChangeListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  private transition_to(new_state: CncState, event: CncEvent): void {
    const old_state = this.current_state;
    this.current_state = new_state;
    
    // Get log_message function
    const log_message = (window as any).log_message || console.log;
    
    // Special handling for movement state entry/exit
    if (new_state === CncState.RUNNING && old_state !== CncState.RUNNING) {
      // Entering RUNNING state
      if (event.type === EventType.HOME_BUTTON_CLICKED) {
        this.homing_start_time = Date.now();
        log_message('🏠 Entering RUNNING state: Homing operation started', 'info');
      } else if (event.type === EventType.JOG_BUTTON_CLICKED) {
        log_message('🎮 Entering RUNNING state: Jog operation started', 'info');
      } else if (event.type === EventType.STATUS_RUN) {
        log_message('🔄 Entering RUNNING state: Machine reporting Run status', 'info');
      } else if (event.type === EventType.STATUS_JOG) {
        log_message('🎮 Entering RUNNING state: Machine reporting Jog status', 'info'); 
      } else if (event.type === EventType.STATUS_HOME) {
        log_message('🏠 Entering RUNNING state: Machine reporting Home status', 'info');
      } else {
        log_message(`🔄 Entering RUNNING state: ${event.type}`, 'info');
      }
    } else if (old_state === CncState.RUNNING && new_state !== CncState.RUNNING) {
      // Exiting RUNNING state
      const was_homing = this.homing_start_time !== null;
      if (was_homing) {
        const elapsed = this.homing_start_time ? Date.now() - this.homing_start_time : 0;
        log_message(`🏠 Exiting RUNNING state: Homing completed in ${elapsed}ms`, 'success');
      } else {
        log_message('✅ Exiting RUNNING state: Operation completed', 'success');
      }
      this.homing_start_time = null;
    }
    
    console.log(`🔄 State transition: ${old_state} → ${new_state} (${event.type})`);
    
    // Notify all listeners
    for (const listener of this.listeners) {
      listener(old_state, new_state, event);
    }
  }

  handle_event(event: CncEvent): void {
    try {
      switch (this.current_state) {
        case CncState.DISCONNECTED:
          this.handle_disconnected_state(event);
          break;
          
        case CncState.CONNECTING:
          this.handle_connecting_state(event);
          break;
          
        case CncState.IDLE:
          this.handle_idle_state(event);
          break;
          
        case CncState.JOG_REQUESTED:
          this.handle_jog_requested_state(event);
          break;
          
        case CncState.RUNNING:
          this.handle_running_state(event);
          break;
          
        case CncState.ALARM:
          this.handle_alarm_state(event);
          break;
          
        default:
          console.warn(`Unhandled state: ${this.current_state}`);
      }
    } catch (error) {
      const log_message = (window as any).log_message || console.log;
      log_message(`❌ Error in handle_event: ${error}`, 'error');
    }
  }

  private handle_disconnected_state(event: CncEvent): void {
    switch (event.type) {
      case EventType.CONNECT_BUTTON_CLICKED:
        this.transition_to(CncState.CONNECTING, event);
        break;
      case EventType.STATUS_IDLE:
        // Edge case: if we're getting status updates while in disconnected state,
        // it means we auto-reconnected without notifying the state machine
        console.log('Auto-reconnect detected via status update - transitioning to IDLE');
        this.transition_to(CncState.IDLE, event);
        break;
      case EventType.STATUS_ALARM:
        // Same edge case for alarm state
        console.log('Auto-reconnect detected via alarm status - transitioning to ALARM');
        this.transition_to(CncState.ALARM, event);
        break;
      // All other events ignored in disconnected state
    }
  }

  private handle_connecting_state(event: CncEvent): void {
    switch (event.type) {
      case EventType.CONNECTION_SUCCESS:
        this.transition_to(CncState.IDLE, event);
        break;
      case EventType.CONNECTION_FAILED:
        this.transition_to(CncState.DISCONNECTED, event);
        break;
      case EventType.STATUS_ALARM:
        this.transition_to(CncState.ALARM, event);
        break;
    }
  }

  private handle_idle_state(event: CncEvent): void {
    const log_message = (window as any).log_message || console.log;
    
    switch (event.type) {
      case EventType.STATUS_IDLE:
        // Normal idle status - no action needed
        break;
      case EventType.STATUS_RUN:
        // Machine started running without us knowing - transition to RUNNING
        log_message('🔄 Machine started running (detected via status)', 'info');
        this.transition_to(CncState.RUNNING, event);
        break;
      case EventType.STATUS_JOG:
        // Machine started jogging without us knowing - transition to RUNNING  
        log_message('🎮 Machine started jogging (detected via status)', 'info');
        this.transition_to(CncState.RUNNING, event);
        break;
      case EventType.STATUS_HOME:
        // Machine started homing without us knowing - transition to RUNNING
        log_message('🏠 Machine started homing (detected via status)', 'info');
        this.transition_to(CncState.RUNNING, event);
        break;
      case EventType.DISCONNECT_BUTTON_CLICKED:
        this.transition_to(CncState.DISCONNECTED, event);
        break;
      case EventType.HOME_BUTTON_CLICKED:
        // Transition to running immediately when button is clicked
        this.transition_to(CncState.RUNNING, event);
        break;
      case EventType.JOG_BUTTON_CLICKED:
        // Transition to running immediately when jog is sent
        this.transition_to(CncState.RUNNING, event);
        break;
      case EventType.STATUS_ALARM:
        this.transition_to(CncState.ALARM, event);
        break;
    }
  }

  private handle_jog_requested_state(event: CncEvent): void {
    switch (event.type) {
      case EventType.COMMAND_SUCCESS:
        this.transition_to(CncState.RUNNING, event);
        break;
      case EventType.COMMAND_FAILED:
        this.transition_to(CncState.IDLE, event);
        break;
      case EventType.STATUS_ALARM:
        this.transition_to(CncState.ALARM, event);
        break;
    }
  }

  private handle_alarm_state(event: CncEvent): void {
    switch (event.type) {
      case EventType.CLEAR_ALARM_CLICKED:
        // Stay in alarm state until we get status confirmation
        break;
      case EventType.STATUS_IDLE:
        this.transition_to(CncState.IDLE, event);
        break;
      case EventType.DISCONNECT_BUTTON_CLICKED:
        this.transition_to(CncState.DISCONNECTED, event);
        break;
      // STATUS_ALARM is expected and doesn't change state
    }
  }

  private handle_running_state(event: CncEvent): void {
    const log_message = (window as any).log_message || console.log;
    
    switch (event.type) {
      case EventType.STATUS_HOME:
        // Stay in running state - this is expected during homing
        if (this.homing_start_time) {
          const elapsed = Date.now() - this.homing_start_time;
          log_message(`🏠 Machine actively homing... (${Math.round(elapsed/1000)}s)`, 'info');
        } else {
          log_message('🏠 Machine is actively homing...', 'info');
        }
        break;
      case EventType.STATUS_RUN:
        // Stay in running state - this is expected during G-code execution
        log_message('🔄 Machine is running G-code or executing command...', 'info');
        break;
      case EventType.STATUS_JOG:
        // Stay in running state - this is expected during jogging
        log_message('🎮 Machine is actively jogging...', 'info');
        break;
      case EventType.STATUS_IDLE:
        // If we get idle status while running, operation completed
        if (this.homing_start_time) {
          const elapsed = Date.now() - this.homing_start_time;
          log_message(`🏠 STATUS_IDLE received during homing: elapsed=${elapsed}ms`, 'info');
          
          // If we've been homing for at least 500ms and now get IDLE, homing is done
          // Reduced from 1000ms to be more responsive
          if (elapsed > 500) {
            log_message('✅ Homing completed (detected via status polling)', 'success');
            this.transition_to(CncState.IDLE, event);
          } else {
            log_message('🏠 Too early for homing completion, staying in running state', 'info');
          }
        } else {
          // For non-homing operations, idle means completed
          log_message('✅ Status shows idle, operation completed', 'success');
          this.transition_to(CncState.IDLE, event);
        }
        break;
      case EventType.COMMAND_SUCCESS:
        // Command completed successfully - but stay in running until status confirms idle
        if (this.homing_start_time) {
          log_message('📤 Homing command sent successfully, waiting for status confirmation...', 'info');
        } else {
          log_message('📤 Command sent successfully, waiting for status confirmation...', 'info');
        }
        // Don't transition here - let status polling confirm completion
        break;
      case EventType.COMMAND_FAILED:
        // Command failed
        if (this.homing_start_time) {
          log_message('❌ Homing command failed', 'error');
        } else {
          log_message('❌ Command failed', 'error');
        }
        this.transition_to(CncState.IDLE, event);
        break;
      case EventType.STATUS_ALARM:
        log_message('❌ Alarm during operation', 'error');
        this.transition_to(CncState.ALARM, event);
        break;
      case EventType.HOMING_COMPLETE:
        // Explicit homing completion signal (fallback)
        log_message('✅ Homing completed', 'success');
        this.transition_to(CncState.IDLE, event);
        break;
      case EventType.OPERATION_COMPLETED:
        log_message('✅ Operation completed, returning to idle', 'success');
        this.transition_to(CncState.IDLE, event);
        break;
      case EventType.DISCONNECT_BUTTON_CLICKED:
        log_message('🔌 Disconnecting during operation...', 'info');
        this.transition_to(CncState.DISCONNECTED, event);
        break;
      // Block other user actions while running
      case EventType.HOME_BUTTON_CLICKED:
        log_message('🚫 Home blocked: operation already running', 'error');
        break;
      case EventType.JOG_BUTTON_CLICKED:
        log_message('🚫 Jog blocked: operation already running', 'error');
        break;
      // Stay in running state for other events
    }
  }

  // Helper methods for UI state queries
  is_connected(): boolean {
    return this.current_state !== CncState.DISCONNECTED && this.current_state !== CncState.CONNECTING;
  }

  is_busy(): boolean {
    return [
      CncState.CONNECTING,
      CncState.JOG_REQUESTED,
      CncState.RUNNING
    ].includes(this.current_state);
  }

  can_jog(): boolean {
    return this.current_state === CncState.IDLE;
  }

  can_home(): boolean {
    // Allow homing when idle OR when in alarm state (especially for hard limits)
    return this.current_state === CncState.IDLE || this.current_state === CncState.ALARM;
  }

  can_clear_alarm(): boolean {
    return this.current_state === CncState.ALARM;
  }
}
