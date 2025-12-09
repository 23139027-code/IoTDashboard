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

// 3. Khởi tạo Firebase với cấu hình cuối cùng
const app = initializeApp(finalConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export { auth, db };