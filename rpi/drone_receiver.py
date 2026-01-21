import asyncio
import argparse
import json
import logging
import math
# import RPi.GPIO as GPIO # Uncomment on real RPi

# Dependencies: pip install websockets

# Configuration
# Default PC IP (User must provide this via argument)
DEFAULT_HUB_IP = "192.168.1.50" 
HUB_PORT = 8082

logging.basicConfig(level=logging.INFO, format='%(asctime)s - [DRONE] - %(message)s')
logger = logging.getLogger(__name__)

class DroneReceiver:
    def __init__(self, hub_ip):
        self.uri = f"ws://{hub_ip}:{HUB_PORT}"
        self.running = True
        
        # Physics / Mixing Constants
        self.BASE_THROTTLE = 55 # %
        self.PITCH_GAIN = 0.8
        self.ROLL_GAIN = 0.8
        self.YAW_GAIN = 0.5
        
    def clamp(self, n, minn, maxn):
        return max(min(maxn, n), minn)

    def mix_motors(self, r, p, y):
        """
        Quad X Mixing similar to app.js
        Data (r,p,y) are in degrees.
        """
        # Normalize inputs roughly (-30 to +30 deg -> -1.0 to 1.0)
        r_in = self.clamp(r / 30.0, -1.0, 1.0)
        p_in = self.clamp(p / 30.0, -1.0, 1.0)
        
        # Scaling gain to Throttle percentage
        mix_p = p_in * self.PITCH_GAIN * 20
        mix_r = r_in * self.ROLL_GAIN * 20
        
        # Motor Mixing (Quad X)
        # FL(0) CW, FR(1) CCW, BL(2) CCW, BR(3) CW
        
        # Note: Directions element (CW/CCW) is handled by HW wiring.
        # Logic: 
        # Pitch Forward (Nose Down, P > 0) -> Front Motors Speed Up?
        # WAIT: In `app.js`: pIn * P_GAIN. If pIn > 0 (Nose Down), FL/FR increase.
        # This matches "fighting gravity" logic (to hold angle).
        
        m_fl = self.BASE_THROTTLE + mix_p - mix_r
        m_fr = self.BASE_THROTTLE + mix_p + mix_r
        m_bl = self.BASE_THROTTLE - mix_p - mix_r
        m_br = self.BASE_THROTTLE - mix_p + mix_r
        
        return [
            int(self.clamp(m_fl, 0, 100)),
            int(self.clamp(m_fr, 0, 100)),
            int(self.clamp(m_bl, 0, 100)),
            int(self.clamp(m_br, 0, 100))
        ]

    async def connect(self):
        from websockets.client import connect
        
        logger.info(f"Attempting to connect to Ground Station at {self.uri}...")
        
        while self.running:
            try:
                async with connect(self.uri) as websocket:
                    logger.info("Connected to Ground Station! 🚀")
                    
                    while True:
                        message = await websocket.recv()
                        try:
                            # Parse JSON
                            data = json.loads(message)
                            
                            # Extract Angles (Robust safe get)
                            r = float(data.get('r', 0))
                            p = float(data.get('p', 0))
                            y = float(data.get('y', 0))
                            
                            # Compute Motors
                            motors = self.mix_motors(r, p, y)
                            
                            # Output (Simulate PWM)
                            # On RPi, you would do: pwm_fl.ChangeDutyCycle(motors[0])
                            status = f"R:{r:>5.1f} P:{p:>5.1f} | FL:{motors[0]}% FR:{motors[1]}% BL:{motors[2]}% BR:{motors[3]}%"
                            print(status, end='\r')
                            
                        except json.JSONDecodeError:
                            pass
                        except Exception as e:
                            logger.error(f"Error processing packet: {e}")
                            
            except (OSError, Exception) as e:
                logger.warning(f"Connection lost/failed: {e}. Retrying in 3s...")
                await asyncio.sleep(3)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RPi Drone Client")
    parser.add_argument("--ip", required=True, help="IP Address of the PC (Ground Station)")
    args = parser.parse_args()
    
    client = DroneReceiver(args.ip)
    try:
        asyncio.run(client.connect())
    except KeyboardInterrupt:
        print("\nStopping Drone Client...")
