"use strict";

var transform = require('../transform');

function preprocessor() {
  var cache = {};
  return {
    code: function code(input, filename) {
      var result;

      try {
        result = transform(input, {
          filename: filename
        });
      } catch (e) {
        // Ignore parse errors
        return '';
      }

      var _result = result,
          rules = _result.rules,
          replacements = _result.replacements;

      if (!rules) {
        return '';
      } // Construct a CSS-ish file from the unprocessed style rules


      var cssText = '';
      Object.keys(rules).forEach(function (selector) {
        var rule = rules[selector]; // Append new lines until we get to the start line number

        var line = cssText.split('\n').length;

        while (rule.start && line < rule.start.line) {
          cssText += '\n';
          line++;
        }

        cssText += "." + rule.displayName + " {"; // Append blank spaces until we get to the start column number

        var last = cssText.split('\n').pop();
        var column = last ? last.length : 0;

        while (rule.start && column < rule.start.column) {
          cssText += ' ';
          column++;
        }

        cssText += rule.cssText + " }";
      });
      cache[filename] = replacements;
      return cssText;
    },
    result: function result(_result2, filename) {
      var replacements = cache[filename];

      if (replacements) {
        replacements.forEach(function (_ref) {
          var original = _ref.original,
              length = _ref.length;

          // If the warnings contain stuff that's been replaced,
          // Correct the line and column numbers to what's replaced
          _result2.warnings.forEach(function (w) {
            /* eslint-disable no-param-reassign */
            if (w.line === original.start.line) {
              // If the error is on the same line where an interpolation started, we need to adjust the line and column numbers
              // Because a replacement would have increased or decreased the column numbers
              // If it's in the same line where interpolation ended, it would have been adjusted during replacement
              if (w.column > original.start.column + length) {
                // The error is from an item after the replacements
                // So we need to adjust the column
                w.column += original.end.column - original.start.column + 1 - length;
              } else if (w.column >= original.start.column && w.column < original.start.column + length) {
                // The linter will underline the whole word in the editor if column is in inside a word
                // Set the column to the end, so it will underline the word inside the interpolation
                // e.g. in `${colors.primary}`, `primary` will be underlined
                w.column = original.start.line === original.end.line ? original.end.column - 1 : original.start.column;
              }
            }
          });
        });
      }

      return _result2;
    }
  };
}

module.exports = preprocessor;
//# sourceMappingURL=preprocessor.js.map