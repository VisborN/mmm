
import eslint from "@eslint/js";
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
    // Base ESLint recommended rules
    eslint.configs.recommended,

    // TypeScript recommended rules
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                warnOnUnsupportedTypeScriptVersion: false,
                sourceType: "module",
                ecmaVersion: "latest",
            },
        },
    },

    // Your custom overrides
    {
        files: ['web_src/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/explicit-function-return-type': 'warn'
        }
    },

    // Ignore build artifacts and public folder
    {
        ignores: ['src/**/*', 'cmd/**/*', '.vscode/**/*', 'public/**/*', 'node_modules/**/*', 'esbuild.mjs']
    }
);