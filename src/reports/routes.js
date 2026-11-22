import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import { PERIODS, salesSummary } from './reports.js';

export function reportsRouter({ pool }) {
  const router = Router();

  router.get('/reports/profit', requireRole('admin'), async (req, res) => {
    const period = Object.hasOwn(PERIODS, req.query.period) ? req.query.period : 'all';
    const summary = await salesSummary(pool, period);
    res.render('reports/profit', { title: 'Profit Calculation', periods: PERIODS, period, summary });
  });

  return router;
}
