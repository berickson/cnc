// CNC State Machine - Event-driven state management for UI and operations

export enum CncState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting', 
  IDLE = 'idle',
  JOG_REQUESTED = 'jog_requested',
  JOGGING = 'jogging',
  HOMING = 'homing',
  ALARM = 'alarm'
}

export enum EventType {
  // User events
  CONNECT_BUTTON_CLICKED = 'connect_button_clicked',
  DISCONNECT_BUTTON_CLICKED = 'disconnect_button_clicked',
  HOME_BUTTON_CLICKED = 'home_button_clicked',
  JOG_BUTTON_CLICKED = 'jog_button_clicked',
  CLEAR_ALARM_CLICKED = 'clear_alarm_clicked',
  
  // Command response events
  COMMAND_SUCCESS = 'command_success',
  COMMAND_FAILED = 'command_failed',
  CONNECTION_SUCCESS = 'connection_success',
  CONNECTION_FAILED = 'connection_failed',
  
  // Status poll events
  STATUS_IDLE = 'status_idle',
  STATUS_JOG = 'status_jog', 
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
    
    // Special handling for homing state entry
    if (new_state === CncState.HOMING) {
      this.homing_start_time = Date.now();
    } else if (old_state === CncState.HOMING) {
      this.homing_start_time = null;
    }
    
    console.log(`🔄 State transition: ${old_state} → ${new_state} (${event.type})`);
    
    // Notify all listeners
    for (const listener of this.listeners) {
      listener(old_state, new_state, event);
    }
  }

  handle_event(event: CncEvent): void {
    // Import log_message to see debug output in Tauri log window
    const log_message = (window as any).log_message || console.log;
    log_message(`🔄 State machine (${this.instance_id}) handling event: ${event.type} in state: ${this.current_state}`, 'info');
    
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
          
        case CncState.JOGGING:
          this.handle_jogging_state(event);
          break;
          
        case CncState.HOMING:
          this.handle_homing_state(event);
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
        // Normal idle status - no action needed, but log for debugging
        log_message(`🔍 STATUS_IDLE event received in idle state (normal)`, 'info');
        break;
      case EventType.DISCONNECT_BUTTON_CLICKED:
        this.transition_to(CncState.DISCONNECTED, event);
        break;
      case EventType.HOME_BUTTON_CLICKED:
        // Transition to homing immediately when button is clicked
        this.transition_to(CncState.HOMING, event);
        break;
      case EventType.JOG_BUTTON_CLICKED:
        this.transition_to(CncState.JOG_REQUESTED, event);
        break;
      case EventType.STATUS_ALARM:
        this.transition_to(CncState.ALARM, event);
        break;
      // STATUS_IDLE is expected and doesn't change state
    }
  }

  private handle_jog_requested_state(event: CncEvent): void {
    switch (event.type) {
      case EventType.COMMAND_SUCCESS:
        this.transition_to(CncState.JOGGING, event);
        break;
      case EventType.COMMAND_FAILED:
        this.transition_to(CncState.IDLE, event);
        break;
      case EventType.STATUS_ALARM:
        this.transition_to(CncState.ALARM, event);
        break;
    }
  }

  private handle_jogging_state(event: CncEvent): void {
    switch (event.type) {
      case EventType.STATUS_IDLE:
        this.transition_to(CncState.IDLE, event);
        break;
      case EventType.STATUS_ALARM:
        this.transition_to(CncState.ALARM, event);
        break;
      // STATUS_JOG is expected and doesn't change state
    }
  }

  private handle_homing_state(event: CncEvent): void {
    const log_message = (window as any).log_message || console.log;
    
    switch (event.type) {
      case EventType.STATUS_HOME:
        // Stay in homing state - this is expected during homing
        log_message('🏠 Machine is actively homing...', 'info');
        break;
      case EventType.STATUS_IDLE:
        // After homing starts, if we get IDLE status, it means homing is complete
        const elapsed = this.homing_start_time ? Date.now() - this.homing_start_time : 0;
        log_message(`🏠 STATUS_IDLE received during homing: elapsed=${elapsed}ms`, 'info');
        
        // If we've been homing for at least 1 second and now get IDLE, homing is done
        if (elapsed > 1000) {
          log_message('✅ Homing completed (detected via status polling)', 'success');
          this.transition_to(CncState.IDLE, event);
        } else {
          log_message('🏠 Too early for homing completion, staying in homing state', 'info');
        }
        break;
      case EventType.COMMAND_SUCCESS:
        // Homing command completed successfully (fallback for when we do get response)
        log_message('✅ Homing command completed successfully', 'info');
        this.transition_to(CncState.IDLE, event);
        break;
      case EventType.COMMAND_FAILED:
        // Homing command failed
        log_message('❌ Homing command failed', 'error');
        this.transition_to(CncState.IDLE, event);
        break;
      case EventType.STATUS_ALARM:
        this.transition_to(CncState.ALARM, event);
        break;
      case EventType.HOMING_COMPLETE:
        // Explicit homing completion signal (fallback)
        this.transition_to(CncState.IDLE, event);
        break;
      // Stay in homing state for other events
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

  // Helper methods for UI state queries
  is_connected(): boolean {
    return this.current_state !== CncState.DISCONNECTED && this.current_state !== CncState.CONNECTING;
  }

  is_busy(): boolean {
    return [
      CncState.CONNECTING,
      CncState.JOG_REQUESTED,
      CncState.JOGGING, 
      CncState.HOMING
    ].includes(this.current_state);
  }

  can_jog(): boolean {
    return this.current_state === CncState.IDLE;
  }

  can_home(): boolean {
    return this.current_state === CncState.IDLE;
  }

  can_clear_alarm(): boolean {
    return this.current_state === CncState.ALARM;
  }
}
