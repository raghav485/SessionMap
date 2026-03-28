import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "src", "utils", "math.ts");
const source = fs.readFileSync(filePath, "utf8");
const updated = source.replace("return left + right;", "return left + right + 1;");
fs.writeFileSync(filePath, updated, "utf8");
process.stdout.write("math-updated\n");
