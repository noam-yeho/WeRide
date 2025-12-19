import React, { useState, useCallback } from 'react';
import { View, Text, Button, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface Convoy {
    id: string;
    name: string;
    invite_code: string;
    status: string;
}

export default function DashboardScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<any>>();
    const [convoys, setConvoys] = useState<Convoy[]>([]);

    const fetchConvoys = async () => {
        try {
            const token = await SecureStore.getItemAsync('user_token');
            if (!token) {
                navigation.replace('Login');
                return;
            }

            const response = await fetch('http://192.168.1.237:8000/api/v1/convoys/mine', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setConvoys(data);
            } else {
                console.error('Failed to fetch convoys');
            }
        } catch (error) {
            console.error('Error fetching convoys:', error);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchConvoys();
        }, [])
    );

    const handleCreateConvoy = async () => {
        try {
            const token = await SecureStore.getItemAsync('user_token');
            const response = await fetch('http://192.168.1.237:8000/api/v1/convoys/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: "Trip to Eilat",
                    destination_name: "Eilat",
                    destination_lat: 29.5577,
                    destination_lon: 34.9519,
                    start_time: new Date().toISOString()
                })
            });

            if (response.ok) {
                fetchConvoys();
                Alert.alert("Success", "Convoy created!");
            } else {
                const errorData = await response.json();
                console.log("Server Error:", errorData);
                Alert.alert('Error', `Failed: ${JSON.stringify(errorData)}`);
            }
        } catch (error) {
            console.error('Error creating convoy:', error);
            Alert.alert('Error', 'Network request failed');
        }
    };

    const handleLogout = async () => {
        await SecureStore.deleteItemAsync('user_token');
        navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
        });
    };

    const renderItem = ({ item }: { item: Convoy }) => (
        <TouchableOpacity
            style={styles.item}
            onPress={() => navigation.navigate('Map', { convoyId: item.id })}
        >
            <Text style={styles.title}>{item.name}</Text>
            <Text>Code: {item.invite_code}</Text>
            <Text>Status: {item.status}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>My Convoys</Text>
                <Button title="Logout" onPress={handleLogout} />
            </View>

            <FlatList
                data={convoys}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
            />

            <View style={styles.footer}>
                <Button title="New Convoy" onPress={handleCreateConvoy} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 50,
        backgroundColor: '#f5f5f5',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    list: {
        paddingHorizontal: 20,
    },
    item: {
        backgroundColor: 'white',
        padding: 20,
        marginVertical: 8,
        borderRadius: 10,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.23,
        shadowRadius: 2.62,
        elevation: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    footer: {
        padding: 20,
    },
});