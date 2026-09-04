const API_BASE = "https://api.numista.com/v3";

export class NumistaAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NumistaAPIError";
  }
}

export async function authenticate(apiKey: string, clientId: string): Promise<string> {
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", apiKey);
  params.append("scope", "view_collection,edit_collection");

  const response = await fetch(`${API_BASE}/oauth_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new NumistaAPIError(`Authentication failed: ${errText}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new NumistaAPIError("No access_token in response.");
  }
  return data.access_token;
}

export async function fetchCollection(apiKey: string, token: string, userId: string): Promise<any[]> {
  let allItems: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(`${API_BASE}/users/${userId}/collected_items?page=${page}`, {
      method: "GET",
      headers: {
        "Numista-API-Key": apiKey,
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new NumistaAPIError(`Failed to fetch collection on page ${page}: ${errText}`);
    }

    const data = await response.json();
    let items = [];
    if (Array.isArray(data)) items = data;
    else if (data && Array.isArray(data.items)) items = data.items;

    if (items.length === 0) {
      hasMore = false;
    } else {
      // Prevent infinite loops if the API ignores the page parameter
      if (page > 1 && allItems.length > 0) {
        const firstNew = JSON.stringify(items[0]);
        const firstOld = JSON.stringify(allItems[0]);
        if (firstNew === firstOld) {
          hasMore = false;
          break;
        }
      }

      allItems = allItems.concat(items);
      page++;
      
      // Hard cap at 100 pages to prevent browser freezing
      if (page > 100) {
        hasMore = false;
      }
    }
  }

  return allItems;
}

export async function addItem(apiKey: string, token: string, userId: string, item: any): Promise<boolean> {
  const payload: any = {
    type: item.type?.id,
    issue: item.issue?.id,
    quantity: item.quantity || 1,
    for_swap: item.for_swap || false,
  };

  const grade = item.grade;
  if (grade && typeof grade === "object" && grade.code) {
    payload.grade = grade.code;
  } else if (typeof grade === "string" && grade) {
    payload.grade = grade;
  }

  if (item.private_comment) {
    payload.private_comment = item.private_comment;
  }

  const response = await fetch(`${API_BASE}/users/${userId}/collected_items`, {
    method: "POST",
    headers: {
      "Numista-API-Key": apiKey,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return response.ok;
}
