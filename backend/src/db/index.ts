import { openDb, migrate } from "./migrate";
import { ScalarAiDb } from "./repository";

const db = openDb();
migrate(db);
export const scalarAiDb = new ScalarAiDb(db);
