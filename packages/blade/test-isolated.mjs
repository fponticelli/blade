import { parseTemplate } from './src/parser/index.ts';

const testCases = [
  'Hello World',
  '<div>Test</div>',
  '<Card title="Test" />',
  '$foo',
  '$.bar',
  '$.',  // This might trigger the bug
  '${foo}',
];

for (const test of testCases) {
  console.log(`Testing: "${test}"`);
  try {
    const result = parseTemplate(test);
    console.log(`  ✓ Success - ${result.value.length} nodes`);
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
  }
}
