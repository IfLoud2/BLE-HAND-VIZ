# Hand Viz - Professional Drone Simulator

![Version 2.0.0](https://img.shields.io/badge/version-2.0.0-blue) ![License MIT](https://img.shields.io/badge/license-MIT-green) ![Status Functioning](https://img.shields.io/badge/status-stable-success)

A high-fidelity real-time drone flight simulator driven by hand orientation (IMU). Designed for verifying flight dynamics and human-machine interaction concepts using the Seeed Xiao nRF52840 Sense.

## Quick Start

### 1. Requirements
*   **Node.js**: v14+
*   **Python**: v3.x (for simple HTTP server)
*   **Hardware**: Seeed Xiao nRF52840 (or compatible JSON serial streamer)

### 2. Installation
```bash
cd c:/agent/hand_viz
npm install
```

### 3. Usage
**Simulation Mode (No Hardware):**
```bash
# Terminal 1: Start Physics/Data Mock
node mock_server.js

# Terminal 2: Start Frontend
python -m http.server 8000
```
Visit `http://localhost:8000` in your browser.

**Hardware Mode:**
1.  Connect Device via USB.
2.  Edit `serial_bridge.js` to set your COM port (e.g., `COM11`).
3.  Run:
    ```bash
    node serial_bridge.js
    ```
4.  Open Browser.

## Features
*   **Realistic Physics**: Quadcopter flight dynamics with differential motor mixing.
*   **Procedural Rendering**: High-detail 3D drone model generated largely via code.
*   **Real-time Telemetry**: Monitor motor outputs and orientation in real-time.
*   **Engineering Theme**: Clean, high-contrast interface for technical validation.

## Architecture
See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design, data flow, and physics mixing algorithms.

## Contributing
Please adhere to the rigorous coding standards defined in the project guidelines. 
*   **Commits**: Conventional Commits (feat, fix, refactor).
*   **Documentation**: Update CHANGELOG.md for every PR.

## License
MIT
