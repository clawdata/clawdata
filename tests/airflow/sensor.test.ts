import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dagContent = readFileSync(resolve('apps/airflow/dags/clawdata_etl.py'), 'utf-8');

describe('Airflow FileSensor', () => {
  it('imports FileSensor from airflow.sensors.filesystem', () => {
    expect(dagContent).toContain('from airflow.sensors.filesystem import FileSensor');
  });

  it('defines wait_for_data task', () => {
    expect(dagContent).toContain('wait_for_data = FileSensor(');
  });

  it('sets task_id to "wait_for_data"', () => {
    expect(dagContent).toMatch(/task_id\s*=\s*["']wait_for_data["']/);
  });

  it('monitors data/sample/ directory', () => {
    expect(dagContent).toMatch(/filepath\s*=\s*["']data\/sample\/["']/);
  });

  it('uses poke mode', () => {
    expect(dagContent).toMatch(/mode\s*=\s*["']poke["']/);
  });

  it('sets a poke_interval', () => {
    expect(dagContent).toMatch(/poke_interval\s*=\s*\d+/);
  });

  it('sets a timeout', () => {
    expect(dagContent).toMatch(/timeout\s*=\s*\d+/);
  });

  it('sensor runs before the ingest group', () => {
    expect(dagContent).toContain('wait_for_data >> ingest_group');
  });
});
