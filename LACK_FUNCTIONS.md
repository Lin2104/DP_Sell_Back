# DP_Sell - Lacking Functions & Missing Features
## Updated: 2026-04-26

---

## Project Status: ACTIVELY IMPROVING 🚀

### ✅ RECENTLY COMPLETED (2026-04-26):
1. ✅ **Forgot Password** - Full flow with email token and reset page.
2. ✅ **Sign in with Google** - Backend structure and Frontend "Google Button" added.
3. ✅ **Enhanced Security** - CSP, CORS, Rate Limiting, and Audit Logging implemented.
4. ✅ **Image Migration** - All images moved to Cloudinary for better performance.

---

## 1. AUTHENTICATION & SECURITY GAPS
### 1.1 Google Authentication Full Integration
**Status:** PARTIALLY IMPLEMENTED (Frontend Button + Backend API)
**Missing:**
- Production configuration for Google Client ID.
- Integration with `@react-oauth/google` on frontend.
- Backend token verification using `google-auth-library`.

### 1.2 Two-Factor Authentication (2FA)
**Status:** NOT YET IMPLEMENTED
**Problem:** Admin account is protected only by password.
**Solution Needed:**
- Implement TOTP (Google Authenticator) for admin logins.

---

## 2. AUTOMATION GAPS
### 2.1 SmileOne Balance Monitoring
**Status:** NOT YET IMPLEMENTED
**Problem:** If Smile Coin balance is low, automation fails silently.
**Solution Needed:**
- Check Smile Coin balance before each purchase.
- Alert admin when balance is below threshold.
**Files to Create:** `backend/services/smileone/balanceChecker.js`

### 2.2 Proxy Rotation for Browser Automation
**Status:** NOT YET IMPLEMENTED
**Problem:** Plati/SmileOne may block server IP after repeated requests.
**Solution Needed:**
- Integrate residential proxies.
- Rotate IPs for each automation request.

---

## 3. CUSTOMER EXPERIENCE GAPS
### 3.1 Automatic Payment Verification (MMQR/KBZ)
**Status:** NOT YET IMPLEMENTED
**Problem:** Many payments still require manual screenshot review.
**Solution Needed:**
- Real-time API integration with KBZ Pay / Wave Pay.
- OCR service to scan and verify payment screenshots automatically.

### 3.2 Live Support Chat
**Status:** NOT YET IMPLEMENTED
**Solution Needed:**
- In-app live chat for customers.
- Integration with the existing Telegram Support Bot.

---

## 4. ADMIN & OPERATIONAL GAPS
### 4.1 Financial Reports & Analytics
**Status:** NOT YET IMPLEMENTED
**Missing:** No profit/loss tracking or sales analytics.
**Solution Needed:**
- Dashboard showing Revenue, Cost, and Net Profit.
- Exportable CSV/PDF reports.

### 4.2 Auto-Pricing Engine
**Status:** NOT YET IMPLEMENTED
**Problem:** Manual price updates are slow when supplier costs change.
**Solution Needed:**
- Sync prices with Plati/SmileOne automatically.
- Apply dynamic markup percentages.

---

## 5. INFRASTRUCTURE GAPS
### 5.1 Redis Caching
**Status:** NOT YET IMPLEMENTED
**Missing:** Database is queried for every request.
**Solution Needed:**
- Use Redis to cache Game Catalog and Product details.

### 5.2 Unit & Integration Testing
**Status:** NOT YET IMPLEMENTED
**Missing:** No automated tests for critical payment and automation flows.

---

## UPDATED PRIORITY RECOMMENDATIONS

### 🔴 HIGH PRIORITY
1. **SmileOne Balance Monitoring** - Prevent "silent" failures.
2. **Real-time Payment Webhooks** - Fully automate the "Paid" status.
3. **Google Auth Production Setup** - Complete the social login flow.

### 🟡 MEDIUM PRIORITY
4. **Financial Dashboard** - Monitor business health.
5. **Auto-Pricing** - Keep margins consistent.
6. **Customer Email Notifications** - Improve trust with order updates.

### 🟢 LOW PRIORITY
7. **Audit Logs UI** - View admin actions in the panel.
8. **Redis Caching** - Improve site speed.
9. **2FA for Admin** - Extra security.

---

*End of Document*
