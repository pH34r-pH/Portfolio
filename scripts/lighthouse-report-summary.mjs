export function categoryScores(categories = {}) {
  const result = {};
  for (const [key, category] of Object.entries(categories)) result[key] = category.score;
  return result;
}

export function numericMetrics(audits = {}, metricNames = []) {
  const result = {};
  for (const [key, audit] of Object.entries(audits)) {
    if (audit?.numericValue !== undefined && metricNames.includes(key)) {
      result[key] = { value: audit.numericValue, unit: audit.numericUnit };
    }
  }
  return result;
}

export function resourceSummaryRows(resources = []) {
  return resources.map((resource) => ({
    resourceType: resource.resourceType,
    label: resource.label,
    transferSize: resource.transferSize,
    resourceSize: resource.resourceSize,
    requestCount: resource.requestCount,
  }));
}
