// ════════════════════════════════════════════════════════════
//  Flyxto Electronics — Arduino Mega Trigger Sketch
// ════════════════════════════════════════════════════════════
//
//  IR BEAM SENSOR WIRING (940nm, 12-24V DC, C-type relay output)
//  The sensor has TWO separate units:
//
//  UNIT 1 — TRANSMITTER (has only  -  and  +  pins)
//    -  →  External 12-24V DC power supply NEGATIVE
//    +  →  External 12-24V DC power supply POSITIVE
//    (Not connected to Arduino at all — just powers the IR LED)
//
//  UNIT 2 — RECEIVER (has  -  +  COM  OUT  pins)
//    -   →  External 12-24V DC power supply NEGATIVE
//    +   →  External 12-24V DC power supply POSITIVE
//    COM →  Arduino GND              (relay common terminal)
//    OUT →  Arduino Pin D2           (relay signal, dry contact)
//
//  HOW THE RELAY WORKS (beam intact = relay energized):
//    Beam INTACT  → relay contacts OPEN  → Pin D2 reads HIGH (pull-up)
//    Beam BROKEN  → relay contacts CLOSE → Pin D2 pulled LOW  → TRIGGER
//
//  NOTE: The relay contacts (COM/OUT) are FULLY ISOLATED from 12-24V.
//        They are a dry switch — safe to connect directly to Arduino logic.
//
//  RF RECEIVER WIRING:
//    RF 433MHz receiver DATA pin → Arduino Pin D3
//    RF 315MHz receiver DATA pin → Arduino Pin D4
//    Both receivers: VCC → Arduino 5V, GND → Arduino GND
//
//  Library required: RCSwitch
//    Install via: Arduino IDE → Sketch → Include Library → Manage Libraries → "RCSwitch"
// ════════════════════════════════════════════════════════════

#include <RCSwitch.h>

// ─── Pin Configuration ──────────────────────
#define IR_SENSOR_PIN   2   // IR beam relay output (C-type)
#define RF_433_PIN      3   // 433MHz receiver DATA pin
#define RF_315_PIN      4   // 315MHz receiver DATA pin

// ─── RF Code Configuration ──────────────────
// Run the sketch once with LEARN_MODE = true, open Serial Monitor (9600 baud),
// press each button on your remotes, note the printed codes,
// then paste them below and set LEARN_MODE = false.

#define LEARN_MODE  false   // Set to true to discover your remote codes

// Remote 1 (433MHz) — button codes for triggering Video 1
// Any matching code will trigger Video 1
const long REMOTE1_CODES[] = {
  5592371,  // ← Replace with your Remote 1 button A code
  5592380,  // ← Replace with your Remote 1 button B code (optional)
  0         // Terminator — do not remove
};

// Remote 2 (315MHz) — button codes for triggering Video 2
const long REMOTE2_CODES[] = {
  1398101,  // ← Replace with your Remote 2 button A code
  1398110,  // ← Replace with your Remote 2 button B code (optional)
  0         // Terminator — do not remove
};

// ─── Debounce ────────────────────────────────
#define DEBOUNCE_MS      300   // Minimum ms between IR triggers
#define RF_DEBOUNCE_MS   500   // Minimum ms between RF triggers

// ─── Internal State ──────────────────────────
bool     irLastState       = HIGH;  // HIGH = beam intact (N.O. relay)
unsigned long irLastTrigger   = 0;
unsigned long rfLastTrigger   = 0;

RCSwitch rf433 = RCSwitch();
RCSwitch rf315 = RCSwitch();

// ─── Setup ───────────────────────────────────
void setup() {
  Serial.begin(9600);

  // IR sensor pin — relay contact
  pinMode(IR_SENSOR_PIN, INPUT_PULLUP);
  // HIGH = beam intact (relay open), LOW = beam broken (relay closed)
  // If your relay behaves opposite, swap HIGH/LOW in the loop below.

  // RF receivers
  rf433.enableReceive(digitalPinToInterrupt(RF_433_PIN));
  rf315.enableReceive(digitalPinToInterrupt(RF_315_PIN));

  Serial.println("READY");

  if (LEARN_MODE) {
    Serial.println("LEARN_MODE=ON: Press remote buttons to discover codes");
  }
}

// ─── Helpers ─────────────────────────────────
bool inCodeList(long code, const long* list) {
  for (int i = 0; list[i] != 0; i++) {
    if (list[i] == code) return true;
  }
  return false;
}

// ─── Loop ────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // ── IR Beam Sensor ──────────────────────
  bool irState = digitalRead(IR_SENSOR_PIN);

  // Trigger on falling edge (beam broken = relay closes = pin goes LOW)
  if (irState == LOW && irLastState == HIGH) {
    if (now - irLastTrigger > DEBOUNCE_MS) {
      irLastTrigger = now;
      Serial.println("SENSOR_TRIGGER");
    }
  }
  irLastState = irState;

  // ── 433MHz Remote (Remote 1) ────────────
  if (rf433.available()) {
    long code = rf433.getReceivedValue();
    rf433.resetAvailable();

    if (LEARN_MODE) {
      Serial.print("RF433 code: ");
      Serial.println(code);
    } else {
      if (code && inCodeList(code, REMOTE1_CODES)) {
        if (now - rfLastTrigger > RF_DEBOUNCE_MS) {
          rfLastTrigger = now;
          Serial.println("REMOTE1_PLAY");
        }
      }
    }
  }

  // ── 315MHz Remote (Remote 2) ────────────
  if (rf315.available()) {
    long code = rf315.getReceivedValue();
    rf315.resetAvailable();

    if (LEARN_MODE) {
      Serial.print("RF315 code: ");
      Serial.println(code);
    } else {
      if (code && inCodeList(code, REMOTE2_CODES)) {
        if (now - rfLastTrigger > RF_DEBOUNCE_MS) {
          rfLastTrigger = now;
          Serial.println("REMOTE2_PLAY");
        }
      }
    }
  }
}
