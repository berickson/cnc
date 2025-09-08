/**
 * Simple test file to verify G-code time estimation functionality
 * Run this in a browser console or Node.js environment
 */

import { GcodeTimeEstimator } from './src/gcode_time_estimator.js';

// Test G-code content
const testGcode = `
G21 ; Set units to millimeters
G90 ; Absolute positioning
F1000 ; Set feed rate

; Rapid moves
G0 X0 Y0 Z5
G0 X10 Y10

; Cutting moves
G1 Z0
G1 X20 Y10
G1 X20 Y20
G1 X10 Y20
G1 X10 Y10

; Return home
G0 Z5
G0 X0 Y0
`;

// Create estimator and test
const estimator = new GcodeTimeEstimator();
const estimate = estimator.estimate_gcode_time(testGcode);

console.log('Test G-code Time Estimation Results:');
console.log('=====================================');
console.log(`Total time: ${GcodeTimeEstimator.format_time_duration(estimate.total_time_seconds)}`);
console.log(`Total distance: ${estimate.total_distance.toFixed(2)} mm`);
console.log(`Line count: ${estimate.line_count}`);
console.log(`Rapid moves time: ${GcodeTimeEstimator.format_time_duration(estimate.rapid_moves_time)}`);
console.log(`Cutting moves time: ${GcodeTimeEstimator.format_time_duration(estimate.cutting_moves_time)}`);
console.log(`Estimated completion: ${estimate.estimated_completion?.toLocaleTimeString()}`);

// Test summary
console.log('\nSummary:');
console.log(estimator.get_time_summary(estimate));

// Test progress tracking
console.log('\nProgress Tracking Test:');
const tracker = new GcodeJobProgressTracker(estimator);
tracker.start_job();

// Simulate progress at 25%, 50%, 75%, 100%
const totalLines = estimate.line_count;
[0.25, 0.5, 0.75, 1.0].forEach((progress, index) => {
  setTimeout(() => {
    const currentLine = Math.floor(totalLines * progress);
    tracker.update_current_line(currentLine);
    const progressInfo = tracker.get_current_progress();
    
    if (progressInfo) {
      console.log(`\nProgress at ${(progress * 100).toFixed(0)}%:`);
      console.log(`  Line: ${progressInfo.current_line}/${progressInfo.total_lines}`);
      console.log(`  Completion: ${progressInfo.percent_complete.toFixed(1)}%`);
      console.log(`  Elapsed: ${GcodeTimeEstimator.format_time_duration(progressInfo.elapsed_time_seconds)}`);
      console.log(`  Remaining: ${GcodeTimeEstimator.format_time_duration(progressInfo.estimated_remaining_seconds)}`);
      console.log(`  Operation: ${progressInfo.current_operation}`);
    }
  }, index * 1000);
});

export { estimator, estimate, tracker };
