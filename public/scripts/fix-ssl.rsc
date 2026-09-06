# MikroTik SSL Certificate Fix Script
# This script imports Let's Encrypt Root & Intermediate CAs to allow secure 'check-certificate=yes' connections.

:log info "Starting MikroTik SSL Certificate Fix..."

:do {
  /tool fetch url="https://letsencrypt.org/certs/isrgrootx1.pem" dst-path="isrgrootx1.pem" check-certificate=no
  /certificate import file-name=isrgrootx1.pem passphrase=""
  /file remove isrgrootx1.pem
  :log info "ISRG Root X1 imported."
} on-error={ :log error "Failed to import ISRG Root X1" }

:do {
  /tool fetch url="https://letsencrypt.org/certs/lets-encrypt-r3.pem" dst-path="lets-encrypt-r3.pem" check-certificate=no
  /certificate import file-name=lets-encrypt-r3.pem passphrase=""
  /file remove lets-encrypt-r3.pem
  :log info "Let's Encrypt R3 imported."
} on-error={ :log error "Failed to import Let's Encrypt R3" }

:log info "SSL Certificate Fix completed successfully."
