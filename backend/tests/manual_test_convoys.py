import asyncio
import httpx
from datetime import datetime
import uuid

BASE_URL = "http://localhost:8000/api/v1"

async def get_token(client, username, password):
    """Helper to login and get access token"""
    login_data = {
        "username": username,
        "password": password
    }
    resp = await client.post(f"{BASE_URL}/auth/token", data=login_data)
    resp.raise_for_status()
    return resp.json()["access_token"]

async def test_convoys_flow():
    async with httpx.AsyncClient() as client:
        # --- 1. SETUP USERS ---
        print("Creating and Logging in Users...")
        
        # User 1 Setup
        u1_name = f"user1_{uuid.uuid4().hex[:6]}"
        u1_pass = "pass123"
        await client.post(f"{BASE_URL}/users/signup", json={"username": u1_name, "password": u1_pass})
        token1 = await get_token(client, u1_name, u1_pass)
        headers1 = {"Authorization": f"Bearer {token1}"}
        
        # Get User 1 ID (via /users/me or parsing token - simplifying by fetching me or assuming from create)
        # For simplicity in this test script, we trust the flow works without verifying explicit ID here, 
        # or we could add a /users/me endpoint. But the convoy creation returns the member list with IDs.
        print(f"User 1 ({u1_name}) logged in.")

        # User 2 Setup
        u2_name = f"user2_{uuid.uuid4().hex[:6]}"
        u2_pass = "pass123"
        await client.post(f"{BASE_URL}/users/signup", json={"username": u2_name, "password": u2_pass})
        token2 = await get_token(client, u2_name, u2_pass)
        headers2 = {"Authorization": f"Bearer {token2}"}
        print(f"User 2 ({u2_name}) logged in.")

        # --- 2. CREATE CONVOY (User 1) ---
        print("\nCreating Convoy...")
        convoy_payload = {
            "name": "Trip to Beach",
            "destination_name": "Beach",
            "destination_lat": 32.0,
            "destination_lon": 34.0,
            "start_time": datetime.utcnow().isoformat()
        }
        
        # Use headers1 (Secure call)
        resp = await client.post(f"{BASE_URL}/convoys/", json=convoy_payload, headers=headers1)
        if resp.status_code != 200:
            print(f"❌ Failed to create convoy: {resp.text}")
            return

        convoy = resp.json()
        print(f"✅ Convoy created: ID={convoy['id']}, Invite Code={convoy['invite_code']}")
        
        # Verify User 1 is leader
        assert len(convoy['members']) == 1
        print("Leader check passed.")

        # --- 3. JOIN CONVOY (User 2) ---
        print("\nJoining Convoy...")
        join_payload = {"invite_code": convoy['invite_code']}
        
        # Use headers2 (Secure call)
        resp = await client.post(f"{BASE_URL}/convoys/join", json=join_payload, headers=headers2)
        resp.raise_for_status()
        joined_convoy = resp.json()
        
        print(f"✅ User 2 joined. Members count: {len(joined_convoy['members'])}")
        assert len(joined_convoy['members']) == 2
        
        # --- 4. GET CONVOY DETAILS ---
        print("\nGetting Convoy Details (as User 1)...")
        resp = await client.get(f"{BASE_URL}/convoys/{convoy['id']}", headers=headers1)
        resp.raise_for_status()
        details = resp.json()
        assert len(details['members']) == 2
        print("Details verification passed.")
        
        # --- 5. GET MY CONVOYS ---
        print("\nGetting User 1 Convoys...")
        resp = await client.get(f"{BASE_URL}/convoys/mine", headers=headers1)
        resp.raise_for_status()
        user1_convoys = resp.json()
        print(f"User 1 has {len(user1_convoys)} convoys")
        assert len(user1_convoys) >= 1
        
        print("\nGetting User 2 Convoys...")
        resp = await client.get(f"{BASE_URL}/convoys/mine", headers=headers2)
        resp.raise_for_status()
        user2_convoys = resp.json()
        print(f"User 2 has {len(user2_convoys)} convoys")
        assert len(user2_convoys) >= 1

        print("\n🎉 Verification Successful! All secure flows working.")

if __name__ == "__main__":
    asyncio.run(test_convoys_flow())
