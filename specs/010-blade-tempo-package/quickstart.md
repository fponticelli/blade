# Quickstart: @bladets/tempo

Get started with @bladets/tempo in under 2 minutes.

## Installation

```bash
npm install @bladets/tempo @bladets/template @tempots/dom
```

## Basic Usage

```typescript
import { compile } from '@bladets/template';
import { createTempoRenderer } from '@bladets/tempo';
import { prop, render } from '@tempots/dom';

// 1. Define your template
const templateSource = `
  <div class="greeting">
    <h1>Hello, \${name}!</h1>
    <p>You have \${messages.length} messages.</p>
  </div>
`;

// 2. Compile the template
const template = compile(templateSource);

// 3. Create the Tempo renderer
const renderer = createTempoRenderer(template);

// 4. Create reactive data
const data = prop({
  name: 'Alice',
  messages: ['Hello', 'Welcome', 'Goodbye']
});

// 5. Mount to DOM
render(renderer(data), document.getElementById('app')!);

// 6. Update data - DOM updates automatically!
setTimeout(() => {
  data.value = { ...data.value, name: 'Bob' };
}, 2000);
```

## With Conditionals

```typescript
const template = compile(`
  <div>
    @if(isLoggedIn) {
      <span>Welcome back, \${user.name}!</span>
    } else {
      <span>Please log in</span>
    }
  </div>
`);

const renderer = createTempoRenderer(template);
const data = prop({ isLoggedIn: false, user: { name: '' } });

render(renderer(data), document.body);

// Toggle login state
data.value = { isLoggedIn: true, user: { name: 'Alice' } };
```

## With Loops

```typescript
const template = compile(`
  <ul>
    @for(item, index of items) {
      <li>\${index + 1}. \${item.name} - \${item.price}</li>
    }
  </ul>
`);

const renderer = createTempoRenderer(template);
const data = prop({
  items: [
    { name: 'Apple', price: 1.00 },
    { name: 'Banana', price: 0.50 }
  ]
});

render(renderer(data), document.body);

// Add item - list updates automatically
data.value = {
  items: [...data.value.items, { name: 'Orange', price: 0.75 }]
};
```

## With Helper Functions

```typescript
const template = compile(`
  <div>
    <p>Total: \${formatCurrency(total)}</p>
    <p>Date: \${formatDate(createdAt)}</p>
  </div>
`);

const renderer = createTempoRenderer(template, {
  helpers: {
    formatCurrency: (n: number) => `$${n.toFixed(2)}`,
    formatDate: (d: Date) => d.toLocaleDateString()
  }
});

const data = prop({
  total: 123.456,
  createdAt: new Date()
});

render(renderer(data), document.body);
```

## With Global Variables

```typescript
const template = compile(`
  <footer>
    <p>\${$.siteName} v\${$.version}</p>
  </footer>
`);

const renderer = createTempoRenderer(template, {
  globals: {
    siteName: 'My Awesome App',
    version: '1.0.0'
  }
});

const data = prop({}); // No data needed, using globals
render(renderer(data), document.body);
```

## Composing with Tempo Components

```typescript
import { html, When } from '@tempots/dom';

// Blade template for a product card
const productTemplate = compile(`
  <div class="product">
    <h3>\${name}</h3>
    <p class="price">\${formatCurrency(price)}</p>
  </div>
`);

const ProductCard = createTempoRenderer(productTemplate, {
  helpers: { formatCurrency: (n: number) => `$${n.toFixed(2)}` }
});

// Compose with regular Tempo components
function App() {
  const products = prop([
    { name: 'Widget', price: 9.99 },
    { name: 'Gadget', price: 19.99 }
  ]);

  return html.div(
    html.h1('Product Catalog'),
    When(
      products.map(p => p.length > 0),
      () => html.div(
        ...products.value.map(p => ProductCard(prop(p)))
      ),
      () => html.p('No products available')
    )
  );
}

render(App(), document.body);
```

## Error Handling

By default, expression errors are swallowed and logged:

```typescript
const renderer = createTempoRenderer(template, {
  onError: (error, location) => {
    console.error(`Template error at line ${location.start.line}:`, error.message);
    // Optionally report to error tracking service
  }
});
```

## TypeScript Support

Full type inference for your data:

```typescript
interface UserData {
  name: string;
  email: string;
  preferences: {
    theme: 'light' | 'dark';
  };
}

const renderer = createTempoRenderer<UserData>(template);
const data = prop<UserData>({
  name: 'Alice',
  email: 'alice@example.com',
  preferences: { theme: 'dark' }
});

// Type-safe updates
data.value = { ...data.value, name: 'Bob' }; // OK
// data.value = { name: 123 }; // Type error!
```

## Next Steps

- Read the [full documentation](../../../packages/blade-tempo/README.md)
- See [API reference](./contracts/api.ts)
- Explore [test examples](../../../packages/blade-tempo/tests/)
