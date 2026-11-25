package ch.duartesantos.jellogym;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

/** A tap on a Water widget's quick-add button: queue it for the page (lib/widget-actions.js). */
public class WidgetActionReceiver extends BroadcastReceiver {
    static final String EXTRA_ACTION = "action";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        JSONObject action = WidgetActionQueue.parseAction(intent.getStringExtra(EXTRA_ACTION));
        if (action != null) {
            WidgetActions.enqueue(context, action);
            JelloGymWidgetProvider.updateAll(context);
        }
    }
}
