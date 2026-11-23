var exec = require('cordova/exec');

exports.pay = function(upiUrl, success, failure, upiPackage) {
  exec(success, failure, 'NativeUPI', 'pay', [upiUrl, upiPackage || '']);
};
