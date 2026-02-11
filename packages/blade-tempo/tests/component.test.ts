import { describe, it, expect } from 'vitest';
import { compile } from '@bladets/template/browser';
import { prop, render } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';

describe('Component rendering', () => {
  it('should render inline component with props', async () => {
    const source = `
<template:Badge label! type="neutral">
  <span class="badge-$type">$label</span>
</template:Badge>

<div>
  <Badge label="Test Label" />
</div>
        `;
    const template = compile(source);
    const renderer = createTempoRenderer(template);
    const container = document.createElement('div');

    render(renderer(prop({})), container);

    expect(container.innerHTML).toContain('Test Label');
  });

  it('should render inline component with variable props', async () => {
    const source = `
<template:Badge label!>
  <span>$label</span>
</template:Badge>

<div>
  <Badge label=$user.name />
</div>
    `;
    const template = compile(source);
    const renderer = createTempoRenderer(template);
    const container = document.createElement('div');
    const data = prop({ user: { name: 'Alice' } });
    
    // Initial render
    const cleanup = render(renderer(data), container);
    expect(container.innerHTML).toContain('Alice');
    
    // Update signal
    data.value = { user: { name: 'Bob' } };
    await Promise.resolve(); // wait for reactivity
    expect(container.innerHTML).toContain('Bob');
    cleanup();
  });
});
