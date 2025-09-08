# G-code Job Time Estimation and Progress Tracking

This document describes the G-code time estimation and progress tracking features implemented in the CNC application.

## Features

### 1. Time Estimation
- **Real-time Analysis**: When you select a G-code file, the system automatically analyzes it and provides time estimates
- **Detailed Breakdown**: Shows total time, rapid move time, and cutting time separately
- **Distance Calculation**: Calculates total movement distance for the job
- **Completion Prediction**: Estimates when the job will complete based on current time

### 2. Progress Tracking
- **Live Progress**: Real-time progress bar and percentage completion during job execution
- **Time Tracking**: Shows elapsed time and estimated remaining time
- **Current Operation**: Displays what the machine is currently doing (rapid move, cutting, etc.)
- **Pause/Resume Support**: Progress tracking pauses when the job is held and resumes when continued

## How It Works

### Time Estimation Algorithm
The system uses a sophisticated algorithm that considers:

1. **Movement Types**:
   - G0 (rapid moves): Uses rapid feed rate (default: 5000 mm/min)
   - G1 (linear moves): Uses specified feed rate or default (1000 mm/min)

2. **Machine Parameters** (configurable):
   - Default feed rate: 1000 mm/min
   - Rapid feed rate: 5000 mm/min
   - Acceleration limits: X/Y: 500 mm/s², Z: 250 mm/s²
   - Junction deviation: 0.02 mm

3. **Physics-Based Calculations**:
   - Acceleration/deceleration time for short moves
   - Distance-based time calculation for longer moves
   - Buffer time for rapid positioning

### Progress Tracking
Since GRBL doesn't report current G-code line numbers, the system uses:
- Time-based estimation to determine approximate current position in the G-code
- State machine integration to detect job start, pause, resume, and completion
- Real-time updates every second during job execution

## User Interface

### File Selection Panel
When you select a G-code file, you'll see:
- **File Info**: Lines count and file size
- **Time Estimate**: Total estimated time with breakdown
- **Format**: "Est. time: 2m 30s (45s rapid + 1m 45s cutting)"

### Progress Panel (During Job Execution)
When a job is running, you'll see:
- **Progress Bar**: Visual progress indicator with animation
- **Percentage**: Numeric completion percentage
- **Time Info**: "1m 15s / 1m 30s remaining"
- **Current Operation**: Description of current machine activity

### Visual Indicators
- **Blue styling**: Normal time estimation
- **Green styling**: Job is actively running
- **Yellow styling**: Job is paused/held
- **Animated progress bar**: Shows when job is actively running

## Usage Instructions

### 1. Load and Analyze G-code
1. Click "Load G-code File" to import a new file, or
2. Select an existing file from the database list
3. Time estimation appears automatically in the blue info panel

### 2. Start a Job
1. Ensure CNC is connected and ready
2. Select your G-code file
3. Click "Send G-code" to start the job
4. Progress tracking starts automatically

### 3. Monitor Progress
- Watch the progress bar for visual completion status
- Check time estimates for planning
- Monitor current operation to understand machine status

### 4. Handle Pauses
- Use Emergency Stop or hold commands to pause
- Progress tracking automatically pauses
- Use Resume to continue - progress tracking resumes
- Use Cancel to stop the job completely

## Configuration

### Machine Parameters
The time estimation can be tuned by modifying parameters in `gcode_time_estimator.ts`:

```typescript
const DEFAULT_MACHINE_PARAMS: MachineParameters = {
  default_feed_rate: 1000,  // mm/min - adjust based on your typical cutting speeds
  rapid_feed_rate: 5000,    // mm/min - your machine's rapid traverse speed
  acceleration_x: 500,      // mm/s² - X-axis acceleration limit
  acceleration_y: 500,      // mm/s² - Y-axis acceleration limit  
  acceleration_z: 250,      // mm/s² - Z-axis acceleration (usually slower)
  junction_deviation: 0.02, // mm - cornering smoothness
  minimum_feed_rate: 10     // mm/min - minimum cutting speed
};
```

### Calibration Tips
For more accurate estimates:
1. **Measure your machine's actual rapid speed** and update `rapid_feed_rate`
2. **Time a known job** and compare to estimates, adjust feed rates accordingly
3. **Consider your typical cutting parameters** when setting `default_feed_rate`
4. **Check acceleration settings** in your GRBL configuration ($120, $121, $122)

## Technical Details

### Architecture
- **GcodeTimeEstimator**: Core estimation engine
- **GcodeJobProgressTracker**: Progress monitoring and state management  
- **Integration**: Seamless integration with existing CNC state machine
- **UI Updates**: Separate update loop for progress (1-second interval)

### Accuracy
The estimation accuracy depends on:
- **G-code complexity**: Simple linear moves are most accurate
- **Machine calibration**: Properly configured parameters improve accuracy
- **Feed rate consistency**: Estimates assume consistent feed rates as specified
- **Acceleration modeling**: Accounts for acceleration limits on short moves

### Limitations
- **GRBL line reporting**: No direct line number feedback, uses time-based estimation
- **Arc commands**: G2/G3 arcs are approximated as linear moves
- **Tool changes**: Manual operations not included in time estimates
- **Dwell commands**: G4 dwell times may not be fully accurate

## Example G-code Analysis

For the included `example_job.gcode`:
- **Total estimated time**: ~45 seconds
- **Breakdown**: ~15s rapid moves, ~30s cutting moves
- **Distance**: ~180mm total movement
- **Operations**: Positioning, square cutting, repositioning

## Future Enhancements

Potential improvements include:
- **GRBL 1.1+ line reporting**: Use $G status reports for accurate line tracking
- **Arc calculation**: Proper G2/G3 arc time calculation
- **Spindle operations**: Include spindle start/stop delays
- **Tool change time**: Account for manual tool change operations
- **Learning mode**: Adjust estimates based on actual job completion times
- **Export estimates**: Save time estimates with G-code files
