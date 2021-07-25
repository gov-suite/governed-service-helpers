import * as safety from "https://denopkg.com/shah/ts-safety@v1.0.0/mod.ts";

export interface Expected {
  readonly text: string;
  readonly numeric: number;
}

export const isExpected = safety.typeGuard<Expected>("text", "numeric");

export const instance: Expected = {
  text: "text value",
  numeric: 45,
};

export default instance;
