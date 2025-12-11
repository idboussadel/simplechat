const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface LoginData {
  email: string;
  password: string;
  keep_me_logged_in?: boolean;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
}

interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface UserResponse {
  uuid: string;
  username: string;
  email: string;
  is_active: boolean;
  plan_id: number | null;
  message_credits_remaining: number | null;
  credits_reset_date: string | null;
  subscription_status: string;
  user_type: string;
  created_at: string;
}

export const authService = {
  async register(data: RegisterData): Promise<UserResponse> {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include", // Enable cookies
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Registration failed");
    }

    return response.json();
  },

  async login(
    data: LoginData,
    keepLoggedIn: boolean = false
  ): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include", // Enable cookies
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        keep_me_logged_in: keepLoggedIn,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Login failed");
    }

    const authData = await response.json();

    // Store token in httpOnly cookie (more secure than localStorage)
    document.cookie = `access_token=${authData.access_token}; path=/; max-age=${authData.expires_in}; SameSite=Lax; Secure`;

    return authData;
  },

  async getCurrentUser(): Promise<UserResponse> {
    const token = this.getToken();

    if (!token) {
      throw new Error("No authentication token found");
    }

    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include", // Enable cookies
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.logout();
      }
      throw new Error("Failed to get user info");
    }

    return response.json();
  },

  logout() {
    // Clear cookie by setting max-age to 0
    document.cookie = "access_token=; path=/; max-age=0; SameSite=Lax";
  },

  getToken(): string | null {
    if (typeof document === "undefined") return null;

    // Parse cookie to get token
    const cookies = document.cookie.split(";");
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "access_token") {
        return value;
      }
    }
    return null;
  },
};
