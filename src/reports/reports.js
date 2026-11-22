// "Profit Calculation": number of bills, revenue and profit over a period.

export const PERIODS = {
  all: { label: 'All time', days: null },
  week: { label: 'Past 1 week', days: 7 },
  month: { label: 'Past 1 month', days: 30 },
  year: { label: 'Past 1 year', days: 365 },
};

export async function salesSummary(db, periodKey) {
  const { days } = PERIODS[periodKey] ?? PERIODS.all;
  const { rows } = await db.query(
    `SELECT count(*)::int AS bill_count,
            round(coalesce(sum(total), 0), 2) AS revenue,
            round(coalesce(sum(profit), 0), 2) AS profit
     FROM sales
     WHERE $1::int IS NULL OR created_at >= now() - make_interval(days => $1::int)`,
    [days],
  );
  const [row] = rows;
  return { billCount: row.bill_count, revenue: row.revenue, profit: row.profit };
}
