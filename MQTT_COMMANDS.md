# ESP32 Smart Home - MQTT Control Commands

**Broker:** `mqtts://6ceea111b6144c71a57b21faa3553fc6.s1.eu.hivemq.cloud:8883`  
**Command Topic:** `SmartHome/esp_01/command`  
**Username:** `SmartHome`  
**Password:** `SmartHome01`  

---

## 📋 Command Format

Tất cả lệnh phải được gửi dưới dạng JSON đến topic `SmartHome/esp_01/command`:

```json
{
    "id": "unique_id",
    "command": "command_name",
    "params": { /* parameters */ }
}
```

**Ví dụ gửi bằng mosquitto_pub:**
```bash
mosquitto_pub -h 6ceea111b6144c71a57b21faa3553fc6.s1.eu.hivemq.cloud \
  -p 8883 \
  -u SmartHome \
  -P SmartHome01 \
  -t SmartHome/esp_01/command \
  --cafile path/to/ca.pem \
  -V mqttv311 \
  -m '{"id":"001","command":"set_device","params":{"device":"fan","state":1}}'
```

---

## 🎮 Available Commands

### 1️⃣ **set_device** - Điều khiển 1 thiết bị

**Mô tả:** Bật/tắt một thiết bị duy nhất (fan, light, hoặc ac)

**JSON Format:**
```json
{
    "id": "unique_id",
    "command": "set_device",
    "params": {
        "device": "fan|light|ac",
        "state": 0|1
    }
}
```

**Ví dụ:**
```json
{
    "id": "cmd_001",
    "command": "set_device",
    "params": {
        "device": "fan",
        "state": 1
    }
}
```

**Các device hỗ trợ:**
- `"fan"` - Quạt
- `"light"` - Đèn
- `"ac"` - Điều hòa

**State:**
- `0` - OFF
- `1` - ON

---

### 2️⃣ **set_devices** - Điều khiển nhiều thiết bị

**Mô tả:** Bật/tắt nhiều thiết bị cùng lúc

**JSON Format:**
```json
{
    "id": "unique_id",
    "command": "set_devices",
    "params": {
        "fan": 0|1|-1,
        "light": 0|1|-1,
        "ac": 0|1|-1
    }
}
```

**Ví dụ:** Tắt quạt, bật đèn, không thay đổi AC
```json
{
    "id": "cmd_002",
    "command": "set_devices",
    "params": {
        "fan": 0,
        "light": 1,
        "ac": -1
    }
}
```

**State:**
- `0` - OFF
- `1` - ON
- `-1` - Không thay đổi (skip)

---

### 3️⃣ **set_mode** - Đặt chế độ hoạt động

**Mô tả:** Thiết lập chế độ toàn hệ thống

**JSON Format:**
```json
{
    "id": "unique_id",
    "command": "set_mode",
    "params": {
        "mode": 0|1
    }
}
```

**Ví dụ:**
```json
{
    "id": "cmd_003",
    "command": "set_mode",
    "params": {
        "mode": 1
    }
}
```

**Mode:**
- `0` - OFF (Tắt hệ thống)
- `1` - ON (Bật hệ thống)

---

### 4️⃣ **set_interval** - Thay đổi chu kỳ đọc sensor

**Mô tả:** Đặt khoảng thời gian giữa các lần đọc sensor (tính bằng giây)

**JSON Format:**
```json
{
    "id": "unique_id",
    "command": "set_interval",
    "params": {
        "interval": 5
    }
}
```

**Ví dụ:** Đặt chu kỳ đọc sensor mỗi 10 giây
```json
{
    "id": "cmd_004",
    "command": "set_interval",
    "params": {
        "interval": 10
    }
}
```

**Điều kiện:**
- Giá trị phải từ **5 đến 3600 giây**
- Mặc định: **5 giây**
- Nếu giá trị ngoài phạm vi → lỗi, không thay đổi

---

### 5️⃣ **get_status** - Lấy trạng thái hiện tại

**Mô tả:** Yêu cầu ESP32 gửi lại tất cả thông tin trạng thái

**JSON Format:**
```json
{
    "id": "unique_id",
    "command": "get_status",
    "params": {}
}
```

**Ví dụ:**
```json
{
    "id": "cmd_005",
    "command": "get_status",
    "params": {}
}
```

**Response:** ESP32 sẽ publish:
- `/data` - Sensor readings (nhiệt độ, độ ẩm, ánh sáng)
- `/state` - Trạng thái thiết bị (mode, fan, light, ac, interval)
- `/info` - Thông tin hệ thống (firmware, IP, SSID)

---

### 6️⃣ **reboot** - Khởi động lại ESP32

**Mô tả:** Khởi động lại toàn bộ hệ thống (sau 2 giây)

**JSON Format:**
```json
{
    "id": "unique_id",
    "command": "reboot",
    "params": {}
}
```

**Ví dụ:**
```json
{
    "id": "cmd_006",
    "command": "reboot",
    "params": {}
}
```

**Lưu ý:** Thiết bị sẽ khởi động lại sau 2 giây

---

### 7️⃣ **factory_reset** - Reset về cài đặt gốc

**Mô tả:** Xóa tất cả dữ liệu NVS (Non-Volatile Storage) và khởi động lại

**JSON Format:**
```json
{
    "id": "unique_id",
    "command": "factory_reset",
    "params": {}
}
```

**Ví dụ:**
```json
{
    "id": "cmd_007",
    "command": "factory_reset",
    "params": {}
}
```

**Lưu ý:**
- ⚠️ **Sẽ XÓA tất cả cài đặt**
- Thiết bị sẽ khởi động lại sau 2 giây
- Sau reset, cần cấu hình lại WiFi

---

## 📤 Topics Nhận dữ liệu (Subscribe)

### Topic: `SmartHome/esp_01/data` (QoS=0)
**Nội dung:** Dữ liệu sensor (đọc mỗi 5 giây theo mặc định)
```json
{
    "timestamp": 946690040,
    "temperature": 30.86,
    "humidity": 62.32,
    "light": 225
}
```

### Topic: `SmartHome/esp_01/state` (QoS=1, Retain)
**Nội dung:** Trạng thái hiện tại (backup mỗi 60 giây)
```json
{
    "timestamp": 946690040,
    "mode": 1,
    "interval": 5,
    "fan": 0,
    "light": 1,
    "ac": 1
}
```

### Topic: `SmartHome/esp_01/info` (QoS=1, Retain)
**Nội dung:** Thông tin hệ thống (gửi khi kết nối + thay đổi mạng)
```json
{
    "timestamp": 946690040,
    "id": "esp_01",
    "ssid": "Your_WiFi_SSID",
    "ip": "192.168.1.22",
    "broker": "mqtts://6ceea111b6144c71a57b21faa3553fc6.s1.eu.hivemq.cloud:8883",
    "firmware": "1.0.0"
}
```

---

## 💡 Ví dụ Thực Tế

### Ví dụ 1: Bật quạt
```bash
mosquitto_pub -h 6ceea111b6144c71a57b21faa3553fc6.s1.eu.hivemq.cloud \
  -p 8883 -u SmartHome -P SmartHome01 -t SmartHome/esp_01/command \
  --cafile ca.pem -V mqttv311 \
  -m '{"id":"001","command":"set_device","params":{"device":"fan","state":1}}'
```

### Ví dụ 2: Tắt đèn và AC
```bash
mosquitto_pub -h 6ceea111b6144c71a57b21faa3553fc6.s1.eu.hivemq.cloud \
  -p 8883 -u SmartHome -P SmartHome01 -t SmartHome/esp_01/command \
  --cafile ca.pem -V mqttv311 \
  -m '{"id":"002","command":"set_devices","params":{"fan":-1,"light":0,"ac":0}}'
```

### Ví dụ 3: Đặt chu kỳ đọc sensor mỗi 30 giây
```bash
mosquitto_pub -h 6ceea111b6144c71a57b21faa3553fc6.s1.eu.hivemq.cloud \
  -p 8883 -u SmartHome -P SmartHome01 -t SmartHome/esp_01/command \
  --cafile ca.pem -V mqttv311 \
  -m '{"id":"003","command":"set_interval","params":{"interval":30}}'
```

### Ví dụ 4: Lấy tất cả trạng thái
```bash
mosquitto_pub -h 6ceea111b6144c71a57b21faa3553fc6.s1.eu.hivemq.cloud \
  -p 8883 -u SmartHome -P SmartHome01 -t SmartHome/esp_01/command \
  --cafile ca.pem -V mqttv311 \
  -m '{"id":"004","command":"get_status","params":{}}'
```

---

## 📝 Quy tắc Chung

| Thành phần | Chi tiết |
|-----------|---------|
| **id** | Mã lệnh duy nhất (string, tùy ý). Dùng để tracking |
| **command** | Tên lệnh phải chính xác (case-sensitive) |
| **params** | Object chứa tham số (có thể để trống `{}`) |
| **Topic** | Luôn là `SmartHome/esp_01/command` |
| **QoS** | Tự động 1 (at-least-once delivery) |

---

## ✅ Kiểm tra Kết nối

Để kiểm tra kết nối MQTT hoạt động:

```bash
# Subscribe đến tất cả topics
mosquitto_sub -h 6ceea111b6144c71a57b21faa3553fc6.s1.eu.hivemq.cloud \
  -p 8883 -u SmartHome -P SmartHome01 \
  -t "SmartHome/esp_01/#" \
  --cafile ca.pem \
  -V mqttv311 \
  -v
```

Bạn sẽ thấy:
- `/data` - Sensor data mỗi 5 giây
- `/state` - State backup mỗi 60 giây
- `/info` - Thông tin hệ thống khi kết nối
