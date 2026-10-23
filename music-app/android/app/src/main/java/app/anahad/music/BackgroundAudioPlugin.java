package app.anahad.music;

import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * BackgroundAudio — JS bridge for {@link PlaybackService}.
 *
 * The web app keeps owning playback (the WebView's audio element / YouTube
 * iframe). This plugin only keeps the process alive while something is
 * loaded (foreground service) and mirrors now-playing state into the system
 * media notification + lock screen. Button presses come back to JS as
 * "action" events so the web player store stays the single source of truth.
 */
@CapacitorPlugin(name = "BackgroundAudio")
public class BackgroundAudioPlugin extends Plugin {

    private static BackgroundAudioPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        PlaybackService.stop(getContext());
    }

    /** Called by PlaybackService when a notification / lock-screen / headset button is pressed. */
    static void emitAction(String action) {
        BackgroundAudioPlugin plugin = instance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        plugin.notifyListeners("action", data);
    }

    @PluginMethod
    public void update(PluginCall call) {
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String artwork = call.getString("artwork", null);
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));

        PlaybackService running = PlaybackService.getInstance();
        if (running != null) {
            // Update in place: no service (re)start needed, so this also works
            // while the app is in the background (e.g. auto-advance at track end).
            running.update(title, artist, artwork, playing);
        } else {
            Context ctx = getContext();
            Intent intent = new Intent(ctx, PlaybackService.class)
                .setAction(PlaybackService.ACTION_UPDATE)
                .putExtra("title", title)
                .putExtra("artist", artist)
                .putExtra("artwork", artwork)
                .putExtra("playing", playing);
            try {
                ContextCompat.startForegroundService(ctx, intent);
            } catch (Exception e) {
                // Android 12+ refuses FGS starts from the background; the next
                // update while the app is visible will start it.
                call.reject("Could not start playback service: " + e.getMessage());
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        PlaybackService.stop(getContext());
        call.resolve();
    }
}
