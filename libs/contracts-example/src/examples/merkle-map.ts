import {
  AccountUpdate,
  Bool,
  DeployArgs,
  Field,
  MerkleMap,
  MerkleMapWitness,
  Mina,
  Permissions,
  Poseidon,
  PrivateKey,
  PublicKey,
  SmartContract,
  State,
  Struct,
  method,
  state,
} from 'snarkyjs';

// import { strToBool } from '@zkhumans/utils';
// copy-paste to avoid deps
function strToBool(s: string | undefined): boolean | undefined {
  return s === undefined ? undefined : RegExp(/^\s*(true|1|on)\s*$/i).test(s);
}

export class Data extends Struct({
  publicKey: PublicKey,
  root: Field,
}) {
  hash(): Field {
    return Poseidon.hash(this.publicKey.toFields().concat(this.root));
  }

  toJSON() {
    return {
      publicKey: this.publicKey.toBase58(),
      root: this.root.toString(),
    };
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
  };
}

type DataMerkleMap = ReturnType<typeof MerkleMapExtended>;
const dataMerkleMap: DataMerkleMap = MerkleMapExtended<Data>();

class Contract extends SmartContract {
  @state(Field) nullifierRoot = State<Field>();
  @state(Field) dataRoot = State<Field>();

  override init() {
    super.init();
    this.dataRoot.set(Field(0));
  }

  override deploy(args: DeployArgs) {
    super.deploy(args);
    this.account.permissions.set({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
    });
  }

  @method isDataAdded(data: Data, witness: MerkleMapWitness): Bool {
    const dataRoot = this.dataRoot.getAndAssertEquals();
    const [root] = witness.computeRootAndKey(data.hash());
    return root.equals(dataRoot);
  }

  // add data; only if it has not already been added
  @method addData(data: Data, witness: MerkleMapWitness) {
    const dataRoot = this.dataRoot.getAndAssertEquals();

    // ensure the data has not been added
    // by asserting the "current" value for this key is empty
    const EMPTY = Field(0);
    const [root0] = witness.computeRootAndKey(EMPTY);
    root0.assertEquals(dataRoot, 'Data already added!');

    // set the new Merkle Map root based on the new data
    const [root1] = witness.computeRootAndKey(data.hash());
    this.dataRoot.set(root1);
  }

  // update data; only if it has already been added
  @method updateData(
    dataBefore: Data,
    dataAfter: Data,
    witness: MerkleMapWitness
  ) {
    const dataRoot = this.dataRoot.getAndAssertEquals();

    // ensure the data has already been added
    const [root0] = witness.computeRootAndKey(dataBefore.hash());
    root0.assertEquals(dataRoot);

    // set the new Merkle Map root based on the updated data
    const [root1] = witness.computeRootAndKey(dataAfter.hash());
    this.dataRoot.set(root1);
  }
}

////////////////////////////////////////////////////////////////////////

const proofsEnabled = strToBool(process.env['ZK_PROOFS_ENABLED']) ?? true;
console.log('ZK_PROOFS_ENABLED:', proofsEnabled);

const Local = Mina.LocalBlockchain({ proofsEnabled });
Mina.setActiveInstance(Local);

const feePayer = Local.testAccounts[0].publicKey;
const feePayerKey = Local.testAccounts[0].privateKey;

const zkappKey = PrivateKey.random();
const zkappAddress = zkappKey.toPublicKey();

const initialDataRoot = dataMerkleMap.getRoot();

// deploy
console.log('Deploying...');
const zkapp = new Contract(zkappAddress);
if (proofsEnabled) await Contract.compile();
let tx = await Mina.transaction(feePayer, () => {
  AccountUpdate.fundNewAccount(feePayer);
  zkapp.deploy({ zkappKey });
  zkapp.dataRoot.set(initialDataRoot);
});
await tx.prove();
await tx.sign([feePayerKey, zkappKey]).send();
console.log('zkapp root        :', zkapp.dataRoot.get().toString());
console.log('dataMerkleMap root:', dataMerkleMap.getRoot().toString());

// add data that has not been added yet
console.log();
console.log('Adding data that has not been added...');
const pk0 = PrivateKey.random();
const data0 = new Data({ publicKey: pk0.toPublicKey(), root: Field(3) });
const key0 = Poseidon.hash(data0.publicKey.toFields());
dataMerkleMap.set(key0, data0);
let witness = dataMerkleMap.getWitness(key0);
tx = await Mina.transaction(feePayer, () => {
  zkapp.addData(data0, witness);
});
await tx.prove();
await tx.sign([feePayerKey]).send();
console.log('zkapp root        :', zkapp.dataRoot.get().toString());
console.log('dataMerkleMap root:', dataMerkleMap.getRoot().toString());

// add more data that has not been added yet
console.log();
console.log('Adding data that has not been added (again)...');
let pk = PrivateKey.random();
let data = new Data({ publicKey: pk.toPublicKey(), root: Field(3) });
let key = Poseidon.hash(data.publicKey.toFields());
dataMerkleMap.set(key, data);
witness = dataMerkleMap.getWitness(key);
zkapp.isDataAdded(data, witness).assertFalse();
tx = await Mina.transaction(feePayer, () => {
  zkapp.addData(data, witness);
});
await tx.prove();
await tx.sign([feePayerKey]).send();
zkapp.isDataAdded(data, witness).assertTrue();
console.log('zkapp root        :', zkapp.dataRoot.get().toString());
console.log('dataMerkleMap root:', dataMerkleMap.getRoot().toString());

// update existing data
console.log();
console.log('Updating existing data...');
witness = dataMerkleMap.getWitness(key0);
const data1 = new Data({ publicKey: data0.publicKey, root: Field(999) });
dataMerkleMap.set(key0, data1);
tx = await Mina.transaction(feePayer, () => {
  zkapp.updateData(data0, data1, witness);
});
await tx.prove();
await tx.sign([feePayerKey]).send();
console.log('zkapp root        :', zkapp.dataRoot.get().toString());
console.log('dataMerkleMap root:', dataMerkleMap.getRoot().toString());

// attempt to add data that has been added
try {
  console.log();
  console.log('Adding data that has been added (should fail!)...');
  witness = dataMerkleMap.getWitness(key0);
  tx = await Mina.transaction(feePayer, () => {
    zkapp.addData(data0, witness);
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  console.log('zkapp root        :', zkapp.dataRoot.get().toString());
  console.log('dataMerkleMap root:', dataMerkleMap.getRoot().toString());
} catch (
  err: any // eslint-disable-line @typescript-eslint/no-explicit-any
) {
  console.log(err.message);
}
