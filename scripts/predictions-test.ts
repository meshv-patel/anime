// Comprehensive test suite for Episode Predictions logic, submission lifecycle, answer privacy, and scoring
import { createGamesStore } from '../src/services/gamesStore';

// Mock localStorage for headless Node.js
const memoryStorage: Record<string, string> = {};
const mockStorage = {
  getItem: (k: string) => memoryStorage[k] ?? null,
  setItem: (k: string, v: string) => { memoryStorage[k] = v; },
  removeItem: (k: string) => { delete memoryStorage[k]; },
  clear: () => { for (const k of Object.keys(memoryStorage)) delete memoryStorage[k]; }
};
(globalThis as any).localStorage = mockStorage;
(globalThis as any).sessionStorage = mockStorage;

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!ok) failed++;
};

console.log('--- STARTING EPISODE PREDICTIONS TEST SUITE ---\n');

const store = createGamesStore();
const roomId = 'predroomtest12345678';

// 1. Prediction Creation
console.log('1. Testing Prediction Creation');
const pred = await store.createPrediction(
  roomId,
  'Will the mentor survive the battle?',
  'choice',
  [
    { id: 'opt-1', text: 'Yes, against all odds' },
    { id: 'opt-2', text: 'No, tragic hero exit' },
    { id: 'opt-3', text: 'Unclear / cliffhanger' }
  ],
  null,
  null,
  false,
  20
);

check('Prediction created with open status', pred.status === 'open');
check('Options registered properly', pred.options.length === 3);
check('Points reward set', pred.pointsReward === 20);

// 2. Submission & Editing Before Lock
console.log('\n2. Testing Submission & Editing Before Lock');
const ans1 = await store.submitAnswer(
  pred.id,
  roomId,
  'user-1',
  'Tanjiro',
  '🌸|#f4a6c0',
  'Yes, against all odds'
);
check('Participant 1 successfully submits answer', ans1.answer === 'Yes, against all odds');

// Edit before lock: participant changes their answer
const ans1Updated = await store.submitAnswer(
  pred.id,
  roomId,
  'user-1',
  'Tanjiro',
  '🌸|#f4a6c0',
  'No, tragic hero exit'
);
check('Answer can be edited while status is open', ans1Updated.answer === 'No, tragic hero exit');

// Participant 2 submits answer
await store.submitAnswer(
  pred.id,
  roomId,
  'user-2',
  'Zenitsu',
  '⚡|#ffd793',
  'No, tragic hero exit'
);

// Participant 3 submits a different answer
await store.submitAnswer(
  pred.id,
  roomId,
  'user-3',
  'Inosuke',
  '🐗|#8fd3c8',
  'Yes, against all odds'
);

// 3. Duplicate Submission Handling
console.log('\n3. Testing Duplicate Submission Handling');
const answersBeforeLock = await store.getPredictionAnswers(pred.id, 'user-1', false);
check('No duplicate answer records created for the same user', answersBeforeLock.length === 3);

// 4. Answer Privacy Before Reveal
console.log('\n4. Testing Answer Privacy Before Reveal');
// For User 1 requesting answers before reveal:
// User 1 sees their OWN answer, but other users' answers are masked with '🔒 Submitted'!
const user1View = await store.getPredictionAnswers(pred.id, 'user-1', false);
const myRecord = user1View.find((a) => a.userId === 'user-1');
const othersRecord = user1View.find((a) => a.userId === 'user-2');

check('User 1 can see their own answer before reveal', myRecord?.answer === 'No, tragic hero exit');
check('Other participants’ answers are hidden / masked before reveal', othersRecord?.answer === '🔒 Submitted');

// 5. Locking & Rejection After Lock
console.log('\n5. Testing Locking & Post-Lock Rejection');
const lockedPred = await store.lockPrediction(pred.id);
check('Prediction status transitions to locked', lockedPred.status === 'locked');

// Submitting or modifying answer after lock must be REJECTED
let postLockRejected = false;
try {
  await store.submitAnswer(
    pred.id,
    roomId,
    'user-1',
    'Tanjiro',
    '🌸|#f4a6c0',
    'Yes, against all odds'
  );
} catch {
  postLockRejected = true;
}
check('Answer modification after lock is rejected', postLockRejected);

// New participant submitting after lock must be REJECTED
let lateUserRejected = false;
try {
  await store.submitAnswer(
    pred.id,
    roomId,
    'user-4',
    'Nezuko',
    '🎋|#f4a6c0',
    'Yes, against all odds'
  );
} catch {
  lateUserRejected = true;
}
check('New submissions after lock are rejected', lateUserRejected);

// 6. Reveal Phase
console.log('\n6. Testing Synchronized Reveal Phase');
const revealedPred = await store.revealPrediction(pred.id);
check('Prediction transitions to revealed', revealedPred.status === 'revealed');

// All answers are now fully visible
const revealedAnswers = await store.getPredictionAnswers(pred.id, 'user-1', true);
check('All participants’ answers become visible after reveal', revealedAnswers.every((a) => !a.answer.includes('🔒')));

// 7. Resolution & Scoring
console.log('\n7. Testing Resolution & Scoring');
const resolvedPred = await store.resolvePrediction(pred.id, 'No, tragic hero exit');
check('Prediction resolved with winning option recorded', resolvedPred.winningOption === 'No, tragic hero exit');

const leaderboard = await store.getLeaderboard(roomId);
const winner1 = leaderboard.find((s) => s.userId === 'user-1');
const winner2 = leaderboard.find((s) => s.userId === 'user-2');
const loser3 = leaderboard.find((s) => s.userId === 'user-3');

check('Winner 1 awarded 20 points', winner1?.score === 20 && winner1?.predictionsWon === 1);
check('Winner 2 awarded 20 points', winner2?.score === 20 && winner2?.predictionsWon === 1);
check('Incorrect voter awarded 0 points', loser3 === undefined || loser3.score === 0);

console.log(failed ? `\n${failed} Prediction test(s) FAILED` : '\nAll Episode Predictions tests PASSED!');
process.exit(failed ? 1 : 0);
