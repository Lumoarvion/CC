import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { adminDeleteUser } from '../src/controllers/userDeleteController.js';
import User from '../src/models/User.js';
import UserDeleteArchive from '../src/models/UserDeleteArchive.js';
import { sequelize } from '../src/db.js';
import * as mailer from '../src/utils/mailer.js';
import { logger } from '../src/utils/logger.js';

const originalLoggerInfo = logger.info;
const originalLoggerError = logger.error;
const originalFindByPk = User.findByPk;
const originalArchiveCreate = UserDeleteArchive.create;
const originalTransaction = sequelize.transaction;
const originalSendMail = mailer.transporter?.sendMail;

before(() => {
  logger.info = () => {};
  logger.error = () => {};
});

after(() => {
  logger.info = originalLoggerInfo;
  logger.error = originalLoggerError;
  User.findByPk = originalFindByPk;
  UserDeleteArchive.create = originalArchiveCreate;
  sequelize.transaction = originalTransaction;
  if (mailer.transporter && originalSendMail) {
    mailer.transporter.sendMail = originalSendMail;
  }
});

function createMockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

test('adminDeleteUser anonymizes the target account', async () => {
  const trx = {
    LOCK: { UPDATE: 'UPDATE' },
    async commit() {
      this.committed = true;
    },
    async rollback() {
      this.rolledBack = true;
    },
  };
  sequelize.transaction = async () => trx;

  const mockUser = {
    id: 77,
    email: 'victim@example.com',
    username: 'victim',
    accountStatus: 'active',
    loginDisabled: false,
    jwtVersion: 3,
    meta: {},
    deleteReason: null,
    deleteRequestedAt: null,
    toJSON() {
      return { snapshot: true, id: this.id };
    },
    async update(values) {
      this.updatedValues = values;
      return this;
    },
  };
  User.findByPk = async () => mockUser;

  let archived = null;
  UserDeleteArchive.create = async (payload) => {
    archived = payload;
  };

  let mailerCalled = false;
  if (mailer.transporter) {
    mailer.transporter.sendMail = async () => {
      mailerCalled = true;
      return { messageId: 'test' };
    };
  }

  const req = {
    params: { id: '77' },
    user: { id: 1 },
    body: { reason: 'Policy violation' },
  };
  const res = createMockRes();

  await adminDeleteUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.status, 'deleted');
  assert.equal(res.payload?.userId, 77);
  assert.ok(trx.committed, 'transaction committed');
  assert.ok(archived, 'snapshot archived');
  assert.equal(mockUser.updatedValues?.accountStatus, 'deleted');
  assert.equal(mockUser.updatedValues?.loginDisabled, true);
  if (mailer.transporter) {
    assert.ok(mailerCalled, 'mailer invoked');
  }
});
