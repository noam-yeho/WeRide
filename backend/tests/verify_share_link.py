
import sys
import os

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.api.convoys import get_share_link

def test_share_link_format():
    code = "TEST12"
    link = get_share_link(code)
    expected = "weride://convoy/join?code=TEST12"
    print(f"Generated: {link}")
    print(f"Expected:  {expected}")
    
    if link == expected:
        print("✅ Link format matches")
    else:
        print("❌ Link format mismatch")
        sys.exit(1)

if __name__ == "__main__":
    test_share_link_format()
