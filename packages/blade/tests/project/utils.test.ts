import { describe, it, expect } from 'vitest';
import {
  toPascalCase,
  toFilename,
  isValidComponentName,
  parseComponentPath,
  segmentsToPath,
  isHiddenFile,
  getBasename,
} from '../../src/project/utils.js';

describe('toPascalCase', () => {
  it('converts lowercase to PascalCase', () => {
    expect(toPascalCase('button')).toBe('Button');
    expect(toPascalCase('input')).toBe('Input');
  });

  it('converts kebab-case to PascalCase', () => {
    expect(toPascalCase('form-input')).toBe('FormInput');
    expect(toPascalCase('date-time-picker')).toBe('DateTimePicker');
    expect(toPascalCase('a-b-c')).toBe('ABC');
  });

  it('converts snake_case to PascalCase', () => {
    expect(toPascalCase('form_input')).toBe('FormInput');
    expect(toPascalCase('date_time_picker')).toBe('DateTimePicker');
  });

  it('converts camelCase to PascalCase', () => {
    expect(toPascalCase('formInput')).toBe('FormInput');
    expect(toPascalCase('dateTimePicker')).toBe('DateTimePicker');
  });

  it('preserves PascalCase', () => {
    expect(toPascalCase('Button')).toBe('Button');
    expect(toPascalCase('FormInput')).toBe('FormInput');
  });

  it('handles empty string', () => {
    expect(toPascalCase('')).toBe('');
  });

  it('handles single character', () => {
    expect(toPascalCase('a')).toBe('A');
    expect(toPascalCase('A')).toBe('A');
  });

  it('handles mixed delimiters', () => {
    expect(toPascalCase('form-input_field')).toBe('FormInputField');
  });

  it('handles consecutive delimiters', () => {
    expect(toPascalCase('form--input')).toBe('FormInput');
    expect(toPascalCase('form__input')).toBe('FormInput');
  });

  it('handles numbers', () => {
    expect(toPascalCase('button2')).toBe('Button2');
    expect(toPascalCase('v2-button')).toBe('V2Button');
  });
});

describe('toFilename', () => {
  it('converts PascalCase to lowercase', () => {
    expect(toFilename('Button')).toBe('button');
    expect(toFilename('FormInput')).toBe('forminput');
  });

  it('handles already lowercase', () => {
    expect(toFilename('button')).toBe('button');
  });
});

describe('isValidComponentName', () => {
  it('accepts valid component names', () => {
    expect(isValidComponentName('Button')).toBe(true);
    expect(isValidComponentName('FormInput')).toBe(true);
    expect(isValidComponentName('A')).toBe(true);
    expect(isValidComponentName('Button2')).toBe(true);
  });

  it('rejects invalid component names', () => {
    expect(isValidComponentName('button')).toBe(false);
    expect(isValidComponentName('form-input')).toBe(false);
    expect(isValidComponentName('2Button')).toBe(false);
    expect(isValidComponentName('')).toBe(false);
    expect(isValidComponentName('_Button')).toBe(false);
  });
});

describe('parseComponentPath', () => {
  it('parses simple component name', () => {
    expect(parseComponentPath('Button')).toEqual(['Button']);
  });

  it('parses dot-notation path', () => {
    expect(parseComponentPath('Components.Form.Input')).toEqual([
      'Components',
      'Form',
      'Input',
    ]);
  });

  it('handles single dot', () => {
    expect(parseComponentPath('A.B')).toEqual(['A', 'B']);
  });

  it('handles empty segments', () => {
    expect(parseComponentPath('A..B')).toEqual(['A', 'B']);
  });
});

describe('segmentsToPath', () => {
  it('converts single segment', () => {
    expect(segmentsToPath(['Button'])).toBe('button');
  });

  it('converts multiple segments', () => {
    expect(segmentsToPath(['Components', 'Form', 'Input'])).toBe(
      'components/form/input'
    );
  });

  it('handles empty array', () => {
    expect(segmentsToPath([])).toBe('');
  });
});

describe('isHiddenFile', () => {
  it('detects hidden files', () => {
    expect(isHiddenFile('.gitignore')).toBe(true);
    expect(isHiddenFile('.DS_Store')).toBe(true);
  });

  it('detects non-hidden files', () => {
    expect(isHiddenFile('button.blade')).toBe(false);
    expect(isHiddenFile('index.blade')).toBe(false);
  });
});

describe('getBasename', () => {
  it('extracts basename from file path', () => {
    expect(getBasename('/path/to/button.blade')).toBe('button');
    expect(getBasename('components/form/input.blade')).toBe('input');
  });

  it('handles file without extension', () => {
    expect(getBasename('README')).toBe('README');
  });

  it('handles hidden files', () => {
    expect(getBasename('.gitignore')).toBe('.gitignore');
  });

  it('handles multiple dots', () => {
    expect(getBasename('file.test.blade')).toBe('file.test');
  });
});
