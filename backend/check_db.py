from dotenv import load_dotenv
import os

load_dotenv()
url = os.environ.get("DATABASE_URL", "")
print(f"Dialect: {url.split(':')[0] if ':' in url else 'INVALID'}")
