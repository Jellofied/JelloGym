package ch.duartesantos.jellogym;

import android.app.Activity;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import org.json.JSONObject;

/** The Food widget's typed entry: calories and protein, queued as one action (RemoteViews has no EditText). */
public class FoodInputActivity extends Activity {
    static final String EXTRA_D = "d";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Bundle extras = getIntent() == null ? null : getIntent().getExtras();
        String d = extras == null ? JelloGymWidgetProvider.today() : extras.getString(EXTRA_D, JelloGymWidgetProvider.today());
        setContentView(R.layout.widget_food_input);
        EditText kcalField = findViewById(R.id.food_input_kcal);
        EditText proteinField = findViewById(R.id.food_input_protein);
        findViewById(R.id.food_input_cancel).setOnClickListener(v -> finish());
        Button save = findViewById(R.id.food_input_save);
        save.setOnClickListener(v -> {
            int kcal, protein;
            try { kcal = Integer.parseInt(kcalField.getText().toString().trim()); }
            catch (NumberFormatException e) { kcal = 0; }
            try { protein = Integer.parseInt(proteinField.getText().toString().trim()); }
            catch (NumberFormatException e) { protein = 0; }
            if (kcal <= 0 || kcal > 5000 || protein < 0 || protein > 1000) {
                kcalField.setError("Enter 1 to 5000 kcal");
                return;
            }
            save.setEnabled(false);
            JSONObject action = LifeWidgetActions.action("food", d);
            try {
                action.put("kcal", kcal);
                action.put("protein", protein);
                action.put("label", "Widget");
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
