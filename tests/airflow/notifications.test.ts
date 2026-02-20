import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dagContent = readFileSync(resolve('apps/airflow/dags/clawdata_etl.py'), 'utf-8');

describe('Airflow failure notifications', () => {
  it('defines on_failure_callback function', () => {
    expect(dagContent).toContain('def on_failure_callback(context)');
  });

  it('callback logs an error with task details', () => {
    expect(dagContent).toContain('logger.error(message)');
  });

  it('callback extracts dag_id, task_id, and exception', () => {
    expect(dagContent).toContain('dag_id');
    expect(dagContent).toContain('task_id');
    expect(dagContent).toContain('exception');
  });

  it('registers callback in default_args', () => {
    expect(dagContent).toContain('"on_failure_callback": on_failure_callback');
  });

  it('imports logging module', () => {
    expect(dagContent).toContain('import logging');
  });

  it('includes placeholder for Slack/email extension', () => {
    expect(dagContent).toMatch(/slack|email|SMTP|webhook/i);
  });
});
