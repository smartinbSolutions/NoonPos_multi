export const getDefaultDateRange = () => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const toISODate = (d) => d.toISOString().slice(0, 10);
  return {
    startDate: toISODate(startOfYear),
    endDate: toISODate(now),
  };
};
