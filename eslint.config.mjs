import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "backend/**",
      "test_assets/**",
      "node_modules/**",
      "**/.venv/**",
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    files: ["desktop/**"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;

