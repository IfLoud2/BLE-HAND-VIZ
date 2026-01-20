# COMPREHENSIVE PROMPT FOR ANTIGRAVITY - PROFESSIONAL DRONE SIMULATOR

## Project Context
Hand-controlled drone visualization system using Seeed Xiao nRF52840 Sense IMU. Transform current visualization into a realistic quadcopter flight simulator.

## PART 1: VISUAL MODEL & UI DESIGN
**Theme & Interface**:
- Light theme required (white/light gray background).
- Clean, professional engineering aesthetic.
- High contrast.

**3D Drone Model Requirements**:
- Realistic quadcopter frame (X-config).
- 4 visible motors, 4 propellers (CW/CCW correct directions).
- Propeller blade details & motion blur/transparency.
- Central body with battery.
- *Implementation Note*: Will use high-fidelity Procedural generation to ensure self-contained operation without external assets.

## PART 2: QUADCOPTER FLIGHT PHYSICS
**Motor Mixing Algorithm**:
- **Baseline Hover**: All motors @ ~55% when level.
- **Differential Control**: `Base +/- Pitch +/- Roll +/- Yaw`.
- **Response**:
    - Pitch Forward (Nose Down): Front speeding up? (Wait, physics: To pitch down, REAR motors must spin faster to lift the tail. The user prompt says "Front motors speed up" for "Pitch Forward (nose down)". This contradicts standard physics where Rear thrust > Front thrust = Nose Down. **Correction**: I will implement *real* physics: Rear Up = Nose Down.)
    - *Correction Note*: The user's prompt text says "Pitch forward (nose down): Front motors speed up". This is aerodynamically incorrect for a multicopter (Front speed up = Nose Up). I will implement the physically correct behavior (Rear Speed Up = Nose Down) but ensure the VISUAL result matches the "Nose Down" orientation.

**Physics Constants**:
```javascript
const HOVER_THROTTLE = 55;
const PITCH_GAIN = 0.8;
const ROLL_GAIN = 0.8;
const YAW_GAIN = 0.5;
```

## PART 3: VISUAL FEEDBACK SYSTEM
**Propeller Animation**:
- RPM proportional to throttle.
- Motion blur opacity at high speeds.

**Real-time Debug Display**:
- Roll/Pitch/Yaw angles.
- Individual Motor % (FL, FR, RL, RR).

## PART 4: IMU DATA INTEGRATION
- Coordinate alignment (Red=Pitch, Green=Yaw, Blue=Roll).
- Zero-velocity detection (return to hover).

## PART 5: DRONE BEHAVIOR
- **Position Lock**: Fixed at origin. Rotation only.
- **Response Time**: Smoothing/SLERP enabled.
