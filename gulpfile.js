let gulp = require('gulp'),
  { rollup } = require('rollup'),
  resolve = require('rollup-plugin-node-resolve'),
  babel = require('rollup-plugin-babel'),
  commonjs = require('rollup-plugin-commonjs');

gulp.task('default', function() {
  return rollup({
      input: './index.mjs',
      plugins: [
        resolve(),
        commonjs(),
        babel({
          exclude: 'node_modules/**' // only transpile our source code
        })
      ]
    })
    .then(bundle => bundle.write({
      file: './index.js',
      format: 'umd',
      name: 'MessagePortObservable',
      sourcemap: true
    }));
});
