import asyncio
import websockets
import json

# Configuration
SERVER_URL = "ws://127.0.0.1:8000/ws"
CONVOY_ID = "0018b0df-9ff2-49ce-bf8b-dc6d990da7b4" # Fake UUID for test
# Destination: Tel Aviv Center
DEST_LAT, DEST_LON = 32.0853, 34.7818

async def run_driver(name, user_id, start_lat, start_lon, speed_lat):
    uri = f"{SERVER_URL}/{CONVOY_ID}/{user_id}"
    print(f"🚗 {name} connecting...")
    
    async with websockets.connect(uri) as websocket:
        print(f"✅ {name} connected!")
        
        current_lat = start_lat
        
        # Simulate driving for 10 steps
        for i in range(10):
            # Move closer to TLV (decrease latitude)
            current_lat -= speed_lat 
            
            payload = {
                "lat": current_lat,
                "lon": start_lon
            }
            
            await websocket.send(json.dumps(payload))
            
            # Wait for server response (Rank)
            response = await websocket.recv()
            data = json.loads(response)
            
            if data.get("type") == "convoy_update":
                members = data.get("members", [])
                # Find my rank
                my_stats = next((m for m in members if str(m["user_id"]) == str(user_id)), None)
                if my_stats:
                    dist_km = my_stats['distance'] / 1000
                    print(f"🏁 Update for {name}: Rank {my_stats['rank']} | Distance: {dist_km:.2f} km")
            
            await asyncio.sleep(1) # Wait a second before next move

async def main():
    # Setup: We need to ensure the convoy exists in DB first with a destination
    # Ideally we'd hit the API to create it, but for this test we assume 
    # the server handles the 'not found' gracefully or you manually created one.
    # IMPORTANT: Ensure your DB has a convoy with ID '550e8400-e29b-41d4-a716-446655440000'
    # Or change the CONVOY_ID constant above to a real one you created via Postman/Swagger.
    
    # Driver 1: Noam (Starts at Herzliya ~32.16)
    driver1 = run_driver("Noam", 1, 32.1600, 34.8000, 0.002)
    
    # Driver 2: Agent (Starts at Netanya ~32.32)
    driver2 = run_driver("Agent", 2, 32.3200, 34.8500, 0.004) # Driving faster!
    
    await asyncio.gather(driver1, driver2)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Race stopped.")