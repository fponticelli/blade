// Test if just importing the test file causes OOM
console.log('Starting import test...');

try {
  await import('./tests/compiler.test.ts');
  console.log('✓ Import successful!');
} catch (error) {
  console.log(`✗ Import failed: ${error.message}`);
  console.log(error.stack);
}

console.log('Done');
