/**
 * App entry. The background-location task must be defined before anything else
 * so the OS can deliver location updates when ROAM is launched headless
 * (in the background, without UI). Then hand over to Expo Router.
 */
import './src/services/backgroundLocation';
import 'expo-router/entry';
