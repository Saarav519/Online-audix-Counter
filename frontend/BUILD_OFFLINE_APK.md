# Audix - Build Offline APK Guide

## Android Version Support
- **Minimum:** Android 7.0 (API 24)
- **Target:** Android 14 (API 34)
- **Tested on:** Android 7 to Android 14

---

## Prerequisites (Install on Your Computer)

1. **Node.js v18+**: https://nodejs.org/
2. **Yarn**: `npm install -g yarn`
3. **Android Studio**: https://developer.android.com/studio
4. **Java JDK 17**: https://adoptium.net/

---

## Step-by-Step Build Instructions

### Step 1: Get the Code

1. In Emergent, click **"Save to GitHub"**
2. Clone your repository:
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

### Step 4: Sync with Android

```bash
npx cap sync android
```

### Step 5: Open in Android Studio

```bash
npx cap open android
```

### Step 6: Build APK

1. Wait for Gradle sync to complete (bottom progress bar)
2. Go to **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. Wait for build to complete
4. Click **"locate"** in the notification

**APK Location:** `android/app/build/outputs/apk/debug/app-debug.apk`

---

## Quick Commands

```bash
# Full build process
cd frontend
yarn install
yarn build
npx cap sync android
npx cap open android
```

---

## Troubleshooting

### "Gradle sync failed"
1. In Android Studio: File → Invalidate Caches → Restart
2. File → Sync Project with Gradle Files

### "SDK not found"
1. Open Android Studio → SDK Manager
2. Install Android SDK Platform 34
3. Install Android Build Tools 34.0.0

### "Java not found"
1. Install JDK 17 from https://adoptium.net/
2. Set JAVA_HOME in environment variables

### App shows blank screen
1. Make sure you ran `yarn build` before `npx cap sync`
2. Check that `build/` folder exists and has files

---

## App Features (All Work Offline)

✅ Barcode scanning  
✅ Location management (Dynamic & Pre-Assigned)  
✅ Stock counting  
✅ CSV Import/Export  
✅ Reports with location-wise export  
✅ Data persistence (survives restart/battery change)  
✅ Works on Android 7.0 to Android 14+  

---

## Important Notes

1. **First build:** Internet needed to download dependencies
2. **After install:** App works 100% offline
3. **Data storage:** All data saved locally on device
4. **No server required:** App is fully self-contained
