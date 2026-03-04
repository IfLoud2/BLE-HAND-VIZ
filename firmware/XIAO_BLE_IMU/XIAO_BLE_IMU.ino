#include <ArduinoBLE.h>
#include <LSM6DS3.h>
#include <Wire.h>
#include <math.h>
#include <Adafruit_LIS3MDL.h>
#include <Adafruit_Sensor.h>
#include <MadgwickAHRS.h>

// ==========================================
// CONFIGURATION: MADGWICK 9-DOF STABLE
// ==========================================

// Service & Characteristic UUIDs (Generic Serial)
BLEService imuService("1101");
BLECharacteristic imuChar("2101", BLERead | BLENotify, 24); // 6 floats * 4 bytes = 24 bytes

// Sensor Settings
LSM6DS3 myIMU(I2C_MODE, 0x6A);
Adafruit_LIS3MDL mag;

// Filter Settings
Madgwick filter;
const float sampleRate = 50.0f; // 50 Hz

// Pin for Yaw Reset (Optional)
#define YAW_RESET_PIN 0

// ==========================================
// GLOBAL VARIABLES
// ==========================================

// Orientation State
float roll  = 0.0f;
float pitch = 0.0f;
float yaw   = 0.0f;
float yawOffset = 0.0f;

// Timing
uint32_t lastUpdate = 0;

// ==========================================
// SETUP
// ==========================================

void setup() {
  Serial.begin(115200);
  pinMode(YAW_RESET_PIN, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);

  // 1. Init IMU
  if (myIMU.begin() != 0) {
    Serial.println("IMU Error!");
    while(1);
  }

  // 2. Init Magnetometer
  if (!mag.begin_I2C(0x1C)) { 
    Serial.println("Erreur: LIS3MDL non detecte !");
  } else {
    mag.setPerformanceMode(LIS3MDL_MEDIUMMODE);
    mag.setOperationMode(LIS3MDL_CONTINUOUSMODE);
    mag.setDataRate(LIS3MDL_DATARATE_155_HZ);
    mag.setRange(LIS3MDL_RANGE_4_GAUSS);
  }

  // 2. Initialize filter
  filter.begin(sampleRate);
  filter.beta = 1.0f; // INCREASED GAIN: Default is 0.1f. 1.0f forces much faster convergence.
  lastUpdate = micros();

  // 3. Init BLE
  if (!BLE.begin()) {
    Serial.println("BLE Error!");
    while(1);
  }

  BLE.setLocalName("XIAO_IMU");
  BLE.setAdvertisedService(imuService);
  imuService.addCharacteristic(imuChar);
  BLE.addService(imuService);
  BLE.advertise();

  Serial.println("BLE Active. Waiting for connections...");
  delay(1000); // Let filter stabilize briefly
}

// ==========================================
// LOOP
// ==========================================

void loop() {
  BLEDevice central = BLE.central();
  
  // --- 1. Filter Execution (50 Hz) ---
  uint32_t nowUs = micros();
  if (nowUs - lastUpdate >= (1000000 / sampleRate)) {
    lastUpdate = nowUs;

    // --- 2. Read Accelerometer & Gyro ---
    float ax = myIMU.readFloatAccelX();
    float ay = myIMU.readFloatAccelY();
    float az = myIMU.readFloatAccelZ();
    float gx = myIMU.readFloatGyroX();
    float gy = myIMU.readFloatGyroY();
    float gz = myIMU.readFloatGyroZ();

    // --- 3. Read Magnetometer & Apply Hard-Iron Calibration ---
    sensors_event_t mag_event;
    mag.getEvent(&mag_event);
    
    // Raw Data & Offsets
    float mx = mag_event.magnetic.x - 66.645f;
    float my = mag_event.magnetic.y - 2.915f;
    float mz = mag_event.magnetic.z - 25.875f;

    // --- 4. Madgwick 9-DOF Fusion ---
   filter.update(gx, gy, gz, ax, ay, az, -mx, my, -mz);

    roll  = filter.getRoll();
    pitch = filter.getPitch();
    
    // --- 5. Yaw Reset Handling ---
    if (digitalRead(YAW_RESET_PIN) == LOW) {
      yawOffset = filter.getYaw();
    }
    yaw = filter.getYaw() - yawOffset;
  } // End of 50Hz Block

  // --- 6. BLE Transmission & Stack Handling (Send at ~20Hz) ---
  static uint32_t lastSendMs = 0;
  if (millis() - lastSendMs > 50) { 
    lastSendMs = millis();
    
    if (central && central.connected()) {
      float data[6];
      data[0] = roll;
      data[1] = pitch;
      data[2] = yaw;
      data[3] = myIMU.readFloatAccelX(); // Send instantaneous G-force for visualizer
      data[4] = myIMU.readFloatAccelY();
      data[5] = myIMU.readFloatAccelZ();
      
      imuChar.writeValue((byte*)data, 24);
    }
  }
}
