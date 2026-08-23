# @seamstack/core

Core types and host-adapter contracts for [SeamStack](https://github.com/NotJustAnna/SeamStack).

```bash
pnpm add @seamstack/core
```

If you're building a SeamStack project, you don't install this directly; it comes in transitively via `@seamstack/cli` and the adapter packages. Install it explicitly only if you're authoring a new adapter (a frontend host or backend) and need the contracts.

## What's in here

- The contracts every adapter implements: `Serveable`, `DevContext`, `BuildContext`, `StartContext`.
- Host-adapter utilities for spawning user backend processes (PATH normalization, wire-env construction, port handshaking).
- The shared types the CLI and adapters speak to each other through.

## Authoring an adapter

A SeamStack adapter is a function returning an object that implements `Serveable`. The CLI calls it three times, once per phase (`dev`, `build`, `start`), passing the resolved topology. The adapter's job is to start a frontend dev server, run a frontend build, or spawn a backend process, and tell the seam where it's listening.

The existing adapters (`@seamstack/vite`, `@seamstack/hono`, etc.) are the canonical examples of how to consume these types.

## More

See the [SeamStack README](https://github.com/NotJustAnna/SeamStack#readme) for the user-facing picture, the mix-and-match support table, and CLI docs.
