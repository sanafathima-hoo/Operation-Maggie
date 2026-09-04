<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />



# Operation Maggi (Maggi Bowl Guard) 🍜🎯


## Basic Details
### Team Name: [Insert Team Name]


### Team Members
- Team Lead: Sana Fathima A - [College]
- Member 2: Nidhi - [College]
- Member 3: [Name] - [College]

### Project Description
An AI-powered, hardware-integrated security terminal designed to protect the most valuable asset in any household: a bowl of Maggi noodles. It uses IR motion detection, real-time facial recognition, and a hardware alarm system to aggressively deter noodle thieves.

### The Problem (that doesn't exist)
You made the perfect bowl of Maggi. You turn around for two seconds to grab a fork, and suddenly your siblings/roommates are hovering around it. The threat of unauthorized Maggi consumption is at an all-time high!

### The Solution (that nobody asked for)
The Maggi Bowl Guard! We hooked up an IR sensor to an Arduino to create an invisible, high-security perimeter around the bowl. When motion is detected, it triggers a web interface that activates a webcam and uses Neural Networks (`face-api.js`) to scan the intruder's face. If it's you, access is granted. If it's an intruder, a laser targets them, a buzzer blares, and they are forced to enter an override password. 3 wrong attempts triggers a full-blown siren!

## Technical Details
### Technologies/Components Used
For Software:
- **Languages:** Python (Backend), HTML, CSS, JavaScript (Frontend)
- **Frameworks:** Flask
- **Libraries:** `pyserial`, `face-api.js` (TensorFlow.js), `numpy`, `sqlite3`
- **Tools:** Server-Sent Events (SSE) for real-time hardware-to-browser communication

For Hardware:
- **Main components:** Arduino UNO, IR Obstacle Sensor, Buzzer, Laser Diode Module.
- **Specifications:** 9600 Baud Rate Serial Communication via USB (COM Port).
- **Tools required:** Arduino IDE, Jumper wires, Breadboard.

### Implementation
For Software:
# Installation
```bash
pip install -r requirements.txt
```

# Run
```bash
python app.py
```
Then navigate to `http://localhost:5000` in your browser.

### Project Documentation
For Software:

# Screenshots (Add at least 3)
![Screenshot1](Placeholder: Add screenshot of Standby mode)
*The idle standby screen waiting for an IR trigger.*

![Screenshot2](Placeholder: Add screenshot of Scanning mode)
*The system actively scanning an intruder's face.*

![Screenshot3](Placeholder: Add screenshot of Alarm/Intruder mode)
*The password override modal and alarm triggered.*

# Diagrams
![Workflow](Placeholder: Add your workflow/architecture diagram here)
*Workflow: IR Sensor -> Arduino -> Serial Port -> Python Flask -> SSE Stream -> Browser WebRTC Camera -> face-api.js -> Python Access Log.*

For Hardware:

# Schematic & Circuit
![Circuit](Placeholder: Add your circuit diagram here)
*Pin connections: IR Sensor on Pin 10, Laser on Pin 11, Buzzer on Pin 12.*

![Schematic](Placeholder: Add your schematic diagram here)
*Add caption explaining the schematic*

# Build Photos
![Components](Placeholder: Add photo of your Arduino, sensor, laser, buzzer)
*Arduino UNO, IR Sensor, Laser, and Buzzer.*

![Build](Placeholder: Add photos of build process here)
*Explain the build steps*

![Final](Placeholder: Add photo of final product guarding a bowl of Maggi)
*The Maggi Bowl Guard fully deployed.*

### Project Demo
# Video
[Add your demo video link here]
*Demonstrating the full flow from motion detection to facial recognition and alarm triggering.*

# Additional Demos
[Add any extra demo materials/links]

## Team Contributions
- Sana Fathima A: [Specific contributions]
- Nidhi: [Specific contributions]
- [Name 3]: [Specific contributions]

---
Made with ❤️ at TinkerHub Useless Projects 

![Static Badge](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)
![Static Badge](https://img.shields.io/badge/UselessProjects--26-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)
