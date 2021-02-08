# Governed Service Helpers

This repo is a group of independent modules that are used by services as
"helpers" for common requirements:

- [Health check reporting](health.ts)
- [OpenMetrics exporters](metrics.ts)
- [Version detection from URLs and Git tags](version.ts)
- [Vault Proxy with Environment Variables Detector](vault.ts)
- [Oak Middleware](vault.ts)

There is no `deps.ts` in this repo since each module, such as `health.ts` or
`version.ts` should be independently importable without importing the others.
