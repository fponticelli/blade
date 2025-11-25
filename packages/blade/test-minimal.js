import { compile } from './dist/index.js';

console.log('Testing compile...');

try {
  const result = await compile('<Card title="Test" />');
  console.log('SUCCESS: Component compiled');
} catch (error) {
  console.error('ERROR:', error.message);
}

process.exit(0);
