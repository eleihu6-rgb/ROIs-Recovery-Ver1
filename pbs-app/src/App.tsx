import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, Text, StyleSheet } from "react-native";

const Stack = createNativeStackNavigator();

function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>PBS Crew Bidding</Text>
      <Text style={styles.subtitle}>Welcome</Text>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: { backgroundColor: "#1e40af" },
            headerTintColor: "#fff",
            headerTitleStyle: { fontWeight: "bold" },
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: "PBS" }}
          />
        </Stack.Navigator>
        <StatusBar style="light" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e40af",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
  },
});
