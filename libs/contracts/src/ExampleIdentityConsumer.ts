import {
  Field,
  PublicKey,
  SmartContract,
  State,
  method,
  state,
} from 'snarkyjs';
import { IdentityAssertion, IdentityManager } from './IdentityManager';

export class ExampleIdentityConsumer extends SmartContract {
  @state(PublicKey) IDManagerPublicKey = State<PublicKey>();

  override events = {
    authorizedID: Field,
    bioauthorizedID: Field,
  };

  @method somethingRequiringAuth(assertion: IdentityAssertion) {
    const idMgrPubKey = this.IDManagerPublicKey.getAndAssertEquals();
    const identityManager = new IdentityManager(idMgrPubKey);

    // assert Identity ownership
    identityManager.isIdentityOwner(assertion).assertTrue();

    // do something after Identity ownership has been proven

    // the Identity's unique identifier is useful
    const identifier = assertion.identity.identifier;

    this.emitEvent('authorizedID', identifier);
  }

  @method somethingRequiringBioAuth(assertion: IdentityAssertion) {
    const idMgrPubKey = this.IDManagerPublicKey.getAndAssertEquals();
    const identityManager = new IdentityManager(idMgrPubKey);

    // assert Identity ownership
    identityManager.isIdentityOwner(assertion).assertTrue();

    // assert Authentication Factor is a BioAuth
    assertion.authNF.isBioAuth().assertTrue();

    // do something after Identity ownership has been proven with BioAuth

    // the Identity's unique identifier is useful
    const identifier = assertion.identity.identifier;

    this.emitEvent('bioauthorizedID', identifier);
  }
}
