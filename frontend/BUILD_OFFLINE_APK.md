# Audix Stock Management - Build Offline APK Guide

## ⚠️ Important: Online APK Builders DON'T Work for Offline Apps

Online APK builders (like the one you used) create a **WebView wrapper** that loads your website URL. This means:
- ❌ App ALWAYS needs internet to open
- ❌ No offline support
- ❌ Slow loading

## ✅ Solution: Build with Capacitor (True Offline APK)

Capacitor bundles all your app files **INSIDE the APK**. This means:
- ✅ Works 100% offline
- ✅ No internet needed to open
- ✅ Fast loading
- ✅ All data saved locally on device

---

## Step-by-Step Guide to Build Offline APK

### Prerequisites (Install on your computer)

1. **Node.js** (v18+): https://nodejs.org/
2. **Android Studio**: https://developer.android.com/studio
3. **Java JDK 17**: https://adoptium.net/

### Step 1: Download the Project

1. In Emergent, click **"Save to GitHub"**
2. Clone the repository to your computer:
   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
   cd YOUR_REPO/frontend
   ```

### Step 2: Install Dependencies

```bash
yarn install
```

### Step 3: Build the Web App

```bash
yarn build
```

This creates a `build/` folder with all app files.

### Step 4: Sync with Android

```bash
npx cap sync android
```

This copies the build files into the Android project.

### Step 5: Open in Android Studio

```bash
npx cap open android
```

### Step 6: Build APK in Android Studio

1. Wait for Gradle sync to complete
2. Go to **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. Wait for build to complete
4. Click **"locate"** to find the APK file

APK Location: `android/app/build/outputs/apk/debug/app-debug.apk`

### Step 7: Install on Android Device

1. Copy the APK to your Android device
2. Enable "Install from unknown sources" in settings
3. Tap the APK file to install

---

## Quick Build Commands

```bash
# Full build and sync
yarn build && npx cap sync android

# Open Android Studio
npx cap open android
```

---

## Troubleshooting

### "Android SDK not found"
- Open Android Studio → SDK Manager
- Install Android SDK Platform 33 or higher

### "Java not found"
- Install JDK 17 from https://adoptium.net/
- Set JAVA_HOME environment variable

### Build fails with Gradle error
- In Android Studio: File → Sync Project with Gradle Files

---

## App Features (All Work Offline)

- ✅ Barcode scanning
- ✅ Location management
- ✅ Stock counting
- ✅ Data export
- ✅ All data saved to device storage
- ✅ App state persists after restart/battery change
