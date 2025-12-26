import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request Interceptor: Attach Token
api.interceptors.request.use(
    async (config) => {
        try {
            const token = await SecureStore.getItemAsync('user_token');
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        } catch (error) {
            console.error("Error fetching token:", error);
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Silent Guest Login
export const loginAsGuest = async () => {
    try {
        console.log("👻 Attempting Guest Login...");
        const response = await axios.post(`${API_URL}/auth/guest`);

        if (response.data && response.data.access_token) {
            await SecureStore.setItemAsync('user_token', response.data.access_token);
            console.log("✅ Guest Login Successful. Token stored.");
            return response.data.access_token;
        } else {
            console.error("❌ Guest Login Failed: No token received.");
            return null;
        }
    } catch (error) {
        console.error("❌ Guest Login Error:", error);
        return null;
    }
};

export default api;
