# MicTest+ launch kit

Copy-paste texts for getting the first links and visitors.
Two rules that keep posts from being removed or downvoted:

1. **Help first, link second.** Answer the person's actual question in the post itself. The link is a bonus, not the answer.
2. **Say you made it.** One short line ("I built this") is enough. Hidden self-promotion gets accounts banned on Reddit.

Post slowly: a few places a day, not everything in one hour.

---

## 1. Reddit answers (reply to existing questions)

Search Reddit for the phrase in the heading, sort by **New**, and answer recent posts.
Good places: r/techsupport, r/discordapp, r/Zoom, r/MicrosoftTeams, r/Twitch, r/obs, r/PcBuildHelp, r/applehelp, r/AndroidQuestions.

### "mic not working on Discord"
> If your mic works everywhere except Discord, it's almost always one of these, in User Settings → Voice & Video:
> 1. **Input Device**: pick your mic by name, not "Default".
> 2. **Input Sensitivity**: turn off "Automatically determine" and drag the slider left until your voice lights the bar.
> 3. **Input Mode**: if you're on Push to Talk, check the keybind.
> 4. A red slashed mic next to your name = server muted.
>
> To check whether it's Discord or the mic itself, run a browser mic test with the same device. If the meter moves there, it's a Discord setting. I made a free one that doesn't upload anything: https://mictestplus.com/discord-mic-test/

### "webcam shows black screen"
> Black webcam image is usually one of:
> - a physical privacy shutter (many Lenovo/HP/Dell laptops have a tiny slider above the screen)
> - another app holding the camera (Teams, Zoom, OBS, another browser tab)
> - Windows privacy: Settings → Privacy & security → Camera → allow desktop apps
>
> A quick way to narrow it down: open a browser webcam test. It tells you if the camera is missing, blocked or busy. Mine is free and shows the real resolution and FPS too (I built it): https://mictestplus.com/webcam-test/

### "how do I test my mic before a job interview / Zoom call"
> Zoom has its own test at Settings → Audio → Test Mic, and a test meeting at zoom.us/test.
> If you want to hear exactly how you sound, record a few seconds and play it back with headphones. You're aiming for a level that's clearly in the green but never hits the red.
> I built a free page for this that records and plays back in the browser, nothing uploaded: https://mictestplus.com/zoom-mic-test/

### "AirPods mic not working on Windows / PC"
> Windows shows AirPods twice: "Headphones" and "Headset". The mic only works through the **Headset** one. Set it as your input in Settings → System → Sound → Input, and pick it in your call app too.
> Also expected: when the mic is on, Bluetooth drops to a lower quality "hands-free" mode, so calls sound worse than music. That's Bluetooth, not your AirPods.
> You can check the AirPods mic level here (my site, free, nothing uploaded): https://mictestplus.com/airpods-mic-test/

### "my mouse double clicks by itself" (r/MouseReview, r/pcmasterrace, r/techsupport)
> That is almost always a worn switch. Before you buy a new mouse: blow compressed air around the button, and if it is a gaming mouse, check the debounce setting in its software (raise it a little).
> To confirm it, click normally in a tester for a minute. Two clicks under ~80 ms apart are not from your finger. I made a free one that flags them and also shows polling rate: https://mictestplus.com/mouse-test/

### "some keys on my keyboard don't work / type twice" (r/MechanicalKeyboards, r/techsupport)
> Press every key in a key tester to see exactly which ones never reach the PC, and which ones fire twice (chatter). Free, in the browser: https://mictestplus.com/keyboard-test/
> Chatter on one key = dirty or worn switch: compressed air first, then swap the switch if it is hot-swap.

### "new monitor, is that a dead pixel?" (r/Monitors, r/buildapc)
> Clean the screen first, then fill it with solid black, white, red, green and blue. Dead = black on everything, stuck = one bright color on black. Return windows are short, so check now: https://mictestplus.com/dead-pixel-test/ (also shows the real refresh rate, handy to confirm 144 Hz is actually on).

---

## 2. Launch posts

### r/SideProject (and Indie Hackers)
**Title:** I built a mic, webcam and speaker test that runs fully in the browser (13 languages, no uploads)

> Hi! Most "test your mic" sites are slow, full of ads or ask for permissions without explaining anything. I wanted one page that answers "is my mic/camera working?" in five seconds, on any device.
>
> **MicTest+** (https://mictestplus.com):
> - Mic: live dB meter, waveform, spectrum, 5-second record and playback
> - Webcam: real measured FPS, resolution, and the camera's max supported mode
> - Speakers: left/right tones and a 40 Hz to 16 kHz sweep
> - Voice recorder with download, no time limit
> - 13 languages, works on phones, nothing is uploaded
>
> Built as a static site: each page is one ~20 KB request, Lighthouse 100 across the board.
> Feedback very welcome, especially from people on Firefox, older iPhones or unusual USB mics.

### Hacker News (Show HN)
**Title:** Show HN: MicTest+ – mic, webcam and speaker test that never uploads anything

> Static site, one HTML request per page (CSS/JS inlined, ~20 KB gzipped). Uses getUserMedia, Web Audio (AnalyserNode for the meter/spectrum, StereoPanner for L/R tones) and MediaRecorder for local recordings. FPS is measured with requestVideoFrameCallback rather than trusting the driver's reported value, and getCapabilities() shows the camera's max mode. 13 languages generated from JSON. Happy to answer questions.

---

## 3. Product Hunt

- **Name:** MicTest+
- **Tagline (≤60):** Test your mic, webcam and speakers in 5 seconds
- **Description (≤260):** Free, private device tests in your browser: mic, webcam, speakers, decibel meter, voice recorder, keyboard, mouse and dead pixel test. Real webcam FPS, mic score, nothing uploaded. 13 languages, works on phones.
- **Topics:** Productivity, Developer Tools, Remote Work, Privacy
- **First comment:**
  > Hey Product Hunt! I built MicTest+ after one too many "can you hear me?" moments at the start of calls. Everything runs in the browser, so your audio and video never leave your device. I'd love to hear which test you'd add next.
- **Images:** use `src/static/og.png` as the thumbnail and the screenshots I sent you as the gallery.

---

## 4. Directories to submit to (one-time, free)

| Site | What to do |
|---|---|
| AlternativeTo (alternativeto.net) | Add MicTest+ as an alternative to mictests.com, webcamtests.com and onlinemictest.com |
| SaaSHub (saashub.com) | Submit as a free tool, category "Audio" / "Webcam" |
| Product Hunt | Launch (section 3) on a Tuesday–Thursday |
| Hacker News | Show HN post (section 2) |
| Indie Hackers | Same as the r/SideProject post |
| Uneed (uneed.best) | Free tool listing |
| GitHub | Repo → About → Website: https://mictestplus.com |

---

## 5. Quora answer
Search: "How do I test my microphone online", "Why is my webcam not working", "How do I know if my mic works".

> The quickest check is a browser mic test: allow microphone access, talk, and watch the level meter. If it moves, the mic and your system are fine and any problem is in the app you're using (Zoom, Discord, Teams each have their own input setting).
> If it doesn't move: check that the right input device is selected, that your OS allows microphone access (Windows: Settings → Privacy & security → Microphone; Mac: System Settings → Privacy & Security → Microphone), and that there's no hardware mute switch.
> I built a free one that also records and plays back without uploading anything: https://mictestplus.com

---

## 6. Email to bloggers and YouTubers
Find articles/videos titled "how to fix microphone not working" and email the author.

**Subject:** A free mic test tool for your "mic not working" guide

> Hi [name],
>
> I read your guide "[title]". It's one of the clearest I've found, especially the part about [specific detail].
>
> I built MicTest+ (https://mictestplus.com), a free mic, webcam and speaker test that runs in the browser and doesn't upload anything. It's in 13 languages and has step-by-step fixes for Windows, Mac, Discord and Zoom. If you think it would help your readers check their mic before following your steps, feel free to link it. No pressure either way.
>
> Thanks for the guide,
> [your name]

---

## 7. Hebrew post (Facebook groups / forums)

> בניתי כלי חינמי לבדיקת מיקרופון, מצלמה ורמקולים, שרץ ישירות בדפדפן ולא מעלה שום דבר לשרת.
> מראה עוצמת קול בזמן אמת, מקליט ומשמיע, בודק רזולוציה ו-FPS של מצלמה, ויש גם מקליט קול להורדה.
> עובד בטלפון ובמחשב, ובעברית: https://mictestplus.com/he/
> אשמח לשמוע מה חסר לכם 🙏

---

## 8. The free widget (the best way to earn links)

Page: **https://mictestplus.com/widget/**. Site owners copy one snippet and get a working mic test. The snippet includes a credit link back to MicTest+, so **every site that embeds it gives you a backlink**.

**Who to offer it to** (search Google for these and email the site owner):
- "how to fix microphone" / "mic not working" articles on tech blogs
- support / help-center pages of online schools, tutoring sites, podcast hosts, Discord bot sites, telehealth and job-interview platforms
- gaming community sites and forums (many have a "setup" or "help" page)

**Email template:**

**Subject:** A free mic test you can embed on "[their page title]"

> Hi [name],
>
> Your page "[title]" helps a lot of people fix their microphone. I made a small free widget that lets readers test their mic right on your page, without leaving it: https://mictestplus.com/widget/
>
> It's one line of code (works in WordPress, Wix and Squarespace), runs in the browser, uploads nothing, and comes in 13 languages with a light or dark theme. Totally free. If it's useful, feel free to add it.
>
> Thanks,
> [your name]

**Reddit / forum reply when someone runs a community or support site:**
> If you want your members to check their mic before joining voice, there's a free embeddable mic test you can drop on a help page: https://mictestplus.com/widget/ (I built it; it runs in the browser, nothing is uploaded).

---

## 9. Short social posts (Facebook, X, LinkedIn, Threads)

Each link now shows its own preview image in the right language, so paste the link on its own line and let the preview do the work. One post a day is plenty.

**Mouse**
> Mouse double clicking when you click once? It's usually a worn switch, not you. Test it in 30 seconds (two clicks under 80 ms = fault), then try the fixes before buying a new one:
> https://mictestplus.com/guides/mouse-double-clicking/

**Keyboard**
> Some keys not working, or typing twice? Press every key here and see exactly which ones fail. Then the fix list: Filter Keys, layout, debris, chatter.
> https://mictestplus.com/guides/keyboard-keys-not-working/

**New monitor**
> Just got a new monitor or phone? Check for dead pixels today, while you can still return it. Full-screen colors, plus the real refresh rate (is your 144 Hz actually on?):
> https://mictestplus.com/dead-pixel-test/

**No sound**
> No sound from your PC? Most of the time Windows is just sending audio to the wrong device (often a monitor over HDMI). Play a test tone, then go through 8 quick fixes:
> https://mictestplus.com/guides/no-sound-speakers-headphones/

**Phone mic**
> People can't hear you on calls? Before you pay for a repair: Bluetooth, app permission, the case and a blocked mic hole cause most of it. Test your phone's mic in the browser:
> https://mictestplus.com/guides/phone-mic-not-working/

**Hebrew (Facebook groups)**
> העכבר עושה דאבל קליק לבד? מקש במקלדת לא עובד? פיקסל מת במסך חדש? בניתי כלים חינמיים שבודקים את זה תוך 30 שניות בדפדפן, עם מדריכי תיקון בעברית:
> https://mictestplus.com/he/guides/
