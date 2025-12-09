// login-logic.js - Code này chỉ chạy ở trang login.html
import { auth } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Lấy DOM
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const title = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const toggleBtn = document.getElementById('toggle-btn');
const errorMsg = document.getElementById('error-message');
const toggleMsg = document.getElementById('toggle-msg');

let isLoginMode = true;

// Kiểm tra nếu đã login thì vào dashboard luôn
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = "index.html";
    }
});

if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        errorMsg.style.display = 'none';

        if (isLoginMode) {
            title.textContent = "Đăng Nhập";
            submitBtn.textContent = "Đăng Nhập";
            confirmPasswordInput.style.display = "none";
            confirmPasswordInput.required = false;
            toggleMsg.textContent = "Chưa có tài khoản?";
            toggleBtn.textContent = "Đăng ký ngay";
        } else {
            title.textContent = "Đăng Ký Tài Khoản";
            submitBtn.textContent = "Đăng Ký";
            confirmPasswordInput.style.display = "block";
            confirmPasswordInput.required = true;
            toggleMsg.textContent = "Đã có tài khoản?";
            toggleBtn.textContent = "Đăng nhập ngay";
        }
    });
}

if (authForm) {
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = emailInput.value;
        const password = passwordInput.value;
        
        if (isLoginMode) {
            signInWithEmailAndPassword(auth, email, password)
                .catch((error) => showError(error));
        } else {
            if (password !== confirmPasswordInput.value) {
                showError({ message: "Mật khẩu xác nhận không khớp." });
                return;
            }
            createUserWithEmailAndPassword(auth, email, password)
                .then(() => {
                    alert("Đăng ký thành công!");
                })
                .catch((error) => showError(error));
        }
    });
}

function showError(error) {
    errorMsg.style.display = 'block';
    console.error(error.code);
    switch  (error.code) {
        case 'auth/invalid-email':
            errorMsg.textContent = "Email không hợp lệ.";
            break;
        case 'auth/user-not-found':
            errorMsg.textContent = "Không tìm thấy tài khoản.";
            break;
        case 'auth/user-disabled':
            errorMsg.textContent = "Tài khoản đã bị vô hiệu hóa.";
            break;
        case 'auth/user-not-found':
            errorMsg.textContent = "Không tìm thấy tài khoản.";
            break;
        case 'auth/wrong-password':
            errorMsg.textContent = "Mật khẩu không đúng.";
            break;
        case 'auth/email-already-in-use':
            errorMsg.textContent = "Email đã được sử dụng.";
            break;
        case 'auth/weak-password':
            errorMsg.textContent = "Mật khẩu quá yếu. Vui lòng chọn mật khẩu khác.";
            break;
        default:
            errorMsg.textContent = "Đã có lỗi xảy ra: " + error.message;
    }   
}