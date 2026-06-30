import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/', 'pages/app.js', 'pages/vendor/', 'node_modules/', 'demo/', 'coverage/'],
  },
  ...tseslint.configs.recommended,
)
