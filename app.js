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
let orientation = { r: 0, p: 0, y: 0 };
let yawOffset = 0;
let isConnected = false;

// --- Helpers ---
/**
 * Clamps a number between min and max values.
 * @param {number} val Input value
 * @param {number} min Minimum allowed
 * @param {number} max Maximum allowed
 * @returns {number} Clamped value
 */
function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

// --- Components ---
/**
 * @class App
 * @description Main Application Controller
 */
class App {
    /**
     * Initializes the simulator application.
     */
    constructor() {
        // [FL, FR, BL, BR] - Standard Quad X order for betaflight is usually:
        // 4(FL), 2(FR), 3(BL), 1(BR). 

        // We will store simply: 0:FL, 1:FR, 2:BL, 3:BR
        this.motorData = [
            { id: 'FL', throttle: 0, mesh: null, blurMesh: null, dir: 1 }, // CW
            { id: 'FR', throttle: 0, mesh: null, blurMesh: null, dir: -1 }, // CCW
            { id: 'BL', throttle: 0, mesh: null, blurMesh: null, dir: -1 }, // CCW
            { id: 'BR', throttle: 0, mesh: null, blurMesh: null, dir: 1 }  // CW
        ];

        this.initThree();
        this.initScene();
        this.initWebSocket();
        this.onWindowResize();

        window.addEventListener('resize', this.onWindowResize.bind(this));

        const btn = document.getElementById('btn-reset-yaw');
        if (btn) btn.addEventListener('click', () => yawOffset = orientation.y);

        this.animate();
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(CONFIG.colors.bg);
        this.scene.fog = new THREE.Fog(CONFIG.colors.bg, 30, 150);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(25, 25, 30);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);
    }

    createPropellerSystem(color, dir) {
        const group = new THREE.Group();

        // 1. Solid Blade (Low Speed)
        const bladeHigh = new THREE.Mesh(
            new THREE.BoxGeometry(9, 0.15, 1),
            new THREE.MeshPhongMaterial({ color: 0x111111 })
        );
        group.add(bladeHigh);

        // 2. Blur Disc (High Speed)
        // Transparent disc that becomes visible as speed increases
        const discGeom = new THREE.CylinderGeometry(4.5, 4.5, 0.05, 32);
        const discMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide
        });
        const disc = new THREE.Mesh(discGeom, discMat);
        group.add(disc);

        return { group, disc };
    }

    initScene() {
        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xffffff, 1.0);
        sun.position.set(20, 50, 20);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        this.scene.add(sun);

        // Ground Grid
        const grid = new THREE.GridHelper(200, 100, 0xdddddd, 0xeeeeee);
        this.scene.add(grid);

        // Drone
        this.droneGroup = new THREE.Group();
        this.scene.add(this.droneGroup);

        // -- Frame --
        const bodyMat = new THREE.MeshStandardMaterial({
            color: CONFIG.colors.body,
            roughness: 0.6
        });

        // Main Plate
        const plate = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 10), bodyMat);
        plate.castShadow = true;
        this.droneGroup.add(plate);

        // Battery (Orange/Yellow block on top)
        const batt = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 6),
            new THREE.MeshStandardMaterial({ color: 0xffaa00 })); // Vivid orange
        batt.position.y = 1.35;
        batt.castShadow = true;
        this.droneGroup.add(batt);

        // Camera (Front)
        const cam = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1.5),
            new THREE.MeshStandardMaterial({ color: 0x333333 }));
        cam.position.set(0, 0.5, -5.5);
        this.droneGroup.add(cam);

        // Lens
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.5, 16),
            new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0, metalness: 1 }));
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0.5, -6.3);
        this.droneGroup.add(lens);

        // Arms (X-style single piece geometry effectively)
        const armMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.arm });
        const armL = 9;
        const armW = 1.0;

        const arm1 = new THREE.Mesh(new THREE.BoxGeometry(armL * 2.2, 0.6, armW), armMat);
        arm1.rotation.y = Math.PI / 4;
        arm1.castShadow = true;
        this.droneGroup.add(arm1);

        const arm2 = new THREE.Mesh(new THREE.BoxGeometry(armL * 2.2, 0.6, armW), armMat);
        arm2.rotation.y = -Math.PI / 4;
        arm2.castShadow = true;
        this.droneGroup.add(arm2);

        // Motors & Props
        const d = armL * 0.75;
        const mY = 0.5;

        const pos = [
            { idx: 0, x: -d, z: -d, color: 0xffff00 }, // FL - Yellow Trace
            { idx: 1, x: d, z: -d, color: 0xffff00 }, // FR - Yellow Trace
            { idx: 2, x: -d, z: d, color: 0x00ffff }, // BL - Cyan Trace (Rear)
            { idx: 3, x: d, z: d, color: 0x00ffff }  // BR - Cyan Trace (Rear)
        ];

        pos.forEach(p => {
            // Motor Bell
            const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.5, 24),
                new THREE.MeshStandardMaterial({ color: CONFIG.colors.motor, metalness: 0.8, roughness: 0.2 }));
            m.position.set(p.x * 2, mY, p.z * 2);
            m.castShadow = true;
            this.droneGroup.add(m);

            // Prop System
            const sys = this.createPropellerSystem(p.color, 1);
            sys.group.position.y = 0.8;
            m.add(sys.group);

            this.motorData[p.idx].mesh = sys.group;
            this.motorData[p.idx].blurMesh = sys.disc;
        });
    }

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
                    orientation.r = data.r ?? 0;
                    orientation.p = data.p ?? 0;
                    orientation.y = data.y ?? 0;
                } catch (e) { }
            };
            this.ws.onclose = () => {
                isConnected = false;
                document.getElementById('connection-status').textContent = 'Disconnected';
                document.getElementById('connection-status').className = 'status -disconnected';
                // Reset motors to 0 on disconnect
                this.resetMotors();
                setTimeout(connect, 2000);
            };
        };
        connect();
    }

    resetMotors() {
        this.motorData.forEach(m => m.throttle = 0);
        this.updateTelemetry();
    }

    calculatePhysics() {
        if (!isConnected) {
            this.resetMotors();
            return;
        }

        // --- PHYSICS MODEL ---
        // Inputs: orientation (deg)
        const pDeg = orientation.p; // Pitch
        const rDeg = orientation.r; // Roll
        const yDeg = 0; // Yaw Rate? We don't have rate, only angle. 
        // Visualizing static angle as yaw input is confusing. 
        // We will set Yaw Input to 0 for stability.

        // Gains
        const P_GAIN = CONFIG.physics.pitchGain;
        const R_GAIN = CONFIG.physics.rollGain;
        const BASE = CONFIG.physics.hoverThrottle;

        // AERODYNAMIC LOGIC:
        // To maintain a Pitch Down attitude (Nose Down), the drone must produce enough torque 
        // to counter-act the righting moment (if stable) or just hold it.
        // Actually, in ACRO mode, sticking to an angle requires 0 input. 
        // In ANGLE mode (self-level), holding a pitch requires constant input.
        // We simulate ANGLE MODE:
        // Pitch Angle > 0 (Nose Up) -> Requires Rear Thrust > Front Thrust ?
        // No, self-leveling logic:
        // Error = Target - Current.
        // If Stick is centered (Target=0) and Drone is Pitched (Current=30), 
        // Controller wants to pitch back.
        // BUT here, we are visualizing: "The Hand IS the Drone".
        // So if Hand is tilted, Drone is tilted.
        // What are the motors doing? 
        // If we assume the drone is "Fighting gravity to hold this angle", 
        // Vertical thrust vector is reduced. Motors speed up to maintain altitude.
        // `Throttle = Base / cos(tilt)`.

        // However, user specifically asked for "Directional Feedback":
        // "Pitch Forward -> Front motors increase". 
        // This effectively visualizes the *Control Effort* required to *initiate* or *hold* that angle against wind/drag.
        // Let's implement the user's requested Differential Mapping for clarity.

        // Normalize inputs (-30 to +30 deg approx range)
        const pIn = clamp(pDeg / 30, -1, 1);
        const rIn = clamp(rDeg / 30, -1, 1);

        // Quad X Mixing
        // FL = Base + Pitch - Roll
        // FR = Base + Pitch + Roll
        // BL = Base - Pitch - Roll
        // BR = Base - Pitch + Roll

        // PITCH LOGIC RE-CHECK:
        // Requested: "Pitch Forward (Nose Down) -> Front Motors Speed Up".
        // Code: `rotation.x = -pitchRad`.
        // If P-Data is Positive -> Nose Down.
        // So P-Data > 0 -> Front Motors Speed Up.
        // FL & FR should get (+ P_GAIN * pIn). 
        // BL & BR should get (- P_GAIN * pIn).

        // ROLL LOGIC RE-CHECK:
        // Requested: "Roll Right -> Right Motors Speed Up".
        // Code: `rotation.z = rollRad`.
        // If R-Data is Positive -> Roll Left visual (Left Wing Down).
        // Wait, THREE.js Z-axis CCW is Left Down.
        // If Hand rolls Right -> R-Data is usually Negative? Or Positive?
        // Let's assume R > 0 = Right Down.
        // Then R > 0 -> Right Motors Speed Up.
        // FR & BR get (+ R_GAIN * rIn).

        const mixP = pIn * P_GAIN * 20; // Scale to +/- 20%
        const mixR = rIn * R_GAIN * 20;

        // FL (0)
        this.motorData[0].throttle = BASE + mixP - mixR;
        // FR (1)
        this.motorData[1].throttle = BASE + mixP + mixR;
        // BL (2)
        this.motorData[2].throttle = BASE - mixP - mixR;
        // BR (3)
        this.motorData[3].throttle = BASE - mixP + mixR;

        // Clamp
        this.motorData.forEach(m => {
            m.throttle = clamp(m.throttle, 0, 100);
        });

        this.updateTelemetry();
    }

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
