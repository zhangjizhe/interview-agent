import { expect, it } from 'vitest';
import { readPresentedQuestion } from './presentedQuestion';

const receipt = { presentationId: 'receipt', taskId: 'task', messageId: 'message', question: 'Exact server question', state: 'OPEN' };
it.each(['OPEN', 'PROCESSING', 'UNKNOWN'])('reads only a complete durable %s receipt', state => {
  expect(readPresentedQuestion({ ...receipt, state, ignored: true })).toEqual({ ...receipt, state });
});
it.each([null, undefined, [], {}, 'receipt', { ...receipt, state: 'ANSWERED' }, { ...receipt, state: 0 }])('rejects malformed or terminal receipt %#', value => {
  expect(readPresentedQuestion(value)).toBeNull();
});
it.each(['presentationId', 'taskId', 'messageId', 'question'])('rejects absent blank or nonstring %s', key => {
  for (const invalid of [undefined, null, '', '  ', 42, {}]) expect(readPresentedQuestion({ ...receipt, [key]: invalid })).toBeNull();
});
