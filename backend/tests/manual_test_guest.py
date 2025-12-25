import asyncio
import httpx
import sys

BASE_URL = "http://127.0.0.1:8000/api/v1"

async def test_guest_flow():
    async with httpx.AsyncClient() as client:
        print("👤 1. Attempting Guest Login...")
        
        try:
            resp = await client.post(f"{BASE_URL}/auth/guest")
            
            if resp.status_code != 200:
                print(f"❌ Guest Login Failed: {resp.status_code} - {resp.text}")
                return
            
            data = resp.json()
            token = data["access_token"]
            print(f"✅ Guest Login Successful! Token: {token[:20]}...")
            
            # Verify Token Works
            print("🔐 2. Verifying Token with Protected Endpoint...")
            headers = {"Authorization": f"Bearer {token}"}
            
            resp = await client.get(f"{BASE_URL}/convoys/mine", headers=headers)
            
            if resp.status_code == 200:
                print(f"✅ Token Verified! User has {len(resp.json())} convoys.")
            else:
                 print(f"❌ Token Validation Failed: {resp.status_code} - {resp.text}")

        except Exception as e:
            print(f"❌ Exception occurred: {e}")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_guest_flow())
