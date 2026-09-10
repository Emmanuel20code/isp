nc -z -w 2 aws-1-eu-central-1.pooler.supabase.com 6543
echo "6543: $?"
nc -z -w 2 aws-1-eu-central-1.pooler.supabase.com 5432
echo "5432: $?"
