// Quick test to verify parser doesn't infinite loop
import { compile } from './src/compiler/index.js';

async function test() {
  console.log('Testing basic compilation...');

  // Test 1: Simple text
  const result1 = await compile('Hello, World!');
  console.log('✓ Simple text works');

  // Test 2: HTML element
  const result2 = await compile('<div>Hello</div>');
  console.log('✓ HTML element works');

  // Test 3: Expression
  const result3 = await compile('$foo');
  console.log('✓ Expression works');

  // Test 4: Component (this was problematic)
  const result4 = await compile('<Card title="test" />');
  console.log('✓ Component works');

  // Test 5: Malformed tag that could cause infinite loop
  const result5 = await compile('<!test>');
  console.log('✓ Malformed tag handled');
  console.log('  Errors:', result5.diagnostics.length);

  console.log('\nAll quick tests passed!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
