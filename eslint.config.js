// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'functions/lib/*', 'functions/node_modules/*', '.expo/*'],
  },
  {
    rules: {
      // React Compiler is not enabled (app.json experiments.reactCompiler = false);
      // resetting form state from loaded data in effects is intentional here.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
]);
