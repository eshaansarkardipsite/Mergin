import { Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../auth';
import { getWorkspace } from '../db/repo';
import { parseBody } from '../http';
import { askCopilot } from '../services/copilot';
import { geminiConfigured } from '../config';

export const copilotRouter = Router();

export const SUGGESTED_QUESTIONS = [
  'Why did expenses increase this month?',
  'Which invoices are overdue?',
  'Can we afford an additional $800 expense?',
  'Which recurring payments should be reviewed?',
  'What was our revenue this quarter?',
  'What payments are expected next week?',
  'Which budgets are close to their limits?',
];

copilotRouter.get('/suggestions', (_req, res) => {
  res.json({ suggestions: SUGGESTED_QUESTIONS, liveModel: geminiConfigured() });
});

const askSchema = z.object({ question: z.string().trim().min(3).max(500) });

copilotRouter.post('/ask', async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(askSchema, req, res);
  if (!input) return;
  const workspace = getWorkspace(user.workspaceId);
  const answer = await askCopilot(user.workspaceId, workspace.name, input.question);
  res.json({ answer, question: input.question });
});
