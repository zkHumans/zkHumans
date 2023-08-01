# zkHumans

A protocol and platform for Zero-Knowledge Self-Sovereign Crypto-Biometric
Decentralized Identity, Collective Association, and Access Control.

## The Stack

- [SnarkyJS](https://github.com/o1-labs/SnarkyJS): TypeScript framework for
  zk-SNARKs and zkApps
- [Nx](https://nx.dev/): Next generation build system with first class monorepo
  support and powerful integrations
- [tRPC](https://trpc.io/): End-to-end typesafe APIs made easy
  - [zod](https://github.com/colinhacks/zod): TypeScript-first schema validation
    with static type inference
- [Prisma](https://www.prisma.io/): Next-generation Node.js and TypeScript ORM
- [Jest](https://github.com/jestjs/jest): Delightful JavaScript Testing
- [Traefik](https://github.com/traefik/traefik): The Cloud Native Application
  Proxy

## How it Works

- A zkHumans Identity consists of:
  - one or more Authentication Factors within a Merkle Map
  - a static unique identifier (UUID) and a Merkle Map commitment (its current
    root hash representing the Authentication Factors within it) .
- Each Identity's `identifier:commitment` is added as key:value data to a
  Identity Manager's MerkleMap
  - A Manager also has a static identifier (zkApp address) and root commitment
- A SmartContract manages authenticated state transformations of the Manager
  Merkle Tree including:
  - addition of new Identities
  - addition/removal of Authentication Factors from Identities
  - authentication of Identity ownership by other composing SmartContracts
- Proving ownership of an Identity consists of proving:
  - 1. An Authentication Factor (as key:value data) is within the Identity's
       MerkleMap
  - 2. The Identity's `key:value` is within the Manager's MerkleMap
  - depending on the authenticating context, one or more Authentication Factors
    of specific types may be required to prove ownership
- Off-chain Merkle data is stored within a database powered by ZK:KV; zkHumans'
  purpose-built, but generally useful, ZK-data storage solution with the
  following features:
  - data is public but secret, only the owner of an Identity may access the
    secrets of their data (ZK!), otherwise it is random numbers to others
  - optional storage meta data is public and facilitates protocol and/or
    connectivity to other database references
  - facilitates decentralized and distributed node data
  - database agnostic; the reference implementation uses Prisma for
    high-availability, scalability, and local performance of SQL (using
    Postgres, for example)
  - many and multiple nodes may independently verify and distribute storage data
  - all writes to storage are manged by the contract and updated locally by an
    indexer service, other services have read-only data access
  - transaction concurrency; multiple concurrent writes to storage are
    facilitated by first recording stroage state transformations as pending then
    comitting pending storage with a prover process
  - the pattern of MerkleMap identifier:commitment as key:value data within
    another MerkleMap is recursive thus enabling very large amounts of verified
    storage with minimal state information

## Code Examples

Refer to
[ExampleIdentityConsumer](libs/contracts/src/ExampleIdentityConsumer.ts)
SmartContract for an example of zkHumans-compatible Identity within a zkApp. It
is offered as a minimal complexity abstraction for ease of implementation, but
does not represent the full facilitations of the zkHumans Identity protocol.

Require authentication of Identity Ownership before conducting other functions:

```typescript
  @method requireAuth(assertion: IdentityAssertion, authNF: AuthNFactor) {
    const idMgrPubKey = this.IDManagerPublicKey.getAndAssertEquals();
    const identityManager = new IdentityManager(idMgrPubKey);

    // assert Identity ownership
    identityManager.isIdentityOwner(assertion, authNF).assertTrue();

    // do something after Identity ownership has been proven

    // the Identity's unique identifier is useful
    const identifier = assertion.identity.identifier;

    this.emitEvent('authorizedID', identifier);
  }
```

Authenticating resources may require specific Authentication Factor types. For
example, require ZK-CryptoBiometric authentication to prove Identity Ownership
(using the zkHumans BioAuth zkOracle):

```typescript
  @method requireBioAuth(assertion: IdentityAssertion, authNF: AuthNFactor) {
    const idMgrPubKey = this.IDManagerPublicKey.getAndAssertEquals();
    const identityManager = new IdentityManager(idMgrPubKey);

    // assert Identity ownership
    identityManager.isIdentityOwner(assertion, authNF).assertTrue();

    // assert Authentication Factor is a BioAuth
    authNF.isBioAuth().assertTrue();

    // do something after Identity ownership has been proven with BioAuth

    const identifier = assertion.identity.identifier;
    this.emitEvent('bioauthorizedID', identifier);
  }
```

### Identity Manager

The above examples assert ownership of zkHuman Identities registered with an
IdentityManager. See the official zkHumans app deployment for the zkApp's
address that may be used for identities registered there.

Similar to other zkOracle implementations or zkApp compositions, the
IdentityManager's PublicKey may be registered as zkApp state upon deployment or
hardcoded (from Base58 format) to spare state consumption.

## Developmental Status

The zkHumans protocol has an extensive roadmap covering ZK-powered decentralized
digital identity and its use in nearly every context. The protocol is flexible
for future-forward expansion covering a multitude of authentication methods and
providers. The current implementation represents Decentralized Identity
management with an initial limited set of authentication factor types and
providers as the protocol and its governance is further established.

## Contributing

[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

- Follow
  [`commitizen's conventional-changelog`](https://github.com/commitizen/cz-cli)
  commit message format
- Use `npm run commit` or `npx cz` for a prompt to assist writing the commit
  message properly
- The conventional commit scope (the type of change) typically corresponds to Nx
  project; ie "contracts" or "api"
  - when possible, keep git commits project- and context- specific (ok to
    deviate for some broad refactors/migrations)
  - refer to `git log <filename>` for current conventions

## Nx Workspace

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ **This workspace has been generated by
[Nx, a Smart, fast and extensible build system.](https://nx.dev)** ✨

### Understand this workspace

Run `nx graph` to see a diagram of the dependencies of the projects.

### Remote caching

Run `npx nx connect-to-nx-cloud` to enable [remote caching](https://nx.app) and
make CI faster.

### Further help

Visit the [Nx Documentation](https://nx.dev) to learn more.
