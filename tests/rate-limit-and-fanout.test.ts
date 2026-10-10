import express from 'express';
import request from 'supertest';
import { errorHandler } from '@mairie360/bffs-lib';
import {
  calendarDateRange, CALENDAR_WINDOW_HALF_DAYS, createBusinessReferencesRateLimiter, settleWithConcurrency,
} from '../src/routes/Messages/business_references';
import { authorizationFor, tokenFor } from './support/upstream-fixtures';

// MAIR-400: bounds of GET /business-references (rate limit, bounded fan-out, calendar window).

const savedEnv = { ...process.env };
afterEach(() => { process.env = { ...savedEnv }; });

/** An app limited like GET /business-references, with `BUSINESS_REFERENCES_RATE_LIMIT_MAX=max`. */
function limitedApp(max: number) {
  process.env.BUSINESS_REFERENCES_RATE_LIMIT_MAX = String(max);
  const app = express();
  app.get('/limited', createBusinessReferencesRateLimiter(), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler());
  return app;
}

describe('business references rate limiter', () => {
  test('answers 429 in the shared error envelope once a session exceeds its budget', async () => {
    const app = limitedApp(2);

    await request(app).get('/limited').set('Authorization', authorizationFor(7)).expect(200);
    await request(app).get('/limited').set('Authorization', authorizationFor(7)).expect(200);
    const limited = await request(app).get('/limited').set('Authorization', authorizationFor(7));

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: { code: 'TOO_MANY_REQUESTS', message: expect.any(String), details: [] } });
    expect(limited.headers['retry-after']).toBeDefined();
  });

  test('counts each session separately, even behind one shared IP', async () => {
    const app = limitedApp(1);

    await request(app).get('/limited').set('Authorization', authorizationFor(7)).expect(200);
    await request(app).get('/limited').set('Authorization', authorizationFor(8)).expect(200);
    await request(app).get('/limited').set('Authorization', authorizationFor(7)).expect(429);
  });

  test('keys on the session, never on the unverified JWT sub (MAIR-429)', async () => {
    const app = limitedApp(1);
    // Same `sub` claim, different tokens: a forged `sub` cannot use or exhaust another session's counter.
    const forged = `Bearer ${tokenFor(7).replace(/\.[^.]+$/, '.forged')}`;

    await request(app).get('/limited').set('Authorization', authorizationFor(7)).expect(200);
    await request(app).get('/limited').set('Authorization', forged).expect(200);
    await request(app).get('/limited').set('Authorization', forged).expect(429);
  });

  test('allows 30 requests per minute by default', async () => {
    const app = express();
    app.get('/limited', createBusinessReferencesRateLimiter(), (_req, res) => { res.json({}); });

    const responses = [];
    for (let index = 0; index < 31; index += 1) {
      responses.push(await request(app).get('/limited').set('Authorization', authorizationFor(7)));
    }

    expect(responses.slice(0, 30).every((response) => response.status === 200)).toBe(true);
    expect(responses[30].status).toBe(429);
    expect(responses[0].headers.ratelimit).toMatch(/r=29; t=60/);
  });

  test('is skipped when RATE_LIMIT_ENABLED=false', async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    const app = limitedApp(1);

    await request(app).get('/limited').expect(200);
    await request(app).get('/limited').expect(200);
  });
});

describe('business references fan-out', () => {
  test('never runs more than the given number of calls at once and keeps the result order', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await settleWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      if (value === 4) throw new Error('failed');
      return value * 10;
    });

    expect(peak).toBe(3);
    expect(results.map((result) => (result.status === 'fulfilled' ? result.value : 'rejected')))
      .toEqual([10, 20, 30, 'rejected', 50, 60, 70]);
  });

  test('asks BFF Calendar for a window of less than one year around the Paris day', () => {
    expect(calendarDateRange(new Date('2026-10-02T10:00:00Z'))).toEqual({ from: '2026-04-03', to: '2027-04-02' });
    expect(2 * CALENDAR_WINDOW_HALF_DAYS).toBeLessThan(365);
  });
});
