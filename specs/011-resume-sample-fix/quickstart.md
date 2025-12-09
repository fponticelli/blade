# Quickstart: Resume Sample Fix

**Date**: 2025-12-08
**Feature**: 011-resume-sample-fix

## Prerequisites

- Node.js 18+
- npm or pnpm
- VSCode (for extension testing)

## Development Setup

```bash
# From repo root
cd packages/blade

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Testing the Fix

### 1. Verify Current Failure

```bash
cd packages/blade
node -e "
const fs = require('fs');
const {parseTemplate} = require('./dist');
const template = fs.readFileSync('../../samples/resume/index.blade', 'utf-8');
const result = parseTemplate(template);
console.log('Errors:', result.errors.length);
result.errors.slice(0, 5).forEach(e => console.log('  -', e.message));
"
```

Expected output (before fix):
```
Errors: 26
  - Unclosed tag: <style>
  - Unexpected character '}'
  - ...
```

### 2. Implement the Fix

Modify `packages/blade/src/parser/template-parser.ts`:

1. Add raw content tag detection in `parseElement()`
2. Create `parseRawContent()` method for style/script
3. Handle `${...}` expression extraction within raw content

### 3. Verify the Fix

```bash
# Rebuild
npm run build

# Test parsing
node -e "
const fs = require('fs');
const {parseTemplate} = require('./dist');
const template = fs.readFileSync('../../samples/resume/index.blade', 'utf-8');
const result = parseTemplate(template);
console.log('Errors:', result.errors.length);
// Should output: Errors: 0
"

# Run full test suite
npm test
```

### 4. Test Rendering

```bash
node -e "
const fs = require('fs');
const {parseTemplate, compile, render} = require('./dist');
const template = fs.readFileSync('../../samples/resume/index.blade', 'utf-8');
const data = JSON.parse(fs.readFileSync('../../samples/resume/samples/data.json', 'utf-8'));
const ast = parseTemplate(template);
const compiled = compile(ast.value);
const html = render(compiled, data);
console.log(html.substring(0, 500));
"
```

### 5. Test VSCode Extension

```bash
cd packages/blade-vscode

# Build and install extension
npm run vscode

# Open samples/resume/index.blade in VSCode
# Verify: No errors in Problems panel
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/blade/src/parser/template-parser.ts` | Main fix location |
| `packages/blade/tests/compiler.test.ts` | Add parser tests |
| `packages/blade/tests/renderer.test.ts` | Add render tests |
| `samples/resume/index.blade` | Test fixture |
| `samples/resume/samples/data.json` | Test data |

## Validation Checklist

- [ ] `parseTemplate()` returns 0 errors for resume template
- [ ] All existing tests pass (`npm test`)
- [ ] Resume renders correctly with sample data
- [ ] VSCode shows no diagnostics for resume template
- [ ] Tempo renders resume correctly (if applicable)
