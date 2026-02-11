import { describe, it, expect } from 'vitest';
import { compile } from '@bladets/template/browser';
import { prop, render } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';

describe('Repo Issue', () => {
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
});
