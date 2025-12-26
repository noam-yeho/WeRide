import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

// 1. Create Axios Instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// 2. Request Interceptor: Attach Token (If exists)
api.interceptors.request.use(
    async (config) => {
        const token = await SecureStore.getItemAsync('user_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// 3. Response Interceptor: Auto-Heal 401 Errors (The Persistent Fix)
api.interceptors.response.use(
    (response) => response, // If success, just return data
    async (error) => {
        const originalRequest = error.config;

        // Check if error is 401 (Unauthorized) AND we haven't retried yet
        if (error.response?.status === 401 && !originalRequest._retry) {
            console.log("🔄 401 Detected (Stale Token). Attempting auto-login...");
            originalRequest._retry = true; // Mark as retried to prevent infinite loops

            try {
                // A. Delete the bad token
                await SecureStore.deleteItemAsync('user_token');

                // B. Get a new guest token
                // NOTE: We use raw 'axios' here, not 'api', to avoid circular interceptor logic
                const loginResponse = await axios.post(`${API_URL}/auth/guest`);
                const newToken = loginResponse.data.access_token;

                if (newToken) {
                    console.log("✅ Session renewed successfully. Retrying request...");

                    // C. Store new token
                    await SecureStore.setItemAsync('user_token', newToken);

                    // D. Update header and retry original request
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    return api(originalRequest);
                }
            } catch (refreshError) {
                console.error("❌ Fatal: Could not renew guest session", refreshError);
                return Promise.reject(refreshError);
            }
        }

        // Return error if it wasn't a 401 or retry failed
        return Promise.reject(error);
    }
);

// --- Helper Functions ---

export const loginAsGuest = async () => {
    try {
        // Explicit login call
        const response = await axios.post(`${API_URL}/auth/guest`);
        if (response.data.access_token) {
            await SecureStore.setItemAsync('user_token', response.data.access_token);
            return response.data.access_token;
        }
    } catch (error) {
        console.error("Login Error:", error);
        return null;
    }
};

export const createConvoy = async (name: string, destination: string, lat: number, lon: number) => {
    try {
        console.log("🚕 Creating new convoy...");
        // Uses 'api' instance, so it benefits from the 401 auto-fix logic!
        const response = await api.post('/convoys/', {
            name: name,
            destination_name: destination,
            destination_lat: lat,
            destination_lon: lon,
            start_time: new Date().toISOString()
        });

        if (response.data && response.data.id) {
            console.log("✅ Convoy Created:", response.data.id);
            return response.data;
        } else {
            console.error("❌ Convoy Creation Failed: Invalid response.");
            return null;
        }
    } catch (error) {
        return null;
    }
};

export interface UserProfile {
    id: string;
    username: string;
    is_guest: boolean;
}

export const getUserProfile = async (): Promise<UserProfile | null> => {
    try {
        const response = await api.get('/users/me');
        return response.data;
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return null;
    }
};

export const signup = async (userData: { username: string; password: string; full_name?: string }) => {
    try {
        const response = await api.post('/users/signup', userData);
        return response.data;
    } catch (error: any) {
        console.error("Signup Error:", error.response?.data || error.message);
        throw error.response?.data || error;
    }
};

export const loginUser = async (username: string, password: string) => {
    try {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        // using axios directly to avoid interceptors if needed, or just api is fine but this is auth endpoint
        const response = await axios.post(`${API_URL}/auth/token`, formData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        return response.data;
    } catch (error: any) {
        throw error.response?.data || error;
    }
};


export const leaveConvoy = async (convoyId: string) => {
    try {
        const response = await api.delete(`/convoys/${convoyId}`);
        return response.data;
    } catch (error: any) {
        console.error("Error leaving convoy:", error);
        throw error;
    }
};

export default api;