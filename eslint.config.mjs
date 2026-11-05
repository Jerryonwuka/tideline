import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import prettier from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Vendor SDKs may only be imported inside src/server/integrations (CLAUDE.md rule 5).
const VENDOR_SDK_PATTERNS = [
  "paystack*",
  "@paystack/*",
  "flutterwave*",
  "@flutterwave/*",
  "stripe",
  "@stripe/*",
  "openai",
  "@anthropic-ai/*",
  "@google-cloud/*",
  "@google/genai",
  "@aws-sdk/*",
  "twilio",
  "termii*",
  "whatsapp*",
  "@sentry/*",
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  prettier,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: VENDOR_SDK_PATTERNS,
              message: "Vendor SDKs belong behind an interface in src/server/integrations.",
            },
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // The adapters' own unit tests construct them directly; business code goes through the interface.
    files: [
      "src/server/integrations/**",
      "sentry.*.config.ts",
      "src/instrumentation*.ts",
      "tests/unit/payment-providers.test.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-build/**",
      "public/sw.js",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      "supabase/functions/**",
    ],
  },
];

export default eslintConfig;
