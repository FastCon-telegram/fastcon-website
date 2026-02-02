#!/bin/bash
# ============================================================
# FastCon Website - GitHub Setup Instructions
# ============================================================

# STEP 1: Create GitHub Repository
# --------------------------------
# 1. Go to https://github.com/new
# 2. Repository name: fastcon-website
# 3. Description: FastCon Landing Page with Admin Panel
# 4. Select: Public or Private
# 5. DON'T initialize with README (we have one)
# 6. Click "Create repository"

# STEP 2: Initialize Local Repository
# -----------------------------------
cd /path/to/fastcon-website

# Initialize git
git init

# Add all files
git add .

# Initial commit
git commit -m "Initial commit: FastCon website with admin panel"

# STEP 3: Connect to GitHub
# -------------------------
# Replace YOUR_USERNAME with your GitHub username
git remote add origin https://github.com/YOUR_USERNAME/fastcon-website.git

# Push to GitHub
git branch -M main
git push -u origin main

# ============================================================
# QUICK COMMANDS (copy-paste ready)
# ============================================================

: '
# On your local machine (after extracting the archive):

cd fastcon-website
git init
git add .
git commit -m "Initial commit: FastCon website"
git remote add origin https://github.com/YOUR_USERNAME/fastcon-website.git
git branch -M main
git push -u origin main

# On your server:

git clone https://github.com/YOUR_USERNAME/fastcon-website.git /opt/fastcon
cd /opt/fastcon
chmod +x deploy.sh
sudo ./deploy.sh
'

echo "Follow the instructions in this file to set up your GitHub repository"
