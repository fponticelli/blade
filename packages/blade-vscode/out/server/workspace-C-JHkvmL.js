var $ = Object.defineProperty;
var B = (t, e, s) => e in t ? $(t, e, { enumerable: !0, configurable: !0, writable: !0, value: s }) : t[e] = s;
var u = (t, e, s) => B(t, typeof e != "symbol" ? e + "" : e, s);
function l(t) {
  const e = (t == null ? void 0 : t.line) ?? 1, s = (t == null ? void 0 : t.column) ?? 1, i = (t == null ? void 0 : t.offset) ?? 0;
  return {
    start: { line: e, column: s, offset: i },
    end: {
      line: (t == null ? void 0 : t.endLine) ?? e,
      column: (t == null ? void 0 : t.endColumn) ?? s + 1,
      offset: (t == null ? void 0 : t.endOffset) ?? i + 1
    },
    source: t == null ? void 0 : t.source
  };
}
const P = {
  /**
   * Creates a key path item.
   * @example path.key('order')
   */
  key(t) {
    return { kind: "key", key: t };
  },
  /**
   * Creates an index path item.
   * @example path.index(0)
   */
  index(t) {
    return { kind: "index", index: t };
  },
  /**
   * Creates a star (wildcard) path item.
   * @example path.star()
   */
  star() {
    return { kind: "star" };
  },
  /**
   * Parses a path string into path items.
   * @example path.parse('order.customer.name') → [key('order'), key('customer'), key('name')]
   * @example path.parse('items[0].name') → [key('items'), index(0), key('name')]
   * @example path.parse('items[*].price') → [key('items'), star(), key('price')]
   */
  parse(t) {
    const e = [], s = t.replace(/^\$\.?/, "").split(/\.|\[|\]/);
    for (const i of s)
      i && (i === "*" ? e.push(P.star()) : /^\d+$/.test(i) ? e.push(P.index(parseInt(i, 10))) : e.push(P.key(i)));
    return e;
  }
};
function G(t) {
  return t == null ? "nil" : typeof t == "string" ? "string" : typeof t == "number" ? "number" : typeof t == "boolean" ? "boolean" : "nil";
}
const L = {
  /**
   * Creates a literal node.
   * @example expr.literal(123)
   * @example expr.literal("hello")
   */
  literal(t, e) {
    return {
      kind: "literal",
      type: (e == null ? void 0 : e.type) ?? G(t),
      value: t,
      location: (e == null ? void 0 : e.location) ?? l()
    };
  },
  /**
   * Creates a path node.
   * @example expr.path([path.key('order'), path.key('total')])
   * @example expr.path([path.key('currency')], { isGlobal: true })
   */
  pathNode(t, e) {
    return {
      kind: "path",
      segments: t,
      isGlobal: (e == null ? void 0 : e.isGlobal) ?? !1,
      location: (e == null ? void 0 : e.location) ?? l()
    };
  },
  /**
   * Creates a path node from a string.
   * @example expr.pathFrom('order.customer.name')
   * @example expr.pathFrom('$.currency', { isGlobal: true })
   * @example expr.pathFrom('items[0].name')
   * @example expr.pathFrom('items[*].price')
   */
  pathFrom(t, e) {
    const s = P.parse(t);
    return L.pathNode(s, {
      isGlobal: (e == null ? void 0 : e.isGlobal) ?? t.startsWith("$"),
      location: e == null ? void 0 : e.location
    });
  },
  /**
   * Creates a unary operation node.
   * @example expr.unary('!', expr.pathFrom('isValid'))
   * @example expr.unary('-', expr.literal(10))
   */
  unary(t, e, s) {
    return {
      kind: "unary",
      operator: t,
      operand: e,
      location: s ?? l()
    };
  },
  /**
   * Creates a binary operation node.
   * @example expr.binary('+', expr.pathFrom('a'), expr.pathFrom('b'))
   */
  binary(t, e, s, i) {
    return {
      kind: "binary",
      operator: t,
      left: e,
      right: s,
      location: i ?? l()
    };
  },
  /**
   * Creates a ternary expression node.
   * @example expr.ternary(condition, expr.literal('yes'), expr.literal('no'))
   */
  ternary(t, e, s, i) {
    return {
      kind: "ternary",
      condition: t,
      truthy: e,
      falsy: s,
      location: i ?? l()
    };
  },
  /**
   * Creates a function call node.
   * @example expr.call('sum', [expr.pathFrom('items')])
   * @example expr.call('formatCurrency', [expr.literal(100)])
   */
  call(t, e = [], s) {
    return {
      kind: "call",
      callee: t,
      args: e,
      location: s ?? l()
    };
  },
  /**
   * Creates an array wildcard node.
   * @example expr.wildcard(expr.pathFrom('items[*].price'))
   */
  wildcard(t, e) {
    return {
      kind: "wildcard",
      path: t,
      location: e ?? l()
    };
  }
}, m = {
  /**
   * Creates a text node with literal and/or expression segments.
   * @example node.text([seg.literal('Hello')])
   * @example node.text([seg.literal('Total: '), seg.expr(expr.pathFrom('total'))])
   */
  text(t, e) {
    return {
      kind: "text",
      segments: t,
      location: e ?? l()
    };
  },
  /**
   * Creates a text node from a plain string.
   * @example node.textLiteral('Hello, world!')
   */
  textLiteral(t, e) {
    return m.text([R.literal(t, e)], e);
  },
  /**
   * Creates an HTML element node.
   * @example node.element({ tag: 'div', attributes: [attr.static('class', 'foo')] })
   */
  element(t) {
    return {
      kind: "element",
      tag: t.tag,
      attributes: t.attributes ?? [],
      children: t.children ?? [],
      location: t.location ?? l(),
      metadata: t.metadata
    };
  },
  /**
   * Creates an if/else if/else node.
   * @example node.ifNode({ branches: [{ condition: expr.pathFrom('isValid'), body: [...] }] })
   */
  ifNode(t) {
    return {
      kind: "if",
      branches: t.branches.map((e) => ({
        condition: e.condition,
        body: e.body,
        location: e.location ?? l()
      })),
      elseBranch: t.elseBranch,
      location: t.location ?? l()
    };
  },
  /**
   * Creates a for loop node.
   * @example node.forLoop({ itemVar: 'item', itemsExpr: expr.pathFrom('items'), body: [...] })
   */
  forLoop(t) {
    return {
      kind: "for",
      itemVar: t.itemVar,
      itemsExpr: t.itemsExpr,
      indexVar: t.indexVar,
      iterationType: t.iterationType ?? "of",
      body: t.body,
      location: t.location ?? l()
    };
  },
  /**
   * Creates a match/switch node.
   * @example node.match({ value: expr.pathFrom('status'), cases: [...] })
   */
  match(t) {
    return {
      kind: "match",
      value: t.value,
      cases: t.cases,
      defaultCase: t.defaultCase,
      location: t.location ?? l()
    };
  },
  /**
   * Creates a let/variable declaration node.
   * @example node.letNode({ name: 'x', value: expr.literal(10) })
   */
  letNode(t) {
    return {
      kind: "let",
      name: t.name,
      isGlobal: t.isGlobal ?? !1,
      value: t.value,
      location: t.location ?? l()
    };
  },
  /**
   * Creates a function expression.
   * @example node.fn({ params: ['x', 'y'], body: expr.binary('+', ...) })
   */
  fn(t) {
    return {
      kind: "function",
      params: t.params,
      body: t.body,
      location: t.location ?? l()
    };
  },
  /**
   * Creates a component instance node.
   * @example node.component({ name: 'Card', props: [...], children: [...] })
   */
  component(t) {
    var e;
    return {
      kind: "component",
      name: t.name,
      props: ((e = t.props) == null ? void 0 : e.map((s) => ({
        name: s.name,
        value: s.value,
        location: s.location ?? l()
      }))) ?? [],
      children: t.children ?? [],
      propPathMapping: t.propPathMapping ?? /* @__PURE__ */ new Map(),
      location: t.location ?? l()
    };
  },
  /**
   * Creates a fragment node.
   * @example node.fragment([...children])
   */
  fragment(t, e) {
    return {
      kind: "fragment",
      children: t,
      preserveWhitespace: !0,
      location: e ?? l()
    };
  },
  /**
   * Creates a slot node.
   * @example node.slot({ name: 'header', fallback: [...] })
   */
  slot(t) {
    return {
      kind: "slot",
      name: t == null ? void 0 : t.name,
      fallback: t == null ? void 0 : t.fallback,
      location: (t == null ? void 0 : t.location) ?? l()
    };
  },
  /**
   * Creates a comment node.
   * @example node.comment({ style: 'line', text: 'This is a comment' })
   */
  comment(t) {
    return {
      kind: "comment",
      style: t.style,
      text: t.text,
      location: t.location ?? l()
    };
  }
}, R = {
  /**
   * Creates a literal text segment.
   */
  literal(t, e) {
    return {
      kind: "literal",
      text: t,
      location: e ?? l()
    };
  },
  /**
   * Creates an expression text segment.
   */
  expr(t, e) {
    return {
      kind: "expr",
      expr: t,
      location: e ?? l()
    };
  }
}, A = {
  /**
   * Creates a static attribute.
   * @example attr.static('class', 'container')
   */
  static(t, e, s) {
    return {
      kind: "static",
      name: t,
      value: e,
      location: s ?? l()
    };
  },
  /**
   * Creates a dynamic expression attribute.
   * @example attr.expr('disabled', expr.unary('!', expr.pathFrom('isValid')))
   */
  expr(t, e, s) {
    return {
      kind: "expr",
      name: t,
      expr: e,
      location: s ?? l()
    };
  },
  /**
   * Creates a mixed attribute (static + expression segments).
   * @example attr.mixed('class', [{ kind: 'static', value: 'status-' }, { kind: 'expr', expr: ... }])
   */
  mixed(t, e, s) {
    return {
      kind: "mixed",
      name: t,
      segments: e,
      location: s ?? l()
    };
  },
  /**
   * Creates a static attribute value segment (for use in mixed attributes).
   */
  staticValue(t, e) {
    return {
      kind: "static",
      value: t,
      location: e ?? l()
    };
  },
  /**
   * Creates an expression attribute value segment (for use in mixed attributes).
   */
  exprValue(t, e) {
    return {
      kind: "expr",
      expr: t,
      location: e ?? l()
    };
  }
}, D = {
  /**
   * Creates a literal match case.
   * @example match.literal(['paid', 'completed'], [...body])
   */
  literal(t, e, s) {
    return {
      kind: "literal",
      values: t,
      body: e,
      location: s ?? l()
    };
  },
  /**
   * Creates an expression match case.
   * @example match.expression(expr.call('startsWith', [expr.pathFrom('_'), expr.literal('error')]), [...body])
   */
  expression(t, e, s) {
    return {
      kind: "expression",
      condition: t,
      body: e,
      location: s ?? l()
    };
  }
}, Q = {
  /**
   * Creates a root node.
   * @example root.node({ children: [...], components: new Map() })
   */
  node(t) {
    return {
      kind: "root",
      children: t.children,
      components: t.components ?? /* @__PURE__ */ new Map(),
      metadata: t.metadata ?? Q.metadata(),
      location: t.location ?? l()
    };
  },
  /**
   * Creates empty template metadata.
   */
  metadata(t) {
    return {
      globalsUsed: new Set((t == null ? void 0 : t.globalsUsed) ?? []),
      pathsAccessed: new Set((t == null ? void 0 : t.pathsAccessed) ?? []),
      helpersUsed: new Set((t == null ? void 0 : t.helpersUsed) ?? []),
      componentsUsed: new Set((t == null ? void 0 : t.componentsUsed) ?? [])
    };
  },
  /**
   * Creates a compiled template.
   */
  compiled(t) {
    return {
      root: t.root,
      diagnostics: t.diagnostics ?? []
    };
  }
}, _ = {
  node: m.element
}, T = {
  node: m.component
}, F = {
  node: m.slot
}, V = {
  node: m.comment
}, v = {
  node: (t) => m.text(t.segments, t.location),
  literalSegment: R.literal,
  exprSegment: R.expr
}, H = {
  node: (t) => t.condition && t.then ? m.ifNode({
    branches: [{ condition: t.condition, body: t.then }],
    elseBranch: t.else ?? void 0,
    location: t.location
  }) : m.ifNode({
    branches: t.branches ?? [],
    elseBranch: t.elseBranch,
    location: t.location
  })
}, X = {
  node: (t) => m.forLoop({
    itemVar: t.item,
    itemsExpr: t.iterable,
    indexVar: t.index,
    iterationType: t.iterationType,
    body: t.body,
    location: t.location
  })
}, S = {
  node: m.match,
  literalCase: (t) => D.literal(t.values, t.body, t.location),
  expressionCase: (t) => D.expression(t.condition, t.body, t.location)
}, z = {
  node: m.letNode
}, M = {
  node: (t) => m.fragment(t.children, t.location)
}, g = {
  static: (t) => A.static(t.name, t.value, t.location),
  expr: (t) => A.expr(t.name, t.expr, t.location),
  mixed: (t) => A.mixed(t.name, t.segments, t.location),
  staticValue: A.staticValue,
  exprValue: A.exprValue
};
function K(t, e) {
  return {
    start: t,
    end: e
  };
}
function b(t, e, s) {
  return {
    kind: "literal",
    type: e,
    value: t,
    location: s ?? l()
  };
}
function N(t, e, s) {
  return {
    kind: "path",
    segments: t,
    isGlobal: e,
    location: s ?? l()
  };
}
function w(t) {
  return { kind: "key", key: t };
}
function q(t) {
  return { kind: "index", index: t };
}
function Z() {
  return { kind: "star" };
}
function j(t, e, s) {
  return {
    kind: "unary",
    operator: t,
    operand: e,
    location: s ?? l()
  };
}
function J(t, e, s, i) {
  return {
    kind: "binary",
    operator: t,
    left: e,
    right: s,
    location: i ?? l()
  };
}
function Y(t, e, s, i) {
  return {
    kind: "ternary",
    condition: t,
    truthy: e,
    falsy: s,
    location: i ?? l()
  };
}
function ee(t, e, s) {
  return {
    kind: "call",
    callee: t,
    args: e,
    location: s ?? l()
  };
}
function te(t, e, s) {
  return {
    kind: "function",
    params: t,
    body: e,
    location: s ?? l()
  };
}
var h = /* @__PURE__ */ ((t) => (t.TEXT = "TEXT", t.NUMBER = "NUMBER", t.STRING = "STRING", t.TRUE = "TRUE", t.FALSE = "FALSE", t.NULL = "NULL", t.IDENTIFIER = "IDENTIFIER", t.DOLLAR = "DOLLAR", t.PLUS = "PLUS", t.MINUS = "MINUS", t.STAR = "STAR", t.SLASH = "SLASH", t.PERCENT = "PERCENT", t.BANG = "BANG", t.EQ_EQ = "EQ_EQ", t.BANG_EQ = "BANG_EQ", t.LT = "LT", t.GT = "GT", t.LT_EQ = "LT_EQ", t.GT_EQ = "GT_EQ", t.AMP_AMP = "AMP_AMP", t.PIPE_PIPE = "PIPE_PIPE", t.QUESTION_QUESTION = "QUESTION_QUESTION", t.QUESTION = "QUESTION", t.COLON = "COLON", t.LPAREN = "LPAREN", t.RPAREN = "RPAREN", t.LBRACE = "LBRACE", t.RBRACE = "RBRACE", t.LBRACKET = "LBRACKET", t.RBRACKET = "RBRACKET", t.DOT = "DOT", t.COMMA = "COMMA", t.ARROW = "ARROW", t.UNDERSCORE = "UNDERSCORE", t.AT = "AT", t.HASH = "HASH", t.EXPR_START = "EXPR_START", t.EXPR_END = "EXPR_END", t.TAG_OPEN = "TAG_OPEN", t.TAG_CLOSE = "TAG_CLOSE", t.TAG_SELF_CLOSE = "TAG_SELF_CLOSE", t.TAG_END_OPEN = "TAG_END_OPEN", t.EQUALS = "EQUALS", t.IF = "IF", t.ELSE = "ELSE", t.FOR = "FOR", t.OF = "OF", t.MATCH = "MATCH", t.WHEN = "WHEN", t.LET = "LET", t.PROPS = "PROPS", t.COMPONENT = "COMPONENT", t.SLOT = "SLOT", t.EOF = "EOF", t.NEWLINE = "NEWLINE", t))(h || {});
class se {
  constructor(e) {
    u(this, "source");
    u(this, "pos", 0);
    u(this, "line", 1);
    u(this, "column", 1);
    u(this, "tokens", []);
    u(this, "callCount", 0);
    u(this, "MAX_CALLS", 1e3);
    this.source = e;
  }
  tokenize() {
    for (; !this.isAtEnd(); ) {
      if (++this.callCount > this.MAX_CALLS) {
        const e = this.source.substring(
          Math.max(0, this.pos - 50),
          Math.min(this.source.length, this.pos + 50)
        );
        throw new Error(
          `Tokenizer exceeded maximum call limit (${this.MAX_CALLS}).
Position: ${this.pos}, Line: ${this.line}, Column: ${this.column}
Context: ...${e}...`
        );
      }
      this.scanToken();
    }
    return this.tokens.push(this.makeToken("EOF", "")), this.tokens;
  }
  scanToken() {
    const e = this.pos, s = this.advance();
    if (this.isWhitespace(s)) {
      s === `
` && this.tokens.push(
        this.makeToken("NEWLINE", s, e, this.line - 1)
      );
      return;
    }
    if (s === "$" && this.peek() === "{") {
      this.advance(), this.tokens.push(this.makeToken("EXPR_START", "${", e));
      return;
    }
    if (s === "$") {
      this.tokens.push(this.makeToken("DOLLAR", s, e));
      return;
    }
    if (s === "@") {
      this.tokens.push(this.makeToken("AT", s, e));
      return;
    }
    if (this.isAlpha(s)) {
      this.scanIdentifier(e);
      return;
    }
    if (this.isDigit(s)) {
      this.scanNumber(e);
      return;
    }
    if (s === '"' || s === "'") {
      this.scanString(s, e);
      return;
    }
    switch (s) {
      case "(":
        this.tokens.push(this.makeToken("LPAREN", s, e));
        break;
      case ")":
        this.tokens.push(this.makeToken("RPAREN", s, e));
        break;
      case "{":
        this.tokens.push(this.makeToken("LBRACE", s, e));
        break;
      case "}":
        this.tokens.push(this.makeToken("RBRACE", s, e));
        break;
      case "[":
        this.tokens.push(this.makeToken("LBRACKET", s, e));
        break;
      case "]":
        this.tokens.push(this.makeToken("RBRACKET", s, e));
        break;
      case ".":
        this.tokens.push(this.makeToken("DOT", s, e));
        break;
      case ",":
        this.tokens.push(this.makeToken("COMMA", s, e));
        break;
      case ":":
        this.tokens.push(this.makeToken("COLON", s, e));
        break;
      case "#":
        this.tokens.push(this.makeToken("HASH", s, e));
        break;
      case "_":
        this.tokens.push(this.makeToken("UNDERSCORE", s, e));
        break;
      case "+":
        this.tokens.push(this.makeToken("PLUS", s, e));
        break;
      case "-":
        this.tokens.push(this.makeToken("MINUS", s, e));
        break;
      case "*":
        this.tokens.push(this.makeToken("STAR", s, e));
        break;
      case "/":
        this.peek() === ">" ? (this.advance(), this.tokens.push(
          this.makeToken("TAG_SELF_CLOSE", "/>", e)
        )) : this.tokens.push(this.makeToken("SLASH", s, e));
        break;
      case "%":
        this.tokens.push(this.makeToken("PERCENT", s, e));
        break;
      case "!":
        this.peek() === "=" ? (this.advance(), this.tokens.push(this.makeToken("BANG_EQ", "!=", e))) : this.tokens.push(this.makeToken("BANG", s, e));
        break;
      case "=":
        this.peek() === "=" ? (this.advance(), this.tokens.push(this.makeToken("EQ_EQ", "==", e))) : this.peek() === ">" ? (this.advance(), this.tokens.push(this.makeToken("ARROW", "=>", e))) : this.tokens.push(this.makeToken("EQUALS", s, e));
        break;
      case "<":
        this.peek() === "=" ? (this.advance(), this.tokens.push(this.makeToken("LT_EQ", "<=", e))) : this.peek() === "/" ? (this.advance(), this.tokens.push(this.makeToken("TAG_END_OPEN", "</", e))) : this.tokens.push(this.makeToken("TAG_OPEN", s, e));
        break;
      case ">":
        this.peek() === "=" ? (this.advance(), this.tokens.push(this.makeToken("GT_EQ", ">=", e))) : this.tokens.push(this.makeToken("TAG_CLOSE", s, e));
        break;
      case "&":
        this.peek() === "&" && (this.advance(), this.tokens.push(this.makeToken("AMP_AMP", "&&", e)));
        break;
      case "|":
        this.peek() === "|" && (this.advance(), this.tokens.push(this.makeToken("PIPE_PIPE", "||", e)));
        break;
      case "?":
        this.peek() === "?" ? (this.advance(), this.tokens.push(
          this.makeToken("QUESTION_QUESTION", "??", e)
        )) : this.tokens.push(this.makeToken("QUESTION", s, e));
        break;
    }
  }
  scanIdentifier(e) {
    for (; this.isAlphaNumeric(this.peek()); )
      this.advance();
    const s = this.source.substring(e, this.pos), i = this.getKeywordType(s);
    this.tokens.push(this.makeToken(i, s, e));
  }
  scanNumber(e) {
    for (; this.isDigit(this.peek()); )
      this.advance();
    if (this.peek() === "." && this.isDigit(this.peekNext()))
      for (this.advance(); this.isDigit(this.peek()); )
        this.advance();
    const s = this.source.substring(e, this.pos);
    this.tokens.push(this.makeToken("NUMBER", s, e));
  }
  scanString(e, s) {
    for (; !this.isAtEnd() && this.peek() !== e; )
      this.peek() === "\\" ? (this.advance(), this.advance()) : this.advance();
    if (this.isAtEnd())
      throw new Error("Unterminated string");
    this.advance();
    const i = this.source.substring(s, this.pos);
    this.tokens.push(this.makeToken("STRING", i, s));
  }
  getKeywordType(e) {
    switch (e) {
      case "true":
        return "TRUE";
      case "false":
        return "FALSE";
      case "null":
        return "NULL";
      case "if":
        return "IF";
      case "else":
        return "ELSE";
      case "for":
        return "FOR";
      case "of":
        return "OF";
      case "match":
        return "MATCH";
      case "when":
        return "WHEN";
      case "let":
        return "LET";
      case "props":
        return "PROPS";
      default:
        return "IDENTIFIER";
    }
  }
  makeToken(e, s, i = this.pos - s.length, n = this.line, o = this.column - s.length) {
    return {
      type: e,
      value: s,
      line: n,
      column: o,
      offset: i
    };
  }
  advance() {
    const e = this.source[this.pos++] ?? "\0";
    return e === `
` ? (this.line++, this.column = 1) : this.column++, e;
  }
  peek() {
    return this.isAtEnd() ? "\0" : this.source[this.pos] ?? "\0";
  }
  peekNext() {
    return this.pos + 1 >= this.source.length ? "\0" : this.source[this.pos + 1] ?? "\0";
  }
  isAtEnd() {
    return this.pos >= this.source.length;
  }
  isWhitespace(e) {
    return e === " " || e === "	" || e === "\r" || e === `
`;
  }
  isAlpha(e) {
    return e >= "a" && e <= "z" || e >= "A" && e <= "Z" || e === "_";
  }
  isDigit(e) {
    return e >= "0" && e <= "9";
  }
  isAlphaNumeric(e) {
    return this.isAlpha(e) || this.isDigit(e);
  }
}
class U {
  constructor(e, s) {
    u(this, "tokens");
    u(this, "current", 0);
    u(this, "errors", []);
    u(this, "recursionDepth", 0);
    u(this, "MAX_RECURSION_DEPTH");
    const i = new se(e);
    this.tokens = i.tokenize(), this.MAX_RECURSION_DEPTH = (s == null ? void 0 : s.maxExpressionDepth) ?? 15;
  }
  parse() {
    try {
      const e = this.parseExpression(
        0
        /* NONE */
      );
      if (!this.isAtEnd() && this.peek().type !== h.EOF) {
        const s = this.peek();
        this.errors.push({
          message: `Unexpected token in expression: ${s.type}`,
          line: s.line,
          column: s.column,
          offset: s.offset
        });
      }
      return { value: e, errors: this.errors };
    } catch (e) {
      return {
        value: null,
        errors: [
          ...this.errors,
          {
            message: e instanceof Error ? e.message : "Unknown error",
            line: this.peek().line,
            column: this.peek().column,
            offset: this.peek().offset
          }
        ]
      };
    }
  }
  parseExpression(e) {
    if (this.recursionDepth++, this.recursionDepth > this.MAX_RECURSION_DEPTH) {
      const s = this.peek();
      throw new Error(
        `Expression parser exceeded maximum recursion depth (${this.MAX_RECURSION_DEPTH}).
Current token: ${s.type} at line ${s.line}, column ${s.column}`
      );
    }
    try {
      const s = this.getPrefixParser(this.peek().type);
      if (!s)
        throw new Error(`Unexpected token: ${this.peek().type}`);
      let i = s.call(this), n = 0;
      const o = 1e3;
      for (; e < this.getPrecedence(this.peek().type); ) {
        if (n++, n > o)
          throw new Error("Infinite loop detected in parseExpression");
        if (n > this.MAX_RECURSION_DEPTH)
          throw new Error(
            `Expression depth exceeded maximum (${this.MAX_RECURSION_DEPTH}). Too many chained operators or deeply nested expressions.`
          );
        const r = this.current, a = this.getInfixParser(this.peek().type);
        if (!a) break;
        if (i = a.call(this, i), this.current === r)
          throw new Error(
            `Infix parser did not advance position for token: ${this.peek().type}`
          );
      }
      return i;
    } finally {
      this.recursionDepth--;
    }
  }
  // Prefix parsers (tokens that start an expression)
  parseNumber() {
    const e = this.advance(), s = parseFloat(e.value);
    return b(s, "number", this.getLocation(e));
  }
  parseString() {
    const e = this.advance(), s = e.value.slice(1, -1).replace(/\\(.)/g, "$1");
    return b(s, "string", this.getLocation(e));
  }
  parseTrue() {
    const e = this.advance();
    return b(!0, "boolean", this.getLocation(e));
  }
  parseFalse() {
    const e = this.advance();
    return b(!1, "boolean", this.getLocation(e));
  }
  parseNull() {
    const e = this.advance();
    return b(null, "nil", this.getLocation(e));
  }
  parseIdentifier() {
    const e = this.peek(), s = this.advance().value;
    if (this.match(h.LPAREN))
      return this.parseFunctionCall(s, e);
    const i = [w(s)];
    let n = !1;
    for (; this.match(h.DOT) || this.match(h.LBRACKET); )
      if (this.previous().type === h.DOT)
        i.push(this.parsePathSegment());
      else {
        const r = this.parseIndexOrWildcard();
        r.kind === "star" && (n = !0), i.push(r), this.consume(h.RBRACKET, "Expected ]");
      }
    const o = N(i, !1, this.getLocation(e));
    return n ? L.wildcard(o, this.getLocation(e)) : o;
  }
  parsePath() {
    const e = this.peek();
    this.consume(h.DOLLAR, "Expected $");
    const s = this.match(h.DOT);
    let i = !1;
    if (s && this.peek().type === h.IDENTIFIER) {
      const n = [this.parsePathSegment()];
      for (; this.match(h.DOT) || this.match(h.LBRACKET); )
        if (this.previous().type === h.DOT)
          n.push(this.parsePathSegment());
        else {
          const r = this.parseIndexOrWildcard();
          r.kind === "star" && (i = !0), n.push(r), this.consume(h.RBRACKET, "Expected ]");
        }
      const o = N(n, !0, this.getLocation(e));
      return i ? L.wildcard(o, this.getLocation(e)) : o;
    }
    if (this.peek().type === h.IDENTIFIER) {
      const n = [this.parsePathSegment()];
      for (; this.match(h.DOT) || this.match(h.LBRACKET); )
        if (this.previous().type === h.DOT)
          n.push(this.parsePathSegment());
        else {
          const r = this.parseIndexOrWildcard();
          r.kind === "star" && (i = !0), n.push(r), this.consume(h.RBRACKET, "Expected ]");
        }
      const o = N(n, !1, this.getLocation(e));
      return i ? L.wildcard(o, this.getLocation(e)) : o;
    }
    throw new Error("Expected identifier after $");
  }
  parsePathSegment() {
    const e = this.consume(h.IDENTIFIER, "Expected identifier");
    return w(e.value);
  }
  parseIndexOrWildcard() {
    if (this.match(h.STAR))
      return Z();
    if (this.peek().type === h.NUMBER) {
      const e = this.advance(), s = parseInt(e.value, 10);
      return q(s);
    }
    throw new Error("Expected number or * in array index");
  }
  parseGrouping() {
    if (this.consume(h.LPAREN, "Expected ("), this.isArrowFunction())
      return this.parseArrowFunction();
    const e = this.parseExpression(
      0
      /* NONE */
    );
    return this.consume(h.RPAREN, "Expected )"), e;
  }
  isArrowFunction() {
    let e = this.current;
    for (; e < this.tokens.length; ) {
      const i = this.tokens[e];
      if (!i || i.type === h.EOF) return !1;
      if (i.type === h.RPAREN) break;
      e++;
    }
    if (e >= this.tokens.length) return !1;
    e++;
    const s = this.tokens[e];
    return (s == null ? void 0 : s.type) === h.ARROW;
  }
  parseArrowFunction() {
    const e = this.previous(), s = [];
    if (!this.check(h.RPAREN))
      do {
        const n = this.consume(
          h.IDENTIFIER,
          "Expected parameter name"
        );
        s.push(n.value);
      } while (this.match(h.COMMA));
    this.consume(h.RPAREN, "Expected )"), this.consume(h.ARROW, "Expected =>");
    const i = this.parseExpression(
      0
      /* NONE */
    );
    return te(
      s,
      i,
      this.getLocation(e)
    );
  }
  parseUnary() {
    const e = this.peek(), s = this.advance(), i = this.parseExpression(
      9
      /* UNARY */
    );
    return j(
      s.value,
      i,
      this.getLocation(e)
    );
  }
  parseUnderscore() {
    const e = this.advance();
    return N([w("_")], !1, this.getLocation(e));
  }
  // Infix parsers (operators that combine expressions)
  parseBinary(e) {
    const s = this.previous().value, i = this.getPrecedence(this.previous().type), n = this.parseExpression(i);
    return J(
      s,
      e,
      n,
      this.getLocation(this.previous())
    );
  }
  parseTernary(e) {
    const s = this.advance(), i = this.parseExpression(
      0
      /* NONE */
    );
    this.consume(h.COLON, "Expected :");
    const n = this.parseExpression(
      0
      /* NONE */
    );
    return Y(e, i, n, this.getLocation(s));
  }
  parseFunctionCall(e, s) {
    const i = [];
    if (!this.check(h.RPAREN))
      do
        i.push(this.parseExpression(
          0
          /* NONE */
        ));
      while (this.match(h.COMMA));
    return this.consume(h.RPAREN, "Expected )"), ee(e, i, this.getLocation(s));
  }
  // Parser rule tables
  getPrefixParser(e) {
    switch (e) {
      case h.NUMBER:
        return this.parseNumber;
      case h.STRING:
        return this.parseString;
      case h.TRUE:
        return this.parseTrue;
      case h.FALSE:
        return this.parseFalse;
      case h.NULL:
        return this.parseNull;
      case h.IDENTIFIER:
        return this.parseIdentifier;
      case h.DOLLAR:
        return this.parsePath;
      case h.LPAREN:
        return this.parseGrouping;
      case h.BANG:
      case h.MINUS:
        return this.parseUnary;
      case h.UNDERSCORE:
        return this.parseUnderscore;
      default:
        return null;
    }
  }
  getInfixParser(e) {
    switch (e) {
      case h.PLUS:
      case h.MINUS:
      case h.STAR:
      case h.SLASH:
      case h.PERCENT:
      case h.EQ_EQ:
      case h.BANG_EQ:
      case h.LT:
      case h.GT:
      case h.TAG_OPEN:
      // < in expression context
      case h.TAG_CLOSE:
      // > in expression context
      case h.LT_EQ:
      case h.GT_EQ:
      case h.AMP_AMP:
      case h.PIPE_PIPE:
      case h.QUESTION_QUESTION:
        return this.advance(), this.parseBinary;
      case h.QUESTION:
        return this.parseTernary;
      default:
        return null;
    }
  }
  getPrecedence(e) {
    switch (e) {
      case h.QUESTION:
        return 1;
      case h.QUESTION_QUESTION:
        return 2;
      case h.PIPE_PIPE:
        return 3;
      case h.AMP_AMP:
        return 4;
      case h.EQ_EQ:
      case h.BANG_EQ:
        return 5;
      case h.LT:
      case h.GT:
      case h.TAG_OPEN:
      // < in expression context
      case h.TAG_CLOSE:
      // > in expression context
      case h.LT_EQ:
      case h.GT_EQ:
        return 6;
      case h.PLUS:
      case h.MINUS:
        return 7;
      case h.STAR:
      case h.SLASH:
      case h.PERCENT:
        return 8;
      case h.LPAREN:
        return 10;
      default:
        return 0;
    }
  }
  // Token management helpers
  advance() {
    return this.isAtEnd() || this.current++, this.previous();
  }
  peek() {
    const e = this.tokens[this.current];
    if (!e)
      throw new Error("Unexpected end of tokens");
    return e;
  }
  previous() {
    const e = this.tokens[this.current - 1];
    if (!e)
      throw new Error("No previous token");
    return e;
  }
  check(e) {
    return this.isAtEnd() ? !1 : this.peek().type === e;
  }
  match(...e) {
    for (const s of e)
      if (this.check(s))
        return this.advance(), !0;
    return !1;
  }
  consume(e, s) {
    if (this.check(e)) return this.advance();
    throw new Error(`${s} at line ${this.peek().line}`);
  }
  isAtEnd() {
    return this.peek().type === h.EOF;
  }
  getLocation(e) {
    return K(
      { line: e.line, column: e.column, offset: e.offset },
      {
        line: e.line,
        column: e.column + e.value.length,
        offset: e.offset + e.value.length
      }
    );
  }
}
class ie {
  constructor(e, s) {
    u(this, "source");
    u(this, "pos", 0);
    u(this, "line", 1);
    u(this, "column", 1);
    u(this, "errors", []);
    u(this, "callCount", 0);
    u(this, "MAX_CALLS", 1e5);
    u(this, "recursionDepth", 0);
    u(this, "MAX_RECURSION_DEPTH", 100);
    u(this, "componentDefinitions", /* @__PURE__ */ new Map());
    u(this, "options");
    this.source = e, this.options = s ?? {};
  }
  checkCallLimit(e) {
    if (this.callCount++, this.callCount > this.MAX_CALLS) {
      const s = this.source.substring(
        Math.max(0, this.pos - 50),
        Math.min(this.source.length, this.pos + 50)
      );
      throw new Error(
        `Parser exceeded maximum call limit (${this.MAX_CALLS}) in ${e}.
Position: ${this.pos}, Line: ${this.line}, Column: ${this.column}
Context: ...${s}...`
      );
    }
  }
  parse() {
    const e = [];
    for (; !this.isAtEnd(); ) {
      this.checkCallLimit("parse loop");
      const s = this.pos, i = this.parseNode();
      i ? i.kind === "fragment" && i.children.length > 0 && i.children.every((n) => n.kind === "let") ? e.push(...i.children) : e.push(i) : this.pos === s && (this.errors.push({
        message: `Unexpected character '${this.peek()}'`,
        line: this.line,
        column: this.column,
        offset: this.pos
      }), this.advance());
    }
    return {
      nodes: e,
      errors: this.errors,
      components: this.componentDefinitions
    };
  }
  parseNode() {
    if (this.checkCallLimit("parseNode"), this.recursionDepth++, this.recursionDepth > this.MAX_RECURSION_DEPTH) {
      const e = this.source.substring(
        Math.max(0, this.pos - 50),
        Math.min(this.source.length, this.pos + 50)
      );
      throw new Error(
        `Parser exceeded maximum recursion depth (${this.MAX_RECURSION_DEPTH}).
Position: ${this.pos}, Line: ${this.line}, Column: ${this.column}
Context: ...${e}...`
      );
    }
    try {
      return this.skipWhitespace(), this.isAtEnd() ? null : this.peek() === "<" ? this.peekNext() === "!" && this.peekAhead(4) === "<!--" ? this.parseComment() : this.peekNext() === "/" ? null : this.parseElement() : this.peek() === "@" ? this.parseDirective() : this.parseText();
    } finally {
      this.recursionDepth--;
    }
  }
  parseElement() {
    const e = this.getLocation();
    if (this.consume("<"), this.peek() === ">")
      return this.parseFragment(e);
    const s = this.parseIdentifier(!0);
    if (s === "") {
      for (this.errors.push({
        message: `Invalid tag name at '${this.peek()}'`,
        line: this.line,
        column: this.column,
        offset: this.pos
      }); !this.isAtEnd() && this.peek() !== ">"; )
        this.advance();
      return this.peek() === ">" && this.advance(), v.node({
        segments: [],
        location: this.getLocationFrom(e)
      });
    }
    if (s.startsWith("template:")) {
      const r = s.substring(9);
      return this.parseComponentDefinition(r, e);
    }
    const i = s[0];
    if (s.length > 0 && i && i >= "A" && i <= "Z")
      return this.parseComponent(s, e);
    if (s === "slot")
      return this.parseSlot(e);
    const n = [];
    for (this.skipWhitespace(); !this.isAtEnd() && this.peek() !== ">" && this.peek() !== "/"; ) {
      const r = this.pos, a = this.parseAttribute();
      if (a)
        n.push(a);
      else if (this.pos === r)
        break;
      this.skipWhitespace();
    }
    if (this.peek() === "/" && this.peekNext() === ">")
      return this.advance(), this.advance(), _.node({
        tag: s,
        attributes: n,
        children: [],
        location: this.getLocationFrom(e)
      });
    this.consume(">");
    const o = [];
    for (; !this.isAtEnd() && !(this.peek() === "<" && this.peekNext() === "/"); ) {
      const r = this.pos, a = this.parseNode();
      if (a)
        o.push(a);
      else if (this.pos === r)
        break;
    }
    if (this.peek() === "<" && this.peekNext() === "/") {
      this.advance(), this.advance();
      const r = this.parseIdentifier(!0);
      r !== s && this.errors.push({
        message: `Mismatched closing tag: expected </${s}>, got </${r}>`,
        line: this.line,
        column: this.column,
        offset: this.pos
      }), this.consume(">");
    } else this.isAtEnd() ? this.errors.push({
      message: `Unclosed tag: <${s}>`,
      line: e.line,
      column: e.column,
      offset: e.offset
    }) : this.errors.push({
      message: `Unclosed tag: <${s}>`,
      line: e.line,
      column: e.column,
      offset: e.offset
    });
    return _.node({
      tag: s,
      attributes: n,
      children: o,
      location: this.getLocationFrom(e)
    });
  }
  parseComponent(e, s) {
    const i = [], n = /* @__PURE__ */ new Map();
    for (this.skipWhitespace(); !this.isAtEnd() && this.peek() !== ">" && this.peek() !== "/"; ) {
      const a = this.pos, c = this.parseComponentProp();
      if (c) {
        if (i.push(c), c.value.kind === "path" && !c.value.isGlobal) {
          const d = c.value.segments.filter(
            (p) => p.kind === "key"
          ).map((p) => p.key);
          d.length > 0 && n.set(c.name, d);
        }
      } else if (this.pos === a)
        break;
      this.skipWhitespace();
    }
    if (this.peek() === "/" && this.peekNext() === ">")
      return this.advance(), this.advance(), T.node({
        name: e,
        props: i,
        children: [],
        propPathMapping: n,
        location: this.getLocationFrom(s)
      });
    this.consume(">");
    const r = [];
    for (; !this.isAtEnd() && !(this.peek() === "<" && this.peekNext() === "/"); ) {
      const a = this.pos, c = this.parseNode();
      if (c)
        r.push(c);
      else if (this.pos === a)
        break;
    }
    if (this.peek() === "<" && this.peekNext() === "/") {
      this.advance(), this.advance();
      const a = this.parseIdentifier(!0);
      a !== e && this.errors.push({
        message: `Mismatched closing tag: expected </${e}>, got </${a}>`,
        line: this.line,
        column: this.column,
        offset: this.pos
      }), this.consume(">");
    }
    return T.node({
      name: e,
      props: i,
      children: r,
      propPathMapping: n,
      location: this.getLocationFrom(s)
    });
  }
  parseComponentDefinition(e, s) {
    const i = [];
    for (this.skipWhitespace(); !this.isAtEnd() && this.peek() !== ">" && this.peek() !== "/"; ) {
      const a = this.getLocation(), c = this.parseIdentifier();
      if (c === "")
        break;
      let d = !1, p;
      if (this.peek() === "!" && (d = !0, this.advance()), this.skipWhitespace(), this.peek() === "=") {
        if (this.advance(), this.skipWhitespace(), this.peek() === '"' || this.peek() === "'") {
          const k = this.peek();
          this.advance();
          const f = this.pos;
          for (; !this.isAtEnd() && this.peek() !== k; )
            this.peek() === "\\" && this.advance(), this.advance();
          p = this.source.substring(f, this.pos), this.advance();
        } else if (this.peek() === "{") {
          this.advance();
          const k = this.pos;
          let f = 1;
          for (; !this.isAtEnd() && f > 0; )
            this.peek() === "{" && f++, this.peek() === "}" && f--, f > 0 && this.advance();
          const x = this.source.substring(k, this.pos);
          this.advance();
          const O = this.createExpressionParser(x).parse();
          O.value && (p = O.value);
        }
      }
      i.push({
        name: c,
        required: d,
        defaultValue: p,
        location: this.getLocationFrom(a)
      }), this.skipWhitespace();
    }
    if (this.peek() === "/" && this.peekNext() === ">") {
      this.advance(), this.advance(), this.componentDefinitions.has(e) && this.errors.push({
        message: `Duplicate component definition: ${e}`,
        line: s.line,
        column: s.column,
        offset: s.offset
      });
      const a = {
        name: e,
        props: i,
        body: [],
        location: this.getLocationFrom(s)
      };
      return this.componentDefinitions.set(e, a), null;
    }
    this.consume(">");
    const n = [], o = `template:${e}`;
    for (; !this.isAtEnd(); ) {
      if (this.peek() === "<" && this.peekNext() === "/") {
        const d = this.pos + 2;
        let p = d;
        for (; p < this.source.length; ) {
          const f = this.source[p];
          if (f === ">" || f === void 0 || this.isWhitespace(f))
            break;
          p++;
        }
        if (this.source.substring(d, p) === o)
          break;
      }
      const a = this.pos, c = this.parseNode();
      if (c)
        n.push(c);
      else if (this.pos === a)
        break;
    }
    if (this.peek() === "<" && this.peekNext() === "/") {
      this.advance(), this.advance();
      const a = this.parseIdentifier();
      a !== o && this.errors.push({
        message: `Mismatched closing tag: expected </${o}>, got </${a}>`,
        line: this.line,
        column: this.column,
        offset: this.pos
      }), this.consume(">");
    }
    this.componentDefinitions.has(e) && this.errors.push({
      message: `Duplicate component definition: ${e}`,
      line: s.line,
      column: s.column,
      offset: s.offset
    });
    const r = {
      name: e,
      props: i,
      body: n,
      location: this.getLocationFrom(s)
    };
    return this.componentDefinitions.set(e, r), null;
  }
  parseComponentProp() {
    const e = this.getLocation(), s = this.parseIdentifier();
    if (s === "")
      return null;
    if (this.skipWhitespace(), this.peek() !== "=")
      return this.errors.push({
        message: `Component prop '${s}' must have a value`,
        line: this.line,
        column: this.column,
        offset: this.pos
      }), null;
    this.consume("="), this.skipWhitespace();
    let i;
    if (this.peek() === '"' || this.peek() === "'") {
      const n = this.peek();
      this.advance();
      const o = this.pos;
      for (; !this.isAtEnd() && this.peek() !== n; )
        this.peek() === "\\" && this.advance(), this.advance();
      const r = this.source.substring(o, this.pos);
      this.advance();
      const c = this.createExpressionParser(`"${r}"`).parse();
      if (!c.value)
        throw new Error(`Invalid prop value for '${s}'`);
      return {
        name: s,
        value: c.value,
        location: this.getLocationFrom(e)
      };
    } else if (this.peek() === "$") {
      if (this.peekNext() === "{") {
        this.advance(), this.advance();
        const r = this.pos;
        let a = 1;
        for (; !this.isAtEnd() && a > 0; )
          this.peek() === "{" && a++, this.peek() === "}" && a--, a > 0 && this.advance();
        i = this.source.substring(r, this.pos), this.advance();
      } else
        i = this.parseSimpleExpression();
      const o = this.createExpressionParser(i).parse();
      if (!o.value)
        throw new Error(`Invalid prop expression for '${s}'`);
      return {
        name: s,
        value: o.value,
        location: this.getLocationFrom(e)
      };
    } else {
      const n = this.pos;
      for (; !this.isAtEnd() && !this.isWhitespace(this.peek()) && this.peek() !== ">" && this.peek() !== "/"; )
        this.advance();
      const o = this.source.substring(n, this.pos), a = this.createExpressionParser(o).parse();
      if (!a.value)
        throw new Error(`Invalid prop value for '${s}'`);
      return {
        name: s,
        value: a.value,
        location: this.getLocationFrom(e)
      };
    }
  }
  parseSlot(e) {
    let s;
    for (this.skipWhitespace(); !this.isAtEnd() && this.peek() !== ">" && this.peek() !== "/"; ) {
      const o = this.parseIdentifier();
      if (o === "") {
        this.errors.push({
          message: `Invalid slot attribute at '${this.peek()}'`,
          line: this.line,
          column: this.column,
          offset: this.pos
        }), this.advance();
        continue;
      }
      if (o === "name") {
        if (this.skipWhitespace(), this.consume("="), this.skipWhitespace(), this.peek() === '"' || this.peek() === "'") {
          const r = this.peek();
          this.advance();
          const a = this.pos;
          for (; !this.isAtEnd() && this.peek() !== r; )
            this.advance();
          s = this.source.substring(a, this.pos), this.advance();
        }
      } else if (this.skipWhitespace(), this.peek() === "=" && (this.consume("="), this.skipWhitespace(), this.peek() === '"' || this.peek() === "'")) {
        const r = this.peek();
        for (this.advance(); !this.isAtEnd() && this.peek() !== r; )
          this.advance();
        this.advance();
      }
      this.skipWhitespace();
    }
    if (this.peek() === "/" && this.peekNext() === ">")
      return this.advance(), this.advance(), F.node({
        name: s,
        fallback: void 0,
        location: this.getLocationFrom(e)
      });
    this.consume(">");
    const n = [];
    for (; !this.isAtEnd() && !(this.peek() === "<" && this.peekNext() === "/"); ) {
      const o = this.pos, r = this.parseNode();
      if (r)
        n.push(r);
      else if (this.pos === o)
        break;
    }
    if (this.peek() === "<" && this.peekNext() === "/") {
      this.advance(), this.advance();
      const o = this.parseIdentifier();
      o !== "slot" && this.errors.push({
        message: `Mismatched closing tag: expected </slot>, got </${o}>`,
        line: this.line,
        column: this.column,
        offset: this.pos
      }), this.consume(">");
    }
    return F.node({
      name: s,
      fallback: n,
      location: this.getLocationFrom(e)
    });
  }
  parseComment() {
    const e = this.getLocation();
    this.advance(), this.advance(), this.advance(), this.advance();
    const s = this.pos;
    for (; !this.isAtEnd() && !(this.peek() === "-" && this.peekNext() === "-" && this.peekAhead(3) === "-->"); )
      this.advance();
    const i = this.source.substring(s, this.pos);
    return this.peek() === "-" && (this.advance(), this.advance(), this.advance()), V.node({
      style: "html",
      text: i,
      location: this.getLocationFrom(e)
    });
  }
  parseAttribute() {
    const e = this.getLocation(), s = this.parseIdentifier();
    if (s === "")
      return this.errors.push({
        message: `Invalid attribute name at '${this.peek()}'`,
        line: this.line,
        column: this.column,
        offset: this.pos
      }), this.advance(), null;
    if (this.skipWhitespace(), this.peek() !== "=")
      return g.static({
        name: s,
        value: "",
        location: this.getLocationFrom(e)
      });
    if (this.consume("="), this.skipWhitespace(), this.peek() === "$")
      if (this.peekNext() === "{") {
        this.advance(), this.advance();
        const o = this.pos;
        let r = 1;
        for (; !this.isAtEnd() && r > 0; )
          this.peek() === "{" && r++, this.peek() === "}" && r--, r > 0 && this.advance();
        const a = this.source.substring(o, this.pos);
        this.advance();
        const d = this.createExpressionParser(a).parse();
        if (!d.value)
          throw new Error("Invalid attribute expression");
        return g.expr({
          name: s,
          expr: d.value,
          location: this.getLocationFrom(e)
        });
      } else {
        const o = this.parseSimpleExpression(), a = this.createExpressionParser(o).parse();
        if (!a.value)
          throw new Error("Invalid attribute expression");
        return g.expr({
          name: s,
          expr: a.value,
          location: this.getLocationFrom(e)
        });
      }
    if (this.peek() === '"' || this.peek() === "'") {
      const o = this.peek();
      this.advance();
      const r = [];
      let a = "";
      for (; !this.isAtEnd() && this.peek() !== o; )
        if (this.peek() === "$" && this.peekNext() === "{") {
          a && (r.push(
            g.staticValue(
              a,
              this.getLocationFrom(e)
            )
          ), a = ""), this.advance(), this.advance();
          const d = this.pos;
          let p = 1;
          for (; !this.isAtEnd() && p > 0; )
            this.peek() === "{" && p++, this.peek() === "}" && p--, p > 0 && this.advance();
          const k = this.source.substring(d, this.pos);
          this.advance();
          const x = this.createExpressionParser(k).parse();
          x.value && r.push(
            g.exprValue(
              x.value,
              this.getLocationFrom(e)
            )
          );
        } else this.peek() === "\\" ? (this.advance(), this.isAtEnd() || (a += this.advance())) : a += this.advance();
      (a || r.length === 0) && r.push(
        g.staticValue(a, this.getLocationFrom(e))
      ), this.advance();
      const c = r[0];
      return r.length === 1 && c && c.kind === "static" ? g.static({
        name: s,
        value: c.value,
        location: this.getLocationFrom(e)
      }) : g.mixed({
        name: s,
        segments: r,
        location: this.getLocationFrom(e)
      });
    }
    const i = this.pos;
    for (; !this.isAtEnd() && !this.isWhitespace(this.peek()) && this.peek() !== ">" && this.peek() !== "/"; )
      this.advance();
    const n = this.source.substring(i, this.pos);
    return g.static({
      name: s,
      value: n,
      location: this.getLocationFrom(e)
    });
  }
  parseText() {
    const e = this.getLocation(), s = [];
    let i = "";
    for (; !this.isAtEnd() && (this.checkCallLimit("parseText loop"), !(this.peek() === "@" || this.peek() === "}")); ) {
      if (this.peek() === "<") {
        const n = this.peekNext();
        if (this.isAlpha(n) || n === "/" || n === "!" || n === ">")
          break;
        i += this.advance();
        continue;
      }
      if (this.peek() === "$" && this.peekNext() !== "{") {
        i && (s.push(
          v.literalSegment(i, this.getLocationFrom(e))
        ), i = "");
        const n = this.pos;
        if (this.advance(), this.peek() === ".") {
          this.pos = n;
          const o = this.parseSimpleExpression(), a = this.createExpressionParser(o).parse();
          a.value && s.push(
            v.exprSegment(a.value, this.getLocationFrom(e))
          );
        } else if (this.isAlpha(this.peek())) {
          this.pos = n;
          const o = this.parseSimpleExpression(), a = this.createExpressionParser(o).parse();
          a.value && s.push(
            v.exprSegment(a.value, this.getLocationFrom(e))
          );
        } else
          this.pos = n, i += this.advance();
        continue;
      }
      if (this.peek() === "$" && this.peekNext() === "{") {
        i && (s.push(
          v.literalSegment(i, this.getLocationFrom(e))
        ), i = ""), this.advance(), this.advance();
        const n = this.pos;
        let o = 1;
        for (; !this.isAtEnd() && o > 0; )
          this.peek() === "{" && o++, this.peek() === "}" && o--, o > 0 && this.advance();
        const r = this.source.substring(n, this.pos);
        if (this.advance(), r.trim() === "") {
          this.errors.push({
            message: "Empty expression",
            line: this.line,
            column: this.column,
            offset: this.pos
          });
          continue;
        }
        const c = this.createExpressionParser(r).parse();
        c.errors.length > 0 && this.errors.push(...c.errors), c.value && s.push(
          v.exprSegment(c.value, this.getLocationFrom(e))
        );
        continue;
      }
      i += this.advance();
    }
    return i && s.push(
      v.literalSegment(i, this.getLocationFrom(e))
    ), s.length === 0 ? null : v.node({
      segments: s,
      location: this.getLocationFrom(e)
    });
  }
  parseSimpleExpression() {
    const e = this.pos;
    for (this.advance(), this.peek() === "." && this.advance(); this.isAlphaNumeric(this.peek()); )
      this.advance();
    for (; this.peek() === "." || this.peek() === "["; ) {
      const s = this.pos;
      if (this.peek() === ".") {
        if (this.advance(), !this.isAlphaNumeric(this.peek()))
          break;
        for (; this.isAlphaNumeric(this.peek()); )
          this.advance();
      } else if (this.peek() === "[") {
        if (this.advance(), this.peek() === "*")
          this.advance();
        else
          for (; this.isDigit(this.peek()); )
            this.advance();
        if (this.peek() === "]")
          this.advance();
        else
          break;
      }
      if (this.pos === s)
        break;
    }
    return this.source.substring(e, this.pos);
  }
  parseDirective() {
    const e = this.getLocation();
    if (this.consume("@"), this.peek() === "@")
      return this.advance(), this.parseCodeBlock(e);
    const s = this.parseIdentifier();
    switch (s) {
      case "if":
        return this.parseIf(e);
      case "for":
        return this.parseFor(e);
      case "match":
        return this.parseMatch(e);
      case "let":
        return this.parseLet(e);
      default:
        return this.errors.push({
          message: `Unknown directive: @${s}`,
          line: this.line,
          column: this.column,
          offset: this.pos
        }), null;
    }
  }
  parseIf(e) {
    const s = [];
    let i;
    const n = this.parseIfBranch();
    for (n && s.push(n); this.skipWhitespace(), this.peekAhead(4) === "else"; )
      if (this.pos += 4, this.skipWhitespace(), this.peekAhead(2) === "if") {
        this.pos += 2;
        const o = this.parseIfBranch();
        o && s.push(o);
      } else {
        this.consume("{"), i = this.parseBlockBody(), this.consume("}");
        break;
      }
    return H.node({
      branches: s,
      elseBranch: i,
      location: this.getLocationFrom(e)
    });
  }
  parseIfBranch() {
    this.skipWhitespace(), this.consume("(");
    const e = this.pos;
    let s = 1;
    for (; !this.isAtEnd() && s > 0; )
      this.peek() === "(" && s++, this.peek() === ")" && s--, s > 0 && this.advance();
    const i = this.source.substring(e, this.pos);
    this.advance();
    const o = this.createExpressionParser(i).parse();
    this.skipWhitespace(), this.consume("{");
    const r = this.parseBlockBody();
    return this.consume("}"), o.value ? { condition: o.value, body: r } : (this.errors.push({
      message: "Invalid if condition",
      line: this.line,
      column: this.column,
      offset: this.pos
    }), null);
  }
  parseBlockBody() {
    const e = [];
    for (; !this.isAtEnd() && this.peek() !== "}"; ) {
      const s = this.pos, i = this.parseNode();
      if (i)
        e.push(i);
      else if (this.pos === s)
        break;
    }
    return e;
  }
  parseFor(e) {
    this.skipWhitespace(), this.consume("(");
    const s = this.parseIdentifier();
    this.skipWhitespace();
    let i = null;
    this.peek() === "," && (this.advance(), this.skipWhitespace(), i = this.parseIdentifier(), this.skipWhitespace());
    const n = this.parseIdentifier();
    let o = "of";
    n === "in" ? o = "in" : n !== "of" && this.errors.push({
      message: `Expected 'of' or 'in' in @for directive, got '${n}'`,
      line: this.line,
      column: this.column,
      offset: this.pos
    }), this.skipWhitespace();
    const r = this.pos;
    let a = 1;
    for (; !this.isAtEnd() && a > 0; )
      this.peek() === "(" && a++, this.peek() === ")" && a--, a > 0 && this.advance();
    const c = this.source.substring(r, this.pos);
    this.advance();
    const p = this.createExpressionParser(c).parse();
    this.skipWhitespace(), this.consume("{");
    const k = [];
    for (; !this.isAtEnd() && this.peek() !== "}"; ) {
      if (this.peek() === "<" && this.peekNext() === "/") {
        this.errors.push({
          message: "Unexpected closing tag in @for body",
          line: this.line,
          column: this.column,
          offset: this.pos
        });
        break;
      }
      const f = this.pos, x = this.parseNode();
      if (x)
        k.push(x);
      else if (this.pos === f)
        break;
    }
    if (this.consume("}"), !p.value)
      throw new Error("Invalid for iterable");
    return X.node({
      item: s,
      index: i ?? void 0,
      iterable: p.value,
      iterationType: o,
      body: k,
      location: this.getLocationFrom(e)
    });
  }
  parseMatch(e) {
    this.skipWhitespace(), this.consume("(");
    const s = this.pos;
    let i = 1;
    for (; !this.isAtEnd() && i > 0; )
      this.peek() === "(" && i++, this.peek() === ")" && i--, i > 0 && this.advance();
    const n = this.source.substring(s, this.pos);
    this.advance();
    const r = this.createExpressionParser(n).parse();
    this.skipWhitespace(), this.consume("{");
    const a = [];
    let c;
    for (; !this.isAtEnd() && this.peek() !== "}" && (this.skipWhitespace(), this.peek() !== "}"); ) {
      const d = this.pos, p = this.parseMatchCase();
      if (p)
        "isDefault" in p ? c = p.body : a.push(p);
      else if (this.pos === d) {
        this.errors.push({
          message: "Failed to parse match case",
          line: this.line,
          column: this.column,
          offset: this.pos
        });
        break;
      }
      this.skipWhitespace();
    }
    if (this.consume("}"), !r.value)
      throw new Error("Invalid match value");
    return S.node({
      value: r.value,
      cases: a,
      defaultCase: c,
      location: this.getLocationFrom(e)
    });
  }
  parseMatchCase() {
    const e = this.getLocation();
    if (this.peek() === "*") {
      this.advance(), this.skipWhitespace(), this.consume("{");
      const o = this.parseBlockBody();
      return this.consume("}"), {
        isDefault: !0,
        body: o,
        location: this.getLocationFrom(e)
      };
    }
    if (this.peek() === "_") {
      const o = this.source.indexOf("{", this.pos), r = this.source.substring(this.pos, o).trim();
      this.pos = o;
      const c = this.createExpressionParser(r).parse();
      this.skipWhitespace(), this.consume("{");
      const d = this.parseBlockBody();
      return this.consume("}"), c.value ? S.expressionCase({
        condition: c.value,
        body: d,
        location: this.getLocationFrom(e)
      }) : (this.errors.push({
        message: "Invalid match case expression",
        line: this.line,
        column: this.column,
        offset: this.pos
      }), null);
    }
    const s = this.parseIdentifier();
    if (s !== "when")
      return this.errors.push({
        message: `Expected 'when', '_', or '*' in match case, got '${s}'`,
        line: this.line,
        column: this.column,
        offset: this.pos
      }), null;
    this.skipWhitespace();
    const i = [];
    for (; ; ) {
      if (this.skipWhitespace(), this.peek() === '"' || this.peek() === "'") {
        const o = this.peek();
        this.advance();
        const r = this.pos;
        for (; !this.isAtEnd() && this.peek() !== o; )
          this.peek() === "\\" && this.advance(), this.advance();
        const a = this.source.substring(r, this.pos);
        this.advance(), i.push(a);
      } else if (this.isDigit(this.peek()) || this.peek() === "-" && this.isDigit(this.peekNext())) {
        const o = this.pos;
        for (this.peek() === "-" && this.advance(); this.isDigit(this.peek()); )
          this.advance();
        if (this.peek() === ".")
          for (this.advance(); this.isDigit(this.peek()); )
            this.advance();
        const r = parseFloat(this.source.substring(o, this.pos));
        i.push(r);
      } else if (this.peekAhead(4) === "true")
        this.pos += 4, i.push(!0);
      else if (this.peekAhead(5) === "false")
        this.pos += 5, i.push(!1);
      else
        break;
      if (this.skipWhitespace(), this.peek() === ",")
        this.advance();
      else
        break;
    }
    this.skipWhitespace(), this.consume("{");
    const n = this.parseBlockBody();
    return this.consume("}"), S.literalCase({
      values: i,
      body: n,
      location: this.getLocationFrom(e)
    });
  }
  parseFragment(e) {
    this.consume(">");
    const s = [];
    for (; !this.isAtEnd(); ) {
      if (this.peek() === "<" && this.peekNext() === "/" && this.source.substring(this.pos, this.pos + 3) === "</>") {
        this.pos += 3;
        break;
      }
      const i = this.pos, n = this.parseNode();
      if (n)
        s.push(n);
      else if (this.pos === i)
        break;
    }
    return M.node({
      children: s,
      preserveWhitespace: !0,
      location: this.getLocationFrom(e)
    });
  }
  parseLet(e) {
    this.skipWhitespace();
    const s = this.peek() === "$" && this.peekNext() === ".";
    s && (this.advance(), this.advance());
    const i = this.parseIdentifier();
    this.skipWhitespace(), this.consume("="), this.skipWhitespace();
    const n = this.pos;
    let o = this.pos;
    for (; !this.isAtEnd(); ) {
      if (this.peek() === ";" || this.peek() === `
`) {
        o = this.pos;
        break;
      }
      this.advance(), o = this.pos;
    }
    this.peek() === ";" && this.advance();
    const r = this.source.substring(n, o).trim(), c = this.createExpressionParser(r).parse();
    if (!c.value)
      throw new Error("Invalid let value");
    return z.node({
      name: i,
      value: c.value,
      isGlobal: s,
      location: this.getLocationFrom(e)
    });
  }
  parseCodeBlock(e) {
    this.skipWhitespace(), this.consume("{");
    const s = [];
    for (; !this.isAtEnd() && this.peek() !== "}"; ) {
      this.checkCallLimit("parseCodeBlock loop");
      const n = this.pos;
      if (this.skipWhitespace(), this.peek() === "}") break;
      if (this.peekAhead(3) === "let") {
        this.parseIdentifier();
        const o = this.parseLet(this.getLocation());
        s.push(o);
      } else {
        for (; !this.isAtEnd() && this.peek() !== ";" && this.peek() !== `
`; )
          this.advance();
        this.peek() === ";" && this.advance();
      }
      if (this.skipWhitespace(), this.pos === n) {
        this.errors.push({
          message: `parseCodeBlock: position not advancing at '${this.peek()}'`,
          line: this.line,
          column: this.column,
          offset: this.pos
        });
        break;
      }
    }
    this.consume("}");
    const i = s[0];
    return s.length === 1 && i ? i : M.node({
      children: s,
      location: this.getLocationFrom(e)
    });
  }
  peekAhead(e) {
    return this.pos + e > this.source.length ? this.source.substring(this.pos) : this.source.substring(this.pos, this.pos + e);
  }
  parseIdentifier(e = !1) {
    const s = this.pos;
    for (; this.isAlphaNumeric(this.peek()) || this.peek() === "-" || this.peek() === ":" || e && this.peek() === "."; )
      this.advance();
    return this.source.substring(s, this.pos);
  }
  skipWhitespace() {
    for (; !this.isAtEnd() && this.isWhitespace(this.peek()); )
      this.advance();
  }
  createExpressionParser(e) {
    return new U(e, {
      maxExpressionDepth: this.options.maxExpressionDepth
    });
  }
  consume(e) {
    if (this.peek() !== e) {
      this.errors.push({
        message: `Expected '${e}' but got '${this.peek()}'`,
        line: this.line,
        column: this.column,
        offset: this.pos
      });
      return;
    }
    this.advance();
  }
  advance() {
    const e = this.source[this.pos++] ?? "\0";
    return e === `
` ? (this.line++, this.column = 1) : this.column++, e;
  }
  peek() {
    return this.isAtEnd() ? "\0" : this.source[this.pos] ?? "\0";
  }
  peekNext() {
    return this.pos + 1 >= this.source.length ? "\0" : this.source[this.pos + 1] ?? "\0";
  }
  isAtEnd() {
    return this.pos >= this.source.length;
  }
  isWhitespace(e) {
    return e === " " || e === "	" || e === "\r" || e === `
`;
  }
  isAlpha(e) {
    return e >= "a" && e <= "z" || e >= "A" && e <= "Z" || e === "_";
  }
  isDigit(e) {
    return e >= "0" && e <= "9";
  }
  isAlphaNumeric(e) {
    return this.isAlpha(e) || this.isDigit(e);
  }
  getLocation() {
    return {
      line: this.line,
      column: this.column,
      offset: this.pos
    };
  }
  getLocationFrom(e) {
    return l({
      line: e.line,
      column: e.column,
      offset: e.offset,
      endLine: this.line,
      endColumn: this.column,
      endOffset: this.pos
    });
  }
}
function xe(t) {
  const s = new U(t).parse();
  if (s.value === null)
    throw new Error("Failed to parse expression");
  return {
    value: s.value,
    errors: s.errors
  };
}
function ne(t, e) {
  const i = new ie(t, e).parse();
  return {
    value: i.nodes,
    errors: i.errors,
    components: i.components
  };
}
const y = {
  diagnostics: {
    enabled: !0,
    unusedVariables: "warning",
    deprecatedHelpers: "warning",
    potentiallyUndefined: "hint",
    deepNesting: "warning",
    deepNestingThreshold: 4
  },
  completion: {
    snippets: !0
  },
  performance: {
    debounceMs: 200,
    maxFileSize: 1024 * 1024
    // 1MB
  }
};
function I() {
  return {
    variables: /* @__PURE__ */ new Map(),
    components: [],
    componentUsages: [],
    helperCalls: []
  };
}
function re(t = y) {
  return {
    documents: /* @__PURE__ */ new Map(),
    componentIndex: /* @__PURE__ */ new Map(),
    helperIndex: /* @__PURE__ */ new Map(),
    dataSchema: null,
    config: t
  };
}
function oe(t, e) {
  const s = I(), i = {
    scope: s,
    currentVariables: [],
    nestingDepth: 0
  };
  for (const [n, o] of e) {
    const r = ae(n, o);
    s.components.push(r);
  }
  return E(t, i), s;
}
function ae(t, e) {
  const s = e.props.map((o) => ({
    name: o.name,
    required: o.required,
    defaultValue: o.defaultValue !== void 0 ? String(o.defaultValue) : void 0
  })), i = [];
  function n(o) {
    for (const r of o)
      if (r.kind === "slot")
        i.push({
          name: r.name ?? null,
          location: r.location
        });
      else if (r.kind === "element" || r.kind === "fragment")
        n(r.children);
      else if (r.kind === "if") {
        for (const a of r.branches)
          n(a.body);
        r.elseBranch && n(r.elseBranch);
      } else if (r.kind === "for")
        n(r.body);
      else if (r.kind === "match") {
        for (const a of r.cases)
          n(a.body);
        r.defaultCase && n(r.defaultCase);
      }
  }
  return n(e.body), {
    name: t,
    props: s,
    slots: i,
    location: e.location
  };
}
function E(t, e) {
  for (const s of t)
    he(s, e);
}
function he(t, e) {
  const { scope: s } = e;
  switch (W(t.location, e), t.kind) {
    case "text":
      break;
    case "element":
      if (de(t.tag)) {
        const i = {
          componentName: t.tag,
          location: t.location,
          props: {}
        };
        for (const n of t.attributes)
          (n.kind === "static" || n.kind === "expr") && (i.props[n.name] = n.location);
        s.componentUsages.push(i);
      }
      E(t.children, e);
      break;
    case "if":
      ce(t, e);
      break;
    case "for":
      le(t, e);
      break;
    case "let":
      ue(t, e);
      break;
    case "match":
      for (const i of t.cases)
        E(i.body, e);
      t.defaultCase && E(t.defaultCase, e);
      break;
    case "component":
      pe(t, e);
      break;
    case "fragment":
      E(t.children, e);
      break;
  }
}
function ce(t, e) {
  e.nestingDepth++;
  for (const s of t.branches)
    E(s.body, e);
  t.elseBranch && E(t.elseBranch, e), e.nestingDepth--;
}
function le(t, e) {
  e.nestingDepth++;
  const s = [...e.currentVariables];
  s.push({
    name: t.itemVar,
    kind: t.iterationType === "of" ? "for-item" : "for-key",
    location: t.location
  }), t.indexVar && s.push({
    name: t.indexVar,
    kind: "for-index",
    location: t.location
  });
  const i = {
    ...e,
    currentVariables: s
  };
  E(t.body, i), e.nestingDepth--;
}
function ue(t, e) {
  const s = {
    name: t.name,
    kind: t.isGlobal ? "global" : "let",
    location: t.location
  };
  e.currentVariables = [...e.currentVariables, s], W(t.location, e);
}
function pe(t, e) {
  const s = {
    componentName: t.name,
    location: t.location,
    props: {}
  };
  for (const i of t.props)
    s.props[i.name] = i.location;
  e.scope.componentUsages.push(s), t.children.length > 0 && E(t.children, e);
}
function W(t, e) {
  const s = t.start.offset, i = t.end.offset;
  e.scope.variables.set(s, [...e.currentVariables]), i !== s && e.scope.variables.set(i, [...e.currentVariables]);
}
function de(t) {
  return /^[A-Z]/.test(t);
}
function fe(t, e) {
  let s = -1, i = [];
  for (const [n, o] of t.variables)
    n <= e && n > s && (s = n, i = o);
  return i;
}
function Ae(t, e, s) {
  const n = fe(t, s).find((o) => o.name === e);
  return (n == null ? void 0 : n.location) ?? null;
}
function be(t, e) {
  return [];
}
function Ne(t, e) {
  return !0;
}
function Pe(t, e) {
  let s = 0;
  function i(n, o) {
    for (const r of n)
      if (e >= r.location.start.offset && e <= r.location.end.offset && (s = Math.max(s, o)), r.kind === "if") {
        for (const a of r.branches)
          i(a.body, o + 1);
        r.elseBranch && i(r.elseBranch, o + 1);
      } else if (r.kind === "for")
        i(r.body, o + 1);
      else if (r.kind === "match") {
        for (const a of r.cases)
          i(a.body, o + 1);
        r.defaultCase && i(r.defaultCase, o + 1);
      } else (r.kind === "element" || r.kind === "fragment") && i(r.children, o);
  }
  return i(t, 0), s;
}
function me(t, e, s = 1) {
  const i = {
    uri: t,
    version: s,
    content: e,
    ast: null,
    errors: [],
    components: /* @__PURE__ */ new Map(),
    scope: I(),
    lastParsed: 0
  };
  return C(i);
}
function Le(t, e, s) {
  return C({
    ...t,
    content: e,
    version: s
  });
}
function C(t) {
  const e = ne(t.content), s = e.errors.length === 0 && e.value.length > 0 ? oe(e.value, e.components) : I();
  return {
    ...t,
    ast: e.value,
    errors: e.errors,
    components: e.components,
    scope: s,
    lastParsed: Date.now()
  };
}
function Se(t, e, s) {
  var o, r;
  const i = t.split(`
`);
  let n = 0;
  for (let a = 0; a < e && a < i.length; a++)
    n += (((o = i[a]) == null ? void 0 : o.length) ?? 0) + 1;
  return n += Math.min(s, ((r = i[e]) == null ? void 0 : r.length) ?? 0), n;
}
function we(t, e) {
  var n, o;
  const s = t.split(`
`);
  let i = 0;
  for (let r = 0; r < s.length; r++) {
    const a = (((n = s[r]) == null ? void 0 : n.length) ?? 0) + 1;
    if (i + a > e)
      return {
        line: r,
        character: e - i
      };
    i += a;
  }
  return {
    line: s.length - 1,
    character: ((o = s[s.length - 1]) == null ? void 0 : o.length) ?? 0
  };
}
function Re(t, e) {
  let s = e, i = e;
  const n = (o) => /[\w$]/.test(o);
  for (; s > 0 && n(t[s - 1] ?? ""); )
    s--;
  for (; i < t.length && n(t[i] ?? ""); )
    i++;
  return s === i ? null : {
    word: t.slice(s, i),
    start: s,
    end: i
  };
}
function Ie(t, e) {
  const s = (r) => /[\w$.]/.test(r);
  let i = e, n = e;
  for (; i > 0 && s(t[i - 1] ?? ""); )
    i--;
  for (; n < t.length && s(t[n] ?? ""); )
    n++;
  if (i === n)
    return null;
  const o = t.slice(i, n);
  return /^\.+$/.test(o) ? null : { path: o, start: i, end: n };
}
function Ce(t, e) {
  let s = 0;
  for (let i = e - 1; i >= 0; i--)
    if (t[i] === "}")
      s++;
    else if (t[i] === "{" && i > 0 && t[i - 1] === "$") {
      if (s === 0)
        return !0;
      s--;
    }
  return !1;
}
function Oe(t, e) {
  for (let s = e - 1; s >= 0; s--) {
    const i = t[s];
    if (i === "@")
      return !0;
    if (!i || !/[\w]/.test(i))
      return !1;
  }
  return !1;
}
function De(t, e) {
  let s = !1, i = -1;
  for (let a = e - 1; a >= 0; a--) {
    const c = t[a];
    if (c === ">")
      return null;
    if (c === "<") {
      s = !0, i = a;
      break;
    }
  }
  if (!s || i === -1)
    return null;
  let n = i + 1;
  for (; n < t.length && /[\w-]/.test(t[n] ?? ""); )
    n++;
  const o = t.slice(i + 1, n), r = e > n;
  return { tagName: o, inAttribute: r };
}
function ke(t) {
  let e = null;
  return (s) => {
    e !== null && clearTimeout(e), e = setTimeout(() => {
      e = null, s();
    }, t);
  };
}
class ge {
  constructor(e, s) {
    u(this, "documents", /* @__PURE__ */ new Map());
    u(this, "debouncers", /* @__PURE__ */ new Map());
    u(this, "config");
    u(this, "onDocumentParsed");
    this.config = e, this.onDocumentParsed = s;
  }
  open(e, s, i) {
    var o;
    const n = me(e, s, i);
    return this.documents.set(e, n), this.debouncers.set(
      e,
      ke(this.config.performance.debounceMs)
    ), (o = this.onDocumentParsed) == null || o.call(this, n), n;
  }
  change(e, s, i) {
    const n = this.documents.get(e);
    if (!n) {
      this.open(e, s, i);
      return;
    }
    const o = {
      ...n,
      content: s,
      version: i
    };
    this.documents.set(e, o);
    const r = this.debouncers.get(e);
    r && r(() => {
      var c;
      const a = this.documents.get(e);
      if (a && a.version === i) {
        const d = C(a);
        this.documents.set(e, d), (c = this.onDocumentParsed) == null || c.call(this, d);
      }
    });
  }
  close(e) {
    this.documents.delete(e), this.debouncers.delete(e);
  }
  get(e) {
    return this.documents.get(e);
  }
  getAll() {
    return Array.from(this.documents.values());
  }
  has(e) {
    return this.documents.has(e);
  }
}
class _e {
  constructor(e = y) {
    u(this, "index");
    u(this, "documentManager");
    this.index = re(e), this.documentManager = new ge(
      e,
      (s) => this.onDocumentParsed(s)
    );
  }
  /**
   * Called when a document is parsed/updated
   */
  onDocumentParsed(e) {
    this.index.documents.set(e.uri, e), this.reindexComponents(e);
  }
  /**
   * Re-index components from a document
   */
  reindexComponents(e) {
    for (const [s, i] of this.index.componentIndex)
      i === e.uri && this.index.componentIndex.delete(s);
    for (const [s] of e.components)
      this.index.componentIndex.set(s, e.uri);
  }
  /**
   * Open a document in the workspace
   */
  openDocument(e, s, i) {
    return this.documentManager.open(e, s, i);
  }
  /**
   * Update a document's content
   */
  changeDocument(e, s, i) {
    this.documentManager.change(e, s, i);
  }
  /**
   * Close a document
   */
  closeDocument(e) {
    this.documentManager.close(e), this.index.documents.delete(e);
    for (const [s, i] of this.index.componentIndex)
      i === e && this.index.componentIndex.delete(s);
  }
  /**
   * Get a document by URI
   */
  getDocument(e) {
    return this.documentManager.get(e);
  }
  /**
   * Get all documents
   */
  getAllDocuments() {
    return this.documentManager.getAll();
  }
  /**
   * Check if a document is open
   */
  hasDocument(e) {
    return this.documentManager.has(e);
  }
  /**
   * Find the document that defines a component
   */
  findComponentDefinition(e) {
    const s = this.index.componentIndex.get(e);
    if (!s)
      return null;
    const i = this.index.documents.get(s);
    if (!i)
      return null;
    const n = i.scope.components.find((o) => o.name === e);
    return n ? { uri: s, component: n } : null;
  }
  /**
   * Get all component names in the workspace
   */
  getAllComponentNames() {
    return Array.from(this.index.componentIndex.keys());
  }
  /**
   * Get all component usages of a component
   */
  findComponentUsages(e) {
    const s = [];
    for (const i of this.index.documents.values())
      for (const n of i.scope.componentUsages)
        n.componentName === e && s.push({
          uri: i.uri,
          location: {
            line: n.location.start.line - 1,
            // Convert to 0-based
            character: n.location.start.column - 1
          }
        });
    return s;
  }
  /**
   * Register a helper definition
   */
  registerHelper(e) {
    this.index.helperIndex.set(e.name, e);
  }
  /**
   * Register multiple helper definitions
   */
  registerHelpers(e) {
    for (const s of e)
      this.registerHelper(s);
  }
  /**
   * Get a helper definition by name
   */
  getHelper(e) {
    return this.index.helperIndex.get(e);
  }
  /**
   * Get all helper definitions
   */
  getAllHelpers() {
    return Array.from(this.index.helperIndex.values());
  }
  /**
   * Set the data schema for completions
   */
  setDataSchema(e) {
    this.index.dataSchema = e;
  }
  /**
   * Get the data schema
   */
  getDataSchema() {
    return this.index.dataSchema;
  }
  /**
   * Update configuration
   */
  updateConfig(e) {
    this.index.config = {
      ...this.index.config,
      ...e,
      diagnostics: {
        ...this.index.config.diagnostics,
        ...e.diagnostics
      },
      completion: {
        ...this.index.config.completion,
        ...e.completion
      },
      performance: {
        ...this.index.config.performance,
        ...e.performance
      }
    };
  }
  /**
   * Get current configuration
   */
  getConfig() {
    return this.index.config;
  }
  /**
   * Get the full workspace index
   */
  getIndex() {
    return this.index;
  }
}
export {
  y as D,
  U as E,
  _e as W,
  Oe as a,
  De as b,
  Se as c,
  Re as d,
  ge as e,
  oe as f,
  Ie as g,
  ke as h,
  Ce as i,
  me as j,
  I as k,
  l,
  re as m,
  Ae as n,
  be as o,
  ne as p,
  Pe as q,
  Q as r,
  we as s,
  fe as t,
  Ne as u,
  C as v,
  Le as w,
  xe as x
};
//# sourceMappingURL=workspace-C-JHkvmL.js.map
