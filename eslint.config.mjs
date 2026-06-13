import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default [
  {
    ignores: [
      ".next/**",
      ".next-dev/**",
      ".next.bak-*/**",
      "node_modules/**",
    ],
  },
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
