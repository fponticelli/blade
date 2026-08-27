---
'@bladets/template': minor
---

Add `createProjectCompiler()` to `@bladets/template/node`: a project compile that
reuses the per-component work it already did, keyed by the bytes it was computed
from.

`compileProjectSources` parses and compiles every component on every call, which
is right for a build and wrong for a live preview or a language server, where the
only thing that changed since the last call is the buffer being typed into. A
twenty-component project paid twenty parses and twenty compiles per keystroke
burst to rebuild a byte-identical component set. A compiler re-parses a component
when its own source or path changes, re-compiles the component set when any of
them changes - a component is checked against the registry of all of them - and
compiles the entry file every time, because that is the one that changed.

Nothing here reads a clock or an mtime: a cached value is reused only when the
exact input that produced it comes back, so `compiler.compile(sources)` and
`compileProjectSources(sources)` always agree.
