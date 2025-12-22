import React, { useState, useCallback } from 'react';
import { View, Text, Button, FlatList, StyleSheet, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { API_URL } from '../config';

interface Convoy {
    id: string;
    name: string;
    invite_code: string;
    status: string;
}

export default function DashboardScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<any>>();
    const [convoys, setConvoys] = useState<Convoy[]>([]);

    // Join Modal State
    const [joinModalVisible, setJoinModalVisible] = useState(false);
    const [inviteCode, setInviteCode] = useState('');

    const fetchConvoys = async () => {
        try {
            const token = await SecureStore.getItemAsync('user_token');
            if (!token) {
                navigation.replace('Login');
                return;
            }

            const response = await fetch(`${API_URL}/convoys/mine`, {
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
            const response = await fetch(`${API_URL}/convoys/`, {
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

    const handleJoinConvoy = async () => {
        if (!inviteCode.trim()) {
            Alert.alert("Error", "Please enter a valid invite code");
            return;
        }

        try {
            const token = await SecureStore.getItemAsync('user_token');
            const response = await fetch(`${API_URL}/convoys/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    invite_code: inviteCode.trim().toUpperCase() // Ensure upper case if generated that way
                })
            });

            if (response.ok) {
                const convoy = await response.json();
                setJoinModalVisible(false);
                setInviteCode('');
                // Navigate to Map with convoyId
                navigation.navigate('Map', { convoyId: convoy.id });
            } else {
                // If 404 or other error
                const errorData = await response.json();
                Alert.alert("Invalid Code", "Could not find a convoy with that code.");
            }
        } catch (error) {
            console.error('Error joining convoy:', error);
            Alert.alert("Error", "Network request failed");
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
                <TouchableOpacity
                    style={styles.joinButton}
                    onPress={() => setJoinModalVisible(true)}
                >
                    <Text style={styles.joinButtonText}>Join Convoy</Text>
                </TouchableOpacity>
            </View>

            {/* Join Convoy Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={joinModalVisible}
                onRequestClose={() => setJoinModalVisible(false)}
            >
                <View style={styles.centeredView}>
                    <View style={styles.modalView}>
                        <Text style={styles.modalTitle}>Join a Convoy</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter Invite Code"
                            value={inviteCode}
                            onChangeText={setInviteCode}
                            autoCapitalize="characters"
                            autoCorrect={false}
                        />
                        <View style={styles.modalButtons}>
                            <Button title="Cancel" color="red" onPress={() => setJoinModalVisible(false)} />
                            <Button title="Join" onPress={handleJoinConvoy} />
                        </View>
                    </View>
                </View>
            </Modal>
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
        gap: 10,
    },
    joinButton: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: '#007AFF',
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
        marginTop: 10,
    },
    joinButtonText: {
        color: '#007AFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    // Modal Styles
    centeredView: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: 'rgba(0,0,0,0.5)'
    },
    modalView: {
        margin: 20,
        backgroundColor: "white",
        borderRadius: 20,
        padding: 35,
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2
        },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
        width: '80%'
    },
    modalTitle: {
        marginBottom: 15,
        textAlign: "center",
        fontSize: 20,
        fontWeight: 'bold'
    },
    input: {
        height: 50,
        width: '100%',
        borderColor: 'gray',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        marginBottom: 20,
        fontSize: 18,
        textAlign: 'center'
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        gap: 10
    }
});