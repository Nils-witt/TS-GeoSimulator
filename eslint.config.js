import globals from "globals";
import tseslint from "typescript-eslint";
import {defineConfig} from "eslint/config";
import js from '@eslint/js'

export default defineConfig([
    {ignores: ['dist', 'vite.config.ts', 'node_modules']},
    {
        files: ["src/**/*.{ts}"],
        languageOptions: {globals: globals.browser},
        extends: [
            js.configs.recommended,
        ],
        rules: {
            // 'no-console': 'warn'
            'semi': ['error', 'always'],
            'quotes': ['error', 'single'],
            'indent': ['error', 4],
        }
    },
    tseslint.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
        },
        files: [
            "src/**/*.{ts}",
        ]
    },
    tseslint.configs.stylistic
]);