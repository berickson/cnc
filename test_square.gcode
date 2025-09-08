; Simple 10mm square test file
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
M30
