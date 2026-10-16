import type Database from 'better-sqlite3';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import type { MockInstance } from 'vitest';
import type { LlmProvider } from '../src/providers/llm-provider';
import { bootApp, CookieJar, E2eApp, login } from './setup';

describe('Ask', () => {
  let e2e: E2eApp;
  let cwd: string;
  const jars: Record<string, CookieJar> = {};
  let visible: string;
  let hidden: string;
  let anthropicAsk: MockInstance<LlmProvider['ask']>;
  let mistralAsk: MockInstance<LlmProvider['ask']>;
  let selection: MockInstance;
  let anthropic: LlmProvider;
  let db: Database.Database;

  const ask = (profile: string | null, body: Record<string, unknown>) => {
    const req = request(e2e.server).post('/ask').set('Origin', e2e.origin);
    if (profile) req.set('Cookie', jars[profile].header());
    return req.send(body);
  };

  async function create(classes: string[], model = 'anthropic') {
    const teacher = jars.teacher.header();
    const res = await request(e2e.server)
      .post('/context')
      .set('Cookie', teacher)
      .set('Origin', e2e.origin)
      .send({ title: 'Cours', model, classes })
      .expect(201);
    await request(e2e.server)
      .patch(`/context/${res.body.name}`)
      .set('Cookie', teacher)
      .set('Origin', e2e.origin)
      .send({ published: true })
      .expect(200);
    return res.body.name as string;
  }

  function writeDocuments(name: string, files: Record<string, string>) {
    const dir = join(cwd, 'data', 'contexts', name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const [file, content] of Object.entries(files)) {
      writeFileSync(join(dir, file), content);
    }
    writeFileSync(
      join(dir, 'index.json'),
      JSON.stringify({
        name,
        description: '',
        files: Object.keys(files).map((file) => ({
          name: file,
          description: file,
          size: 1,
        })),
        links: [],
        queries: [],
      }),
    );
  }

  const queries = (name: string) =>
    JSON.parse(
      readFileSync(join(cwd, 'data', 'contexts', name, 'index.json'), 'utf-8'),
    ).queries;

  beforeAll(async () => {
    cwd = mkdtempSync(join(tmpdir(), 'ask-e2e-'));
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    e2e = await bootApp({
      ENT_ALLOWED_MODELS: 'anthropic,mistral',
      ANTHROPIC_API_KEY: 'test',
      MISTRAL_API_KEY: 'test',
      ASK_DAILY_LIMITS: 'Student:100,Parent:2',
    });

    // Same module instances as the app: `bootApp` reset the registry
    const { ProviderRegistry } =
      await import('../src/providers/provider-registry.service');
    const registry = e2e.app.get(ProviderRegistry);
    anthropic = registry.get('anthropic');
    const { DATABASE } = await import('../src/db/db.module');
    db = e2e.app.get<Database.Database>(DATABASE);
    const mistral = registry.get('mistral');
    anthropicAsk = vi.spyOn(anthropic, 'ask');
    mistralAsk = vi.spyOn(mistral, 'ask');
    vi.spyOn(anthropic, 'stream').mockImplementation(
      async function* (_message, sessionId) {
        yield { type: 'text', text: 'Bon' };
        yield { type: 'text', text: 'jour' };
        yield {
          type: 'final',
          content: 'Bonjour',
          sessionId,
          usage: { input_tokens: 1, output_tokens: 1 },
          cost: { input_cost: 0, output_cost: 0, total_cost: 0 },
        };
      },
    );
    selection = vi
      .spyOn(
        mistral as unknown as { processMessageWithModel: () => unknown },
        'processMessageWithModel',
      )
      .mockResolvedValue({ content: '[3]' });

    for (const profile of ['teacher', 'student', 'parent']) {
      jars[profile] = (await login(e2e.server, profile)).jar;
    }
    visible = await create(['3A']);
    hidden = await create(['4B']);
  });

  beforeEach(() => {
    anthropicAsk
      .mockReset()
      .mockImplementation(async (_message, sessionId) => ({
        content: 'Bonjour',
        sessionId,
        usage: { input_tokens: 1, output_tokens: 1 },
      }));
    mistralAsk.mockReset();
    selection.mockClear();
  });

  afterAll(async () => {
    await e2e.app.close();
    vi.restoreAllMocks();
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns 401 without a session', async () => {
    await ask(null, { context: visible, message: 'hi' }).expect(401);
  });

  it.each([
    ['hidden from the caller', () => hidden],
    ['unknown', () => 'hdf-nope'],
  ])('returns 404 for an assistant %s', async (_, name) => {
    await ask('student', { context: name(), message: 'hi' }).expect(404);
    expect(anthropicAsk).not.toHaveBeenCalled();
  });

  it('returns 400 without a context', async () => {
    await ask('student', { message: 'hi' }).expect(400);
  });

  it('answers with the assistant model', async () => {
    const res = await ask('student', {
      context: visible,
      message: 'hi',
      model: 'mistral',
    }).expect(201);

    expect(res.body.output).toBe('Bonjour');
    expect(anthropicAsk).toHaveBeenCalledTimes(1);
    expect(mistralAsk).not.toHaveBeenCalled();
  });

  it('streams an answer', async () => {
    const res = await ask('student', {
      context: visible,
      message: 'hi',
      stream: true,
    })
      .buffer(true)
      .parse((r, done) => {
        let text = '';
        r.on('data', (chunk: Buffer) => (text += chunk.toString()));
        r.on('end', () => done(null, text));
      })
      .expect(201)
      .expect('Content-Type', /text\/event-stream/);

    const events = (res.body as string)
      .split('\n\n')
      .filter((frame) => frame.startsWith('event:'))
      .map((frame) => frame.split('\n')[0].slice('event: '.length));
    expect(events).toEqual(['chunk', 'chunk', 'done']);
  });

  it('ignores a client-supplied sessionId', async () => {
    await ask('student', {
      context: visible,
      message: 'hi',
      sessionId: 'someone-else',
    }).expect(201);

    const [, sessionId] = anthropicAsk.mock.calls[0];
    expect(sessionId).not.toBe('someone-else');
  });

  it('keeps one session per user and assistant', async () => {
    await ask('student', { context: visible, message: 'hi' }).expect(201);
    await ask('student', { context: visible, message: 'again' }).expect(201);
    await ask('teacher', { context: visible, message: 'hi' }).expect(201);

    const [student, again, teacher] = anthropicAsk.mock.calls.map(
      ([, sessionId]) => sessionId,
    );
    expect(again).toBe(student);
    expect(teacher).not.toBe(student);
  });

  describe('DELETE /ask/conversation/:context', () => {
    const reset = (profile: string | null, name: string) => {
      const req = request(e2e.server)
        .delete(`/ask/conversation/${name}`)
        .set('Origin', e2e.origin);
      if (profile) req.set('Cookie', jars[profile].header());
      return req;
    };

    it('returns 401 without a session', async () => {
      await reset(null, visible).expect(401);
    });

    it('returns 404 for a hidden assistant', async () => {
      await reset('student', hidden).expect(404);
    });

    it('starts a new conversation for the caller only', async () => {
      await ask('student', { context: visible, message: 'hi' }).expect(201);
      await ask('teacher', { context: visible, message: 'hi' }).expect(201);
      await reset('student', visible).expect(204);
      await ask('student', { context: visible, message: 'hi' }).expect(201);
      await ask('teacher', { context: visible, message: 'hi' }).expect(201);

      const [student, teacher, studentAfter, teacherAfter] =
        anthropicAsk.mock.calls.map(([, sessionId]) => sessionId);
      expect(studentAfter).not.toBe(student);
      expect(teacherAfter).toBe(teacher);
    });
  });

  it('always sends instruction-file.md', async () => {
    writeDocuments(visible, {
      'instruction-file.md': 'Réponds en français.',
      'chapitre-1.md': 'Les atomes.',
      'chapitre-2.md': 'Les molécules.',
    });

    const res = await ask('student', {
      context: visible,
      message: 'molécules ?',
    }).expect(201);

    expect(selection).toHaveBeenCalledTimes(1);
    expect(res.body.rag.selectedFiles).toEqual([
      'instruction-file.md',
      'chapitre-2.md',
    ]);
    const [, , systemPrompt] = anthropicAsk.mock.calls[0];
    expect(systemPrompt).toContain('Réponds en français.');
    expect(systemPrompt).toContain('Les molécules.');
    expect(systemPrompt).not.toContain('Les atomes.');
  });

  it('logs queries without the message', async () => {
    writeDocuments(visible, { 'instruction-file.md': 'Sois bref.' });

    await ask('student', { context: visible, message: 'secret' }).expect(201);

    expect(queries(visible)).toEqual([
      {
        timestamp: expect.any(String),
        origin: 'anon',
        contextFilesUsed: ['instruction-file.md'],
      },
    ]);
  });

  describe('history and usage', () => {
    let fetchSpy: MockInstance;

    const sessionOf = (profile: string, name: string) =>
      db
        .prepare(
          'SELECT session_id FROM conversations WHERE user_id = ? AND assistant = ?',
        )
        .pluck()
        .get(profile, name) as string;
    const count = (table: string, sessionId: string) =>
      db
        .prepare(`SELECT count(*) FROM ${table} WHERE session_id = ?`)
        .pluck()
        .get(sessionId);

    beforeEach(() => {
      // Through the real provider, so the turn is saved; only the model call is faked
      anthropicAsk.mockImplementation((message, sessionId, systemPrompt) =>
        (
          anthropic as unknown as { processMessage: LlmProvider['ask'] }
        ).processMessage(message, sessionId, systemPrompt),
      );
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        Response.json({
          content: [{ type: 'text', text: 'Bonjour' }],
          usage: { input_tokens: 1, output_tokens: 1 },
          stop_reason: 'end_turn',
        }),
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('keeps every message of concurrent asks', async () => {
      const name = await create(['3A']);

      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          ask('student', { context: name, message: `q${i}` }).expect(201),
        ),
      );

      const sessionId = sessionOf('mock-student-0001', name);
      expect(count('messages', sessionId)).toBe(10);
      expect(count('usage', sessionId)).toBe(5);
    });

    it('deletes the messages with the assistant, keeping the cost', async () => {
      const name = await create(['3A']);
      await ask('student', { context: name, message: 'hi' }).expect(201);
      const sessionId = sessionOf('mock-student-0001', name);
      expect(count('messages', sessionId)).toBe(2);

      await request(e2e.server)
        .delete(`/context/${name}`)
        .set('Cookie', jars.teacher.header())
        .set('Origin', e2e.origin)
        .expect(204);

      expect(count('messages', sessionId)).toBe(0);
      expect(count('usage', sessionId)).toBe(0);
      expect(
        db
          .prepare('SELECT count(*) FROM usage WHERE session_id IS NULL')
          .pluck()
          .get(),
      ).toBeGreaterThan(0);
    });

    it('writes no JSON store', async () => {
      await ask('student', { context: visible, message: 'hi' }).expect(201);

      expect(existsSync(join(cwd, 'data', 'chat-history.json'))).toBe(false);
      expect(existsSync(join(cwd, 'data', 'costs.json'))).toBe(false);
    });
  });

  it('returns 429 once the daily limit is reached', async () => {
    const school = await create([]);
    for (let i = 0; i < 2; i++) {
      await ask('parent', { context: school, message: 'hi' }).expect(201);
    }

    const res = await ask('parent', { context: school, message: 'hi' })
      .expect(429)
      .expect('Retry-After', /^\d+$/);
    expect(res.body.message).toBe(
      'Daily limit of 2 questions reached. It resets at midnight, Paris time.',
    );
    expect(anthropicAsk).toHaveBeenCalledTimes(2);
    await ask('student', { context: school, message: 'hi' }).expect(201);
  });

  it('does not count a refused question', async () => {
    const counts = () =>
      db.prepare('SELECT sum(count) FROM ask_quota').pluck().get();
    const before = counts();
    await ask('student', { context: hidden, message: 'hi' }).expect(404);
    expect(counts()).toBe(before);
  });

  it('returns 400 when the assistant model is no longer allowed', async () => {
    db.prepare('UPDATE assistants SET model = ? WHERE name = ?').run(
      'openai',
      visible,
    );

    await ask('student', { context: visible, message: 'hi' }).expect(400);
    expect(anthropicAsk).not.toHaveBeenCalled();
  });
});
