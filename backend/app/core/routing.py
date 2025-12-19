import httpx
import logging

logger = logging.getLogger(__name__)

async def get_driving_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate driving distance between two points using OSRM public API.
    Returns distance in meters.
    """
    # OSRM uses lon,lat order
    url = f"http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=false"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=5.0)
            response.raise_for_status()
            data = response.json()
            
            if data.get("code") == "Ok" and data.get("routes"):
                # OSRM returns distance in meters
                return float(data["routes"][0]["distance"])
            else:
                logger.warning(f"OSRM returned no routes or error: {data}")
                return 0.0
                
    except Exception as e:
        logger.error(f"Error fetching OSRM distance: {e}")
        # Fallback to 0 or potentially haversine if we wanted to be fancy, 
        # but spec says return 0.0 or fallback.
        return 0.0
