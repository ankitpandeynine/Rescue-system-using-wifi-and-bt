# ResQ-Atlas ESP32 CSI Firmware Guide

This firmware turns any standard **ESP32-WROOM** (DevKitC, NodeMCU-32S, or custom CP2102/CH340 board) into an autonomous **Wi-Fi 3D Spatial Scanner & CSI Telemetry Node**.

---

## Hardware Requirements

- **ESP32 Dev Board**: ESP32-WROOM-32 / ESP32-DevKitC / NodeMCU-32S
- **USB Cable**: Micro-USB or USB-C data cable connected to your PC / Laptop
- **USB-to-UART Driver**: Silicon Labs CP210x or QinHeng CH340 (usually pre-installed on modern OS)

---

## Flashing Instructions

### Method 1: Arduino IDE (Easiest)

1. **Install Arduino IDE** (v2.0 or newer).
2. Go to **File -> Preferences**, and add this URL to **Additional Boards Manager URLs**:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Go to **Tools -> Board -> Boards Manager**, search for `esp32` by Espressif Systems, and click **Install**.
4. Open `firmware/esp32_csi_scanner/esp32_csi_scanner.ino`.
5. Select your Board:
   - **Board**: `ESP32 Dev Module`
   - **Upload Speed**: `921600` (or `115200`)
   - **Flash Frequency**: `80MHz`
   - **Partition Scheme**: `Default 4MB with spiffs`
   - **Port**: Select your detected USB serial port (e.g. `COM11` on Windows, `/dev/tty.usbserial-*` on Mac/Linux)
6. Click **Upload** (hold the `BOOT` button on the ESP32 for 2 seconds if the upload doesn't start automatically).

---

### Method 2: PlatformIO

Add this to your `platformio.ini`:
```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200
upload_speed = 921600
```
Run:
```bash
pio run -t upload
```

---

## How It Works in 3D Scanning

1. The ESP32 listens in Wi-Fi promiscuous mode across 64 OFDM subcarriers ($20\text{ MHz}$ HT20 channel bandwidth).
2. For every incoming packet, the physical hardware I/Q registers compute:
   - **Subcarrier Amplitudes**: Constructive/destructive multipath interference.
   - **Subcarrier Phases**: Phase rotation from human chest breathing displacement and movement.
3. Streams formatted JSON packets over Serial at `115200` baud directly into the ResQ-Atlas physics engine (`server/index.mjs`).
4. Supports serial control commands from ResQ-Atlas:
   - `SCAN_START` — Initiates multi-channel scanning sweep ($1, 6, 11$).
   - `SCAN_STOP` — Locks back to designated channel.
   - `SET_CHANNEL:<n>` — Sets Wi-Fi channel.
