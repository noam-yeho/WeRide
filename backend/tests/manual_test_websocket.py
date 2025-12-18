from fastapi.testclient import TestClient
from app.main import app

def test_websocket():
    client = TestClient(app)
    convoy_id = "test_convoy"
    user_id_1 = 1
    user_id_2 = 2
    
    print("Connecting client 1...")
    with client.websocket_connect(f"/ws/{convoy_id}/{user_id_1}") as websocket1:
        print("Client 1 connected.")
        
        print("Connecting client 2...")
        with client.websocket_connect(f"/ws/{convoy_id}/{user_id_2}") as websocket2:
            print("Client 2 connected.")
            
            # Send location from client 1
            print("Sending location from client 1...")
            websocket1.send_json({"lat": 10.0, "lon": 20.0})
            
            # Receive on client 2
            print("Waiting for message on client 2...")
            data = websocket2.receive_json()
            print(f"Client 2 received: {data}")
            
            assert data["type"] == "location_update"
            assert data["user_id"] == user_id_1
            assert data["lat"] == 10.0
            assert data["lon"] == 20.0
            print("Verification successful!")

if __name__ == "__main__":
    try:
        test_websocket()
        print("TEST PASSED")
    except Exception as e:
        print(f"TEST FAILED: {e}")
