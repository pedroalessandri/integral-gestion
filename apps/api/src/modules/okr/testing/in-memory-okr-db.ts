/**
 * Base en memoria mínima (project, task, objective) para testear el recálculo de gestión y los services de
 * proyectos con la matemática REAL de `okr-domain` y sin mockear la cascada: el "tx" implementa solo las
 * operaciones de Prisma que usan `project-recompute`, `ProjectService` y `TaskService` (rama proyecto).
 * Soporta los filtros usados: igualdad, `{ not }`, `{ lt }`, `{ gt }` y `OR`.
 */
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

function matchesField(value: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    const c = cond as { not?: unknown; lt?: Date; gt?: Date };
    if ('not' in c) return value !== c.not;
    if ('lt' in c && c.lt !== undefined) return (value as Date) < c.lt;
    if ('gt' in c && c.gt !== undefined) return (value as Date) > c.gt;
  }
  return value === cond;
}

function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Where[]).some((w) => matches(row, w));
    return matchesField(row[key], cond);
  });
}

class Table {
  rows: Row[] = [];
  private seq = 0;

  constructor(private readonly prefix: string, private readonly defaults: () => Row) {}

  findMany = async (args?: { where?: Where; select?: unknown; include?: unknown }): Promise<Row[]> =>
    this.rows.filter((r) => matches(r, args?.where)).map((r) => ({ ...r }));

  findFirst = async (args?: { where?: Where }): Promise<Row | null> => {
    const row = this.rows.find((r) => matches(r, args?.where));
    return row ? { ...row } : null;
  };

  findFirstOrThrow = async (args?: { where?: Where }): Promise<Row> => {
    const row = await this.findFirst(args);
    if (!row) throw new Error(`${this.prefix}: not found`);
    return row;
  };

  create = async (args: { data: Row }): Promise<Row> => {
    const row: Row = { id: `${this.prefix}-${++this.seq}`, ...this.defaults(), ...args.data };
    this.rows.push(row);
    return { ...row };
  };

  update = async (args: { where: { id: string }; data: Row }): Promise<Row> => {
    const row = this.rows.find((r) => r['id'] === args.where.id);
    if (!row) throw new Error(`${this.prefix}: not found`);
    Object.assign(row, args.data);
    return { ...row };
  };

  insert(row: Row): Row {
    const full = { ...this.defaults(), ...row };
    this.rows.push(full);
    return full;
  }
}

export interface InMemoryOkrDb {
  project: Table;
  task: Table;
  objective: Table;
  /** Cliente tx de juguete con las operaciones soportadas. */
  tx: { project: Table; task: Table; objective: Table; $queryRaw: () => Promise<unknown[]> };
}

export function createInMemoryOkrDb(): InMemoryOkrDb {
  const now = new Date('2027-01-01T00:00:00.000Z');
  const project = new Table('proj', () => ({
    deletedAt: null,
    progressCachedBp: 0,
    progressMode: 'from_tasks',
    weightBp: null,
    description: null,
    ownerUserId: null,
    sourceObjectiveIndicatorId: null,
    createdAt: now,
    updatedAt: now,
  }));
  const task = new Table('task', () => ({
    deletedAt: null,
    progressBp: 0,
    weightBp: null,
    description: null,
    ownerUserId: null,
    createdAt: now,
    updatedAt: now,
  }));
  const objective = new Table('obj', () => ({
    deletedAt: null,
    progressCachedBp: 0,
    resultProgressCachedBp: 0,
    executionProgressCachedBp: 0,
  }));
  // `include: { _count: { select: { tasks } } }` sobre proyectos: cuenta las tareas vivas.
  const baseFindMany = project.findMany;
  project.findMany = async (args) => {
    const rows = await baseFindMany(args);
    if (!(args?.include as { _count?: unknown } | undefined)?._count) return rows;
    return rows.map((r) => ({
      ...r,
      _count: { tasks: task.rows.filter((t) => t['projectId'] === r['id'] && t['deletedAt'] === null).length },
    }));
  };
  return { project, task, objective, tx: { project, task, objective, $queryRaw: async () => [] } };
}
