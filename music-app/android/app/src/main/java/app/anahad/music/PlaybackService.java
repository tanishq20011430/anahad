package app.anahad.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground "mediaPlayback" service that keeps Anahad alive while a track is
 * loaded, shows the media notification + lock-screen controls, and holds a
 * wake/Wi-Fi lock only while audio is actually playing.
 */
public class PlaybackService extends Service {

    static final String ACTION_UPDATE = "app.anahad.music.UPDATE";
    private static final String ACTION_PREV = "app.anahad.music.PREV";
    private static final String ACTION_TOGGLE = "app.anahad.music.TOGGLE";
    private static final String ACTION_NEXT = "app.anahad.music.NEXT";

    private static final String CHANNEL_ID = "playback";
    private static final int NOTIFICATION_ID = 1;

    private static PlaybackService instance;

    private MediaSessionCompat session;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private final ExecutorService artworkLoader = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    private String title = "";
    private String artist = "";
    private String artworkUrl;
    private Bitmap artwork;
    private boolean playing;

    @Nullable
    static PlaybackService getInstance() {
        return instance;
    }

    static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, PlaybackService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();

        session = new MediaSessionCompat(this, "Anahad");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { BackgroundAudioPlugin.emitAction("play"); }
            @Override public void onPause() { BackgroundAudioPlugin.emitAction("pause"); }
            @Override public void onSkipToNext() { BackgroundAudioPlugin.emitAction("next"); }
            @Override public void onSkipToPrevious() { BackgroundAudioPlugin.emitAction("prev"); }
            @Override public void onStop() { BackgroundAudioPlugin.emitAction("pause"); }
        });
        session.setActive(true);

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Anahad:playback");
        wakeLock.setReferenceCounted(false);
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        if (wm != null) {
            wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Anahad:playback");
            wifiLock.setReferenceCounted(false);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_UPDATE.equals(action)) {
            update(
                intent.getStringExtra("title"),
                intent.getStringExtra("artist"),
                intent.getStringExtra("artwork"),
                intent.getBooleanExtra("playing", false)
            );
        } else if (ACTION_PREV.equals(action)) {
            BackgroundAudioPlugin.emitAction("prev");
        } else if (ACTION_TOGGLE.equals(action)) {
            BackgroundAudioPlugin.emitAction(playing ? "pause" : "play");
        } else if (ACTION_NEXT.equals(action)) {
            BackgroundAudioPlugin.emitAction("next");
        } else {
            // Restarted without state (shouldn't happen with START_NOT_STICKY) — show something valid.
            update(title, artist, artworkUrl, playing);
        }
        return START_NOT_STICKY;
    }

    void update(String newTitle, String newArtist, @Nullable String newArtworkUrl, boolean isPlaying) {
        title = newTitle != null ? newTitle : "";
        artist = newArtist != null ? newArtist : "";
        playing = isPlaying;

        if (newArtworkUrl == null || !newArtworkUrl.equals(artworkUrl)) {
            artworkUrl = newArtworkUrl;
            artwork = null;
            if (newArtworkUrl != null && newArtworkUrl.startsWith("http")) loadArtwork(newArtworkUrl);
        }

        session.setMetadata(new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork)
            .build());
        session.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
            .setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
            .build());

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type);

        if (playing) {
            wakeLock.acquire();
            if (wifiLock != null) wifiLock.acquire();
        } else {
            releaseLocks();
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_music)
            .setContentTitle(title)
            .setContentText(artist)
            .setLargeIcon(artwork)
            .setContentIntent(contentIntent)
            .setOngoing(playing)
            .setShowWhen(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .addAction(android.R.drawable.ic_media_previous, "Previous", actionIntent(ACTION_PREV, 1))
            .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "Pause" : "Play", actionIntent(ACTION_TOGGLE, 2))
            .addAction(android.R.drawable.ic_media_next, "Next", actionIntent(ACTION_NEXT, 3))
            .setStyle(new MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2))
            .build();
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        Intent i = new Intent(this, PlaybackService.class).setAction(action);
        return PendingIntent.getService(this, requestCode, i,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void loadArtwork(String url) {
        artworkLoader.execute(() -> {
            Bitmap bmp = null;
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                try (InputStream in = conn.getInputStream()) {
                    bmp = BitmapFactory.decodeStream(in);
                }
            } catch (Exception ignored) {
                // Artwork is cosmetic; the notification works without it.
            } finally {
                if (conn != null) conn.disconnect();
            }
            final Bitmap loaded = bmp;
            main.post(() -> {
                if (loaded == null || instance != this || !url.equals(artworkUrl)) return;
                artwork = loaded;
                update(title, artist, artworkUrl, playing);
            });
        });
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Now playing and playback controls");
        channel.setShowBadge(false);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private void releaseLocks() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // App swiped away: the WebView (and its audio) is gone, so stop too.
        stopSelf();
    }

    @Override
    public void onDestroy() {
        releaseLocks();
        artworkLoader.shutdownNow();
        session.setActive(false);
        session.release();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
