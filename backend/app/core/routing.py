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

async def get_route_geometry(lat1: float, lon1: float, lat2: float, lon2: float) -> tuple[list[dict], float, float]:
    """
    Fetch route geometry (polyline) between two points using OSRM.
    Returns a tuple: (path, duration_seconds, distance_meters)
    """
    # OSRM url for full geometry
    url = f"http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=5.0)
            response.raise_for_status()
            data = response.json()

            if data.get("code") == "Ok" and data.get("routes"):
                route = data["routes"][0]
                # Extract coordinates. OSRM GeoJSON format is [lon, lat]
                coordinates = route["geometry"]["coordinates"]
                duration = float(route["duration"])
                distance = float(route["distance"])
                
                # Convert to [{'latitude': lat, 'longitude': lon}, ...]
                path = [{"latitude": c[1], "longitude": c[0]} for c in coordinates]
                return path, duration, distance
            else:
                logger.warning(f"OSRM returned no routes for geometry: {data}")
                return [], 0.0, 0.0
                
    except Exception as e:
        logger.error(f"Error fetching OSRM route geometry: {e}")
        return [], 0.0, 0.0
