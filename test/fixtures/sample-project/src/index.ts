import React from "react";
import { add } from "@/utils/math";
import { greet } from "./lib/helper.js";

export function main(): string {
  return greet(`result:${add(2, 3)}:${React.version}`);
}
