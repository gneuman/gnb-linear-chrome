# Install ¿Qué sigue? ("What's next?")

Shows your Linear tasks and reminds you of things from Chrome. Takes 3 minutes.
The interface follows Chrome's language (Spanish or English); change it in ⚙ Settings → Language.

## 1. Install it

**From the Chrome Web Store** (once it is approved): open the store link in Chrome,
click **Add to Chrome** → **Add extension**, then pin it from the 🧩 menu.

**Until then** (from this repo):

1. Download the repo as a `.zip` (green **Code** button → **Download ZIP**) and unzip it in a folder you will keep.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. **Load unpacked** → choose that folder.
5. Pin it from the 🧩 menu.

This version does not update itself. When the store version is out, remove this one and install that one.

## 2. Connect your Linear

1. In Linear: your avatar → **Settings** → **Security & access** → **Personal API keys** → **New key**. Copy it (it starts with `lin_api_`).
2. Click the extension icon → ⚙ **Settings**.
3. Paste the key and click **Save**. It should say "Done, \<your name\>".
4. Click **Set up my Linear**: it creates the labels the extension sorts by. Their names stay in Spanish
   (`👤 listo-para-humano` = ready for a human, `🤖 listo-para-agente` = ready for an agent,
   `❓ necesita-info` = needs info, and the `riesgo` group: `verde`, `amarillo`, `rojo` = green, yellow, red).

Use **your own** key. With someone else's, what you change shows up in Linear under their name.
If your Chrome profile uses a different email than Linear, type your Linear email in Settings.

## 3. Use it

- **Icon:** the number is what you have for today plus reminders that already went off.
- **Start:** moves the issue to In Progress and opens it.
- **Reminders:** type `10am review proposal`, `at 4:30pm call` or `in 30 min send email` and click **Remind**.
- **Send to Claude** (optional): set up your own Claude Code routine with [taskai/README.md](taskai/README.md) (in Spanish) and paste its token in Settings.
- A summary arrives every morning at 9:00. Change the time in Settings.

Reminders only go off while Chrome is open, and they live on that computer.
