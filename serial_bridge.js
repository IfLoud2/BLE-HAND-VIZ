/**
 * @file serial_bridge.js
 * @brief USB Serial to WebSocket Bridge
 * @version 2.0.0
 * @date 2026-01-20
 * 
 * Reads newline-delimited JSON from a serial port (e.g., Arduino/Xiao)
 * and broadcasts it to connected WebSocket clients for visualization.
 * 
 * @copyright Copyright (c) 2026 Antigravity
 */

const WebSocket = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// --- Configuration ---
const SERIAL_PORT = 'COM10'; // Configuration: Target Serial Port
const BAUD_RATE = 115200;    // Match this with your Arduino's Serial.begin()
const WS_PORT = 8082;        // Must match the frontend's expected port

// --- WebSocket Server Setup ---
const wss = new WebSocket.Server({ port: WS_PORT });

console.log(`WebSocket Server started on port ${WS_PORT}`);
console.log('Waiting for client connection...');

// --- Serial Port Setup ---
// 1. Open the serial port
const port = new SerialPort({
    path: SERIAL_PORT,
    baudRate: BAUD_RATE,
    autoOpen: false // We open it manually to catch errors better
});

// 2. Create a parser to read data line-by-line
const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

// 3. Open connection
port.open((err) => {
    if (err) {
        console.error('Error opening serial port:', err.message);
        console.log('HINT: Check if the port name is correct and if the Arduino is plugged in.');
        process.exit(1);
    }
    console.log(`Serial port ${SERIAL_PORT} opened at ${BAUD_RATE} baud`);
});

// --- Data Handling ---

// Handle incoming serial data
parser.on('data', (line) => {
    // line is a string like '{"r":-12.3,"p":8.5,"y":42.1}'
    try {
        // 1. Verify it's valid JSON (simple check)
        // We don't necessarily NEED to parse it if we just want to forward it,
        // but parsing ensures we don't send garbage to the frontend.
        const data = JSON.parse(line);

        // 2. Forward to all connected WebSocket clients
        // We re-stringify to ensure clean formatting, or could just send 'line' if we trust it.
        const jsonString = JSON.stringify(data);

        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(jsonString);
            }
        });

        // Optional: Log every 100th packet to avoid spam
        if (Math.random() < 0.01) {
            console.log(`Forwarding: ${jsonString}`);
        }

    } catch (e) {
        // Ignore malformed lines (e.g. startup logs from Arduino)
        // console.log('Ignored invalid JSON:', line); 
    }
});

// Handle Serial Errors
port.on('error', (err) => {
    console.error('Serial Port Error:', err.message);
});

// --- WebSocket Event Handling ---
wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});
