from fastapi.testclient import TestClient
from app.main import app

# יצירת "לקוח מדמה" - מאפשר לבדוק את השרת בלי להריץ אותו באמת
client = TestClient(app)

def test_read_root():
    # 1. שלח בקשה לכתובת הראשית
    response = client.get("/")
    
    # 2. וודא שהסטטוס הוא 200 (הצלחה)
    assert response.status_code == 200
    
    # 3. וודא שהתשובה מכילה את הטקסט שציפינו לו
    data = response.json()
    assert data["status"] == "active"
    assert "WeRide" in data["message"]