# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-01-20
### Added
- **Controls**: Interactive camera control (OrbitControls).
    - **Right Click**: Rotate View (Custom mapping).
    - **Left Click**: Pan View.
    - **Scroll**: Zoom In/Out.

## [2.0.0] - 2026-01-20
### Added
- **Simulation**: High-fidelity procedural quadcopter model with battery, camera, and X-frame.
- **Physics**: Differential motor mixing algorithm allowing for authentic flight dynamics visualization.
- **UI**: Telemetry side-panel displaying real-time motor output percentages.
- **Animation**: Propeller motion blur system based on throttle output.

### Changed
- **Theme**: Migrated to "Engineering Light" theme (#f5f5f5) for professional contrast.
- **Architecture**: Refactored `App` class to support advanced physics calculations.

## [1.1.0] - 2026-01-20
### Added
- **Controls**: "Reset Yaw" button to manually compensate for IMU drift.
- **UI**: Status panel container for connection state and controls.

### Changed
- **Input Handling**: Inverted Pitch axis mapping to alignment with pysical board movement (Nose Down = Pitch Down).
- **UX**: Enabled pointer-events on UI panel to fix button interaction issues.

## [0.2.0] - 2026-01-19
### Added
- **Hardware Integration**: `serial_bridge.js` to interface with Seeed Xiao nRF52840 via USB Serial.
- **Networking**: WebSocket broadcasting on port 8082.

### Changed
- **Dependencies**: Added `serialport` package.

## [0.1.0] - 2026-01-19
### Added
- **Prototype**: Initial browser-based visualization using Three.js.
- **Visuals**: Basic BoxGeometry representing the hand/palm.
- **Backend**: `mock_server.js` generating synthetic sine-wave orientation data.
- **Core**: Basic WebSocket client and rotational mapping logic.
