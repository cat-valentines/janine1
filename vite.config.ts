import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Vite's default target is Safari 14+, which ships modern syntax (?. ?? …)
    // untranspiled. Older iPads (iOS 12–13) then fail to parse the whole bundle
    // and show nothing but the page background. Target older Safari so the code
    // is transpiled down and the app actually loads on those devices.
    target: ['es2019', 'safari12', 'chrome80', 'firefox78'],
  },
});
