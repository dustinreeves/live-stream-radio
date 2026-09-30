const test = require('node:test');
const assert = require('node:assert');
const nodePath = require('path');
const { isEnabled, projectPath } = require('../src/configValues');

test('isEnabled reads strings and booleans', () => {
  [true, 'true', ' TRUE ', 1, '1', 'yes', 'on'].forEach(value => assert.strictEqual(isEnabled(value), true, String(value)));
  [false, 'false', 0, '0', 'no', '', undefined, null].forEach(value => assert.strictEqual(isEnabled(value), false, String(value)));
});

test('projectPath is relative to the project, unless absolute', () => {
  const project = nodePath.resolve('/radio');
  assert.strictEqual(projectPath(project, './audio'), nodePath.join(project, 'audio'));
  assert.strictEqual(projectPath(project, nodePath.resolve('/music')), nodePath.resolve('/music'));
  assert.strictEqual(projectPath(project, undefined), project);
});
