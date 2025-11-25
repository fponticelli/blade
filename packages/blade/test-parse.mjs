import { parseTemplate } from './src/parser/index.ts';

console.log('Testing parseTemplate...');

try {
  const result = parseTemplate('<Card title="Test" />');
  console.log('SUCCESS: Component parsed');
  console.log('Nodes:', result.value.length);
  console.log('Errors:', result.errors.length);
  if (result.errors.length > 0) {
    console.log('Errors:', result.errors);
  }
} catch (error) {
  console.error('ERROR:', error.message);
  console.error(error.stack);
}

process.exit(0);
