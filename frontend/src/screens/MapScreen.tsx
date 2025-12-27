import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, StatusBar, ScrollView, Modal } from 'react-native';
import MapView, { Polyline, PROVIDER_DEFAULT, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, WS_URL } from '../config';
import { loginAsGuest, createConvoy, getUserProfile } from '../api';
import { SmoothCarMarker } from '../components/SmoothCarMarker';

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

type RootStackParamList = { Map: { convoyId?: string; code?: string }; };
type MapScreenRouteProp = RouteProp<RootStackParamList, 'Map'>;

export default function MapScreen() {
    const route = useRoute<MapScreenRouteProp>();
    const navigation = useNavigation();

    const [currentConvoyId, setCurrentConvoyId] = useState<string | undefined>(route.params?.convoyId);
    const [deepLinkCode, setDeepLinkCode] = useState<string | undefined>(route.params?.code);

    const mapRef = useRef<MapView>(null);
    const ws = useRef<WebSocket | null>(null);
    const locationSubscription = useRef<Location.LocationSubscription | null>(null);
    const etaRef = useRef<string>("0");
    const lastLocationRef = useRef<Location.LocationObject | null>(null);

    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [otherMembers, setOtherMembers] = useState<any[]>([]);
    const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
    const [convoy, setConvoy] = useState<any>(null);
    const [hasFetchedRoute, setHasFetchedRoute] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [statusMessage, setStatusMessage] = useState("Initializing Systems...");
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // UX State
    const [isFollowing, setIsFollowing] = useState(true);
    const [distanceKm, setDistanceKm] = useState<string>('0');
    const [etaMin, setEtaMin] = useState<string>('0');
    const [arrivalTime, setArrivalTime] = useState<string>('--:--');
    const [membersModalVisible, setMembersModalVisible] = useState(false);

    // Navigation Data State
    const [navigationSteps, setNavigationSteps] = useState<any[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [distanceToNextStep, setDistanceToNextStep] = useState<number>(0);

    useEffect(() => {
        const checkAuthAndSetup = async () => {
            let token = await SecureStore.getItemAsync('user_token');
            if (!token) {
                setStatusMessage("Authenticating Driver...");
                token = await loginAsGuest();
            }
            if (token) {
                setIsAuthenticated(true);
                try {
                    const profile = await getUserProfile();
                    if (profile && profile.id) setCurrentUserId(String(profile.id));
                } catch (e) { console.log("Error fetching profile:", e); }
            } else {
                Alert.alert("Authentication Failed", "Could not sign you in.");
                return;
            }

            if (deepLinkCode) {
                setStatusMessage(`Joining Convoy ${deepLinkCode}...`);
                const joinedConvoy = await handleJoinViaDeepLink(deepLinkCode, token);
                if (joinedConvoy) {
                    setCurrentConvoyId(joinedConvoy.id);
                    Alert.alert("Success", `You joined ${joinedConvoy.name}!`);
                    setDeepLinkCode(undefined);
                    return;
                } else {
                    Alert.alert("Join Failed", "Invalid invite link or network error.");
                }
            }

            if (!currentConvoyId) {
                setStatusMessage("Preparing Vehicle...");
                const newConvoy = await createConvoy("Solo Drive", "No Destination", 0, 0);
                if (newConvoy) setCurrentConvoyId(newConvoy.id);
            }
        };
        checkAuthAndSetup();
    }, [deepLinkCode, currentConvoyId]);

    const handleJoinViaDeepLink = async (code: string, token: string) => {
        try {
            const response = await fetch(`${API_URL}/convoys/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ invite_code: code.trim().toUpperCase() })
            });
            if (response.ok) return await response.json();
            return null;
        } catch (error) { return null; }
    };

    useEffect(() => {
        if (!currentConvoyId || !isAuthenticated) return;
        const fetchConvoyDetails = async () => {
            try {
                const token = await SecureStore.getItemAsync('user_token');
                if (!token) return;
                const response = await fetch(`${API_URL}/convoys/${currentConvoyId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (response.ok) {
                    const data = await response.json();
                    setConvoy(data);
                }
            } catch (err) { console.log(err); }
        };
        fetchConvoyDetails();
    }, [currentConvoyId, isAuthenticated]);

    useEffect(() => {
        const setup = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;

            if (currentConvoyId && isAuthenticated) {
                const token = await SecureStore.getItemAsync('user_token');
                if (token) {
                    const socketUrl = `${WS_URL}/${currentConvoyId}?token=${token}`;
                    ws.current = new WebSocket(socketUrl);
                    ws.current.onopen = () => console.log("✅ Connected to Convoy!");
                    ws.current.onmessage = (e) => {
                        const data = JSON.parse(e.data);
                        if (data.type === 'convoy_update') setOtherMembers(data.members || []);
                    };
                }
            }

            locationSubscription.current = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 1000,
                    distanceInterval: 10 // changed from 0 to 10m to reduce noise
                },
                (newLocation) => {
                    // 1. Accuracy Filtering
                    if (newLocation.coords.accuracy && newLocation.coords.accuracy > 25) {
                        return;
                    }

                    // 2. Movement Threshold
                    // If we have a valid previous location, check if we moved enough
                    if (lastLocationRef.current) {
                        const dist = getDistanceFromLatLonInKm(
                            lastLocationRef.current.coords.latitude,
                            lastLocationRef.current.coords.longitude,
                            newLocation.coords.latitude,
                            newLocation.coords.longitude
                        ) * 1000;
                        if (dist < 5) return; // Ignore movements < 5 meters
                    }

                    // 3. Heading Stabilization
                    // Only update heading if speed > 1 m/s (~3.6 km/h) to prevent spinning when stopped
                    let finalHeading = newLocation.coords.heading;
                    if (newLocation.coords.speed !== null && newLocation.coords.speed < 1) {
                        if (lastLocationRef.current) {
                            finalHeading = lastLocationRef.current.coords.heading;
                        }
                    }

                    const stabilizedLocation = {
                        ...newLocation,
                        coords: {
                            ...newLocation.coords,
                            heading: finalHeading
                        }
                    };

                    lastLocationRef.current = stabilizedLocation;
                    setLocation(stabilizedLocation);
                }
            );
        };
        if (isAuthenticated) setup();
        return () => {
            if (ws.current) ws.current.close();
            if (locationSubscription.current) locationSubscription.current.remove();
        };
    }, [currentConvoyId, isAuthenticated]);

    useEffect(() => {
        if (location && ws.current && ws.current.readyState === WebSocket.OPEN) {
            const payload = { lat: location.coords.latitude, lon: location.coords.longitude, eta: etaRef.current };
            ws.current.send(JSON.stringify(payload));
        }
    }, [location]);

    useEffect(() => {
        if (!location) return;

        // --- SMART CAMERA LOGIC ---
        // Auto-follow only updates position & heading. Doesn't force zoom.
        if (isFollowing) {
            mapRef.current?.animateCamera({
                center: { latitude: location.coords.latitude, longitude: location.coords.longitude },
                heading: location.coords.heading || 0,
                pitch: routeCoordinates.length > 0 ? 60 : 0, // 3D Pitch when navigating
            }, { duration: 1000 });
        }

        if (currentConvoyId && !hasFetchedRoute && isAuthenticated) {
            fetchRoute(location.coords);
            setHasFetchedRoute(true);
        }
        if (routeCoordinates.length > 0) calculateStats(location.coords);
    }, [location, isAuthenticated, currentConvoyId, isFollowing]);

    // --- RECENTER HANDLER ---
    // Resets: Center, Pitch, Heading, AND ZOOM (Altitude for iOS)
    const handleRecenter = () => {
        setIsFollowing(true);
        if (location) {
            mapRef.current?.animateCamera({
                center: { latitude: location.coords.latitude, longitude: location.coords.longitude },
                heading: location.coords.heading || 0,
                pitch: 45,
                zoom: 17,      // Android
                altitude: 300, // iOS (Required to force zoom in on Apple Maps)
            }, { duration: 800 });
        }
    };

    const fetchRoute = async (coords: any) => {
        try {
            const token = await SecureStore.getItemAsync('user_token');
            if (!token) return;
            const response = await fetch(`${API_URL}/convoys/${currentConvoyId}/route?user_lat=${coords.latitude}&user_lon=${coords.longitude}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (response.ok) {
                const data = await response.json();
                if (data.route?.length > 0) {
                    setRouteCoordinates(data.route);
                    setNavigationSteps(data.steps || []);
                    setCurrentStepIndex(0);

                    if (data.duration) {
                        const minutes = Math.ceil(data.duration / 60);
                        setEtaMin(minutes.toString());
                        etaRef.current = minutes.toString();
                        const now = new Date();
                        const arrival = new Date(now.getTime() + minutes * 60000);
                        setArrivalTime(`${arrival.getHours().toString().padStart(2, '0')}:${arrival.getMinutes().toString().padStart(2, '0')}`);
                    }
                    calculateStats(coords, data.route, data.steps);
                }
            }
        } catch (error) { console.log(error); }
    };

    const calculateStats = (currentLoc: any, routeCoords = routeCoordinates, steps = navigationSteps) => {
        if (!routeCoords || routeCoords.length === 0) return;
        const dest = routeCoords[routeCoords.length - 1];
        const distMeters = getDistanceFromLatLonInKm(currentLoc.latitude, currentLoc.longitude, dest.latitude, dest.longitude) * 1000;
        setDistanceKm((distMeters / 1000).toFixed(1));

        // Update current step based on location
        if (steps.length > 0 && currentStepIndex < steps.length) {
            const nextStep = steps[currentStepIndex];
            const distToNext = getDistanceFromLatLonInKm(
                currentLoc.latitude, currentLoc.longitude,
                nextStep.location.latitude, nextStep.location.longitude
            ) * 1000;

            setDistanceToNextStep(Math.round(distToNext));

            // If we are close to the next step (e.g., < 30m), move to the next one
            if (distToNext < 30 && currentStepIndex < steps.length - 1) {
                setCurrentStepIndex(prev => prev + 1);
            }
        }
    };

    const calculateEtaForMember = (distMeters: number) => {
        const speedMps = 13.8;
        return `${Math.ceil(distMeters / speedMps / 60)} min`;
    };

    function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
        var R = 6371; var dLat = deg2rad(lat2 - lat1); var dLon = deg2rad(lon2 - lon1);
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c;
    }
    function deg2rad(deg: number) { return deg * (Math.PI / 180); }

    const handleExitConvoy = () => {
        Alert.alert("End Ride", "Leave convoy?", [
            { text: "Cancel", style: "cancel" },
            { text: "End Ride", style: "destructive", onPress: () => { setCurrentConvoyId(undefined); setConvoy(null); setRouteCoordinates([]); } }
        ]);
    };

    const handleMenu = async () => { navigation.navigate("Dashboard" as never); };

    const getMemberColor = (id: string) => {
        const colors = ['#FF3B30', '#FF9500', '#FFCC00', '#4CD964', '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55'];
        let hash = 0; for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    const MembersListModal = () => {
        const sortedMembers = [...otherMembers].sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
        const uniqueMembers = Array.from(new Map(sortedMembers.map(m => [m.user_id, m])).values());

        return (
            <Modal animationType="slide" transparent={true} visible={membersModalVisible} onRequestClose={() => setMembersModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Convoy Status</Text>
                            <TouchableOpacity onPress={() => setMembersModalVisible(false)} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.modalList}>
                            {uniqueMembers.length === 0 && <Text style={styles.emptyText}>No other members active.</Text>}
                            {uniqueMembers.map((member, index) => {
                                const color = getMemberColor(member.user_id || 'unknown');
                                const initial = member.username ? member.username.charAt(0).toUpperCase() : '?';
                                const isMe = String(member.user_id) === String(currentUserId);
                                const eta = isMe ? `${etaMin} min` : (member.eta ? `${member.eta} min` : calculateEtaForMember(member.distance || 0));
                                return (
                                    <View key={`modal-item-${index}`} style={styles.modalRow}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <View style={[styles.modalAvatar, { backgroundColor: color }]}>
                                                <Text style={styles.modalAvatarText}>{initial}</Text>
                                            </View>
                                            <View style={{ marginLeft: 12 }}>
                                                <Text style={styles.modalUsername}>{member.username || `User ${member.user_id}`} {isMe ? '(You)' : ''}</Text>
                                                <Text style={styles.modalStatus}>Active</Text>
                                            </View>
                                        </View>
                                        <Text style={styles.modalEta}>{eta}</Text>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        );
    };

    if (!location && !convoy && !currentConvoyId) {
        return (
            <View style={styles.brandedLoadingContainer}>
                <StatusBar barStyle="light-content" />
                <View style={styles.logoContainer}>
                    <Ionicons name="car-sport" size={80} color="#4A89F3" />
                    <Text style={styles.appTitle}>WeRide</Text>
                    <Text style={styles.tagline}>Drive Together.</Text>
                </View>
                <View style={styles.loaderWrapper}>
                    <ActivityIndicator size="large" color="#4A89F3" />
                    <Text style={styles.loadingText}>{statusMessage}</Text>
                </View>
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
                onPanDrag={() => setIsFollowing(false)}
                initialRegion={{
                    latitude: location ? location.coords.latitude : 31.0461,
                    longitude: location ? location.coords.longitude : 34.8516,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                }}
            >
                {routeCoordinates.length > 0 && (
                    <Polyline coordinates={routeCoordinates} strokeColor="#4A89F3" strokeWidth={6} />
                )}

                {location && (
                    <Marker
                        coordinate={{ latitude: location.coords.latitude, longitude: location.coords.longitude }}
                        anchor={{ x: 0.5, y: 0.5 }}
                        rotation={location.coords.heading || 0}
                        flat={true}
                    >
                        <Ionicons name="navigate" size={32} color="#2196F3" />
                    </Marker>
                )}

                {convoy && (
                    <SmoothCarMarker
                        coordinate={{ latitude: convoy.destination_lat, longitude: convoy.destination_lon }}
                        rotation={0}
                        identifier="DESTINATION"
                        isMe={false}
                    />
                )}
            </MapView>

            {!isFollowing && (
                <TouchableOpacity style={styles.recenterButton} onPress={handleRecenter}>
                    <Ionicons name="navigate" size={28} color="#4A89F3" />
                </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.floatingMenuButton} onPress={handleMenu}>
                <Ionicons name="menu" size={32} color="#fff" />
            </TouchableOpacity>

            {navigationSteps.length > 0 && currentStepIndex < navigationSteps.length && (
                <View style={styles.topNavigationBanner}>
                    <View style={styles.maneuverIconContainer}>
                        <Ionicons
                            name={getManeuverIcon(navigationSteps[currentStepIndex].modifier)}
                            size={40}
                            color="#fff"
                        />
                    </View>
                    <View style={styles.maneuverTextContainer}>
                        <Text style={styles.instructionText} numberOfLines={2}>
                            {navigationSteps[currentStepIndex].instruction || navigationSteps[currentStepIndex].name || "Continue"}
                        </Text>
                        <Text style={styles.stepDistanceText}>{distanceToNextStep > 1000 ? `${(distanceToNextStep / 1000).toFixed(1)} km` : `${distanceToNextStep} m`}</Text>
                    </View>
                </View>
            )}

            {convoy && convoy.destination_lat ? (
                <>
                    {/* RenderCollapsedMembers REMOVED HERE */}
                    <MembersListModal />
                    <View style={styles.bottomSheet}>
                        <View style={styles.bottomParams}>
                            <TouchableOpacity style={styles.exitButton} onPress={handleExitConvoy}>
                                <Ionicons name="close" size={28} color="#fff" />
                            </TouchableOpacity>
                            <View style={styles.statsContainer}>
                                <View style={styles.timeStats}>
                                    <Text style={styles.etaGreenText}>{etaMin} min</Text>
                                    <Text style={styles.arrivalTimeText}>{arrivalTime}</Text>
                                </View>
                                <Text style={styles.distanceRemainingText}>{distanceKm} km</Text>
                            </View>
                            <TouchableOpacity style={styles.shareOptionButton} onPress={() => setMembersModalVisible(true)}>
                                <Ionicons name="people" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    brandedLoadingContainer: { flex: 1, backgroundColor: '#121212', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 100 },
    logoContainer: { alignItems: 'center', marginTop: 50 },
    appTitle: { fontSize: 40, fontWeight: 'bold', color: '#fff', marginTop: 10, letterSpacing: 2 },
    tagline: { fontSize: 16, color: '#888', marginTop: 5, fontStyle: 'italic' },
    loaderWrapper: { alignItems: 'center' },
    loadingText: { marginTop: 15, color: '#aaa', fontSize: 14 },
    floatingMenuButton: { position: 'absolute', top: 60, left: 20, width: 50, height: 50, borderRadius: 25, backgroundColor: '#1E1E1E', alignItems: 'center', justifyContent: 'center', elevation: 10, zIndex: 100 },
    recenterButton: { position: 'absolute', bottom: 200, right: 20, width: 50, height: 50, borderRadius: 25, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 10, zIndex: 100 },
    bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1E1E1E', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, elevation: 10 },
    bottomParams: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    exitButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center' },
    statsContainer: { flex: 1, marginLeft: 20, justifyContent: 'center' },
    destinationText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
    etaText: { color: '#4CD964', fontSize: 26, fontWeight: 'bold' },
    detailText: { color: '#aaa', fontSize: 16, marginTop: 4 },
    greenText: { color: '#fff', fontWeight: '500' },
    menuButton: { padding: 10 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '60%', padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 15 },
    modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    closeButton: { padding: 5 },
    modalList: { flex: 1 },
    emptyText: { color: '#777', textAlign: 'center', marginTop: 20, fontSize: 16 },
    modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
    modalAvatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    modalAvatarText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    modalUsername: { color: '#fff', fontSize: 16, fontWeight: '600' },
    modalStatus: { color: '#4CD964', fontSize: 12, marginTop: 2 },
    modalEta: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

    // Production Navigation Styles
    topNavigationBanner: {
        position: 'absolute',
        top: 50,
        left: 20,
        right: 20,
        height: 100,
        backgroundColor: '#1B5E20', // Production Green
        borderRadius: 15,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        zIndex: 1000,
    },
    maneuverIconContainer: {
        width: 60,
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
    },
    maneuverTextContainer: {
        flex: 1,
        marginLeft: 15,
    },
    instructionText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    stepDistanceText: {
        color: '#A5D6A7',
        fontSize: 16,
        marginTop: 4,
    },
    timeStats: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    etaGreenText: {
        color: '#4CD964',
        fontSize: 24,
        fontWeight: 'bold',
    },
    arrivalTimeText: {
        color: '#aaa',
        fontSize: 16,
        marginLeft: 10,
    },
    distanceRemainingText: {
        color: '#fff',
        fontSize: 16,
        marginTop: 2,
    },
    shareOptionButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
    }
});

// Helper for Maneuver Icons
const getManeuverIcon = (modifier: string) => {
    switch (modifier) {
        case 'right':
            return 'arrow-forward';
        case 'left':
            return 'arrow-back';
        case 'slight right':
            return 'trending-up';
        case 'slight left':
            return 'trending-up';
        case 'sharp right':
            return 'return-up-forward';
        case 'sharp left':
            return 'return-up-back';
        case 'straight':
            return 'arrow-up';
        case 'uturn':
            return 'refresh';
        default:
            return 'navigate';
    }
};