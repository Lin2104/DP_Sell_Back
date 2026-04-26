const path = require('path');
const fs = require('fs').promises;

class PlatiScraper {
    constructor(browser) {
        this.browser = browser;
        this.page = browser.page;
    }

    async scrapeMyPurchases() {
        if (!this.page) throw new Error('Browser page not initialized');

        await this.page.goto('https://plati.market/mypurchases', {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        await this.page.waitForSelector('table, .orders, .purchases', { timeout: 30000 });

        const purchases = await this.page.evaluate(() => {
            const results = [];
            const rows = document.querySelectorAll('table tr, .order-item, .purchase-item, .asp-table-data tr');

            rows.forEach(row => {
                const cells = row.querySelectorAll('td, .cell');
                if (cells.length >= 3) {
                    const productName = cells[0]?.textContent?.trim() || '';
                    const price = cells[1]?.textContent?.trim() || '';
                    const date = cells[2]?.textContent?.trim() || '';
                    const link = cells[0]?.querySelector('a')?.href || '';

                    if (productName) {
                        results.push({ productName, price, date, link });
                    }
                }
            });

            if (results.length === 0) {
                const allLinks = document.querySelectorAll('a[href*="/asp/"]');
                const items = [];
                allLinks.forEach(link => {
                    const parent = link.closest('tr, div, li');
                    if (parent) {
                        const text = parent.textContent;
                        items.push({
                            productName: link.textContent?.trim(),
                            link: link.href,
                            rawText: text
                        });
                    }
                });
                return items;
            }

            return results;
        });

        return purchases;
    }

    async scrapePurchaseDetails(purchaseLink) {
        if (!this.page) throw new Error('Browser page not initialized');

        await this.page.goto(purchaseLink, {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        const details = await this.page.evaluate(() => {
            const getText = (selectors) => {
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) return el.textContent?.trim();
                }
                return null;
            };

            const productName = getText(['.product-name h1', 'h1.title', '.product-title', 'h1']);
            const description = getText(['.product-description', '.description', '.product-content']);
            const keyElement = getText(['.key, .product-key, [class*="key"]', '.code, [class*="code"]']);
            const accountInfo = getText(['.account-info', '.credentials', '[class*="login"]', '[class*="account"]']);
            const downloadLinks = [];

            document.querySelectorAll('a[href*="download"], a[href*=".exe"], a[href*=".zip"]').forEach(link => {
                downloadLinks.push({
                    name: link.textContent?.trim(),
                    url: link.href
                });
            });

            const price = getText(['.price', '.product-price', '[class*="price"]']);

            return {
                productName,
                description,
                key: keyElement,
                accountInfo,
                downloadLinks,
                price,
                url: window.location.href
            };
        });

        return details;
    }

    async scrapeRecentPurchase(orderId = null) {
        if (!this.page) throw new Error('Browser page not initialized');

        await this.page.goto('https://plati.market/mypurchases', {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        await this.page.waitForTimeout(3000);

        const purchaseData = await this.page.evaluate((targetOrderId) => {
            const rows = document.querySelectorAll('table tr, .order-item, .purchase-item');
            let targetRow = null;

            if (targetOrderId) {
                rows.forEach(row => {
                    if (row.textContent.includes(targetOrderId)) {
                        targetRow = row;
                    }
                });
            } else {
                targetRow = rows[0];
            }

            if (!targetRow) return null;

            const getCellValue = (index) => {
                const cells = targetRow.querySelectorAll('td, .cell');
                return cells[index]?.textContent?.trim();
            };

            const link = targetRow.querySelector('a[href*="/asp/"]');

            return {
                productName: getCellValue(0),
                price: getCellValue(1) || getCellValue(0),
                date: getCellValue(2),
                link: link?.href,
                fullText: targetRow.textContent
            };
        }, orderId);

        if (purchaseData?.link) {
            purchaseData.details = await this.scrapePurchaseDetails(purchaseData.link);
        }

        return purchaseData;
    }

    async waitForPurchaseConfirmation(timeout = 120000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            await this.page.goto('https://plati.market/mypurchases', {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            await this.page.waitForTimeout(5000);

            const newPurchase = await this.page.evaluate(() => {
                const firstRow = document.querySelector('table tr:first-child, .order-item:first-child, .purchase-item:first-child');
                if (!firstRow) return null;

                const hasNewBadge = firstRow.querySelector('.new, .just-purchased, [class*="new"]');
                const cells = firstRow.querySelectorAll('td, .cell');

                return {
                    productName: cells[0]?.textContent?.trim(),
                    isNew: !!hasNewBadge,
                    rawText: firstRow.textContent
                };
            });

            if (newPurchase && (newPurchase.isNew || Date.now() - startTime > 30000)) {
                return newPurchase;
            }

            await this.page.waitForTimeout(10000);
        }

        return null;
    }

    async getAccountCredentials(purchaseLink) {
        if (!this.page) throw new Error('Browser page not initialized');

        await this.page.goto(purchaseLink, {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        const credentials = await this.page.evaluate(() => {
            const getElementText = (selectors) => {
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) return el.textContent?.trim();
                }
                return null;
            };

            const result = {
                username: null,
                password: null,
                email: null,
                additionalInfo: []
            };

            const text = document.body.innerText;

            const usernamePatterns = [
                /login[:\s]*([a-zA-Z0-9_.@]+)/i,
                /username[:\s]*([a-zA-Z0-9_.@]+)/i,
                /user[:\s]*([a-zA-Z0-9_.@]+)/i
            ];

            const passwordPatterns = [
                /password[:\s]*([a-zA-Z0-9!@#$%^&*()]+)/i,
                /pass[:\s]*([a-zA-Z0-9!@#$%^&*()]+)/i
            ];

            for (const pattern of usernamePatterns) {
                const match = text.match(pattern);
                if (match) result.username = match[1];
            }

            for (const pattern of passwordPatterns) {
                const match = text.match(pattern);
                if (match) result.password = match[1];
            }

            const emailPattern = /[a-zA-Z0-9_.]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;
            const emails = text.match(emailPattern);
            if (emails) result.email = emails[0];

            const codeBlocks = document.querySelectorAll('pre, code, .code, [class*="key"], [class*="code"]');
            codeBlocks.forEach(block => {
                const code = block.textContent?.trim();
                if (code && code.length > 3 && code.length < 100) {
                    result.additionalInfo.push(code);
                }
            });

            return result;
        });

        return credentials;
    }

    async savePurchaseScreenshot(filename) {
        if (!this.page) return null;
        const screenshotsDir = path.join(__dirname, '../../../browser_data/purchase_screenshots');
        await fs.mkdir(screenshotsDir, { recursive: true });
        const filepath = path.join(screenshotsDir, filename);
        await this.page.screenshot({ path: filepath, fullPage: true });
        return filepath;
    }
}

module.exports = PlatiScraper;