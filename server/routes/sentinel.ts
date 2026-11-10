import { Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../auth';
import {
  addAuditEvent,
  decideSentinelReview,
  getPattern,
  getSentinelReview,
  getTransaction,
  listPatterns,
  listSentinelReviews,
  refreshSentinelPatterns,
} from '../db/repo';
import { notFound, parseBody } from '../http';
import { estimatedMonthlyMinor } from '../../shared/sentinel';

export const sentinelRouter = Router();

function summary(workspaceId: string) {
  const reviews = listSentinelReviews(workspaceId);
  const patterns = listPatterns(workspaceId);
  return {
    reviews,
    patterns,
    counts: {
      open: reviews.filter((r) => r.status === 'open').length,
      attention: reviews.filter((r) => r.status === 'open' && r.severity === 'attention').length,
      decided: reviews.filter((r) => r.status !== 'open').length,
    },
    estimatedMonthlyMinor: patterns.reduce((sum, p) => sum + estimatedMonthlyMinor(p), 0),
    usageDataConnected: false,
    minimumObservations: 3,
  };
}

sentinelRouter.get('/', (req, res) => {
  const user = currentUser(req);
  res.json(summary(user.workspaceId));
});

sentinelRouter.post('/scan', (req, res) => {
  const user = currentUser(req);
  const added = refreshSentinelPatterns(user.workspaceId);
  addAuditEvent(user.workspaceId, 'sentinel.scan', user.name, `Scanned transaction evidence; ${added} new signal${added === 1 ? '' : 's'}`);
  res.json({ added, ...summary(user.workspaceId) });
});

sentinelRouter.get('/:id', (req, res) => {
  const user = currentUser(req);
  const review = getSentinelReview(user.workspaceId, String(req.params.id));
  if (!review) return notFound(res, 'Sentinel review');
  const pattern = getPattern(user.workspaceId, review.patternId);
  const evidence = (pattern?.transactionIds ?? [])
    .map((transactionId) => getTransaction(user.workspaceId, transactionId))
    .filter((tx): tx is NonNullable<typeof tx> => Boolean(tx))
    .sort((a, b) => a.date.localeCompare(b.date));
  res.json({
    review,
    pattern,
    evidence,
    relatedReviews: listSentinelReviews(user.workspaceId).filter(
      (r) => r.id !== review.id && r.merchant === review.merchant,
    ),
    usageDataConnected: false,
  });
});

const decisionSchema = z.object({
  status: z.enum(['kept', 'remind', 'follow-up', 'dismissed']),
  note: z.string().max(500).optional().default(''),
});

sentinelRouter.post('/:id/decision', (req, res) => {
  const user = currentUser(req);
  const input = parseBody(decisionSchema, req, res);
  if (!input) return;
  const review = decideSentinelReview(user.workspaceId, String(req.params.id), input.status, input.note, user.name);
  if (!review) return notFound(res, 'Sentinel review');
  res.json({ review });
});
