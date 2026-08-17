# Google Sheets RSVP Setup

Use this once to connect the static wedding site to the RSVP sheet.

1. Open the Google Sheet:
   `https://docs.google.com/spreadsheets/d/18lMkWL6eO3r-NwmhS56GgOfzWLPD_fVJ4RboOmBfIKI/edit`
2. Go to `Extensions -> Apps Script`.
3. Paste the code from `google-apps-script.js`.
4. Click `Deploy -> New deployment`.
5. Select type `Web app`.
6. Set `Execute as` to `Me`.
7. Set `Who has access` to `Anyone`.
8. Deploy and copy the Web App URL.
9. Paste that URL into `GOOGLE_SHEET_WEB_APP_URL` in `app.js`.
10. Commit and push the change.

The site keeps browser localStorage as a fallback until the Web App URL is added.
