import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';

// כתובת ה-WebSocket (שים לב ל-ws:// במקום http://)
const WS_URL = "ws://192.168.1.237:8000/ws";

type RootStackParamList = {
    Map: { convoyId: string };
};

type MapScreenRouteProp = RouteProp<RootStackParamList, 'Map'>;

export default function MapScreen() {
    const route = useRoute<MapScreenRouteProp>();
    const navigation = useNavigation();
    const { convoyId } = route.params;
    
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [otherMembers, setOtherMembers] = useState<any[]>([]); // רשימת נהגים אחרים
    const ws = useRef<WebSocket | null>(null);

    useEffect(() => {
        let locationSubscription: Location.LocationSubscription | null = null;

        const setupMap = async () => {
            // 1. קבלת הרשאות
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission denied", "We need location access to connect you to the convoy.");
                navigation.goBack();
                return;
            }

            // 2. השגת הטוקן
            const token = await SecureStore.getItemAsync('user_token');
            if (!token) return;

            // 3. חיבור ל-WebSocket
            const socketUrl = `${WS_URL}/${convoyId}?token=${token}`;
            console.log("🔌 Connecting to WS:", socketUrl);
            
            ws.current = new WebSocket(socketUrl);

            ws.current.onopen = () => {
                console.log("✅ Connected to Convoy!");
            };

            ws.current.onmessage = (e) => {
                const data = JSON.parse(e.data);
                
                // אם קיבלנו עדכון על השיירה
                if (data.type === 'convoy_update') {
                    // מסננים את עצמנו מהרשימה (כדי שלא נצייר את עצמנו פעמיים)
                    // (הלוגיקה תלויה ב-ID, כרגע נציג את כולם ונראה)
                    setOtherMembers(data.members || []);
                }
            };

            ws.current.onerror = (e) => {
                console.log("❌ WS Error:", e);
            };

            ws.current.onclose = (e) => {
                console.log("🔌 Disconnected:", e.reason);
            };

            // 4. האזנה למיקום בזמן אמת (Watch Position)
            locationSubscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 2000, // שלח עדכון כל 2 שניות
                    distanceInterval: 5, // או כל 5 מטרים
                },
                (newLocation) => {
                    setLocation(newLocation);
                    
                    // שליחת המיקום לשרת דרך ה-Socket
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

        setupMap();

        // ניקוי ביציאה מהמסך
        return () => {
            if (ws.current) ws.current.close();
            if (locationSubscription) locationSubscription.remove();
        };
    }, [convoyId]);

    if (!location) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text>Connecting to GPS & Satellites...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <MapView
                provider={PROVIDER_DEFAULT}
                style={StyleSheet.absoluteFillObject}
                initialRegion={{
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    latitudeDelta: 0.01, // זום קרוב
                    longitudeDelta: 0.01,
                }}
            >
                {/* אני (המרקר שלי) */}
                <Marker
                    coordinate={{
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude,
                    }}
                    title="You"
                    pinColor="blue" // אני בצבע כחול
                />

                {/* נהגים אחרים בשיירה */}
                {otherMembers.map((member, index) => (
                    // מסננים אם זה אני (לפי קואורדינטות קרובות מאוד או ID אם יש)
                    <Marker
                        key={index}
                        coordinate={{
                            latitude: member.lat,
                            longitude: member.lon,
                        }}
                        title={`Driver ${member.user_id}`}
                        description={`Rank: ${member.rank}`}
                        pinColor="red" // הם בצבע אדום
                    />
                ))}
            </MapView>

            <View style={styles.overlay}>
                <Text style={styles.overlayText}>Convoy Active 🟢</Text>
                <Text style={styles.subText}>Code: {convoyId.substring(0, 8)}...</Text>
                <Text style={styles.subText}>Members: {otherMembers.length + 1}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    overlay: {
        position: 'absolute',
        top: 50,
        alignSelf: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        padding: 15,
        borderRadius: 15,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    overlayText: { color: 'green', fontWeight: 'bold', fontSize: 16 },
    subText: { color: '#333', fontSize: 12, marginTop: 2 }
});