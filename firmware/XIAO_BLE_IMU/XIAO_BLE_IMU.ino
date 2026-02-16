#include <ArduinoBLE.h>
#include <LSM6DS3.h>
#include <Wire.h>
#include <math.h>
#include <Adafruit_LIS3DH.h>
#include <Adafruit_Sensor.h>
#include "Madgwick.h" // Local include

// ==========================================
// CONFIGURATION
// ==========================================

// BLE UUIDs (Nordic UART Service)
BLEService imuService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
BLECharacteristic imuChar("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", BLERead | BLENotify, 32); // 8 floats * 4 bytes

// IMU 1: LSM6DS3 (Built-in)
LSM6DS3 imuLSM(I2C_MODE, 0x6A);

// IMU 2: LIS3DH (External)
Adafruit_LIS3DH imuLIS = Adafruit_LIS3DH();

// Filter
Madgwick filter;
const float SAMPLE_RATE = 60.0f; // Hz

// Fusion Weights
const float W1 = 0.5f; // LSM
const float W2 = 0.5f; // LIS

// State
float qualityMetric = 0.0f; // |a|-1g
float biasX=0, biasY=0, biasZ=0;

// Timing
uint32_t lastUs = 0;
const int SEND_INTERVAL_MS = 16; // ~60Hz

#define YAW_RESET_PIN 0

void setup() {
  Serial.begin(115200);
  pinMode(YAW_RESET_PIN, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);

  // 1. Init Sensors
  if (imuLSM.begin() != 0) {
    Serial.println("LSM Error");
    while(1);
  }
  
  if (!imuLIS.begin(0x18)) { // Default Address
    Serial.println("LIS Error (Ignored for Dev/Sim)");
  } else {
    imuLIS.setRange(LIS3DH_RANGE_4_G);
  }

  // 2. Calibration (Stand Still 2s)
  Serial.println("Calibrating... KEEP STILL");
  float sumGx=0, sumGy=0, sumGz=0;
  int N = 200;
  for(int i=0; i<N; i++) {
     sumGx += imuLSM.readFloatGyroX();
     sumGy += imuLSM.readFloatGyroY();
     sumGz += imuLSM.readFloatGyroZ();
     delay(10);
  }
  biasX = sumGx / N;
  biasY = sumGy / N;
  biasZ = sumGz / N;

  filter.begin(SAMPLE_RATE);

  // 3. BLE
  if (!BLE.begin()) while(1);
  BLE.setLocalName("XIAO_FUSION");
  BLE.setAdvertisedService(imuService);
  imuService.addCharacteristic(imuChar);
  BLE.addService(imuService);
  BLE.advertise();
  
  Serial.println("BLE Ready.");
  lastUs = micros();
}

void loop() {
  // --- DT & Rate Control ---
  uint32_t nowUs = micros();
  float dt = (nowUs - lastUs) * 1e-6f;
  
  // Enforce ~60Hz Loop for Filter Stability
  if (dt < (1.0f / SAMPLE_RATE)) return;
  lastUs = nowUs;

  // --- 1. READ SENSORS ---
  // A. LSM6DS3
  float ax1 = imuLSM.readFloatAccelX();
  float ay1 = imuLSM.readFloatAccelY();
  float az1 = imuLSM.readFloatAccelZ();
  float gx = imuLSM.readFloatGyroX() - biasX;
  float gy = imuLSM.readFloatGyroY() - biasY;
  float gz = imuLSM.readFloatGyroZ() - biasZ;

  // B. LIS3DH (Secondary) -- If present simulation fallback
  float ax2 = ax1; 
  float ay2 = ay1; 
  float az2 = az1;
  
  // Actually read LIS if available
  // sensors_event_t event; 
  // if (imuLIS.getEvent(&event)) {
  //     ax2 = event.acceleration.x / 9.81f; 
  //     ay2 = event.acceleration.y / 9.81f;
  //     az2 = event.acceleration.z / 9.81f;
  // }

  // --- 2. FUSION (Dual Accel) ---
  float ax_f = (ax1 * W1) + (ax2 * W2);
  float ay_f = (ay1 * W1) + (ay2 * W2);
  float az_f = (az1 * W1) + (az2 * W2);

  // --- 3. DYNAMIC BETA (Quality Check) ---
  float acc_mag = sqrt(ax_f*ax_f + ay_f*ay_f + az_f*az_f);
  qualityMetric = fabs(acc_mag - 1.0f); // Error from 1G

  if (qualityMetric < 0.05f) { // Very Stable
      filter.beta = 0.5f; // High Gain: Trust Accel
  } else if (qualityMetric > 0.2f) { // High Motion
      filter.beta = 0.01f; // Low Gain: Trust Gyro
  } else {
      filter.beta = 0.1f; // Normal
  }

  // --- 4. UPDATE FILTER ---
  filter.updateIMU(gx, gy, gz, ax_f, ay_f, az_f);

  // --- 5. TRANSMIT (60Hz) ---
  BLEDevice central = BLE.central();
  if (central && central.connected()) {
      float data[8];
      data[0] = filter.q0;
      data[1] = filter.q1;
      data[2] = filter.q2;
      data[3] = filter.q3;
      data[4] = qualityMetric;
      data[5] = biasX;
      data[6] = biasY;
      data[7] = biasZ;
      
      imuChar.writeValue((byte*)data, 32);
  }
}
