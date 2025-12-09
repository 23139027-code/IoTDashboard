// auth.js - Chỉ chứa các hàm xử lý xác thực
import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Hàm kiểm tra đăng nhập (Dùng cho Dashboard)
export function requireAuth() {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            console.log("Chưa đăng nhập, quay về login...");
            window.location.href = "login.html";
        } else {
            console.log("User hiện tại:", user.email);
            // Có thể hiển thị tên user lên góc màn hình nếu muốn
            const userInfo = document.getElementById('user-email-display');
            if(userInfo) userInfo.textContent = user.email;
        }
    });
}

// Hàm đăng xuất
export function logout() {
    return signOut(auth).then(() => {
        console.log("Đã đăng xuất");
    }).catch((error) => {
        console.error("Lỗi đăng xuất:", error);
    });
}