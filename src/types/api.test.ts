import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const specPath = path.join(root, "docs", "openapi.json");

describe("OpenAPI 规范", () => {
  it("规范文件已生成", () => {
    expect(existsSync(specPath)).toBe(true);
  });

  it("包含必要字段与鉴权定义", () => {
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBeTruthy();
    expect(spec.components.securitySchemes.bearerAuth).toBeTruthy();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(30);
  });

  it("受保护接口都声明了 bearer 鉴权", () => {
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const guarded = [
      ["post", "/api/posts"],
      ["put", "/api/posts/{id}"],
      ["delete", "/api/posts/{id}"],
      ["get", "/api/notifications"],
      ["get", "/api/admin/reports"],
      ["get", "/api/my/draft"],
    ];
    for (const [method, p] of guarded) {
      const op = spec.paths[p]?.[method];
      expect(op, `${method} ${p} 缺失`).toBeTruthy();
      expect(op.security, `${method} ${p} 缺少 security`).toBeTruthy();
    }
  });

  it("路径参数都在 parameters 中声明", () => {
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    for (const [p, methods] of Object.entries(spec.paths) as any) {
      const placeholders = [...p.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      for (const [method, op] of Object.entries(methods) as any) {
        const declared = (op.parameters || []).filter((x: any) => x.in === "path").map((x: any) => x.name);
        for (const name of placeholders) {
          expect(declared, `${method} ${p} 缺少路径参数 ${name}`).toContain(name);
        }
      }
    }
  });

  it("$ref 指向的 schema 都存在", () => {
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const json = JSON.stringify(spec);
    const refs = [...json.matchAll(/"#\/components\/schemas\/(\w+)"/g)].map(m => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const name of refs) {
      expect(spec.components.schemas[name], `schema ${name} 不存在`).toBeTruthy();
    }
  });

  it("共享类型与规范 schema 一一对应", () => {
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const types = readFileSync(path.join(root, "src", "types", "api.ts"), "utf8");
    // 规范里定义的核心 schema，前端类型文件里应有对应 interface
    for (const name of ["Post", "PostList", "Comment", "User", "Album", "Notification", "UploadResult"]) {
      expect(spec.components.schemas[name], `规范缺少 ${name}`).toBeTruthy();
      expect(types, `共享类型缺少 ${name}`).toContain(`interface ${name}`);
    }
  });
});
