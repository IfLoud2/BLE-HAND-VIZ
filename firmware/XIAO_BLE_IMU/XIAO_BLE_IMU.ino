#include <ArduinoBLE.h>
#include <LSM6DS3.h>
#include <Wire.h>
#include <math.h>
#include <Adafruit_LIS3DH.h>
#include <Adafruit_Sensor.h>
#include "Madgwick.h" // Local include

// ... (Rest of config same)

// Filter
Madgwick filter;
const float SAMPLE_RATE = 60.0f; // Hz

// ...

void loop() {
  // ... (Reading Logic Same) 

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
      // Direct Member Access thanks to custom implementation
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
