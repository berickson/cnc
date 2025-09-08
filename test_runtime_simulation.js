// Test the new runtime simulation approach
import { GcodeTimeEstimator } from './src/gcode_time_estimator';

// Test with test_square.gcode content
const test_gcode = `; Simple 10mm square test file
G21 ; Set units to millimeters
G90 ; Absolute positioning
G94 ; Units per minute feed rate
G17 ; XY plane selection

; Move to starting position
G0 X0 Y0 Z2
G0 Z0.5

; Draw square
G1 X10 F300
G1 Y10
G1 X0
G1 Y0

; Lift up
G0 Z2

; End program
M30`;

const estimator = new GcodeTimeEstimator();
const estimate = estimator.estimate_gcode_time(test_gcode);

console.log('=== G-code Analysis ===');
console.log(`Total time: ${estimate.total_time_seconds.toFixed(2)}s`);
console.log(`Lines: ${estimate.line_count}`);

console.log('\n=== Parsed Lines ===');
const parsed_lines = estimator.get_parsed_lines();
parsed_lines.forEach((line, i) => {
  console.log(`${i}: ${line.command} - ${line.estimated_time_seconds.toFixed(2)}s - "${line.original_text.trim()}"`);
});

console.log('\n=== Runtime Simulation Test ===');
const start_time = new Date();

// Simulate different elapsed times
[0, 0.5, 1.0, 2.0, 5.0, 10.0, 15.0].forEach(elapsed_seconds => {
  const simulated_time = new Date(start_time.getTime() + elapsed_seconds * 1000);
  const progress = estimator.calculate_progress(0, start_time);
  
  // Manually override elapsed time for testing
  const test_progress = {
    ...progress,
    elapsed_time_seconds: elapsed_seconds
  };
  
  console.log(`${elapsed_seconds}s: ${test_progress.percent_complete.toFixed(1)}% - ${test_progress.current_operation}`);
});
