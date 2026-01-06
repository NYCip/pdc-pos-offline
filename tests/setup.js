/**
 * Jest setup file for offline database tests
 * Configures IndexedDB mock and global test utilities
 */

// Mock IndexedDB API for testing
const indexedDB = {
    databases: [],
    open: jest.fn(),
    deleteDatabase: jest.fn()
};

Object.defineProperty(window, 'indexedDB', {
    value: indexedDB,
    writable: true
});

// Mock IDBFactory
const mockIDBFactory = {
    open: jest.fn((name, version) => {
        const mockDB = {
            objectStoreNames: [],
            createObjectStore: jest.fn(),
            deleteObjectStore: jest.fn(),
            transaction: jest.fn(),
            close: jest.fn()
        };
        return {
            onsuccess: null,
            onerror: null,
            onupgradeneeded: null,
            result: mockDB,
            error: null
        };
    }),
    deleteDatabase: jest.fn(),
    databases: jest.fn(() => [])
};

window.indexedDB = mockIDBFactory;

// Setup console methods for test output
console.info = console.log;
console.warn = console.log;
console.error = console.log;

// Global test timeout
jest.setTimeout(30000);

// Add custom matchers
expect.extend({
    toBeWithinRange(received, floor, ceiling) {
        const pass = received >= floor && received <= ceiling;
        if (pass) {
            return {
                message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
                pass: true
            };
        } else {
            return {
                message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
                pass: false
            };
        }
    }
});

// Mock localStorage
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
});

// Mock navigator.sendBeacon
Object.defineProperty(navigator, 'sendBeacon', {
    value: jest.fn(() => true)
});

// Setup test cleanup
afterEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
});

console.log('[Test Setup] Jest environment configured for IndexedDB testing');
