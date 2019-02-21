"use strict";

/* eslint-disable no-param-reassign */
var _require = require('path'),
    relative = _require.relative,
    dirname = _require.dirname,
    basename = _require.basename;

var generator = require('@babel/generator').default;

var _require2 = require('react-is'),
    isValidElementType = _require2.isValidElementType;

var Module = require('./module');

var evaluate = require('./evaluate');

var slugify = require('../slugify');

var _require3 = require('./units'),
    units = _require3.units,
    unitless = _require3.unitless;

var hyphenate = function hyphenate(s) {
  return s // Hyphenate CSS property names from camelCase version from JS string
  .replace(/([A-Z])/g, function (match, p1) {
    return "-" + p1.toLowerCase();
  }) // Special case for `-ms` because in JS it starts with `ms` unlike `Webkit`
  .replace(/^ms-/, '-ms-');
};

var isPlainObject = function isPlainObject(o) {
  return typeof o === 'object' && o != null && o.constructor.name === 'Object';
};

var toValidCSSIdentifier = function toValidCSSIdentifier(s) {
  return s.replace(/[^_0-9a-z]/gi, '_');
}; // Some tools such as polished.js output JS objects
// To support them transparently, we convert JS objects to CSS strings


var toCSS = function toCSS(o) {
  return Object.entries(o).filter(function (_ref) {
    var value = _ref[1];
    return (// Ignore all falsy values except numbers
      typeof value === 'number' || value
    );
  }).map(function (_ref2) {
    var key = _ref2[0],
        value = _ref2[1];

    if (isPlainObject(value)) {
      return hyphenate(key) + " { " + toCSS(value) + " }";
    }

    return hyphenate(key) + ": " + (
    /* $FlowFixMe */
    typeof value === 'number' && value !== 0 && !unitless[// Strip vendor prefixes when checking if the value is unitless
    key.replace(/^(Webkit|Moz|O|ms)([A-Z])(.+)$/, function (match, p1, p2, p3) {
      return "" + p2.toLowerCase() + p3;
    })] ? value + "px" : value) + ";";
  }).join(' ');
}; // Stripping away the new lines ensures that we preserve line numbers
// This is useful in case of tools such as the stylelint pre-processor
// This should be safe because strings cannot contain newline: https://www.w3.org/TR/CSS2/syndata.html#strings


var stripLines = function stripLines(loc, text) {
  var result = String(text).replace(/[\r\n]+/g, ' ').trim(); // If the start and end line numbers aren't same, add new lines to span the text across multiple lines

  if (loc.start.line !== loc.end.line) {
    result += '\n'.repeat(loc.end.line - loc.start.line); // Add extra spaces to offset the column

    result += ' '.repeat(loc.end.column);
  }

  return result;
}; // Verify if the binding is imported from the specified source


var imports = function imports(t, scope, filename, identifier, source) {
  var binding = scope.getAllBindings()[identifier];

  if (!binding) {
    return false;
  }

  var p = binding.path;

  var resolveFromFile = function resolveFromFile(id) {
    /* $FlowFixMe */
    var M = require('module');

    try {
      return M._resolveFilename(id, {
        id: filename,
        filename: filename,
        paths: M._nodeModulePaths(dirname(filename))
      });
    } catch (e) {
      return null;
    }
  };

  var isImportingModule = function isImportingModule(value) {
    return (// If the value is an exact match, assume it imports the module
      value === source || // Otherwise try to resolve both and check if they are the same file
      resolveFromFile(value) === ( // eslint-disable-next-line no-nested-ternary
      source === 'linaria' ? require.resolve('../index') : source === 'linaria/react' ? require.resolve('../react/') : resolveFromFile(source))
    );
  };

  if (t.isImportSpecifier(p) && t.isImportDeclaration(p.parentPath)) {
    return isImportingModule(p.parentPath.node.source.value);
  }

  if (t.isVariableDeclarator(p)) {
    if (t.isCallExpression(p.node.init) && t.isIdentifier(p.node.init.callee) && p.node.init.callee.name === 'require' && p.node.init.arguments.length === 1) {
      var node = p.node.init.arguments[0];

      if (t.isStringLiteral(node)) {
        return isImportingModule(node.value);
      }

      if (t.isTemplateLiteral(node) && node.quasis.length === 1) {
        return isImportingModule(node.quasis[0].value.cooked);
      }
    }
  }

  return false;
}; // Throw if we can't handle the interpolated value


var throwIfInvalid = function throwIfInvalid(value, ex) {
  if (typeof value === 'function' || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) || isPlainObject(value)) {
    return;
  }

  var stringified = typeof value === 'object' ? JSON.stringify(value) : String(value);
  throw ex.buildCodeFrameError("The expression evaluated to '" + stringified + "', which is probably a mistake. If you want it to be inserted into CSS, explicitly cast or transform the value to a string, e.g. - 'String(" + generator(ex.node).code + ")'.");
}; // Match any valid CSS units followed by a separator such as ;, newline etc.


var unitRegex = new RegExp("^(" + units.join('|') + ")(;|,|\n| |\\))");

module.exports = function extract(babel, options) {
  var t = babel.types;
  return {
    visitor: {
      Program: {
        enter: function enter(path, state) {
          // Collect all the style rules from the styles we encounter
          state.rules = {};
          state.index = -1;
          state.dependencies = [];
          state.replacements = []; // Invalidate cache for module evaluation to get fresh modules

          Module.invalidate();
        },
        exit: function exit(path, state) {
          if (Object.keys(state.rules).length) {
            // Store the result as the file metadata
            state.file.metadata = {
              linaria: {
                rules: state.rules,
                replacements: state.replacements,
                dependencies: state.dependencies
              }
            };
          } // Invalidate cache for module evaluation when we're done


          Module.invalidate();
        }
      },
      TaggedTemplateExpression: function TaggedTemplateExpression(path, state) {
        var _path$node = path.node,
            quasi = _path$node.quasi,
            tag = _path$node.tag;
        var styled;
        var css;

        if (t.isCallExpression(tag) && t.isIdentifier(tag.callee) && tag.arguments.length === 1 && tag.callee.name === 'styled' && imports(t, path.scope, state.file.opts.filename, 'styled', 'linaria/react')) {
          styled = {
            component: path.get('tag').get('arguments')[0]
          };
        } else if (t.isMemberExpression(tag) && t.isIdentifier(tag.object) && t.isIdentifier(tag.property) && tag.object.name === 'styled' && imports(t, path.scope, state.file.opts.filename, 'styled', 'linaria/react')) {
          styled = {
            component: {
              node: t.stringLiteral(tag.property.name)
            }
          };
        } else if (imports(t, path.scope, state.file.opts.filename, 'css', 'linaria')) {
          css = t.isIdentifier(tag) && tag.name === 'css';
        }

        if (!(styled || css)) {
          return;
        } // Increment the index of the style we're processing
        // This is used for slug generation to prevent collision
        // Also used for display name if it couldn't be determined


        state.index++;
        var interpolations = []; // Check if the variable is referenced anywhere for basic DCE
        // Only works when it's assigned to a variable

        var isReferenced = true; // Try to determine a readable class name

        var displayName;
        var parent = path.findParent(function (p) {
          return t.isObjectProperty(p) || t.isJSXOpeningElement(p) || t.isVariableDeclarator(p);
        });

        if (parent) {
          if (t.isObjectProperty(parent)) {
            displayName = parent.node.key.name || parent.node.key.value;
          } else if (t.isJSXOpeningElement(parent)) {
            displayName = parent.node.name.name;
          } else if (t.isVariableDeclarator(parent)) {
            var _path$scope$getBindin = path.scope.getBinding(parent.node.id.name),
                referencePaths = _path$scope$getBindin.referencePaths;

            isReferenced = referencePaths.length !== 0;
            displayName = parent.node.id.name;
          }
        }

        if (!displayName) {
          // Try to derive the path from the filename
          displayName = basename(state.file.opts.filename);

          if (/^index\.[a-z0-9]+$/.test(displayName)) {
            // If the file name is 'index', better to get name from parent folder
            displayName = basename(dirname(state.file.opts.filename));
          } // Remove the file extension


          displayName = displayName.replace(/\.[a-z0-9]+$/, '');

          if (displayName) {
            displayName += state.index;
          } else {
            throw path.buildCodeFrameError("Couldn't determine a name for the component. Ensure that it's either:\n" + '- Assigned to a variable\n' + '- Is an object property\n' + '- Is a prop in a JSX element\n');
          }
        } // Custom properties need to start with a letter, so we prefix the slug
        // Also use append the index of the class to the filename for uniqueness in the file


        var slug = toValidCSSIdentifier("" + displayName.charAt(0).toLowerCase() + slugify(relative(state.file.opts.root, state.file.opts.filename) + ":" + state.index));
        var className = options.displayName ? toValidCSSIdentifier(displayName) + "_" + slug : slug; // Serialize the tagged template literal to a string

        var cssText = '';
        var expressions = path.get('quasi').get('expressions');
        quasi.quasis.forEach(function (el, i, self) {
          var appended = false;

          if (i !== 0) {
            // Check if previous expression was a CSS variable that we replaced
            // If it has a unit after it, we need to move the unit into the interpolation
            // e.g. `var(--size)px` should actually be `var(--size)`
            // So we check if the current text starts with a unit, and add the unit to the previous interpolation
            // Another approach would be `calc(var(--size) * 1px), but some browsers don't support all units
            // https://bugzilla.mozilla.org/show_bug.cgi?id=956573
            var matches = el.value.cooked.match(unitRegex);

            if (matches) {
              var last = interpolations[interpolations.length - 1];
              var unit = matches[1];

              if (last && cssText.endsWith("var(--" + last.id + ")")) {
                last.unit = unit;
                cssText += el.value.cooked.replace(unitRegex, '$2');
                appended = true;
              }
            }
          }

          if (!appended) {
            cssText += el.value.cooked;
          }

          var ex = expressions[i];

          if (ex) {
            var end = ex.node.loc.end;
            var result = ex.evaluate();
            var beforeLength = cssText.length; // The location will be end of the current string to start of next string

            var next = self[i + 1];
            var loc = {
              // +1 because the expressions location always shows 1 column before
              start: {
                line: el.loc.end.line,
                column: el.loc.end.column + 1
              },
              end: next ? {
                line: next.loc.start.line,
                column: next.loc.start.column
              } : {
                line: end.line,
                column: end.column + 1
              }
            };

            if (result.confident) {
              throwIfInvalid(result.value, ex);

              if (isPlainObject(result.value)) {
                // If it's a plain object, convert it to a CSS string
                cssText += stripLines(loc, toCSS(result.value));
              } else {
                cssText += stripLines(loc, result.value);
              }

              state.replacements.push({
                original: loc,
                length: cssText.length - beforeLength
              });
            } else {
              // Try to preval the value
              if (options.evaluate && !(t.isFunctionExpression(ex) || t.isArrowFunctionExpression(ex))) {
                var evaluation;

                try {
                  evaluation = evaluate(ex, t, state.file.opts.filename, undefined, options);
                } catch (e) {
                  throw ex.buildCodeFrameError("An error occurred when evaluating the expression: " + e.message + ". Make sure you are not using a browser or Node specific API.");
                }

                var _evaluation = evaluation,
                    value = _evaluation.value,
                    dependencies = _evaluation.dependencies;
                throwIfInvalid(value, ex);

                if (typeof value !== 'function') {
                  var _state$dependencies;

                  // Only insert text for non functions
                  // We don't touch functions because they'll be interpolated at runtime
                  if (isValidElementType(value) && value.__linaria) {
                    // If it's an React component wrapped in styled, get the class name
                    // Useful for interpolating components
                    cssText += "." + value.__linaria.className;
                  } else if (isPlainObject(value)) {
                    cssText += stripLines(loc, toCSS(value));
                  } else {
                    // For anything else, assume it'll be stringified
                    cssText += stripLines(loc, value);
                  }

                  (_state$dependencies = state.dependencies).push.apply(_state$dependencies, dependencies);

                  state.replacements.push({
                    original: loc,
                    length: cssText.length - beforeLength
                  });
                  return;
                }
              }

              if (styled) {
                var id = slug + "-" + i;
                interpolations.push({
                  id: id,
                  node: ex.node,
                  source: ex.getSource() || generator(ex.node).code,
                  unit: ''
                });
                cssText += "var(--" + id + ")";
              } else {
                // CSS custom properties can't be used outside components
                throw ex.buildCodeFrameError("The CSS cannot contain JavaScript expressions when using the 'css' tag. To evaluate the expressions at build time, pass 'evaluate: true' to the babel plugin.");
              }
            }
          }
        });
        var selector = "." + className;

        if (styled) {
          // If `styled` wraps another component and not a primitive,
          // get its class name to create a more specific selector
          // it'll ensure that styles are overridden properly
          if (options.evaluate && t.isIdentifier(styled.component.node)) {
            var _evaluate = evaluate(styled.component, t, state.file.opts.filename, undefined, options),
                value = _evaluate.value;

            while (isValidElementType(value) && value.__linaria) {
              selector += "." + value.__linaria.className;
              value = value.__linaria.extends;
            }
          }

          var props = [];
          props.push(t.objectProperty(t.identifier('name'), t.stringLiteral(displayName)));
          props.push(t.objectProperty(t.identifier('class'), t.stringLiteral(className))); // If we found any interpolations, also pass them so they can be applied

          if (interpolations.length) {
            // De-duplicate interpolations based on the source and unit
            // If two interpolations have the same source code and same unit,
            // we don't need to use 2 custom properties for them, we can use a single one
            var result = {};
            interpolations.forEach(function (it) {
              var key = it.source + it.unit;

              if (key in result) {
                cssText = cssText.replace("var(--" + it.id + ")", "var(--" + result[key].id + ")");
              } else {
                result[key] = it;
              }
            });
            props.push(t.objectProperty(t.identifier('vars'), t.objectExpression(Object.keys(result).map(function (key) {
              var _result$key = result[key],
                  id = _result$key.id,
                  node = _result$key.node,
                  unit = _result$key.unit;
              var items = [node];

              if (unit) {
                items.push(t.stringLiteral(unit));
              }

              return t.objectProperty(t.stringLiteral(id), t.arrayExpression(items));
            }))));
          }

          path.replaceWith(t.callExpression(t.callExpression(t.identifier('styled'), [styled.component.node]), [t.objectExpression(props)]));
          path.addComment('leading', '#__PURE__');
        } else {
          path.replaceWith(t.stringLiteral(className));
        }

        if (!isReferenced && !cssText.includes(':global')) {
          return;
        }

        state.rules[selector] = {
          cssText: cssText,
          className: className,
          displayName: displayName,
          start: path.parent && path.parent.loc ? path.parent.loc.start : null
        };
      }
    }
  };
};
//# sourceMappingURL=extract.js.map