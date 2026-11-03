const development = process.env.MOCKTASTE_LOCAL_NETWORK === '1';
module.exports = {
  expo: {
    name: 'MockTaste', slug: 'mocktaste', version: '0.1.0', scheme: 'mocktaste', platforms: ['android'], orientation: 'portrait', userInterfaceStyle: 'automatic',
    extra: { allowLocalNetwork: development },
    android: { package: 'com.mocktaste.student', permissions: ['CAMERA'], blockedPermissions: ['android.permission.RECORD_AUDIO'], predictiveBackGestureEnabled: true },
    plugins: [['expo-camera', { cameraPermission: 'Take a photo of your study material to make a mini quiz.', recordAudioAndroid: false, barcodeScannerEnabled: false }], 'expo-secure-store', ['expo-build-properties', { android: { usesCleartextTraffic: development } }]],
  },
};
