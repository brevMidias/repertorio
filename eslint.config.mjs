import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'public/sw.js'],
  },
  // `eslint-config-next` já traz typescript-eslint, react-hooks, jsx-a11y e import.
  // As regras desses plugins precisam ser configuradas dentro do próprio preset,
  // então aqui ficam apenas regras do núcleo do ESLint.
  ...nextCoreWebVitals,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
]

export default config
