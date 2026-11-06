# DressWell user guide

DressWell turns the clothes you own into a daily outfit. You photograph each item once, an AI suggests its tags, you
confirm them, and every morning the app suggests a top, a bottom and shoes that suit the weather, are clean, and match
your taste. It learns from your thumbs up and thumbs down.

This guide is for people using or grading the app. For how it is built, see [architecture.md](architecture.md).

## 1. First time

**Create an account.** Choose **Sign up**, enter your name, email and a password (8 to 72 characters with upper and
lower case, a number and a symbol), or tap **Continue with Google**. If you use email, Supabase sends a confirmation
email: tap the link in it, then come back to the app and **log in**. The page the link opens may not load (the web
address is not set up yet); the account is confirmed anyway. Emails can land in spam for now.

> "Continue with Apple" is not available in this build.

**Forgot your password?** On the log-in screen tap **Forgot your password?**, enter your email, then type the code we
email you together with a new password.

**Set your location (step 1 of 2).** Enter a ZIP code or city. It is only used to look up the weather for your outfit
and can be changed later in the Household tab.

**Answer the style quiz (step 2 of 2).** Five questions seed the app with your taste: the styles you like (at least
one is required), what you dress for, colors you reach for, colors you avoid, and whether you run warm or cold. You see
it once. After that, your thumbs up and down teach the app.

## 2. The five tabs

### Today
Shows today's outfit: a top, a bottom and shoes, with their photos, the weather line (for example "Conway · 58° ·
Rain") and, on a fresh outfit, a one-line reason.

- **✓ Wear this** marks the outfit as worn today and counts as a thumbs up. The clothes go to the laundry (shown as
  dirty in the Closet), except the shoes.
- **✕** is a thumbs down: the app learns what you did not like and shows another outfit.
- **New outfit** (after you wore one) gives a different outfit for the same day, built only from clean clothes.
- Reopening the tab the same day shows the same outfit instead of making a new one.
- If something is missing ("No clean top, bottom or shoes"), add more clothes or mark items clean in the Closet.
- **Style Swipe** (button under the outfit) opens a deck of outfit ideas beyond today's. Swipe right (or tap ✓) to like
  one, left (or tap ✕) to dislike it. Each answer trains the app. The heart adds an idea to your favorites. Ideas here
  may include clothes that are in the laundry, because they are for training only and are never saved as today's outfit.

### Closet
Every garment you can see, as a photo grid with the item count, newest first.

- **Filters:** category (All, Tops, Bottoms, Shoes, Other), status (All, Clean, Dirty), favorites, and, if you are in a
  household, owner (All, Mine, Others).
- A dirty item says **Dirty** on its tile; a badge shows whose it is (M for yours, otherwise the owner's initial).
- Tap one of **your** garments to edit its tags, switch it between **Clean** and **Dirty**, mark it a favorite, or
  **Remove from closet** (asks first and deletes the photo). Hold a tile to remove it quickly.
- A household member's garment opens **read-only**: you can look, but not change or delete it.

### Add
Adds one garment per photo.

1. **Take a photo** or **Choose from library**. Lay the item flat on a plain surface in good light, one item per photo.
2. **Crop** the photo. If the AI could tell where the garment is, the crop frame starts around it; drag it to adjust,
   or tap **Use full photo** to keep the whole picture.
3. **Review the tags.** The AI proposes type, color, season and warmth. Anything it was unsure about is boxed with
   "Check this"; fix it or tap **Looks right**. You must check every boxed field before saving.
4. **Confirm and save.** The garment appears in your Closet.

If the AI is busy or unavailable, the screen says so and you choose the four tags yourself.

### History
**Last 7 days** lists the outfits you wore, grouped by day. **Favorites** lists the outfits and clothes you hearted. Tap
the heart to add or remove a favorite.

### Household
Your profile, location and (optionally) your household.

- **Create or join a household** to let others see your closet. You get an 8-character invite code to share; someone
  else joins by typing it. Members can **view** each other's clothes and photos but **never change or delete** them, and
  your daily outfit only uses your own clothes. **Leave household** stops the sharing; your clothes stay yours. When the
  last member leaves, the household is deleted.
- **Change** next to Location updates where the weather comes from.
- **Log out** is at the bottom.

## 3. Tips

- Photograph one item per photo, flat, in good light. Photos up to about 5 MB are accepted.
- Mark worn items clean again in the Closet after washing them, or they will not be suggested.
- Use thumbs up and down honestly: the app needs a handful of answers before the suggestions feel personal.
- The AI always asks you to confirm tags, because its confidence does not reliably separate right answers from wrong
  ones.

## 4. Privacy

Your photos are stored in a private bucket in your own folder. Other people can see them only if you are in the same
household. The AI sees a photo only while it tags it. Passwords are handled by Supabase Auth; the app never stores them.

## 5. Troubleshooting

| What you see | What to do |
|---|---|
| The confirmation page does not load | Expected for now. Go back to the app and log in. |
| No emails arrive | Check spam and choose "Report not spam"; wait a minute before asking for another code. |
| "Your profile could not be found" | Log out and in again; the app repairs a missing profile once. |
| "Set your location first" | Open Household and tap **Change** next to Location. |
| "The weather service is unavailable" | Try again in a minute. |
| The AI says it is busy | Fill in the four tags yourself; the garment is saved the same way. |
| Today says there is no clean top, bottom or shoes | Add clothes, or open the Closet and mark items **Clean**. |
