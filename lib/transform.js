"use strict";

var path = require('path');

var babel = require('@babel/core');

var stylis = require('stylis');

var _require = require('source-map'),
    SourceMapGenerator = _require.SourceMapGenerator;

var STYLIS_DECLARATION = 1;

module.exports = function transform(code, options) {
  // Check if the file contains `css` or `styled` words first
  // Otherwise we should skip transforming
  if (!/\b(styled|css)/.test(code)) {
    return {
      code: code,
      sourceMap: options.inputSourceMap
    };
  } // Parse the code first so babel uses user's babel config for parsing
  // We don't want to use user's config when transforming the code


  var ast = babel.parseSync(code, {
    filename: options.filename,
    caller: {
      name: 'linaria'
    }
  });

  var _babel$transformFromA = babel.transformFromAstSync(ast, code, {
    filename: options.filename,
    presets: [[require.resolve('./babel'), options.pluginOptions]],
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    sourceFileName: options.filename,
    inputSourceMap: options.inputSourceMap
  }),
      metadata = _babel$transformFromA.metadata,
      transformedCode = _babel$transformFromA.code,
      map = _babel$transformFromA.map;

  if (!metadata.linaria) {
    return {
      code: code,
      sourceMap: options.inputSourceMap
    };
  }

  var _metadata$linaria = metadata.linaria,
      rules = _metadata$linaria.rules,
      replacements = _metadata$linaria.replacements,
      dependencies = _metadata$linaria.dependencies;
  var mappings = [];
  var cssText = '';
  var preprocessor;

  if (typeof options.preprocessor === 'function') {
    // eslint-disable-next-line prefer-destructuring
    preprocessor = options.preprocessor;
  } else {
    switch (options.preprocessor) {
      case 'none':
        preprocessor = function preprocessor(selector, text) {
          return selector + " {" + text + "}\n";
        };

        break;

      case 'stylis':
      default:
        stylis.use(null)(function (context, decl) {
          if (context === STYLIS_DECLARATION && options.outputFilename) {
            // When writing to a file, we need to adjust the relative paths inside url(..) expressions
            // It'll allow css-loader to resolve an imported asset properly
            return decl.replace(/\b(url\()(\.[^)]+)(\))/g, function (match, p1, p2, p3) {
              return p1 + // Replace asset path with new path relative to the output CSS
              path.relative(
              /* $FlowFixMe */
              path.dirname(options.outputFilename), // Get the absolute path to the asset from the path relative to the JS file
              path.resolve(path.dirname(options.filename), p2)) + p3;
            });
          }

          return decl;
        });
        preprocessor = stylis;
    }
  }

  Object.keys(rules).forEach(function (selector, index) {
    mappings.push({
      generated: {
        line: index + 1,
        column: 0
      },
      original: rules[selector].start,
      name: selector
    }); // Run each rule through stylis to support nesting

    cssText += preprocessor(selector, rules[selector].cssText) + "\n";
  });
  return {
    code: transformedCode,
    cssText: cssText,
    rules: rules,
    replacements: replacements,
    dependencies: dependencies,
    sourceMap: map,

    get cssSourceMapText() {
      if (mappings && mappings.length) {
        var generator = new SourceMapGenerator({
          file: options.filename.replace(/\.js$/, '.css')
        });
        mappings.forEach(function (mapping) {
          return generator.addMapping(Object.assign({}, mapping, {
            source: options.filename
          }));
        });
        generator.setSourceContent(options.filename, code);
        return generator.toString();
      }

      return '';
    }

  };
};
//# sourceMappingURL=transform.js.map