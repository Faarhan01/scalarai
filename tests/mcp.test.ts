import { describe, it, expect } from "vitest";
import { isReadOnlySql } from "../backend/src/mcp_server";

describe("isReadOnlySql", () => {
  it("allows simple SELECT", () => {
    expect(isReadOnlySql("SELECT * FROM trades")).toBe(true);
  });

  it("allows SELECT with WHERE and ORDER BY", () => {
    expect(isReadOnlySql("SELECT id FROM trades WHERE status = ? ORDER BY time DESC LIMIT 10")).toBe(true);
  });

  it("blocks DELETE", () => {
    expect(isReadOnlySql("DELETE FROM trades")).toBe(false);
  });

  it("blocks DROP", () => {
    expect(isReadOnlySql("DROP TABLE trades")).toBe(false);
  });

  it("blocks UPDATE", () => {
    expect(isReadOnlySql("UPDATE settings SET lot_size = 1")).toBe(false);
  });

  it("blocks INSERT", () => {
    expect(isReadOnlySql("INSERT INTO trades VALUES (1)")).toBe(false);
  });

  it("blocks ALTER", () => {
    expect(isReadOnlySql("ALTER TABLE trades ADD COLUMN x")).toBe(false);
  });

  it("blocks multi-statement via semicolon", () => {
    expect(isReadOnlySql("SELECT * FROM trades; DELETE FROM logs")).toBe(false);
  });

  it("blocks SQL comment injection", () => {
    expect(isReadOnlySql("SELECT * FROM trades -- DELETE FROM logs")).toBe(false);
  });

  it("blocks block comment injection", () => {
    expect(isReadOnlySql("SELECT * FROM trades /* DELETE FROM logs */")).toBe(false);
  });

  it("blocks PRAGMA", () => {
    expect(isReadOnlySql("PRAGMA journal_mode = WAL")).toBe(false);
  });

  it("blocks ATTACH", () => {
    expect(isReadOnlySql("ATTACH DATABASE 'x' AS y")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isReadOnlySql("delete from trades")).toBe(false);
    expect(isReadOnlySql("SeLeCt * FROM trades")).toBe(true);
  });

  it("trims leading whitespace", () => {
    expect(isReadOnlySql("  SELECT * FROM trades")).toBe(true);
    expect(isReadOnlySql("\nDELETE FROM trades")).toBe(false);
  });

  it("collapses internal whitespace", () => {
    expect(isReadOnlySql("SELECT * FROM trades WHERE id = 1 AND x = 2")).toBe(true);
  });
});
