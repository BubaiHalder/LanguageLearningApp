// Test-only loader: transpile pure TypeScript modules without loading React Native.
// Type safety is checked separately by tsc --noEmit.
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  module._compile(outputText, filename);
};
