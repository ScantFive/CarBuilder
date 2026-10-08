import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const bundled = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(bundled) ? bundled : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: { executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true },
});
