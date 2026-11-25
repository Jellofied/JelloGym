package ch.duartesantos.jellogym;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** The Food widget at 2x2: calories as a dot ring, protein underneath, and two one-tap repeats. */
public class FoodWidgetProvider extends AppWidgetProvider {
    private static final int[] CHIPS = {R.id.food_chip_0, R.id.food_chip_1};

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) draw(context, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager mgr, int id, android.os.Bundle options) {
        draw(context, mgr, id);
    }

    static void updateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        for (int id : mgr.getAppWidgetIds(new ComponentName(context, FoodWidgetProvider.class))) draw(context, mgr, id);
    }

    private static void draw(Context context, AppWidgetManager mgr, int id) {
        try { mgr.updateAppWidget(id, build(context, id)); }
        catch (Exception e) { /* the launcher no longer has this widget */ }
    }

    static RemoteViews build(Context context, int id) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_food);
        JSONObject snap = JelloGymWidgetProvider.liveSnapshot(context);
        JSONObject food = snap == null ? null : snap.optJSONObject("food");
        if (food == null) {
            v.setTextViewText(R.id.food_off, snap == null
                    ? context.getString(R.string.widget_life_unsynced)
                    : context.getString(R.string.widget_food_off));
            v.setViewVisibility(R.id.food_art, View.GONE);
            v.setViewVisibility(R.id.food_chips, View.GONE);
            v.setViewVisibility(R.id.food_off, View.VISIBLE);
            v.setOnClickPendingIntent(R.id.widget_root, JelloGymWidgetProvider.open(context, "jellogym://home", id * 10));
            return v;
        }

        int accent = JelloGymWidgetProvider.accentOf(snap);
        int dim = (accent & 0x00FFFFFF) | 0x33000000;
        v.setImageViewBitmap(R.id.food_ring_base, DotBitmap.draw(context, DotPattern.ring(), dim, 5.5f));
        v.setImageViewBitmap(R.id.food_ring_arc, DotBitmap.draw(context, DotPattern.arc((float) food.optDouble("pct", 0)), accent, 5.5f));
        v.setImageViewBitmap(R.id.food_digits, DotBitmap.draw(context, DotPattern.digits(String.valueOf(food.optInt("kcal", 0))), accent, 5.5f));
        v.setTextViewText(R.id.food_caption, food.optString("line", ""));
        v.setTextViewText(R.id.food_protein, food.optString("proteinLine", ""));

        String d = food.optString("d", JelloGymWidgetProvider.today());
        JSONArray chips = food.optJSONArray("chips");
        for (int i = 0; i < CHIPS.length; i++) {
            JSONObject chip = chips == null ? null : chips.optJSONObject(i);
            if (chip == null || chip.optInt("kcal", 0) <= 0) {
                v.setViewVisibility(CHIPS[i], View.GONE);
                continue;
            }
            v.setViewVisibility(CHIPS[i], View.VISIBLE);
            v.setTextViewText(CHIPS[i], chip.optString("label", "Repeat") + " · " + chip.optInt("kcal"));
            v.setOnClickPendingIntent(CHIPS[i], LifeWidgetActions.food(context, d,
                    chip.optInt("kcal"), chip.optInt("protein"), chip.optString("label"), id * 10 + i + 1));
        }
        Intent input = new Intent(context, FoodInputActivity.class).putExtra(FoodInputActivity.EXTRA_D, d);
        v.setOnClickPendingIntent(R.id.food_other, PendingIntent.getActivity(context, id * 10 + 4, input,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        v.setOnClickPendingIntent(R.id.widget_root, JelloGymWidgetProvider.open(context, "jellogym://food", id * 10 + 5));
        return v;
    }
}
