#include <ArduinoBLE.h>
#include <LSM6DS3.h>
#include <Wire.h>
#include <math.h>
#include <Adafruit_LIS3DH.h>
#include <Adafruit_Sensor.h>
#include "Madgwick.h" // Local Advanced Filter

// ==========================================
// CONFIGURATION
// ==========================================

// BLE UUIDs (Legacy/Simple - Known Working)
BLEService imuService("1101");
BLECharacteristic imuChar("2101", BLERead | BLENotify, 24); // 6 floats x 4 bytes

// IMU 1: LSM6DS3 (Internal)
LSM6DS3 imuLSM(I2C_MODE, 0x6A);

// IMU 2: LIS3DH (External - The "Improvement")
Adafruit_LIS3DH imuLIS = Adafruit_LIS3DH();
bool hasLIS = false;

// Filter & Fusion Settings
Madgwick filter;
const float SAMPLE_RATE = 60.0f; 
const float ALPHA_FUSION = 0.5f; // Weight for dual accel averaging

// Pin for Yaw Reset
#define YAW_RESET_PIN 0

// State
float qualityMetric = 0.0f;
float biasX = 0, biasY = 0, biasZ = 0;
uint32_t lastUs = 0;
uint32_t lastSendMs = 0;

// ==========================================
// SETUP
// ==========================================

void setup() {
  Serial.begin(115200);
  pinMode(YAW_RESET_PIN, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);

  // 1. Init Main IMU
  if (imuLSM.begin() != 0) {
    Serial.println("LSM Error");
    while(1);
  }

  // 2. Init Secondary IMU (Improvement)
  if (imuLIS.begin(0x18)) {
    Serial.println("LIS3DH Found!");
    imuLIS.setRange(LIS3DH_RANGE_4_G);
    hasLIS = true;
  } else {
    Serial.println("LIS3DH Not Found (Single IMU Mode)");
  }

  // 3. Calibration (Static)
  Serial.println("Calibrating Gyro... KEEP STILL");
  float sumX=0, sumY=0, sumZ=0;
  int N = 500;
  for(int i=0; i<N; i++) {
     sumX += imuLSM.readFloatGyroX();
     sumY += imuLSM.readFloatGyroY();
     sumZ += imuLSM.readFloatGyroZ();
     delay(5);
  }
  biasX = sumX / N;
  biasY = sumY / N;
  biasZ = sumZ / N;
  Serial.println("Calibration Done.");

  filter.begin(SAMPLE_RATE);

  // 4. BLE Setup (Legacy Name/UUIDs)
  if (!BLE.begin()) {
    Serial.println("BLE Error");
    while(1);
  }
  BLE.setLocalName("XIAO_IMU");
  BLE.setAdvertisedService(imuService);
  imuService.addCharacteristic(imuChar);
  BLE.addService(imuService);
  BLE.advertise();
  
  Serial.println("BLE Ready. Waiting...");
  lastUs = micros();
}

// ==========================================
// MAIN LOOP
// ==========================================

void loop() {
  // --- DT Control ---
  uint32_t nowUs = micros();
  float dt = (nowUs - lastUs) * 1e-6f;
  
  // Enforce consistent sample rate for Madgwick
  if (dt < (1.0f / SAMPLE_RATE)) return;
  lastUs = nowUs;

  // --- 1. Read Raw Sensors ---
  float ax1 = imuLSM.readFloatAccelX();
  float ay1 = imuLSM.readFloatAccelY();
  float az1 = imuLSM.readFloatAccelZ();
  float gx = imuLSM.readFloatGyroX() - biasX;
  float gy = imuLSM.readFloatGyroY() - biasY;
  float gz = imuLSM.readFloatGyroZ() - biasZ;

  float ax_f = ax1;
  float ay_f = ay1;
  float az_f = az1;

  // --- 2. Dual Fusion (Improvement) ---
  if (hasLIS) {
    sensors_event_t event; 
    imuLIS.getEvent(&event);
    float ax2 = event.acceleration.x / 9.81f; 
    float ay2 = event.acceleration.y / 9.81f;
    float az2 = event.acceleration.z / 9.81f;
    
    // Simple Fusion (Average)
    // Could add alignment matrix here if needed
    ax_f = (ax1 + ax2) * 0.5f;
    ay_f = (ay1 + ay2) * 0.5f;
    az_f = (az1 + az2) * 0.5f;
  }

  // --- 3. Dynamic Filtering (Improvement) ---
  float acc_mag = sqrt(ax_f*ax_f + ay_f*ay_f + az_f*az_f);
  qualityMetric = fabs(acc_mag - 1.0f);

  // Adjust Beta based on stability
  if (qualityMetric < 0.05f) filter.beta = 0.5f; // Stable -> Trust Accel
  else if (qualityMetric > 0.3f) filter.beta = 0.02f; // Vibration -> Trust Gyro
  else filter.beta = 0.1f;

  // Update Madgwick
  filter.updateIMU(gx, gy, gz, ax_f, ay_f, az_f);

  // --- 4. Yaw Reset Logic ---
  if (digitalRead(YAW_RESET_PIN) == LOW) {
    // Resetting Madgwick is hard without re-init. 
    // Usually handled client-side, but we can force it?
    // For now, let's keep client-side reset priority.
  }

  // --- 5. BLE Transmit (20Hz - Legacy Rate) ---
  // To match user's "Improve existing" request, we send Euler Angles.
  // Madgwick provides robust Euler angles (gimbal lock free internally).
  
  if (millis() - lastSendMs >= 30) { // ~33Hz (Faster than 20, slower than 60)
    lastSendMs = millis();
    BLEDevice central = BLE.central();
    
    if (central && central.connected()) {
      float r = filter.getRoll();
      float p = filter.getPitch();
      float y = filter.getYaw();

      // Payload: [Roll, Pitch, Yaw, Ax, Ay, Az] (24 bytes)
      float data[6];
      data[0] = r;
      data[1] = p;
      data[2] = y;
      data[3] = ax_f;
      data[4] = ay_f;
      data[5] = az_f;
      
      imuChar.writeValue((byte*)data, 24);
    }
  }
}
