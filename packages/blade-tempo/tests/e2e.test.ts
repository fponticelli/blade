// @bladets/tempo - End-to-end tests
// Verifies DOM updates reactively when signals change

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compile } from '@bladets/template';
import { prop, render, TextNode } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';

describe('e2e reactive rendering', () => {
  let container: HTMLElement;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    cleanup?.();
    container.remove();
  });

  // First verify Tempo itself works reactively
  it('should verify Tempo TextNode reactivity', () => {
    const data = prop('Hello');
    cleanup = render(TextNode(data), container);

    expect(container.textContent).toBe('Hello');

    data.value = 'World';
    expect(container.textContent).toBe('World');
  });

  it('should verify Tempo derived signal reactivity', async () => {
    const data = prop({ name: 'Hello' });
    const derived = data.map(d => d.name);
    cleanup = render(TextNode(derived), container);

    expect(container.textContent).toBe('Hello');

    data.value = { name: 'World' };
    // Wait for microtask to propagate
    await Promise.resolve();
    expect(container.textContent).toBe('World');
  });

  it('should render initial content', async () => {
    const template = compile('<div>Hello, ${name}!</div>');
    const renderer = createTempoRenderer(template);
    const data = prop({ name: 'World' });

    cleanup = render(renderer(data), container);

    expect(container.innerHTML).toContain('Hello, World!');
  });

  it('should update DOM when signal changes', async () => {
    const template = compile('<div>Count: ${count}</div>');
    const renderer = createTempoRenderer(template);
    const data = prop({ count: 0 });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('Count: 0');

    // Update the signal
    data.value = { count: 42 };

    // Wait for microtask to propagate
    await Promise.resolve();

    // DOM should reflect the new value
    expect(container.innerHTML).toContain('Count: 42');
  });

  it('should handle helper functions', async () => {
    const template = compile('<div>${double($value)}</div>');
    const renderer = createTempoRenderer(template, {
      helpers: {
        double: () => ((n: number) => n * 2) as (...args: unknown[]) => unknown,
      },
    });
    const data = prop({ value: 5 });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('10');

    data.value = { value: 21 };
    await Promise.resolve();
    expect(container.innerHTML).toContain('42');
  });

  it('should handle globals', async () => {
    const template = compile('<div>${$.siteName}: ${title}</div>');
    const renderer = createTempoRenderer(template, {
      globals: { siteName: 'MySite' },
    });
    const data = prop({ title: 'Home' });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('MySite: Home');

    data.value = { title: 'About' };
    await Promise.resolve();
    expect(container.innerHTML).toContain('MySite: About');
  });

  // ==========================================================================
  // @if conditionals
  // ==========================================================================

  it('should render @if when condition is true', async () => {
    const template = compile('<div>@if(show) { <span>Visible</span> }</div>');
    const renderer = createTempoRenderer(template);
    const data = prop({ show: true });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('Visible');
  });

  it('should not render @if when condition is false', async () => {
    const template = compile('<div>@if(show) { <span>Visible</span> }</div>');
    const renderer = createTempoRenderer(template);
    const data = prop({ show: false });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).not.toContain('Visible');
  });

  it('should update @if reactively when condition changes', async () => {
    const template = compile('<div>@if(show) { <span>Visible</span> }</div>');
    const renderer = createTempoRenderer(template);
    const data = prop({ show: false });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).not.toContain('Visible');

    data.value = { show: true };
    await Promise.resolve();
    expect(container.innerHTML).toContain('Visible');

    data.value = { show: false };
    await Promise.resolve();
    expect(container.innerHTML).not.toContain('Visible');
  });

  it('should render @if/@else branches correctly', async () => {
    const template = compile(`
      <div>
        @if(loggedIn) {
          <span>Welcome back!</span>
        } else {
          <span>Please log in</span>
        }
      </div>
    `);
    const renderer = createTempoRenderer(template);
    const data = prop({ loggedIn: false });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('Please log in');
    expect(container.innerHTML).not.toContain('Welcome back!');

    data.value = { loggedIn: true };
    await Promise.resolve();
    expect(container.innerHTML).toContain('Welcome back!');
    expect(container.innerHTML).not.toContain('Please log in');
  });

  it('should handle @else if chains', async () => {
    const template = compile(`
      <div>
        @if(status == "loading") {
          <span>Loading...</span>
        } else if(status == "error") {
          <span>Error occurred</span>
        } else {
          <span>Ready</span>
        }
      </div>
    `);
    const renderer = createTempoRenderer(template);
    const data = prop({ status: 'loading' });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('Loading...');

    data.value = { status: 'error' };
    await Promise.resolve();
    expect(container.innerHTML).toContain('Error occurred');
    expect(container.innerHTML).not.toContain('Loading...');

    data.value = { status: 'ready' };
    await Promise.resolve();
    expect(container.innerHTML).toContain('Ready');
    expect(container.innerHTML).not.toContain('Error occurred');
  });

  // ==========================================================================
  // @for loops
  // ==========================================================================

  it('should render @for loop items', async () => {
    const template = compile('<ul>@for(item of items) { <li>$item</li> }</ul>');
    const renderer = createTempoRenderer(template);
    const data = prop({ items: ['Apple', 'Banana', 'Cherry'] });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('Apple');
    expect(container.innerHTML).toContain('Banana');
    expect(container.innerHTML).toContain('Cherry');
  });

  it('should render @for loop with index', async () => {
    const template = compile(
      '<ul>@for(item, index of items) { <li>${index}: $item</li> }</ul>'
    );
    const renderer = createTempoRenderer(template);
    const data = prop({ items: ['A', 'B', 'C'] });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('0: A');
    expect(container.innerHTML).toContain('1: B');
    expect(container.innerHTML).toContain('2: C');
  });

  it('should update @for loop reactively when items change', async () => {
    const template = compile('<ul>@for(item of items) { <li>$item</li> }</ul>');
    const renderer = createTempoRenderer(template);
    const data = prop({ items: ['One', 'Two'] });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('One');
    expect(container.innerHTML).toContain('Two');

    data.value = { items: ['Three', 'Four', 'Five'] };
    await Promise.resolve();
    expect(container.innerHTML).not.toContain('One');
    expect(container.innerHTML).not.toContain('Two');
    expect(container.innerHTML).toContain('Three');
    expect(container.innerHTML).toContain('Four');
    expect(container.innerHTML).toContain('Five');
  });

  it('should render empty @for loop', async () => {
    const template = compile('<ul>@for(item of items) { <li>$item</li> }</ul>');
    const renderer = createTempoRenderer(template);
    const data = prop({ items: [] as string[] });

    cleanup = render(renderer(data), container);
    expect(container.querySelector('li')).toBeNull();
  });

  it('should render @for loop with object properties', async () => {
    const template = compile(
      '<ul>@for(user of users) { <li>$user.name ($user.age)</li> }</ul>'
    );
    const renderer = createTempoRenderer(template);
    const data = prop({
      users: [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ],
    });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('Alice (30)');
    expect(container.innerHTML).toContain('Bob (25)');
  });

  // ==========================================================================
  // Combined scenarios
  // ==========================================================================

  it('should handle @if inside @for', async () => {
    const template = compile(`
      <ul>
        @for(item of items) {
          @if(item.active) {
            <li>$item.name (active)</li>
          }
        }
      </ul>
    `);
    const renderer = createTempoRenderer(template);
    const data = prop({
      items: [
        { name: 'Task 1', active: true },
        { name: 'Task 2', active: false },
        { name: 'Task 3', active: true },
      ],
    });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('Task 1 (active)');
    expect(container.innerHTML).not.toContain('Task 2');
    expect(container.innerHTML).toContain('Task 3 (active)');
  });

  it('should handle @for inside @if', async () => {
    const template = compile(`
      <div>
        @if(hasItems) {
          <ul>
            @for(item of items) {
              <li>$item</li>
            }
          </ul>
        } else {
          <p>No items</p>
        }
      </div>
    `);
    const renderer = createTempoRenderer(template);
    const data = prop({ hasItems: false, items: [] as string[] });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('No items');
    expect(container.querySelector('ul')).toBeNull();

    data.value = { hasItems: true, items: ['X', 'Y', 'Z'] };
    await Promise.resolve();
    expect(container.innerHTML).not.toContain('No items');
    expect(container.innerHTML).toContain('X');
    expect(container.innerHTML).toContain('Y');
    expect(container.innerHTML).toContain('Z');
  });

  // ==========================================================================
  // Null Coalescing Operator (??)
  // ==========================================================================

  it('should use fallback when value is undefined with ??', async () => {
    const template = compile('<div>${name ?? "Anonymous"}</div>');
    const renderer = createTempoRenderer(template);
    const data = prop({ name: undefined as string | undefined });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('Anonymous');
  });

  it('should use fallback when value is null with ??', async () => {
    const template = compile('<div>${name ?? "Anonymous"}</div>');
    const renderer = createTempoRenderer(template);
    const data = prop({ name: null as string | null });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('Anonymous');
  });

  it('should use actual value when not null/undefined with ??', async () => {
    const template = compile('<div>${name ?? "Anonymous"}</div>');
    const renderer = createTempoRenderer(template);
    const data = prop({ name: 'John' });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('John');
    expect(container.innerHTML).not.toContain('Anonymous');
  });

  it('should handle null coalescing in style expressions', async () => {
    const template = compile(`
      <div style="font-family: \${fontFamily ?? 'Arial'}; color: \${color ?? 'black'};">
        Content
      </div>
    `);
    const renderer = createTempoRenderer(template);
    const data = prop({
      fontFamily: undefined as string | undefined,
      color: 'red',
    });

    cleanup = render(renderer(data), container);
    const div = container.querySelector('div');
    expect(div?.getAttribute('style')).toContain('Arial');
    expect(div?.getAttribute('style')).toContain('red');
  });

  it('should handle chained null coalescing', async () => {
    const template = compile('<div>${a ?? b ?? "fallback"}</div>');
    const renderer = createTempoRenderer(template);
    const data = prop({
      a: undefined as string | undefined,
      b: undefined as string | undefined,
    });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('fallback');

    data.value = { a: undefined, b: 'second' };
    await Promise.resolve();
    expect(container.innerHTML).toContain('second');

    data.value = { a: 'first', b: 'second' };
    await Promise.resolve();
    expect(container.innerHTML).toContain('first');
  });

  it('should handle null coalescing with property access', async () => {
    const template = compile(
      '<div>${user.nickname ?? user.name ?? "Guest"}</div>'
    );
    const renderer = createTempoRenderer(template);
    const data = prop({
      user: {
        name: 'John',
        nickname: undefined as string | undefined,
      },
    });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('John');

    data.value = { user: { name: 'John', nickname: 'Johnny' } };
    await Promise.resolve();
    expect(container.innerHTML).toContain('Johnny');
  });

  it('should update reactively when null coalescing result changes', async () => {
    const template = compile('<div>${value ?? "default"}</div>');
    const renderer = createTempoRenderer(template);
    const data = prop({ value: undefined as string | undefined });

    cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('default');

    data.value = { value: 'actual' };
    await Promise.resolve();
    expect(container.innerHTML).toContain('actual');
    expect(container.innerHTML).not.toContain('default');

    data.value = { value: undefined };
    await Promise.resolve();
    expect(container.innerHTML).toContain('default');
  });
});
