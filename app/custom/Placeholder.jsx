// Seed file for the per-tenant custom-component directory.
//
// Two jobs:
//  1. The directory must exist and contain at least one .jsx file, or the
//     bundler has nothing to build the dynamic-import context from and
//     `import('../custom/<Name>.jsx')` fails to resolve at build time.
//  2. It documents what goes here: real tenant-written components (3D, scroll
//     animation, bespoke sections), mirrored in from the active tenant's git
//     worktree by app/lib/customSync.js and referenced from a page tree as
//     { "type": "Custom", "props": { "component": "<Name>" } }.
//
// Tenant files are copied in and out around this one; it is never referenced by
// a real page.
export default function Placeholder() {
  return null;
}
