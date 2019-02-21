"use strict";

function _templateObject2() {
  var data = _taggedTemplateLiteralLoose(["", ""]);

  _templateObject2 = function _templateObject2() {
    return data;
  };

  return data;
}

function _templateObject() {
  var data = _taggedTemplateLiteralLoose(["", ""]);

  _templateObject = function _templateObject() {
    return data;
  };

  return data;
}

function _taggedTemplateLiteralLoose(strings, raw) { if (!raw) { raw = strings.slice(0); } strings.raw = raw; return strings; }

var generator = require('@babel/generator').default;

var babel = require('@babel/core');

var Module = require('./module');

var resolve = function resolve(path, t, requirements) {
  var binding = path.scope.getBinding(path.node.name);

  if (path.isReferenced() && binding && binding.kind !== 'param' && !requirements.some(function (req) {
    return req.path === binding.path;
  })) {
    var result;

    switch (binding.kind) {
      case 'module':
        if (t.isImportSpecifier(binding.path)) {
          result = t.importDeclaration([binding.path.node], binding.path.parentPath.node.source);
        } else {
          result = binding.path.parentPath.node;
        }

        break;

      case 'const':
      case 'let':
      case 'var':
        {
          result = t.variableDeclaration(binding.kind, [binding.path.node]);
          break;
        }

      default:
        result = binding.path.node;
        break;
    }

    var loc = binding.path.node.loc;
    requirements.push({
      result: result,
      path: binding.path,
      start: loc.start,
      end: loc.end
    });
    binding.path.traverse({
      Identifier: function Identifier(p) {
        resolve(p, t, requirements);
      }
    });
  }
};

module.exports = function evaluate(path, t, filename, transformer, options) {
  var requirements = [];

  if (t.isIdentifier(path)) {
    resolve(path, t, requirements);
  } else {
    path.traverse({
      Identifier: function Identifier(p) {
        resolve(p, t, requirements);
      }
    });
  } // Collect the list of dependencies that we import


  var dependencies = requirements.reduce(function (deps, req) {
    if (t.isImportDeclaration(req.path.parentPath)) {
      deps.push(req.path.parentPath.node.source.value);
    } else {
      req.path.traverse({
        CallExpression: function CallExpression(p) {
          var _p$node = p.node,
              callee = _p$node.callee,
              args = _p$node.arguments;
          var name;

          if (callee.name === 'require' && args.length === 1) {
            if (args[0].type === 'Literal' || args[0].type === 'StringLiteral') {
              name = args[0].value;
            } else if (args[0].type === 'TemplateLiteral' && args[0].quasis.length === 1) {
              name = args[0].quasis[0].value.cooked;
            }
          }

          if (name) {
            deps.push(name);
          }
        }
      });
    }

    return deps;
  }, []);
  var expression = t.expressionStatement(t.assignmentExpression('=', t.memberExpression(t.identifier('module'), t.identifier('exports')), path.node)); // Preserve source order

  requirements.sort(function (a, b) {
    if (a.start.line === b.start.line) {
      return a.start.column - b.start.column;
    }

    return a.start.line - b.start.line;
  }); // We'll wrap each code in a block to avoid collisions in variable names
  // We separate out the imports since they cannot be inside blocks

  var _requirements$reduce = requirements.reduce(function (acc, curr) {
    if (t.isImportDeclaration(curr.path.parentPath)) {
      acc.imports.push(curr.result);
    } else {
      // Add these in reverse because we'll need to wrap in block statements in reverse
      acc.others.unshift(curr.result);
    }

    return acc;
  }, {
    imports: [],
    others: []
  }),
      imports = _requirements$reduce.imports,
      others = _requirements$reduce.others;

  var wrapped = others.reduce(function (acc, curr) {
    return t.blockStatement([curr, acc]);
  }, t.blockStatement([expression]));
  var m = new Module(filename);
  m.transform = typeof transformer !== 'undefined' ? transformer : function transform(text) {
    if (options && options.ignore && options.ignore.test(this.filename)) {
      return {
        code: text
      };
    }

    return babel.transformSync(text, {
      caller: {
        name: 'linaria',
        evaluate: true
      },
      filename: this.filename,
      presets: [[require.resolve('./index'), options]],
      plugins: [// Include this plugin to avoid extra config when using { module: false } for webpack
      '@babel/plugin-transform-modules-commonjs', '@babel/plugin-proposal-export-namespace-from', // We don't support dynamic imports when evaluating, but don't wanna syntax error
      // This will replace dynamic imports with an object that does nothing
      require.resolve('./dynamic-import-noop')]
    });
  };
  m.evaluate([// Use String.raw to preserve escapes such as '\n' in the code
  // Flow doesn't understand template tags: https://github.com/facebook/flow/issues/2616

  /* $FlowFixMe */
  imports.map(function (node) {
    return String.raw(_templateObject(), generator(node).code);
  }).join('\n'),
  /* $FlowFixMe */
  String.raw(_templateObject2(), generator(wrapped).code)].join('\n'));
  return {
    value: m.exports,
    dependencies: dependencies
  };
};
//# sourceMappingURL=evaluate.js.map