/**
 * UI Automation Tests for PDC POS Offline
 * Using Puppeteer/Playwright for browser automation
 */

const { chromium } = require('playwright'); // or puppeteer

describe('PDC POS Offline UI Tests', () => {
    let browser;
    let page;
    let context;
    
    beforeAll(async () => {
        browser = await chromium.launch({
            headless: process.env.CI === 'true',
            slowMo: process.env.DEBUG ? 100 : 0
        });
    });
    
    afterAll(async () => {
        await browser.close();
    });
    
    beforeEach(async () => {
        context = await browser.newContext({
            viewport: { width: 1920, height: 1080 }
        });
        page = await context.newPage();
        
        // Navigate to POS
        await page.goto('http://localhost:8069/pos/ui');
    });
    
    afterEach(async () => {
        await context.close();
    });
    
    // Test Case 7: Offline Mode Visual Indicators
    describe('TC7: Offline Mode Visual Indicators', () => {
        test('should show offline banner when disconnected', async () => {
            // Go offline
            await context.setOffline(true);
            
            // Wait for offline banner
            const banner = await page.waitForSelector('.pos-offline-banner', {
                timeout: 5000
            });
            
            // Verify banner content
            const bannerText = await banner.textContent();
            expect(bannerText).toContain('Offline Mode');
            
            // Check banner styling
            const bannerStyle = await banner.evaluate(el => {
                return window.getComputedStyle(el);
            });
            expect(bannerStyle.backgroundColor).toBe('rgb(255, 152, 0)'); // Orange
            
            // Screenshot for visual verification
            await page.screenshot({ 
                path: 'tests/screenshots/offline-banner.png',
                fullPage: false 
            });
        });
        
        test('should show connection status indicator', async () => {
            // Check online indicator
            let statusIcon = await page.$('.connection-status i');
            let iconClass = await statusIcon.getAttribute('class');
            expect(iconClass).toContain('fa-wifi');
            expect(iconClass).not.toContain('text-danger');
            
            // Go offline
            await context.setOffline(true);
            await page.waitForTimeout(1000);
            
            // Check offline indicator
            statusIcon = await page.$('.connection-status i');
            iconClass = await statusIcon.getAttribute('class');
            expect(iconClass).toContain('fa-wifi');
            expect(iconClass).toContain('text-danger');
        });
        
        test('should display sync queue counter', async () => {
            await context.setOffline(true);
            
            // Create some offline transactions
            await createOfflineOrder(page, 3);
            
            // Check sync queue counter
            const counter = await page.waitForSelector('.sync-queue-counter');
            const count = await counter.textContent();
            expect(count).toBe('3');
            
            // Visual check
            const counterStyle = await counter.evaluate(el => {
                return window.getComputedStyle(el);
            });
            expect(counterStyle.color).toBe('rgb(255, 255, 255)'); // White text
        });
    });
    
    // Test Case 8: PIN Input Security and Usability
    describe('TC8: PIN Input Security and Usability', () => {
        test('should mask PIN input by default', async () => {
            await navigateToOfflineLogin(page);
            
            const pinInput = await page.$('input.pin-input');
            const inputType = await pinInput.getAttribute('type');
            expect(inputType).toBe('password');
            
            // Type PIN
            await pinInput.type('1234');
            
            // Verify masking
            const displayedValue = await pinInput.evaluate(el => el.value);
            expect(displayedValue).toBe('1234'); // Value is there
            
            // But visually masked (take screenshot)
            await page.screenshot({ 
                path: 'tests/screenshots/masked-pin.png',
                clip: { x: 500, y: 300, width: 400, height: 100 }
            });
        });
        
        test('should prevent copy/paste operations', async () => {
            await navigateToOfflineLogin(page);
            
            const pinInput = await page.$('input.pin-input');
            await pinInput.type('1234');
            
            // Try to copy
            await pinInput.click({ clickCount: 3 }); // Select all
            const canCopy = await page.evaluate(() => {
                try {
                    document.execCommand('copy');
                    return navigator.clipboard.readText();
                } catch (e) {
                    return null;
                }
            });
            expect(canCopy).toBeNull();
            
            // Try to paste
            await page.evaluate(() => {
                navigator.clipboard.writeText('5678');
            });
            
            await pinInput.click();
            await page.keyboard.press('Control+V');
            
            const value = await pinInput.evaluate(el => el.value);
            expect(value).toBe('1234'); // Paste prevented
        });
        
        test('should auto-clear after 30 seconds', async () => {
            await navigateToOfflineLogin(page);
            
            const pinInput = await page.$('input.pin-input');
            await pinInput.type('1234');
            
            // Wait 30 seconds (or mock timer)
            await page.waitForTimeout(30100);
            
            const value = await pinInput.evaluate(el => el.value);
            expect(value).toBe('');
        });
        
        test('should have appropriate touch targets for mobile', async () => {
            // Set mobile viewport
            await page.setViewportSize({ width: 375, height: 667 });
            
            await navigateToOfflineLogin(page);
            
            const pinInput = await page.$('input.pin-input');
            const box = await pinInput.boundingBox();
            
            // Minimum touch target size
            expect(box.height).toBeGreaterThanOrEqual(44);
            expect(box.width).toBeGreaterThanOrEqual(200);
            
            // Check font size
            const fontSize = await pinInput.evaluate(el => {
                return window.getComputedStyle(el).fontSize;
            });
            expect(parseInt(fontSize)).toBeGreaterThanOrEqual(16);
        });
    });
    
    // Test Case 6: UI Performance Under Load
    describe('TC6: UI Performance Under Load', () => {
        test('should search products efficiently', async () => {
            // Load 10k products into UI
            await loadTestProducts(page, 10000);
            
            const searchInput = await page.$('.product-search');
            
            // Measure search performance
            const startTime = Date.now();
            await searchInput.type('Product 5000');
            
            // Wait for results
            await page.waitForSelector('.product-item', { timeout: 500 });
            const endTime = Date.now();
            
            expect(endTime - startTime).toBeLessThan(500);
            
            // Check results count
            const results = await page.$$('.product-item');
            expect(results.length).toBeGreaterThan(0);
        });
        
        test('should maintain smooth scrolling with large dataset', async () => {
            await loadTestProducts(page, 10000);
            
            // Measure frame rate during scroll
            const metrics = await page.evaluate(async () => {
                const frames = [];
                let lastTime = performance.now();
                
                const measureFrame = () => {
                    const currentTime = performance.now();
                    const frameDuration = currentTime - lastTime;
                    frames.push(frameDuration);
                    lastTime = currentTime;
                };
                
                // Scroll and measure
                const container = document.querySelector('.product-list');
                let scrollTop = 0;
                
                return new Promise(resolve => {
                    const scrollInterval = setInterval(() => {
                        measureFrame();
                        scrollTop += 100;
                        container.scrollTop = scrollTop;
                        
                        if (scrollTop > 5000) {
                            clearInterval(scrollInterval);
                            resolve({
                                frames: frames,
                                avgFrameTime: frames.reduce((a, b) => a + b) / frames.length
                            });
                        }
                    }, 16); // Target 60fps
                });
            });
            
            // Should maintain close to 60fps (16.67ms per frame)
            expect(metrics.avgFrameTime).toBeLessThan(20);
        });
        
        test('should handle rapid UI interactions', async () => {
            // Rapid product additions
            const addButtons = await page.$$('.add-product-btn');
            
            const startTime = Date.now();
            
            // Click 50 products rapidly
            for (let i = 0; i < Math.min(50, addButtons.length); i++) {
                await addButtons[i].click();
                // No wait between clicks
            }
            
            const endTime = Date.now();
            
            // Should complete within reasonable time
            expect(endTime - startTime).toBeLessThan(5000);
            
            // Verify cart updated correctly
            const cartCount = await page.$eval('.cart-item-count', el => el.textContent);
            expect(parseInt(cartCount)).toBe(50);
        });
    });
    
    // Test Case 3: Network Flapping UI Behavior
    describe('TC3: Network Flapping UI Behavior', () => {
        test('should handle network flapping gracefully', async () => {
            const networkStates = [];
            
            // Monitor network state changes
            await page.exposeFunction('logNetworkState', (state) => {
                networkStates.push({
                    online: state,
                    timestamp: Date.now()
                });
            });
            
            await page.evaluate(() => {
                window.addEventListener('online', () => window.logNetworkState(true));
                window.addEventListener('offline', () => window.logNetworkState(false));
            });
            
            // Simulate network flapping
            for (let i = 0; i < 10; i++) {
                await context.setOffline(i % 2 === 1);
                await page.waitForTimeout(500);
            }
            
            // Check UI didn't crash or freeze
            const isResponsive = await page.evaluate(() => {
                // Try to click something
                const btn = document.querySelector('.pos-topheader button');
                if (btn) {
                    btn.click();
                    return true;
                }
                return false;
            });
            
            expect(isResponsive).toBe(true);
            expect(networkStates.length).toBeGreaterThanOrEqual(8); // Some state changes
        });
    });
    
    // Test Case 10: Extended Offline UI Stress Test
    describe('TC10: Extended Offline UI Stress Test', () => {
        test('should remain responsive after 1000 offline transactions', async () => {
            await context.setOffline(true);
            
            // Create many transactions
            for (let day = 0; day < 7; day++) {
                for (let order = 0; order < 100; order++) {
                    if (order % 10 === 0) {
                        // Check UI responsiveness every 10 orders
                        const startCheck = Date.now();
                        await page.click('.new-order-btn');
                        const endCheck = Date.now();
                        
                        expect(endCheck - startCheck).toBeLessThan(1000);
                    }
                    
                    // Quick order creation
                    await createQuickOrder(page);
                }
            }
            
            // Final performance check
            const finalMetrics = await page.metrics();
            expect(finalMetrics.JSHeapUsedSize).toBeLessThan(100 * 1024 * 1024); // Under 100MB
        });
    });
    
    // Helper Functions
    async function navigateToOfflineLogin(page) {
        await page.goto('http://localhost:8069/pos/ui');
        await page.evaluate(() => {
            // Simulate offline mode
            window.dispatchEvent(new Event('offline'));
        });
        await page.waitForSelector('.offline-login-popup');
    }
    
    async function createOfflineOrder(page, itemCount = 1) {
        for (let i = 0; i < itemCount; i++) {
            const product = await page.$(`.product-item:nth-child(${i + 1})`);
            if (product) await product.click();
        }
    }
    
    async function loadTestProducts(page, count) {
        await page.evaluate((productCount) => {
            // Inject test products into POS
            const products = [];
            for (let i = 0; i < productCount; i++) {
                products.push({
                    id: i + 1,
                    name: `Product ${i + 1}`,
                    price: Math.random() * 100,
                    barcode: `${Date.now()}${i}`
                });
            }
            
            // Assuming POS has a method to load products
            if (window.posmodel) {
                window.posmodel.db.add_products(products);
            }
        }, count);
    }
    
    async function createQuickOrder(page) {
        // Click first available product
        const firstProduct = await page.$('.product-item:first-child');
        if (firstProduct) await firstProduct.click();
        
        // Quick payment
        await page.click('.pay-button');
        await page.click('.paymentmethod:first-child');
        await page.click('.validate-button');
    }
});

// Additional Visual Regression Tests
describe('Visual Regression Tests', () => {
    test('offline login screen layout', async () => {
        const page = await browser.newPage();
        await navigateToOfflineLogin(page);
        
        await page.screenshot({
            path: 'tests/screenshots/offline-login-base.png',
            fullPage: true
        });
        
        // Compare with baseline
        // const diff = await compareImages('offline-login-base.png', 'offline-login-current.png');
        // expect(diff).toBeLessThan(0.01); // Less than 1% difference
    });
    
    test('responsive design breakpoints', async () => {
        const breakpoints = [
            { width: 320, height: 568, name: 'mobile-small' },
            { width: 768, height: 1024, name: 'tablet' },
            { width: 1920, height: 1080, name: 'desktop' }
        ];
        
        for (const viewport of breakpoints) {
            const page = await browser.newPage();
            await page.setViewportSize({ 
                width: viewport.width, 
                height: viewport.height 
            });
            
            await navigateToOfflineLogin(page);
            
            await page.screenshot({
                path: `tests/screenshots/offline-login-${viewport.name}.png`,
                fullPage: true
            });
            
            await page.close();
        }
    });
});

module.exports = {
    navigateToOfflineLogin,
    createOfflineOrder,
    loadTestProducts
};