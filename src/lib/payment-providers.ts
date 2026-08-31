export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password" | "select";
  placeholder?: string;
  options?: { label: string; value: string }[];
  description?: string;
  required?: boolean;
}

export interface PaymentProviderDefinition {
  id: string;
  name: string;
  country: string;
  currency: string;
  logoBadge: string;
  description: string;
  fields: CredentialField[];
}

export const COUNTRIES_AND_PROVIDERS: Record<string, PaymentProviderDefinition[]> = {
  Kenya: [
    {
      id: "safaricom_mpesa",
      name: "Safaricom M-Pesa (Daraja)",
      country: "Kenya",
      currency: "KES",
      logoBadge: "M-Pesa",
      description: "Direct integration with Safaricom Daraja API for STK push and C2B payments.",
      fields: [
        {
          key: "environment",
          label: "Environment",
          type: "select",
          options: [
            { label: "Sandbox (Testing)", value: "sandbox" },
            { label: "Production (Live)", value: "production" },
          ],
          required: true,
        },
        {
          key: "consumer_key",
          label: "Consumer Key",
          type: "password",
          placeholder: "Daraja API Consumer Key",
          required: true,
        },
        {
          key: "consumer_secret",
          label: "Consumer Secret",
          type: "password",
          placeholder: "Daraja API Consumer Secret",
          required: true,
        },
        {
          key: "passkey",
          label: "Lipana M-Pesa Passkey",
          type: "password",
          placeholder: "Online Passkey from Daraja portal",
          required: true,
        },
        {
          key: "shortcode",
          label: "Shortcode (Paybill / Till)",
          type: "text",
          placeholder: "e.g. 174379",
          required: true,
        },
        {
          key: "shortcode_kind",
          label: "Shortcode Type",
          type: "select",
          options: [
            { label: "Till Number (Buy Goods)", value: "till" },
            { label: "Paybill", value: "paybill" },
          ],
          required: true,
        },
      ],
    },
    {
      id: "airtel_money_ke",
      name: "Airtel Money Kenya",
      country: "Kenya",
      currency: "KES",
      logoBadge: "Airtel",
      description: "Collect payments via Airtel Money Kenya API.",
      fields: [
        {
          key: "client_id",
          label: "Client ID / Username",
          type: "text",
          placeholder: "Airtel API Client ID",
          required: true,
        },
        {
          key: "client_secret",
          label: "Client Secret / Password",
          type: "password",
          placeholder: "Airtel API Secret",
          required: true,
        },
        {
          key: "merchant_id",
          label: "Merchant Code / Till",
          type: "text",
          placeholder: "Merchant ID",
          required: true,
        },
      ],
    },
  ],
  Tanzania: [
    {
      id: "vodacom_mpesa_tz",
      name: "Vodacom M-Pesa Tanzania",
      country: "Tanzania",
      currency: "TZS",
      logoBadge: "M-Pesa TZ",
      description: "Vodacom Tanzania C2B / B2C payment gateway integration.",
      fields: [
        {
          key: "api_key",
          label: "API Key / Public Key",
          type: "password",
          placeholder: "Vodacom API Key",
          required: true,
        },
        {
          key: "service_provider_code",
          label: "Service Provider Code / Till",
          type: "text",
          placeholder: "e.g. 987654",
          required: true,
        },
        {
          key: "username",
          label: "API Username",
          type: "text",
          placeholder: "Username",
          required: true,
        },
        {
          key: "password",
          label: "API Password",
          type: "password",
          placeholder: "Password",
          required: true,
        },
      ],
    },
    {
      id: "airtel_money_tz",
      name: "Airtel Money Tanzania",
      country: "Tanzania",
      currency: "TZS",
      logoBadge: "Airtel TZ",
      description: "Airtel Money Tanzania collection gateway.",
      fields: [
        {
          key: "client_id",
          label: "Client ID",
          type: "text",
          placeholder: "Client ID",
          required: true,
        },
        {
          key: "client_secret",
          label: "Client Secret",
          type: "password",
          placeholder: "Client Secret",
          required: true,
        },
        {
          key: "merchant_id",
          label: "Merchant ID",
          type: "text",
          placeholder: "Merchant ID",
          required: true,
        },
      ],
    },
    {
      id: "tigo_pesa_tz",
      name: "Tigo Pesa Tanzania",
      country: "Tanzania",
      currency: "TZS",
      logoBadge: "Tigo",
      description: "Tigo Pesa payment integration for Tanzania.",
      fields: [
        {
          key: "merchant_id",
          label: "Merchant ID / Store Number",
          type: "text",
          placeholder: "Tigo Merchant ID",
          required: true,
        },
        {
          key: "api_key",
          label: "API Key",
          type: "password",
          placeholder: "API Key",
          required: true,
        },
        {
          key: "secret_key",
          label: "Secret Key",
          type: "password",
          placeholder: "Secret Key",
          required: true,
        },
      ],
    },
    {
      id: "halo_pesa_tz",
      name: "HaloPesa Tanzania",
      country: "Tanzania",
      currency: "TZS",
      logoBadge: "HaloPesa",
      description: "HaloPesa mobile money collection.",
      fields: [
        {
          key: "merchant_code",
          label: "Merchant Code",
          type: "text",
          placeholder: "HaloPesa Merchant Code",
          required: true,
        },
        {
          key: "api_key",
          label: "API Key",
          type: "password",
          placeholder: "API Key",
          required: true,
        },
      ],
    },
  ],
  Uganda: [
    {
      id: "mtn_momo_ug",
      name: "MTN MoMo Uganda",
      country: "Uganda",
      currency: "UGX",
      logoBadge: "MTN MoMo",
      description: "MTN Mobile Money collection API for Uganda.",
      fields: [
        {
          key: "environment",
          label: "Environment",
          type: "select",
          options: [
            { label: "Sandbox", value: "sandbox" },
            { label: "Production", value: "production" },
          ],
          required: true,
        },
        {
          key: "api_user_id",
          label: "API User ID (UUID)",
          type: "text",
          placeholder: "e.g. 12345678-abcd...",
          required: true,
        },
        {
          key: "api_key",
          label: "API Key (Primary/Secondary)",
          type: "password",
          placeholder: "API Secret Key",
          required: true,
        },
        {
          key: "subscription_key",
          label: "Primary Subscription Key",
          type: "password",
          placeholder: "Collection Subscription Key",
          required: true,
        },
      ],
    },
    {
      id: "airtel_money_ug",
      name: "Airtel Money Uganda",
      country: "Uganda",
      currency: "UGX",
      logoBadge: "Airtel UG",
      description: "Airtel Money Uganda collection gateway.",
      fields: [
        {
          key: "client_id",
          label: "Client ID",
          type: "text",
          placeholder: "Client ID",
          required: true,
        },
        {
          key: "client_secret",
          label: "Client Secret",
          type: "password",
          placeholder: "Client Secret",
          required: true,
        },
        {
          key: "merchant_id",
          label: "Merchant Number",
          type: "text",
          placeholder: "Merchant ID",
          required: true,
        },
      ],
    },
  ],
  Rwanda: [
    {
      id: "mtn_momo_rw",
      name: "MTN MoMo Rwanda",
      country: "Rwanda",
      currency: "RWF",
      logoBadge: "MoMo RW",
      description: "MTN Mobile Money collection API for Rwanda.",
      fields: [
        {
          key: "environment",
          label: "Environment",
          type: "select",
          options: [
            { label: "Sandbox", value: "sandbox" },
            { label: "Production", value: "production" },
          ],
          required: true,
        },
        {
          key: "api_user_id",
          label: "API User ID (UUID)",
          type: "text",
          placeholder: "API User UUID",
          required: true,
        },
        {
          key: "api_key",
          label: "API Key",
          type: "password",
          placeholder: "API Key",
          required: true,
        },
        {
          key: "subscription_key",
          label: "Primary Subscription Key",
          type: "password",
          placeholder: "Subscription Key",
          required: true,
        },
      ],
    },
    {
      id: "airtel_money_rw",
      name: "Airtel Money Rwanda",
      country: "Rwanda",
      currency: "RWF",
      logoBadge: "Airtel RW",
      description: "Airtel Money Rwanda collection gateway.",
      fields: [
        {
          key: "client_id",
          label: "Client ID",
          type: "text",
          placeholder: "Client ID",
          required: true,
        },
        {
          key: "client_secret",
          label: "Client Secret",
          type: "password",
          placeholder: "Client Secret",
          required: true,
        },
        {
          key: "merchant_id",
          label: "Merchant ID",
          type: "text",
          placeholder: "Merchant ID",
          required: true,
        },
      ],
    },
  ],
};
