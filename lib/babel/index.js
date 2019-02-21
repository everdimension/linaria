"use strict";

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

var cosmiconfig = require('cosmiconfig');

var explorer = cosmiconfig('linaria');

module.exports = function linaria(context, options) {
  // Load configuration file
  var result = explorer.searchSync(); // Set some defaults for options
  // eslint-disable-next-line no-param-reassign

  options = _extends({
    displayName: false,
    evaluate: true,
    ignore: /node_modules/
  }, result ? result.config : null, options);
  return {
    plugins: [[require('./extract'), options]]
  };
};
//# sourceMappingURL=index.js.map