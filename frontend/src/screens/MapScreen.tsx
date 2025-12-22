import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, Dimensions, StatusBar } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons'; // Used for icons
import { API_URL, WS_URL } from '../config';



const DARK_MAP_STYLE = [
    { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] },
    { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] },
    { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
    { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
    { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#263c3f" }] },
    { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#6b9a76" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
    { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#212a37" }] },
    { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#9ca5b3" }] },
    { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#746855" }] },
    { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#1f2835" }] },
    { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#f3d19c" }] },
    { "featureType": "transit", "elementType": "geometry", "stylers": [{ "color": "#2f3948" }] },
    { "featureType": "transit.station", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] },
    { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#515c6d" }] },
    { "featureType": "water", "elementType": "labels.text.stroke", "stylers": [{ "color": "#17263c" }] }
];

type RootStackParamList = {
    Map: { convoyId: string };
};

type MapScreenRouteProp = RouteProp<RootStackParamList, 'Map'>;

export default function MapScreen() {
    const route = useRoute<MapScreenRouteProp>();
    const navigation = useNavigation();
    const { convoyId } = route.params;

    const mapRef = useRef<MapView>(null);
    const ws = useRef<WebSocket | null>(null);

    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [otherMembers, setOtherMembers] = useState<any[]>([]);
    const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
    const [convoy, setConvoy] = useState<any>(null);
    const [hasFetchedRoute, setHasFetchedRoute] = useState(false);

    // Derived stats
    const [distanceKm, setDistanceKm] = useState<string>('0');
    const [etaMin, setEtaMin] = useState<string>('0');
    const [arrivalTime, setArrivalTime] = useState<string>('--:--');

    // 1. Fetch Convoy Details (Destination Name)
    useEffect(() => {
        const fetchConvoyDetails = async () => {
            try {
                const token = await SecureStore.getItemAsync('user_token');
                if (!token) return;

                const response = await fetch(`${API_URL}/convoys/${convoyId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    setConvoy(data);
                }
            } catch (err) {
                console.log("Error fetching convoy details:", err);
            }
        };
        fetchConvoyDetails();
    }, [convoyId]);

    // 2. Setup Permissions, Location Watching & WebSocket
    useEffect(() => {
        let locationSubscription: Location.LocationSubscription | null = null;

        const setup = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission denied", "We need location access to connect you to the convoy.");
                navigation.goBack();
                return;
            }

            const token = await SecureStore.getItemAsync('user_token');
            if (!token) return;

            // WebSocket Connection
            const socketUrl = `${WS_URL}/${convoyId}?token=${token}`;
            ws.current = new WebSocket(socketUrl);
            ws.current.onopen = () => console.log("✅ Connected to Convoy!");
            ws.current.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.type === 'convoy_update') {
                    setOtherMembers(data.members || []);
                }
            };
            ws.current.onerror = (e) => console.log("❌ WS Error:", e);
            ws.current.onclose = () => console.log("🔌 Disconnected from Convoy");

            // Location Watching
            locationSubscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 2000,
                    distanceInterval: 5,
                },
                (newLocation) => {
                    setLocation(newLocation);

                    // Send update to WS
                    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                        const payload = {
                            lat: newLocation.coords.latitude,
                            lon: newLocation.coords.longitude
                        };
                        ws.current.send(JSON.stringify(payload));
                    }
                }
            );
        };

        setup();

        return () => {
            if (ws.current) ws.current.close();
            if (locationSubscription) locationSubscription.remove();
        };
    }, [convoyId]);

    // 3. React to Location Updates: Animate Camera + Fetch Route ONCE
    useEffect(() => {
        if (!location) return;

        // Animate Camera
        mapRef.current?.animateCamera({
            center: {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            },
            pitch: 45,
            zoom: 17, // Closer zoom for navigation feel
            heading: location.coords.heading || 0,
        });

        // Fetch Route immediately if not done yet
        if (!hasFetchedRoute) {
            fetchRoute(location.coords);
            setHasFetchedRoute(true);
        }

        // Recalculate stats on every location update if we have a route
        if (routeCoordinates.length > 0) {
            calculateStats(location.coords);
        }

    }, [location]);

    const fetchRoute = async (coords: { latitude: number; longitude: number }) => {
        try {
            const token = await SecureStore.getItemAsync('user_token');
            if (!token) return;

            console.log("Fetching route...");
            const response = await fetch(`${API_URL}/convoys/${convoyId}/route?user_lat=${coords.latitude}&user_lon=${coords.longitude}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.route && data.route.length > 0) {
                    setRouteCoordinates(data.route);
                    calculateStats(coords, data.route);
                }
            }
        } catch (error) {
            console.log("Error fetching route:", error);
        }
    };

    const calculateStats = (currentLoc: { latitude: number; longitude: number }, routeCoords = routeCoordinates) => {
        if (!routeCoords || routeCoords.length === 0) return;

        const destination = routeCoords[routeCoords.length - 1];
        const distMeters = getDistanceFromLatLonInKm(
            currentLoc.latitude, currentLoc.longitude,
            destination.latitude, destination.longitude
        ) * 1000;

        setDistanceKm((distMeters / 1000).toFixed(1));

        // Speed in m/s (default 50km/h = ~13.8 m/s)
        let speedMps = 13.8;
        // @ts-ignore
        if (location?.coords?.speed && location.coords.speed > 5) {
            // @ts-ignore
            speedMps = location.coords.speed;
        }

        const timeSeconds = distMeters / speedMps;
        const minutes = Math.ceil(timeSeconds / 60);
        setEtaMin(minutes.toString());

        // Calculate Arrival Time (Now + Duration)
        const now = new Date();
        const arrival = new Date(now.getTime() + minutes * 60000);
        const hours = arrival.getHours().toString().padStart(2, '0');
        const mins = arrival.getMinutes().toString().padStart(2, '0');
        setArrivalTime(`${hours}:${mins}`);
    };

    function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
        var R = 6371;
        var dLat = deg2rad(lat2 - lat1);
        var dLon = deg2rad(lon2 - lon1);
        var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function deg2rad(deg: number) {
        return deg * (Math.PI / 180);
    }

    const handleLeave = () => {
        Alert.alert("Exit Navigation", "Are you sure you want to leave the convoy?", [
            { text: "Cancel", style: "cancel" },
            { text: "Exit", style: 'destructive', onPress: () => navigation.goBack() }
        ]);
    };

    if (!location && !convoy) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4A89F3" />
                <Text style={{ marginTop: 10, color: '#fff' }}>Locating...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <MapView
                ref={mapRef}
                provider={PROVIDER_DEFAULT}
                customMapStyle={DARK_MAP_STYLE}
                style={StyleSheet.absoluteFillObject}
                showsUserLocation={false}
                initialRegion={{
                    latitude: location ? location.coords.latitude : 31.0461,
                    longitude: location ? location.coords.longitude : 34.8516,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                }}
            >
                {/* Route */}
                {routeCoordinates.length > 0 && (
                    <Polyline
                        coordinates={routeCoordinates}
                        strokeColor="#4A89F3"
                        strokeWidth={6}
                    />
                )}

                {/* My Marker (Navigation Arrow) */}
                {location && (
                    <Marker
                        coordinate={{
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                        }}
                        anchor={{ x: 0.5, y: 0.5 }}
                        flat={true}
                        rotation={location.coords.heading || 0}
                    >
                        <View style={styles.navArrowContainer}>
                            <Ionicons name="navigate" size={32} color="#4A89F3" />
                        </View>
                    </Marker>
                )}

                {/* Other Members */}
                {otherMembers.map((member, index) => (
                    <Marker
                        key={`member-${index}`}
                        coordinate={{
                            latitude: member.lat,
                            longitude: member.lon,
                        }}
                        title={`Driver ${member.user_id}`}
                    >
                        <View style={styles.otherMarkerContainer}>
                            {/* Car Icon */}
                            <Text style={{ fontSize: 20 }}>🚗</Text>
                        </View>
                    </Marker>
                ))}

                {/* Destination Marker */}
                {convoy && (
                    <Marker
                        coordinate={{
                            latitude: convoy.destination_lat,
                            longitude: convoy.destination_lon,
                        }}
                        title={convoy.destination_name}
                    >
                        <Ionicons name="location" size={40} color="#FF3B30" />
                    </Marker>
                )}
            </MapView>

            {/* Top Info Bar (Next Turn Placeholder - Visual Only) */}
            <View style={styles.topBar}>
                <View style={styles.topBarContent}>
                    <Ionicons name="arrow-up" size={32} color="#fff" />
                    <View style={{ marginLeft: 15 }}>
                        <Text style={styles.topBarDistance}>100 m</Text>
                        <Text style={styles.topBarInstruction}>Head straight</Text>
                    </View>
                </View>
            </View>

            {/* Bottom Panel (Waze/Google Maps Syle) */}
            <View style={styles.bottomSheet}>
                <View style={styles.bottomParams}>
                    {/* Left: Exit Button */}
                    <TouchableOpacity style={styles.exitButton} onPress={handleLeave}>
                        <Ionicons name="close" size={28} color="#fff" />
                    </TouchableOpacity>

                    {/* Right: Stats */}
                    <View style={styles.statsContainer}>
                        {/* Destination Name */}
                        <Text style={styles.destinationText} numberOfLines={1}>
                            {convoy?.destination_name || "Unknown Destination"}
                        </Text>

                        {/* Top Line: ETA */}
                        <Text style={styles.etaText}>{etaMin} min</Text>

                        {/* Bottom Line: Distance & Time */}
                        <Text style={styles.detailText}>
                            <Text style={styles.greenText}>{distanceKm} km</Text> • {arrivalTime}
                        </Text>
                    </View>

                    {/* Far Right: Menu/More (Visual Placeholder) */}
                    <TouchableOpacity style={styles.menuButton}>
                        <Ionicons name="chevron-up" size={24} color="#aaa" />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#242f3e' },

    // Top Bar (Green/Dark Navigation Header)
    topBar: {
        position: 'absolute',
        top: 60,
        left: 20,
        right: 20,
        backgroundColor: '#1E1E1E', // Dark grey/green
        borderRadius: 16,
        padding: 15,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 10,
    },
    topBarContent: { flexDirection: 'row', alignItems: 'center' },
    topBarDistance: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
    topBarInstruction: { color: '#aaa', fontSize: 16, marginTop: 2 },

    // Bottom Sheet
    bottomSheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#1E1E1E',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        paddingBottom: 40,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 10,
    },
    bottomParams: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    exitButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#FF3B30', // Red exit button
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 5,
    },
    statsContainer: {
        flex: 1,
        marginLeft: 20,
        justifyContent: 'center',
    },
    destinationText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    etaText: {
        color: '#4CD964', // Bright green for ETA
        fontSize: 26,
        fontWeight: 'bold',
    },
    detailText: {
        color: '#aaa',
        fontSize: 16,
        marginTop: 4,
    },
    greenText: {
        color: '#fff',
        fontWeight: '500'
    },
    menuButton: {
        padding: 10,
    },

    // Markers
    navArrowContainer: {
        // Simple container for the icon
    },
    otherMarkerContainer: {
        padding: 5,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 15,
        borderWidth: 1,
        borderColor: '#FF3B30'
    }
});