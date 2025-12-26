import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Button, FlatList, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, Share } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { API_URL } from '../config';
import { getUserProfile, UserProfile } from '../api';

interface Convoy {
    id: string;
    name: string;
    invite_code: string;
    status: string;
    share_link?: string;
}

type DashboardStackParamList = {
    Dashboard: { code?: string };
    Map: { convoyId: string };
    Login: undefined;
    Signup: undefined;
};

export default function DashboardScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<DashboardStackParamList>>();
    const route = useRoute<RouteProp<DashboardStackParamList, 'Dashboard'>>();
    const [convoys, setConvoys] = useState<Convoy[]>([]);
    const [user, setUser] = useState<UserProfile | null>(null); // Store full user object

    // Join Modal State
    const [joinModalVisible, setJoinModalVisible] = useState(false);
    const [inviteCode, setInviteCode] = useState('');

    const fetchConvoysAndProfile = async () => {
        try {
            const token = await SecureStore.getItemAsync('user_token');
            if (!token) {
                // If no token, maybe logic to guest login or redirect to Login? 
                // Currently API handles auto-guest login, but if we are here, we might want to check status.
                // Assuming we have a token or we let the API calls fail/auto-login.
            }

            // 1. Fetch Profile
            const userProfile = await getUserProfile();
            setUser(userProfile);

            // 2. Fetch Convoys
            // Only fetch convoys if we have a valid token (which we should if getUserProfile succeeded or we have a token)
            // But let's check token again or just rely on API interceptor
            const currentToken = await SecureStore.getItemAsync('user_token');
            if (currentToken) {
                const response = await fetch(`${API_URL}/convoys/mine`, {
                    headers: {
                        'Authorization': `Bearer ${currentToken}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    setConvoys(data);
                } else {
                    console.error('Failed to fetch convoys');
                }
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    const LinkButton = ({ title, onPress }: { title: string, onPress: () => void }) => (
        <TouchableOpacity onPress={onPress}>
            <Text style={{ color: '#007AFF', fontSize: 16 }}>{title}</Text>
        </TouchableOpacity>
    );

    useFocusEffect(
        useCallback(() => {
            fetchConvoysAndProfile();
        }, [])
    );

    // Handle Deep Link
    useEffect(() => {
        if (route.params?.code) {
            console.log("Deep link code detected:", route.params.code);
            setInviteCode(route.params.code);
            // Delay slightly to ensure state update, or just call join directly
            handleJoinConvoy(route.params.code);
            // Clear params to prevent re-join on focus? (Optional, requires navigation.setParams)
            navigation.setParams({ code: undefined });
        }
    }, [route.params?.code]);


    // Clear Header Buttons
    React.useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: undefined, // Clear any previous buttons
        });
    }, [navigation]);


    const handleShare = async (convoy: Convoy) => {
        try {
            // Fallback if backend doesn't return share_link yet
            const link = convoy.share_link || `weride://convoy/join?code=${convoy.invite_code}`;
            const result = await Share.share({
                message: `Join my WeRide convoy! Tap here: ${link}`,
                url: link, // iOS often uses this
                title: 'Join WeRide Convoy'
            });
            if (result.action === Share.sharedAction) {
                if (result.activityType) {
                    // shared with activity type of result.activityType
                } else {
                    // shared
                }
            } else if (result.action === Share.dismissedAction) {
                // dismissed
            }
        } catch (error: any) {
            Alert.alert(error.message);
        }
    };

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
                fetchConvoysAndProfile(); // Refresh
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

    const handleJoinConvoy = async (codeOverride?: string) => {
        const codeToUse = codeOverride || inviteCode;

        if (!codeToUse?.trim()) {
            if (!codeOverride) Alert.alert("Error", "Please enter a valid invite code");
            return;
        }

        try {
            const token = await SecureStore.getItemAsync('user_token');
            if (!token) {
                // If guest auto-login isn't set up to happen silently here, we might need to prompt login.
                // For now assume guest token exists or endpoint handles it.
            }

            const response = await fetch(`${API_URL}/convoys/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    invite_code: codeToUse.trim().toUpperCase() // Ensure upper case if generated that way
                })
            });

            if (response.ok) {
                const convoy = await response.json();
                setJoinModalVisible(false);
                setInviteCode('');
                // Navigate to Map with convoyId
                navigation.navigate('Map', { convoyId: convoy.id });
                Alert.alert("Joined!", `You have joined ${convoy.name}`);
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
        <View style={styles.item}>
            <TouchableOpacity onPress={() => navigation.navigate('Map', { convoyId: item.id })}>
                <Text style={styles.title}>{item.name}</Text>
                <Text>Code: {item.invite_code}</Text>
                <Text>Status: {item.status}</Text>
            </TouchableOpacity>
            <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.actionButton} onPress={() => handleShare(item)}>
                    <Text style={styles.actionButtonText}>Share Invite</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={{ fontSize: 16, color: '#666' }}>
                        Hello, {user?.is_guest ? "Guest" : (user?.username || "Driver")}
                    </Text>
                    {/* Auth Buttons for Guest */}
                    {(user?.is_guest ?? true) ? (
                        <View style={styles.authRow}>
                            <TouchableOpacity
                                style={[styles.authButton, { backgroundColor: '#007AFF' }]}
                                onPress={() => navigation.navigate('Login')}
                            >
                                <Text style={styles.authButtonText}>Sign In</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.authButton, { backgroundColor: '#34C759' }]}
                                onPress={() => navigation.navigate('Signup')}
                            >
                                <Text style={styles.authButtonText}>Create Account</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity onPress={handleLogout} style={{ marginTop: 5 }}>
                            <Text style={{ color: '#FF3B30', fontWeight: '600' }}>Logout</Text>
                        </TouchableOpacity>
                    )}
                    <Text style={[styles.headerTitle, { marginTop: 10 }]}>My Convoys</Text>
                </View>
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
                            <Button title="Join" onPress={() => handleJoinConvoy()} />
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
    authRow: {
        flexDirection: 'row',
        marginTop: 10,
        gap: 10,
    },
    authButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
    },
    authButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
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
    },
    buttonRow: {
        flexDirection: 'row',
        marginTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        paddingTop: 10,
    },
    actionButton: {
        flex: 1,
        alignItems: 'center',
        padding: 5,
    },
    actionButtonText: {
        color: '#007AFF',
        fontWeight: '500',
    }
});