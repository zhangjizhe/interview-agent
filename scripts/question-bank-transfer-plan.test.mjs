import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionFingerprint, planQuestionTransfer } from './question-bank-transfer-plan.mjs';
const row = id => ({ questionId: id, position: 'Synthetic', level: 'P5', category: 'general', question: 'Synthetic question', answer: 'Synthetic answer', tags: '', createdAt: '2026-10-10', text: 'Synthetic question Synthetic answer', vector: Array(1024).fill(0.25) });
test('empty destination plans inserts without mutating source', () => { const a=row('a'), snapshot=JSON.stringify(a); const p=planQuestionTransfer([a],[]);assert.equal(p.insert.length,1);assert.equal(p.skip.length,0);assert.equal(JSON.stringify(a),snapshot); });
test('same ID and complete content fingerprint skip on retry', () => assert.equal(planQuestionTransfer([row('a')],[row('a')]).skip.length,1));
test('same ID with different content refuses entire plan', () => assert.throws(()=>planQuestionTransfer([row('a')],[{...row('a'),answer:'changed'}]),/CONTENT_CONFLICT/));
test('duplicate IDs refuse source and destination', () => {assert.throws(()=>planQuestionTransfer([row('a'),row('a')],[]),/DUPLICATE_ID/);assert.throws(()=>planQuestionTransfer([],[row('a'),row('a')]),/DUPLICATE_ID/);});
test('vector dimensions and non-finite values are rejected', () => {for(const vector of [[],Array(1024).fill(NaN),Array(1024).fill(Infinity),Array(1024).fill('1')])assert.throws(()=>questionFingerprint({...row('a'),vector}),/INVALID_VECTOR/);});
test('UTF8 byte limits apply without truncation', () => assert.throws(()=>questionFingerprint({...row('a'),question:'中'.repeat(1400)}),/INVALID_TEXT/));
test('missing field and blank required field reject', () => {assert.throws(()=>questionFingerprint({...row('a'),tags:undefined}),/INVALID_TEXT/);assert.throws(()=>questionFingerprint({...row('a'),position:' '}),/MISSING_REQUIRED/);});
test('irrelevant primary ID ignored while vector and text changes alter fingerprint', () => {assert.equal(questionFingerprint(row('a')),questionFingerprint({...row('a'),id:'different'}));assert.notEqual(questionFingerprint(row('a')),questionFingerprint({...row('a'),text:'changed'}));assert.notEqual(questionFingerprint(row('a')),questionFingerprint({...row('a'),vector:Array(1024).fill(0.5)}));});
test('source fingerprint is order independent', () => assert.equal(planQuestionTransfer([row('a'),row('b')],[]).sourceFingerprint,planQuestionTransfer([row('b'),row('a')],[]).sourceFingerprint));
test('bounded arrays required', () => {assert.throws(()=>planQuestionTransfer(null,[]),/BOUNDS/);assert.throws(()=>planQuestionTransfer(Array(1001).fill(row('a')),[]),/BOUNDS/);});

test('sparse vectors fail instead of treating holes as valid finite coordinates', () => {
  for (const vector of [Array(1024), Object.assign(Array(1024), { 0: 0.25, 1023: 0.25 })]) {
    assert.throws(() => questionFingerprint({ ...row('a'), vector }), /INVALID_VECTOR/);
  }
  const vector = Array(1024).fill(0.25); delete vector[512];
  assert.throws(() => questionFingerprint({ ...row('a'), vector }), /INVALID_VECTOR/);
});
test('null, explicit undefined and boxed numbers cannot be vector coordinates', () => {
  for (const value of [null, undefined, new Number(1), true]) {
    const vector = Array(1024).fill(0.25); vector[1023] = value;
    assert.throws(() => questionFingerprint({ ...row('a'), vector }), /INVALID_VECTOR/);
  }
});
test('each UTF8 field accepts its exact byte limit and refuses one additional byte', () => {
  const limits = { questionId: 100, position: 100, level: 20, category: 100, question: 4000, answer: 8000, tags: 500, createdAt: 50, text: 8000 };
  for (const [field, limit] of Object.entries(limits)) {
    assert.doesNotThrow(() => questionFingerprint({ ...row('a'), [field]: 'x'.repeat(limit) }));
    assert.throws(() => questionFingerprint({ ...row('a'), [field]: 'x'.repeat(limit + 1) }), /INVALID_TEXT/);
    const multibyte = '中'.repeat(Math.floor(limit / 3)) + 'x'.repeat(limit % 3);
    assert.doesNotThrow(() => questionFingerprint({ ...row('a'), [field]: multibyte }));
    assert.throws(() => questionFingerprint({ ...row('a'), [field]: multibyte + 'x' }), /INVALID_TEXT/);
  }
});
test('source and target capacity is enforced separately and inclusively', () => {
  const many = Array.from({ length: 1000 }, (_, i) => row(`id-${i}`));
  assert.equal(planQuestionTransfer(many, []).sourceCount, 1000);
  assert.equal(planQuestionTransfer([], many).targetCount, 1000);
  assert.throws(() => planQuestionTransfer([], [...many, row('extra')]), /BOUNDS/);
});
test('sparse source and target are rejected rather than silently skipped', () => {
  assert.throws(() => planQuestionTransfer(Array(1), []));
  assert.throws(() => planQuestionTransfer([], Array(1)));
});
test('all preserved fields and any vector coordinate participate in content hash', () => {
  const base = row('a'), fingerprint = questionFingerprint(base);
  for (const field of ['questionId', 'position', 'level', 'category', 'question', 'answer', 'tags', 'createdAt', 'text']) {
    assert.notEqual(questionFingerprint({ ...base, [field]: `${base[field]}x` }), fingerprint, field);
  }
  const vector = [...base.vector]; vector[1023] = 0.5;
  assert.notEqual(questionFingerprint({ ...base, vector }), fingerprint);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
});
test('property insertion order and source row order do not change fingerprints', () => {
  const base = row('a'), reversed = Object.fromEntries(Object.entries(base).reverse());
  assert.equal(questionFingerprint(base), questionFingerprint(reversed));
  const first = planQuestionTransfer([row('c'), row('a'), row('b')], [row('b')]);
  const second = planQuestionTransfer([row('a'), row('b'), row('c')], [row('b')]);
  assert.deepEqual(first, second);
  assert.deepEqual(first.insert.map(x => x.questionId), ['a', 'c']);
});
test('distinct delimiter-bearing IDs and text are not concatenation hash collisions', () => {
  assert.notEqual(questionFingerprint({ ...row('a'), question: 'ab', answer: 'c' }), questionFingerprint({ ...row('a'), question: 'a', answer: 'bc' }));
  assert.notEqual(planQuestionTransfer([row('a,b'), row('c')], []).sourceFingerprint, planQuestionTransfer([row('a'), row('b,c')], []).sourceFingerprint);
});
test('a single conflicting destination aborts despite other insertable rows', () => {
  assert.throws(() => planQuestionTransfer([row('a'), row('b')], [{ ...row('b'), text: 'changed' }]), /CONTENT_CONFLICT/);
});

test('finite double outside float32 range rejected', () => assert.throws(() => questionFingerprint({...row('a'), vector:Array(1024).fill(1e300)}), /INVALID_VECTOR/));
