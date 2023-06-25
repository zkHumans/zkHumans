import {
  Field,
  method,
  MerkleMap,
  MerkleMapWitness,
  SmartContract,
  State,
  state,
  Struct,
  Poseidon,
  PublicKey,
  Signature,
  Circuit,
  Experimental,
  UInt32,
  PrivateKey,
} from 'snarkyjs';

////////////////////////////////////////////////////////////////////////
// Structs / Data Types
////////////////////////////////////////////////////////////////////////

class Proposal extends Struct({
  title: String,
  id: Field,
  // we can add as many or as less options as we want
  yes: Field,
  no: Field,
  abstained: Field,
}) {}

class StateTransition extends Struct({
  voterDataRoot: Field, // this never changes
  nullifier: {
    before: Field,
    after: Field,
  },
  proposalId: Field,
  result: {
    before: {
      yes: Field,
      no: Field,
      abstained: Field,
    },
    after: { yes: Field, no: Field, abstained: Field },
  },
}) {}

class VotingPeriod extends Struct({
  electionPeriod: {
    start: UInt32,
    end: UInt32,
  },
  challengingPeriod: {
    start: UInt32,
    end: UInt32,
  },
}) {}

class VoterData extends Struct({
  publicKey: PublicKey,
  weight: Field,
}) {
  hash(): Field {
    return Poseidon.hash(this.publicKey.toFields().concat(this.weight));
  }

  toJSON() {
    return {
      publicKey: this.publicKey.toBase58(),
      weight: this.weight.toString(),
    };
  }
}

type JSONVote = {
  voter: string;
  authorization: {
    r: string;
    s: string;
  };
  voterDataRoot: string;
  yes: string;
  no: string;
  abstained: string;
  proposalId: string;
};

class Vote extends Struct({
  voter: PublicKey,
  authorization: Signature,
  voterDataRoot: Field,
  proposalId: Field,
  yes: Field,
  no: Field,
  abstained: Field,
}) {
  fromJSON(json: JSONVote): Vote {
    return new Vote({
      voter: PublicKey.fromBase58(json.voter),
      authorization: Signature.fromJSON(json.authorization),
      voterDataRoot: Field(this.voterDataRoot),
      yes: Field(json.yes),
      no: Field(json.no),
      abstained: Field(json.abstained),
      proposalId: Field(json.proposalId),
    });
  }

  verifySignature(publicKey: PublicKey) {
    return this.authorization.verify(publicKey, [
      this.yes,
      this.no,
      this.abstained,
      this.proposalId,
      this.voterDataRoot,
    ]);
  }
}

function MerkleMapExtended<
  V extends {
    hash(): Field;
    toJSON(): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
>() {
  const merkleMap = new MerkleMap();
  const map = new Map<string, V>();

  return {
    get(key: Field): V | undefined {
      return map.get(key.toString());
    },

    set(key: Field, value: V) {
      map.set(key.toString(), value);
      merkleMap.set(key, value.hash());
    },

    getRoot(): Field {
      return merkleMap.getRoot();
    },

    getWitness(key: Field): MerkleMapWitness {
      return merkleMap.getWitness(key);
    },

    // flat() {
    //   const leaves = [...map.keys()].map((key, i) => {
    //     const entry = map.get(key)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    //     return {
    //       i,
    //       key,
    //       data: { ...entry.toJSON(), hash: entry.hash().toString() },
    //     };
    //   });
    //   return {
    //     meta: {
    //       root: merkleMap.getRoot().toString(),
    //       height: merkleMap.tree.height.toString(),
    //       leafCount: merkleMap.tree.leafCount.toString(),
    //     },
    //     leaves,
    //   };
    // },
  };
}

////////////////////////////////////////////////////////////////////////
// utils
////////////////////////////////////////////////////////////////////////

function Nullifier(publicKey: PublicKey, proposalId: Field) {
  return Poseidon.hash(publicKey.toFields().concat(proposalId));
}

function calculateNullifierRootTransition(
  nullifierTree: MerkleMap,
  votes: Vote[]
) {
  const rootBefore = nullifierTree.getRoot();
  votes.forEach((v) => {
    const key = Nullifier(v.voter, v.proposalId);
    nullifierTree.set(key, Field(1));
  });
  return {
    rootBefore,
    rootAfter: nullifierTree.getRoot(),
  };
}

function calculateVotes(votes: Vote[]) {
  let yes = Field(0);
  let no = Field(0);
  let abstained = Field(0);

  votes.forEach((v) => {
    yes = yes.add(v.yes);
    no = no.add(v.no);
    abstained = abstained.add(v.abstained);
  });

  return {
    yes,
    no,
    abstained,
  };
}

////////////////////////////////////////////////////////////////////////
// prover
////////////////////////////////////////////////////////////////////////

function Prover(
  nullifierTree: MerkleMap,
  voterData: ReturnType<typeof MerkleMapExtended>
) {
  return Experimental.ZkProgram({
    publicInput: StateTransition,

    methods: {
      baseCase: {
        privateInputs: [Circuit.array(Vote, 3)],

        method(publicInput: StateTransition, votes: Vote[]) {
          // because we batch votes, we have to transition our nullifier root
          // from n_v1 -> n_v2 -> n_v3, thats why we store it temporary
          let tempRoot = publicInput.nullifier.before;

          // we accumulate the results of our three votes - obviously we start with 0
          let yes = Field(0);
          let no = Field(0);
          let abstained = Field(0);

          // we go through each vote
          for (let i = 0; i < 3; i++) {
            const vote = votes[i];
            // verifying signature, obviously!
            vote.verifySignature(vote.voter).assertTrue();

            // we check if the voter is actually part of the list of eligible voters that we defined at the beginning
            checkVoterEligibility(vote, voterData, publicInput).assertTrue(
              'Voter is not an eligible voter!'
            );

            // making sure the voter actually voted for this proposal, preventing replay attacks
            publicInput.proposalId.assertEquals(
              vote.proposalId,
              'Vote proposalId does not match actual proposalId!'
            );

            // check that no nullifier has been set already - if all is good, set the nullifier!
            tempRoot = checkAndSetNullifier(vote, nullifierTree, tempRoot);

            // we do this to ensure no one is casting multiple votes
            // all votes of a voter should only sum up to 1, because we cant cast two votes
            const voteCount = vote.yes.add(vote.no).add(vote.abstained);
            voteCount.assertEquals(Field(1));

            // we aggregate the results for this single vote
            yes = yes.add(vote.yes);
            no = no.add(vote.no);
            abstained = abstained.add(vote.abstained);
          }

          // we add results that we got to the ones that we started with - sum'ing them up to the final result
          // we constraint the votes to the final result
          publicInput.result.after.yes.assertEquals(
            yes.add(publicInput.result.before.yes)
          );
          publicInput.result.after.no.assertEquals(
            no.add(publicInput.result.before.no)
          );
          publicInput.result.after.abstained.assertEquals(
            abstained.add(publicInput.result.before.abstained)
          );

          // we make sure that the final nullifier root is valid
          tempRoot.assertEquals(
            publicInput.nullifier.after,
            'Invalid state transition!'
          );
        },
      },
    },
  });
}

function checkAndSetNullifier(
  vote: Vote,
  nullifierTree: MerkleMap,
  nullifierRoot: Field
) {
  const expectedNullifier = Nullifier(vote.voter, vote.proposalId);

  const nullifierWitness = Circuit.witness(MerkleMapWitness, () => {
    return nullifierTree.getWitness(expectedNullifier);
  });

  const [root] = nullifierWitness.computeRootAndKey(Field(0));

  // we expect that a 0 is set as position [expectedNullifier] (voter key and proposal id), so if it matches it means the nullifier hasn't been set yet
  root.assertEquals(nullifierRoot, 'Nullifier already set!');

  // set the nullifier to 1
  const [newRoot] = nullifierWitness.computeRootAndKey(Field(1));

  Circuit.asProver(() => {
    nullifierTree.set(expectedNullifier, Field(1));
  });

  return newRoot;
}

function checkVoterEligibility(
  vote: Vote,
  voterData: ReturnType<typeof MerkleMapExtended>,
  publicInput: StateTransition
) {
  const membershipProof = Circuit.witness(MerkleMapWitness, () => {
    return voterData.getWitness(Poseidon.hash(vote.voter.toFields()));
  });

  const weight = Circuit.witness(Field, () => {
    return (voterData.get(Poseidon.hash(vote.voter.toFields())) as any).weight; // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  const [root] = membershipProof.computeRootAndKey(
    Poseidon.hash(vote.voter.toFields().concat(weight))
  );

  return root.equals(publicInput.voterDataRoot);
}

////////////////////////////////////////////////////////////////////////
// contract
////////////////////////////////////////////////////////////////////////

const RecursiveVoteProof_ = Experimental.ZkProgram.Proof(
  Prover(new MerkleMap(), MerkleMapExtended<VoterData>())
);
class RecursiveVoteProof extends RecursiveVoteProof_ {}

class ProposalPure extends Struct({
  id: Field,
  // we can add as many or as less options as we want
  yes: Field,
  no: Field,
  abstained: Field,
}) {}

class SettlementContract extends SmartContract {
  // this is the proposal that we are voting on
  @state(ProposalPure) proposal = State<ProposalPure>();
  // just some "meta data" to guide the vote - start, end, ..
  @state(VotingPeriod) votingPeriod = State<VotingPeriod>();

  @state(Field) nullifierRoot = State<Field>();
  @state(Field) voterDataRoot = State<Field>();

  @method override init() {
    super.init();
    this.proposal.set({
      abstained: Field(0),
      id: Field(0),
      no: Field(0),
      yes: Field(0),
    });
    this.votingPeriod.set({
      electionPeriod: {
        start: UInt32.from(0),
        end: UInt32.from(10),
      },
      challengingPeriod: {
        start: UInt32.from(10),
        end: UInt32.from(5),
      },
    });
  }

  @method verifyVoteBatch(pi: RecursiveVoteProof) {
    // "fetch" the on-chain proposal data
    const proposal = this.proposal.get();
    this.proposal.assertEquals(proposal);

    // "fetch" the on-chain voting period data
    const votingPeriod = this.votingPeriod.get();
    this.votingPeriod.assertEquals(votingPeriod);

    // "fetch" the on-chain network state
    const blockchainLength = this.network.blockchainLength.get();
    this.network.blockchainLength.assertEquals(blockchainLength);

    // "fetch" the on-chain nullifier root
    const nullifierRoot = this.nullifierRoot.get();
    this.nullifierRoot.get().assertEquals(nullifierRoot);

    // "fetch" the on-chain nullifier root
    const voterDataRoot = this.voterDataRoot.get();
    this.voterDataRoot.get().assertEquals(voterDataRoot);

    // check that the voting period is over, and we can only submit proofs after the voting phase
    blockchainLength.assertGte(votingPeriod.electionPeriod.end);

    /*
    Proofs have public and private inputs. The private inputs are only accessible to the user who generates the proof,
    but the public input is always accessible (or rather should be!) - hence called public input - its also required to verify a proof.
    the proof will *only* verify if a) the proof is truly valid and b) the public input matches the proof!
    This is why we constraint things to the public input inside the proof generation part!
    That means, we have to match our off-chain proof to our on-chain state. And we want to only verify proofs that are
    truly for our proposal. for that, we use the proposalId! We say "you can only verify this proof if it is for our proposal, with proposalId #123"
    */
    proposal.id.assertEquals(pi.publicInput.proposalId);

    // we also have to check that the voter data actually matches the expected data!
    voterDataRoot.assertEquals(pi.publicInput.voterDataRoot);

    // now we actually verify the proof!
    pi.verify();

    /*
    we check that we only make valid transitions.
    it is important to use the smart contract as a settlement layer and only periodically update its state
    but when that update happens, its important to prove a sound state transition without gaps! otherwise there might be vulnerabilities
    this is needed if we want to verify not only one proof, but have multiple proofs that compose our result, like this
    proof1 = 5yes, 3no, 0abstained
    proof2 = 1yes, 3no, 2abstained
    and we call this contract method in series, first with proof1 and then with proof2
    thats when we want to make sure that we don't double count votes ad the transition is valid
    */
    const resultsBefore = pi.publicInput.result.before;
    proposal.yes.assertEquals(resultsBefore.yes);
    proposal.no.assertEquals(resultsBefore.no);
    proposal.abstained.assertEquals(resultsBefore.abstained);

    /*
    same goes for the nullifier root!
    since the nullifier is a data structure that constantly changes and attests to who votes and who hasn't
    we also have to keep that up to date
    */
    pi.publicInput.nullifier.before.assertEquals(nullifierRoot);

    // we apply the votes to our on-chain proposal
    const resultsAfter = pi.publicInput.result.after;
    proposal.yes = resultsAfter.yes;
    proposal.no = resultsAfter.no;
    proposal.abstained = resultsAfter.abstained;

    // finally we update our on-chain state with the latest result!
    this.proposal.set(proposal);

    // we update our new nullifier root!
    // the proof says a) we aggregates all results and b) the nullifier root changes based on the results and votes
    this.nullifierRoot.set(pi.publicInput.nullifier.after);
  }

  @method challengeResult(pi: RecursiveVoteProof) {
    // "fetch" the on-chain proposal data
    const proposal = this.proposal.get();
    this.proposal.assertEquals(proposal);

    // "fetch" the on-chain voting period data
    const votingPeriod = this.votingPeriod.get();
    this.votingPeriod.assertEquals(votingPeriod);

    // "fetch" the on-chain network state
    const blockchainLength = this.network.blockchainLength.get();
    this.network.blockchainLength.assertEquals(blockchainLength);

    // check that the voting period is over, and we can only submit proofs after the voting phase
    blockchainLength.assertGte(votingPeriod.electionPeriod.end);

    // we can only challenge the vote in the challenging period!
    votingPeriod.challengingPeriod.start.assertGte(blockchainLength);
    votingPeriod.challengingPeriod.end.assertLte(blockchainLength);

    pi.verify();

    // ..
  }
}

////////////////////////////////////////////////////////////////////////
// demo
////////////////////////////////////////////////////////////////////////

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
