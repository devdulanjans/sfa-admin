import pkg from '../package.json';

// Single source of truth for the version shown in the UI (sidebar footer, etc).
// Bump this by bumping the "version" field in package.json.
export const APP_VERSION = pkg.version;
