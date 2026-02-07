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

const invalidMessage = 'Username must be 3-30 characters and can include letters, numbers, dot, underscore, or hyphen.';

test('register rejects usernames with invalid characters', async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;

  User.findOne = async () => {
    throw new Error('User.findOne should not be called when username format is invalid');
  };
  User.create = async () => {
    throw new Error('User.create should not run for invalid username format');
  };

  const req = {
    body: {
      fullName: 'Example User',
      username: 'bad name',
      email: 'user@example.com',
      password: 'Password123!',
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

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonPayload, { message: invalidMessage });
});

test('register rejects usernames shorter than 3 or longer than 30 characters', async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;

  User.findOne = async () => {
    throw new Error('User.findOne should not be called when username length is invalid');
  };
  User.create = async () => {
    throw new Error('User.create should not run for invalid username length');
  };

  const req = {
    body: {
      fullName: 'Length Test',
      username: 'ab',
      email: 'length@example.com',
      password: 'Password123!',
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

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonPayload, { message: invalidMessage });
});

test('register rejects usernames longer than 30 characters', async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;

  User.findOne = async () => {
    throw new Error('User.findOne should not be called when username length is invalid');
  };
  User.create = async () => {
    throw new Error('User.create should not run for invalid username length');
  };

  const req = {
    body: {
      fullName: 'Length Test',
      username: 'abcdefghijklmnopqrstuvwxyz12345', // 31 chars
      email: 'lengthlong@example.com',
      password: 'Password123!',
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

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonPayload, { message: invalidMessage });
});
