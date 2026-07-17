/**
 * 构建临时 CC Switch SQLite 夹具，镜像真实 schema（user_version=10）。
 * 仅供测试使用：写入内存/临时文件，用完删除。
 */
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * @param {object} opts
 * @param {number} [opts.schemaVersion=10]
 * @param {Array<object>} [opts.providers] app_type,name,is_current,in_failover_queue,category,settings_config(obj)
 * @param {Array<object>} [opts.proxies] app_type,proxy_enabled,listen_address,listen_port,auto_failover_enabled
 * @param {boolean} [opts.withProxyTable=true] 是否创建 proxy_config 表（旧版可能没有）
 * @returns {{ dbPath: string, cleanup: () => void }}
 */
export function buildCcSwitchDb(opts = {}) {
  const {
    schemaVersion = 10,
    providers = [],
    proxies = [],
    withProxyTable = true,
  } = opts;

  const dir = mkdtempSync(join(tmpdir(), "ag-ccswitch-"));
  const dbPath = join(dir, "cc-switch.db");
  const db = new DatabaseSync(dbPath);

  db.exec(`PRAGMA user_version = ${schemaVersion}`);
  db.exec(`
    CREATE TABLE providers (
      id INTEGER PRIMARY KEY,
      app_type TEXT,
      name TEXT,
      is_current INTEGER DEFAULT 0,
      in_failover_queue INTEGER DEFAULT 0,
      category TEXT,
      settings_config TEXT
    )
  `);
  const insP = db.prepare(
    "INSERT INTO providers (app_type,name,is_current,in_failover_queue,category,settings_config) VALUES (?,?,?,?,?,?)"
  );
  for (const p of providers) {
    insP.run(
      p.app_type,
      p.name,
      p.is_current ? 1 : 0,
      p.in_failover_queue ? 1 : 0,
      p.category ?? null,
      JSON.stringify(p.settings_config ?? {})
    );
  }

  if (withProxyTable) {
    db.exec(`
      CREATE TABLE proxy_config (
        app_type TEXT PRIMARY KEY,
        proxy_enabled INTEGER DEFAULT 0,
        listen_address TEXT,
        listen_port INTEGER,
        auto_failover_enabled INTEGER DEFAULT 0
      )
    `);
    const insX = db.prepare(
      "INSERT INTO proxy_config (app_type,proxy_enabled,listen_address,listen_port,auto_failover_enabled) VALUES (?,?,?,?,?)"
    );
    for (const x of proxies) {
      insX.run(
        x.app_type,
        x.proxy_enabled ? 1 : 0,
        x.listen_address ?? "127.0.0.1",
        x.listen_port ?? 15721,
        x.auto_failover_enabled ? 1 : 0
      );
    }
  }

  db.close();
  return {
    dbPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
