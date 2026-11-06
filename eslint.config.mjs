import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const config = [
  ...next,
  ...nextTs,
  prettier,
  // Generated images come from arbitrary storage URLs, so next/image does not fit.
  { rules: { "@next/next/no-img-element": "off" } },
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
];

export default config;
