import * as THREE from 'three';
const CONFIG = { wsUrl: 'ws://localhost:8082' };
let orientation = { r: 0, p: 0, y: 0 };
let yawOffset = 0;
class App {
    constructor() {
        this.initThree();
        this.initWebSocket();
        document.getElementById('btn-reset-yaw').addEventListener('click', () => {
            yawOffset = orientation.y;
        });
        this.animate();
    }
    initThree() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 5;
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
        const geom = new THREE.BoxGeometry(2, 0.5, 3);
        const mat = new THREE.MeshNormalMaterial();
        this.box = new THREE.Mesh(geom, mat);
        this.scene.add(this.box);
        this.scene.add(new THREE.AxesHelper(5));
    }
    initWebSocket() {
        const ws = new WebSocket(CONFIG.wsUrl);
        ws.onmessage = (e) => {
            const d = JSON.parse(e.data);
            orientation = d;
        };
    }
    animate() {
        requestAnimationFrame(this.animate.bind(this));
        // Basic mapping
        this.box.rotation.x = THREE.MathUtils.degToRad(orientation.p);
        this.box.rotation.y = THREE.MathUtils.degToRad(orientation.y);
        this.box.rotation.z = THREE.MathUtils.degToRad(orientation.r);
        this.renderer.render(this.scene, this.camera);
    }
}
new App();
