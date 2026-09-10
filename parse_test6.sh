timeout 2 bash -c "</dev/tcp/aws-1-eu-central-1.pooler.supabase.com/6543"
echo "6543: $?"
timeout 2 bash -c "</dev/tcp/aws-1-eu-central-1.pooler.supabase.com/5432"
echo "5432: $?"
