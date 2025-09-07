# CNC Homing State Diagrams

## Sequence Diagram - Homing Operation Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as UI Thread
    participant StatusPoll as Status Polling (100ms)
    participant Backend as Tauri Backend
    participant CNC as GRBL/CNC

    Note over StatusPoll: Runs every 100ms continuously
    StatusPoll->>+Backend: get_status()
    Backend->>+CNC: "?"
    CNC-->>-Backend: "<Idle|MPos:...>"
    Backend-->>-StatusPoll: Parse response
    StatusPoll->>UI: Update display to "Idle"

    User->>+UI: Click "Home" button
    UI->>UI: is_homing = true
    UI->>UI: machine_state.textContent = "Homing..."
    UI->>UI: Log "Homing all axes..."
    UI-->>-User: Immediate visual feedback

    Note over UI: setTimeout(0) - defer to next tick
    UI->>UI: home_command_sent = true
    UI->>+Backend: CncManager.home()
    Backend->>+CNC: "$H"
    
    Note over StatusPoll,CNC: RACE CONDITION ZONE
    
    loop Status polling continues during homing
        StatusPoll->>+Backend: get_status()
        alt If CNC is still homing
            Backend->>+CNC: "?"
            CNC-->>-Backend: "<Home|MPos:...>" or no response
            Backend-->>-StatusPoll: Homing state or timeout
            StatusPoll->>StatusPoll: is_homing=true & !home_command_sent?
            Note over StatusPoll: Keep "Homing..." display
        else If homing just completed
            Backend->>+CNC: "?"
            CNC-->>-Backend: "<Idle|MPos:0,0,0>"
            Backend-->>-StatusPoll: Idle state
            StatusPoll->>StatusPoll: is_homing=true & home_command_sent=true & state="Idle"?
            StatusPoll->>StatusPoll: is_homing = false, home_command_sent = false
            StatusPoll->>UI: machine_state.textContent = "Idle"
            StatusPoll->>UI: Log "Homing completed"
        end
    end

    CNC-->>-Backend: Homing complete
    Backend-->>-UI: Home command response "ok"
    UI->>UI: Log "Home command: ok"

    Note over User,CNC: Potential Issues:
    Note over User,CNC: 1. Status poll might override "Homing..." before command sent
    Note over User,CNC: 2. Multiple rapid clicks could create race conditions
    Note over User,CNC: 3. Jog commands during homing might interfere
```

## High-Level State Diagram - Main Application States

```mermaid
stateDiagram-v2
    [*] --> disconnected
    disconnected --> connected : Successful connection process
    connected --> disconnected : Disconnect or connection lost
    
    note right of disconnected
        Discovery and connection logic
        See detailed diagram below
    end note
    
    note right of connected
        All CNC operations
        See detailed diagram below
    end note
```

## Disconnected State - Connection Process

```mermaid
stateDiagram-v2
    [*] --> ready
    ready --> discovering : Connect button clicked
    discovering --> device_found : CNC device discovered via multicast
    discovering --> no_devices : No devices found
    device_found --> tcp_connecting : CncManager.connect(device)
    tcp_connecting --> grbl_validation : TCP connection established
    grbl_validation --> alarm_check : GRBL response valid
    alarm_check --> connected : Connection complete
    tcp_connecting --> connection_failed : TCP connection failed
    grbl_validation --> connection_failed : Invalid GRBL response
    no_devices --> ready : Return to ready state
    connection_failed --> ready : Return to ready state
    
    note right of grbl_validation
        Sends "?" command and checks
        for Idle/Alarm/Run/MPos/VER
        response to confirm GRBL
    end note
    
    note right of alarm_check
        Calls check_alarm_status()
        to get initial machine state
    end note
```

## Connected State - CNC Operations

```mermaid
stateDiagram-v2
    [*] --> idle
    
    idle --> jog_requested : Jog button clicked
    jog_requested --> jogging : Jog command sent (ok response)
    jogging --> idle : status === 'Idle'
    jog_requested --> idle : Jog command failed
    
    idle --> homing : Home button clicked
    homing --> idle : Homing complete
    
    idle --> alarm : status.includes('Alarm')
    alarm --> idle : status === 'Idle'
    
    note right of jogging
        GRBL states: 'Idle' → 'Jog' → 'Idle'
        Completion: status === 'Idle'
        Detection via ? command (100ms poll)
    end note
    
    note right of homing
        Complex async logic with race conditions
        See detailed homing diagram below
    end note
```

## Homing State - Detailed Race Condition Handling

```mermaid
stateDiagram-v2
    [*] --> homing_requested
    homing_requested --> homing_in_progress : Home command sent (ok response)
    homing_in_progress --> [*] : status === 'Idle' && both flags true
    homing_requested --> [*] : Home command failed
    
    state homing_requested {
        [*] --> set_flags
        set_flags --> defer_command
        defer_command --> send_command
        
        set_flags : is_homing=true
        set_flags : UI="Homing..."
        defer_command : setTimeout(0)
        send_command : home_command_sent=true
    }
    
    state homing_in_progress {
        [*] --> waiting_for_completion
        waiting_for_completion --> check_status
        check_status --> waiting_for_completion : Still homing
        check_status --> [*] : Idle + both flags true
        
        check_status : Status poll (100ms)
    }
    
    note right of homing_requested
        Critical: UI updates immediately
        Race condition window exists
    end note
    
    note right of homing_in_progress
        Status polling continues every 100ms
        Completion: is_homing && status === 'Idle' && home_command_sent
        Then: is_homing = false, home_command_sent = false
    end note
```

## Timing Diagram - Race Condition Analysis

```mermaid
flowchart TD
    A[User Clicks Home Button] --> B[t=0ms: Set is_homing = true]
    B --> C[t=0ms: Update Display to 'Homing...']
    C --> D[t=0ms: Queue setTimeout]
    
    E[t=50ms: Status Poll #1] --> F{Check is_homing?}
    F -->|true| G[Keep 'Homing...' display]
    F -->|false| H[Override display - RACE!]
    
    D --> I[t=100ms: setTimeout fires]
    I --> J[Set home_command_sent = true]
    J --> K[Send $H command to CNC]
    
    L[t=150ms: Status Poll #2] --> M{home_command_sent?}
    M -->|true| N[Valid homing state]
    M -->|false| O[Potential race condition]
    
    K --> P[t=200-600ms: CNC Homing]
    P --> Q[CNC Returns to Idle]
    Q --> R[t=600ms: Detect completion]
    R --> S[Clear flags, Update to 'Idle']
    
    style E fill:#ffcccc
    style H fill:#ff6666
    style L fill:#ffcccc
    style O fill:#ff6666
    
    classDef raceCondition fill:#ff6666,color:#fff
    classDef statusPoll fill:#ffcccc,color:#000
```

## Problem Analysis

### Race Condition Window (0-100ms)
Between setting `is_homing=true` and `home_command_sent=true`, status polling might override the display.

### Multiple Rapid Clicks
If user clicks Home multiple times quickly, we could have overlapping operations.

### Jog During Homing
If user jogs while homing, it could interfere with the state tracking.

### Status Polling Frequency
100ms polling might be too frequent and could cause timing issues.

## Potential Solutions

1. **Add button debouncing** - disable Home button immediately when clicked
2. **Add operation mutex** - prevent overlapping commands  
3. **Reduce status polling frequency during homing**
4. **Add more robust state validation**
