import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dagPath = resolve('apps/airflow/dags/clawdata_dynamic.py');
const dagContent = readFileSync(dagPath, 'utf-8');

describe('Dynamic DAGs from dbt manifest', () => {
  it('clawdata_dynamic.py exists', () => {
    expect(existsSync(dagPath)).toBe(true);
  });

  it('loads the manifest JSON file', () => {
    expect(dagContent).toContain('json.load');
    expect(dagContent).toContain('manifest.json');
  });

  it('filters for model nodes only', () => {
    expect(dagContent).toContain('model.');
    expect(dagContent).toMatch(/key\.startswith\(["']model\./);
  });

  it('creates one BashOperator per model', () => {
    expect(dagContent).toContain('BashOperator(');
    expect(dagContent).toContain('dbt_run_{model_name}');
  });

  it('runs clawdata dbt run --models per model', () => {
    expect(dagContent).toContain('clawdata dbt run --models {model_name}');
  });

  it('wires upstream dependencies from depends_on.nodes', () => {
    expect(dagContent).toContain('depends_on');
    expect(dagContent).toContain('tasks[dep_key] >> tasks[key]');
  });

  it('sets dag_id to clawdata_dynamic', () => {
    expect(dagContent).toContain('dag_id="clawdata_dynamic"');
  });

  it('uses @daily schedule', () => {
    expect(dagContent).toContain('schedule="@daily"');
  });

  it('has dynamic tag', () => {
    expect(dagContent).toContain('"dynamic"');
  });

  it('handles missing manifest gracefully', () => {
    expect(dagContent).toContain('FileNotFoundError');
    expect(dagContent).toContain('return {}');
  });
});
