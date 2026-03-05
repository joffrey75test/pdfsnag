export type AuthClaims = {
  user_id: string;
  company_id: string;
  roles: string[];
  exp: number;
};

export type AppBindings = {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  JWT_SECRET: string;
};

export type AppVariables = {
  auth: AuthClaims;
};

export type AppEnv = {
  Bindings: AppBindings;
  Variables: AppVariables;
};

export async function checkDbHealth(db: D1Database) {
  return db.prepare("SELECT 1 as ok").first();
}
