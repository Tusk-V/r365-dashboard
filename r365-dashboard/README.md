# R365 Weekly Sales & Labor Dashboard

Automated dashboard that pulls data from Google Sheets and displays weekly sales and labor metrics for Andy's Frozen Custard locations.

## Quick Deploy to Vercel

### Step 1: Download This Project
Download the entire `r365-dashboard` folder to your computer.

### Step 2: Sign Up for Vercel
1. Go to https://vercel.com/signup
2. Sign up with GitHub (recommended) or email
3. It's 100% free!

### Step 3: Deploy
1. Click "Add New Project" in Vercel dashboard
2. Click "Browse" or drag the `r365-dashboard` folder
3. Vercel will detect it's a Next.js app
4. Click "Deploy"
5. Wait 2-3 minutes for deployment

### Step 4: Done!
You'll get a URL like: `https://r365-dashboard.vercel.app`

Bookmark it and open it every morning!

## Features
- ✅ Auto-loads data from Google Sheets
- ✅ Refreshes every 5 minutes
- ✅ Manual refresh button
- ✅ Filter by location, labor variance, sales variance
- ✅ Color-coded performance indicators
- ✅ Mobile responsive

## How It Works
1. Every morning, Google Apps Script updates the Google Sheet with R365 data
2. Dashboard pulls from Google Sheets API automatically
3. Data refreshes every 5 minutes while dashboard is open
4. Click "Refresh Data" button to manually update

## Tech Stack
- Next.js 14
- React 18
- Tailwind CSS
- Google Sheets API
- Lucide React Icons
