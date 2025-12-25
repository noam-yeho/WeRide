import asyncio
import httpx

BASE_URL = "http://127.0.0.1:8000/api/v1"

async def test_auth():
    async with httpx.AsyncClient() as client:
        print("🔐 1. Registering new user...")
        signup_payload = {
            "username": "TestDriver",

            "full_name": "Test Driver",
            "password": "MySecurePassword123"
        }
        response = await client.post(f"{BASE_URL}/users/signup", json=signup_payload)
        
        if response.status_code != 200:
            print(f"❌ Signup Failed: {response.text}")
            return
        
        user_data = response.json()
        print(f"✅ User Created! ID: {user_data['id']}")
        
        # ---------------------------------------------------------
        
        print("\n🔑 2. Attempting Login (Getting Token)...")
        # Login uses FORM data (application/x-www-form-urlencoded), not JSON!
        login_data = {
            "username": "TestDriver",
            "password": "MySecurePassword123"
        }
        response = await client.post(f"{BASE_URL}/auth/token", data=login_data)
        
        if response.status_code != 200:
            print(f"❌ Login Failed: {response.text}")
            return
            
        token_data = response.json()
        access_token = token_data["access_token"]
        print("✅ Login Success!")
        print(f"🎫 Token received (first 20 chars): {access_token[:20]}...")
        print("🎉 Authentication System is FULLY OPERATIONAL!")

if __name__ == "__main__":
    asyncio.run(test_auth())