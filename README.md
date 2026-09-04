
<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />



# Operation Maggi 


## Basic Details
### Team Name: [Null Characters]


### Team Members
- Member 1: Sana Fathima A - [MUTHOOT INSTITUTE OF SCIENCE AND TECHNOLOGY]
- Member 2: Nidhi Krishna T U - [[MUTHOOT INSTITUTE OF SCIENCE AND TECHNOLOGY]]
  

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
- **Main components:** Arduino UNO, IR Obstacle Sensor, Buzzer.
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
<img width="1891" height="871" alt="Screenshot 2026-09-04 074146" src="https://github.com/user-attachments/assets/96c79e07-cee9-45ff-a1f4-d8a0cd0e5c09" />


*The idle standby screen waiting for an IR trigger.*

![Screenshot2](Placeholder: Add screenshot of Scanning mode)

<img width="1886" height="950" alt="Screenshot 2026-09-04 074107" src="https://github.com/user-attachments/assets/7671a87f-55aa-4f8b-a082-d6bb6898dd29" />

*The system actively scanning an intruder's face.*

![Screenshot3](Placeholder: Add screenshot of Alarm/Intruder mode)
<img width="1917" height="852" alt="Screenshot 2026-09-04 074117" src="https://github.com/user-attachments/assets/9dc24fb5-3e5e-468e-921d-7d27ce3fa51f" />
*The password override modal and alarm triggered.*

# Diagrams
![Workflow](Placeholder: Add your workflow/architecture diagram here)
*Workflow: IR Sensor -> Arduino -> Serial Port -> Python Flask -> SSE Stream -> Browser WebRTC Camera -> face-api.js -> Python Access Log.*

For Hardware:
# Schematic & Circuit
<img width="867" height="1156" alt="WhatsApp Image 2026-09-04 at 08 38 42" src="https://github.com/user-attachments/assets/97063df5-2956-4890-9904-f92f122c6332" />

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
[https://drive.google.com/file/d/1kUQqfYaTs-0ToiqTA7mC0Lzi5rrlR68e/view?usp=drivesdk]
*Demonstrating the full flow from motion detection to facial recognition and alarm triggering.*

# Additional Demos
[Add any extra demo materials/links]

## Team Contributions
- Sana Fathima A: [Both hardware and software]
- Nidhi: [Both hardware and software]


---
Made with ❤️ at TinkerHub Useless Projects 

![Static Badge](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)
![Static Badge](https://img.shields.io/badge/UselessProjects--26-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)
