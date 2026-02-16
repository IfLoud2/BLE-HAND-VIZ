/**
 * @file app.js
 * @brief Three.js Application Logic for Hand Viz
 * @version 2.0.0
 * @date 2026-01-20
 * 
 * Main entry point for the Drone Simulator. Handles Three.js scene setup,
 * WebSocket communication, and physics visualization logic.
 * 
 * @copyright Copyright (c) 2026 Antigravity
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Configuration ---
const CONFIG = {
    wsUrl: 'ws://localhost:8082',
    colors: {
        bg: 0xf5f5f5,   // Engineering White
        body: 0x222222, // Matte Black Carbon
        arm: 0x444444,  // Dark Grey
        motor: 0x888888,// Silver
        propCW: 0x333333,  // Black props
        propCCW: 0x333333, // Black props
        propTraceCW: 0xff3300, // Orange trace for CW
        propTraceCCW: 0x0033ff // Blue trace
    },
    physics: {
        maxRpm: 4000,
        hoverThrottle: 55, // Base hover %
        pitchGain: 0.8,
        rollGain: 0.8,
        yawGain: 0.5,
        maxThrottle: 100
    }
};

// --- State ---
let droneQuaternion = new THREE.Quaternion();
let yawOffsetQuat = new THREE.Quaternion(); // Identity
let quality = 0;
let isConnected = false;

// ...

initWebSocket() {
    const connect = () => {
        this.ws = new WebSocket(CONFIG.wsUrl);
        this.ws.onopen = () => {
            isConnected = true;
            document.getElementById('connection-status').textContent = 'Connected';
            document.getElementById('connection-status').className = 'status -connected';
        };
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.quat) {
                    // NEW Quaternion Mode
                    // Firmware sends Madgwick (NED or similar). 
                    // Three.js is ENU (Right Handed, Y-up).
                    // Mapping usually: (y, z, x, w) or similar shuffle.
                    // Standard conversion for Madgwick NED -> Three.js:
                    // q.x = data.quat.y
                    // q.y = data.quat.z
                    // q.z = data.quat.x
                    // q.w = data.quat.w 
                    // (Needs tuning based on sensor mounting! for now we try standard)

                    const qRaw = new THREE.Quaternion(
                        data.quat.x,  // b.y -> t.x
                        data.quat.z,  // b.z -> t.y (Up)
                        -data.quat.y, // b.x -> t.z (Forward) - check signs
                        data.quat.w
                    );

                    droneQuaternion.copy(qRaw);
                    quality = data.quality;

                    // Update Telemetry Text
                    document.getElementById('val-r').textContent = quality.toFixed(2); // Hack: show quality in R slot
                }
                else if (data.r !== undefined) {
                    // Fallback Old Mode
                    // ...
                }
            } catch (e) { }
        };
        // ...
    };
    connect();
}

// ...

resetYaw() {
    // Capture current Y rotation as offset
    // Simplified: Just align current forward vector to World Forward?
    // Or store inverse of current rotation?
    // Detailed: We want to keep pitch/roll but zero yaw.
    // We will just store the inverse of the current Heading component?
    // Easiest UI Hack: Just apply an offset to the mesh Group.

    // Actually, user wants Re-Zero Yaw.
    // We can get Euler, zero Y, reconstruction?
    const euler = new THREE.Euler().setFromQuaternion(droneQuaternion, 'YXZ');
    this.yawCorrection = -euler.y;
}

animate() {
    requestAnimationFrame(this.animate.bind(this));
    if (this.controls) this.controls.update();

    // Update Orientation
    // Apply Orientation to Drone
    // Viz Logic: Drone Group has the quaternion

    this.droneGroup.quaternion.copy(droneQuaternion);

    // Apply Yaw Correction manually via parent group or just rotate Y
    // To do this cleanly, we might rotate the "World" or Camera, but rotating object is ok.
    this.droneGroup.rotateY(this.yawCorrection || 0);

    // ... Physics calculation usage need Euler ...
    const euler = new THREE.Euler().setFromQuaternion(this.droneGroup.quaternion, 'YXZ');
    orientation.r = THREE.MathUtils.radToDeg(euler.z);
    orientation.p = THREE.MathUtils.radToDeg(euler.x);
    orientation.y = THREE.MathUtils.radToDeg(euler.y);

    this.calculatePhysics();
    // ...

    updateTelemetry() {
        // Update DOM
        document.getElementById('val-r').textContent = orientation.r.toFixed(1);
        document.getElementById('val-p').textContent = orientation.p.toFixed(1);
        document.getElementById('val-y').textContent = orientation.y.toFixed(1);

        this.motorData.forEach(m => {
            const bar = document.getElementById(`bar-${m.id.toLowerCase()}`);
            const txt = document.getElementById(`val-${m.id.toLowerCase()}`);
            if (bar && txt) {
                bar.style.width = `${m.throttle}%`;
                txt.textContent = `${Math.round(m.throttle)}%`;

                // Color coding
                bar.className = 'bar ' + (m.throttle > 75 ? 'high' : m.throttle > 40 ? 'med' : 'low');
            }
        });
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        // Update Controls (damping)
        if (this.controls) this.controls.update();

        // Update Orientation
        const pitchRad = THREE.MathUtils.degToRad(orientation.p);
        const yawRad = THREE.MathUtils.degToRad(orientation.y);
        const rollRad = THREE.MathUtils.degToRad(orientation.r);

        // Smooth rotation?
        this.droneGroup.rotation.order = 'YXZ';
        // Simple lerp for smoothness
        const k = 0.2;
        this.droneGroup.rotation.x += (-pitchRad - this.droneGroup.rotation.x) * k;
        this.droneGroup.rotation.y += ((yawRad - THREE.MathUtils.degToRad(yawOffset)) - this.droneGroup.rotation.y) * k;
        this.droneGroup.rotation.z += (rollRad - this.droneGroup.rotation.z) * k;

        // Physics
        this.calculatePhysics();

        // Animation
        this.motorData.forEach(m => {
            // RPM calculation
            const rpm = (m.throttle / 100) * CONFIG.physics.maxRpm;
            // Rotation per frame (assume 60fps, 16ms)
            const rot = (rpm * 6) * 0.016; // rough scalar

            m.mesh.rotation.y += rot * m.dir;

            // Motion Blur Opacity
            // 0% throttle = 0 opacity, 100% throttle = 0.5 opacity
            const opacity = (m.throttle / 100) * 0.8;
            if (m.blurMesh) {
                m.blurMesh.material.opacity = opacity;
                // m.mesh.children[0].visible = (opacity < 0.8); // Hide solid blade at max speed?
                // Visual trick: Keep blade visible but transparency creates the "disk" effect look.
            }
        });

        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

new App();
