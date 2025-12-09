// script.js
import { db, auth } from './firebase-config.js'; // Import cấu hình chung
import { requireAuth, logout } from './auth.js'; // Import hàm tiện ích
import { ref, onValue, set, update, get, push, remove, query, limitToLast, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- 1. KHAI BÁO BIẾN TOÀN CỤC (BẮT BUỘC) ---
let myChartInstance = null;      // Biến giữ biểu đồ
let currentChartType = null;     // Loại biểu đồ đang chọn
let currentReportDeviceId = null; // ID thiết bị đang xem báo cáo
// Biến lưu dữ liệu lịch sử để vẽ
let cachedHistoryData = { labels: [], temps: [], humids: [], lights: [] };
// 1. Kiểm tra Login ngay lập tức
requireAuth();

// --- CẤU HÌNH MQTT ---
const mqttConfig = {
    host: "broker.emqx.io",
    port: 8083,
    path: "/mqtt",
    clientId: "WebDashboard_" + Math.random().toString(16).substr(2, 8)
};
let mqttClient;

document.addEventListener('DOMContentLoaded', () => {
    // 2. Gán sự kiện Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if(confirm("Bạn có chắc muốn đăng xuất?")) {
                logout().then(() => window.location.href = 'login.html');
            }
        });
    }

    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    const toggleBtn = document.getElementById('sidebar-toggle');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            // Toggle class 'collapsed' cho sidebar
            sidebar.classList.toggle('collapsed');
            
            // Toggle class 'expanded' cho nội dung chính
            mainContent.classList.toggle('expanded');
        });
    }

    // Kết nối Firebase & MQTT
    updateStatus('db-status', 'warning', 'Firebase: Connecting...');
    initFirebaseApp();
    connectMQTT();

    // Setup các chức năng khác
    setupModal();
    setupEditModal();
    setupMasterSwitch();
});
//--- Kiểm tra kết nối Firebase để cập nhật trạng thái ---
function monitorConnection() {
    const statusBadge = document.getElementById('db-status');
    // .info/connected là đường dẫn đặc biệt của Firebase để check kết nối
    const connectedRef = ref(db, ".info/connected");
    
    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            statusBadge.textContent = "Firebase: Connected";
            statusBadge.className = "badge success"; // Màu xanh
        } else {
            statusBadge.textContent = "Firebase: Disconnected";
            statusBadge.className = "badge error";   // Màu đỏ
        }
    });
}

// --- CÁC HÀM MQTT ---
function connectMQTT() {
    try {
        mqttClient = new Paho.MQTT.Client(mqttConfig.host, mqttConfig.port, mqttConfig.path, mqttConfig.clientId);
        mqttClient.onConnectionLost = (obj) => {
            console.log("MQTT Lost:", obj.errorMessage);
            updateStatus('mqtt-status', 'error', 'MQTT: Lost');
        };
        mqttClient.connect({
            onSuccess: () => {
                console.log("MQTT Connected");
                updateStatus('mqtt-status', 'success', 'MQTT: Connected');
            },
            onFailure: (e) => {
                console.log("MQTT Fail", e);
                updateStatus('mqtt-status', 'error', 'MQTT: Failed');
            },
            useSSL: false
        });
    } catch (e) {
        console.error("Lỗi khởi tạo MQTT:", e);
    }
}

function sendCommand(deviceId, cmd, val = "") {
    if (!mqttClient || !mqttClient.isConnected()) {
        alert("Chưa kết nối MQTT!");
        return;
    }
    const topic = `DATALOGGER/${deviceId}/CMD`;
    const payload = JSON.stringify({ cmd: cmd, val: val });
    const message = new Paho.MQTT.Message(payload);
    message.destinationName = topic;
    mqttClient.send(message);
    console.log(`Sent: ${payload}`);
}

// --- CÁC HÀM FIREBASE ---
function initFirebaseApp() {
    const devicesRef = ref(db, 'devices');
    onValue(devicesRef, (snapshot) => {
        updateStatus('db-status', 'success', 'Firebase: Connected');
        const data = snapshot.val();
        renderGrid(data || {}); // Xử lý trường hợp data null
    });
}

// Hàm render 
function renderGrid(data) {
    const grid = document.getElementById('device-grid');
    const addBtn = document.getElementById('btn-open-modal');
    
    // Xóa card cũ, giữ lại nút Add
    const cards = grid.querySelectorAll('.card:not(#btn-open-modal)');
    cards.forEach(card => card.remove());

    Object.keys(data).forEach(deviceId => {
        const device = data[deviceId];
        if (!device.name) return;
        
        const card = document.createElement('div');
        card.className = 'card';
        
        // 1. Xác định trạng thái
        const isActive = device.active; // true hoặc false
        const statusColor = isActive ? '#10b981' : '#9ca3af'; // Xanh hoặc Xám
        
        // Luôn hiện "Đang đo" nếu active = true, ngược lại là "Đã tắt"
        const statusText = isActive 
            ? `Đang đo (${device.interval || 30}s)` 
            : 'Đã tắt';

        // 2. KHAI BÁO BIẾN CHO NÚT NGUỒN (Đây là phần bạn bị thiếu)
        const powerIcon = isActive ? '<i class="fa-solid fa-power-off"></i> Tắt' : '<i class="fa-solid fa-play"></i> Bật';
        const powerClass = isActive ? 'btn-warning' : 'btn-success'; 

        // 3. Render HTML
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <div class="card-title">${device.name}</div>
                    <span class="device-id">${deviceId}</span>
                </div>
                <i class="fa-solid fa-microchip" style="color: #6b7280"></i>
            </div>
            <div style="margin-bottom: 10px;">
                <span class="status-dot" style="background:${statusColor}"></span>
                <span class="status-text" style="color:${statusColor}">${statusText}</span>
            </div>
            <div class="metrics">
                <div class="metric-item">
                    <span class="metric-label">NHIỆT ĐỘ</span>
                    <span class="metric-value">${device.temp || '--'}°C</span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">ĐỘ ẨM</span>
                    <span class="metric-value">${device.humid || '--'}%</span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">ÁNH SÁNG</span>
                    <span class="metric-value">${device.light || '--'} Lux</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn-sm" onclick="window.triggerEdit('${deviceId}', '${device.name}', ${device.interval || 30})">Sửa</button>
                
                <button class="btn-sm ${powerClass}" onclick="window.toggleDevice('${deviceId}', ${isActive})">
                    ${powerIcon}
                </button>
            </div>
        `;
        grid.insertBefore(card, addBtn);
    });
}

// --- HÀM XỬ LÝ SỬA & XÓA ---
let currentEditId = null;
// 1. Hàm được gọi khi nhấn nút "Sửa" trên Card
window.triggerEdit = (id, currentName, currentInterval) => {
    currentEditId = id; // Lưu ID vào biến toàn cục
    
    // Điền dữ liệu cũ vào form
    document.getElementById('edit-dev-id').value = id;
    document.getElementById('edit-dev-name').value = currentName;
    document.getElementById('edit-dev-interval').value = currentInterval;

    // Hiện Modal Sửa
    document.getElementById('edit-modal').style.display = 'block';
};


// Setup logic cho Modal Sửa (gọi hàm này trong DOMContentLoaded)
function setupEditModal() {
    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-form');
    const closeBtn = document.querySelector('.closeBtn');
    const deleteBtn = document.getElementById('btn-delete-device');

    // Đóng modal khi nhấn X
    if (closeBtn) {
        closeBtn.onclick = () => {
            editModal.style.display = "none";
            currentEditId = null;
        };
    }

    // Xử lý LƯU (Cập nhật tên)
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = document.getElementById('edit-dev-name').value;
            const newInterval = parseInt(document.getElementById('edit-dev-interval').value);
            
            if (currentEditId && newName && newInterval) {
                try {
                    // Cập nhật lên Firebase
                    await update(ref(db, `devices/${currentEditId}`), { 
                        name: newName,
                        interval: newInterval
                    });
                    alert("Cập nhật thành công!");
                    editModal.style.display = "none";
                } catch (err) {
                    alert("Lỗi cập nhật: " + err.message);
                }
            }
        });
    }

    // Xử lý XÓA (Xóa khỏi Firebase)
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (!currentEditId) return;

            const confirmMsg = `CẢNH BÁO: Bạn có chắc chắn muốn xóa thiết bị [${currentEditId}]?\nDữ liệu sẽ bị xóa VĨNH VIỄN khỏi hệ thống.`;
            if (confirm(confirmMsg)) {
                try {
                    // Xóa node trên Firebase
                    await remove(ref(db, `devices/${currentEditId}`));
                    
                    alert("Đã xóa thiết bị thành công!");
                    editModal.style.display = "none";
                    currentEditId = null; 
                    // UI sẽ tự cập nhật nhờ hàm onValue lắng nghe Firebase
                } catch (err) {
                    alert("Lỗi xóa: " + err.message);
                }
            }
        });
    }

    // Đóng modal khi click ra ngoài vùng trắng
    window.addEventListener('click', (e) => {
        if (e.target == editModal) {
            editModal.style.display = "none";
        }
    });
}


// --- MODAL & SWITCH ---
function setupModal() {
    const modal = document.getElementById('add-modal');
    const btn = document.getElementById('btn-open-modal');
    const span = document.querySelector('.close');
    const form = document.getElementById('add-form');


    if(btn) btn.onclick = () => modal.style.display = "block";
    if(span) span.onclick = () => modal.style.display = "none";
    window.onclick = (e) => { if(e.target == modal) modal.style.display = "none"; }

    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('dev-name').value;
            const id = document.getElementById('dev-id').value;
            // Lấy giá trị chu kỳ từ form thêm mới
            const interval = parseInt(document.getElementById('dev-interval').value) || 30;

            const deviceConfig = {
                name: name,
                active: true,
                mode: 'periodic', // Mặc định là chế độ tự động đo
                interval: interval // Lưu chu kỳ vào Firebase
            };
            
            try {
                // Khi lưu vào Firebase, simulator (ESP32) sẽ tự đọc được nếu nó lắng nghe realtime
                await update(ref(db, `devices/${id}`), deviceConfig);
                alert("Thêm thiết bị thành công!");
                modal.style.display = "none";
                form.reset();
            } catch(err) {
                alert("Lỗi: " + err.message);
            }
        });
    }
}

function setupMasterSwitch() {
    const btn = document.getElementById('master-switch');
    if(!btn) return;

    // 1. Xử lý khi nhấn nút
    btn.addEventListener('click', async () => {
        // Kiểm tra xem nút đang ở trạng thái nào (dựa vào class)
        // Nếu đang có class 'is-on' nghĩa là hệ thống đang chạy -> Cần TẮT (false)
        const isSystemRunning = btn.classList.contains('is-on');
        const targetState = !isSystemRunning; // Đảo ngược trạng thái mong muốn

        try {
            // Lấy danh sách tất cả thiết bị từ Firebase về
            const snapshot = await get(ref(db, 'devices'));
            
            if (snapshot.exists()) {
                const devices = snapshot.val();
                const updates = {};

                // Tạo lệnh update cho TẤT CẢ thiết bị
                Object.keys(devices).forEach(key => {
                    // Gom tất cả lệnh update vào 1 biến updates
                    updates[`devices/${key}/active`] = targetState;
                });

                // Gửi 1 lệnh duy nhất lên Firebase (Atomic Update)
                await update(ref(db), updates);

                // Cập nhật giao diện nút ngay lập tức
                updateMasterButtonUI(targetState);
                
                // Thông báo nhỏ
                // alert(targetState ? "Đã KÍCH HOẠT toàn bộ hệ thống!" : "Đã NGẮT toàn bộ hệ thống!");
            }
        } catch (err) {
            alert("Lỗi thao tác hệ thống: " + err.message);
        }
    });

    // 2. Hàm cập nhật giao diện nút Master
    function updateMasterButtonUI(isOn) {
        if(isOn) {
            // Trạng thái: Hệ thống đang BẬT -> Hiện nút để TẮT
            btn.className = 'master-btn is-on';
            btn.innerHTML = '<i class="fa-solid fa-power-off"></i> <span>TẮT TOÀN BỘ HỆ THỐNG</span>';
            btn.style.backgroundColor = '#dc2626'; // Đỏ
        } else {
            // Trạng thái: Hệ thống đang TẮT -> Hiện nút để BẬT LẠI
            btn.className = 'master-btn is-off';
            btn.innerHTML = '<i class="fa-solid fa-play"></i> <span>BẬT LẠI HỆ THỐNG</span>';
            btn.style.backgroundColor = '#10b981'; // Xanh lá
        }
    }

    // 3. (Tùy chọn) Kiểm tra trạng thái ban đầu khi tải trang
    // Đoạn này giúp nút hiển thị đúng trạng thái thực tế khi vừa vào web
    get(ref(db, 'devices')).then(snapshot => {
        if(snapshot.exists()) {
            const devices = snapshot.val();
            // Nếu tìm thấy ít nhất 1 thiết bị đang chạy -> Coi như hệ thống đang bật
            const isAnyOn = Object.values(devices).some(d => d.active === true);
            updateMasterButtonUI(isAnyOn);
        }
    });
}

function updateStatus(id, type, text) {
    const el = document.getElementById(id);
    if(el) {
        el.className = `badge ${type}`;
        el.innerText = text;
    }
}

// Hàm Bật/Tắt thiết bị từ xa
window.toggleDevice = async (id, currentStatus) => {
    try {
        // Đảo ngược trạng thái hiện tại (Đang bật -> tắt, Đang tắt -> bật)
        const newStatus = !currentStatus;
        
        // Tạo object chứa các thông tin cần cập nhật
        const updates = {
            active: newStatus
        };

        // LOGIC MỚI: Nếu hành động là TẮT NGUỒN (newStatus == false)
        // Thì ép tắt luôn toàn bộ các công tắc con
        if (newStatus === false) {
            updates.fan_active = false;    // Tắt quạt
            updates.lamp_active = false;   // Tắt đèn
        }

        // Gửi cập nhật lên Firebase
        await update(ref(db, `devices/${id}`), updates);
        
        // Giao diện (Checkbox) sẽ tự động cập nhật nhờ hàm onValue đang lắng nghe
    } catch (err) {
        alert("Lỗi cập nhật trạng thái: " + err.message);
    }
};

//  Hàm chuyển đổi Tab (Dashboard <-> Báo cáo)
window.switchTab = function(tabName) {
    const dashboardGrid = document.getElementById('device-grid');   
    const addBtn = document.getElementById('btn-open-modal');       
    const reportTitleView = document.getElementById('report-view'); 
    const reportList = document.getElementById('report-list');      
    const reportDetail = document.getElementById('report-detail');  
    const masterBtn = document.getElementById('master-switch');   
    const mainHeaderTitle = document.querySelector('header h1'); 
    const settingView = document.getElementById('setting-view'); 
    const exportView = document.getElementById('export-view');  

    document.querySelectorAll('.sidebar .menu a').forEach(a => a.classList.remove('active'));

    if (dashboardGrid) dashboardGrid.style.display = 'none';
    if (addBtn) addBtn.style.display = 'none';
    if (reportTitleView) reportTitleView.style.display = 'none';
    if (reportList) reportList.style.display = 'none';
    if (reportDetail) reportDetail.style.display = 'none';
    if (settingView) settingView.style.display = 'none';
    if (exportView) exportView.style.display = 'none';

    if (tabName === 'dashboard') {
        if (dashboardGrid) dashboardGrid.style.display = 'grid'; 
        if (addBtn) addBtn.style.display = 'block';              
        if (masterBtn) masterBtn.style.display = 'flex';         
        if (mainHeaderTitle) mainHeaderTitle.innerText = 'Quản lý các phòng';
        updateActiveMenu(0);

    } else if (tabName === 'report') {
        if (reportTitleView) reportTitleView.style.display = 'block';
        if (reportList) reportList.style.display = 'grid';     
        if (masterBtn) masterBtn.style.display = 'none';       
        if (mainHeaderTitle) mainHeaderTitle.innerText = 'Báo Cáo & Phân Tích';

        if (typeof renderReportList === 'function') renderReportList();

        updateActiveMenu(1);
    } else if (tabName === 'setting') {
        if (settingView) settingView.style.display = 'block';
        if (masterBtn) masterBtn.style.display = 'none';
        if (mainHeaderTitle) mainHeaderTitle.innerText = 'Cấu Hình Hệ Thống';

        loadSettingsToForm();
        updateActiveMenu(3);
    } else if (tabName === 'export') {
        if (exportView) exportView.style.display = 'block';
        if (masterBtn) masterBtn.style.display = 'none';
        if (mainHeaderTitle) mainHeaderTitle.innerText = 'Dữ Liệu Tổng Hợp';
        updateActiveMenu(2); 
    }
}

// Hàm phụ để đổi màu cho menu sidebar
function updateActiveMenu(index) {
    const links = document.querySelectorAll('.sidebar .menu a');
    links.forEach(link => link.classList.remove('active'));
    if (links[index]) links[index].classList.add('active');
}

// --- 3. LOGIC BIỂU ĐỒ & BÁO CÁO (QUAN TRỌNG) ---

// Render danh sách phòng ở trang Báo Cáo
async function renderReportList() {
    const grid = document.getElementById('report-list');
    if(!grid) return;
    grid.innerHTML = '<p style="color:#666">Đang tải dữ liệu...</p>';
    
    try {
        const snapshot = await get(ref(db, 'devices'));
        grid.innerHTML = ''; 

        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.keys(data).forEach(deviceId => {
                const device = data[deviceId];
                const div = document.createElement('div');
                div.className = 'report-card'; // Cần CSS cho class này (đã thêm ở bước trước)
                // CSS inline tạm thời để đảm bảo hiện
                
                div.innerHTML = `
                    <h3 style="margin-top:0">${device.name}</h3>
                    <p style="color:#666; font-size:0.9rem">ID: ${deviceId}</p>
                    <button class="btn-sm btn-primary" style="width:100%; margin-top:10px">Xem Chi Tiết</button>
                `;
                div.onclick = () => showChart(deviceId, device.name);
                grid.appendChild(div);
            });
        } else {
            grid.innerHTML = '<p>Chưa có thiết bị nào.</p>';
        }
    } catch (err) {
        console.error(err);
    }
}

// Hàm chọn loại biểu đồ (Gắn vào window để HTML gọi)
window.selectChartType = (type) => {
    console.log("Click chọn biểu đồ:", type);
    currentChartType = type;
    updateChartUIActive(type);
    drawChartNewLogic();
};

function updateChartUIActive(type) {
    const ids = ['btn-chart-temp', 'btn-chart-humid', 'btn-chart-light'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.remove('active-chart');
    });

    if (type === 'temp') document.getElementById('btn-chart-temp')?.classList.add('active-chart');
    if (type === 'humid') document.getElementById('btn-chart-humid')?.classList.add('active-chart');
    if (type === 'light') document.getElementById('btn-chart-light')?.classList.add('active-chart');
}

// Hàm hiển thị Chi tiết & Lấy dữ liệu
async function showChart(deviceId, deviceName) {
    console.log("Mở biểu đồ:", deviceName);
    currentReportDeviceId = deviceId;
    
    // 1. Reset & Chuẩn bị giao diện
    updateChartUIActive(null); // Reset nút bấm
    document.getElementById('report-detail').style.display = 'block';
    
    // Cập nhật tên phòng
    const title = document.getElementById('report-title'); // Hoặc id là 'chart-device-name' tùy HTML của bạn
    if(title) title.innerText = `Phòng: ${deviceName}`;
    
    // Cuộn xuống
    document.getElementById('report-detail').scrollIntoView({ behavior: 'smooth' });

    // 2. Tải lịch sử CŨ (Chỉ tải 1 lần duy nhất để làm nền)
    cachedHistoryData = { labels: [], temps: [], humids: [], lights: [] };
    
    try {
        const historyRef = query(ref(db, `history/${deviceId}`), limitToLast(20));
        const historySnapshot = await get(historyRef); // Dùng get thay vì onValue
        
        if (historySnapshot.exists()) {
            historySnapshot.forEach(child => {
                const val = child.val();
                const timeStr = new Date(val.last_update).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
                cachedHistoryData.labels.push(timeStr);
                cachedHistoryData.temps.push(val.temp);
                cachedHistoryData.humids.push(val.humid);
                cachedHistoryData.lights.push(val.light);
            });
        }
    } catch (e) {
        console.error("Lỗi tải lịch sử:", e);
    }

    // Vẽ biểu đồ lần đầu (với dữ liệu lịch sử vừa tải)
    drawChartNewLogic();

    // 3. LẮNG NGHE REALTIME (Quan trọng nhất)
    // Nghe đúng cái chỗ mà 3 ô số liệu đang nghe
    onValue(ref(db, `devices/${deviceId}`), (snapshot) => {
        const data = snapshot.val();
        if(!data) return;

        // --- A. Cập nhật giao diện 3 ô (Code cũ của bạn) ---
        // Nguồn
        const elPower = document.getElementById('detail-power-status');
        const elBoxPower = document.getElementById('stat-power-box');
        if(elPower && elBoxPower) {
            if(data.active) {
                elPower.innerText = "ĐANG BẬT"; elPower.style.color = "#10b981"; elBoxPower.style.borderLeftColor = "#10b981";
                elBoxPower.onclick = () => window.toggleDevice(deviceId, true);
            } else {
                elPower.innerText = "ĐÃ TẮT"; elPower.style.color = "#ef4444"; elBoxPower.style.borderLeftColor = "#ef4444";
                elBoxPower.onclick = () => window.toggleDevice(deviceId, false);
            }
        }
        // 3 thông số
        if(document.getElementById('detail-temp')) document.getElementById('detail-temp').innerText = (data.temp || '--') + ' °C';
        if(document.getElementById('detail-humid')) document.getElementById('detail-humid').innerText = (data.humid || '--') + ' %';
        if(document.getElementById('detail-light')) document.getElementById('detail-light').innerText = (data.light || '--') + ' Lux';
        
        // Switch
        if(document.getElementById('toggle-fan')) document.getElementById('toggle-fan').checked = (data.fan_active === true);
        if(document.getElementById('toggle-lamp')) document.getElementById('toggle-lamp').checked = (data.lamp_active === true);


        // --- B. CẬP NHẬT BIỂU ĐỒ (Phần thêm mới để fix lỗi) ---
        // Lấy giờ hiện tại
        const now = new Date();
        const timeLabel = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
        
        // Đẩy số liệu mới đang nhảy vào mảng biểu đồ
        cachedHistoryData.labels.push(timeLabel);
        cachedHistoryData.temps.push(data.temp || 0);
        cachedHistoryData.humids.push(data.humid || 0);
        cachedHistoryData.lights.push(data.light || 0);

        // Cắt bớt nếu dài quá (giữ 20 điểm)
        if (cachedHistoryData.labels.length > 20) {
            cachedHistoryData.labels.shift();
            cachedHistoryData.temps.shift();
            cachedHistoryData.humids.shift();
            cachedHistoryData.lights.shift();
        }

        // Gọi hàm cập nhật biểu đồ (Update nhẹ)
        updateChartRealtime();
    });
}

function updateChartRealtime() {
    // Nếu chưa có biểu đồ hoặc chưa chọn loại dữ liệu thì thôi
    if (!myChartInstance || !currentChartType) return;

    // Cập nhật trục thời gian
    myChartInstance.data.labels = cachedHistoryData.labels;

    // Cập nhật đường kẻ tùy theo tab đang chọn
    if (currentChartType === 'temp') {
        myChartInstance.data.datasets[0].data = cachedHistoryData.temps;
    } else if (currentChartType === 'humid') {
        myChartInstance.data.datasets[0].data = cachedHistoryData.humids;
    } else if (currentChartType === 'light') {
        myChartInstance.data.datasets[0].data = cachedHistoryData.lights;
    }

    // Vẽ lại (chế độ 'none' để không chạy lại animation từ đầu -> mượt)
    myChartInstance.update('none');
}


// Hàm vẽ biểu đồ (Safe Mode)
function drawChartNewLogic() {
    const canvas = document.getElementById('myChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Hủy biểu đồ cũ nếu có
    if (myChartInstance) {
        myChartInstance.destroy();
        myChartInstance = null;
    }

    let labelsToDraw = cachedHistoryData.labels;
    // Nếu chưa có dữ liệu nào thì tạo mảng rỗng để không lỗi
    if (!labelsToDraw || labelsToDraw.length === 0) {
        labelsToDraw = ["--", "--", "--", "--", "--"]; 
    }

    let dataToDraw = [];
    let labelText = "Chọn thông số";
    let color = "#ccc";
    let unit = "";

    // Nếu chưa chọn gì thì vẽ đường 0
    if (!currentChartType) {
        dataToDraw = new Array(labelsToDraw.length).fill(0);
    } else {
        // Lấy toàn bộ mảng lịch sử hiện có ra vẽ
        if (currentChartType === 'temp') {
            dataToDraw = cachedHistoryData.temps;
            labelText = "Nhiệt Độ (°C)"; color = "#f97316"; unit = "°C";
        } else if (currentChartType === 'humid') {
            dataToDraw = cachedHistoryData.humids;
            labelText = "Độ Ẩm (%)"; color = "#3b82f6"; unit = "%";
        } else if (currentChartType === 'light') {
            dataToDraw = cachedHistoryData.lights;
            labelText = "Ánh Sáng (Lux)"; color = "#eab308"; unit = " Lux";
        }
        
        // Fix lỗi nếu mảng data ngắn hơn mảng label (do mới khởi tạo)
        if (dataToDraw.length < labelsToDraw.length) {
            const diff = labelsToDraw.length - dataToDraw.length;
            for(let i=0; i<diff; i++) dataToDraw.push(0);
        }
    }

    myChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labelsToDraw,
            datasets: [{
                label: labelText,
                data: dataToDraw,
                borderColor: color,
                backgroundColor: color + "33",
                tension: 0.4,
                fill: true,
                pointRadius: currentChartType ? 4 : 0,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: !!unit, text: unit }
                },
                x: { display: false } // Ẩn trục X
            }
        }
    });
}

// Hàm xử lý 2 nút gạt Quick Control
window.toggleFeature = async (feature) => {
    if (!currentReportDeviceId) return;

    // Lấy trạng thái hiện tại của checkbox
    let isChecked = false;
    let dbKey = '';

    if (feature === 'fan') {
        isChecked = document.getElementById('toggle-fan').checked;
        dbKey = 'fan_active';
    } else if (feature === 'lamp') {
        isChecked = document.getElementById('toggle-lamp').checked;
        dbKey = 'lamp_active';
    }

    try {
        // Cập nhật lên Firebase
        await update(ref(db, `devices/${currentReportDeviceId}`), {
            [dbKey]: isChecked
        });
        // Không cần alert, switch sẽ tự giữ trạng thái
    } catch (err) {
        console.error("Lỗi toggle:", err);
        // Nếu lỗi thì trả lại trạng thái cũ cho checkbox
        document.getElementById(`toggle-${feature}`).checked = !isChecked; 
    }
};
window.closeReportDetail = () => {
    document.getElementById('report-detail').style.display = 'none';
};

// --- LOGIC XUẤT DỮ LIỆU (History Table) ---

window.fetchAllHistoryData = async function() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Đang tải dữ liệu từ Firebase...</td></tr>';

    try {
        // BƯỚC 1: Lấy danh sách thiết bị để biết ID nào tên là gì
        // (Vì trong history chỉ lưu ID chứ không lưu tên phòng)
        const devicesSnap = await get(ref(db, 'devices'));
        const devicesMap = {}; // Tạo từ điển: ID -> Tên Phòng
        
        if (devicesSnap.exists()) {
            const devices = devicesSnap.val();
            Object.keys(devices).forEach(key => {
                devicesMap[key] = devices[key].name;
            });
        }

        // BƯỚC 2: Lấy dữ liệu lịch sử
        // Lưu ý: Lấy toàn bộ history có thể rất nặng.
        // Ở đây tôi ví dụ lấy 50 dòng cuối của MỖI thiết bị để demo cho nhanh.
        
        let allRows = []; // Mảng chứa tất cả dòng dữ liệu

        // Duyệt qua từng ID thiết bị để lấy lịch sử
        const deviceIds = Object.keys(devicesMap);
        
        for (const devId of deviceIds) {
            const devName = devicesMap[devId];
            
            // Query lấy 50 dòng cuối cùng của thiết bị này
            const historyQuery = query(ref(db, `history/${devId}`), limitToLast(50));
            const historySnap = await get(historyQuery);

            if (historySnap.exists()) {
                historySnap.forEach(child => {
                    const val = child.val();
                    // Đẩy vào mảng chung
                    allRows.push({
                        room: devName,
                        time: val.last_update, // Giả sử bạn lưu time dạng timestamp hoặc ISO string
                        temp: val.temp,
                        humid: val.humid,
                        light: val.light
                    });
                });
            }
        }

        // BƯỚC 3: Sắp xếp lại theo thời gian (Mới nhất lên đầu)
        allRows.sort((a, b) => new Date(b.time) - new Date(a.time));

        // BƯỚC 4: Vẽ lên bảng
        tbody.innerHTML = '';
        if (allRows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Không tìm thấy dữ liệu lịch sử.</td></tr>';
            return;
        }

        allRows.forEach((row, index) => {
            // Format lại thời gian cho đẹp
            const dateObj = new Date(row.time);
            const timeStr = dateObj.toLocaleString('vi-VN');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td style="font-weight: 500; color: var(--primary-color)">${row.room}</td>
                <td>${timeStr}</td>
                <td>${row.temp} °C</td>
                <td>${row.humid} %</td>
                <td>${row.light} Lux</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Lỗi lấy dữ liệu:", error);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red">Lỗi: ${error.message}</td></tr>`;
    }
};

// Hàm phụ: Xuất ra Excel (Đơn giản)
window.exportTableToExcel = function() {
    const table = document.querySelector(".data-table");
    let html = table.outerHTML;
    
    // Tạo link tải về
    const url = 'data:application/vnd.ms-excel,' + escape(html); // Tạo Blob Excel
    const link = document.createElement("a");
    link.href = url;
    link.download = "Du_Lieu_IoT_" + new Date().toISOString().slice(0,10) + ".xls";
    link.click();
}

// --- LOGIC CÀI ĐẶT FIREBASE ---

// 1. Hàm lưu cấu hình khi bấm nút Save
window.saveFirebaseSettings = function(event) {
    event.preventDefault(); // Chặn load lại trang ngay lập tức
    
    const config = {
        apiKey: document.getElementById('cfg-apiKey').value.trim(),
        authDomain: document.getElementById('cfg-authDomain').value.trim(),
        databaseURL: document.getElementById('cfg-databaseURL').value.trim(),
        projectId: document.getElementById('cfg-projectId').value.trim(),
        storageBucket: document.getElementById('cfg-storageBucket').value.trim(),
        messagingSenderId: document.getElementById('cfg-messagingSenderId').value.trim(),
        appId: document.getElementById('cfg-appId').value.trim(),
        measurementId: document.getElementById('cfg-measurementId').value.trim()
    };

    // Lưu vào bộ nhớ trình duyệt
    localStorage.setItem('user_firebase_config', JSON.stringify(config));
    
    alert("Đã lưu cấu hình! Trang web sẽ tải lại để áp dụng.");
    location.reload(); // Tải lại trang để file firebase-config.js đọc dữ liệu mới
};

// 2. Hàm điền dữ liệu cũ vào form khi mở tab
function loadSettingsToForm() {
    const savedString = localStorage.getItem('user_firebase_config');
    if (savedString) {
        const config = JSON.parse(savedString);
        document.getElementById('cfg-apiKey').value = config.apiKey || '';
        document.getElementById('cfg-authDomain').value = config.authDomain || '';
        document.getElementById('cfg-databaseURL').value = config.databaseURL || '';
        document.getElementById('cfg-projectId').value = config.projectId || '';
        document.getElementById('cfg-storageBucket').value = config.storageBucket || '';
        document.getElementById('cfg-messagingSenderId').value = config.messagingSenderId || '';
        document.getElementById('cfg-appId').value = config.appId || '';
        document.getElementById('cfg-measurementId').value = config.measurementId || '';
    }
}

// 3. Hàm xóa cấu hình (Reset)
window.clearFirebaseSettings = function() {
    if (confirm("Bạn có chắc muốn xóa cấu hình và dùng lại mặc định?")) {
        localStorage.removeItem('user_firebase_config');
        location.reload();
    }
};

