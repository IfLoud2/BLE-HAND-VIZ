@echo off
TITLE BLE-HAND-VIZ LAUNCHER
CLS

ECHO ===================================================
ECHO      STARTING BLE HAND VIZ SYSTEM (MERGED)
ECHO ===================================================
ECHO.

:: 0. Check/Install Dependencies
ECHO [0/3] Checking Dependencies...
pip install -r python/requirements.txt >NUL 2>&1
IF %ERRORLEVEL% NEQ 0 (
    ECHO [!] Warning: Failed to auto-install dependencies. 
    ECHO     Please run: pip install -r python/requirements.txt manually if issues occur.
) ELSE (
    ECHO     Dependencies OK.
)

:: 0.5 Show IP Address (Helpful for RPi connection)
ECHO.
ECHO [INFO] YOUR PC IP ADDRESSES:
ipconfig | findstr "IPv4"
ECHO.
ECHO [!] Enter one of these IPs on your Raspberry Pi command!
ECHO.

:: 1. Start Hub Server (Node.js)
ECHO [1/3] Starting Hub Server (Port 8082)...
start "Hub Server" cmd /k "node hub_server.js"

:: 2. Start Web Server (Python SimpleHTTP)
ECHO [2/3] Starting Web Server (Port 8000)...
start "Web Interface" cmd /k "python -m http.server 8000"

:: 3. Start BLE Bridge (Python)
ECHO [3/3] Starting BLE Bridge...
ECHO (Ensure your XIAO nRF52840 is ON and Advertising)
start "BLE Bridge" cmd /k "python python/ble_bridge.py --target XIAO_IMU --port 8082"

ECHO.
ECHO ===================================================
ECHO      ALL SYSTEMS GO!
ECHO      Open http://localhost:8000 in your browser.
ECHO ===================================================
ECHO.
PAUSE
