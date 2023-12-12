import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import Application from './lib/Application.js';

export default function (currentPath, components, runtimeConfig) {
  let appDir = '';

  const currentDir = path.dirname(fileURLToPath(currentPath));
  if (fs.existsSync(path.resolve(currentDir, 'api'))) {
    appDir = currentDir;
  } else if (currentDir.includes('/api/')) {
    appDir = currentDir.slice(0, currentDir.lastIndexOf('/api/'));
  } else {
    appDir = currentDir;
  }

  return new Application({ ...runtimeConfig, path: appDir, components });
};
