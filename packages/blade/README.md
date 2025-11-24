# @fponticelli/blade

**Sharp templates for modern apps**

Core template engine for Blade - a hybrid build-time/runtime HTML template system.

## Installation

```bash
npm install @fponticelli/blade
```

## Quick Start

```typescript
import { compile, render } from '@fponticelli/blade';

const template = `
  <div class="greeting">
    Hello, \${user.name}!
  </div>
`;

const compiled = await compile(template);
const result = render(compiled, { user: { name: 'World' } });

console.log(result.html);
```

## Features

- Expression syntax: `$expr` and `${expr}`
- Control flow: `@if`, `@for`, `@match`
- Components with slots
- Source tracking for auditability
- Resource limits and security controls

See the [main documentation](../../docs/SPECIFICATION.md) for complete details.

## License

MIT © Franco Ponticelli
