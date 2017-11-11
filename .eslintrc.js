
module.exports = {
  extends: ['airbnb'],
  rules : {
    'no-underscore-dangle': 'off',
    semi: [2, 'never'],
    'no-unused-vars': [2, {'args': 'after-used', 'argsIgnorePattern': '^_'}],
    'no-unused-expressions': [2, { allowShortCircuit: true, allowTernary: true }],
    'no-param-reassign': [2, {'props': false}],
    'react/prop-types': [0],
  },
  globals: {
    require: true
  },
  plugins : []
}
