import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
    {
        ignores: ['node_modules/', 'dist/', 'out/', 'coverage/', '.cache/'],
    },

    js.configs.recommended,

    {
        files: ['**/*.{ts,tsx}'],

        languageOptions: {
            parser: tsParser,
            globals: {
                ...globals.node,
                ...globals.browser,
            },
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },

        plugins: {
            '@typescript-eslint': tsPlugin,
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },

        rules: {
            ...tsPlugin.configs.recommended.rules,

            'no-unused-vars': 'off',

            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],

            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            'react-refresh/only-export-components': [
                'warn',
                {
                    allowConstantExport: true,
                },
            ],
        },
    },
];
