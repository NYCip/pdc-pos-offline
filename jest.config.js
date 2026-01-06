/**
 * Jest configuration for offline database and concurrent operation tests
 * Configured for browser environment with IndexedDB support
 */

module.exports = {
    displayName: 'PDC-POS Offline Tests',
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    testMatch: [
        '<rootDir>/tests/**/*.test.js',
        '<rootDir>/tests/**/*.integration.test.js'
    ],
    collectCoverageFrom: [
        'static/src/js/offline_db.js',
        'static/src/js/session_persistence.js'
    ],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 80,
            lines: 80,
            statements: 80
        }
    },
    testTimeout: 30000, // Longer timeout for integration tests with retries
    verbose: true,
    bail: false, // Continue running tests even if one fails
    maxWorkers: 1, // IndexedDB tests should run serially
    moduleNameMapper: {
        '^./offline_db$': '<rootDir>/static/src/js/offline_db.js'
    }
};
