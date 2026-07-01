var exec = require('cordova/exec');

exports.pay = function(upiUrl, success, failure) {
  exec(success, failure, 'NativeUPI', 'pay', [upiUrl]);
};
