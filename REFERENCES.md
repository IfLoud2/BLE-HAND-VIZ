# References & Research

This implementation of the **Dual IMU Active Fusion** and **Zero Velocity Update (ZUPT)** algorithms is based on the following research and technical resources.

## 1. Sensor Fusion & Filtering
*   **"Analysis of comparative filter algorithm effect on an IMU undergoing vibrations"**  
    *Source: DiVA Portal (2025)*  
    Analyzes the performance of Complementary Filters vs LMS filters in high-vibration environments (e.g., automowers). Confirms that complementary filters are often more robust and simpler to tune than complex adaptive filters for irregular vibrations.
*   **"Complementary Filters for IMU Fusion"**  
    *Source: Sean Boerhout (2021)*  
    Explains the theory behind blending high-frequency gyroscope data with low-frequency accelerometer data to eliminate drift while maintaining responsiveness.
*   **"Complementary Filter: A Comprehensive Guide for 2025"**  
    *Source: Shadecoder (Vance Lee, 2026)*  
    A modern guide on implementing efficient sensor fusion on microcontrollers, emphasizing low computational cost and reliability for edge devices.

## 2. Zero Velocity Update (ZUPT)
*   **"Assessing the validity of the zero-velocity update method for sprinting speeds"**  
    *Source: PLOS ONE (Aristizábal Pla et al., 2024)*  
    Validates the accuracy of ZUPT for estimating stride parameters and distance in dynamic conditions. Highlights the importance of sensor specifications and sampling rates.
*   **"Method for Maintaining Initial Azimuth of Tactical Grade IMU by Using Zero Velocity Update Algorithm"**  
    *Source: TKIEE / Transactions of KIEE*  
    Describes how ZUPT can be used to correct azimuth (yaw) drift by detecting stationary periods and recalibrating the gyroscope bias in real-time.

## 3. Implementation Details
*   **"Three.js Gimbal Lock in rotation"**  
    *Source: StackOverflow / Three.js Documentation*  
    Discussions on the limitations of Euler angles (Gimbal Lock) and the necessity of using Quaternions for robust 3D visualization.
*   **"Estimate Orientation with a Complementary Filter and IMU"**  
    *Source: MathWorks*  
    Standard implementation reference for sensor fusion algorithms.
