import assert from "node:assert/strict";
import { test } from "node:test";

import { extractEeocrmRecords } from "./eeocrm-response.js";

test("extractEeocrmRecords accepts eeoCRM MCP result.records responses", () => {
  const records = extractEeocrmRecords({
    result: {
      totalSize: 117,
      records: [{ id: "lead-1" }, { id: "lead-2" }],
    },
  });

  assert.deepEqual(records, [{ id: "lead-1" }, { id: "lead-2" }]);
});

test("extractEeocrmRecords keeps older response shapes compatible", () => {
  assert.deepEqual(extractEeocrmRecords({ data: { records: [{ id: "a" }] } }), [{ id: "a" }]);
  assert.deepEqual(extractEeocrmRecords({ records: [{ id: "b" }] }), [{ id: "b" }]);
  assert.deepEqual(extractEeocrmRecords({ result: { records: null } }), []);
});
