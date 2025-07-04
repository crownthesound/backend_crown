#!/bin/bash

# Script to fix contest status issues in Supabase

echo "Checking and fixing contest status issues..."

# Supabase connection details - you'll need to fill these in
SUPABASE_DB_HOST="db.YOUR_SUPABASE_PROJECT_ID.supabase.co"
SUPABASE_DB_PORT="5432"
SUPABASE_DB_NAME="postgres"
SUPABASE_DB_USER="postgres"
SUPABASE_DB_PASSWORD="YOUR_SUPABASE_DB_PASSWORD"

# Run the SQL file
PGPASSWORD=$SUPABASE_DB_PASSWORD psql -h $SUPABASE_DB_HOST -p $SUPABASE_DB_PORT -U $SUPABASE_DB_USER -d $SUPABASE_DB_NAME -f check_contest_status.sql

echo "Contest status check and fix completed!" 