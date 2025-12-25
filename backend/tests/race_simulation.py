import asyncio
import websockets
import json
import httpx

BASE_URL = "http://127.0.0.1:8000/api/v1"
WS_URL = "ws://127.0.0.1:8000/ws"
CONVOY_ID = "43bc56e9-d7aa-4e69-8b55-2ef259c903b1"
DEST_LAT, DEST_LON = 32.0853, 34.7818

async def get_auth_token(username, password):
    async with httpx.AsyncClient() as client:
        signup_payload = {
            "username": username,
            "full_name": f"{username} Driver",
            "password": password
        }
        await client.post(f"{BASE_URL}/users/signup", json=signup_payload)

        login_data = {"username": username, "password": password}
        response = await client.post(f"{BASE_URL}/auth/token", data=login_data)
        
        if response.status_code != 200:
            print(f"❌ Login failed for {username}: {response.text}")
            return None
            
        return response.json()["access_token"]

async def run_driver(name, password, start_lat, start_lon, speed_lat):
    token = await get_auth_token(name, password)
    if not token:
        return

    uri = f"{WS_URL}/{CONVOY_ID}?token={token}"
    print(f"🚗 {name} connecting with secure token...")
    
    try:
        async with websockets.connect(uri) as websocket:
            print(f"✅ {name} connected securely!")
            
            current_lat = start_lat
            
            for i in range(10):
                current_lat -= speed_lat 
                
                payload = {
                    "lat": current_lat,
                    "lon": start_lon
                }
                
                await websocket.send(json.dumps(payload))
                
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                    data = json.loads(response)
                    
                    if data.get("type") == "convoy_update":
                        members = data.get("members", [])
                        leader = members[0] if members else None
                        if leader:
                             print(f"🏁 Update for {name}: Leader is {leader['user_id']} | Dist: {leader['distance']/1000:.2f} km")
                except asyncio.TimeoutError:
                    print(f"⚠️ Timeout waiting for response for {name}")

                await asyncio.sleep(1)
                
    except websockets.exceptions.InvalidStatusCode as e:
        print(f"❌ Connection rejected for {name}: {e.status_code} (Probably Auth Failed)")

async def main():
    raanana_lat = 32.1848
    raanana_lon = 34.8713
    driver1 = run_driver("NoamDriver", "Pass123!", raanana_lat + 0.005, raanana_lon, 0.0005)
    
    driver2 = run_driver("AgentDriver", "Pass123!", raanana_lat - 0.005, raanana_lon + 0.002, -0.0005) 
    
    await asyncio.gather(driver1, driver2)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Race stopped.")