// @bladets/corpus - the shared renderer conformance corpus.
//
// Not published. Imported by `@bladets/template`'s test suite and by
// `@bladets/tempo`'s, so that the three renderers are checked against one
// table instead of three disjoint ones.

export type {
  CorpusCase,
  CorpusLimits,
  CorpusRenderOptions,
  ExpectedDiagnostic,
  ExpectedFailure,
  RendererId,
} from './types.js';
export { RENDERER_IDS } from './types.js';

export { CORPUS } from './cases.js';

export type { Exclusion } from './compare.js';
export {
  asDocument,
  exclusionsIn,
  expectedDocumentFor,
  includesRenderer,
  isCompileFailure,
  reserializeHtml,
  serializeNodes,
} from './compare.js';

export type {
  SamplePayload,
  SampleProject,
  SampleTemplate,
} from './samples.js';
export { SAMPLES_ROOT, loadSampleProjects } from './samples.js';

export { SAMPLE_GLOBALS, SAMPLE_NOW } from './clock.js';

export { PROJECT_FIXTURES_ROOT, projectFixture } from './fixtures.js';
