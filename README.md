# Governed Service Helpers

This repo is a group of independent modules that are used by services as "helpers" for common requirements:

* [Health check reporting](health.ts)
* [Version detection from URLs and Git tags](version.ts)

There is no `deps.ts` in this repo since each module, such as `health.ts` or `version.ts` should be independently importable without importing the others.