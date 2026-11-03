import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.melodiya.melodiya_app',
  appName: 'Sonora',
  webDir: 'dist',
  backgroundColor: '#080909',
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
};

export default config;
