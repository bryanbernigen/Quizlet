/**
 * Test mock for ../db.js — replaces the real module during tests so that:
 * 1. DB_TYPE is forced to 'sqlite'
 * 2. initDb() does not call process.exit() on failure
 * 3. All real db logic is preserved
 */

// Must be set BEFORE importing the real db module
process.env.DB_TYPE = 'sqlite';

// Flag so the mock can suppress process.exit in initDb
let _suppressExit = false;
const _originalExit = process.exit;

async function safeInitDb() {
  try {
    // Call the real initDb but suppress the exit call
    _suppressExit = true;
    await _realModule.initDb();
  } catch (err) {
    // In test env, don't exit — let tests handle the error
    console.warn('[test mock] initDb warning:', err.message);
  } finally {
    _suppressExit = false;
  }
}

// Override process.exit for the duration of initDb
const _realProcessExit = process.exit.bind(process);
globalThis._testSuppressExit = () => {
  Object.defineProperty(process, 'exit', {
    value: (code) => {
      if (code === 1 && _suppressExit) {
        console.warn('[test mock] suppressed process.exit(1)');
        return;
      }
      _realProcessExit(code);
    },
    configurable: true,
  });
};

// Import the REAL db module and re-export everything with a patched initDb
const _realModule = await import('../db.js');

// Proxy initDb to suppress process.exit in test environment
export const initDb = async () => {
  // Temporarily override process.exit
  const originalExit = process.exit.bind(process);
  process.exit = (code) => {
    if (code === 1) {
      // Suppress — test env uses SQLite so Postgres failure is expected
      console.warn('[test mock] suppressed process.exit(1)');
      return;
    }
    originalExit(code);
  };
  try {
    await _realModule.initDb();
  } finally {
    process.exit = originalExit;
  }
};

export const query = _realModule.query;
export const getClient = _realModule.getClient;
export const hashPassword = _realModule.hashPassword;
export const verifyPassword = _realModule.verifyPassword;
export const generateToken = _realModule.generateToken;
