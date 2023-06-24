import {
  Field,
  isReady,
  MerkleMap,
  Poseidon,
  PrivateKey,
  shutdown,
  Signature,
} from 'snarkyjs';

import {
  MerkleMapExtended,
  Proposal,
  StateTransition,
  Vote,
  VoterData,
} from './vote_aggregator/sequencer.js';

import { Prover } from './vote_aggregator/prover.js';
import {
  calculateNullifierRootTransition,
  calculateVotes,
} from './vote_aggregator/lib.js';

await isReady;

console.log('generating three random entries..');

const priv = PrivateKey.random();
const priv2 = PrivateKey.random();
const priv3 = PrivateKey.random();

const VoterDataTree = MerkleMapExtended<VoterData>();

// we add our list of eligible voters to the voter data merkle tree
const vd = new VoterData({ publicKey: priv.toPublicKey(), weight: Field(100) });
const vd2 = new VoterData({
  publicKey: priv2.toPublicKey(),
  weight: Field(100),
});
const vd3 = new VoterData({
  publicKey: priv3.toPublicKey(),
  weight: Field(100),
});
VoterDataTree.set(Poseidon.hash(priv.toPublicKey().toFields()), vd);
VoterDataTree.set(Poseidon.hash(priv2.toPublicKey().toFields()), vd2);
VoterDataTree.set(Poseidon.hash(priv3.toPublicKey().toFields()), vd3);

console.log(
  'added three dummy voters, root: ',
  VoterDataTree.getRoot().toString()
);

// this is a bit annoying but will do for now - NullifierTreeSync stays in sync with all transitions while NullifierTreeProver is only being used inside the prover
const NullifierTreeTemp = new MerkleMap();
const NullifierTreeProver = new MerkleMap();

console.log('generating prover..');
const VoteProver = Prover(NullifierTreeProver, VoterDataTree);
console.log('compiling prover..');
await VoteProver.compile();
console.log('prover compiled!');

// creating a new proposal - this can also be done on-demand, via an API, etc
const proposal = new Proposal({
  title: 'Are capybaras awesome?',
  id: Field(123456), // this should be unique to prevent replay attacks
  no: Field(0), // this needs to start at 0, since we havent aggregated any votes
  yes: Field(0), // this needs to start at 0, since we havent aggregated any votes
  abstained: Field(0), // this needs to start at 0, since we havent aggregated any votes
});

console.log('created a new proposal!');
console.log(`title: ${proposal.title}
id: ${proposal.id}`);

const voterDataRoot = VoterDataTree.getRoot();

console.log('generating three votes..');
const v1 = new Vote({
  authorization: Signature.create(priv, [
    Field(1), // YES
    Field(0), // NO
    Field(0), // ABSTAINED
    proposal.id, // the proposal id, by signing it we prevent replay attacks
    voterDataRoot, // match the predefined voter data
  ]),
  // the values exist twice, because above we just sign them
  yes: Field(1),
  no: Field(0),
  abstained: Field(0),
  proposalId: proposal.id,
  voter: priv.toPublicKey(),
  voterDataRoot: voterDataRoot,
});

const v2 = new Vote({
  authorization: Signature.create(priv2, [
    Field(0),
    Field(1),
    Field(0),
    proposal.id,
    voterDataRoot,
  ]),
  yes: Field(0),
  no: Field(1),
  abstained: Field(0),
  proposalId: proposal.id,
  voter: priv2.toPublicKey(),
  voterDataRoot: voterDataRoot,
});

const v3 = new Vote({
  authorization: Signature.create(priv3, [
    Field(0),
    Field(1),
    Field(0),
    proposal.id,
    voterDataRoot,
  ]),
  yes: Field(0),
  no: Field(1),
  abstained: Field(0),
  proposalId: proposal.id,
  voter: priv3.toPublicKey(),
  voterDataRoot: voterDataRoot,
});

const votes = [v1, v2, v3];

// we prepare our witnesses for all votes, this is just some auxillary stuff. proving happens later
const { rootBefore, rootAfter } = calculateNullifierRootTransition(
  NullifierTreeTemp,
  votes
);
// we calculate the votes after we aggregate all. again, auxillary things because we have to prove a transition f(votes, s_1) = s_2
const votesAfter = calculateVotes(votes);

// this is our state transition data structure!
const st = new StateTransition({
  nullifier: {
    before: rootBefore,
    after: rootAfter,
  },
  // specific for this proposal
  proposalId: proposal.id,
  // this is where we aggregate the results
  result: {
    // we obviously start with 0 - 0 - 0 with a fresh proposal
    before: {
      yes: Field(0),
      no: Field(0),
      abstained: Field(0),
    },
    after: votesAfter,
  },
  voterDataRoot: voterDataRoot,
});

console.log('proving three votes..');
// we proof three votes!
const pi = await VoteProver.baseCase(st, votes);
pi.verify();
console.log('votes valid!');
console.log(`result for proposal #${proposal.id}, ${proposal.title}:\n\n\n

YES: ${pi.publicInput.result.after.yes.toString()}

NO: ${pi.publicInput.result.after.no.toString()}

ABSTAINED: ${pi.publicInput.result.after.abstained.toString()}`);
shutdown();
