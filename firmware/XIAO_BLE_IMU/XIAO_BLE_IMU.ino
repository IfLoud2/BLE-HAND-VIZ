#include <ArduinoBLE.h>
#include <LSM6DS3.h>
#include <Wire.h>
#include <math.h>

// ==========================================
// CONFIGURATION
// ==========================================

// BLE UUIDs (Nordic UART Service)
BLEService imuService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E"); // Standard Nordic UART
BLECharacteristic imuChar("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", BLERead | BLENotify, 24);

// IMU
LSM6DS3 imu(I2C_MODE, 0x6A);

// State
float roll  = 0.0f;
float pitch = 0.0f;
float yaw   = 0.0f;
float bz    = 0.0f; // Gyro Z Bias

// Filter Constants (From User's Trusted Code)
const float alpha = 0.98f;
const float G_NORM_TARGET = 1.0f;
const float EPS_A = 0.03f;
const float EPS_W = 0.8f;   // deg/s
const float BETA  = 0.01f;  // Bias learning rate
const float GZ_DEADBAND = 0.6f;

// Loop Timing
uint32_t lastUs = 0;
uint32_t lastSendMs = 0;
const int SEND_INTERVAL_MS = 16; // ~60Hz for low latency

// Reset Pin
#define YAW_RESET_PIN 0

void calibrateBiasZ() {
  const int N = 600;
  float sum = 0.0f;
  for (int i = 0; i < N; i++) {
    sum += imu.readFloatGyroZ();
    delay(5);
  }
  bz = sum / N;
}

void setup() {
  // 1. Setup Serial (Debug) & Pins
  Serial.begin(115200);
  pinMode(YAW_RESET_PIN, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);

  // 2. Setup IMU
  if (imu.begin() != 0) {
    while (1) {
      digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
      delay(100);
    }
  }

  // 3. Calibration (Critical: Keep Still)
  calibrateBiasZ();
  yaw = 0.0f;
  lastUs = micros();

  // 4. Setup BLE
  if (!BLE.begin()) {
    while (1);
  }

  BLE.setLocalName("XIAO_IMU");
  BLE.setAdvertisedService(imuService);
  imuService.addCharacteristic(imuChar);
  BLE.addService(imuService);
  BLE.advertise();
}

void loop() {
  BLEDevice central = BLE.central();
  
  // Logic runs continuously to maintain state
  
  // --- DT ---
  uint32_t nowUs = micros();
  float dt = (nowUs - lastUs) * 1e-6f;
  lastUs = nowUs;

  if (dt <= 0.0f || dt > 0.05f) return; // Guard

  // --- Read ---
  float ax = imu.readFloatAccelX();
  float ay = imu.readFloatAccelY();
  float az = imu.readFloatAccelZ();
  float gx = imu.readFloatGyroX();
  float gy = imu.readFloatGyroY();
  float gz = imu.readFloatGyroZ();

  // --- Roll/Pitch (Accel) ---
  float roll_acc  = atan2f(ay, az) * RAD_TO_DEG;
  float pitch_acc = atan2f(-ax, sqrtf(ay * ay + az * az)) * RAD_TO_DEG;

  // --- Filter ---
  roll  = alpha * (roll  + gx * dt) + (1.0f - alpha) * roll_acc;
  pitch = alpha * (pitch + gy * dt) + (1.0f - alpha) * pitch_acc;

  // --- Stationary Check ---
  float a_norm = sqrtf(ax*ax + ay*ay + az*az);
  float w_norm = sqrtf(gx*gx + gy*gy + gz*gz);
  bool stationary = (fabsf(a_norm - G_NORM_TARGET) < EPS_A) && (w_norm < EPS_W);

  // --- Bias Update ---
  if (stationary) {
    bz = (1.0f - BETA) * bz + BETA * gz;
  }

  // --- Yaw Integration ---
  float gz_corr = gz - bz;
  if (fabsf(gz_corr) < GZ_DEADBAND) gz_corr = 0.0f;
  yaw += gz_corr * dt;

  // --- Reset ---
  if (digitalRead(YAW_RESET_PIN) == LOW) yaw = 0.0f;

  // --- BLE Transmission (60Hz) ---
  if (millis() - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = millis();
    
    // We only send if connected, but we calculate always
    if (central && central.connected()) {
        float data[6];
        data[0] = roll;
        data[1] = pitch;
        data[2] = yaw;
        data[3] = ax;
        data[4] = ay;
        data[5] = az;

        // Send binary (Fast)
        imuChar.writeValue((byte*)data, 24);
    }
  }
}
