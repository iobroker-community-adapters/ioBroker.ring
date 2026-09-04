import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    // the tab is served from /adapter/ring/, so every asset reference has to be relative
    base: './',
    build: {
        outDir: 'build',
    },
    server: {
        port: 3000,
    },
});
