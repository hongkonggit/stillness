# Stillness: a quiet meditation timer (iPhone web app)

## Put it on your iPhone (about 5 minutes)
iPhone only installs web apps from an https:// address, so host the folder once:
1. On a computer, go to **app.netlify.com/drop** (free account) and drag this whole `stillness` folder onto the page.
2. Open the address it gives you in **Safari** on your iPhone.
3. Tap **Share › Add to Home Screen**. Launch Stillness from the Home Screen icon.
(GitHub Pages or Cloudflare Pages work too.)

## Apple Music
1. Optional: in Settings › Playlist, paste a playlist link (Music › ••• › Share › Copy Link).
2. On the Meditate tab, tap **Apple Music**, start your playlist, then swipe back and tap **Begin**.
3. With **Mix with Apple Music** on (the default), bells ring over your music without pausing it. This needs iOS 16.4 or later. In this mode bells follow the Ring/Silent switch.

## Apple Health (one-time Shortcut)
Web apps can't reach HealthKit, so Stillness hands each session to a Shortcut:
1. In **Shortcuts**, create a shortcut named **Log Mindful Minutes**.
2. Add **Get Numbers from Input**, then **Log Health Sample** (Type: Mindful Minutes), using Numbers as the minutes.
   If it asks for Start/End dates: End = Current Date, Start = Adjust Date (subtract Numbers minutes).
3. Run it once to grant Health access, then turn on **Settings › Save Mindful Minutes** in Stillness.
After a session, tap **Save to Apple Health**.

## Volume and bells
- Settings › Mixer has volume sliders for the start & end bell and the interval bell, each with a play button.
- iPhone doesn't let apps change Apple Music's volume. Set the music level with the side buttons, then balance the bells with the sliders.
- With **Mix with Apple Music** on, bells are muted when iPhone is on **Silent** (an iOS rule for sounds that mix with music). Turn Silent off, or turn Mix off to always hear the bells (this pauses music).
- If iOS ever blocks sound mid-session, a "Tap to turn the bells back on" button appears. One tap restores it, and a bell that just came due still rings.

## Notes
- Keep the screen on during a session (on by default). iOS pauses web apps when the phone is locked, so bells can't ring then. The timer still keeps correct time and logs the session when you return.
- The journal is stored only on this device. Settings › Export gives you a CSV.
