# YouTube OAuth connection

Moonlight connects one YouTube channel per workspace under provider `youtube` in `integration_connections`. The database has a unique `(workspace_id, provider)` index. Connecting another channel requires a deliberate model change; the callback rejects a different channel if one is already connected.

## Google Cloud setup

1. In a dedicated Google Cloud project, enable **YouTube Data API v3**.
2. Configure an OAuth consent screen and add the Google account that owns the intended YouTube channel as a test user while the app is in Testing.
3. Create a **Web application** OAuth client with the exact authorized redirect URI `http://localhost:3000/api/social/youtube/callback` for the local Hub. Use the deployed Hub origin plus the same path when deployment is configured.
4. Set `COM_MOON_YOUTUBE_CLIENT_ID` and `COM_MOON_YOUTUBE_CLIENT_SECRET` in `apps/hub/.env.local`. Keep the existing `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Calendar/Gmail separate. `COM_MOON_OAUTH_STATE_SECRET`, `COM_MOON_HUB_URL`, and `COM_MOON_DEFAULT_WORKSPACE_ID` must also be set.
5. Restart Hub. Check `/api/social/youtube/status` for `ready`. Open `/api/social/youtube/connect?channelId=UC...` using the target channel's exact ID. Complete Google's account/channel selection. Check status again for `connected` and the expected `channelId` and `channelTitle`.

The authorization requests `youtube.readonly` to verify the selected channel through `channels.list?mine=true` and `youtube.upload` for future publishing capability. This change adds OAuth connection only; it does not upload videos. The access token and offline refresh token are stored server side in `integration_connections.config` and are omitted from the status response. OAuth state is signed and expires after ten minutes. If Google returns `refresh_token_expires_in`, the status reports `refreshTokenExpiresAt`; a past date makes status `reauthorization-required`. For an external app in Google OAuth **Testing**, YouTube scope refresh tokens can expire after seven days, so a successful pilot connection is not proof of persistent unattended access.
