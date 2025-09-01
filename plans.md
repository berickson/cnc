

## Port
cnc-panel is in the beginning phase of porting into Tauri the following need to be done

[x] fix up assets so robonerd icon is the app icon, remove sample icons
[x] Replace web-serial
- [x] Use wifi serial connection to genmitsu instead of web-serial
- [x] Copy button should copy to clipboard, but stopped working when we moved to Tauri
[x] Coordinates need to update from machine status
[x] When connecting, should connect after the first proper multicast message received (currently waiting for several) 
[x] save xy button not working
[X] ELIFECYCLE  Command failed in console when closing app
[ ] Shouldn't allow jogging past the machine limits
[ ] need strategy for async events (e.g. set busy, wait for a bit, but timeout after a reasonable time)
[ ] Need robust button disabling
[ ] **Coordinate confidence system** - Visual indicators for coordinate reliability
  - [ ] Machine coordinates: Show with warning styling when unhomed (orange/yellow background)
  - [ ] Work coordinates: Hide completely until work zero is set in current session
  - [ ] Preset safety: Show warning dialogs for "Go To" when machine unhomed ("Position may be inaccurate - Continue?")
  - [ ] Session-only presets: Allow saving presets when unhomed but mark as temporary/non-persistent
  - [ ] Prominent "HOME MACHINE FIRST" banner when coordinates are unreliable
  - [ ] Visual feedback: Green=trusted, Yellow=caution, Red=unsafe, Hidden=unknown
[ ] Hide log should be closer to log, should also have clear log buttton


### Persistence
[ ] Save last connection and reconnect on startup
[ ] Remember saved machine position


**Issue resolved**: Go X0Y0 and Go Machine X0Y0 buttons were calling old cnc-serial.js functions that used Web Serial API (not available in Tauri). Added proper implementations to the Tauri system in main.ts that use the working CNC connection.

All buttons are now connected to backend functionality!

### Legacy Code Cleanup
[x] **Remove obsolete Web Serial API code** - ✅ **COMPLETED**
  - [x] Remove cnc-serial.js file entirely
  - [x] Remove Web Serial API references from index.html  
  - [x] Move remaining useful functionality (copy log) to the Tauri system in main.ts
  - [x] Ensure all button event listeners are properly handled by the Tauri system
  - [x] Clean up duplicate/conflicting code between old and new systems
  - [x] Update README.md to reflect Tauri architecture instead of Web Serial API 


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




