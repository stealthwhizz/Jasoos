import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

export default [
  ...next,
  ...nextTs,
  prettier,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
];
