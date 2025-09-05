# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-08-22

### Added
- **Production Security Guards**: Optional helmet and express-rate-limit middleware with graceful fallbacks
- **Readiness Probe**: `/readyz` endpoint for Kubernetes-style health checks (200/503)
- **Security Metrics**: Prometheus `security_middlewares` gauge for helmet/rateLimit status
- **Alert Runbooks**: Comprehensive PDF service alert response procedures
- **SLO Burn-rate Alerts**: Fast/slow burn monitoring for 99% availability SLO
- **Grafana Dashboard**: Ready-to-import PDF performance monitoring template
- **Recording Rules**: p50/p95 latency and error rate metrics optimization

### Fixed
- ES module compatibility for prom-client import
- Prometheus ratio calculations using `clamp_min` instead of `clamp_max`

### Security
- CORS origin validation: block wildcards (*) and HTTP origins in production
- Environment-controlled security requirements with fail-fast mode
- Optional dependency loading to prevent server crashes when packages missing

### Environment Variables
- `SECURITY_REQUIRED=true` - Force security middleware in production
- `SECURITY_FAIL_FAST=false` - Allow startup with degraded service mode
- `CORS_ORIGINS` - Production HTTPS-only origin allowlisting

### Monitoring & Observability
- Request ID propagation and structured logging
- Sentry integration with breadcrumb tracking
- TTL expiry rate monitoring and alerting
- Comprehensive performance metrics and SLO monitoring

## [1.0.0] - 2025-08-12

### Added
- Initial PDF generation system with Puppeteer
- Vue 3 + Ionic frontend with report preview
- Supabase storage integration with signed URLs
- E2E testing with Cypress
- Basic monitoring and health checks

### Features
- Multiple document types (delivery reports, invoices)
- Japanese font support for PDF generation
- Cloud storage with automatic cleanup
- Responsive mobile-first design
- Template-based report generation