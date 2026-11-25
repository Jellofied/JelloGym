package ch.duartesantos.jellogym;

import android.app.Activity;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import java.util.UUID;
import org.json.JSONObject;

/**
 * The Water widget's typed amount. Android widgets draw with RemoteViews, which cannot carry an
 * EditText, so "Other" opens this small dialog; Save puts the amount in the same queue as the
 * quick-add buttons and leaves the Home Screen alone. It never opens the app or touches its state.
 */
public class WidgetInputActivity extends Activity {
    static final String EXTRA_ML = "ml";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Bundle extras = getIntent() == null ? null : getIntent().getExtras();
        int ml = extras == null ? 250 : extras.getInt(EXTRA_ML, 250);
        setContentView(R.layout.widget_input);
        EditText field = findViewById(R.id.widget_input_value);
        field.setText(String.valueOf(ml));
        field.setSelection(field.length());
        findViewById(R.id.widget_input_cancel).setOnClickListener(v -> finish());
        Button save = findViewById(R.id.widget_input_save);
        save.setOnClickListener(v -> {
            int typed;
            try { typed = Integer.parseInt(field.getText().toString().trim()); }
            catch (NumberFormatException e) { typed = 0; }
            if (typed <= 0 || typed > 2000) {
                field.setError("Enter 1 to 2000 ml");
                return;
            }
            save.setEnabled(false);
            JSONObject action = new JSONObject();
            try {
                action.put("id", System.currentTimeMillis() + "-" + UUID.randomUUID());
                action.put("action", "water");
                action.put("d", JelloGymWidgetProvider.today());
                action.put("ml", typed);
            } catch (Exception e) {
                finish();
                return;
            }
            WidgetActions.enqueue(this, action);
            JelloGymWidgetProvider.updateAll(this);
            finish();
        });
    }
}
