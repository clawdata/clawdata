import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dagContent = readFileSync(resolve('apps/airflow/dags/clawdata_etl.py'), 'utf-8');

describe('Environment-aware scheduling', () => {
  it('reads CLAWDATA_ENV from environment', () => {
    expect(dagContent).toContain('CLAWDATA_ENV');
    expect(dagContent).toContain('os.environ.get');
  });

  it('defaults to "dev" when env var is not set', () => {
    expect(dagContent).toMatch(/os\.environ\.get\(["']CLAWDATA_ENV["'],\s*["']dev["']\)/);
  });

  it('sets schedule=None for dev (manual trigger)', () => {
    expect(dagContent).toContain('DAG_SCHEDULE = None');
  });

  it('sets schedule="@daily" for prod', () => {
    expect(dagContent).toContain('DAG_SCHEDULE = "@daily"');
  });

  it('uses DAG_SCHEDULE in the DAG definition', () => {
    expect(dagContent).toContain('schedule=DAG_SCHEDULE');
  });

  it('configures fewer retries for dev', () => {
    expect(dagContent).toContain('DAG_RETRIES = 0');
  });

  it('configures more retries for prod', () => {
    expect(dagContent).toContain('DAG_RETRIES = 2');
  });

  it('includes environment in tags', () => {
    expect(dagContent).toContain('ENV]');
  });
});
