// Minimal reproduction to find the exact infinite loop

class DebugTemplateParser {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.callDepth = 0;
    this.maxDepth = 0;
    this.callStack = [];
  }

  trace(method, entering = true) {
    if (entering) {
      this.callDepth++;
      this.maxDepth = Math.max(this.maxDepth, this.callDepth);
      this.callStack.push(`${method}@${this.pos}`);

      if (this.callDepth > 100) {
        console.error('DEEP RECURSION DETECTED');
        console.error('Call stack (last 20):');
        console.error(this.callStack.slice(-20).join('\n'));
        throw new Error('Stack depth exceeded');
      }
    } else {
      this.callDepth--;
      this.callStack.pop();
    }
  }

  peek() {
    return this.source[this.pos] || '';
  }

  advance() {
    const ch = this.source[this.pos];
    this.pos++;
    return ch;
  }

  isAtEnd() {
    return this.pos >= this.source.length;
  }

  skipWhitespace() {
    while (!this.isAtEnd() && /\s/.test(this.peek())) {
      this.advance();
    }
  }

  parseIdentifier() {
    const start = this.pos;
    while (!this.isAtEnd() && /[a-zA-Z0-9_]/.test(this.peek())) {
      this.advance();
    }
    return this.source.substring(start, this.pos);
  }

  parse() {
    this.trace('parse', true);
    try {
      this.advance(); // <
      const tagName = this.parseIdentifier();
      console.log(`Parsing tag: ${tagName}`);

      this.skipWhitespace();

      // Parse props
      let propCount = 0;
      while (!this.isAtEnd() && this.peek() !== '>' && this.peek() !== '/') {
        const prevPos = this.pos;
        console.log(`  Prop loop iteration ${++propCount}, pos=${this.pos}, char='${this.peek()}'`);

        const prop = this.parseComponentProp();

        if (!prop && this.pos === prevPos) {
          console.log(`  Breaking: prop is null and position didn't advance`);
          break;
        }

        if (propCount > 50) {
          console.error('TOO MANY PROP ITERATIONS');
          throw new Error('Infinite prop loop');
        }

        this.skipWhitespace();
      }

      console.log(`Done parsing props, pos=${this.pos}, char='${this.peek()}'`);
      return { success: true };
    } finally {
      this.trace('parse', false);
    }
  }

  parseComponentProp() {
    this.trace('parseComponentProp', true);
    try {
      const name = this.parseIdentifier();
      console.log(`    parseComponentProp: name='${name}', pos=${this.pos}, char='${this.peek()}'`);

      if (name === '') {
        console.log(`    Empty name, returning null without advancing`);
        return null;
      }

      this.skipWhitespace();

      if (this.peek() !== '=') {
        console.log(`    No =, returning null without advancing`);
        return null;
      }

      this.advance(); // =
      this.skipWhitespace();

      // For this test, just consume the value
      if (this.peek() === '"' || this.peek() === "'") {
        const quote = this.peek();
        this.advance();
        while (!this.isAtEnd() && this.peek() !== quote) {
          this.advance();
        }
        this.advance(); // closing quote
      }

      console.log(`    Parsed prop '${name}', pos=${this.pos}`);
      return { name };
    } finally {
      this.trace('parseComponentProp', false);
    }
  }
}

// Test cases
const testCases = [
  '<Card title="Test" />',
  '<Card />',
  '<div>',
];

for (const testCase of testCases) {
  console.log(`\n\n========== Testing: ${testCase} ==========`);
  try {
    const parser = new DebugTemplateParser(testCase);
    const result = parser.parse();
    console.log(`✓ SUCCESS - Max depth: ${parser.maxDepth}`);
  } catch (error) {
    console.log(`✗ ERROR: ${error.message}`);
  }
}
