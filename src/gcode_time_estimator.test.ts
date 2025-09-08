import { GcodeTimeEstimator } from './gcode_time_estimator';

// Test results interface
interface TestResult {
  name: string;
  passed: boolean;
  details: string[];
  errors: string[];
}

// Manual test functions that can be called from the UI
export function test_linear_path_progress(): TestResult {
  const result: TestResult = {
    name: 'Linear Path Progress',
    passed: true,
    details: [],
    errors: []
  };
  
  result.details.push('🧪 Testing linear path progress tracking...');
  
  const estimator = new GcodeTimeEstimator();
  
  // Simple G-code that moves in a straight line
  const gcode = `
G21 ; Set units to millimeters
G90 ; Absolute positioning
G1 X0 Y0 F1000
G1 X10 Y0 F1000
G1 X20 Y0 F1000
G1 X30 Y0 F1000
`;
  
  // Parse the G-code
  const estimate = estimator.estimate_gcode_time(gcode);
  result.details.push(`📊 Parsed ${estimate.total_lines} lines of G-code`);
  
  const start_time = new Date();
  
  // Simulate position updates every 100ms along the path
  const positions = [
    { x: 0, y: 0, z: 0 },    // Should be at line with G1 X0 Y0
    { x: 5, y: 0, z: 0 },    // Should be at line with G1 X10 Y0
    { x: 10, y: 0, z: 0 },   // Should be at line with G1 X10 Y0
    { x: 15, y: 0, z: 0 },   // Should be at line with G1 X20 Y0
    { x: 20, y: 0, z: 0 },   // Should be at line with G1 X20 Y0
    { x: 25, y: 0, z: 0 },   // Should be at line with G1 X30 Y0
    { x: 30, y: 0, z: 0 },   // Should be at line with G1 X30 Y0
  ];
  
  let last_line = 0;
  
  positions.forEach((pos, index) => {
    const progress = estimator.calculate_progress_by_position(pos, start_time);
    
    // Check that progress never goes backwards
    if (progress.current_line < last_line) {
      result.errors.push(`❌ Progress went backwards! Was ${last_line}, now ${progress.current_line}`);
      result.passed = false;
    }
    last_line = Math.max(last_line, progress.current_line);
    
    // Check valid ranges
    if (progress.percent_complete < 0 || progress.percent_complete > 100) {
      result.errors.push(`❌ Invalid progress percentage: ${progress.percent_complete}%`);
      result.passed = false;
    }
    
    result.details.push(`📍 Step ${index}: X${pos.x} Y${pos.y} -> Line ${progress.current_line}, ${progress.percent_complete.toFixed(1)}%, "${progress.current_command}"`);
  });
  
  if (result.passed) {
    result.details.push('✅ Linear path test PASSED');
  } else {
    result.details.push('❌ Linear path test FAILED');
  }
  return result;
}

export function test_back_and_forth_movement(): TestResult {
  const result: TestResult = {
    name: 'Back and Forth Movement (Realistic)',
    passed: true,
    details: [],
    errors: []
  };
  
  result.details.push('🧪 Testing realistic overlapping path progress tracking...');
  
  const estimator = new GcodeTimeEstimator();
  
  // More realistic G-code with overlapping paths (similar to real CNC operations)
  const gcode = `
G21 ; Set units to millimeters  
G90 ; Absolute positioning
G0 X0 Y0 Z5 ; Rapid to start position
G1 Z0 F200 ; Plunge down
G1 X20 Y0 F1000 ; Move to X20 (line 5)
G1 X20 Y5 F1000 ; Move up in Y
G1 X0 Y5 F1000 ; Move back to X0 (overlaps with line 5 path!)
G1 X0 Y10 F1000 ; Move up more in Y  
G1 X20 Y10 F1000 ; Move to X20 again (overlaps again!)
G1 X20 Y15 F1000 ; Move up in Y
G1 X0 Y15 F1000 ; Back to X0 (more overlap)
G1 X0 Y20 F1000 ; Final Y position
G1 X10 Y20 F1000 ; Middle position
G0 Z5 ; Lift up
`;
  
  estimator.estimate_gcode_time(gcode);
  const start_time = new Date();
  
  // Simulate realistic machine positions during this operation
  const positions = [
    { x: 0, y: 0, z: 5 },     // Start position
    { x: 0, y: 0, z: 0 },     // After plunge
    { x: 10, y: 0, z: 0 },    // Halfway to X20 (should be line 5)
    { x: 20, y: 0, z: 0 },    // At X20 (should be line 5)
    { x: 20, y: 2.5, z: 0 },  // Moving up in Y (should be line 6)
    { x: 10, y: 5, z: 0 },    // Halfway back - THIS IS THE CRITICAL TEST POINT
                              // Machine is at X10,Y5 - this position exists on multiple lines!
                              // Line 5: X0->X20 at Y0 (distance ~11.18)
                              // Line 7: X20->X0 at Y5 (distance ~10)  <- Should pick this one
    { x: 0, y: 5, z: 0 },     // At X0,Y5 (should be line 7)
    { x: 0, y: 7.5, z: 0 },   // Moving up in Y (should be line 8)
    { x: 10, y: 10, z: 0 },   // Halfway to X20 again - ANOTHER CRITICAL POINT
                              // This position also exists on multiple lines!
    { x: 20, y: 10, z: 0 },   // At X20,Y10 (should be line 9)
    { x: 10, y: 15, z: 0 },   // Moving back - THIRD CRITICAL POINT
    { x: 0, y: 15, z: 0 },    // At X0,Y15 (should be line 11)
  ];
  
  let last_confirmed_line = 0;
  let had_major_backwards_jump = false;
  
  positions.forEach((pos, index) => {
    const progress = estimator.calculate_progress_by_position(pos, start_time);
    
    // CRITICAL: Check for out-of-bounds line numbers
    if (progress.current_line > progress.total_lines) {
      result.errors.push(`❌ OUT OF BOUNDS! Line ${progress.current_line}/${progress.total_lines} at position X${pos.x} Y${pos.y}`);
      result.passed = false;
    }
    
    if (progress.current_line < 1) {
      result.errors.push(`❌ INVALID LINE NUMBER! Line ${progress.current_line} should be ≥ 1 at position X${pos.x} Y${pos.y}`);
      result.passed = false;
    }
    
    // STRICT test: should NEVER go backwards in line numbers due to temporal constraint
    if (progress.current_line < last_confirmed_line) {
      result.errors.push(`❌ BACKWARDS JUMP! Step ${index}: From line ${last_confirmed_line} to ${progress.current_line} at position X${pos.x} Y${pos.y}`);
      had_major_backwards_jump = true;
      result.passed = false;
    }
    
    // For overlapping positions, verify we picked the most logical line
    if (index === 5) { // X10,Y5 - should be line 7 (X20->X0 at Y5), not line 5 (X0->X20 at Y0)
      if (progress.current_line < 6) {
        result.errors.push(`❌ Wrong line selection at X10,Y5! Got line ${progress.current_line}, expected ≥6 (should be on the Y5 path, not Y0 path)`);
        result.passed = false;
      }
    }
    
    if (index === 8) { // X10,Y10 - should be line 9 (X0->X20 at Y10), not earlier lines
      if (progress.current_line < 8) {
        result.errors.push(`❌ Wrong line selection at X10,Y10! Got line ${progress.current_line}, expected ≥8 (should be on the Y10 path)`);
        result.passed = false;
      }
    }
    
    // Update confirmed line
    last_confirmed_line = Math.max(last_confirmed_line, progress.current_line);
    
    result.details.push(`📍 Step ${index}: X${pos.x} Y${pos.y} Z${pos.z} -> Line ${progress.current_line} (${progress.percent_complete.toFixed(1)}%) "${progress.current_command}"`);
  });
  
  if (!had_major_backwards_jump) {
    result.details.push('✅ No backwards line jumps detected');
  }
  
  if (result.passed) {
    result.details.push('✅ Realistic back and forth movement test PASSED');
  } else {
    result.details.push('❌ Realistic back and forth movement test FAILED - progress tracking has issues with overlapping paths');
  }
  return result;
}

export function test_temporal_progression_constraint(): TestResult {
  const result: TestResult = {
    name: 'Temporal Progression Constraint',
    passed: true,
    details: [],
    errors: []
  };
  
  result.details.push('🧪 Testing temporal progression constraint...');
  
  const estimator = new GcodeTimeEstimator();
  
  const gcode = `
G1 X0 Y0 F1000
G1 X10 Y0 F1000
G1 X20 Y0 F1000
G1 X30 Y0 F1000
G1 X40 Y0 F1000
`;
  
  estimator.estimate_gcode_time(gcode);
  const start_time = new Date();
  
  // First, advance far into the program
  let progress = estimator.calculate_progress_by_position({ x: 35, y: 0, z: 0 }, start_time);
  const advanced_line = progress.current_line;
  result.details.push(`📍 Advanced to line ${advanced_line} at position X35`);
  
  // Then try to jump back to early position - should be constrained
  progress = estimator.calculate_progress_by_position({ x: 5, y: 0, z: 0 }, start_time);
  result.details.push(`📍 With early position X5, got line ${progress.current_line}`);
  
  // Should not jump all the way back to line 1, temporal constraint should prevent it
  const backwards_jump = advanced_line - progress.current_line;
  result.passed = backwards_jump <= 2; // Allow small backwards movement, prevent large jumps
  
  if (result.passed) {
    result.details.push(`✅ Temporal constraint test PASSED (backwards jump: ${backwards_jump} lines)`);
  } else {
    result.errors.push(`❌ Temporal constraint test FAILED (backwards jump: ${backwards_jump} lines, should be ≤2)`);
    result.details.push(`❌ Temporal constraint test FAILED`);
  }
  return result;
}

export function run_all_tests(): TestResult[] {
  return [
    test_linear_path_progress(),
    test_back_and_forth_movement(),
    test_temporal_progression_constraint()
  ];
}

// Make tests available globally for UI access
(globalThis as any).gcode_tests = {
  test_linear_path_progress,
  test_back_and_forth_movement, 
  test_temporal_progression_constraint,
  run_all_tests
};
