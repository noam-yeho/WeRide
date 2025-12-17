
import asyncio
import httpx
from datetime import datetime
import uuid

BASE_URL = "http://localhost:8000/api/v1"

async def test_convoys_flow():
    async with httpx.AsyncClient() as client:
        # 1. Create Users
        print("Creating Users...")
        # User 1
        user1_payload = {"username": f"user1_{uuid.uuid4().hex[:6]}", "phone_number": f"111_{uuid.uuid4().hex[:6]}"}
        resp = await client.post(f"{BASE_URL}/users/signup", json=user1_payload)
        resp.raise_for_status()
        user1 = resp.json()
        print(f"User 1 created: {user1['id']}")

        # User 2
        user2_payload = {"username": f"user2_{uuid.uuid4().hex[:6]}", "phone_number": f"222_{uuid.uuid4().hex[:6]}"}
        resp = await client.post(f"{BASE_URL}/users/signup", json=user2_payload)
        resp.raise_for_status()
        user2 = resp.json()
        print(f"User 2 created: {user2['id']}")

        # 2. Create Convoy (User 1)
        print("\nCreating Convoy...")
        convoy_payload = {
            "name": "Trip to Beach",
            "destination_name": "Beach",
            "destination_lat": 32.0,
            "destination_lon": 34.0,
            "start_time": datetime.utcnow().isoformat()
        }
        # Ideally auth header, passing user_id query param for now as implemented
        resp = await client.post(f"{BASE_URL}/convoys/?user_id={user1['id']}", json=convoy_payload)
        resp.raise_for_status()
        convoy = resp.json()
        print(f"Convoy created: ID={convoy['id']}, Invite Code={convoy['invite_code']}")
        assert len(convoy['members']) == 1
        assert convoy['members'][0]['id'] == user1['id']

        # 3. Join Convoy (User 2)
        print("\nJoining Convoy...")
        join_payload = {"invite_code": convoy['invite_code'], "user_id": user2['id']}
        resp = await client.post(f"{BASE_URL}/convoys/join", json=join_payload)
        resp.raise_for_status()
        joined_convoy = resp.json()
        print(f"Joined convoy. Members count: {len(joined_convoy['members'])}")
        print(f"Response: {joined_convoy}")
        assert len(joined_convoy['members']) == 2
        member_ids = [m['id'] for m in joined_convoy['members']]
        assert user1['id'] in member_ids
        assert user2['id'] in member_ids

        # 4. Get Convoy Details
        print("\nGetting Convoy Details...")
        resp = await client.get(f"{BASE_URL}/convoys/{convoy['id']}")
        resp.raise_for_status()
        details = resp.json()
        print(f"Convoy Details Members: {len(details['members'])}")
        assert len(details['members']) == 2
        
        # 5. Get User Convoys
        print("\nGetting User 1 Convoys...")
        resp = await client.get(f"{BASE_URL}/convoys/user/{user1['id']}")
        resp.raise_for_status()
        user1_convoys = resp.json()
        print(f"User 1 has {len(user1_convoys)} convoys")
        assert len(user1_convoys) >= 1
        assert any(c['id'] == convoy['id'] for c in user1_convoys)
        
        print("\nGetting User 2 Convoys...")
        resp = await client.get(f"{BASE_URL}/convoys/user/{user2['id']}")
        resp.raise_for_status()
        user2_convoys = resp.json()
        print(f"User 2 has {len(user2_convoys)} convoys")
        assert len(user2_convoys) >= 1
        assert any(c['id'] == convoy['id'] for c in user2_convoys)

        print("\nVerification Successful!")

if __name__ == "__main__":
    asyncio.run(test_convoys_flow())
