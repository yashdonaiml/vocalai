const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers.cjs');

const graph = (nodes, edges) => ({ version: 1, nodes, edges });

test('workflow validation requires one start, one explicit end, and complete action paths', () => {
  const { graphErrors } = loader({})('src/lib/workflow-graph.ts');
  const base = [
    { id: 'start', type: 'trigger' },
    { id: 'action', type: 'action', kind: 'tag_conversation', value: 'follow-up' },
    { id: 'end', type: 'end' },
  ];
  assert.deepEqual(graphErrors(graph(base, [
    { id: 'a', source: 'start', target: 'action' },
    { id: 'b', source: 'action', target: 'end' },
  ])), []);
  assert.ok(graphErrors(graph(base.slice(0, 2), [
    { id: 'a', source: 'start', target: 'action' },
  ])).some((message) => /end node/.test(message)));
  assert.ok(graphErrors(graph(base, [
    { id: 'a', source: 'start', target: 'action' },
  ])).some((message) => /one next node/.test(message)));
  assert.ok(graphErrors(graph([...base, { id: 'end-2', type: 'end' }], [
    { id: 'a', source: 'start', target: 'action' },
    { id: 'b', source: 'action', target: 'end' },
  ])).some((message) => /exactly one end/.test(message)));
});

test('workflow validation rejects cycles, invalid branch outcomes, duplicate edges, and malformed nodes safely', () => {
  const { graphErrors, asGraph } = loader({})('src/lib/workflow-graph.ts');
  const nodes = [
    { id: 'start', type: 'trigger' },
    { id: 'condition', type: 'condition', kind: 'duration_over', value: '30' },
    { id: 'yes', type: 'end' },
    { id: 'no', type: 'end' },
  ];
  const branchEdges = [
    { id: 'start-edge', source: 'start', target: 'condition' },
    { id: 'yes-edge', source: 'condition', target: 'yes', outcome: 'yes' },
    { id: 'no-edge', source: 'condition', target: 'no', outcome: 'no' },
  ];
  // A condition-only graph is intentionally incomplete because workflows need an action.
  assert.ok(graphErrors(graph(nodes, branchEdges)).some((message) => /Add an action/.test(message)));
  const cycle = graph([
    { id: 'start', type: 'trigger' },
    { id: 'action', type: 'action', kind: 'tag_conversation', value: 'tag' },
    { id: 'end', type: 'end' },
  ], [
    { id: 'a', source: 'start', target: 'action' },
    { id: 'b', source: 'action', target: 'action' },
    { id: 'c', source: 'action', target: 'end' },
  ]);
  assert.ok(graphErrors(cycle).some((message) => /Loops are not supported/.test(message)));
  const duplicateEdge = graph([
    { id: 'start', type: 'trigger' },
    { id: 'action', type: 'action', kind: 'tag_conversation', value: 'tag' },
    { id: 'end', type: 'end' },
  ], [
    { id: 'a', source: 'start', target: 'action' },
    { id: 'b', source: 'action', target: 'end' },
    { id: 'b', source: 'action', target: 'end' },
  ]);
  assert.ok(graphErrors(duplicateEdge).some((message) => /Connection IDs/.test(message)));
  assert.doesNotThrow(() => graphErrors(graph([null], [])));
  assert.doesNotThrow(() => asGraph([null, { kind: 'tag_conversation' }]));
});