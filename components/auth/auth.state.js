const AuthState = {
    setUser(data) {
      localStorage.setItem("visionUser", JSON.stringify(data));
    },
  
    getUser() {
      const u = localStorage.getItem("visionUser");
      return u ? JSON.parse(u) : null;
    },
  
    logout() {
      localStorage.removeItem("visionUser");
      window.router.loadPage("components/auth/auth.html");
    }
  };
  