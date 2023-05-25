import { t } from '../server';

// serve meta information for client consumption
export const metaProcedure = t.procedure.query(async () => {
  return {
    env: process.env['NODE_ENV'] ?? '',
    address: {
      BioAuth: process.env['ZKAPP_ADDRESS_BIOAUTH'] ?? '',
      IdentityManager: process.env['ZKAPP_ADDRESS_IDENTITY_MANAGER'] ?? '',
    },
  };
});
