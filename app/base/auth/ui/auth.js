function initAuthView() {
  toggleAuthForm("login");
}

function toggleAuthForm(type) {
  if (typeof clearMsg === "function") clearMsg();
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const resetBox = document.getElementById("reset-form-box");

  if (loginForm) loginForm.classList.toggle("hidden", type !== "login");
  if (signupForm) signupForm.classList.toggle("hidden", type !== "signup");
  if (resetBox) resetBox.classList.toggle("hidden", type !== "reset");

  const btnLogin = document.getElementById("auth-tab-login");
  const btnSignup = document.getElementById("auth-tab-signup");
  const btnReset = document.getElementById("auth-tab-reset");
  if (btnLogin) btnLogin.className = type === "login" ? "" : "secondary";
  if (btnSignup) btnSignup.className = type === "signup" ? "" : "secondary";
  if (btnReset) btnReset.className = type === "reset" ? "" : "secondary";
}

function extractAuthApiError(data, fallback) {
  if (!data) return fallback;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail) && data.detail.length > 0) {
    return data.detail.map(e => e.msg || JSON.stringify(e)).join(" / ");
  }
  return fallback;
}

async function handleSignup(e) {
  e.preventDefault();
  if (typeof clearMsg === "function") clearMsg();

  const email = document.getElementById("signup-email").value.trim();
  const nickname = document.getElementById("signup-nickname").value.trim();
  const password = document.getElementById("signup-password").value;
  const password_confirm = document.getElementById("signup-password-confirm").value;

  if (password !== password_confirm) {
    return showMsg("비밀번호와 비밀번호 확인이 일치하지 않습니다.", true);
  }

  const res = await fetch("/api/v1/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      nickname,
      password,
      password_confirm
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(extractAuthApiError(data, "가입 실패"), true);

  document.getElementById("signup-form").reset();
  toggleAuthForm("login");
  document.getElementById("login-email").value = email;
  showMsg(data.message || "회원가입 완료! 로그인해 주세요.");
}

async function handleLogin(e) {
  e.preventDefault();
  if (typeof clearMsg === "function") clearMsg();

  const formData = new URLSearchParams();
  formData.append("username", document.getElementById("login-email").value.trim());
  formData.append("password", document.getElementById("login-password").value);

  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(extractAuthApiError(data, "로그인 실패"), true);

  localStorage.setItem("access_token", data.access_token);
  await checkCurrentUser();

  if (sessionStorage.getItem("kexam_guest_pending_result") && availableMenus.some(m => m.module_id === "korean_exam")) {
    await openModule("korean_exam");
  } else {
    await openToolsDirectory();
  }
  showMsg("로그인되었습니다.");
}

async function handleRequestPasswordReset(e) {
  e.preventDefault();
  if (typeof clearMsg === "function") clearMsg();

  const email = document.getElementById("reset-email").value.trim();
  const res = await fetch("/api/v1/auth/password-reset/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(extractAuthApiError(data, "인증 코드 발급 실패"), true);

  if (data.demo_code) {
    document.getElementById("reset-code").value = data.demo_code;
    showMsg(`${data.message} (인증코드: ${data.demo_code})`);
  } else {
    showMsg(data.message || "인증 코드가 발급되었습니다.");
  }
}

async function handleConfirmPasswordReset(e) {
  e.preventDefault();
  if (typeof clearMsg === "function") clearMsg();

  const email = document.getElementById("reset-email").value.trim();
  const reset_code = document.getElementById("reset-code").value.trim();
  const new_password = document.getElementById("reset-new-password").value;
  const new_password_confirm = document.getElementById("reset-new-password-confirm").value;

  if (new_password !== new_password_confirm) {
    return showMsg("새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.", true);
  }

  const res = await fetch("/api/v1/auth/password-reset/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      reset_code,
      new_password,
      new_password_confirm
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(extractAuthApiError(data, "비밀번호 재설정 실패"), true);

  toggleAuthForm("login");
  document.getElementById("login-email").value = email;
  showMsg(data.message || "비밀번호가 재설정되었습니다.");
}