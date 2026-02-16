# BLE-HAND-FUSION (Active Fusion Environment)

This directory contains the **Active Fusion** implementation of the drone control system. unlike the legacy version, this firmware actively fuses data from two accelerometers to reduce noise and improve stability.

## 🔬 Active Fusion Logic

The core innovation in this version is the **Dual-IMU Averaging** combined with **ZUPT (Zero Velocity Update)**.

### 1. Dual Accelerometer Fusion
Instead of relying on a single noisy accelerometer, we read data from both the internal `LSM6DS3` and the external `LIS3DH`.
```cpp
// Firmware/XIAO_BLE_FUSION.ino
float ax_f = (ax1 + ax2) * 0.5f;
float ay_f = (ay1 + ay2) * 0.5f;
float az_f = (az1 + az2) * 0.5f;
```
This fused vector `(ax_f, ay_f, az_f)` has a theoretic noise variance reduction of **50%**, providing a much cleaner gravity reference for the Complementary Filter.

### 2. Enhanced ZUPT
The Zero Velocity Update algorithm detects when the drone is stationary to recalibrate the gyroscope bias. By using the cleaner **Fused Acceleration** to detect the "Stationary" state, we eliminate false negatives caused by sensor noise, making the drift correction significantly more reliable.

## 📚 References
For a detailed list of the research papers and articles that influenced this implementation (including ZUPT validity and Complementary Filter analysis), please see [REFERENCES.md](./REFERENCES.md).

## 🚀 How to Run
1.  **Firmware**: Open `firmware/XIAO_BLE_FUSION/XIAO_BLE_FUSION.ino` and flash it to the XIAO nRF52840.
2.  **Bridge**: Run `python fusion_bridge.py` to start the BLE receiver with CSV logging.
3.  **Visualization**: Open `index.html` (or run the legacy `start_ble_viz.bat` if compatible).
