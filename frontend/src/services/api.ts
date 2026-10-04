import type { StatusResponse, AiStudyFeedResponse, SettingsResponse, TradeResponse } from "../types/api";

const API_BASE = "/api";

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  async getStatus(): Promise<StatusResponse> {
    return this.request<StatusResponse>("/status");
  }

  async getAiStudyFeed(): Promise<AiStudyFeedResponse> {
    return this.request<AiStudyFeedResponse>("/ai-study-feed");
  }

  async updateSettings(params: Record<string, any>): Promise<SettingsResponse> {
    return this.request<SettingsResponse>("/settings", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async toggleTrade(isActive: boolean): Promise<TradeResponse> {
    return this.request<TradeResponse>("/toggle-trade", {
      method: "POST",
      body: JSON.stringify({ isActive }),
    });
  }

  async resetStats(): Promise<TradeResponse> {
    return this.request<TradeResponse>("/reset-stats", {
      method: "POST",
    });
  }

  async testWebRequest(): Promise<any> {
    return this.request("/test-webrequest/trigger", { method: "POST" });
  }

  async getWebRequestStatus(): Promise<any> {
    return this.request("/test-webrequest/status");
  }

  async getGithubStatus(): Promise<any> {
    return this.request("/github-status");
  }

  async syncFromGithub(): Promise<any> {
    return this.request("/sync-from-github", { method: "POST" });
  }

  async logoutGithub(): Promise<any> {
    return this.request("/auth/github/logout", { method: "POST" });
  }
}

export const api = new ApiClient();
