import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminAssignReport,
  adminGetReport,
  adminListReports,
  adminUpdateReportStatus,
  createReport,
  listMyReports,
} from '../src/controllers/reportController.js';
import { Post, Report, Role, User } from '../src/models/index.js';
import { logger } from '../src/utils/logger.js';

const originals = {
  reportCount: Report.count,
  reportFindOne: Report.findOne,
  reportCreate: Report.create,
  reportFindAndCountAll: Report.findAndCountAll,
  reportFindByPk: Report.findByPk,
  postFindOne: Post.findOne,
  postFindAll: Post.findAll,
  postFindByPk: Post.findByPk,
  userFindByPk: User.findByPk,
  roleFindByPk: Role.findByPk,
  loggerInfo: logger.info,
  loggerError: logger.error,
};

function restore() {
  Report.count = originals.reportCount;
  Report.findOne = originals.reportFindOne;
  Report.create = originals.reportCreate;
  Report.findAndCountAll = originals.reportFindAndCountAll;
  Report.findByPk = originals.reportFindByPk;
  Post.findOne = originals.postFindOne;
  Post.findAll = originals.postFindAll;
  Post.findByPk = originals.postFindByPk;
  User.findByPk = originals.userFindByPk;
  Role.findByPk = originals.roleFindByPk;
  logger.info = originals.loggerInfo;
  logger.error = originals.loggerError;
}

function mockRes() {
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

beforeEach(() => {
  logger.info = () => {};
  logger.error = () => {};
});

afterEach(() => {
  restore();
});

test('createReport validates required fields', async () => {
  const req = { user: { id: 1 }, body: {} };
  const res = mockRes();

  await createReport(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { message: 'targetType is required' });
});

test('createReport returns 404 for missing target post', async () => {
  Report.count = async () => 0;
  Post.findOne = async () => null;

  const req = {
    user: { id: 9 },
    body: { targetType: 'post', targetId: 88, reasonCode: 'spam', reasonText: 'duplicate ads' },
  };
  const res = mockRes();

  await createReport(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.payload, { message: 'target post not found' });
});

test('createReport enforces duplicate active report prevention', async () => {
  Report.count = async () => 0;
  Post.findOne = async () => ({ id: 3 });
  Report.findOne = async () => ({ id: 100 });

  const req = {
    user: { id: 10 },
    body: { targetType: 'post', targetId: 3, reasonCode: 'harassment' },
  };
  const res = mockRes();

  await createReport(req, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.payload, { message: 'active report already exists for this target' });
});

test('createReport succeeds with valid payload', async () => {
  Report.count = async () => 0;
  Post.findOne = async () => ({ id: 3 });
  Report.findOne = async () => null;
  Report.create = async (payload) => ({
    id: 55,
    ...payload,
    createdAt: '2026-04-09T00:00:00.000Z',
    updatedAt: '2026-04-09T00:00:00.000Z',
    toJSON() {
      return { ...this };
    },
  });

  const req = {
    user: { id: 10 },
    body: { targetType: 'post', targetId: 3, reasonCode: 'spam', reasonText: '   repeated promotion   ' },
  };
  const res = mockRes();

  await createReport(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload?.id, 55);
  assert.equal(res.payload?.reporterUserId, 10);
  assert.equal(res.payload?.reasonText, 'repeated promotion');
  assert.equal(res.payload?.status, 'open');
});

test('listMyReports validates status filter and returns paginated response', async () => {
  const invalidReq = { user: { id: 2 }, query: { status: 'bad' } };
  const invalidRes = mockRes();
  await listMyReports(invalidReq, invalidRes);
  assert.equal(invalidRes.statusCode, 400);
  assert.deepEqual(invalidRes.payload, { message: 'invalid status filter' });

  Report.findAndCountAll = async () => ({
    count: 1,
    rows: [
      {
        toJSON() {
          return {
            id: 41,
            reporterUserId: 2,
            targetType: 'post',
            targetId: 12,
            reasonCode: 'spam',
            status: 'open',
            assignee: null,
          };
        },
      },
    ],
  });
  Post.findAll = async () => [
    {
      toJSON() {
        return { id: 12, content: 'Post to review', userId: 19, isArchived: false };
      },
    },
  ];

  const req = { user: { id: 2 }, query: { page: '1', limit: '20', status: 'open' } };
  const res = mockRes();
  await listMyReports(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.total, 1);
  assert.equal(res.payload?.reports?.[0]?.target?.id, 12);
});

test('adminListReports returns filtered queue', async () => {
  Report.findAndCountAll = async () => ({
    count: 1,
    rows: [
      {
        toJSON() {
          return {
            id: 71,
            reporterUserId: 3,
            targetType: 'post',
            targetId: 44,
            reasonCode: 'hate',
            status: 'open',
            reporter: { id: 3, fullName: 'A', username: 'a' },
            assignee: null,
          };
        },
      },
    ],
  });
  Post.findAll = async () => [{ toJSON: () => ({ id: 44, content: 'x', userId: 7, isArchived: false }) }];

  const req = { user: { id: 1, roleKey: 0 }, query: { status: 'open', reasonCode: 'hate', targetType: 'post' } };
  const res = mockRes();
  await adminListReports(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.reports?.length, 1);
  assert.equal(res.payload?.reports?.[0]?.reasonCode, 'hate');
});

test('adminGetReport returns 404 for missing report', async () => {
  Report.findByPk = async () => null;
  const req = { user: { id: 1 }, params: { id: '999' } };
  const res = mockRes();

  await adminGetReport(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.payload, { message: 'report not found' });
});

test('adminAssignReport enforces assignee role', async () => {
  Report.findByPk = async () => ({ id: 12, status: 'open', save: async () => {} });
  User.findByPk = async () => ({ id: 88, accountStatus: 'active', loginDisabled: false, Role: { roleKey: 3 } });

  const req = { user: { id: 1 }, params: { id: '12' }, body: { assigneeUserId: 88 } };
  const res = mockRes();
  await adminAssignReport(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { message: 'assignee must be an admin or super-admin' });
});

test('adminAssignReport assigns and moves open reports to under_review', async () => {
  const report = {
    id: 12,
    status: 'open',
    assigneeUserId: null,
    async save() {},
  };
  Report.findByPk = async (id) => {
    if (id === 12) return report;
    return {
      toJSON() {
        return {
          id: 12,
          status: 'under_review',
          assigneeUserId: 5,
          reporter: { id: 8, fullName: 'Rep', username: 'rep' },
          assignee: { id: 5, fullName: 'Mod', username: 'mod' },
        };
      },
    };
  };
  User.findByPk = async () => ({ id: 5, accountStatus: 'active', loginDisabled: false, Role: { roleKey: 1 } });

  const req = { user: { id: 1 }, params: { id: '12' }, body: { assigneeUserId: 5 } };
  const res = mockRes();
  await adminAssignReport(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(report.status, 'under_review');
  assert.equal(res.payload?.assigneeUserId, 5);
});

test('adminUpdateReportStatus archives target post for archive_post action', async () => {
  const report = {
    id: 30,
    targetType: 'post',
    targetId: 66,
    status: 'open',
    assigneeUserId: null,
    async save() {},
  };
  const post = {
    id: 66,
    isArchived: false,
    async save() {},
  };
  let findByPkCallCount = 0;
  Report.findByPk = async (id) => {
    findByPkCallCount += 1;
    if (findByPkCallCount === 1) return report;
    return {
      toJSON() {
        return {
          id,
          reporterUserId: 22,
          targetType: 'post',
          targetId: 66,
          status: 'resolved',
          resolutionAction: 'archive_post',
          reporter: { id: 22, fullName: 'Rep', username: 'rep' },
          assignee: { id: 2, fullName: 'Admin', username: 'admin' },
        };
      },
    };
  };
  Post.findByPk = async () => post;
  Post.findAll = async () => [{ toJSON: () => ({ id: 66, content: 'bad post', isArchived: true, userId: 91 }) }];

  const req = {
    user: { id: 2, roleKey: 1 },
    params: { id: '30' },
    body: {
      status: 'resolved',
      resolutionAction: 'archive_post',
      resolutionNote: 'Policy violation confirmed',
      archiveReason: 'Archived due to user report',
    },
  };
  const res = mockRes();
  await adminUpdateReportStatus(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(post.isArchived, true);
  assert.equal(post.archivedBy, 'user:2');
  assert.equal(report.status, 'resolved');
  assert.equal(report.resolutionAction, 'archive_post');
});
