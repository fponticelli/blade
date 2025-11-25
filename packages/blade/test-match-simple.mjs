import { parseTemplate } from './src/parser/index.ts';

const testInput = `
@match(value) {
  when "paid" {
    <div>Paid</div>
  }
}
`;

console.log('Parsing simple @match with literal case...');
try {
  const result = parseTemplate(testInput);
  console.log('✓ Success!');
  console.log('Errors:', result.errors);
} catch (error) {
  console.log('✗ Error:', error.message);
  console.log(error.stack);
}
