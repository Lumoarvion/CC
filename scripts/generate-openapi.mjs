import path from 'path';
import fs from 'fs';
import swaggerAutogen from 'swagger-autogen';

const outDir = path.resolve('docs');
const outputFile = path.join(outDir, 'openapi.json');
const endpointsFiles = [
  path.resolve('src/routes/index.js'),
  path.resolve('src/routes/adminRoutes.js'),
  path.resolve('src/routes/authRoutes.js'),
  path.resolve('src/routes/userRoutes.js'),
  path.resolve('src/routes/postRoutes.js'),
  path.resolve('src/routes/mediaRoutes.js'),

];

// Minimal base doc; swagger-autogen augments this by scanning routes
const doc = {
  openapi: '3.0.3',
  info: {
    title: 'Lumo - CConnect',
    version: '1.0.0',
    description: 'Lumo CConnect REST API: Auth, Users, Posts',
  },
  externalDocs: {
    description: 'Swagger UI (live docs)',
    url: '/api/docs',
  },
  servers: [{ url: '/api' }],
  tags: [
    { name: 'Auth', description: 'Authentication and OTP' },
    { name: 'Users', description: 'User profile and relations' },
    { name: 'Posts', description: 'Posting, likes and comments' },
    { name: 'Admin', description: 'Super-admin only operations' },
    { name: 'Media', description: 'Media storage and uploads' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { message: { type: 'string' } },
        example: { message: 'Bad request' },
      },
      SimpleError: {
        type: 'object',
        properties: { error: { type: 'string' } },
        example: { error: 'Something went wrong' },
      },
      Ok: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        example: { ok: true },
      },
      UserSummary: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          username: { type: 'string' },
          email: { type: 'string', format: 'email' },
          degreeId: { type: 'integer', nullable: true },
          departmentId: { type: 'integer', nullable: true },
          designationId: { type: 'integer', nullable: true },
        },
        example: {
          id: 42,
          name: 'Alice Doe',
          username: 'alice',
          email: 'alice@example.edu',
          degreeId: 101,
          departmentId: 5,
          designationId: 301,
        },
      },
      AuthRegisterRequest: {
        type: 'object',
        description: 'Payload for /auth/register. Usernames are trimmed and validated before duplicate checks.',
        required: ['fullName', 'username', 'email', 'password', 'otpTicket'],
        properties: {
          fullName: { type: 'string', description: 'Display name shown in UI.' },
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 30,
            pattern: '^[A-Za-z0-9._-]+$',
            description: 'Case-sensitive handle. Trimmed before persistence. Allowed characters: letters, numbers, dot, underscore, hyphen.',
            example: 'john.doe'
          },
          email: { type: 'string', format: 'email', description: 'Trimmed and lowercased during registration.' },
          password: { type: 'string', format: 'password', description: 'Minimum 8 characters recommended.' },
          otpTicket: { type: 'string', pattern: '^[0-9]{10}$', description: '10-digit ticket from /auth/verify-otp.' },
          roleKey: { type: 'integer', enum: [2, 3], description: '2 = Staff, 3 = Student. Must align with accountType if present.' },
          accountType: { type: 'string', nullable: true, description: 'Legacy string alias for roleKey.' },
          degreeId: { type: 'integer', nullable: true },
          departmentId: { type: 'integer', nullable: true },
          designationId: { type: 'integer', nullable: true },
          empId: { type: 'string', nullable: true },
          gender: { type: 'string', nullable: true, description: 'male | female | other | prefer_not_to_say' },
          yearOfJoining: { type: 'integer', nullable: true },
          academicYear: { type: 'integer', nullable: true },
          studentId: { type: 'string', nullable: true }
        }
      },
      OtpRequest: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email', description: 'Email to receive the OTP. Normalized to lowercase.' }
        },
        example: { email: 'student@example.edu' }
      },
      OtpRequestResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Status message suitable for UI display.' },
          email: { type: 'string', format: 'email' },
          domain: { type: 'string', description: 'Brand/organization domain inferred from email.' },
          expiresInSeconds: { type: 'integer', description: 'Seconds until the OTP expires.' },
          otp: { type: 'string', description: '4-digit OTP echoed in non-production environments or when explicitly enabled.', nullable: true }
        },
        example: { message: 'OTP sent to email', email: 'student@example.edu', domain: 'example.edu', expiresInSeconds: 900, otp: '1234' }
      },
      OtpVerifyRequest: {
        type: 'object',
        required: ['email', 'otp'],
        properties: {
          email: { type: 'string', format: 'email' },
          otp: { type: 'string', description: '4-digit code from email.' }
        },
        example: { email: 'student@example.edu', otp: '1234' }
      },
      OtpVerifyResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          email: { type: 'string', format: 'email' },
          roles: {
            type: 'array',
            items: { type: 'object', properties: { roleKey: { type: 'integer' }, roleName: { type: 'string' }, description: { type: 'string' } } }
          },
          otpTicket: { type: 'string', description: '10-digit ticket required for registration.' },
          expiresInSeconds: { type: 'integer' }
        },
        example: { message: 'OTP verified', email: 'student@example.edu', roles: [{ roleKey: 3, roleName: 'Student' }], otpTicket: '0123456789', expiresInSeconds: 1800 }
      },
      ReferenceDataResponse: {
        type: 'object',
        description: 'Role-specific lookup data surfaced after OTP verification.',
        properties: {
          roleKey: { type: 'integer' },
          degrees: {
            type: 'array',
            nullable: true,
            items: { type: 'object', properties: { degreeId: { type: 'integer' }, degreeAbbr: { type: 'string' }, degreeName: { type: 'string' }, level: { type: 'integer' } } }
          },
          departments: {
            type: 'array',
            items: { type: 'object', properties: { departmentId: { type: 'integer' }, departmentName: { type: 'string' } } }
          },
          designations: {
            type: 'array',
            nullable: true,
            items: { type: 'object', properties: { designationId: { type: 'integer' }, designationName: { type: 'string' }, isTeaching: { type: 'boolean' } } }
          }
        }
      },
      AuthRegisterResponse: {
        type: 'object',
        description: 'Response issued after successful registration.',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          username: { type: 'string' },
          email: { type: 'string', format: 'email' },
          degreeId: { type: 'integer', nullable: true },
          departmentId: { type: 'integer', nullable: true },
          designationId: { type: 'integer', nullable: true },
          empId: { type: 'string', nullable: true },
          gender: { type: 'string', nullable: true },
          yearOfJoining: { type: 'integer', nullable: true },
          studentId: { type: 'string', nullable: true }
        },
        example: {
          id: 42,
          name: 'Alice Doe',
          username: 'alice',
          email: 'alice@example.edu',
          degreeId: 101,
          departmentId: 5,
          designationId: 301,
          empId: 'EMP-2024-0001',
          gender: 'female',
          yearOfJoining: 2023,
          studentId: 'STU-2023-0001'
        }
      },
      AvatarUpdateResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          avatarUrl: { type: 'string' },
          avatarUrlFull: { type: 'string' },
        },
        example: {
          ok: true,
          avatarUrl: '/uploads/avatars/abc-256.webp',
          avatarUrlFull: '/uploads/avatars/abc-1024.webp',
        },
      },
      PostCreate: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string' },
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type', 'url'],
              properties: {
                type: { type: 'string' },
                url: { type: 'string' },
              },
            },
          },
        },
        example: { content: 'Hello campus!', attachments: [{ type: 'image', url: 'https://example.com/pic.jpg' }] },
      },
      Post: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          content: { type: 'string' },
          userId: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        example: { id: 1, content: 'Hello campus!', userId: 42, createdAt: '2025-09-02T12:00:00Z' },
      },
      CommentCreate: {
        type: 'object',
        required: ['content'],
        properties: { content: { type: 'string' } },
        example: { content: 'Nice post!' },
      },
      Comment: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          postId: { type: 'integer' },
          userId: { type: 'integer' },
          content: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          commentCount: { type: 'integer', minimum: 0, description: 'Updated total number of comments on the post.' }
        },
        required: ['id', 'postId', 'userId', 'content', 'createdAt', 'updatedAt'],
        example: {
          id: 871,
          postId: 123,
          userId: 4,
          content: 'Team Phoenix has 3 open slots — DM me if you want in!',
          createdAt: '2025-10-06T17:05:00.000Z',
          updatedAt: '2025-10-06T17:05:00.000Z',
          commentCount: 9
        }
      },
      DeleteRequestBody: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string', format: 'password', description: 'Current password for the logged-in account.' },
          reason: { type: 'string', nullable: true, maxLength: 2000, description: 'Optional context shared with admins when reviewing deletions.' },
        },
        example: { password: 'currentPassword123', reason: 'Graduated; no longer need campus access' },
      },
      DeleteRequestResponse: {
        type: 'object',
        properties: {
          requestId: { type: 'string', description: 'Opaque deletion request identifier returned by /users/me/delete-request.' },
          expiresAt: { type: 'string', format: 'date-time', description: 'ISO timestamp when the OTP/request expires.' },
          otp: { type: 'string', nullable: true, description: '4-digit OTP. Present only when INCLUDE_OTP_IN_RESPONSE=true or NODE_ENV !== "production".' },
        },
        example: { requestId: 'b027e09885bb0885ddd3759b06445ca9', expiresAt: '2025-10-01T15:43:09.931Z', otp: '8157' },
      },
      DeleteConfirmRequest: {
        type: 'object',
        required: ['requestId', 'otp'],
        properties: {
          requestId: { type: 'string', minLength: 1, description: 'Token returned by delete-request.' },
          otp: { type: 'string', pattern: '^[0-9]{4}$', description: '4-digit confirmation code from the email/response.' },
        },
        example: { requestId: 'b027e09885bb0885ddd3759b06445ca9', otp: '8157' },
      },
      DeleteConfirmResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['deleted'], description: 'Always "deleted" when the confirmation succeeds.' },
          confirmedAt: { type: 'string', format: 'date-time', description: 'Timestamp when the account was scrubbed and archived.' },
          mailerError: { type: 'boolean', nullable: true, description: 'true when the confirmation email failed to send; account deletion already committed.' },
        },
        example: { status: 'deleted', confirmedAt: '2025-10-01T18:00:11.933Z', mailerError: false },
      },
    },
  },
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const autogen = swaggerAutogen({ openapi: '3.0.3' });

autogen(outputFile, endpointsFiles, doc)
  .then(() => {
    try {
      const raw = fs.readFileSync(outputFile, 'utf-8');
      const spec = JSON.parse(raw);
      const authRegisterSchemas = {
        request: {
          type: 'object',
          description: 'Payload for /auth/register. Usernames are trimmed and validated before duplicate checks.',
          required: ['fullName', 'username', 'email', 'password', 'otpTicket'],
          properties: {
            fullName: { type: 'string', description: 'Display name shown in UI.' },
            username: { type: 'string', minLength: 3, maxLength: 30, pattern: '^[A-Za-z0-9._-]+$', description: 'Case-sensitive handle. Trimmed before persistence. Allowed characters: letters, numbers, dot, underscore, hyphen.', example: 'alice.doe' },
            email: { type: 'string', format: 'email', description: 'Trimmed and lowercased during registration.' },
            password: { type: 'string', format: 'password', description: 'Minimum 8 characters recommended.' },
            otpTicket: { type: 'string', pattern: '^[0-9]{10}$', description: '10-digit ticket from /auth/verify-otp.' },
            roleKey: { type: 'integer', enum: [2, 3], description: '2 = Staff, 3 = Student. Must align with accountType if present.' },
            accountType: { type: 'string', nullable: true, description: 'Legacy string alias for roleKey.' },
            degreeId: { type: 'integer', nullable: true },
            departmentId: { type: 'integer', nullable: true },
            designationId: { type: 'integer', nullable: true },
            empId: { type: 'string', nullable: true },
            gender: { type: 'string', nullable: true, description: 'male | female | other | prefer_not_to_say' },
            yearOfJoining: { type: 'integer', nullable: true },
            academicYear: { type: 'integer', nullable: true },
            studentId: { type: 'string', nullable: true }
          }
        },
        response: {
          type: 'object',
          description: 'Response issued after successful registration.',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            username: { type: 'string' },
            email: { type: 'string', format: 'email' },
            degreeId: { type: 'integer', nullable: true },
            departmentId: { type: 'integer', nullable: true },
            designationId: { type: 'integer', nullable: true },
            empId: { type: 'string', nullable: true },
            gender: { type: 'string', nullable: true },
            yearOfJoining: { type: 'integer', nullable: true },
            studentId: { type: 'string', nullable: true }
          },
          example: {
            id: 42,
            name: 'Alice Doe',
            username: 'alice.doe',
            email: 'alice@example.edu',
            degreeId: 101,
            departmentId: 5,
            designationId: 301,
            empId: 'EMP-2024-0001',
            gender: 'female',
            yearOfJoining: 2023,
            studentId: 'STU-2023-0001'
          }
        }
      };

      spec.components = spec.components || {};
      spec.components.schemas = spec.components.schemas || {};
      spec.components.schemas.AuthRegisterRequest = authRegisterSchemas.request;
      spec.components.schemas.AuthRegisterResponse = authRegisterSchemas.response;

      const authLoginSchemas = {
        request: {
          type: 'object',
          description: 'Credentials for /auth/login. emailOrUsername is trimmed before lookup.',
          required: ['emailOrUsername', 'password'],
          properties: {
            emailOrUsername: { type: 'string', description: 'Email (case-insensitive) or username (case-sensitive).', example: 'alice@example.edu' },
            password: { type: 'string', format: 'password', description: 'Plain password sent over HTTPS.', example: 'P@ssw0rd123!' }
          }
        },
        response: {
          type: 'object',
          description: 'JWT plus lightweight user profile returned after successful login.',
          properties: {
            token: { type: 'string', description: 'JWT signed with server secret.' },
            user: { type: 'object', $ref: '#/components/schemas/UserSummary' }
          },
          example: {
            token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            user: { id: 42, name: 'Alice Doe', username: 'alice', email: 'alice@example.edu', degreeId: 101, departmentId: 5, designationId: null }
          }
        }
      };

      spec.components.schemas.AuthLoginRequest = authLoginSchemas.request;
      spec.components.schemas.AuthLoginResponse = authLoginSchemas.response;


      const authKeys = new Set(['/register', '/login', '/request-otp', '/verify-otp', '/reference-data']);
      const userKeys = new Set(['/me', '/{id}', '/{id}/follow', '/me/avatar', '/me/delete-request', '/me/delete-confirm']);
      const postKeys = new Set(['/', '/feed', '/{id}/like', '/{id}/comments']);
      const mediaKeys = new Set(['/presign']);

      const newPaths = {};
      for (const [p, val] of Object.entries(spec.paths || {})) {
        let np = p;
        if (authKeys.has(p)) np = '/auth' + (p === '/' ? '' : p);
        else if (userKeys.has(p)) np = '/users' + (p === '/' ? '' : p);
        else if (postKeys.has(p)) np = '/posts' + (p === '/' ? '' : p);
        else if (mediaKeys.has(p)) np = '/media' + (p === '/' ? '' : p);
        newPaths[np] = val;
      }
      spec.paths = newPaths;

      spec.tags = spec.tags && spec.tags.length ? spec.tags : doc.tags;
      spec.components = spec.components || {};
      spec.components.schemas = { ...(doc.components.schemas || {}), ...(spec.components.schemas || {}) };

      function ensure(pathKey, method, patch) {
        const pathItem = spec.paths[pathKey];
        if (!pathItem) return;
        const op = pathItem[method];
        if (!op) return;
        Object.assign(op, patch);
      }

      function addParams(pathKey, method, params) {
        const pathItem = spec.paths[pathKey];
        if (!pathItem) return;
        const op = pathItem[method];
        if (!op) return;
        op.parameters = op.parameters || [];
        for (const p of params) op.parameters.push(p);
      }

      ensure('/auth/register', 'post', {
        tags: ['Auth'],
        summary: 'Create a new account',
        description: 'roleKey takes precedence over accountType (must match if both provided). Students (roleKey=3) require degreeId, yearOfJoining (aka academicYear), and studentId; Staff (roleKey=2) may omit degreeId. departmentId is required for all. gender is optional. fullName also accepts legacy alias name. Note: the field is roleKey, not roleId. Usernames must be 3-30 characters long and may contain letters, numbers, dot, underscore, or hyphen (no spaces).',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthRegisterRequest' },
              examples: {
                student: {
                  summary: 'Student registration (roleKey=3)',
                  value: { fullName: 'Alice Doe', username: 'alice.doe', email: 'alice@example.edu', password: 'secret', otpTicket: '1234567890', roleKey: 3, degreeId: 101, departmentId: 5, gender: 'female', yearOfJoining: 2023, studentId: 'STU-2023-0001' }
                },
                staff: {
                  summary: 'Staff registration (roleKey=2)',
                  value: { fullName: 'Prof Bob', username: 'prof_bob', email: 'bob@example.edu', password: 'secret', otpTicket: '1234567890', roleKey: 2, departmentId: 2, designationId: 301, empId: 'EMP-2024-0001', gender: 'male' }
                }
              }
            }
          },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthRegisterResponse' }, example: { id: 42, name: 'Alice Doe', username: 'alice.doe', email: 'alice@example.edu', degreeId: 101, departmentId: 5, designationId: 301, empId: 'EMP-2024-0001', gender: 'female', yearOfJoining: 2023, studentId: 'STU-2023-0001' } } } },
          400: { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, examples: { missingFields: { value: { message: 'All fields are required' } }, otpTicketRequired: { value: { message: 'otpTicket is required (10 digits)' } }, ticketInvalid: { value: { message: 'ticket_invalid' } }, ticketExpired: { value: { message: 'ticket_expired' } }, ticketUsed: { value: { message: 'ticket_used' } }, conflict: { value: { message: 'roleKey and accountType conflict' } }, unsupportedRole: { value: { message: 'Unsupported roleKey' } }, degreeRequired: { value: { message: 'degreeId is required' } }, invalidDegree: { value: { message: 'Invalid degreeId' } }, departmentRequired: { value: { message: 'departmentId is required' } }, invalidDepartment: { value: { message: 'Invalid departmentId' } }, roleNotConfigured: { value: { message: 'Role not configured' } }, invalidUsername: { value: { message: 'Username must be 3-30 characters and can include letters, numbers, dot, underscore, or hyphen.' } } } } } },
          409: { description: 'Conflict', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, examples: { emailConflict: { value: { message: 'Email already in use' } }, usernameConflict: { value: { message: 'Username already in use' } } } } } },
          500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Registration failed' } } } },
        },
      });

      ensure('/auth/login', 'post', {
        tags: ['Auth'],
        summary: 'Login with email/username and password',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthLoginRequest' } } },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthLoginResponse' }, example: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', user: { id: 42, name: 'Alice Doe', username: 'alice', email: 'alice@example.edu', degreeId: 101, departmentId: 5 } } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Invalid credentials' } } } },
        },
      });

      ensure('/auth/request-otp', 'post', {
        tags: ['Auth'],
        summary: 'Request OTP to email',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OtpRequest' },
              example: { email: 'student@example.edu' }
            }
          }
        },
        responses: {
          200: { description: 'OTP sent', content: { 'application/json': { schema: { $ref: '#/components/schemas/OtpRequestResponse' } } } },
          400: { description: 'Invalid email', content: { 'application/json': { schema: { $ref: '#/components/schemas/SimpleError' }, example: { error: 'Invalid email' } } } },
          403: { description: 'Domain not allowed', content: { 'application/json': { schema: { $ref: '#/components/schemas/SimpleError' }, example: { error: 'Email domain is not allowed' } } } },
          409: { description: 'Already registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/SimpleError' }, example: { error: 'Email already registered. Please login.' } } } },
          429: { description: 'Too Many Requests',
            headers: {
              'Retry-After': {
                description: 'Seconds to wait before retrying',
                schema: { type: 'integer' },
                example: 120,
              }
            },
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SimpleError' }, example: { error: 'OTP recently sent. Try again in 120s' } } }
          },
          502: { description: 'Failed to send email', content: { 'application/json': { schema: { $ref: '#/components/schemas/SimpleError' }, example: { error: 'Failed to send OTP email' } } } },
          500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/SimpleError' }, example: { error: 'Internal server error' } } } },
        },
      });

      ensure('/auth/verify-otp', 'post', {
        tags: ['Auth'],
        summary: 'Verify OTP code',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/OtpVerifyRequest' }, example: { email: 'student@example.edu', otp: '1234' } } } },
        responses: {
          200: { description: 'Verified', content: { 'application/json': { schema: { $ref: '#/components/schemas/OtpVerifyResponse' } } } },
          400: { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/SimpleError' }, examples: { missing: { value: { error: 'email and otp are required' } }, invalid: { value: { error: 'Invalid OTP' } }, expired: { value: { error: 'OTP expired' } }, none: { value: { error: 'No active OTP. Request a new one.' } } } } } },
          500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/SimpleError' }, example: { error: 'Internal server error' } } } },
        },
      });

      addParams('/auth/reference-data', 'get', [
        { name: 'roleKey', in: 'query', required: true, schema: { type: 'integer', enum: [2, 3], example: 3 }, description: '2=Staff, 3=Student' },
      ]);
      ensure('/auth/reference-data', 'get', {
        tags: ['Auth'],
        summary: 'Fetch reference data by roleKey',
        description: 'Provide roleKey=3 (Student) to receive degrees + departments; roleKey=2 (Staff) to receive designations + departments.',
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/ReferenceDataResponse' }, examples: {
            student: { summary: 'Student reference data', value: { roleKey: 3, degrees: [{ degreeId: 101, degreeAbbr: 'BSc', degreeName: 'Bachelor of Science', level: 1 }], departments: [{ departmentId: 5, departmentName: 'Computer Science' }] } },
            staff: { summary: 'Staff reference data', value: { roleKey: 2, departments: [{ departmentId: 5, departmentName: 'Computer Science' }], designations: [{ designationId: 1, designationName: 'Professor', isTeaching: true }] } },
          } } } },
          400: { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/SimpleError' }, example: { error: 'Invalid or missing roleKey (2=Staff, 3=Student)' } } } },
          500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/SimpleError' }, example: { error: 'Internal server error' } } } },
        },
      });

      // Add bearerAuth to users and posts endpoints by default
      for (const [p, item] of Object.entries(spec.paths)) {
        if (!p.startsWith('/users') && !p.startsWith('/posts') && !p.startsWith('/media')) continue;
        for (const m of Object.keys(item)) {
          const op = item[m];
          if (typeof op !== 'object') continue;
          op.security = op.security || [{ bearerAuth: [] }];
          if (!op.tags || !op.tags.length) {
            op.tags = [p.startsWith('/users') ? 'Users' : p.startsWith('/posts') ? 'Posts' : 'Media'];
          }
        }
      }

      // Users: params, bodies, responses
      addParams('/users/{id}', 'get', [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'User ID' },
      ]);
      ensure('/users/me', 'get', {
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserSummary' } } } } },
      });
      ensure('/users/{id}', 'get', {
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserSummary' } } } } },
      });
      addParams('/users/{id}/follow', 'post', [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'User ID to follow' },
      ]);
      addParams('/users/{id}/follow', 'delete', [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'User ID to unfollow' },
      ]);
      ensure('/users/{id}/follow', 'post', { responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Ok' } } } } } });
      ensure('/users/{id}/follow', 'delete', { responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Ok' } } } } } });
      ensure('/users/me/avatar', 'post', {
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { avatar: { type: 'string', format: 'binary' } },
                required: ['avatar'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/AvatarUpdateResponse' } } } },
        },
      });
      ensure('/users/me/avatar', 'delete', {
        responses: { 200: { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Ok' } } } } },
      });

      ensure('/users/me/delete-request', 'post', {
        tags: ['Users'],
        summary: 'Request account deletion (OTP)',
        description: 'Verifies the current password, records reason/IP/UA metadata, and issues a deletion requestId plus 4-digit OTP that expires after DELETE_OTP_TTL_MIN minutes.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DeleteRequestBody' },
              example: { password: 'P@ssw0rd123!', reason: 'Graduated; no longer need access' },
            },
          },
        },
        responses: {
          200: {
            description: 'OTP issued',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteRequestResponse' },
                examples: {
                  production: {
                    value: { requestId: '01f973c50f4ca310f90b0ca142111c55', expiresAt: '2025-10-01T18:14:57.040Z' },
                    description: 'Response in production where OTP is emailed only.'
                  },
                  nonProduction: {
                    value: { requestId: '01f973c50f4ca310f90b0ca142111c55', expiresAt: '2025-10-01T18:14:57.040Z', otp: '7732' },
                    description: 'Response when INCLUDE_OTP_IN_RESPONSE=true or NODE_ENV != production.'
                  }
                }
              }
            },
          },
          400: {
            description: 'Validation failed or no eligible pending request',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Password is required' } } },
          },
          401: {
            description: 'Password incorrect',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Invalid password' } } },
          },
          404: {
            description: 'User record not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'User not found' } } },
          },
          410: {
            description: 'Account already deleted',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Account already deleted' } } },
          },
          500: {
            description: 'Unable to process request',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Failed to request account deletion' } } },
          },
        },
      });
      ensure('/users/me/delete-confirm', 'post', {
        tags: ['Users'],
        summary: 'Confirm account deletion',
        description: 'Consumes the requestId + OTP, archives the user snapshot, scrubs personal data, bumps jwtVersion, and attempts to send a confirmation email (best-effort).',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DeleteConfirmRequest' },
              example: { requestId: '01f973c50f4ca310f90b0ca142111c55', otp: '7732' },
            },
          },
        },
        responses: {
          200: {
            description: 'Account deleted',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DeleteConfirmResponse' }, example: { status: 'deleted', confirmedAt: '2025-10-01T18:00:11.933Z', mailerError: false } } },
          },
          400: {
            description: 'Invalid requestId/otp or no pending request',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Invalid requestId or otp' } } },
          },
          401: {
            description: 'Unauthorized or session revoked',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Invalid or expired token' } } },
          },
          404: {
            description: 'User record not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'User not found' } } },
          },
          410: {
            description: 'Request expired or account already deleted',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Account already deleted' } } },
          },
          500: {
            description: 'Failed to confirm deletion request',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Failed to confirm account deletion' } } },
          },
        },
      });

      // Posts: params, bodies, responses
      spec.tags = Array.isArray(spec.tags) ? spec.tags : [];
      if (!spec.tags.some((t) => t && t.name === 'Admin')) {
        spec.tags.push({ name: 'Admin', description: 'Super-admin only operations' });
      }

      spec.paths = spec.paths || {};

      spec.paths['/admin/admins'] = {
        post: {
          tags: ['Admin'],
          summary: 'Create admin account',
          description: 'Create an admin (roleKey=1). Only super-admins (roleKey=0) may call this endpoint.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fullName', 'username', 'email', 'password', 'departmentId'],
                  properties: {
                    fullName: { type: 'string', minLength: 1 },
                    username: { type: 'string', minLength: 3, maxLength: 30 },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                    departmentId: { type: 'integer', minimum: 1 },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Admin created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      fullName: { type: 'string' },
                      username: { type: 'string' },
                      email: { type: 'string', format: 'email' },
                      roleKey: { type: 'integer', example: 1 },
                      department: {
                        type: 'object',
                        properties: {
                          departmentId: { type: 'integer' },
                          departmentName: { type: 'string' },
                          isVisible: { type: 'boolean' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Authentication required' },
            '403': { description: 'Forbidden' },
            '409': { description: 'Conflict' },
            '500': { description: 'Server error' },
          },
        },
      };

      spec.paths['/admin/departments/internal'] = {
        get: {
          tags: ['Admin'],
          summary: 'List internal departments',
          description: 'Return active departments marked isVisible=false (internal use). Only super-admins may call this endpoint.',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Internal departments',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      count: { type: 'integer' },
                      departments: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            departmentId: { type: 'integer' },
                            departmentName: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'Forbidden' },
            '500': { description: 'Server error' },
          },
        },
      };

      ensure('/posts', 'post', {
        summary: 'Create a post',
        description:
          'Creates a standard post for the authenticated user. Content is trimmed and deduplicated against the most recent post. Include the `metadata.r2Key` from `/media/presign` so media objects can be cleaned up if a post is edited or deleted. Set `quotedPostId` to reshare another post (omit `content`/attachments for a silent repost or include them for a quote post) and `parentPostId` to start a threaded reply.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PostCreate' },
              example: {
                content: 'Excited for the #Hackathon with @superadmin!',
                attachments: [
                  {
                    type: 'image',
                    url: 'https://cdn.example.edu/media/posts/hackathon-poster.webp',
                    metadata: {
                      r2Key: 'users/4/posts/hackathon-poster.webp',
                      contentType: 'image/webp',
                      size: 104857,
                      width: 1024,
                      height: 576
                    }
                  }
                ]
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Post' },
                example: {
                  id: 123,
                  content: 'Excited for the #Hackathon with @superadmin!',
                  postType: 'standard',
                  audienceScope: { target: { scope: 'profile' }, interests: ['topic:events', 'department:1'] },
                  mentions: ['superadmin'],
                  hashtags: ['hackathon'],
                  urls: ['https://example.edu/events/hack'],
                  media: [
                    {
                      id: 1,
                      type: 'image',
                      url: 'https://cdn.example.edu/media/posts/hackathon-poster.webp',
                      metadata: {
                        r2Key: 'users/4/posts/hackathon-poster.webp',
                        contentType: 'image/webp',
                        size: 104857,
                        width: 1024,
                        height: 576,
                        order: 0
                      }
                    }
                  ],
                  quotedPostId: null,
                  parentPostId: null,
                  isArchived: false,
                  announcementTypeId: null,
                  userId: 4,
                  user: { id: 4, fullName: 'Ava Admin', username: 'ava.admin' },
                  createdAt: '2025-10-06T17:00:00.000Z',
                  updatedAt: '2025-10-06T17:00:00.000Z'
                }
              }
            }
          },
          400: {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                examples: {
                  lengthExceeded: { summary: 'Content too long', value: { message: 'content exceeds 2000 characters' } },
                  mediaRule: { summary: 'Attachment rule violated', value: { message: 'video posts may include only one attachment' } },
                  invalidQuoted: { summary: 'Referenced post is archived or missing', value: { message: 'quoted post not found' } }
                }
              }
            }
          },
          401: {
            description: 'Authentication required',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, examples: { missing: { value: { message: 'Missing token' } }, invalid: { value: { message: 'Invalid or expired token' } } } } }
          },
          403: {
            description: 'Account disabled',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Account disabled' } } }
          },
          404: {
            description: 'Referenced post not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'parent post not found' } } }
          },
          409: { description: 'Duplicate content', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Duplicate content detected' } } } },
          429: { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Too many posts, try again in a minute' } } } },
          500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Failed to create post' } } } }
        }
      });
      ensure('/posts/feed', 'get', {
        summary: 'Fetch feed',
        description: 'Returns the authenticated user\'s feed, comprised of their posts and posts from accounts they follow. Archived posts are excluded and results are sorted by `pinnedUntil` then `createdAt`.',
        responses: {
          200: {
            description: 'Feed page',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PostFeedResponse' } } }
          },
          500: {
            description: 'Server error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Failed to load feed' } } }
          }
        }
      });
      addParams('/posts/feed', 'get', [
        { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 }, description: 'Page number (default 1)' },
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50 }, description: 'Items per page (default 10, max 50)' },
      ]);
      const postIdParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Post ID' };
      addParams('/posts/{id}/like', 'post', [postIdParam]);
      addParams('/posts/{id}/like', 'delete', [postIdParam]);
      ensure('/posts/{id}/like', 'post', {
        summary: 'Like a post',
        description: 'Adds a like from the current user. The operation is idempotent; repeating it keeps the post liked.',
        responses: {
          200: {
            description: 'Liked',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PostEngagementResponse' },
                example: { ok: true, likeCount: 12, viewerHasLiked: true }
              }
            }
          },
          400: { description: 'Invalid post id', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'invalid post id' } } } },
          401: { description: 'Authentication required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Missing token' } } } },
          403: { description: 'Account disabled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Account disabled' } } } },
          404: { description: 'Post not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'post not found' } } } },
          500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Failed to like post' } } } }
        }
      });
      ensure('/posts/{id}/like', 'delete', {
        summary: 'Unlike a post',
        description: 'Removes the user\'s like. Returns `ok: true` even if the post was not previously liked.',
        responses: {
          200: {
            description: 'Unliked',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PostEngagementResponse' },
                example: { ok: true, likeCount: 11, viewerHasLiked: false }
              }
            }
          },
          400: { description: 'Invalid post id', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'invalid post id' } } } },
          401: { description: 'Authentication required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Missing token' } } } },
          403: { description: 'Account disabled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Account disabled' } } } },
          500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Failed to unlike post' } } } }
        }
      });
      addParams('/posts/{id}/comments', 'post', [postIdParam]);
      ensure('/posts/{id}/comments', 'post', {
        summary: 'Comment on a post',
        description: 'Adds a text comment to the specified post. Content is trimmed and limited to 2000 characters.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CommentCreate' },
              example: { content: 'Team Phoenix has 3 open slots — DM me if you want in!' }
            }
          }
        },
        responses: {
          201: {
            description: 'Created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Comment' } } }
          },
          400: {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                examples: {
                  missing: { value: { message: 'content required' } },
                  tooLong: { value: { message: 'comment exceeds 2000 characters' } }
                }
              }
            }
          },
          401: { description: 'Authentication required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Missing token' } } } },
          403: { description: 'Account disabled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Account disabled' } } } },
          404: { description: 'Post not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'post not found' } } } },
          500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Failed to add comment' } } } }
        }
      });

      ensure('/media/presign', 'post', {
        summary: 'Generate upload URL',
        description: 'Validates the incoming filename, MIME type, and optional file size before issuing a Cloudflare R2 presigned PUT URL. Attach the returned `objectKey` to post metadata so the backend can manage media lifecycle.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MediaPresignRequest' } } }
        },
        responses: {
          200: {
            description: 'Upload prepared',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MediaPresignResponse' } } }
          },
          400: {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                examples: {
                  missingFilename: { summary: 'No filename submitted', value: { message: 'filename is required' } },
                  missingMime: { summary: 'No content type', value: { message: 'contentType is required' } },
                  unsupportedMime: { summary: 'Disallowed MIME', value: { message: 'Unsupported content type' } },
                  tooLarge: { summary: 'Size exceeds limit', value: { message: 'File exceeds 50MB limit' } }
                }
              }
            }
          },
          401: {
            description: 'Authentication required',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Missing token' } } }
          },
          500: {
            description: 'Server error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Failed to prepare upload' } } }
          }
        },
        tags: ['Media']
      });

      spec.components.schemas.PostMediaMetadata = {
        type: 'object',
        description: 'Metadata persisted with each attachment. Additional custom keys may be stored alongside these defaults.',
        properties: {
          r2Key: { type: 'string', description: 'Cloudflare R2 object key returned by POST /media/presign.' },
          contentType: { type: 'string', nullable: true, description: 'MIME type supplied during upload (e.g. image/webp).' },
          size: { type: 'integer', nullable: true, description: 'Object size in bytes.' },
          width: { type: 'integer', nullable: true, description: 'Pixel width when known.' },
          height: { type: 'integer', nullable: true, description: 'Pixel height when known.' },
          duration: { type: 'number', format: 'float', nullable: true, description: 'Duration in seconds for video or GIF attachments.' },
          order: { type: 'integer', nullable: true, description: 'Insertion order maintained by the server.' }
        },
        additionalProperties: true,
        example: {
          r2Key: 'users/4/posts/714b3d51-9e1f-4aa2-9f9e-4c2f034b0d0d.webp',
          contentType: 'image/webp',
          size: 105432,
          width: 1280,
          height: 720,
          order: 0
        }
      };

      spec.components.schemas.PostMedia = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          type: { type: 'string', enum: ['image', 'gif', 'video'] },
          url: { type: 'string', format: 'uri' },
          metadata: { $ref: '#/components/schemas/PostMediaMetadata' }
        },
        required: ['id', 'type', 'url'],
        example: {
          id: 1,
          type: 'image',
          url: 'https://cdn.example.edu/media/users/4/posts/714b3d51.webp',
          metadata: {
            r2Key: 'users/4/posts/714b3d51-9e1f-4aa2-9f9e-4c2f034b0d0d.webp',
            contentType: 'image/webp',
            size: 105432,
            width: 1280,
            height: 720,
            order: 0
          }
        }
      };

      spec.components.schemas.PostSummary = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          content: { type: 'string' },
          postType: { type: 'string' },
          audienceScope: { type: 'object', additionalProperties: true },
          user: { $ref: '#/components/schemas/PostAuthor', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        },
        required: ['id', 'content', 'postType', 'audienceScope', 'createdAt', 'updatedAt']
      };

      spec.components.schemas.Post = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          content: { type: 'string' },
          postType: { type: 'string', enum: ['standard', 'announcement'] },
          pinnedUntil: { type: 'string', format: 'date-time', nullable: true },
          audienceScope: { type: 'object', additionalProperties: true },
          mentions: { type: 'array', items: { type: 'string' }, description: 'Lowercase usernames referenced with @' },
          hashtags: { type: 'array', items: { type: 'string' }, description: 'Lowercase hashtag slugs (no # symbol)' },
          urls: { type: 'array', items: { type: 'string' }, description: 'Normalized https URLs detected in content' },
          media: { type: 'array', items: { $ref: '#/components/schemas/PostMedia' } },
          quotedPostId: { type: 'integer', nullable: true },
          quotedPost: { $ref: '#/components/schemas/PostSummary', nullable: true },
          parentPostId: { type: 'integer', nullable: true },
          parentPost: { $ref: '#/components/schemas/PostSummary', nullable: true },
          isArchived: { type: 'boolean' },
          archivedAt: { type: 'string', format: 'date-time', nullable: true },
          archivedBy: { type: 'string', nullable: true },
          archiveReason: { type: 'string', nullable: true },
          announcementTypeId: { type: 'integer', nullable: true },
          announcementType: { $ref: '#/components/schemas/AnnouncementTypeSummary', nullable: true },
          userId: { type: 'integer' },
          user: { $ref: '#/components/schemas/PostAuthor', nullable: true },
          likeCount: { type: 'integer', minimum: 0, description: 'Running total of likes (materialized from post_stats).' },
          commentCount: { type: 'integer', minimum: 0, description: 'Running total of comments (materialized).' },
          quoteCount: { type: 'integer', minimum: 0, description: 'Running total of quotes/reposts (future-ready).' },
          viewCount: { type: 'integer', minimum: 0, description: 'Aggregated impressions (populated asynchronously).' },
          viewerHasLiked: { type: 'boolean', description: 'Whether the requesting user currently likes the post.' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        },
        required: ['id', 'content', 'postType', 'audienceScope', 'isArchived', 'userId', 'likeCount', 'commentCount', 'quoteCount', 'viewCount', 'viewerHasLiked', 'createdAt', 'updatedAt']
      };

      spec.components.schemas.PostFeedResponse = {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1 },
          count: { type: 'integer', minimum: 0 },
          posts: { type: 'array', items: { $ref: '#/components/schemas/Post' } }
        },
        required: ['page', 'limit', 'count', 'posts'],
        example: {
          page: 1,
          limit: 10,
          count: 2,
          posts: [
            {
              id: 123,
              content: 'Excited for the #Hackathon with @superadmin!',
              postType: 'standard',
              audienceScope: { target: { scope: 'profile' }, interests: ['topic:events'] },
              mentions: ['superadmin'],
              hashtags: ['hackathon'],
              urls: ['https://example.edu/events/hack'],
              media: [
                {
                  id: 1,
                  type: 'image',
                  url: 'https://cdn.example.edu/media/posts/hackathon-poster.webp',
                  metadata: {
                    r2Key: 'users/4/posts/hackathon-poster.webp',
                    contentType: 'image/webp',
                    size: 104857,
                    width: 1024,
                    height: 576,
                    order: 0
                  }
                }
              ],
              quotedPostId: null,
              parentPostId: null,
              isArchived: false,
              announcementTypeId: null,
              userId: 4,
              user: { id: 4, fullName: 'Ava Admin', username: 'ava.admin' },
              likeCount: 42,
              commentCount: 3,
              quoteCount: 0,
              viewCount: 256,
              viewerHasLiked: false,
              createdAt: '2025-10-06T17:00:00.000Z',
              updatedAt: '2025-10-06T17:00:00.000Z'
            }
          ]
        }
      };

      spec.components.schemas.PostEngagementResponse = {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          likeCount: { type: 'integer', minimum: 0 },
          viewerHasLiked: { type: 'boolean' }
        },
        required: ['ok', 'likeCount', 'viewerHasLiked'],
        example: { ok: true, likeCount: 7, viewerHasLiked: true }
      };

      spec.components.schemas.MediaPresignRequest = {
        type: 'object',
        required: ['filename', 'contentType'],
        properties: {
          filename: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
            description:
              'Original client filename. Empty strings are rejected; include the real extension when possible so the backend can preserve it.'
          },
          contentType: {
            type: 'string',
            description: 'Normalized MIME type for the file that will be uploaded.',
            enum: [
              'image/jpeg',
              'image/png',
              'image/webp',
              'image/gif',
              'video/mp4',
              'video/quicktime',
              'video/webm'
            ]
          },
          size: {
            type: 'integer',
            format: 'int64',
            minimum: 1,
            maximum: 50 * 1024 * 1024,
            description:
              'Optional file size in bytes for pre-flight validation. Must be a positive integer <= 52,428,800 (50MB) when provided.'
          }
        },
        additionalProperties: false,
        example: { filename: 'hackathon-poster.webp', contentType: 'image/webp', size: 105432 }
      };

      spec.components.schemas.MediaPresignResponse = {
        type: 'object',
        properties: {
          uploadUrl: {
            type: 'string',
            format: 'uri',
            description: 'Pre-signed Cloudflare R2 HTTPS PUT URL to which the raw binary should be uploaded.'
          },
          expiresIn: {
            type: 'integer',
            minimum: 60,
            description: 'Number of seconds before the upload URL expires (defaults to 300s / 5 minutes).'
          },
          objectKey: {
            type: 'string',
            description: 'Opaque R2 object key; store this under `metadata.r2Key` when creating or updating posts.'
          },
          publicUrl: { type: 'string', format: 'uri', description: 'Public CDN URL that can be saved on the Post attachment.' },
          requiredHeaders: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Headers that must be included when uploading (currently just `Content-Type`).'
          },
          maxUploadBytes: {
            type: 'integer',
            enum: [50 * 1024 * 1024],
            description: 'Maximum allowed upload size in bytes (52,428,800 ~ 50MB).'
          }
        },
        required: ['uploadUrl', 'expiresIn', 'objectKey', 'publicUrl', 'requiredHeaders', 'maxUploadBytes'],
        example: {
          uploadUrl: 'https://example-r2.cloudflare.com/put-url',
          expiresIn: 900,
          objectKey: 'users/4/images/714b3d51.webp',
          publicUrl: 'https://cdn.example.edu/media/users/4/images/714b3d51.webp',
          requiredHeaders: { 'Content-Type': 'image/webp' },
          maxUploadBytes: 52428800
        }
      };

      spec.components.schemas.PostCreate = {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 2000, description: 'Trimmed text, max 2000 characters. Duplicate consecutive posts rejected.' },
          attachments: {
            type: 'array',
            maxItems: 5,
            description: 'Attach up to 5 images. If a GIF or video is included, it must be the only attachment. Include the `metadata.r2Key` issued by `/media/presign` so the backend can clean up objects.',
            items: {
              type: 'object',
              required: ['type', 'url'],
              properties: {
                type: { type: 'string', enum: ['image', 'gif', 'video'] },
                url: { type: 'string', format: 'uri' },
                metadata: {
                  type: 'object',
                  nullable: true,
                  description: 'Additional media information sent back by the storage presign endpoint.',
                  properties: {
                    r2Key: { type: 'string', description: 'Required: Cloudflare R2 object key for this file.' },
                    contentType: { type: 'string', nullable: true },
                    size: { type: 'integer', nullable: true },
                    width: { type: 'integer', nullable: true },
                    height: { type: 'integer', nullable: true },
                    duration: { type: 'number', nullable: true, description: 'Duration in seconds for video/GIF uploads.' }
                  },
                  additionalProperties: true
                }
              },
              additionalProperties: false
            }
          },
          quotedPostId: {
            type: 'integer',
            nullable: true,
            description:
              'ID of an existing post to share. When provided, the request is treated as a quote/repost; omit `content` and attachments for silent shares or include them for quote posts.'
          },
          parentPostId: {
            type: 'integer',
            nullable: true,
            description:
              'ID of the post this entry replies to when building threaded conversations. Not used for lightweight comments.'
          }
        },
        additionalProperties: false,
        example: {
          content: 'Excited for the #Hackathon with @superadmin!',
          attachments: [
            {
              type: 'image',
              url: 'https://cdn.example.edu/media/posts/hackathon-poster.webp',
              metadata: {
                r2Key: 'users/4/posts/hackathon-poster.webp',
                contentType: 'image/webp',
                size: 104857,
                width: 1024,
                height: 576
              }
            },
            {
              type: 'image',
              url: 'https://cdn.example.edu/media/posts/hackathon-team.jpg',
              metadata: { r2Key: 'users/4/posts/hackathon-team.jpg', contentType: 'image/jpeg' }
            }
          ],
          quotedPostId: 42,
          parentPostId: 41
        }
      };

      spec.components.schemas.PostArchiveRequest = {
        type: 'object',
        properties: {
          reason: { type: 'string', maxLength: 255, description: 'Optional reason shown in audit logs' }
        },
        additionalProperties: false
      };

      spec.components.schemas.PostArchiveResponse = {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          post: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              isArchived: { type: 'boolean' },
              archivedAt: { type: 'string', format: 'date-time', nullable: true },
              archivedBy: { type: 'string', nullable: true },
              archiveReason: { type: 'string', nullable: true }
            },
            required: ['id', 'isArchived']
          }
        },
        required: ['ok', 'post']
      };


      spec.components.schemas.PostAuthor = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          fullName: { type: 'string' },
          username: { type: 'string' }
        },
        required: ['id', 'fullName', 'username']
      };

      spec.components.schemas.AnnouncementTypeSummary = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          typeKey: { type: 'string' },
          displayName: { type: 'string' },
          description: { type: 'string', nullable: true }
        },
        required: ['id', 'typeKey', 'displayName']
      };

      const attachmentsSchema = {
        type: 'array',
        maxItems: 5,
        description: 'Attach up to 5 images. A GIF or video must be the sole attachment. Include the `metadata.r2Key` from `/media/presign` for storage cleanup.',
        items: {
          type: 'object',
          required: ['type', 'url'],
          properties: {
            type: { type: 'string', enum: ['image', 'gif', 'video'] },
            url: { type: 'string', format: 'uri' },
            metadata: {
              type: 'object',
              nullable: true,
              description: 'Additional media information persisted alongside the announcement.',
              properties: {
                r2Key: { type: 'string', description: 'Cloudflare R2 object key returned during presign.' },
                contentType: { type: 'string', nullable: true },
                size: { type: 'integer', nullable: true },
                width: { type: 'integer', nullable: true },
                height: { type: 'integer', nullable: true },
                duration: { type: 'number', nullable: true }
              },
              additionalProperties: true
            }
          },
          additionalProperties: false
        }
      };

      spec.components.schemas.AnnouncementCreateRequest = {
        type: 'object',
        required: ['content', 'announcementTypeId'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 280, description: 'Trimmed text, max 280 characters.' },
          attachments: attachmentsSchema,
          announcementTypeId: { type: 'integer', minimum: 1 },
          pinnedUntil: { type: 'string', format: 'date-time', nullable: true }
        },
        additionalProperties: false
      };

      spec.components.schemas.AnnouncementUpdateRequest = {
        type: 'object',
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 280, description: 'Trimmed text, max 280 characters.' },
          attachments: attachmentsSchema,
          announcementTypeId: { type: 'integer', minimum: 1 },
          pinnedUntil: { type: 'string', format: 'date-time', nullable: true }
        },
        additionalProperties: false
      };

      spec.components.schemas.AnnouncementResponse = {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          announcement: { $ref: '#/components/schemas/Post' }
        },
        required: ['ok', 'announcement']
      };

      spec.components.schemas.AnnouncementListResponse = {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          announcements: { type: 'array', items: { $ref: '#/components/schemas/Post' } }
        },
        required: ['page', 'limit', 'total', 'announcements']
      };

      const announcementIdParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Announcement ID' };

      const adminAnnouncementsPath = spec.paths['/admin/announcements'] || {};
      adminAnnouncementsPath.post = {
        tags: ['Admin'],
        summary: 'Create announcement',
        description: 'Create a new announcement post. Admin or super-admin only.',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AnnouncementCreateRequest' } } } },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AnnouncementResponse' } } } },
          400: { description: 'Validation error' },
          403: { description: 'Forbidden' }
        }
      };
      adminAnnouncementsPath.get = {
        tags: ['Admin'],
        summary: 'List announcements',
        description: 'Paginated list of announcements with optional archived records.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 }, description: 'Page number (default 1)' },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 }, description: 'Page size (default 10, max 100)' },
          { name: 'includeArchived', in: 'query', required: false, schema: { type: 'boolean' }, description: 'Include archived announcements' }
        ],
        responses: {
          200: { description: 'Announcements', content: { 'application/json': { schema: { $ref: '#/components/schemas/AnnouncementListResponse' } } } },
          403: { description: 'Forbidden' }
        }
      };
      spec.paths['/admin/announcements'] = adminAnnouncementsPath;

      const adminAnnouncementDetailPath = spec.paths['/admin/announcements/{id}'] || {};
      adminAnnouncementDetailPath.patch = {
        tags: ['Admin'],
        summary: 'Update announcement',
        description: 'Modify announcement content, type, or scheduling. Admin or super-admin only.',
        security: [{ bearerAuth: [] }],
        parameters: [announcementIdParam],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AnnouncementUpdateRequest' } } } },
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/AnnouncementResponse' } } } },
          400: { description: 'Validation error' },
          403: { description: 'Forbidden' },
          404: { description: 'Announcement not found' }
        }
      };
      spec.paths['/admin/announcements/{id}'] = adminAnnouncementDetailPath;

      spec.paths['/posts/{id}/archive'] = {
        post: {
          tags: ['Posts'],
          summary: 'Archive a post',
          description: 'Marks a post as archived so it no longer appears in feeds. Only the owner or admins may call this endpoint.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Post ID' }
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PostArchiveRequest' },
                example: { reason: 'Outdated announcement' }
              }
            }
          },
          responses: {
            200: {
              description: 'Archived',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PostArchiveResponse' },
                  example: {
                    ok: true,
                    post: {
                      id: 123,
                      isArchived: true,
                      archivedAt: '2025-11-02T08:31:42.000Z',
                      archivedBy: 'user:4',
                      archiveReason: 'Outdated announcement'
                    }
                  }
                }
              }
            },
            400: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'invalid post id' } } } },
            401: { description: 'Authentication required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Missing token' } } } },
            403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'forbidden' } } } },
            404: { description: 'Post not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'post not found' } } } },
            409: { description: 'Already archived', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'post already archived' } } } },
            500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Failed to archive post' } } } }
          }
        }
      };

      spec.paths['/posts/{id}/restore'] = {
        post: {
          tags: ['Posts'],
          summary: 'Restore an archived post',
          description: 'Clears the archive flag so the post returns to feeds.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Post ID' }
          ],
          responses: {
            200: {
              description: 'Restored',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PostArchiveResponse' },
                  example: { ok: true, post: { id: 123, isArchived: false } }
                }
              }
            },
            400: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'invalid post id' } } } },
            401: { description: 'Authentication required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Missing token' } } } },
            403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'forbidden' } } } },
            404: { description: 'Post not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'post not found' } } } },
            409: { description: 'Post is not archived', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'post is not archived' } } } },
            500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Failed to restore post' } } } }
          }
        }
      };

      const postDeletePath = spec.paths['/posts/{id}'] || {};
      postDeletePath.delete = {
        tags: ['Posts'],
        summary: 'Delete a post permanently',
        description: 'Removes the post and its related entities permanently.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Post ID' }
        ],
        responses: {
          204: { description: 'Deleted' },
          400: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'invalid post id' } } } },
          401: { description: 'Authentication required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Missing token' } } } },
          403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'forbidden' } } } },
          404: { description: 'Post not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'post not found' } } } },
          500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Failed to delete post' } } } }
        }
      };
      spec.paths['/posts/{id}'] = postDeletePath;

      // Follow + notification schemas
      spec.components.schemas.FollowActionResponse = {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          alreadyFollowing: { type: 'boolean', nullable: true },
          removed: { type: 'boolean', nullable: true }
        },
        example: { ok: true, alreadyFollowing: false, removed: false }
      };

      spec.components.schemas.FollowListResponse = {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          count: { type: 'integer' },
          total: { type: 'integer' },
          hasMore: { type: 'boolean' },
          nextPage: { type: 'integer', nullable: true },
          users: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                fullName: { type: 'string' },
                username: { type: 'string' },
                avatarUrl: { type: 'string', nullable: true }
              }
            }
          }
        },
        required: ['page', 'limit', 'count', 'total', 'hasMore', 'users']
      };

      spec.components.schemas.NotificationItem = {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          userId: { type: 'integer' },
          actorId: { type: 'integer' },
          type: { type: 'string', enum: ['follow', 'like', 'comment', 'quote', 'mention'] },
          entityType: { type: 'string', enum: ['user', 'post', 'comment'] },
          entityId: { type: 'integer' },
          metadata: { type: 'object', additionalProperties: true },
          status: { type: 'string', enum: ['unread', 'read'] },
          createdAt: { type: 'string', format: 'date-time' },
          readAt: { type: 'string', format: 'date-time', nullable: true }
        },
        required: ['id', 'userId', 'actorId', 'type', 'entityType', 'entityId', 'status', 'createdAt']
      };

      spec.components.schemas.NotificationListResponse = {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          count: { type: 'integer' },
          total: { type: 'integer' },
          hasMore: { type: 'boolean' },
          nextPage: { type: 'integer', nullable: true },
          notifications: { type: 'array', items: { $ref: '#/components/schemas/NotificationItem' } }
        },
        required: ['page', 'limit', 'count', 'total', 'hasMore', 'notifications']
      };

      spec.components.schemas.NotificationReadResponse = {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          notification: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              status: { type: 'string', enum: ['unread', 'read'] },
              readAt: { type: 'string', format: 'date-time', nullable: true }
            }
          }
        },
        example: { ok: true, notification: { id: 9, status: 'read', readAt: '2026-01-02T00:00:00.000Z' } }
      };

      // Follow endpoints
      spec.paths['/users/{id}/follow'] = {
        post: {
          tags: ['Users'],
          summary: 'Follow a user',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'User ID to follow' }],
          responses: {
            200: { description: 'Followed', content: { 'application/json': { schema: { $ref: '#/components/schemas/FollowActionResponse' } } } },
            400: { description: 'Invalid request' },
            404: { description: 'User not found' }
          }
        },
        delete: {
          tags: ['Users'],
          summary: 'Unfollow a user',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'User ID to unfollow' }],
          responses: {
            200: { description: 'Unfollowed', content: { 'application/json': { schema: { $ref: '#/components/schemas/FollowActionResponse' } } } }
          }
        }
      };

      spec.paths['/users/{id}/followers'] = {
        get: {
          tags: ['Users'],
          summary: 'List followers',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } }
          ],
          responses: {
            200: { description: 'Followers', content: { 'application/json': { schema: { $ref: '#/components/schemas/FollowListResponse' } } } },
            400: { description: 'Invalid user id' }
          }
        }
      };

      spec.paths['/users/{id}/following'] = {
        get: {
          tags: ['Users'],
          summary: 'List following',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } }
          ],
          responses: {
            200: { description: 'Following', content: { 'application/json': { schema: { $ref: '#/components/schemas/FollowListResponse' } } } },
            400: { description: 'Invalid user id' }
          }
        }
      };

      // Notification endpoints
      spec.paths['/notifications'] = {
        get: {
          tags: ['Users'],
          summary: 'List notifications for current user',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } }
          ],
          responses: {
            200: { description: 'Notifications', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationListResponse' } } } }
          }
        }
      };

      spec.paths['/notifications/{id}/read'] = {
        patch: {
          tags: ['Users'],
          summary: 'Mark a notification as read',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationReadResponse' } } } },
            404: { description: 'Notification not found' }
          }
        }
      };

      spec.paths['/notifications/read-all'] = {
        patch: {
          tags: ['Users'],
          summary: 'Mark all notifications as read',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationReadResponse' } } } }
          }
        }
      };

      // Public announcements listing (all roles)
      spec.paths['/announcements'] = {
        get: {
          tags: ['Posts'],
          summary: 'List announcements (public)',
          description: 'Returns non-archived announcements for any authenticated user.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 }, required: false },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 }, required: false }
          ],
          responses: {
            200: { description: 'Announcements', content: { 'application/json': { schema: { $ref: '#/components/schemas/AnnouncementListResponse' } } } }
          }
        }
      };

      fs.writeFileSync(outputFile, JSON.stringify(spec, null, 2));
      console.log('OpenAPI spec generated and normalized at', outputFile);
    } catch (e) {
      console.warn('Generated spec post-process skipped:', e?.message || e);
    }
  })
  .catch((err) => {
    console.error('Failed to generate OpenAPI spec:', err);
    process.exitCode = 1;
  });



