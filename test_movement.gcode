; Test G-code - Safe movement between two points
; Moves between (50,50,5) and (100,100,5) without spindle
; Stays at safe Z=5mm above material surface
G21 ; Set units to millimeters
G90 ; Absolute positioning
G94 ; Units per minute feed rate
G17 ; XY plane selection

; Ensure spindle is off
M5

; Move to safe Z height first
G0 Z5

; Move to first position (staying at safe Z)
G0 X50 Y50 Z5

; Move to second position (staying at safe Z)
G1 X100 Y100 Z5 F1000

; Move back to first position
G1 X50 Y50 Z5 F1000

; Move back to second position
G1 X100 Y100 Z5 F1000

; Move back to first position one more time
G1 X50 Y50 Z5 F1000

; Move to origin (still at safe height)
G0 X0 Y0 Z5

; End program
M30
