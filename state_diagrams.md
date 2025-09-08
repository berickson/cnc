# CNC State Machine Diagrams

## High-Level State Machine Overview

```mermaid
stateDiagram-v2
    [*] --> DISCONNECTED
    DISCONNECTED --> CONNECTING : CONNECT_BUTTON_CLICKED
    CONNECTING --> IDLE : CONNECTION_SUCCESS
    CONNECTING --> DISCONNECTED : CONNECTION_FAILED
    
    IDLE --> RUNNING : HOME_BUTTON_CLICKED / JOG_BUTTON_CLICKED
    IDLE --> ALARM : STATUS_ALARM
    IDLE --> HOLD : STATUS_HOLD
    IDLE --> DISCONNECTED : DISCONNECT_BUTTON_CLICKED
    
    RUNNING --> IDLE : STATUS_IDLE (operation complete)
    RUNNING --> ALARM : STATUS_ALARM
    RUNNING --> HOLD : STATUS_HOLD (emergency stop)
    RUNNING --> DISCONNECTED : DISCONNECT_BUTTON_CLICKED
    
    HOLD --> IDLE : STATUS_IDLE (cancel/reset)
    HOLD --> RUNNING : STATUS_RUN (resume)
    HOLD --> DISCONNECTED : DISCONNECT_BUTTON_CLICKED
    
    ALARM --> IDLE : STATUS_IDLE (alarm cleared)
    ALARM --> DISCONNECTED : DISCONNECT_BUTTON_CLICKED
    
    note right of DISCONNECTED
        Device discovery and connection
        No CNC operations available
    end note
    
    note right of RUNNING
        Any machine movement:
        - Homing ($H)
        - Jogging (G91 G0)
        - G-code execution
        - Position presets
    end note
    
    note right of HOLD
        Emergency stop / feed hold
        GRBL Hold:0 or Hold:1 state
        Can resume or cancel
    end note
```

## Event-Driven Homing Operation Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as UI Thread
    participant StateMachine as State Machine
    participant StatusPoll as Status Polling (100ms)
    participant Backend as CNC Manager
    participant CNC as GRBL/CNC

    Note over StatusPoll: Continuous 100ms polling
    StatusPoll->>+Backend: get_status()
    Backend->>+CNC: "?"
    CNC-->>-Backend: "<Idle|MPos:...>"
    Backend-->>-StatusPoll: Parse response
    StatusPoll->>StateMachine: STATUS_IDLE event
    StateMachine->>UI: Update display to "Idle"

    User->>+UI: Click "Home" button
    UI->>StateMachine: HOME_BUTTON_CLICKED event
    StateMachine->>StateMachine: IDLE → RUNNING transition
    StateMachine->>UI: Update display to "Homing..."
    UI-->>-User: Immediate visual feedback

    Note over StateMachine: No setTimeout, no flags - clean transition
    
    StateMachine->>+Backend: home() command
    Backend->>+CNC: "$H"
    CNC-->>-Backend: "ok" (command accepted)
    Backend-->>-StateMachine: COMMAND_SUCCESS event
    
    Note over StateMachine: Stay in RUNNING state until status confirms completion
    
    loop Homing in progress
        StatusPoll->>+Backend: get_status()
        Backend->>+CNC: "?"
        CNC-->>-Backend: "<Home|MPos:...>"
        Backend-->>-StatusPoll: Parse response
        StatusPoll->>StateMachine: STATUS_HOME event
        StateMachine->>StateMachine: Stay in RUNNING state
        Note over StateMachine: Continue showing "Homing..."
    end
    
    Note over CNC: Homing complete - machine returns to origin
    
    StatusPoll->>+Backend: get_status()
    Backend->>+CNC: "?"
    CNC-->>-Backend: "<Idle|MPos:0,0,0>"
    Backend-->>-StatusPoll: Parse response
    StatusPoll->>StateMachine: STATUS_IDLE event
    StateMachine->>StateMachine: RUNNING → IDLE transition
    StateMachine->>UI: Update display to "Idle"
    StateMachine->>UI: Log "Homing completed in Xms"

    Note over User,CNC: Benefits of New Approach:
    Note over User,CNC: 1. No race conditions - immediate state transition
    Note over User,CNC: 2. Event-driven - no flag coordination needed
    Note over User,CNC: 3. Status polling can't override display
    Note over User,CNC: 4. Timing validation prevents premature completion
```

## Detailed State Handlers

### IDLE State Handler
```mermaid
stateDiagram-v2
    [*] --> idle_handler
    
    state idle_handler {
        [*] --> check_event
        check_event --> home_clicked : HOME_BUTTON_CLICKED
        check_event --> jog_clicked : JOG_BUTTON_CLICKED  
        check_event --> status_alarm : STATUS_ALARM
        check_event --> status_hold : STATUS_HOLD
        check_event --> disconnect : DISCONNECT_BUTTON_CLICKED
        check_event --> status_run : STATUS_RUN
        check_event --> status_jog : STATUS_JOG
        check_event --> status_home : STATUS_HOME
        check_event --> stay_idle : STATUS_IDLE
        
        home_clicked --> [*] : transition_to(RUNNING)
        jog_clicked --> [*] : transition_to(RUNNING)
        status_alarm --> [*] : transition_to(ALARM)
        status_hold --> [*] : transition_to(HOLD)
        disconnect --> [*] : transition_to(DISCONNECTED)
        status_run --> [*] : transition_to(RUNNING)
        status_jog --> [*] : transition_to(RUNNING)
        status_home --> [*] : transition_to(RUNNING)
        stay_idle --> check_event : no action
    }
    
    note right of status_run
        Machine started running
        without UI command
        (external G-code, etc.)
    end note
```

### RUNNING State Handler
```mermaid
stateDiagram-v2
    [*] --> running_handler
    
    state running_handler {
        [*] --> check_event
        check_event --> status_idle : STATUS_IDLE
        check_event --> status_alarm : STATUS_ALARM
        check_event --> status_hold : STATUS_HOLD
        check_event --> command_success : COMMAND_SUCCESS
        check_event --> command_failed : COMMAND_FAILED
        check_event --> stay_running : STATUS_HOME/RUN/JOG
        
        status_idle --> validate_timing : Check homing_start_time
        validate_timing --> complete : elapsed > 500ms
        validate_timing --> stay_running : too early
        
        status_alarm --> [*] : transition_to(ALARM)
        status_hold --> [*] : transition_to(HOLD)
        command_success --> stay_running : Wait for status confirmation
        command_failed --> [*] : transition_to(IDLE)
        complete --> [*] : transition_to(IDLE)
        stay_running --> check_event : Continue operation
    }
    
    note right of validate_timing
        Prevents premature completion
        detection during homing startup
    end note
```

### HOLD State Handler (Emergency Stop)
```mermaid
stateDiagram-v2
    [*] --> hold_handler
    
    state hold_handler {
        [*] --> check_event
        check_event --> status_hold : STATUS_HOLD
        check_event --> status_idle : STATUS_IDLE
        check_event --> status_run : STATUS_RUN
        check_event --> disconnect : DISCONNECT_BUTTON_CLICKED
        check_event --> block_home : HOME_BUTTON_CLICKED
        check_event --> block_jog : JOG_BUTTON_CLICKED
        
        status_hold --> stay_hold : Log "Machine paused"
        status_idle --> [*] : transition_to(IDLE)
        status_run --> [*] : transition_to(RUNNING)
        disconnect --> [*] : transition_to(DISCONNECTED)
        block_home --> stay_hold : Log "Home blocked"
        block_jog --> stay_hold : Log "Jog blocked"
        stay_hold --> check_event : Continue in hold
    }
    
    note right of status_idle
        Cancel operation
        Machine reset to idle
    end note
    
    note right of status_run
        Resume operation
        Cycle start command
    end note
```

## Emergency Stop Sequence

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant StateMachine
    participant Backend
    participant CNC

    Note over CNC: Machine running homing operation
    
    User->>UI: Click STOP button
    UI->>Backend: emergency_stop() 
    Backend->>CNC: "!" (feed hold)
    CNC-->>Backend: Hold:0 or Hold:1
    
    Note over Backend: Next status poll
    Backend->>CNC: "?"
    CNC-->>Backend: "<Hold:0|MPos:...>"
    Backend->>StateMachine: STATUS_HOLD event
    StateMachine->>StateMachine: RUNNING → HOLD transition
    StateMachine->>UI: Show cancel/resume panel
    
    alt User chooses Resume
        User->>UI: Click Resume
        UI->>Backend: resume()
        Backend->>CNC: "~" (cycle start)
        CNC-->>Backend: "ok"
        Note over Backend: Next status poll
        Backend->>CNC: "?"
        CNC-->>Backend: "<Home|MPos:...>"
        Backend->>StateMachine: STATUS_HOME event
        StateMachine->>StateMachine: HOLD → RUNNING transition
    else User chooses Cancel
        User->>UI: Click Cancel
        UI->>Backend: soft_reset()
        Backend->>CNC: "\x18" (soft reset)
        CNC-->>Backend: "ok"
        Note over Backend: Next status poll
        Backend->>CNC: "?"
        CNC-->>Backend: "<Idle|MPos:...>"
        Backend->>StateMachine: STATUS_IDLE event
        StateMachine->>StateMachine: HOLD → IDLE transition
    end
```

## Connection State Machine

```mermaid
stateDiagram-v2
    [*] --> DISCONNECTED
    
    state DISCONNECTED {
        [*] --> ready
        ready --> discovering : CONNECT_BUTTON_CLICKED
        discovering --> device_found : CNC devices discovered
        discovering --> no_devices : Discovery timeout
        device_found --> [*] : Select device & connect
        no_devices --> ready : Show "No devices found"
    }
    
    DISCONNECTED --> CONNECTING : Device selected
    
    state CONNECTING {
        [*] --> tcp_connecting
        tcp_connecting --> grbl_validation : TCP established
        tcp_connecting --> failed : TCP failed
        grbl_validation --> success : Valid GRBL response
        grbl_validation --> failed : Invalid response
        success --> [*] : CONNECTION_SUCCESS
        failed --> [*] : CONNECTION_FAILED
    }
    
    CONNECTING --> IDLE : CONNECTION_SUCCESS
    CONNECTING --> DISCONNECTED : CONNECTION_FAILED
    
    note right of grbl_validation
        Sends "?" command
        Validates GRBL response format
        Checks for Idle/Alarm/Run states
    end note
```

## Key Improvements Over Old Implementation

### 1. **Eliminated Race Conditions**
- **Old**: Complex flag coordination with timing windows
- **New**: Immediate state transitions on user events

### 2. **Event-Driven Architecture**
- **Old**: Mixed polling and flag-based logic
- **New**: Pure event-driven state machine

### 3. **Cleaner Code Structure**
- **Old**: Scattered state logic with multiple files
- **New**: Centralized state machine with clear handlers

### 4. **Better Error Handling**
- **Old**: Basic error states
- **New**: Comprehensive alarm and hold state management

### 5. **Emergency Stop Support**
- **Old**: Not implemented
- **New**: Full GRBL Hold:0/Hold:1 support with resume/cancel

### 6. **Timing Validation**
- **Old**: Race conditions with rapid state changes
- **New**: Timing validation prevents premature transitions

## State Machine Benefits

1. **Predictable**: All state transitions are explicit and traceable
2. **Debuggable**: Clear event flow with comprehensive logging
3. **Maintainable**: New features add events, not complex flag logic
4. **Robust**: Handles edge cases and error conditions gracefully
5. **Extensible**: Easy to add new states (e.g., PROBING, RUNNING_JOB)
