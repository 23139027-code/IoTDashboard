// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// 1. Cấu hình mặc định (Dùng khi chưa cài đặt gì cả)
const defaultConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: "",
    databaseURL: ""
};

// 2. Thử lấy cấu hình từ LocalStorage (Do người dùng cài đặt)
const savedConfigString = localStorage.getItem('user_firebase_config');
let finalConfig = defaultConfig;

if (savedConfigString) {
    try {
        finalConfig = JSON.parse(savedConfigString);
        console.log("Đang sử dụng cấu hình từ Cài đặt người dùng.");
    } catch (e) {
        console.error("Lỗi đọc cấu hình, dùng mặc định.");
    }
}

// 3. Khởi tạo Firebase với cấu hình cuối cùng (an toàn hơn)
let app = null;
let auth = null;
let db = null;

// Nếu không có apiKey, bỏ qua khởi tạo và ghi cảnh báo — tránh ném lỗi không rõ
if (finalConfig && finalConfig.apiKey) {
    try {
        app = initializeApp(finalConfig);
        auth = getAuth(app);
        db = getDatabase(app);
        console.log('Firebase initialized with user config.');
    } catch (e) {
        console.error('Lỗi khi khởi tạo Firebase:', e);
        // Giữ auth/db là null để phần còn lại của app có thể kiểm tra
    }
} else {
    console.warn('Firebase config thiếu (apiKey). Firebase chưa được khởi tạo. Vui lòng cấu hình trong giao diện.');
}

export { auth, db };