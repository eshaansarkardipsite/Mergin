import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { closeDb, resetDbForTests } from '../server/db/connection';
import { seedDatabase } from '../server/db/seed';

beforeEach(() => {
  seedDatabase(resetDbForTests());
});

afterEach(() => {
  closeDb();
});

const invoice = {
  customerName: 'Test Client',
  customerEmail: 'billing@client.example',
  issueDate: '2026-11-12',
  dueDate: '2026-12-12',
  taxRateBps: 0,
  discountMinor: 0,
  items: [{ description: 'Design', detail: '', quantityMilli: 1000, unitPriceMinor: 10_000 }],
};

async function signedInAgent() {
  const agent = request.agent(createApp());
  await agent.post('/api/auth/demo').expect(200);
  return agent;
}

describe('invoice customer email validation', () => {
  it('rejects an invalid customer email', async () => {
    const agent = await signedInAgent();
    const response = await agent.post('/api/invoices').send({ ...invoice, customerEmail: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.body.issues).toContainEqual({ path: 'customerEmail', message: expect.any(String) });
  });

  it('accepts a valid customer email', async () => {
    const agent = await signedInAgent();
    const response = await agent.post('/api/invoices').send(invoice);

    expect(response.status).toBe(201);
    expect(response.body.invoice.customerEmail).toBe(invoice.customerEmail);
  });
});
