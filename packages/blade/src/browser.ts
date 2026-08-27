// Blade - Sharp templates for modern apps
//
// The browser entry, kept as an alias of the default one.
//
// It exists because for several releases the default entry was NOT browser-safe
// - it statically imported the filesystem-backed project API - and `./browser`
// was the only surface that loaded in a bundler or on an edge runtime.
// `@bladets/tempo` still imports through it, and so does every consumer who
// followed the old README. The default entry is now runtime-neutral itself, so
// the two are the same module and this one is a re-export rather than a second
// list that could drift from the first.
//
// New code should import `@bladets/template`. This subpath stays published.

export * from './index.js';
