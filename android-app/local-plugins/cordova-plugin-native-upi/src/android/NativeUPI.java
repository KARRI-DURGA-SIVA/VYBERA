package com.vybera.plugins;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class NativeUPI extends CordovaPlugin {
    private static final int REQUEST_UPI_PAYMENT = 7302;
    private CallbackContext pendingCallback;

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext)
            throws JSONException {
        if (!"pay".equals(action)) return false;
        String upiUrl = args.optString(0, "").trim();
        final String upiPackage = args.optString(1, "").trim();
        if (!upiUrl.startsWith("upi://pay?")) {
            callbackContext.error("Invalid UPI payment URL");
            return true;
        }
        if (pendingCallback != null) {
            callbackContext.error("A UPI payment is already open");
            return true;
        }

        pendingCallback = callbackContext;
        cordova.setActivityResultCallback(this);
        cordova.getActivity().runOnUiThread(() -> {
            try {
                Intent payment = new Intent(Intent.ACTION_VIEW, Uri.parse(upiUrl));
                boolean launched = false;
                if (!upiPackage.isEmpty()) {
                    try {
                        Intent direct = new Intent(Intent.ACTION_VIEW, Uri.parse(upiUrl));
                        direct.setPackage(upiPackage);
                        cordova.getActivity().startActivityForResult(direct, REQUEST_UPI_PAYMENT);
                        launched = true;
                    } catch (android.content.ActivityNotFoundException missing) {
                        // chosen app is not installed: let the user pick another one
                    }
                }
                if (!launched) {
                    Intent chooser = Intent.createChooser(payment, "Pay with UPI");
                    cordova.getActivity().startActivityForResult(chooser, REQUEST_UPI_PAYMENT);
                }
            } catch (Exception error) {
                CallbackContext callback = pendingCallback;
                pendingCallback = null;
                if (callback != null) callback.error(error.getMessage());
            }
        });
        return true;
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent intent) {
        if (requestCode != REQUEST_UPI_PAYMENT) return;
        CallbackContext callback = pendingCallback;
        pendingCallback = null;
        if (callback == null) return;

        String response = "";
        if (intent != null) {
            String responseExtra = intent.getStringExtra("response");
            response = responseExtra != null ? responseExtra : "";
            if (response.isEmpty() && intent.getDataString() != null) {
                response = intent.getDataString();
            }
        }

        try {
            JSONObject result = new JSONObject();
            result.put("resultCode", resultCode);
            result.put("successfulActivityResult", resultCode == Activity.RESULT_OK);
            result.put("response", response);
            callback.success(result);
        } catch (JSONException error) {
            callback.error("Could not read the UPI payment result");
        }
    }
}
