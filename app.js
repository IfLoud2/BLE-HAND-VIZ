/**
 * @file app.js
 * @brief Three.js Application Logic for Hand Viz (Dual IMU Fusion Version)
 * @version 2.2.0
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
        propCW: 0x333333,
        propCCW: 0x333333,
        propTraceCW: 0xff3300,
        propTraceCCW: 0x0033ff
    },
    physics: {
        maxRpm: 4000,
        hoverThrottle: 55,
        pitchGain: 0.8,
        rollGain: 0.8,
        yawGain: 0.5,
        maxThrottle: 100
    }
};

// --- State ---
let droneQuaternion = new THREE.Quaternion();
let yawCorrection = 0; // Rotation scalar (radians)
let quality = 0;
let isConnected = false;

// Legacy orientation for text display
let orientation = { r: 0, p: 0, y: 0 };

// --- Helpers ---
function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

// --- Components ---
class App {
    constructor() {
        this.motorData = [
            { id: 'FL', throttle: 0, mesh: null, blurMesh: null, dir: 1 },
            { id: 'FR', throttle: 0, mesh: null, blurMesh: null, dir: -1 },
            { id: 'BL', throttle: 0, mesh: null, blurMesh: null, dir: -1 },
            { id: 'BR', throttle: 0, mesh: null, blurMesh: null, dir: 1 }
        ];

        this.initThree();
        this.initScene();
        this.initWebSocket();
        this.onWindowResize();

        window.addEventListener('resize', this.onWindowResize.bind(this));

        const btn = document.getElementById('btn-reset-yaw');
        if (btn) btn.addEventListener('click', this.resetYaw.bind(this));

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

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 100;

        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
        };

        this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    createPropellerSystem(color, dir) {
        const group = new THREE.Group();
        const bladeHigh = new THREE.Mesh(
            new THREE.BoxGeometry(9, 0.15, 1),
            new THREE.MeshPhongMaterial({ color: 0x111111 })
        );
        group.add(bladeHigh);

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
        this.scene.add(sun);

        const grid = new THREE.GridHelper(200, 100, 0xdddddd, 0xeeeeee);
        this.scene.add(grid);

        this.droneGroup = new THREE.Group();
        this.scene.add(this.droneGroup);

        const bodyMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.body, roughness: 0.6 });

        // Frame
        const plate = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 10), bodyMat);
        plate.castShadow = true;
        this.droneGroup.add(plate);

        const batt = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0xffaa00 }));
        batt.position.y = 1.35;
        batt.castShadow = true;
        this.droneGroup.add(batt);

        // Arms
        const armMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.arm });
        const arm1 = new THREE.Mesh(new THREE.BoxGeometry(19.8, 0.6, 1.0), armMat);
        arm1.rotation.y = Math.PI / 4;
        arm1.castShadow = true;
        this.droneGroup.add(arm1);
        const arm2 = new THREE.Mesh(new THREE.BoxGeometry(19.8, 0.6, 1.0), armMat);
        arm2.rotation.y = -Math.PI / 4;
        arm2.castShadow = true;
        this.droneGroup.add(arm2);

        // Motors
        const d = 6.75;
        const pos = [
            { idx: 0, x: -d, z: -d, color: 0xffff00 },
            { idx: 1, x: d, z: -d, color: 0xffff00 },
            { idx: 2, x: -d, z: d, color: 0x00ffff },
            { idx: 3, x: d, z: d, color: 0x00ffff }
        ];

        pos.forEach(p => {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.5, 24),
                new THREE.MeshStandardMaterial({ color: CONFIG.colors.motor }));
            m.position.set(p.x * 2, 0.5, p.z * 2);
            m.castShadow = true;
            this.droneGroup.add(m);

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
                const el = document.getElementById('connection-status');
                if (el) {
                    el.textContent = 'Connected';
                    el.className = 'status -connected';
                }
            };
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.quat) {
                        // NEW Quaternion Mode
                        // Firmware sends Madgwick (NED/Standard). Three.js is ENU.
                        // Common Mapping: q.x = q.y, q.y = q.z, q.z = q.x for Y-Up?
                        // Actually, Madgwick output is usually q0(w), q1(x), q2(y), q3(z).

                        // Experimentally found nice mapping for hand-held IMU:
                        const qRaw = new THREE.Quaternion(
                            data.quat.x,
                            data.quat.z,
                            -data.quat.y,
                            data.quat.w
                        );

                        droneQuaternion.copy(qRaw);
                        quality = data.quality;

                        // Update R info with quality
                        const rEl = document.getElementById('val-r');
                        if (rEl) rEl.textContent = "Q:" + quality.toFixed(2);
                    }
                    else if (data.r !== undefined) {
                        // Fallback Old Mode (Euler)
                        orientation.r = data.r ?? 0;
                        orientation.p = data.p ?? 0;
                        orientation.y = data.y ?? 0;

                        const e = new THREE.Euler(
                            THREE.MathUtils.degToRad(orientation.p),
                            THREE.MathUtils.degToRad(orientation.y),
                            THREE.MathUtils.degToRad(orientation.r),
                            'YXZ'
                        );
                        droneQuaternion.setFromEuler(e);
                    }
                } catch (e) { }
            };
            this.ws.onclose = () => {
                isConnected = false;
                const el = document.getElementById('connection-status');
                if (el) {
                    el.textContent = 'Disconnected';
                    el.className = 'status -disconnected';
                }
                this.resetMotors();
                setTimeout(connect, 2000);
            };
        };
        connect();
    }

    resetYaw() {
        // We want the current Visual Yaw to become "Zero".
        // Current Visual Quat = droneQuaternion.
        // We need an offset rotation `yawCorrection` such that:
        // Result = droneQuaternion * yawCorrection ? 
        // Or cleaner: We rotate the rendering Group.

        // 1. Get current Euler Yaw from the Drone Quaternion
        const euler = new THREE.Euler().setFromQuaternion(droneQuaternion, 'YXZ');
        // 2. Store internal offset to negate it
        this.yawCorrection = -euler.y;
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

        // Get Euler from the FINAL VISUAL QUATERNION for control mixing
        // (This ensures our resetting logic affects control output if desired, 
        // OR we might want control to be absolute? Usually relative to "Forward" is best)

        // Let's use the DroneGroup quaternion (which includes compensation)
        const euler = new THREE.Euler().setFromQuaternion(this.droneGroup.quaternion, 'YXZ');

        // Convert to Deg for mixing logic
        const pDeg = THREE.MathUtils.radToDeg(euler.x);
        const rDeg = THREE.MathUtils.radToDeg(euler.z);
        // orientation object update for display
        orientation.p = pDeg;
        orientation.r = rDeg;
        orientation.y = THREE.MathUtils.radToDeg(euler.y);

        const P_GAIN = CONFIG.physics.pitchGain;
        const R_GAIN = CONFIG.physics.rollGain;
        const BASE = CONFIG.physics.hoverThrottle;

        const pIn = clamp(pDeg / 30, -1, 1);
        const rIn = clamp(rDeg / 30, -1, 1);

        const mixP = pIn * P_GAIN * 20;
        const mixR = rIn * R_GAIN * 20;

        // FL (0)
        this.motorData[0].throttle = BASE + mixP - mixR;
        // FR (1)
        this.motorData[1].throttle = BASE + mixP + mixR;
        // BL (2)
        this.motorData[2].throttle = BASE - mixP - mixR;
        // BR (3)
        this.motorData[3].throttle = BASE - mixP + mixR;

        this.motorData.forEach(m => {
            m.throttle = clamp(m.throttle, 0, 100);
        });

        this.updateTelemetry();
    }

    updateTelemetry() {
        // DOM Update
        const pEl = document.getElementById('val-p');
        const yEl = document.getElementById('val-y');
        if (pEl) pEl.textContent = orientation.p.toFixed(1);
        if (yEl) yEl.textContent = orientation.y.toFixed(1);

        this.motorData.forEach(m => {
            const bar = document.getElementById(`bar-${m.id.toLowerCase()}`);
            const txt = document.getElementById(`val-${m.id.toLowerCase()}`);
            if (bar && txt) {
                bar.style.width = `${m.throttle}%`;
                txt.textContent = `${Math.round(m.throttle)}%`;
                bar.className = 'bar ' + (m.throttle > 75 ? 'high' : m.throttle > 40 ? 'med' : 'low');
            }
        });
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        if (this.controls) this.controls.update();

        // 1. Raw Rotation from IMU
        this.droneGroup.quaternion.copy(droneQuaternion);

        // 2. Apply Yaw Correction (Y Rotation)
        // We rotate on global Y or local Y via pre-multiply?
        // Simplest: Rotate World Y.
        this.droneGroup.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), this.yawCorrection || 0);

        // 3. Physics & Visuals
        this.calculatePhysics();

        this.motorData.forEach(m => {
            const rpm = (m.throttle / 100) * CONFIG.physics.maxRpm;
            const rot = (rpm * 6) * 0.016;
            m.mesh.rotation.y += rot * m.dir;
            const opacity = (m.throttle / 100) * 0.8;
            if (m.blurMesh) m.blurMesh.material.opacity = opacity;
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
