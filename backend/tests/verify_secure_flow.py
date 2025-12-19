import asyncio
import httpx
import websockets
import json
import uuid

BASE_URL = "http://127.0.0.1:8000/api/v1"
WS_URL = "ws://127.0.0.1:8000/ws"

async def main():
    async with httpx.AsyncClient() as client:
        # Signup User 1
        u1 = f"u1_{uuid.uuid4().hex[:6]}"
        p1 = "password"
        print(f"Signing up {u1}...")
        resp = await client.post(f"{BASE_URL}/users/signup", json={"username": u1, "password": p1, "phone_number": u1})
        resp.raise_for_status()
        
        # Login User 1
        print(f"Logging in {u1}...")
        resp = await client.post(f"{BASE_URL}/auth/token", data={"username": u1, "password": p1})
        resp.raise_for_status()
        token1 = resp.json()["access_token"]
        headers1 = {"Authorization": f"Bearer {token1}"}
        
        # Create Convoy
        print("Creating Convoy...")
        convoy_data = {
            "name": "Secure Trip",
            "destination_name": "Mars",
            "destination_lat": 10.0,
            "destination_lon": 20.0,
            "start_time": "2025-01-01T10:00:00"
        }
        resp = await client.post(f"{BASE_URL}/convoys/", json=convoy_data, headers=headers1)
        resp.raise_for_status()
        convoy = resp.json()
        convoy_id = convoy["id"]
        invite_code = convoy["invite_code"]
        print(f"Convoy created: {convoy_id}")
        
        # Signup User 2
        u2 = f"u2_{uuid.uuid4().hex[:6]}"
        p2 = "password"
        resp = await client.post(f"{BASE_URL}/users/signup", json={"username": u2, "password": p2, "phone_number": u2})
        resp.raise_for_status()
        
        # Login User 2
        resp = await client.post(f"{BASE_URL}/auth/token", data={"username": u2, "password": p2})
        token2 = resp.json()["access_token"]
        headers2 = {"Authorization": f"Bearer {token2}"}
        
        # Join Convoy
        print("Joining Convoy...")
        resp = await client.post(f"{BASE_URL}/convoys/join", json={"invite_code": invite_code}, headers=headers2)
        resp.raise_for_status()
        print("Joined.")

        # Get My Convoys
        print("Getting My Convoys (User 1)...")
        resp = await client.get(f"{BASE_URL}/convoys/mine", headers=headers1)
        resp.raise_for_status()
        my_convoys = resp.json()
        assert any(c["id"] == convoy_id for c in my_convoys)
        print("Verified My Convoys.")
        
        # WebSocket Test
        print("Testing WebSocket...")
        ws_url1 = f"{WS_URL}/{convoy_id}?token={token1}"
        ws_url2 = f"{WS_URL}/{convoy_id}?token={token2}"
        
        async with websockets.connect(ws_url1) as ws1, websockets.connect(ws_url2) as ws2:
            print("Both users connected.")
            # Send from 1
            test_lat = 11.1
            await ws1.send(json.dumps({"lat": test_lat, "lon": 22.2}))
            
            # Receive on 2
            msg = await ws2.recv()
            data = json.loads(msg)
            print(f"Received: {data}")
            
            # Updated Check Logic: Handle both simple and rich updates
            if data.get("type") == "convoy_update":
                members = data.get("members", [])
                found = any(m["lat"] == test_lat for m in members)
                if not found:
                    raise AssertionError(f"Could not find member with lat {test_lat} in members list: {members}")
            elif data.get("type") == "location_update":
                assert data["lat"] == test_lat
            else:
                raise AssertionError(f"Unknown message type: {data.get('type')}")
            
            # Test Invalid Token (Separate Connection)
            print("Testing Invalid Token...")
            invalid_ws = f"{WS_URL}/{convoy_id}?token=invalid"
            try:
                async with websockets.connect(invalid_ws) as ws_fail:
                    await ws_fail.recv()
            except websockets.exceptions.InvalidStatusCode as e:
                print(f"Expected failure caught: {e.status_code}")
                # HTTP 403 or 1008 can be returned depending on how status.WS_1008 translates or if it raises HTTP exception
                # The code used `await websocket.close(code=status.WS_1008_POLICY_VIOLATION)`
                # websockets lib should raise InvalidStatusCode with 1008
                assert e.status_code == 1008 or e.status_code == 403
            except Exception as e:
                print(f"Caught expected exception: {e}")

if __name__ == "__main__":
    asyncio.run(main())