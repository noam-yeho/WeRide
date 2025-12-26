import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Marker, AnimatedRegion } from 'react-native-maps';

interface SmoothCarMarkerProps {
    coordinate: { latitude: number; longitude: number };
    rotation: number;
    identifier: string;
    isMe?: boolean;
}

const MEMBER_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#4CD964', '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55'];

export const SmoothCarMarker = ({ coordinate, rotation, identifier, isMe = false }: SmoothCarMarkerProps) => {

    const coordinateRef = useRef(new AnimatedRegion({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        latitudeDelta: 0, longitudeDelta: 0,
    })).current;

    useEffect(() => {
        const duration = 1000;
        if (Platform.OS === 'android') {
            coordinateRef.timing({ latitude: coordinate.latitude, longitude: coordinate.longitude, duration, useNativeDriver: false, latitudeDelta: 0, longitudeDelta: 0 }).start();
        } else {
            coordinateRef.timing({ latitude: coordinate.latitude, longitude: coordinate.longitude, duration, useNativeDriver: false, latitudeDelta: 0, longitudeDelta: 0 }).start();
        }
    }, [coordinate]);

    const getMemberColor = (id: string) => {
        if (!id) return '#999';
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
        return MEMBER_COLORS[Math.abs(hash) % MEMBER_COLORS.length];
    };

    const color = getMemberColor(identifier);

    return (
        <Marker.Animated
            coordinate={coordinateRef}
            anchor={{ x: 0.5, y: 0.5 }}
            flat={true}
            rotation={rotation}
            zIndex={isMe ? 10 : 5}
        >
            {isMe ? (
                <View style={styles.navArrowContainer}>
                    <View style={styles.myArrow} />
                </View>
            ) : (
                // Reverted to Car Icon style with color ring
                <View style={styles.carContainer}>
                    <Text style={styles.carEmoji}>🚗</Text>
                    <View style={[styles.colorBadge, { backgroundColor: color }]} />
                </View>
            )}
        </Marker.Animated>
    );
};

const styles = StyleSheet.create({
    navArrowContainer: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    myArrow: {
        width: 20, height: 20, backgroundColor: '#4A89F3',
        borderRadius: 10, borderWidth: 2, borderColor: 'white',
        shadowColor: 'black', shadowOpacity: 0.3, shadowRadius: 2, elevation: 5,
        transform: [{ scaleY: 1.5 }] // Elongate slightly to look like an arrow
    },
    carContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 40, height: 40
    },
    carEmoji: {
        fontSize: 32,
    },
    colorBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#fff',
        elevation: 2
    }
});
