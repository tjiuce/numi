# numi Docs

Everything you need to know to safely copy your Numista collection using **numi**.

## Getting Started: API Keys

To securely access your collection, you need to generate API credentials for both your Source and Target Numista accounts.

1. **Enable the API**: Log into your Numista account and visit the [Numista API page](https://en.numista.com/api/index.php) (you can find this link in the footer of Numista).
2. **Generate Keys**: Go to the [API Key generation page](https://en.numista.com/api/api_key.php). Note down the generated **API Key** and **Client ID**.
3. **Find your User ID**: Your numeric User ID is required. This is usually visible in the URL when viewing your public profile (e.g., `en.numista.com/echanges/profil.php?id=YOUR_ID`) or within your API settings.

You must do this for **both** the account you are copying from (Source) and the account you are copying to (Target).

## Rate Limits & Quotas

The Numista API is free to use but enforces strict limits depending on your account tier.

- **Free Tier**: Limited to **2,000 requests per month**.
- **Paid/Premium Tier**: Has significantly higher or unlimited limits, allowing rapid, large-scale copying.

### What happens if I hit the limit?

Don't panic! If you are on the Free tier and your collection is larger than 1,990 items, **numi** will automatically detect when the Numista API returns a `429 Too Many Requests` error.

The app will instantly halt the copying process and securely save your progress in your browser's local storage. When your quota resets next month, simply return to **numi** and it will prompt you to resume right where you left off.

## How Numi Works

**numi** is a client-side application. This means **your API keys never leave your browser**. There are no intermediate servers or databases stealing your credentials.

### 1. Analysis & Pre-Flight
We perform lightweight checks to validate your credentials before starting.

### 2. Fetching & Deduplication
We download both your Source and Target collections. We then locally cross-reference every item (by Issue ID and Grade). If an item already exists in the Target collection with the same grade, we skip it to prevent duplicates.

### 3. Preview
We present you with the exact number of items ready to be copied.

### 4. Execution
The copy loop begins. If you are on the Free tier, we add an artificial 500ms delay between items to avoid hammering the Numista servers. If Paid is selected, we run in Fast Mode (50ms delay).

## Limitations & Edge Cases

| Feature / Field | Supported? | Notes |
| :--- | :--- | :--- |
| Coin/Banknote Issue ID | ✅ Yes | Accurately transfers the exact variant. |
| Grade / Condition | ✅ Yes | Transfers the exact grading (e.g., UNC, XF). |
| Quantity | ✅ Yes | Supports multiple quantities per issue/grade. |
| For Swap | ✅ Yes | Maintains your swap list preferences. |
| Private Comments | ✅ Yes | Your notes are safely transferred. |
| Purchase Price / Date | ❌ No | The Numista API does not currently expose these custom fields for writing. |
| Wishlist Items | ❌ No | Wishlist functionality is not officially supported by the Numista API. |

## Disclaimer

**numi** is an independent, open-source tool. It is not affiliated with, endorsed by, or sponsored by Numista. Use at your own risk.
