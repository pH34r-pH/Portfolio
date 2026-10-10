# Three.js 0.186.1

Unmodified MIT-licensed ES modules copied from the `three@0.186.1` npm
package locked by the root `package-lock.json`. The existing model already used
this exact engine release via unpkg; serving the same code locally makes the
publication bundle self-contained and removes runtime CDN availability/CORS/TLS
as a rendering prerequisite. The engine is loaded only when the model enters the
viewport, and is not requested for reduced-motion or forced-colors views.

Upstream: https://github.com/mrdoob/three.js
Package: https://registry.npmjs.org/three/-/three-0.186.1.tgz
License: `LICENSE` (MIT)

SHA-256 of copied files:

- `three.module.js`: `9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea`
- `three.core.js`: `9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6`
- `three.webgpu.js`: `15cfce5c653541704fd9a3463c39d3e8b854bb6265ccd854d7cfe74090625cc6`
- `LICENSE`: `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc`

For an intentional engine upgrade, update the exact npm pin and lockfile, copy
these engine files from `node_modules/three`, record their hashes here, update the
lazy import path and audit detection, and run the model and existing UX gates.
