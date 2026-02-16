#ifndef Madgwick_h
#define Madgwick_h

#include <math.h>

class Madgwick {
public:
    Madgwick(void);
    void begin(float sampleFrequency);
    void update(float gx, float gy, float gz, float ax, float ay, float az, float mx, float my, float mz);
    void updateIMU(float gx, float gy, float gz, float ax, float ay, float az);
    
    // Euler angles (degrees)
    float getRoll();
    float getPitch();
    float getYaw();
    
    // Public Access for Advanced Usage
    float beta; // Algorithm gain
    float q0, q1, q2, q3; // Quaternion

private:
    float sampleFreq;
    float invSampleFreq;
    float invSqrt(float x);
};

#endif
