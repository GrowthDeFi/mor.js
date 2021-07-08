import {
  restoreSnapshotOriginal,
  setupTestMakerInstance,
  sendMkrToAddress
} from './helpers';
import VoteDelegateService from '../src/VoteDelegateService';
import VoteDelegate from '../src/VoteDelegate';
import { createCurrency } from '@makerdao/currency';

const MKR = createCurrency('MKR');
const IOU = createCurrency('IOU');

let maker,
  vds,
  vdfs,
  addresses,
  delegateAddress,
  delegateContractAddress,
  chiefService;

beforeAll(async () => {
  maker = await setupTestMakerInstance();
  vds = maker.service('voteDelegate');
  vdfs = maker.service('voteDelegateFactory');
  chiefService = maker.service('chief');

  addresses = maker
    .listAccounts()
    .reduce((acc, cur) => ({ ...acc, [cur.name]: cur.address }), {});

  delegateAddress = maker.currentAccount().address;
  await vdfs.createDelegateContract();
});

afterAll(async done => {
  await restoreSnapshotOriginal(global.snapshotId);
  done();
});

test('can create vote delegate service', async () => {
  expect(vds).toBeInstanceOf(VoteDelegateService);
});

test('getVoteDelegate returns the vote delegate if exists', async () => {
  const { hasDelegate, voteDelegate } = await vds.getVoteDelegate(
    delegateAddress
  );

  // Cache the delegateContractAddress for later
  delegateContractAddress = voteDelegate.getVoteDelegateAddress();

  expect(hasDelegate).toBe(true);
  expect(voteDelegate).toBeInstanceOf(VoteDelegate);
});

test('user can lock MKR with a delegate', async () => {
  const sendAmount = 5;
  const amountToLock = 3;
  const mkr = await maker.getToken(MKR);

  await sendMkrToAddress(maker, addresses.owner, addresses.ali, sendAmount);

  maker.useAccount('ali');

  await mkr.approveUnlimited(delegateContractAddress);

  // No deposits prior to locking maker
  const preLockDeposits = await chiefService.getNumDeposits(
    delegateContractAddress
  );
  expect(preLockDeposits.toNumber()).toBe(0);

  await vds.lock(delegateContractAddress, amountToLock);

  const postLockDeposits = await chiefService.getNumDeposits(
    delegateContractAddress
  );
  expect(postLockDeposits.toNumber()).toBe(amountToLock);
});

test('delegate can cast an executive vote and retrieve voted on addresses from slate', async () => {
  maker.useAccountWithAddress(delegateAddress);

  //TODO: check fetching delegate contract address with a user's current address

  const picks = [
    '0x26EC003c72ebA27749083d588cdF7EBA665c0A1D',
    '0x54F4E468FB0297F55D8DfE57336D186009A1455a'
  ];

  await vds.voteExec(delegateContractAddress, picks);

  const addressesVotedOn = await vds.getVotedProposalAddresses(
    delegateContractAddress
  );
  expect(addressesVotedOn).toEqual(picks);
});

test('user can free an amount of MKR from delegate', async () => {
  const amountToFree = 1;
  const iou = await maker.getToken(IOU);

  maker.useAccount('ali');

  await iou.approveUnlimited(delegateContractAddress);

  const preFreeDeposits = await chiefService.getNumDeposits(
    delegateContractAddress
  );
  await vds.free(delegateContractAddress, amountToFree);

  const postFreeDeposits = await chiefService.getNumDeposits(
    delegateContractAddress
  );

  expect(postFreeDeposits.toNumber()).toBe(
    preFreeDeposits.toNumber() - amountToFree
  );
});

test('getVoteProxy returns a null if none exists for a given address', async () => {
  const address = addresses.sam;
  const { hasDelegate, voteDelegate } = await vds.getVoteDelegate(address);

  expect(hasDelegate).toBe(false);
  expect(voteDelegate).toBeNull();
});
