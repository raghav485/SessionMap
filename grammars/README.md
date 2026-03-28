# Grammars

SessionMap uses `web-tree-sitter` and looks for language grammars in this directory.

Milestone 1 falls back to heuristic extraction when the TypeScript or JavaScript WASM grammar files are absent. Add these files here in later milestones when the parser assets are bundled:

- `tree-sitter-typescript.wasm`
- `tree-sitter-javascript.wasm`
