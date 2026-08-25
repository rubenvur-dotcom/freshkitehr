# Freshkite HR — Leave Management System

A full-featured leave management system for Freshkite Digital, built with React, TypeScript, Supabase, and packaged as a native desktop application with Tauri 2.0.

## Building the Desktop App

### Prerequisites

1. **Install Rust** — required by Tauri to compile the native shell:
   https://rustup.rs

2. **Install Tauri CLI** — the command-line tool for building and running the desktop app:
   ```
   cargo install tauri-cli
   ```

3. **Install Node dependencies** (if not already done):
   ```
   npm install
   ```

### Development

Run the app in development mode (hot-reloads the web UI, opens a native window):

```
npm run tauri:dev
```

### Production Build

Compile and bundle the desktop app for distribution:

```
npm run tauri:build
```

Output bundles are written to:

```
src-tauri/target/release/bundle/
```

| Platform | Artifact              | Location                                          |
|----------|-----------------------|---------------------------------------------------|
| Windows  | `.msi` installer      | `bundle/msi/Freshkite HR_1.0.0_x64_en-US.msi`   |
| macOS    | `.dmg` disk image     | `bundle/dmg/Freshkite HR_1.0.0_x64.dmg`          |
| Linux    | `.deb` / `.AppImage`  | `bundle/deb/` or `bundle/appimage/`               |

### Code Signing Notes

**macOS**: Distributing outside the Mac App Store requires an Apple Developer ID Application certificate. Without it, users will see a Gatekeeper warning. Sign using:
```
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name (TEAMID)" \
  "Freshkite HR.app"
```

**Windows**: The `.msi` can optionally be signed with an Authenticode certificate to avoid Windows Defender SmartScreen warnings. Sign using `signtool.exe` from the Windows SDK:
```
signtool sign /fd SHA256 /a "Freshkite HR_1.0.0_x64_en-US.msi"
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Supabase (PostgreSQL + Row Level Security + Auth)
- **Email**: Resend API via Supabase Edge Functions (Deno)
- **Desktop**: Tauri 2.0 (Rust native shell)
- **State**: Zustand
- **Charts**: Recharts

## Demo Accounts

| Role     | Email                    | Password     |
|----------|--------------------------|--------------|
| Admin    | admin@freshkite.net      | Password123! |
| Employee | bilaal@freshkite.net     | Password123! |
| Employee | maxime@freshkite.net     | Password123! |
