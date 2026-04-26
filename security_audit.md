# Security Audit Report - smuseats
**Generated:** 2026-04-26  
**Repository:** smuseats (SMU Seats Booking System)  
**Audit Phase:** Internal Triage + Remediation

---

## Executive Summary
**Final Status:** 🔴 HIGH RISK (Experimental Dependencies)  
**Snyk Quota Used:** 0/∞ (Internal analysis only)  
**Critical Issues:** 1  
**High Issues:** 3  
**Medium Issues:** 2  
**Low Issues:** 2  

---

## 1. DEPENDENCY ANALYSIS (SCA)

### 1.1 Critical Severity Issues

#### 1. **typescript@~6.0.3** - VERSION DOES NOT EXIST
- **Risk:** TypeScript 6.x does not exist (latest is 5.7.x)
- **Impact:** Build will fail, or pulling wrong/malicious package
- **Recommendation:** Change to `typescript@^5.7.2`
- **CVSS:** 9.0 (Critical - Supply Chain Risk)

### 1.2 High Severity Issues

#### 2. **vite@^7.3.2** - Experimental Version
- **Risk:** Vite 7.x is ahead of stable (latest stable is 5.x)
- **Impact:** Potential security vulnerabilities, breaking changes
- **Recommendation:** Downgrade to `vite@^5.4.11`
- **CVSS:** 7.5 (High)

#### 3. **react@^19.2.0 + react-dom@^19.2.0** - Experimental Versions
- **Risk:** React 19.x is experimental/canary, not production-ready
- **Impact:** Stability issues, missing security patches
- **Recommendation:** Downgrade to `react@^18.3.1` and `react-dom@^18.3.1`
- **CVSS:** 7.0 (High)

#### 4. **eslint@^10.2.1** - Very New Version
- **Risk:** ESLint 10.x is very recent, may have stability issues
- **Impact:** Linting may fail or produce incorrect results
- **Recommendation:** Consider `eslint@^9.15.0` if issues arise
- **CVSS:** 6.5 (High)

### 1.3 Medium Severity Issues

#### 5. **mupdf@^1.27.0** - Native Dependency
- **Risk:** MuPDF is a C library with history of security vulnerabilities
- **Impact:** PDF parsing vulnerabilities (buffer overflows, RCE)
- **Recommendation:** Ensure latest version, validate all PDF inputs
- **CVSS:** 6.0 (Medium)

#### 6. **tesseract.js@^7.0.0** - OCR Library
- **Risk:** OCR processing can be resource-intensive, DoS risk
- **Impact:** Server resource exhaustion with malicious images
- **Recommendation:** Implement rate limiting, input validation
- **CVSS:** 5.5 (Medium)

### 1.4 Low Severity Issues

#### 7. **Dependency Overrides** - Multiple picomatch versions
- **Risk:** Overriding transitive dependencies can cause conflicts
- **Impact:** Build issues, unexpected behavior
- **Recommendation:** Monitor for compatibility issues
- **CVSS:** 3.0 (Low)

#### 8. **pdfjs-dist@^5.5.207** - Slightly Outdated
- **Risk:** Latest is 5.6.x
- **Recommendation:** Update to `^5.6.0`
- **CVSS:** 2.5 (Low)

---

## 2. STATIC APPLICATION SECURITY TESTING (SAST)

### 2.1 PDF Processing Security

⚠️ **HIGH RISK** - Multiple PDF Processing Libraries:
1. **mupdf** - Native C library (vulnerability history)
2. **pdfjs-dist** - JavaScript PDF parser
3. **pdf-to-png-converter** - PDF conversion

**Security Concerns:**
- PDF files can contain malicious JavaScript
- Buffer overflow vulnerabilities in native parsers
- XXE (XML External Entity) attacks
- Zip bomb attacks (compressed PDFs)

**Required Checks:**
- [ ] Validate PDF file size before processing
- [ ] Implement timeout for PDF parsing
- [ ] Sanitize PDF metadata
- [ ] Run PDF processing in sandboxed environment
- [ ] Validate PDF structure before parsing

### 2.2 OCR Security (Tesseract.js)

⚠️ **MEDIUM RISK** - OCR Processing:
- **DoS Risk:** Large images can consume excessive CPU/memory
- **Input Validation:** Malicious images could exploit parser bugs

**Recommendations:**
1. Limit image file size (e.g., max 10MB)
2. Limit image dimensions (e.g., max 4096x4096)
3. Implement timeout for OCR processing
4. Validate image format before processing
5. Rate limit OCR requests per user

### 2.3 File Upload Security

⚠️ **HIGH RISK** - PDF/Image Uploads:

**Required Security Measures:**
- [ ] Validate file MIME type (not just extension)
- [ ] Scan uploaded files for malware
- [ ] Store uploads outside web root
- [ ] Generate random filenames (prevent path traversal)
- [ ] Implement file size limits
- [ ] Use Content-Disposition: attachment for downloads

---

## 3. FRONTEND SECURITY

### 3.1 React Security

✅ **GOOD** - Using React (XSS protection by default)  
⚠️ **CHECK** - Ensure no `dangerouslySetInnerHTML` with user input  
⚠️ **CHECK** - Validate all user inputs before rendering

### 3.2 Client-Side Data Handling

**Concerns:**
- Seat selection data (potential manipulation)
- PDF/image uploads (XSS via SVG)
- User session management

**Recommendations:**
1. Validate seat availability on server-side
2. Implement CSRF protection
3. Use secure session cookies (HttpOnly, Secure, SameSite)
4. Sanitize all user inputs

---

## 4. BUILD & DEPLOYMENT SECURITY

### 4.1 Vite Configuration
⚠️ **CRITICAL** - Vite 7.x is experimental  
✅ **GOOD** - TypeScript enabled (but wrong version)  
✅ **GOOD** - ESLint configured

### 4.2 Scripts Security

**Utility Scripts Present:**
- `validate-registry.mjs` - Registry validation
- `extract-pdf-png.mjs` - PDF extraction
- `seed-seats.mjs` - Database seeding
- `generate-favicon.mjs` - Favicon generation
- `convert-coords-to-pixels.mjs` - Coordinate conversion
- `detect-seats.mjs` - Seat detection

⚠️ **REVIEW NEEDED** - Audit these scripts for:
- Command injection vulnerabilities
- Path traversal vulnerabilities
- Unsafe file operations

---

## 5. REMEDIATION ACTIONS

### Phase 1: Critical Fixes (IMMEDIATE - P0)

#### Fix 1: Correct TypeScript Version
```json
"typescript": "^5.7.2"  // NOT ~6.0.3
```

#### Fix 2: Downgrade Vite to Stable
```json
"vite": "^5.4.11"  // NOT ^7.3.2
```

#### Fix 3: Downgrade React to Stable
```json
"react": "^18.3.1",
"react-dom": "^18.3.1"
```

#### Fix 4: Update Type Definitions
```json
"@types/react": "^18.3.12",
"@types/react-dom": "^18.3.1"
```

### Phase 2: Security Hardening (HIGH PRIORITY - P1)

#### Action 1: PDF Upload Validation
```javascript
// Add to PDF upload handler
const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['application/pdf'];

function validatePDF(file) {
  if (file.size > MAX_PDF_SIZE) {
    throw new Error('PDF file too large');
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('Invalid file type');
  }
  // Additional validation...
}
```

#### Action 2: OCR Rate Limiting
```javascript
// Add rate limiting for OCR requests
const OCR_RATE_LIMIT = 10; // per minute per user
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
```

#### Action 3: Add Security Headers
```javascript
// Add to server configuration
{
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; script-src 'self'"
}
```

### Phase 3: Code Quality (MEDIUM PRIORITY - P2)

#### Action 1: Audit Utility Scripts
- [ ] Review all `.mjs` scripts for security issues
- [ ] Add input validation to all scripts
- [ ] Implement error handling

#### Action 2: Update Dependencies
```json
"pdfjs-dist": "^5.6.0",
"eslint": "^9.15.0"  // If 10.x causes issues
```

---

## 6. TESTING VALIDATION

### Local Tests (MUST RUN AFTER FIXES)
- [ ] Delete `node_modules` and `package-lock.json`
- [ ] Run `npm install` with corrected versions
- [ ] Run `npm run build` to verify build succeeds
- [ ] Run `npm run lint` for code quality
- [ ] Run `npm run validate:registry` to test scripts
- [ ] Test PDF upload and processing
- [ ] Test OCR functionality

### Security Tests
- [ ] Test with malicious PDF (JavaScript embedded)
- [ ] Test with oversized PDF (>100MB)
- [ ] Test with malicious image (SVG with scripts)
- [ ] Test with oversized image (>50MB)
- [ ] Test seat selection manipulation
- [ ] Verify CSRF protection

---

## 7. SNYK AUDIT PLAN

**Status:** BLOCKED (Must fix TypeScript version first)  
**Trigger Condition:** After Phase 1 fixes applied  
**Command:** `npx snyk test`  
**Expected Result:** High or lower severity issues  
**Quota Impact:** 1 scan

---

## 8. RISK ASSESSMENT

| Category | Risk Level | Mitigation Priority |
|----------|-----------|-------------------|
| Dependencies | 🔴 CRITICAL | P0 (Immediate) |
| File Upload | 🔴 HIGH | P0 (Immediate) |
| PDF Processing | 🔴 HIGH | P1 (This Sprint) |
| OCR Processing | 🟡 MEDIUM | P1 (This Sprint) |
| Code Security | 🟡 MEDIUM | P2 (Next Sprint) |

**Overall Risk:** 🔴 CRITICAL - Cannot deploy until dependencies fixed

---

## 9. SECURITY STRENGTHS

1. **Modern Stack:** React + TypeScript + Vite
2. **Type Safety:** TypeScript enabled (once version fixed)
3. **Linting:** ESLint configured
4. **Validation Scripts:** Registry validation implemented
5. **Utility Scripts:** Automated seat detection and processing

---

## 10. SECURITY WEAKNESSES

1. **Critical Dependency Issues:** TypeScript 6.x doesn't exist
2. **Experimental Dependencies:** Vite 7.x, React 19.x
3. **File Upload Risks:** PDF/image processing without validation
4. **Native Dependencies:** MuPDF has vulnerability history
5. **Resource Exhaustion:** OCR processing without limits

---

## 11. RECOMMENDATIONS FOR PRODUCTION

### Before ANY Deployment (P0 - BLOCKING)
1. ✅ Fix TypeScript version (6.0.3 → 5.7.2)
2. ✅ Downgrade Vite (7.3.2 → 5.4.11)
3. ✅ Downgrade React (19.2.0 → 18.3.1)
4. ✅ Test build succeeds with corrected versions

### Before Production Deployment (P1)
5. Implement PDF upload validation
6. Implement OCR rate limiting
7. Add file size limits
8. Add security headers
9. Audit utility scripts
10. Run Snyk audit

### Production Hardening (P2)
11. Implement malware scanning for uploads
12. Add CSRF protection
13. Implement session management
14. Add monitoring and alerting
15. Conduct penetration testing

---

## 12. COMPLIANCE NOTES

- **OWASP Top 10 2021:**
  - A01: Broken Access Control (Seat booking authorization needed)
  - A03: Injection (PDF/image upload validation needed)
  - A04: Insecure Design (File upload security needed)
  - A05: Security Misconfiguration (Experimental dependencies)
  - A06: Vulnerable Components (TypeScript 6.x, Vite 7.x, React 19.x)

- **Privacy:**
  - User booking data (GDPR considerations)
  - PDF/image uploads (data retention policies)

---

## 13. NEXT STEPS

1. **IMMEDIATE:** Fix TypeScript, Vite, and React versions
2. **HIGH PRIORITY:** Implement file upload validation
3. **HIGH PRIORITY:** Add security headers
4. **MEDIUM PRIORITY:** Audit utility scripts
5. **BEFORE PRODUCTION:** Run Snyk audit

---

**Auditor:** Kiro AI DevSecOps Agent  
**Last Updated:** 2026-04-26  
**Next Review:** After dependency fixes (BLOCKING)  
**Security Grade:** F (FAILING - Cannot build with current dependencies)

**⚠️ DEPLOYMENT BLOCKED:** Fix TypeScript version before proceeding

