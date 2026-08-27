---
'@bladets/template': patch
---

Fix `$.now`: a configured clock is now reachable from a template.

`now()` is documented and implemented to return `$.now` when the host sets one,
and that is how a caller renders a template at a fixed instant. It never
worked. `$` is also a binding scope, and callee resolution searched the
bindings before the helpers, so `$.now` was read as a binding named `now` that
happened to hold a `Date` - and every `now()` in the template failed with
`Cannot call now: it is bound to a object, not a function`. Setting the clock
was the one thing `$.now` existed for, and it was the one thing that broke it.

The helper's unit test called the helper directly through the registry, which
is the level at which the collision is invisible; nothing rendered a template
with `$.now` set. The regression tests added here render one.

A global bound to a name a helper claims is now treated as configuration for
that helper - the same way `formatDate` already reads `$.locale` and
`$.timezone` - and falls through to it. Nothing else changes: a **local** still
shadows a helper and still raises `NOT_CALLABLE`, a global bound to a host
function is still refused, and a global bound under a name no helper claims is
still `NOT_CALLABLE` with the message it always had.
