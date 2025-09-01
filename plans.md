

## Port
cnc-panel is in the beginning phase of porting into Tauri the following need to be done

[x] fix up assets so robonerd icon is the app icon, remove sample icons
[x] Replace web-serial
- [x] Use wifi serial connection to genmitsu instead of web-serial
- [x] Copy button should copy to clipboard, but stopped working when we moved to Tauri
[x] Coordinates need to update from machine status
[x] When connecting, should connect after the first proper muliticast message received (currently waiting for several) 

### Buttons needing backend connection
- [x] Connect button - working (multicast discovery + TCP connection)
- [x] Disconnect button - working 
- [x] Status button - working
- [x] Clear Alarm button - working
- [x] Show/Hide Log button - working (frontend only)
- [x] Copy button - working (clipboard functionality)
- [x] Home button - working
- [x] All step size buttons (0.1, 1, 10) - working (frontend only)
- [x] All jog buttons (X+/-, Y+/-, Z+/-) - working
- [x] All zero buttons (All 0, X0, Y0, Z0, X0Y0) - working
- [x] Go X0Y0 button - **FIXED** (added to Tauri system in main.ts)
- [x] Go Machine X0Y0 button - **FIXED** (added to Tauri system in main.ts)
- [x] Save Current XY Position button - working
- [x] XY preset buttons (dynamically created) - working
- [x] Probe Z button - working
- [x] Tool Change button - working
- [x] Fullscreen toggle button - working (frontend only)

**Issue resolved**: Go X0Y0 and Go Machine X0Y0 buttons were calling old cnc-serial.js functions that used Web Serial API (not available in Tauri). Added proper implementations to the Tauri system in main.ts that use the working CNC connection.

All buttons are now connected to backend functionality!

### Legacy Code Cleanup
[ ] **Remove obsolete Web Serial API code** - The cnc-serial.js file contains legacy Web Serial API code that doesn't work in Tauri. This should be cleaned up:
  - [ ] Remove cnc-serial.js file entirely
  - [ ] Remove Web Serial API references from index.html
  - [ ] Move any remaining useful functionality (like XY presets, tool change workflow) to the Tauri system in main.ts
  - [ ] Ensure all button event listeners are properly handled by the Tauri system
  - [ ] Clean up duplicate/conflicting code between old and new systems 


## Next Development Priorities
[x] UI should target 7" 1024×600 touch, no keyboard, no mouse
[x] Support kiosk mode, powers on with CNC
- [x] simplify and shrink down coordinate display
- [x] touch should not select text
- [x] console is hidden by default, maybe show it with a button
- [x] utilize full width
[*] Work coordinate management
- [ ] XY position presets with localStorage persistence
- [ ] Z offset validity tracking (valid/unknown after tool changes)
- [ ] Z surface probing functionality
- [ ] Tool change position and workflow
- [ ] Visual indicators for Z offset status
- [ ] Integration with existing zero controls
- [ ] **Safety improvements for presets**: Moving to saved XY presets should first move to safe high Z height before XY movement
- [ ] **Probe offset configuration**: Add configurable probe offset to account for probe tip thickness/diameter  
- [ ] **Enhanced probing workflow**: Improve probing speed, extend probe distance, add double-check cycle (probe → up 3mm → slow probe → retract)
- [x] **Auto-generated preset names**: Remove text input requirement - generate automatic names (Preset 1, Preset 2, etc.) or use timestamps
- [x] **Preset renaming capability**: Add ability to rename existing presets after they're created (click to edit name)
- [ ] **Error display clearing**: Clear error display at bottom when clearing alarms/errors (if machine allows error clearing)
[ ] Load gcode files from disk and send to CNC
- [ ] job progres
[ ] Auto home and zero presets
- [ ] Job execution with start/stop/pause controls
- [ ] Progress tracking and time estimation
[ ] PWA and offline
[ ] Simple commands like flatten face

## Technical Debt and Improvements

### Code Quality
- [ ] **Refactor G-code command generation**: Replace hardcoded command strings with readable helper functions
  - Current: `$J=G91${axis}${distance}F1000` (hard to read/maintain)
  - Proposed: `GRBL.jog(axis, distance)` or similar structured approach
  - Commands to refactor: jog, setWorkZero, home, move, etc.
- [ ] Add comprehensive error handling for all Grbl error codes
- [ ] Implement unit tests for core functionality




