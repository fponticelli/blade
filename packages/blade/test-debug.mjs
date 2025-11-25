// Simple test to find the infinite loop
import { parseTemplate } from './src/parser/index.ts';

const testCases = [
  '<Card title="Test" />',
  '<div>Hello</div>',
  '<Card />',
  'Hello World',
  '<div class="test">Content</div>',
  '@if(true) { <div>Yes</div> }',
];

console.log('Starting parse tests...\n');

for (const testCase of testCases) {
  console.log(`Testing: ${testCase}`);

  let iterations = 0;
  const maxIterations = 1000;

  // Monkey-patch to detect infinite loops
  const originalParseTemplate = parseTemplate;

  try {
    const startTime = Date.now();
    const result = parseTemplate(testCase);
    const duration = Date.now() - startTime;

    console.log(`  ✓ Success in ${duration}ms - ${result.value.length} nodes, ${result.errors.length} errors`);
    if (result.errors.length > 0) {
      result.errors.forEach(err => console.log(`    Error: ${err.message}`));
    }
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
  }
  console.log('');
}

console.log('All tests completed!');
