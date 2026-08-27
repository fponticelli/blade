# @bladets/corpus

Not published. One table of `(template, data) -> expected`, imported by
`@bladets/template`'s test suite and by `@bladets/tempo`'s.

Three renderers implement one AST. They used to be checked by three disjoint
suites, which is why every divergence between them was green in CI: `$!` raw
interpolation behaved three different ways, the reactive sink double-escaped
every value, `@match`'s `_` was bound in two of the three, `includeComments` was
inert in one, and component depth was enforced in one and absent in another.
Nothing about the way those suites were written could have caught any of it,
because no two of them ever rendered the same template.

This package is the fix: the cases live here, exactly once, and
`packages/blade-tempo/tests/corpus.test.ts` drives every one of them through
`createStringRenderer`, `createDomRenderer` and `createTempoRenderer` and
asserts the three agree. `packages/blade/tests/corpus.test.ts` drives the same
table through the two eager sinks, so the engine's own suite fails on a
divergence without needing the reactive package installed.

## Project fixtures

`fixtures/project/` holds the small on-disk Blade projects two suites read:
`@bladets/template`'s project layer, and `@bladets/lsp-server`'s analysis. They
were one directory under `packages/blade/tests/` until the language server was
extracted into its own package, and copying them would have been the first step
towards the two suites quietly testing different things - the same failure this
package exists to prevent for the renderers.

Reach them through `PROJECT_FIXTURES_ROOT` or `projectFixture(name)`, never by a
relative path across a package boundary.
