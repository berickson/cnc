// Quick test to see what parsed lines look like
const test_gcode = `G21
G90
G94
G17
G0 X0 Y0 Z2
G0 Z0.5
G1 X10 F300
G1 Y10
G1 X0
G1 Y0
G0 Z2
M30`;

// Simple parser to see estimated times
const lines = test_gcode.split('\n');
console.log('=== Test G-code Lines ===');
lines.forEach((line, i) => {
  const clean = line.trim();
  if (clean) {
    const hasMovement = clean.includes('X') || clean.includes('Y') || clean.includes('Z');
    const isRapid = clean.startsWith('G0');
    const isCut = clean.startsWith('G1');
    
    let estimated_time = 0;
    if (hasMovement) {
      if (isRapid) {
        estimated_time = 2.0; // Assume 2s for rapid moves
      } else if (isCut) {
        estimated_time = 3.0; // Assume 3s for cutting moves  
      }
    }
    // Setup commands (G21, G90, etc.) = 0 time
    
    console.log(`${i}: "${clean}" -> ${estimated_time}s`);
  }
});
