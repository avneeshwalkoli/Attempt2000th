const AuthAPI = {
    async login(email, password) {
      try {
        const res = await fetch("http://localhost:5000/auth/login", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ email, password })
        });
  
        return await res.json();
      } catch (err) {
        return { success: false, message: "Server not responding" };
      }
    },
  
    async signup(name, email, password) {
      try {
        const res = await fetch("http://localhost:5000/auth/signup", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ name, email, password })
        });
  
        return await res.json();
      } catch (err) {
        return { success: false, message: "Server error" };
      }
    }
  };
  