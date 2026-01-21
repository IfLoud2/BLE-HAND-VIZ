#!/bin/bash
echo "Installing dependencies for Drone Client..."
sudo apt update
sudo apt install -y python3-pip git
pip3 install websockets asyncio
echo "Done! You can now run: python3 drone_receiver.py --ip <PC_IP>"
