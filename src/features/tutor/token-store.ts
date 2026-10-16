const KEY = 'tutor.deviceAccessToken';

export interface SecureBackend {
  isAvailableAsync(): Promise<boolean>;
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** Saves the verified device access token in the platform secure store; every failure degrades to "not saved". */
export class TokenStore {
  constructor(private readonly backend: SecureBackend) {}
  async load(): Promise<string | null> {
    try {
      if (!(await this.backend.isAvailableAsync())) return null;
      const value = await this.backend.getItemAsync(KEY);
      return value && value.trim() ? value : null;
    } catch { return null; }
  }
  async save(token: string): Promise<boolean> {
    try {
      if (!token.trim() || !(await this.backend.isAvailableAsync())) return false;
      await this.backend.setItemAsync(KEY, token);
      return true;
    } catch { return false; }
  }
  async clear(): Promise<boolean> {
    try {
      if (!(await this.backend.isAvailableAsync())) return true;
      await this.backend.deleteItemAsync(KEY);
      return true;
    } catch { return false; }
  }
}
