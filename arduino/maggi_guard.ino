// ============================================
// MAGGI BOWL - SMART INTRUDER DETECTION SYSTEM
// Arduino UNO + IR Sensor + Buzzer + Laser
// Enhanced: receives GRANT / DENY / ALARM / IDLE
//           commands from Python backend
// ============================================

// ---------------- PIN CONNECTIONS ----------------

const int irSensor = 10;
const int laser    = 11;
const int buzzer   = 12;

// ---------------- SYSTEM STATUS ----------------

bool personDetected = false;


// ---------------- SETUP ----------------

void setup() {

  // Start Serial communication
  // Arduino <-> Python Backend
  Serial.begin(9600);

  // Set pin modes
  pinMode(irSensor, INPUT);
  pinMode(laser, OUTPUT);
  pinMode(buzzer, OUTPUT);

  // Initially OFF
  digitalWrite(laser, LOW);
  digitalWrite(buzzer, LOW);

  // Tell Python that Arduino is ready
  Serial.println("MAGGI_GUARD_READY");
}


// ---------------- MAIN LOOP ----------------

void loop() {

  // ------------------------------------------
  // CHECK FOR COMMANDS FROM PYTHON BACKEND
  // ------------------------------------------

  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == "GRANT") {
      // Known person — access granted
      // Stop alarm, short happy double-beep
      digitalWrite(laser, LOW);
      noTone(buzzer);
      delay(100);
      tone(buzzer, 1200, 150);
      delay(200);
      tone(buzzer, 1600, 200);
      delay(300);
      noTone(buzzer);
      personDetected = false;

    } else if (cmd == "DENY") {
      // Intruder showed wrong password once — harsh low beep
      tone(buzzer, 300, 600);
      delay(700);
      noTone(buzzer);

    } else if (cmd == "ALARM") {
      // 3 wrong passwords — full alarm: rapid siren
      for (int i = 0; i < 6; i++) {
        tone(buzzer, 2800, 120);
        delay(200);
        tone(buzzer, 1200, 120);
        delay(200);
      }
      noTone(buzzer);

    } else if (cmd == "IDLE") {
      // Reset to standby
      digitalWrite(laser, LOW);
      noTone(buzzer);
      personDetected = false;
    }
  }


  // ------------------------------------------
  // READ IR SENSOR
  // ------------------------------------------

  int irState = digitalRead(irSensor);

  // ------------------------------------------
  // PERSON DETECTED
  // ------------------------------------------

  // Most IR obstacle sensors give LOW
  // when a person/object is detected.

  if (irState == LOW && !personDetected) {

    personDetected = true;

    // Turn ON alarm
    digitalWrite(laser, HIGH);
    tone(buzzer, 2000);

    // Send detection message to Python
    Serial.println("PERSON_DETECTED");
  }


  // ------------------------------------------
  // PERSON MOVED AWAY
  // ------------------------------------------

  if (irState == HIGH && personDetected) {

    personDetected = false;

    // Turn OFF alarm
    digitalWrite(laser, LOW);
    noTone(buzzer);

    // Inform Python
    Serial.println("PERSON_CLEARED");
  }


  // Small delay for stable detection
  delay(50);
}
