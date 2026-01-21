/**
 * @file hub_server.js
 * @brief Central Message Broker for BLE-Hand-Viz
 * @version 1.0.0
 * 
 * Acts as a relay station. 
 * - Determines if a client is a sender (Python BLE) or receiver (Browser).
 * - Simply broadcasts all received messages to all other connected clients.
 */

const WebSocket = require('ws');

// Configuration
const PORT = 8082;

const wss = new WebSocket.Server({ port: PORT });

console.log(`
╔══════════════════════════════════════════╗
║     BLE-HAND-VIZ HUB SERVER RUNNING      ║
║           Port: ${PORT}                     ║
╚══════════════════════════════════════════╝
`);

// State
let connections = 0;

wss.on('connection', (ws, req) => {
    connections++;
    const id = req.headers['sec-websocket-key'].substring(0, 8);
    console.log(`[+] Client Connected (${id}). Total: ${connections}`);

    // Heartbeat to keep connections alive
    ws.isAlive = true;
    ws.on('pong', () => ws.isAlive = true);

    ws.on('message', (message) => {
        // Broadcast to ALL OTHER clients
        const msgStr = message.toString();

        // Optional: Debug log (verbose)
        // console.log(`[MSG] From ${id}: ${msgStr.substring(0, 50)}...`);

        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(msgStr);
            }
        });
    });

    ws.on('close', () => {
        connections--;
        console.log(`[-] Client Disconnected (${id}). Total: ${connections}`);
    });

    ws.on('error', (error) => {
        console.error(`[!] Error from ${id}: ${error.message}`);
    });
});

// Heartbeat interval
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));
