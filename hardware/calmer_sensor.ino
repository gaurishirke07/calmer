// CALMER Hardware Layer — Pulse Sensor + Pressure-Sensing Stress Ball
// Streams plain-text lines over Serial (9600 baud) for the Node.js bridge
// (hardware/serial-bridge.js) to parse and forward to /api/biometric.
//
// Output protocol (one measurement per line):
//   Pressure:<raw 0-1023>  Level:<No_Pressure|Light_Pressure|Medium_Pressure|High_Pressure>
//   BPM:<int>
//
// Pressure is read every loop tick (~1s). BPM is only printed when the
// pulse-sensor interrupt routine detects a completed beat (event-driven,
// not fixed-interval) — the bridge keeps the last-known BPM between beats.

// ===== PULSE SENSOR VARIABLES =====
int pulsePin = 0;                 // Pulse Sensor purple wire -> A0
int blinkPin = 13;                // onboard LED, blinks on each beat
volatile int BPM;
volatile int Signal;
volatile int IBI = 600;
volatile boolean Pulse = false;
volatile boolean QS = false;
volatile int rate[10];
volatile unsigned long sampleCounter = 0;
volatile unsigned long lastBeatTime = 0;
volatile int P = 512;
volatile int T = 512;
volatile int thresh = 525;
volatile int amp = 100;
volatile boolean firstBeat = true;
volatile boolean secondBeat = false;

// ===== PRESSURE SENSOR (FSR in stress ball) =====
int pressureAnalogPin = 5;        // FSR -> A5
int pressureReading;
// thresholds mirror Table 7.2 / TC-01..04 in the IPD report
const int noPressure = 100;
const int lightPressure = 650;
const int mediumPressure = 950;

// ===== SETUP =====
void setup() {
  Serial.begin(9600);
  pinMode(blinkPin, OUTPUT);
  interruptSetup();
}

// ===== MAIN LOOP — pressure sampled here, BPM printed when a beat lands =====
void loop() {
  pressureReading = analogRead(pressureAnalogPin);
  Serial.print("Pressure:");
  Serial.print(pressureReading);
  Serial.print("  Level:");
  if (pressureReading < noPressure) {
    Serial.println("No_Pressure");
  } else if (pressureReading < lightPressure) {
    Serial.println("Light_Pressure");
  } else if (pressureReading < mediumPressure) {
    Serial.println("Medium_Pressure");
  } else {
    Serial.println("High_Pressure");
  }

  if (QS == true) {
    Serial.print("BPM:");
    Serial.println(BPM);
    QS = false;
  }

  delay(1000);
}

// ===== INTERRUPT SETUP for Pulse Sensor (500Hz sampling via Timer2) =====
void interruptSetup() {
  TCCR2A = 0x02;
  TCCR2B = 0x06;
  OCR2A = 0X7C;
  TIMSK2 = 0x02;
  sei();
}

ISR(TIMER2_COMPA_vect) {
  cli();
  Signal = analogRead(pulsePin);
  sampleCounter += 2;
  int N = sampleCounter - lastBeatTime;

  if (Signal < thresh && N > (IBI / 5) * 3) {
    if (Signal < T) { T = Signal; }
  }
  if (Signal > thresh && Signal > P) {
    P = Signal;
  }

  if (N > 250) {
    if ((Signal > thresh) && (Pulse == false) && (N > (IBI / 5) * 3)) {
      Pulse = true;
      digitalWrite(blinkPin, HIGH);
      IBI = sampleCounter - lastBeatTime;
      lastBeatTime = sampleCounter;

      if (secondBeat) {
        secondBeat = false;
        for (int i = 0; i <= 9; i++) { rate[i] = IBI; }
      }
      if (firstBeat) {
        firstBeat = false;
        secondBeat = true;
        sei();
        return;
      }

      word runningTotal = 0;
      for (int i = 0; i <= 8; i++) {
        rate[i] = rate[i + 1];
        runningTotal += rate[i];
      }
      rate[9] = IBI;
      runningTotal += rate[9];
      runningTotal /= 10;
      BPM = 60000 / runningTotal;
      QS = true;
    }
  }

  if (Signal < thresh && Pulse == true) {
    digitalWrite(blinkPin, LOW);
    Pulse = false;
    amp = P - T;
    thresh = amp / 2 + T;
    P = thresh;
    T = thresh;
  }

  if (N > 2500) {
    thresh = 512;
    P = 512;
    T = 512;
    lastBeatTime = sampleCounter;
    firstBeat = true;
    secondBeat = false;
  }

  sei();
}
