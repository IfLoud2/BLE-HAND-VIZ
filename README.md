# BLE Hand Viz - Drone Control System

![Version 1.0.0](https://img.shields.io/badge/version-1.0.0-blue) ![License MIT](https://img.shields.io/badge/license-MIT-green) ![Status Active](https://img.shields.io/badge/status-active-success)

A professional fusion of **BLE Hand** (IMU Data Acquisition) and **Hand Viz** (Drone Simulation). This project allows real-time control of a simulated drone using a Seeed Studio XIAO nRF52840 Sense via Bluetooth Low Energy.

## Quick Start

### 1. Requirements
*   **Node.js**: v14+
*   **Python**: v3.10+
*   **Hardware**: Seeed XIAO nRF52840 Sense (Flashed with `BLE_hand` firmware)

### 2. Installation
```bash
git clone https://github.com/IfLoud2/BLE-HAND-VIZ.git
cd BLE-HAND-VIZ
npm install
pip install -r python/requirements.txt
```

### 3. Usage
**One-Click Launch (Windows):**
Double-click `start_ble_viz.bat`.

This will automatically start:
1.  **Hub Server** (Port 8082): The central message broker.
2.  **Web Interface** (Port 8000): The 3D Drone Simulator.
3.  **BLE Bridge** (Python): Connects to the XIAO and forwards data to the Hub.

**Manual Launch:**
```bash
# Terminal 1: Broker
node hub_server.js

# Terminal 2: Web
python -m http.server 8000

# Terminal 3: BLE Bridge
python python/ble_bridge.py --port 8082
```

## Features
*   **Hybrid Architecture**: Python backend for BLE + Node.js/Browser for Visualization.
*   **Real-time Logic**: Low-latency UDP-like forwarding via WebSockets.
*   **Physics Engine**: Custom 3D drone physics responding to hand roll/pitch/yaw.
*   **Engineering Viz**: High-contrast, clean UI for technical validation.

## Architecture
See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design, data flow, and physics mixing algorithms.

## Contributing
Please adhere to the rigorous coding standards defined in the project guidelines. 
*   **Commits**: Conventional Commits (feat, fix, refactor).
*   **Documentation**: Update CHANGELOG.md for every PR.

## License
MIT
