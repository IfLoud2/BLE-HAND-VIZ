#include <ArduinoBLE.h>
#include <LSM6DS3.h>
#include <Wire.h>
#include <math.h>
#include <Adafruit_LIS3DH.h>
#include <Adafruit_Sensor.h>

// ==========================================
// CONFIGURATION: ACTIVE FUSION
// ==========================================

// BLE UUIDs (Legacy - Known Working)
BLEService imuService("1101");
BLECharacteristic imuChar("2101", BLERead | BLENotify, 36); // 9 floats * 4 bytes = 36 bytes (Legacy + Dual Raw)

// IMU 1: LSM6DS3 (Built-in)
LSM6DS3 myIMU(I2C_MODE, 0x6A);

// IMU 2: LIS3DH (External)
Adafruit_LIS3DH imuLIS = Adafruit_LIS3DH();
bool hasLIS = false;

// Filter Constants
const float alpha = 0.98f;         // Complementary filter weight
const float G_NORM_TARGET = 1.0f;  // Expected gravity norm (g)
const float EPS_A = 0.03f;         // Accel norm tolerance for stationary detection
const float EPS_W = 0.8f;          // Gyro norm tolerance (deg/s)
const float BETA = 0.01f;          // Bias learning rate
const float GZ_DEADBAND = 0.6f;    // Yaw deadband (deg/s)

// Pin for Yaw Reset (Optional)
#define YAW_RESET_PIN 0

// ==========================================
// GLOBAL VARIABLES
// ==========================================

// Orientation State
float roll  = 0.0f;
float pitch = 0.0f;
float yaw   = 0.0f;

// Gyro Z Bias
float bz = 0.0f;

// Timing
uint32_t lastUs = 0;

// ==========================================
// SETUP
// ==========================================

void calibrateBiasZ() {
  const int N = 600; // ~3s
  float sum = 0.0f;
  Serial.println("Calibrating Gyro Z... Keep still.");
  for (int i = 0; i < N; i++) {
    sum += myIMU.readFloatGyroZ();
    delay(5);
  }
  bz = sum / N;
  Serial.print("Bias Z encoded: ");
  Serial.println(bz);
}

void setup() {
  Serial.begin(115200);
  pinMode(YAW_RESET_PIN, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);

  // 1. Init IMU 1 (LSM)
  if (myIMU.begin() != 0) {
    Serial.println("IMU Error!");
    while(1);
  }

  // 2. Init IMU 2 (LIS)
  if (imuLIS.begin(0x18)) {
    Serial.println("LIS3DH Found!");
    imuLIS.setRange(LIS3DH_RANGE_4_G);
    hasLIS = true;
  } else {
    Serial.println("LIS3DH Not Found!");
  }

  // 3. Calibrate
  calibrateBiasZ();
  yaw = 0.0f;
  lastUs = micros();

  // 4. Init BLE
  if (!BLE.begin()) {
    Serial.println("BLE Error!");
    while(1);
  }

  BLE.setLocalName("XIAO_IMU"); // Restored to match Python Bridge default
  BLE.setAdvertisedService(imuService);
  imuService.addCharacteristic(imuChar);
  BLE.addService(imuService);
  BLE.advertise();

  Serial.println("BLE Active. Waiting for connections...");
}

// ==========================================
// LOOP
// ==========================================

void loop() {
  BLEDevice central = BLE.central();
  
  // --- 1. Time Delta ---
  uint32_t nowUs = micros();
  float dt = (nowUs - lastUs) * 1e-6f;
  lastUs = nowUs;

  if (dt <= 0.0f || dt > 0.1f) return;

  // --- 2. Read Sensors (Raw) ---
  float ax1 = myIMU.readFloatAccelX();
  float ay1 = myIMU.readFloatAccelY();
  float az1 = myIMU.readFloatAccelZ();
  float gx = myIMU.readFloatGyroX();
  float gy = myIMU.readFloatGyroY();
  float gz = myIMU.readFloatGyroZ();

  float ax2=ax1, ay2=ay1, az2=az1; // Default fallback

  if (hasLIS) {
     sensors_event_t event; 
     imuLIS.getEvent(&event);
     ax2 = event.acceleration.x / 9.81f; 
     ay2 = event.acceleration.y / 9.81f;
     az2 = event.acceleration.z / 9.81f;
  }

  // --- 3. ACTIVE FUSION (Averaging) ---
  // This reduces noise variance by factor of 2 (theoretically)
  float ax_f = (ax1 + ax2) * 0.5f;
  float ay_f = (ay1 + ay2) * 0.5f;
  float az_f = (az1 + az2) * 0.5f;

  // --- 4. Compute Roll / Pitch (Using FUSED Accel) ---
  // Better inputs -> Better Roll/Pitch
  float roll_acc  = atan2f(ay_f, az_f) * RAD_TO_DEG;
  float pitch_acc = atan2f(-ax_f, sqrtf(ay_f * ay_f + az_f * az_f)) * RAD_TO_DEG; 

  // --- 5. Complementary Filter ---
  roll  = alpha * (roll  + gx * dt) + (1.0f - alpha) * roll_acc;
  pitch = alpha * (pitch + gy * dt) + (1.0f - alpha) * pitch_acc;

  // --- 6. Stationary Detection (ZUPT using FUSED Accel) ---
  // Less noise -> Better stationary detection -> Less Drift
  float a_norm = sqrtf(ax_f * ax_f + ay_f * ay_f + az_f * az_f);
  float w_norm = sqrtf(gx * gx + gy * gy + gz * gz);
  bool stationary = (fabsf(a_norm - G_NORM_TARGET) < EPS_A) && (w_norm < EPS_W);

  if (stationary) {
    bz = (1.0f - BETA) * bz + BETA * gz;
  }

  // --- 7. Yaw Integration ---
  float gz_corr = gz - bz;
  if (fabsf(gz_corr) < GZ_DEADBAND) {
    gz_corr = 0.0f;
  }
  yaw += gz_corr * dt;

  // --- 8. Reset Handling ---
  if (digitalRead(YAW_RESET_PIN) == LOW) {
    yaw = 0.0f;
  }

  // --- 9. BLE Transmission ---
  static uint32_t lastSendMs = 0;
  if (millis() - lastSendMs > 50) { // 20Hz
    lastSendMs = millis();
    
    if (central && central.connected()) {
      // Pack Data: [Roll, Pitch, Yaw, Ax1, Ay1, Az1, Ax2, Ay2, Az2] (36 bytes)
      // Sending calculated angles + raw accel for visualization/debug
      float data[9];
      data[0] = roll;
      data[1] = pitch;
      data[2] = yaw;
      data[3] = ax1;
      data[4] = ay1;
      data[5] = az1;
      data[6] = ax2;
      data[7] = ay2;
      data[8] = az2;
      
      imuChar.writeValue((byte*)data, 36);
    }
  }
}
