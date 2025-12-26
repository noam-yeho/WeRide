from typing import Dict, List
from fastapi import WebSocket
from app.core.routing import get_driving_distance

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.convoy_destinations: Dict[str, Dict[str, float]] = {}
        self.convoy_state: Dict[str, Dict[str, dict]] = {}

    async def connect(self, convoy_id: str, websocket: WebSocket):
        await websocket.accept()
        if convoy_id not in self.active_connections:
            self.active_connections[convoy_id] = []
        self.active_connections[convoy_id].append(websocket)
        print(f"🔌 NEW CONNECTION to Convoy {convoy_id}. Total clients: {len(self.active_connections[convoy_id])}")

    def set_destination(self, convoy_id: str, lat: float, lon: float):
        self.convoy_destinations[convoy_id] = {"lat": lat, "lon": lon}

    def disconnect(self, convoy_id: str, websocket: WebSocket, user_id: str):
        if convoy_id in self.active_connections:
            if websocket in self.active_connections[convoy_id]:
                self.active_connections[convoy_id].remove(websocket)
            
            if convoy_id in self.convoy_state and user_id in self.convoy_state[convoy_id]:
                print(f"❌ Removing user {user_id} from state")
                del self.convoy_state[convoy_id][user_id]
                
            if not self.active_connections[convoy_id]:
                print(f"🧹 Convoy {convoy_id} is empty. Cleaning up.")
                del self.active_connections[convoy_id]
                if convoy_id in self.convoy_destinations: del self.convoy_destinations[convoy_id]
                if convoy_id in self.convoy_state: del self.convoy_state[convoy_id]
            else:
                 print(f"⚠️ Client disconnected. Remaining clients: {len(self.active_connections[convoy_id])}")

    async def update_location_and_broadcast(self, convoy_id: str, user_id: str, username: str, lat: float, lon: float, eta: float = None):
        # LOGGING INPUT
        # print(f"📍 Update received: User={username}, ETA={eta}") 

        # 1. Update User Location
        if convoy_id not in self.convoy_state: self.convoy_state[convoy_id] = {}
        if user_id not in self.convoy_state[convoy_id]: self.convoy_state[convoy_id][user_id] = {}

        update_data = {"username": username, "lat": lat, "lon": lon}
        if eta is not None: update_data["eta"] = eta
        self.convoy_state[convoy_id][user_id].update(update_data)

        # 2. Calculate Distance (Logic kept same as fix)
        dest = self.convoy_destinations.get(convoy_id)
        if dest:
            distance = await get_driving_distance(lat, lon, dest["lat"], dest["lon"])
            if distance is not None:
                self.convoy_state[convoy_id][user_id]["distance"] = distance

        # 3. Rank members
        members_with_distance = [(uid, data) for uid, data in self.convoy_state[convoy_id].items()]
        # Sort safe
        members_with_distance.sort(key=lambda x: x[1].get("distance", float('inf')))

        ranked_members = []
        for rank, (uid, data) in enumerate(members_with_distance, 1):
            data["rank"] = rank
            ranked_members.append({
                "user_id": uid,
                "username": data.get("username", "Unknown"),
                "lat": data["lat"],
                "lon": data["lon"],
                "rank": rank,
                "distance": data.get("distance", 0),
                "eta": data.get("eta")
            })

        # LOGGING OUTPUT
        print(f"📢 Broadcasting to Convoy {convoy_id} | Active Members: {len(ranked_members)} | Clients: {len(self.active_connections.get(convoy_id, []))}")
        # print(f"   -> Data: {ranked_members}") 

        if not dest:
             message = {"type": "location_update", "user_id": user_id, "username": username, "lat": lat, "lon": lon, "eta": eta}
        else:
            message = {"type": "convoy_update", "members": ranked_members}

        # 4. Broadcast
        if convoy_id in self.active_connections:
            for connection in list(self.active_connections[convoy_id]):
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()