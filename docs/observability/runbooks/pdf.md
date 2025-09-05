# PDF Service Alert Runbook

## Overview

This runbook provides step-by-step response procedures for PDF service alerts. Each alert indicates different performance or reliability issues that require specific investigation and remediation steps.

## Alert Response Matrix

| Alert | Severity | Typical Cause | Response Time |
|-------|----------|---------------|---------------|
| ExpiredSignedUrlRateWarn | Warning | TTL too short | 30 minutes |
| ExpiredSignedUrlRateCrit | Critical | Widespread TTL expiry | 15 minutes |
| PdfGenerationP95High | Warning | Performance degradation | 30 minutes |
| PdfErrorRateHigh | Warning | System errors | 15 minutes |
| PdfSLOFastBurn | Critical | Rapid error budget consumption | 5 minutes |
| PdfSLOSlowBurn | Warning | Gradual error budget consumption | 1 hour |

---

## ExpiredSignedUrlRateWarn / ExpiredSignedUrlRateCrit

### **Immediate Checks (First 5 minutes)**

1. **Verify current metrics**:
   ```bash
   curl http://localhost:8787/metrics | grep expired_signed_url_encounters_total
   curl http://localhost:8787/metrics | grep pdf_requests_total
   ```

2. **Check TTL configuration**:
   ```bash
   echo $SUPABASE_SIGNED_URL_TTL_HOURS
   # Expected: 168 (7 days), minimum recommended: 24
   ```

3. **Review recent changes**:
   - TTL configuration changes in last 7 days
   - Supabase bucket policy modifications
   - Application deployment timeline

### **Investigation (5-15 minutes)**

1. **Sentry analysis**:
   - Search for `expired_signed_url_encounter` events
   - Group by `requestId` to identify patterns
   - Check user behavior (time between save and access)

2. **Storage connectivity**:
   ```bash
   # Test Supabase connection
   curl -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        "$SUPABASE_URL/rest/v1/storage/buckets"
   ```

3. **Identify user impact**:
   - Review affected user sessions via requestId
   - Check if specific document types are affected
   - Analyze geographic/temporal patterns

### **Immediate Mitigation**

**For Critical (>10% rate)**:
1. **Emergency TTL extension**:
   ```bash
   export SUPABASE_SIGNED_URL_TTL_HOURS=336  # 14 days
   # Restart API server
   npm run dev:api
   ```

2. **User communication**:
   - Notify users of temporary issue
   - Provide instructions to regenerate expired documents

**For Warning (>3% rate)**:
1. Monitor trend for 15 minutes
2. Prepare TTL extension if rate increases

### **Permanent Resolution**

1. **Analyze user workflow patterns**:
   - Average time between PDF generation and access
   - Peak usage patterns and document retention needs
   - Business requirements for document availability

2. **Optimize TTL settings**:
   ```bash
   # Recommended settings based on usage patterns:
   # High-frequency access: 24-48 hours
   # Document archival: 168-336 hours (7-14 days)
   # Business critical: 720 hours (30 days)
   ```

3. **Consider architectural improvements**:
   - Implement re-signing API endpoint
   - Add document expiry notifications
   - Background cleanup optimization

---

## PdfGenerationP95High

### **Immediate Checks**

1. **Current performance metrics**:
   ```bash
   curl http://localhost:8787/metrics | grep pdf_duration_seconds
   # Check P95 latency: job:pdf_duration_seconds:p95
   ```

2. **System resources**:
   ```bash
   htop                    # CPU/Memory usage
   df -h                   # Disk space
   free -h                 # Available memory
   ```

3. **Recent changes**:
   - Template modifications
   - Font installations
   - Puppeteer version updates
   - Infrastructure changes

### **Investigation**

1. **Identify bottlenecks**:
   - Check logs for slow operations (>6s)
   - Analyze HTML complexity and size
   - Review Puppeteer configuration

2. **Template analysis**:
   ```bash
   # Review recent template changes
   git log --oneline -10 src/templates/
   
   # Check for large images or complex CSS
   grep -r "img\|background-image" src/templates/
   ```

3. **Font and dependency issues**:
   ```bash
   # Verify Japanese fonts
   fc-list | grep -i noto
   
   # Check Puppeteer dependencies
   npm list puppeteer
   ```

### **Mitigation**

1. **Resource optimization**:
   - Increase server memory allocation
   - Optimize Docker container resources
   - Scale horizontal instances if needed

2. **Template optimization**:
   - Reduce image sizes and complexity
   - Optimize CSS for print media
   - Remove unnecessary DOM elements

3. **Puppeteer tuning**:
   ```javascript
   // Increase timeout in server/index.ts
   await page.setContent(html, {
     waitUntil: 'networkidle0',
     timeout: 30000  // Increase from default
   })
   ```

---

## PdfErrorRateHigh

### **Immediate Checks**

1. **Error distribution**:
   ```bash
   curl http://localhost:8787/metrics | grep pdf_requests_total
   # Compare success vs failure rates by route
   ```

2. **Recent error logs**:
   ```bash
   tail -f /var/log/mentor-api.log | grep -E "pdf.*Failed"
   ```

3. **System health**:
   ```bash
   curl http://localhost:8787/api/health
   ```

### **Investigation**

1. **Error pattern analysis**:
   - Group errors by type (timeout, font, parsing)
   - Check if errors correlate with specific input patterns
   - Review Sentry error grouping and frequency

2. **Dependency status**:
   - Supabase service status
   - Font availability
   - Chrome/Puppeteer functionality

3. **Input validation**:
   - Check for malformed HTML templates
   - Validate PDF generation options
   - Review recent template modifications

### **Mitigation**

1. **Immediate fixes**:
   ```bash
   # Restart services if temporary issue
   npm run port:free && npm run dev:api
   
   # Check for memory leaks
   ps aux | grep node
   ```

2. **Input sanitization**:
   - Add HTML validation
   - Implement better error handling
   - Add input size limits

3. **Fallback mechanisms**:
   - Implement retry logic
   - Add circuit breaker pattern
   - Provide degraded service mode

---

## PdfSLOFastBurn / PdfSLOSlowBurn

### **Immediate Checks**

1. **SLO burn rate analysis**:
   ```bash
   # Check current error rates
   curl http://localhost:8787/metrics | grep "job:pdf_error_rate"
   ```

2. **Error budget calculation**:
   ```promql
   # Remaining error budget (30-day window)
   1 - (sum(rate(pdf_requests_total{status="fail"}[30d])) / 
        sum(rate(pdf_requests_total[30d])))
   ```

3. **Impact assessment**:
   - Number of affected users
   - Business impact scope
   - Time to SLO violation at current rate

### **Investigation**

1. **Root cause analysis**:
   - Identify primary error sources
   - Check for cascading failures
   - Review infrastructure events

2. **Trend analysis**:
   - Compare with historical baselines
   - Identify accelerating factors
   - Check for seasonal patterns

### **Mitigation**

**For Fast Burn (Critical)**:
1. **Emergency response**:
   - Activate incident response team
   - Consider temporary service degradation
   - Implement immediate fixes or rollbacks

2. **Load reduction**:
   - Enable rate limiting if applicable
   - Defer non-critical PDF generation
   - Scale infrastructure immediately

**For Slow Burn (Warning)**:
1. **Proactive monitoring**:
   - Increase monitoring frequency
   - Set up escalation procedures
   - Prepare mitigation strategies

2. **Gradual optimization**:
   - Implement performance improvements
   - Optimize error-prone operations
   - Plan infrastructure upgrades

---

## Emergency Contacts

| Role | Contact | Escalation Time |
|------|---------|----------------|
| On-call Engineer | [Primary Contact] | Immediate |
| DevOps Lead | [Secondary Contact] | 15 minutes |
| Product Owner | [Business Contact] | 30 minutes |
| Infrastructure Team | [Infra Contact] | 1 hour |

## Quick Reference Commands

```bash
# Health check
curl http://localhost:8787/api/health

# Metrics overview
curl http://localhost:8787/metrics | grep -E "pdf_|expired_"

# Service restart
npm run port:free && npm run dev:api

# Log monitoring
tail -f /var/log/mentor-api.log | grep -E "pdf|ERROR|WARN"

# Resource monitoring
htop && free -h && df -h

# TTL emergency extension
export SUPABASE_SIGNED_URL_TTL_HOURS=336
```

## Post-Incident Actions

1. **Document lessons learned**
2. **Update monitoring thresholds if needed**
3. **Improve alerting based on response experience**
4. **Schedule preventive maintenance**
5. **Update this runbook with new insights**

---

*Last updated: Auto-generated with implementation*
*Next review: After first incident response*