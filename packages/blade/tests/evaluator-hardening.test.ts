// Evaluator hardening
//
// Every test here pins a behaviour that the evaluator got wrong before wave 3:
// the prototype chain was reachable from template expressions, bare identifiers
// resolved through `Object.prototype`, the helper "allowlist" was a plain object
// indexed dynamically, three documented resource limits were never enforced,
// helper warnings were collected into a local array and dropped, and `@let`
// arrow functions were parsed, modelled and stored but never callable.

import { describe, it, expect } from 'vitest';
import {
  evaluate,
  EvaluationError,
  TemplateFunction,
  createBindings,
  hasBinding,
  createHelperRegistry,
  extendBindings,
  hasHelper,
  isReservedPropertyName,
  isTemplateFunction,
  DEFAULT_EVALUATOR_CONFIG,
  type Bindings,
  type EvaluationContext,
  type EvaluationTracking,
  type EvaluatorConfig,
  type HelperFunction,
  type HelperRegistry,
  type RenderWarning,
  type Scope,
} from '../src/evaluator/index.js';
import { expr as build, path, syntheticLoc } from '../src/ast/builders.js';
import { parseExpression } from '../src/parser/index.js';
import type {
  ArrayWildcardNode,
  BinaryOperator,
  CallNode,
  ExprAst,
  FunctionExpr,
  LiteralNode,
  MemberAccessNode,
  PathItem,
  PathNode,
  TernaryNode,
  UnaryNode,
  BinaryNode,
} from '../src/ast/types.js';

// -----------------------------------------------------------------------------
// Expression fixtures
// -----------------------------------------------------------------------------

/**
 * The location every expression in this file is built at.
 *
 * These trees are hand-assembled to exercise evaluator semantics, so none of
 * them has source text behind it. The builders no longer invent a location
 * when a caller omits one, so saying "this node came from nowhere" is a
 * deliberate, greppable act - `syntheticLoc` - rather than a silent default.
 */
const L = syntheticLoc();

/** The builder API with the synthetic location already applied. */
const expr = {
  literal: (value: string | number | boolean | null | undefined): LiteralNode =>
    build.literal(value, L),
  pathFrom: (source: string, isGlobal?: boolean): PathNode =>
    build.pathFrom(source, L, isGlobal ?? source.startsWith('$')),
  pathNode: (segments: PathItem[], isGlobal = false): PathNode =>
    build.pathNode(segments, L, isGlobal),
  call: (callee: string, args: ExprAst[]): CallNode =>
    build.call(callee, args, L),
  unary: (operator: '!' | '-', operand: ExprAst): UnaryNode =>
    build.unary(operator, operand, L),
  binary: (
    operator: BinaryOperator,
    left: ExprAst,
    right: ExprAst
  ): BinaryNode => build.binary(operator, left, right, L),
  ternary: (condition: ExprAst, truthy: ExprAst, falsy: ExprAst): TernaryNode =>
    build.ternary(condition, truthy, falsy, L),
  array: (elements: ExprAst[]) => build.array(elements, L),
  wildcard: (pathNode: PathNode): ArrayWildcardNode =>
    build.wildcard(pathNode, L),
  member: (
    object: ExprAst,
    segments: PathItem[],
    hasWildcard = false
  ): MemberAccessNode => build.member(object, segments, hasWildcard, L),
  fn: (params: string[], body: ExprAst): FunctionExpr =>
    build.fn(params, body, L),
};

// =============================================================================
// Fixtures
// =============================================================================

/**
 * A sink with the warnings array present, which is what the renderer will pass
 * once `RenderStats` carries one; the field is optional on
 * {@link EvaluationTracking} only for that transition.
 */
type TrackingSink = EvaluationTracking & { readonly warnings: RenderWarning[] };

function tracking(): TrackingSink {
  return {
    pathsAccessed: new Set<string>(),
    helpersUsed: new Set<string>(),
    warnings: [],
  };
}

function context(
  scope: Partial<Scope> = {},
  helpers: HelperRegistry = {},
  overrides: {
    config?: EvaluatorConfig;
    tracking?: TrackingSink;
  } = {}
): EvaluationContext {
  return {
    scope: {
      locals: scope.locals ?? createBindings(),
      data: scope.data ?? {},
      globals: scope.globals ?? createBindings(),
    },
    helpers,
    config: overrides.config,
    tracking: overrides.tracking,
  };
}

/** A helper that returns whatever it is given, after emitting `warning`. */
function warningHelper(warning: string): HelperFunction {
  return (_scope, setWarning) => value => {
    setWarning(warning);
    return value;
  };
}

/** Parses an expression that must parse cleanly. */
function parse(source: string): ExprAst {
  const result = parseExpression(source);
  expect(result.errors).toEqual([]);
  expect(result.value).not.toBeNull();
  return result.value as ExprAst;
}

// =============================================================================
// Finding 1: the prototype chain must not be reachable
// =============================================================================

describe('property access is own-property only', () => {
  it('does not resolve constructor on a data object', () => {
    const ctx = context({ data: { user: {} } });
    expect(evaluate(expr.pathFrom('user.constructor'), ctx)).toBeUndefined();
  });

  it('does not resolve the Function constructor through two hops', () => {
    const ctx = context({ data: { user: {} } });
    expect(
      evaluate(expr.pathFrom('user.constructor.constructor'), ctx)
    ).toBeUndefined();
  });

  it('does not resolve __proto__', () => {
    const ctx = context({ data: { user: { name: 'Alice' } } });
    expect(evaluate(expr.pathFrom('user.__proto__'), ctx)).toBeUndefined();
  });

  it('does not resolve prototype', () => {
    const ctx = context({ data: { user: {} } });
    expect(evaluate(expr.pathFrom('user.prototype'), ctx)).toBeUndefined();
  });

  it('does not resolve inherited data properties', () => {
    const proto = { inherited: 'leaked' };
    const ctx = context({ data: { user: Object.create(proto) as object } });
    expect(evaluate(expr.pathFrom('user.inherited'), ctx)).toBeUndefined();
  });

  it('does not resolve inherited Object.prototype methods', () => {
    const ctx = context({ data: { user: { name: 'Alice' } } });
    expect(evaluate(expr.pathFrom('user.toString'), ctx)).toBeUndefined();
    expect(evaluate(expr.pathFrom('user.hasOwnProperty'), ctx)).toBeUndefined();
    expect(evaluate(expr.pathFrom('user.valueOf'), ctx)).toBeUndefined();
  });

  it('still resolves own properties, including shadowing ones', () => {
    const ctx = context({
      data: { user: { name: 'Alice', toString: 'mine' } },
    });
    expect(evaluate(expr.pathFrom('user.name'), ctx)).toBe('Alice');
    expect(evaluate(expr.pathFrom('user.toString'), ctx)).toBe('mine');
  });

  it('treats functions in data as opaque', () => {
    const data = { fn: (a: number) => a };
    const ctx = context({ data });
    expect(evaluate(expr.pathFrom('fn'), ctx)).toBe(data.fn);
    expect(evaluate(expr.pathFrom('fn.name'), ctx)).toBeUndefined();
    expect(evaluate(expr.pathFrom('fn.call'), ctx)).toBeUndefined();
    expect(evaluate(expr.pathFrom('fn.constructor'), ctx)).toBeUndefined();
  });

  it('keeps array intrinsics working', () => {
    const ctx = context({ data: { items: [1, 2, 3] } });
    expect(evaluate(expr.pathFrom('items.length'), ctx)).toBe(3);
    expect(evaluate(expr.pathFrom('items[1]'), ctx)).toBe(2);
    expect(evaluate(expr.pathFrom('items[9]'), ctx)).toBeUndefined();
  });

  it('does not expose array methods', () => {
    const ctx = context({ data: { items: [1, 2, 3] } });
    expect(evaluate(expr.pathFrom('items.map'), ctx)).toBeUndefined();
    expect(evaluate(expr.pathFrom('items.constructor'), ctx)).toBeUndefined();
  });

  it('exposes length on strings and nothing else', () => {
    const ctx = context({ data: { name: 'Alice' } });
    expect(evaluate(expr.pathFrom('name.length'), ctx)).toBe(5);
    expect(evaluate(expr.pathFrom('name.toUpperCase'), ctx)).toBeUndefined();
    expect(evaluate(expr.pathFrom('name.constructor'), ctx)).toBeUndefined();
  });

  it('reads null-prototype data objects', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.name = 'Alice';
    const ctx = context({ data: { user: bare } });
    expect(evaluate(expr.pathFrom('user.name'), ctx)).toBe('Alice');
  });

  it('blocks the prototype chain through wildcards', () => {
    const ctx = context({ data: { items: [{ a: 1 }, { a: 2 }] } });
    const node = expr.wildcard(expr.pathFrom('items[*].constructor'));
    expect(evaluate(node, ctx)).toEqual([undefined, undefined]);
  });

  it('blocks the prototype chain through member access', () => {
    const ctx = context({ data: { items: [{ a: 1 }] } });
    const node = expr.member(expr.pathFrom('items'), [
      path.index(0),
      path.key('constructor'),
    ]);
    expect(evaluate(node, ctx)).toBeUndefined();
  });

  it('blocks the prototype chain through a call result', () => {
    const identity: HelperFunction = () => value => value;
    const ctx = context({ data: {} }, { identity });
    const node = expr.member(expr.call('identity', [expr.literal('x')]), [
      path.key('constructor'),
    ]);
    expect(evaluate(node, ctx)).toBeUndefined();
  });

  it('names the reserved property names in one place', () => {
    expect(isReservedPropertyName('__proto__')).toBe(true);
    expect(isReservedPropertyName('constructor')).toBe(true);
    expect(isReservedPropertyName('prototype')).toBe(true);
    expect(isReservedPropertyName('name')).toBe(false);
  });
});

// =============================================================================
// Finding 2: bare identifiers must not resolve through Object.prototype
// =============================================================================

describe('bare identifier resolution', () => {
  it('does not resolve Object.prototype names as locals', () => {
    const ctx = context({ locals: {}, data: {} });
    expect(evaluate(expr.pathFrom('toString'), ctx)).toBeUndefined();
    expect(evaluate(expr.pathFrom('valueOf'), ctx)).toBeUndefined();
    expect(evaluate(expr.pathFrom('hasOwnProperty'), ctx)).toBeUndefined();
  });

  it('does not let inherited names shadow real data', () => {
    const ctx = context({ locals: {}, data: { toString: 'MINE' } });
    expect(evaluate(expr.pathFrom('toString'), ctx)).toBe('MINE');
  });

  it('does not resolve Object.prototype names as globals', () => {
    const ctx = context({ globals: {} });
    expect(evaluate(expr.pathFrom('toString', true), ctx)).toBeUndefined();
  });

  it('never resolves a reserved name, in any scope', () => {
    const ctx = context({
      locals: { constructor: 'local' },
      data: { constructor: 'data' },
      globals: { constructor: 'global' },
    });
    expect(evaluate(expr.pathFrom('constructor'), ctx)).toBeUndefined();
    expect(evaluate(expr.pathFrom('constructor', true), ctx)).toBeUndefined();
  });

  it('keeps locals winning over data', () => {
    const ctx = context({ locals: { x: 1 }, data: { x: 2 } });
    expect(evaluate(expr.pathFrom('x'), ctx)).toBe(1);
  });

  it('resolves a local holding undefined without falling through to data', () => {
    const locals = createBindings();
    locals.x = undefined;
    const ctx = context({ locals, data: { x: 'data' } });
    expect(evaluate(expr.pathFrom('x'), ctx)).toBeUndefined();
  });
});

describe('bindings are null-prototype by construction', () => {
  it('creates empty bindings without a prototype', () => {
    const bindings = createBindings();
    expect(Object.getPrototypeOf(bindings)).toBeNull();
    expect('toString' in bindings).toBe(false);
  });

  it('copies own enumerable entries from a plain object', () => {
    const bindings = createBindings({ a: 1, b: 2 });
    expect(Object.getPrototypeOf(bindings)).toBeNull();
    expect(bindings.a).toBe(1);
    expect(bindings.b).toBe(2);
  });

  it('does not let a __proto__ entry reassign the prototype', () => {
    const polluted = JSON.parse('{"__proto__": {"polluted": true}}') as Record<
      string,
      unknown
    >;
    const bindings = createBindings(polluted);
    expect(Object.getPrototypeOf(bindings)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('extends bindings without mutating the base', () => {
    const base = createBindings({ a: 1 });
    const extended = extendBindings(base, { b: 2 });
    // The extension CHAINS rather than copies - a loop must not copy its
    // enclosing locals once per iteration - so the base is the prototype.
    expect(Object.getPrototypeOf(extended)).toBe(base);
    expect(extended.a).toBe(1);
    expect(extended.b).toBe(2);
    expect('b' in base).toBe(false);
  });

  it('roots every binding chain at null, however deeply extended', () => {
    let bindings: Bindings = createBindings({ a: 1 });
    for (let depth = 0; depth < 8; depth++) {
      bindings = extendBindings(bindings, { [`v${depth}`]: depth });
    }
    let root: object | null = bindings;
    while (Object.getPrototypeOf(root) !== null) {
      root = Object.getPrototypeOf(root) as object;
    }
    // Nothing in the chain is `Object.prototype`, so no lookup through it can
    // ever reach `toString`, `constructor` or any other inherited member.
    expect(root).not.toBe(Object.prototype);
    expect(hasBinding(bindings, 'toString')).toBe(false);
    expect(hasBinding(bindings, 'a')).toBe(true);
  });

  it('extends with a __proto__ key as an ordinary binding', () => {
    const base = createBindings();
    const extended: Bindings = extendBindings(base, {
      ['__proto__']: 'plain',
    });
    expect(Object.getPrototypeOf(extended)).toBe(base);
    expect(Object.prototype.hasOwnProperty.call(extended, '__proto__')).toBe(
      true
    );
  });

  it('resolves globals held in a null-prototype binding set', () => {
    const ctx = context({ globals: createBindings({ currency: 'EUR' }) });
    expect(evaluate(expr.pathFrom('currency', true), ctx)).toBe('EUR');
  });
});

// =============================================================================
// Finding 3: the helper registry is an allowlist, not a plain object
// =============================================================================

describe('helper resolution', () => {
  it('reports an unknown helper for inherited Object.prototype members', () => {
    const ctx = context({}, {});
    for (const name of ['constructor', 'valueOf', 'hasOwnProperty']) {
      const node = expr.call(name, [expr.literal(1)]);
      expect(() => evaluate(node, ctx)).toThrow(EvaluationError);
      try {
        evaluate(node, ctx);
      } catch (error) {
        expect((error as EvaluationError).code).toBe('UNKNOWN_HELPER');
      }
    }
  });

  it('does not expose methods of a class-instance registry', () => {
    class Registry {
      secret(): HelperFunction {
        return () => () => 'leaked';
      }
    }
    const instance = new Registry() as unknown as HelperRegistry;
    const ctx = context({}, instance);
    expect(() => evaluate(expr.call('secret', []), ctx)).toThrow(
      /Unknown helper function: secret/
    );
  });

  it('ignores own entries that are not functions', () => {
    const registry = { notAHelper: 42 } as unknown as HelperRegistry;
    const ctx = context({}, registry);
    expect(() => evaluate(expr.call('notAHelper', []), ctx)).toThrow(
      /Unknown helper function: notAHelper/
    );
  });

  it('raises a typed error when a helper does not curry to a function', () => {
    const broken = (() => 'not a function') as unknown as HelperFunction;
    const ctx = context({}, { broken });
    try {
      evaluate(expr.call('broken', []), ctx);
      expect.unreachable('expected a NOT_CALLABLE error');
    } catch (error) {
      expect(error).toBeInstanceOf(EvaluationError);
      expect((error as EvaluationError).code).toBe('NOT_CALLABLE');
    }
  });

  it('still calls a legitimate helper', () => {
    const double: HelperFunction = () => value => (value as number) * 2;
    const ctx = context({}, { double });
    expect(evaluate(expr.call('double', [expr.literal(21)]), ctx)).toBe(42);
  });

  it('freezes a registry built by createHelperRegistry', () => {
    const double: HelperFunction = () => value => (value as number) * 2;
    const registry = createHelperRegistry({ double });
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.getPrototypeOf(registry)).toBeNull();
    const ctx = context({}, registry);
    expect(evaluate(expr.call('double', [expr.literal(4)]), ctx)).toBe(8);
    expect(() => evaluate(expr.call('constructor', []), ctx)).toThrow(
      EvaluationError
    );
  });

  it('answers hasHelper from the same allowlist the evaluator calls through', () => {
    const double: HelperFunction = () => value => (value as number) * 2;
    const registry: HelperRegistry = { double };
    expect(hasHelper(registry, 'double')).toBe(true);
    expect(hasHelper(registry, 'constructor')).toBe(false);
    expect(hasHelper(registry, 'toString')).toBe(false);
    expect(hasHelper(registry, 'missing')).toBe(false);
  });

  it('drops reserved names from a host-supplied registry', () => {
    const registry = createHelperRegistry({
      constructor: (() => () => 'leaked') as HelperFunction,
    });
    expect(Object.keys(registry)).toEqual([]);
  });
});

// =============================================================================
// Finding 4: resource limits are enforced
// =============================================================================

describe('resource limits', () => {
  const identity: HelperFunction = () => value => value;

  function nestedCalls(depth: number): ExprAst {
    let node: ExprAst = expr.literal(1);
    for (let i = 0; i < depth; i++) {
      node = expr.call('identity', [node]);
    }
    return node;
  }

  it('allows helper nesting up to maxFunctionDepth', () => {
    const ctx = context(
      {},
      { identity },
      {
        config: {
          maxFunctionDepth: 3,
          maxRecursionDepth: 50,
          maxHelperStringLength: 1_000_000,
        },
      }
    );
    expect(evaluate(nestedCalls(3), ctx)).toBe(1);
  });

  it('throws once helper nesting exceeds maxFunctionDepth', () => {
    const ctx = context(
      {},
      { identity },
      {
        config: {
          maxFunctionDepth: 3,
          maxRecursionDepth: 50,
          maxHelperStringLength: 1_000_000,
        },
      }
    );
    try {
      evaluate(nestedCalls(4), ctx);
      expect.unreachable('expected a RESOURCE_LIMIT error');
    } catch (error) {
      expect(error).toBeInstanceOf(EvaluationError);
      const evaluationError = error as EvaluationError;
      expect(evaluationError.code).toBe('RESOURCE_LIMIT');
      expect(evaluationError.message).toMatch(/maxFunctionDepth/);
      expect(evaluationError.location).toBeDefined();
    }
  });

  it('falls back to the documented defaults when no config is given', () => {
    expect(DEFAULT_EVALUATOR_CONFIG).toEqual({
      maxFunctionDepth: 10,
      maxRecursionDepth: 50,
      maxHelperStringLength: 1_000_000,
    });
    const ctx = context({}, { identity });
    expect(evaluate(nestedCalls(10), ctx)).toBe(1);
    expect(() => evaluate(nestedCalls(11), ctx)).toThrow(/maxFunctionDepth/);
  });

  it('bounds user function recursion with maxRecursionDepth', () => {
    // countdown = (n) => n <= 0 ? 0 : countdown(n - 1)
    const body = expr.ternary(
      expr.binary('<=', expr.pathFrom('n'), expr.literal(0)),
      expr.literal(0),
      expr.call('countdown', [
        expr.binary('-', expr.pathFrom('n'), expr.literal(1)),
      ])
    );
    const countdown = evaluate(expr.fn(['n'], body), context());
    expect(isTemplateFunction(countdown)).toBe(true);
    (countdown as TemplateFunction).captureSelf('countdown');

    const config: EvaluatorConfig = {
      maxFunctionDepth: 10,
      maxRecursionDepth: 5,
      maxHelperStringLength: 1_000_000,
    };
    const ctx = context(
      { locals: extendBindings(createBindings(), { countdown }) },
      {},
      { config }
    );

    expect(evaluate(expr.call('countdown', [expr.literal(4)]), ctx)).toBe(0);
    try {
      evaluate(expr.call('countdown', [expr.literal(50)]), ctx);
      expect.unreachable('expected a RESOURCE_LIMIT error');
    } catch (error) {
      expect(error).toBeInstanceOf(EvaluationError);
      expect((error as EvaluationError).code).toBe('RESOURCE_LIMIT');
      expect((error as EvaluationError).message).toMatch(/maxRecursionDepth/);
    }
  });

  it('counts helper depth per path, not per render', () => {
    // identity(1) + identity(2) is depth 1 twice, not depth 2.
    const ctx = context(
      {},
      { identity },
      {
        config: {
          maxFunctionDepth: 1,
          maxRecursionDepth: 50,
          maxHelperStringLength: 1_000_000,
        },
      }
    );
    const node = expr.binary(
      '+',
      expr.call('identity', [expr.literal(1)]),
      expr.call('identity', [expr.literal(2)])
    );
    expect(evaluate(node, ctx)).toBe(3);
  });
});

// =============================================================================
// Finding 5: helper warnings reach a sink
// =============================================================================

describe('helper warnings', () => {
  it('collects warnings with the helper name and location', () => {
    const sink = tracking();
    const ctx = context(
      {},
      { coerce: warningHelper('coerced "nope" to 0') },
      {
        tracking: sink,
      }
    );
    const node = expr.call('coerce', [expr.literal('nope')]);
    evaluate(node, ctx);
    expect(sink.warnings).toEqual([
      {
        message: 'coerced "nope" to 0',
        helper: 'coerce',
        location: node.location,
      },
    ]);
  });

  it('collects every warning, in order', () => {
    const sink = tracking();
    const noisy: HelperFunction = (_scope, setWarning) => value => {
      setWarning('first');
      setWarning('second');
      return value;
    };
    const ctx = context({}, { noisy }, { tracking: sink });
    evaluate(expr.call('noisy', [expr.literal(1)]), ctx);
    expect(sink.warnings.map(w => w.message)).toEqual(['first', 'second']);
  });

  it('records paths and helpers alongside warnings', () => {
    const sink = tracking();
    const ctx = context(
      { data: { total: 1 } },
      { coerce: warningHelper('w') },
      { tracking: sink }
    );
    evaluate(expr.call('coerce', [expr.pathFrom('total')]), ctx);
    expect([...sink.pathsAccessed]).toEqual(['total']);
    expect([...sink.helpersUsed]).toEqual(['coerce']);
  });

  it('drops warnings silently when no tracking sink is attached', () => {
    const ctx = context({}, { coerce: warningHelper('w') });
    expect(() =>
      evaluate(expr.call('coerce', [expr.literal(1)]), ctx)
    ).not.toThrow();
  });
});

// =============================================================================
// Finding 6: user-defined functions are first class
// =============================================================================

describe('user-defined functions', () => {
  it('parses an arrow function as an expression', () => {
    const parsed = parse('(a) => a * 2');
    expect(parsed.kind).toBe('function');
  });

  it('evaluates a function expression to a template function', () => {
    const ctx = context();
    const value = evaluate(parse('(a) => a * 2'), ctx);
    expect(isTemplateFunction(value)).toBe(true);
    expect(value).toBeInstanceOf(TemplateFunction);
  });

  it('calls a function bound in locals', () => {
    const double = evaluate(parse('(a) => a * 2'), context());
    const ctx = context({
      locals: extendBindings(createBindings(), { double }),
    });
    expect(evaluate(parse('double(21)'), ctx)).toBe(42);
  });

  it('calls a function bound in globals', () => {
    const double = evaluate(parse('(a) => a * 2'), context());
    const ctx = context({
      globals: extendBindings(createBindings(), { double }),
    });
    expect(evaluate(parse('double(4)'), ctx)).toBe(8);
  });

  it('lets a user function shadow a helper of the same name', () => {
    const helpers: HelperRegistry = {
      double: () => value => (value as number) * 100,
    };
    const double = evaluate(parse('(a) => a * 2'), context());
    const ctx = context(
      { locals: extendBindings(createBindings(), { double }) },
      helpers
    );
    expect(evaluate(parse('double(3)'), ctx)).toBe(6);
  });

  it('closes over the scope it was defined in', () => {
    const defScope = context({
      locals: extendBindings(createBindings(), { factor: 3 }),
      data: { base: 10 },
    });
    const scaled = evaluate(parse('(a) => a * factor + base'), defScope);
    const callScope = context({
      locals: extendBindings(createBindings(), { scaled, factor: 1000 }),
      data: { base: 0 },
    });
    expect(evaluate(parse('scaled(2)'), callScope)).toBe(16);
  });

  it('shadows captured bindings with parameters', () => {
    const defScope = context({
      locals: extendBindings(createBindings(), { a: 99 }),
    });
    const identity = evaluate(parse('(a) => a'), defScope);
    const ctx = context({
      locals: extendBindings(createBindings(), { identity }),
    });
    expect(evaluate(parse('identity(1)'), ctx)).toBe(1);
  });

  it('passes undefined for missing arguments', () => {
    const fn = evaluate(parse('(a, b) => b'), context());
    const ctx = context({ locals: extendBindings(createBindings(), { fn }) });
    expect(evaluate(parse('fn(1)'), ctx)).toBeUndefined();
  });

  it('supports recursion once the binder calls captureSelf', () => {
    // factorial = (n) => n <= 1 ? 1 : n * factorial(n - 1)
    const factorial = evaluate(
      parse('(n) => n <= 1 ? 1 : n * factorial(n - 1)'),
      context()
    ) as TemplateFunction;
    factorial.captureSelf('factorial');
    const ctx = context({
      locals: extendBindings(createBindings(), { factorial }),
    });
    expect(evaluate(parse('factorial(5)'), ctx)).toBe(120);
  });

  it('cannot recurse before captureSelf', () => {
    const factorial = evaluate(
      parse('(n) => n <= 1 ? 1 : n * factorial(n - 1)'),
      context()
    );
    const ctx = context({
      locals: extendBindings(createBindings(), { factorial }),
    });
    expect(() => evaluate(parse('factorial(5)'), ctx)).toThrow(
      /Unknown helper function: factorial/
    );
  });

  it('refuses to call a non-callable binding', () => {
    const ctx = context({ locals: extendBindings(createBindings(), { x: 5 }) });
    try {
      evaluate(parse('x(1)'), ctx);
      expect.unreachable('expected a NOT_CALLABLE error');
    } catch (error) {
      expect(error).toBeInstanceOf(EvaluationError);
      expect((error as EvaluationError).code).toBe('NOT_CALLABLE');
    }
  });

  it('refuses to call a raw host function bound in scope', () => {
    const ctx = context({
      locals: extendBindings(createBindings(), { fn: () => 1 }),
    });
    expect(() => evaluate(parse('fn(1)'), ctx)).toThrow(/host function/);
  });

  it('never resolves a callee from data', () => {
    const ctx = context({ data: { fn: (a: number) => a } });
    expect(() => evaluate(parse('fn(1)'), ctx)).toThrow(
      /Unknown helper function: fn/
    );
  });

  it('records a user function call in helpersUsed', () => {
    const sink = tracking();
    const double = evaluate(parse('(a) => a * 2'), context());
    const ctx = context(
      { locals: extendBindings(createBindings(), { double }) },
      {},
      { tracking: sink }
    );
    evaluate(parse('double(1)'), ctx);
    expect([...sink.helpersUsed]).toEqual(['double']);
  });

  it('lets a user function call a helper', () => {
    const helpers: HelperRegistry = {
      triple: () => value => (value as number) * 3,
    };
    const fn = evaluate(parse('(a) => triple(a) + 1'), context({}, helpers));
    const ctx = context(
      { locals: extendBindings(createBindings(), { fn }) },
      helpers
    );
    expect(evaluate(parse('fn(2)'), ctx)).toBe(7);
  });
});
