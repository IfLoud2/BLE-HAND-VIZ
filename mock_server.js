/**
 * @file mock_server.js
 * @brief Synthetic Data Generator for Drone Simulator
 * @version 2.0.0
 * @date 2026-01-20
 * 
 * Simulates a hardware IMU by broadcasting sine-wave based orientation data
 * (Roll/Pitch/Yaw) over WebSocket port 8082. Used for testing the frontend
 * without physical hardware.
 * 
 * @copyright Copyright (c) 2026 Antigravity
 */

const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8082 });

console.log('Mock Server is running on ws://localhost:8082');

wss.on('connection', (ws) => {
    console.log('Client connected');

    const intervalId = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            // Simulate motion using sine waves
            const time = Date.now() / 1000;

            // Roll: -30 to 30 degrees
            const r = Math.sin(time) * 30;

            // Pitch: -20 to 20 degrees
            const p = Math.sin(time * 0.5) * 20;

            // Yaw: Continuous rotation
            const y = (time * 10) % 360;

            const data = {
                r: parseFloat(r.toFixed(2)),
                p: parseFloat(p.toFixed(2)),
                y: parseFloat(y.toFixed(2))
            };

            ws.send(JSON.stringify(data));
        }
    }, 20); // 50 Hz

    ws.on('close', () => {
        console.log('Client disconnected');
        clearInterval(intervalId);
    });
});
