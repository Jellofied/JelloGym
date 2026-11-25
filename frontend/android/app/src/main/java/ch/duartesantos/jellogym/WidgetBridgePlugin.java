package ch.duartesantos.jellogym;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Hands the Home Screen widget what it shows (lib/widgets.js builds it, the same snapshot the
 * iPhone widgets get): kept in the app's own SharedPreferences, never synced or backed up anywhere
 * else, and every JelloGym widget drawn again with it (JelloGymWidgetProvider). The page writes only
 * when something the widgets show changed.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {
    @PluginMethod
    public void write(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is required");
            return;
        }
        try {
            Context context = getContext();
            JelloGymWidgetProvider.prefs(context).edit().putString(JelloGymWidgetProvider.SNAPSHOT, json).apply();
            JelloGymWidgetProvider.updateAll(context);
            // A running workout drives the Glyph strips from a foreground service so the app need
            // not be on screen; no snapshot, no workout, no service and no notification.
            JSONObject snap = new JSONObject(json);
            GlyphService.set(context, snap.optJSONObject("glyph") != null);
            call.resolve();
        } catch (Exception e) {
            call.reject("could not write the widget data");
        }
    }

    /** Asked once when a workout starts: ignore battery optimisations and let the Glyph notify. */
    @PluginMethod
    public void requestBackground(PluginCall call) {
        Context context = getContext();
        try {
            context.startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + context.getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            // Some skins do not have that screen; the foreground service still runs.
        }
        Activity activity = getActivity();
        if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ActivityCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(activity, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 8302);
        }
        call.resolve();
    }

    /** The taps widgets queued while the page was asleep (lib/widget-actions.js). */
    @PluginMethod
    public void drain(PluginCall call) {
        JSONArray events = WidgetActions.drain(getContext());
        JSArray out = new JSArray();
        for (int i = 0; i < events.length(); i++) out.put(events.optJSONObject(i));
        call.resolve(new JSObject().put("events", out));
    }

    /** Only after the applied change is on disk: a crash before this replays the same tap ids. */
    @PluginMethod
    public void ack(PluginCall call) {
        JSONArray ids = call.getArray("ids");
        List<String> done = new ArrayList<>();
        if (ids != null) for (int i = 0; i < ids.length(); i++) {
            String id = ids.optString(i, "");
            if (!id.isEmpty()) done.add(id);
        }
        WidgetActions.ack(getContext(), done);
        call.resolve();
    }
}
