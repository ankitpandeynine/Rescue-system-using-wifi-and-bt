/*
 * ==============================================================================
 * RESQ-ATLAS: ESP32 Wi-Fi 3D Spatial Scanner & CSI Telemetry Firmware
 * ==============================================================================
 * High-performance Wi-Fi Channel State Information (CSI) collector and area
 * scanner for ESP32 / ESP32-WROOM boards.
 *
 * Grounded in IEEE 802.11bf WLAN sensing standards and Espressif ESP-CSI API.
 * Captures 64-subcarrier OFDM I/Q matrices and streams JSON telemetry over USB Serial.
 *
 * Supported Boards:
 *  - ESP32-WROOM-32 / ESP32-WROOM-32D / ESP32-WROOM-32U
 *  - ESP32-DevKitC (Silicon Labs CP2102 or CH340 USB-UART)
 *  - NodeMCU-32S
 *
 * Serial Baud: 115200 (Default) or 921600
 * ==============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include "esp_wifi.h"
#include "esp_wifi_types.h"
#include "esp_system.h"
#include "esp_event.h"
#include "nvs_flash.h"
#include <math.h>

#define NODE_ID "esp32_wroom_01"
#define DEFAULT_WIFI_CHANNEL 1
#define SERIAL_BAUD 115200
#define HEARTBEAT_INTERVAL_MS 3000

// Internal CSI tracking counters
static volatile uint32_t g_csi_packet_count = 0;
static volatile uint32_t g_seq_counter = 0;
static uint32_t g_last_heartbeat_ms = 0;
static uint8_t g_current_channel = DEFAULT_WIFI_CHANNEL;
static bool g_is_scanning_area = false;
static uint32_t g_last_channel_hop_ms = 0;

// Subcarrier buffer (64 OFDM subcarriers)
#define NUM_SUBCARRIERS 64
static float g_amplitudes[NUM_SUBCARRIERS];
static float g_phases[NUM_SUBCARRIERS];

// ESP-CSI Callback - invoked on each raw 802.11 PHY packet
void wifi_csi_rx_callback(void *ctx, wifi_csi_info_t *info) {
  if (!info || !info->buf || info->len <= 0) return;

  wifi_csi_data_t *csi_data = &info->dlen; // raw length
  int8_t *raw_buf = (int8_t *)info->buf;
  int raw_len = info->len;
  
  // Need at least 128 bytes (64 I/Q pairs for HT20 20MHz OFDM)
  if (raw_len < 128) return;

  g_csi_packet_count++;
  g_seq_counter++;

  int8_t rssi = info->rx_ctrl.rssi;
  uint8_t channel = info->rx_ctrl.channel;
  uint32_t ts = millis();

  // Extract 64 Subcarrier I/Q components:
  // Each subcarrier is stored as signed 8-bit [Imaginary, Real]
  for (int i = 0; i < NUM_SUBCARRIERS; i++) {
    int idx = i * 2;
    int8_t imag = raw_buf[idx];
    int8_t real = raw_buf[idx + 1];

    // Subcarrier Amplitude: sqrt(I^2 + Q^2)
    float amp = sqrtf((float)(real * real + imag * imag));
    // Subcarrier Phase in radians: atan2(Q, I)
    float phase = atan2f((float)imag, (float)real);

    g_amplitudes[i] = amp;
    g_phases[i] = phase;
  }

  // Format MAC string
  char mac_str[18] = "00:00:00:00:00:00";
  if (info->mac) {
    snprintf(mac_str, sizeof(mac_str), "%02x:%02x:%02x:%02x:%02x:%02x",
             info->mac[0], info->mac[1], info->mac[2],
             info->mac[3], info->mac[4], info->mac[5]);
  }

  // Stream JSON packet over USB Serial
  // Target format expected by ResQ-Atlas backend:
  Serial.print("{\"msg_type\":\"csi_sample\",\"node_id\":\"");
  Serial.print(NODE_ID);
  Serial.print("\",\"ts\":");
  Serial.print(ts);
  Serial.print(",\"rssi\":");
  Serial.print(rssi);
  Serial.print(",\"channel\":");
  Serial.print(channel);
  Serial.print(",\"mac\":\"");
  Serial.print(mac_str);
  Serial.print("\",\"raw_len\":");
  Serial.print(raw_len);
  Serial.print(",\"subcarriers\":");
  Serial.print(NUM_SUBCARRIERS);
  Serial.print(",\"seq\":");
  Serial.print(g_seq_counter);

  // Amplitudes array
  Serial.print(",\"amplitudes\":[");
  for (int i = 0; i < NUM_SUBCARRIERS; i++) {
    Serial.print(g_amplitudes[i], 1);
    if (i < NUM_SUBCARRIERS - 1) Serial.print(",");
  }
  Serial.print("]");

  // Phases array
  Serial.print(",\"phases\":[");
  for (int i = 0; i < NUM_SUBCARRIERS; i++) {
    Serial.print(g_phases[i], 2);
    if (i < NUM_SUBCARRIERS - 1) Serial.print(",");
  }
  Serial.println("]}");
}

void send_heartbeat() {
  uint32_t now = millis();
  uint32_t free_heap = esp_get_free_heap_size();
  uint32_t min_heap = esp_get_minimum_free_heap_size();

  Serial.print("{\"msg_type\":\"heartbeat\",\"node_id\":\"");
  Serial.print(NODE_ID);
  Serial.print("\",\"uptime_ms\":");
  Serial.print(now);
  Serial.print(",\"free_heap\":");
  Serial.print(free_heap);
  Serial.print(",\"min_free_heap\":");
  Serial.print(min_heap);
  Serial.print(",\"wifi_channel\":");
  Serial.print(g_current_channel);
  Serial.print(",\"csi_active\":true,\"csi_packet_count\":");
  Serial.print(g_csi_packet_count);
  Serial.println("}");
}

// Process incoming commands from ResQ-Atlas console over USB Serial
void handle_serial_commands() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();

  if (cmd.equalsIgnoreCase("SCAN_START")) {
    g_is_scanning_area = true;
    Serial.println("{\"msg_type\":\"ack\",\"action\":\"SCAN_START\",\"status\":\"OK\"}");
  } else if (cmd.equalsIgnoreCase("SCAN_STOP")) {
    g_is_scanning_area = false;
    Serial.println("{\"msg_type\":\"ack\",\"action\":\"SCAN_STOP\",\"status\":\"OK\"}");
  } else if (cmd.startsWith("SET_CHANNEL:")) {
    int ch = cmd.substring(12).toInt();
    if (ch >= 1 && ch <= 14) {
      g_current_channel = ch;
      esp_wifi_set_channel(g_current_channel, WIFI_SECOND_CHAN_NONE);
      Serial.print("{\"msg_type\":\"ack\",\"action\":\"SET_CHANNEL\",\"channel\":");
      Serial.print(ch);
      Serial.println(",\"status\":\"OK\"}");
    }
  } else if (cmd.equalsIgnoreCase("PING")) {
    send_heartbeat();
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(500);

  Serial.println("{\"msg_type\":\"boot\",\"node_id\":\"" NODE_ID "\",\"firmware\":\"ResQ-Atlas-v2.0\",\"status\":\"INITIALIZING\"}");

  // 1. Initialize NVS (required for Wi-Fi)
  esp_err_t ret = nvs_flash_init();
  if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    ret = nvs_flash_init();
  }
  ESP_ERROR_CHECK(ret);

  // 2. Initialize Wi-Fi in Station Mode with Promiscuous Sniffing
  tcpip_adapter_init();
  wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&cfg));
  ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
  ESP_ERROR_CHECK(esp_wifi_start());
  ESP_ERROR_CHECK(esp_wifi_set_channel(g_current_channel, WIFI_SECOND_CHAN_NONE));

  // Enable promiscuous mode to capture raw PHY 802.11 frames from any device
  wifi_promiscuous_filter_t filter = {
    .filter_mask = WIFI_PROMIS_FILTER_MASK_MGMT | WIFI_PROMIS_FILTER_MASK_DATA
  };
  ESP_ERROR_CHECK(esp_wifi_set_promiscuous_filter(&filter));
  ESP_ERROR_CHECK(esp_wifi_set_promiscuous(true));

  // 3. Configure ESP-CSI
  wifi_csi_config_t csi_config = {
    .lltf_en = 1,
    .htltf_en = 1,
    .stbc_htltf2_en = 1,
    .ltf_merge_en = 1,
    .channel_filter_en = 0,
    .manu_scale = 0,
  };
  ESP_ERROR_CHECK(esp_wifi_set_csi_config(&csi_config));
  ESP_ERROR_CHECK(esp_wifi_set_csi_rx_cb(wifi_csi_rx_callback, NULL));
  ESP_ERROR_CHECK(esp_wifi_set_csi(true));

  Serial.println("{\"msg_type\":\"boot\",\"node_id\":\"" NODE_ID "\",\"status\":\"CSI_STREAMING_READY\"}");
  send_heartbeat();
}

void loop() {
  uint32_t now = millis();

  // Handle serial command input
  handle_serial_commands();

  // Send periodic heartbeat telemetry
  if (now - g_last_heartbeat_ms >= HEARTBEAT_INTERVAL_MS) {
    g_last_heartbeat_ms = now;
    send_heartbeat();
  }

  // If in active Area Scan mode, sweep channels 1, 6, 11 periodically
  if (g_is_scanning_area && (now - g_last_channel_hop_ms >= 1200)) {
    g_last_channel_hop_ms = now;
    if (g_current_channel == 1) g_current_channel = 6;
    else if (g_current_channel == 6) g_current_channel = 11;
    else g_current_channel = 1;
    esp_wifi_set_channel(g_current_channel, WIFI_SECOND_CHAN_NONE);
  }

  delay(5);
}
