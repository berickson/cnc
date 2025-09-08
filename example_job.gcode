; G-code Time Estimation Test File
; This file demonstrates various G-code commands for testing time estimation
G21 ; Set units to millimeters
G90 ; Absolute positioning
G17 ; XY plane selection

; Home all axes first
G28

; Set default feed rate
F1000

; Rapid positioning moves (G0)
G0 X0 Y0 Z10
G0 X50 Y0
G0 X50 Y50
G0 X0 Y50
G0 X0 Y0

; Cutting moves at different feed rates
F500
G1 Z0
G1 X25 Y25
F300
G1 X75 Y25
G1 X75 Y75
F800
G1 X25 Y75
G1 X25 Y25

; Lift and move to new position
G0 Z10
G0 X100 Y100

; More cutting with arcs (approximated as lines for estimation)
F600
G1 Z-2
G1 X120 Y100
G1 X120 Y120
G1 X100 Y120
G1 X100 Y100

; Final positioning
G0 Z10
G0 X0 Y0 Z0

; Program end
M2
