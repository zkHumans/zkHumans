import {
  Field,
  PublicKey,
  SmartContract,
  State,
  method,
  state,
} from 'snarkyjs';
import {
  AuthNFactor,
  IdentityAssertion,
  IdentityManager,
} from './IdentityManager';

export class ExampleIdentityConsumer extends SmartContract {
  @state(PublicKey) IDManagerPublicKey = State<PublicKey>();

  override events = {
    authorizedID: Field,
    bioauthorizedID: Field,
  };

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
}
