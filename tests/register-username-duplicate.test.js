import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../src/controllers/authController.js';
import { User } from '../src/models/index.js';

function createMockRes() {
  const res = {
    statusCode: undefined,
    jsonPayload: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonPayload = payload;
      return this;
    },
    set(header, value) {
      this.headers[header.toLowerCase()] = value;
      return this;
    },
  };
  return res;
}

test('register rejects duplicate usernames before hitting the DB constraint', async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;

  const expectedUsername = 'Alex';
  let emailChecks = 0;
  let usernameChecks = 0;
  let createCalled = false;

  User.findOne = async (query) => {
    if (query?.where?.email) {
      emailChecks += 1;
      assert.equal(query.where.email, 'dup@example.com');
      return null; // email is free
    }
    if (query?.where?.username) {
      usernameChecks += 1;
      assert.equal(query.where.username, expectedUsername);
      return { id: 99 };
    }
    throw new Error('Unexpected User.findOne call');
  };

  User.create = async () => {
    createCalled = true;
    throw new Error('User.create should not run when username already exists');
  };

  const req = {
    body: {
      fullName: 'Duplicate User',
      username: '  Alex  ',
      email: 'Dup@Example.com',
      password: 'SecurePass123!',
      otpTicket: '1234567890',
    },
  };
  const res = createMockRes();

  try {
    await register(req, res);
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.jsonPayload, { message: 'Username already in use' });
  assert.equal(emailChecks, 1);
  assert.equal(usernameChecks, 1);
  assert.equal(createCalled, false);
});
