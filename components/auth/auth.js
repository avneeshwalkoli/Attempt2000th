async function loginUser() {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
  
    if (!email || !password) {
      alert("Email or password missing!");
      return;
    }
  
    const result = await AuthAPI.login(email, password);
  
    if (result.success) {
      AuthState.setUser(result.data);
      window.router.loadPage("components/messaging/messaging.html");
    } else {
      alert(result.message);
    }
  }
  
  function showSignup() {
    window.router.loadPage("components/auth/signup.jsx");
  }
  