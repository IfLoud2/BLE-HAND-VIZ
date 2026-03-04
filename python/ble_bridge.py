import asyncio
import argparse
import logging
import json
import sys
import struct
from typing import Optional

from bleak import BleakClient, BleakScanner
from bleak.backends.characteristic import BleakGATTCharacteristic
from bleak.exc import BleakError

import websockets
from websockets.client import connect as ws_connect

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(levelname)s] - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Constants (Legacy - Known Working)
SERVICE_UUID = "1101"
CHARACTERISTIC_UUID = "2101"

class BLEBridge:
    def __init__(self, target_name: str, host: str, port: int, protocol: str, debug: bool):
        self.target_name = target_name
        self.host = host
        self.port = port
        self.protocol = protocol
        self.debug = debug
        self.client: Optional[BleakClient] = None
        self.ws_connection = None
        self.running = True

    async def run(self):
        """Main loop with reconnection logic."""
        logger.info(f"Starting BLE Bridge. Target: {self.target_name}, Output: {self.protocol}://{self.host}:{self.port}")
        
        while self.running:
            try:
                # 1. Connect to Network Destination first
                if self.protocol == 'ws':
                    uri = f"ws://{self.host}:{self.port}"
                    logger.info(f"Connecting to WebSocket: {uri}...")
                    async with ws_connect(uri) as websocket:
                        self.ws_connection = websocket
                        logger.info("WebSocket connected.")
                        await self.ble_loop()
                elif self.protocol == 'tcp':
                    logger.warning("TCP not fully implemented in this asyncio loop safely, falling back to dry run for network.")
                    await self.ble_loop()
                
            except (ConnectionRefusedError, websockets.exceptions.InvalidURI, websockets.exceptions.InvalidHandshake) as e:
                logger.error(f"Network Connection Failed: {e}. Retrying in 5s...")
                await asyncio.sleep(5)
            except Exception as e:
                logger.error(f"Unexpected error in main loop: {e}", exc_info=True)
                await asyncio.sleep(5)

    async def ble_loop(self):
        """Inner loop for BLE connection and handling."""
        while self.running:
            device = await BleakScanner.find_device_by_name(self.target_name, timeout=10.0)
            
            if not device:
                logger.warning(f"Device '{self.target_name}' not found. Scanning again...")
                await asyncio.sleep(2)
                continue

            logger.info(f"Found device: {device.name} ({device.address}). Connecting...")

            def notification_handler(sender: BleakGATTCharacteristic, data: bytearray):
                try:
                    # Handle binary data (24 bytes -> 6 floats)
                    # Payload: [r, p, y, ax, ay, az]
                    if len(data) >= 24:
                        v = struct.unpack('<6f', data[:24])
                        
                        payload = {
                            "r": v[0], "p": v[1], "y": v[2],
                            "ax": v[3], "ay": v[4], "az": v[5]
                        }

                    if payload:
                        json_data = json.dumps(payload)
                        asyncio.create_task(self.forward_data(json_data))

                except Exception as ex:
                    if self.debug:
                        logger.warning(f"Error handling data: {ex}")

            def disconnect_callback(client):
                logger.warning("BLE Disconnected!")

            try:
                async with BleakClient(device, disconnected_callback=disconnect_callback) as client:
                    self.client = client
                    if not client.is_connected:
                        logger.error("Failed to connect to BLE device.")
                        continue
                    
                    logger.info(f"Connected to {device.name}")
                    
                    await client.start_notify(CHARACTERISTIC_UUID, notification_handler)
                    logger.info(f"Subscribed to characteristic {CHARACTERISTIC_UUID}.")
                    
                    # Keep the connection alive until disconnected or error
                    while client.is_connected and self.ws_connection and not self.ws_connection.closed:
                        await asyncio.sleep(1)
                    
                    logger.info("BLE or Network connection lost/closed.")
            except BleakError as e:
                logger.error(f"BLE Error: {e}")
                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Unexpected BLE Loop Error: {e}", exc_info=True)
                await asyncio.sleep(2)
                # If WS closed, we need to break ble_loop to reconnect WS
                if self.ws_connection is None or self.ws_connection.closed:
                     break

    async def forward_data(self, data: str):
        if self.ws_connection:
            try:
                await self.ws_connection.send(data)
            except websockets.exceptions.ConnectionClosed:
                logger.error("WebSocket connection closed during send.")
        elif self.protocol == 'tcp':
            pass 

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BLE to WebSocket/TCP Bridge for XIAO nRF52840")
    parser.add_argument("--target", default="XIAO_IMU", help="BLE Device Name to scan for")
    parser.add_argument("--host", default="localhost", help="Target Host IP for WebSocket/TCP")
    parser.add_argument("--port", type=int, default=8082, help="Target Port")
    parser.add_argument("--protocol", choices=['ws', 'tcp'], default='ws', help="Transmission protocol")
    parser.add_argument("--debug", action="store_true", help="Enable verbose output")
    
    args = parser.parse_args()
    
    if args.debug:
        logger.setLevel(logging.DEBUG)
        
    bridge = BLEBridge(args.target, args.host, args.port, args.protocol, args.debug)
    
    try:
        asyncio.run(bridge.run())
    except KeyboardInterrupt:
        logger.info("Stopping Bridge...")
