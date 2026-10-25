const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");

// Compile the real server modules, substituting only database/network boundaries.
function loader(mocks) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const code = ts
      .transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      })
      .outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
    const native = createRequire(filename);
    const req = (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith("@/")) return load(path.resolve("src", id.slice(2)) + ".ts");
      if (id.startsWith("."))
        return load(path.resolve(path.dirname(filename), id.replace(/\.js$/, "")) + ".ts");
      return native(id);
    };
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(
      req,
      module,
      module.exports,
    );
    return module.exports;
  }
  return load;
}

function database(tables) {
  return {
    from(table) {
      tables[table] ??= [];
      const filters = [];
      let action = "select",
        value,
        single = false;
      const q = {
        select() {
          return q;
        },
        eq(key, val) {
          filters.push((r) => r[key] === val);
          return q;
        },
        neq(key, val) {
          filters.push((r) => r[key] !== val);
          return q;
        },
        in(key, values) {
          filters.push((r) => values.includes(r[key]));
          return q;
        },
        gte(key, val) {
          filters.push((r) => r[key] >= val);
          return q;
        },
        contains(key, val) {
          filters.push((r) => Object.entries(val).every(([k, v]) => r[key]?.[k] === v));
          return q;
        },
        is(key, val) {
          filters.push((r) => (r[key] ?? null) === val);
          return q;
        },
        or(expression) {
          const parts = expression.split(",").map((p) => p.match(/^([a-z_]+)\.(is|lt|eq)\.(.+)$/));
          filters.push((r) =>
            parts.some(
              (p) =>
                p &&
                (p[2] === "is"
                  ? (r[p[1]] ?? null) === null
                  : p[2] === "eq"
                    ? r[p[1]] === p[3]
                    : r[p[1]] != null && r[p[1]] < p[3]),
            ),
          );
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return q;
        },
        single() {
          single = true;
          return q;
        },
        maybeSingle() {
          single = true;
          return q;
        },
        insert(v) {
          action = "insert";
          value = v;
          return q;
        },
        update(v) {
          action = "update";
          value = v;
          return q;
        },
        delete() {
          action = "delete";
          return q;
        },
        then(resolve, reject) {
          try {
            let rows = tables[table].filter((r) => filters.every((f) => f(r)));
            if (action === "insert") {
              rows = (Array.isArray(value) ? value : [value]).map((r) => ({
                id: crypto.randomUUID(),
                created_at: new Date().toISOString(),
                ...(table === "workflow_runs" ? { status: "running" } : {}),
                ...r,
              }));
              if (
                table === "runtime_nonces" &&
                rows.some((r) => tables[table].some((old) => old.nonce === r.nonce))
              )
                return Promise.resolve({ data: null, error: { code: "23505" } }).then(
                  resolve,
                  reject,
                );
              tables[table].push(...rows);
            }
            if (action === "delete") tables[table] = tables[table].filter((r) => !rows.includes(r));
            if (action === "update") rows.forEach((r) => Object.assign(r, value));
            return Promise.resolve({
              data: structuredClone(single ? (rows[0] ?? null) : rows),
              error: null,
            }).then(resolve, reject);
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        },
      };
      return q;
    },
  };
}

module.exports = { loader, database };
